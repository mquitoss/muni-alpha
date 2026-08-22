"""HTTP snapshots and stable CSV/JSON serialization."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

USER_AGENT = "MuniAlpha/0.1 (+public-data research)"


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def download(url: str, destination: Path, *, timeout: int = 120) -> dict[str, Any]:
    """Download an immutable raw artifact and write provenance alongside it."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    handle, temporary_name = tempfile.mkstemp(dir=destination.parent, prefix=f".{destination.name}.")
    os.close(handle)
    temporary_path = Path(temporary_name)
    digest = hashlib.sha256()
    byte_count = 0
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            headers = dict(response.headers.items())
            with temporary_path.open("wb") as stream:
                while chunk := response.read(1024 * 1024):
                    stream.write(chunk)
                    digest.update(chunk)
                    byte_count += len(chunk)
    except urllib.error.URLError:
        # Some Generalitat legacy endpoints reject Python/OpenSSL handshakes
        # but work with the platform TLS stack used by curl.
        digest = hashlib.sha256()
        byte_count = 0
        completed = subprocess.run(
            [
                "curl",
                "-L",
                "--fail",
                "--silent",
                "--show-error",
                "--max-time",
                str(timeout),
                url,
                "-o",
                str(temporary_path),
            ],
            check=True,
            capture_output=True,
        )
        del completed
        headers = {}
        with temporary_path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
                byte_count += len(chunk)
    os.replace(temporary_path, destination)
    metadata = {
        "url": url,
        "raw_file": str(destination),
        "retrieved_at": utc_now(),
        "sha256": digest.hexdigest(),
        "bytes": byte_count,
        "response_headers": {
            key: value
            for key, value in headers.items()
            if key.lower() in {"content-type", "etag", "last-modified"}
        },
    }
    write_json(destination.with_suffix(destination.suffix + ".metadata.json"), metadata)
    return metadata


def post_json(
    url: str,
    destination: Path,
    payload: dict[str, Any],
    *,
    authorization: str,
    timeout: int = 120,
) -> dict[str, Any]:
    """POST JSON and persist the response without ever serializing the credential."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, separators=(",", ":")).encode()
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": authorization,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        response_payload = response.read()
        headers = dict(response.headers.items())
    destination.write_bytes(response_payload)
    metadata = {
        "url": url,
        "raw_file": str(destination),
        "retrieved_at": utc_now(),
        "sha256": hashlib.sha256(response_payload).hexdigest(),
        "bytes": len(response_payload),
        "request": payload,
        "response_headers": {
            key: value
            for key, value in headers.items()
            if key.lower() in {"content-type", "etag", "last-modified"}
        },
    }
    write_json(destination.with_suffix(destination.suffix + ".metadata.json"), metadata)
    return metadata


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def write_csv(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
            writer.writeheader()
            for row in rows:
                writer.writerow({column: _csv_value(row.get(column)) for column in columns})
        os.replace(temporary_name, path)
    except BaseException:
        Path(temporary_name).unlink(missing_ok=True)
        raise


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def _csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, float):
        return f"{value:.6f}".rstrip("0").rstrip(".")
    return value


def _atomic_write(path: Path, content: str) -> None:
    handle, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write(content)
        os.replace(temporary_name, path)
    except BaseException:
        Path(temporary_name).unlink(missing_ok=True)
        raise
