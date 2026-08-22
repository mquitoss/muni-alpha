"""Validation gates shared by every generated score dataset."""

from __future__ import annotations

from typing import Any

from .publication import VALID_SCORE_STATUSES


def validate_score_rows(rows: list[dict[str, Any]], *, expected_count: int) -> None:
    if len(rows) != expected_count:
        raise ValueError(f"expected {expected_count} rows, got {len(rows)}")

    codes = [str(row.get("municipality_code", "")) for row in rows]
    if any(len(code) != 6 or not code.isdigit() for code in codes):
        raise ValueError("every row must contain a six-digit IDESCAT municipality code")
    if len(set(codes)) != len(codes):
        raise ValueError("duplicate municipality codes in output")

    for row in rows:
        code = row["municipality_code"]
        _validate_score(row.get("score_0_100"), "score_0_100", code)
        _validate_score(row.get("confidence_0_100"), "confidence_0_100", code)
        if row.get("score_0_100") is None and not row.get("missing_reason"):
            raise ValueError(f"{code}: a missing score requires missing_reason")
        if row.get("score_0_100") is not None and row.get("data_scope") == "missing":
            raise ValueError(f"{code}: a scored row cannot have missing data_scope")
        status = row.get("score_status")
        if status not in VALID_SCORE_STATUSES:
            raise ValueError(f"{code}: invalid score_status {status!r}")
        minimum = row.get("score_min_0_100")
        maximum = row.get("score_max_0_100")
        _validate_score(minimum, "score_min_0_100", code)
        _validate_score(maximum, "score_max_0_100", code)
        if minimum is None or maximum is None or minimum > maximum:
            raise ValueError(f"{code}: invalid score interval")
        coverage = row.get("coverage_weight_pct")
        _validate_score(coverage, "coverage_weight_pct", code)
        if not isinstance(row.get("usable_for_composite"), bool):
            raise ValueError(f"{code}: usable_for_composite must be boolean")


def _validate_score(value: Any, field: str, code: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{code}: {field} must be numeric or missing")
    if not 0 <= value <= 100:
        raise ValueError(f"{code}: {field} must be between 0 and 100")
