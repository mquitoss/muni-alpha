"""Cached OpenRouteService matrix collection."""

from __future__ import annotations

import csv
import json
import math
import time
import urllib.error
from pathlib import Path
from typing import Any

from .io import post_json

ORS_MATRIX_URL = "https://api.openrouteservice.org/v2/matrix/driving-car"
BARCELONA_ORIGIN = (2.170047, 41.38699)
BATCH_DESTINATIONS = 49
SKI_ORIGINS_PER_BATCH = 40


def collect_barcelona_matrix(
    municipalities: list[dict[str, Any]],
    raw_dir: Path,
    api_key: str,
    *,
    refresh: bool = False,
) -> tuple[dict[str, dict[str, float | None]], list[dict[str, Any]]]:
    """Collect road duration/distance from Plaça de Catalunya in safe batches."""
    destinations = [
        municipality
        for municipality in municipalities
        if municipality.get("capital_lon") is not None and municipality.get("capital_lat") is not None
    ]
    results: dict[str, dict[str, float | None]] = {}
    metadata: list[dict[str, Any]] = []
    for batch_number, offset in enumerate(range(0, len(destinations), BATCH_DESTINATIONS), start=1):
        batch = destinations[offset : offset + BATCH_DESTINATIONS]
        path = raw_dir / "ors_barcelona" / f"batch_{batch_number:03d}.json"
        metadata_path = path.with_suffix(".json.metadata.json")
        payload = {
            "locations": [list(BARCELONA_ORIGIN)]
            + [[item["capital_lon"], item["capital_lat"]] for item in batch],
            "sources": [0],
            "destinations": list(range(1, len(batch) + 1)),
            "metrics": ["distance", "duration"],
            "units": "km",
        }
        if refresh or not path.exists() or not metadata_path.exists():
            batch_metadata = post_json(
                ORS_MATRIX_URL,
                path,
                payload,
                authorization=api_key,
            )
        else:
            batch_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        batch_metadata.setdefault("raw_file", str(path))
        metadata.append(batch_metadata)
        response = json.loads(path.read_text(encoding="utf-8"))
        durations = response.get("durations", [[]])[0]
        distances = response.get("distances", [[]])[0]
        if len(durations) != len(batch) or len(distances) != len(batch):
            raise ValueError(f"ORS batch {batch_number} returned an unexpected matrix shape")
        for municipality, duration, distance in zip(batch, durations, distances, strict=True):
            results[municipality["municipality_code"]] = {
                "drive_minutes": duration / 60 if duration is not None else None,
                "road_distance_km": distance,
            }
    return results, metadata


def read_ski_stations(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != 10 or len({row["station_id"] for row in rows}) != 10:
        raise ValueError("ski catalogue must contain ten unique stations")
    result = []
    for row in rows:
        result.append(
            {
                **row,
                "access_lat": float(row["access_lat"]),
                "access_lon": float(row["access_lon"]),
                "fixed_transfer_minutes": float(row["fixed_transfer_minutes"] or 0),
                "skiable_km": float(row["skiable_km"]) if row["skiable_km"] else None,
                "confidence_0_100": int(row["confidence_0_100"]),
                "manually_verified": row["manually_verified"].lower() == "true",
            }
        )
    return result


def collect_ski_matrix(
    municipalities: list[dict[str, Any]],
    stations: list[dict[str, Any]],
    raw_dir: Path,
    api_key: str,
    *,
    refresh: bool = False,
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    results: dict[str, list[dict[str, Any]]] = {}
    metadata: list[dict[str, Any]] = []
    for batch_number, offset in enumerate(
        range(0, len(municipalities), SKI_ORIGINS_PER_BATCH), start=1
    ):
        origins = municipalities[offset : offset + SKI_ORIGINS_PER_BATCH]
        locations = [
            [municipality["capital_lon"], municipality["capital_lat"]]
            for municipality in origins
        ] + [[station["access_lon"], station["access_lat"]] for station in stations]
        source_indexes = list(range(len(origins)))
        destination_indexes = list(range(len(origins), len(locations)))
        payload = {
            "locations": locations,
            "sources": source_indexes,
            "destinations": destination_indexes,
            "metrics": ["distance", "duration"],
            "units": "km",
        }
        path = raw_dir / "ors_ski" / f"batch_{batch_number:03d}.json"
        metadata_path = path.with_suffix(".json.metadata.json")
        if refresh or not path.exists() or not metadata_path.exists():
            try:
                batch_metadata = post_json(
                    ORS_MATRIX_URL, path, payload, authorization=api_key, timeout=180
                )
            except urllib.error.HTTPError as error:
                if error.code == 429:
                    break
                raise
        else:
            batch_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        batch_metadata.setdefault("raw_file", str(path))
        metadata.append(batch_metadata)
        response = json.loads(path.read_text(encoding="utf-8"))
        durations = response.get("durations", [])
        distances = response.get("distances", [])
        if len(durations) != len(origins) or len(distances) != len(origins):
            raise ValueError(f"ORS ski batch {batch_number} returned an unexpected matrix shape")
        for origin_index, municipality in enumerate(origins):
            routes = []
            for station_index, station in enumerate(stations):
                duration = durations[origin_index][station_index]
                distance = distances[origin_index][station_index]
                drive_minutes = duration / 60 if duration is not None else None
                generalized = (
                    drive_minutes + station["fixed_transfer_minutes"]
                    if drive_minutes is not None
                    else None
                )
                routes.append(
                    {
                        **station,
                        "drive_minutes": drive_minutes,
                        "generalized_minutes": generalized,
                        "road_distance_km": distance,
                        "contribution": math.exp(-generalized / 60) if generalized is not None else None,
                    }
                )
            results[municipality["municipality_code"]] = routes
    return results, metadata


def collect_services_matrix(
    municipalities: list[dict[str, Any]],
    candidates_by_code: dict[str, list[dict[str, Any]]],
    raw_dir: Path,
    api_key: str,
    *,
    refresh: bool = False,
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    """Route nearest POI candidates using adaptive multi-origin batches."""
    ordered = sorted(
        municipalities,
        key=lambda row: (round(row["capital_lat"], 1), row["capital_lon"], row["capital_lat"]),
    )
    groups: list[tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]] = []
    origins: list[dict[str, Any]] = []
    destinations: dict[str, dict[str, Any]] = {}
    for municipality in ordered:
        candidates = candidates_by_code.get(municipality["municipality_code"], [])
        expanded = {**destinations, **{item["poi_id"]: item for item in candidates}}
        if origins and len(origins) + 1 + len(expanded) > 50:
            groups.append((origins, destinations))
            origins = []
            destinations = {}
            expanded = {item["poi_id"]: item for item in candidates}
        origins.append(municipality)
        destinations = expanded
    if origins:
        groups.append((origins, destinations))

    results: dict[str, list[dict[str, Any]]] = {}
    metadata: list[dict[str, Any]] = []
    for batch_number, (batch_origins, destination_map) in enumerate(groups, start=1):
        destination_list = list(destination_map.values())
        locations = [
            [municipality["capital_lon"], municipality["capital_lat"]]
            for municipality in batch_origins
        ] + [[item["lon"], item["lat"]] for item in destination_list]
        payload = {
            "locations": locations,
            "sources": list(range(len(batch_origins))),
            "destinations": list(range(len(batch_origins), len(locations))),
            "metrics": ["distance", "duration"],
            "units": "km",
        }
        path = raw_dir / "ors_services" / f"batch_{batch_number:04d}.json"
        metadata_path = path.with_suffix(".json.metadata.json")
        if refresh or not path.exists() or not metadata_path.exists():
            for attempt in range(6):
                try:
                    batch_metadata = post_json(
                        ORS_MATRIX_URL, path, payload, authorization=api_key, timeout=180
                    )
                    break
                except urllib.error.HTTPError as error:
                    if error.code != 429:
                        raise
                    retry_after = int(error.headers.get("Retry-After", "60"))
                    if retry_after > 120 or attempt == 5:
                        return results, metadata
                    time.sleep(max(1, retry_after))
        else:
            batch_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        batch_metadata.setdefault("raw_file", str(path))
        metadata.append(batch_metadata)
        response = json.loads(path.read_text(encoding="utf-8"))
        durations = response.get("durations", [])
        distances = response.get("distances", [])
        if len(durations) != len(batch_origins):
            raise ValueError(f"ORS services batch {batch_number} has invalid matrix shape")
        destination_index = {
            item["poi_id"]: index for index, item in enumerate(destination_list)
        }
        for origin_index, municipality in enumerate(batch_origins):
            routes = []
            for candidate in candidates_by_code.get(municipality["municipality_code"], []):
                index = destination_index[candidate["poi_id"]]
                duration = durations[origin_index][index]
                distance = distances[origin_index][index]
                routes.append(
                    {
                        **candidate,
                        "drive_minutes": duration / 60 if duration is not None else None,
                        "road_distance_km": distance,
                    }
                )
            results[municipality["municipality_code"]] = routes
    return results, metadata
