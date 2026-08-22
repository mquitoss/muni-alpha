"""Publication metadata for complete, partial, and unavailable scores."""

from __future__ import annotations

from typing import Any

VALID_SCORE_STATUSES = {
    "complete",
    "partial",
    "engineering_pending",
    "methodology_pending",
    "external_blocked",
}


def calculate_score_interval(
    components: list[tuple[float, float | None]],
) -> tuple[float, float, float]:
    """Return minimum, maximum, and covered formula weight as percentages."""
    if not components:
        return 0.0, 100.0, 0.0
    total_weight = sum(weight for weight, _ in components)
    if abs(total_weight - 1.0) > 1e-9:
        raise ValueError("component weights must sum to one")
    if any(weight < 0 for weight, _ in components):
        raise ValueError("component weights cannot be negative")

    minimum = 0.0
    missing_weight = 0.0
    covered_weight = 0.0
    for weight, score in components:
        if score is None:
            missing_weight += weight
            continue
        if not 0 <= score <= 100:
            raise ValueError("component scores must be between 0 and 100")
        minimum += weight * score
        covered_weight += weight
    return (
        round(minimum, 4),
        round(minimum + 100 * missing_weight, 4),
        round(covered_weight * 100, 4),
    )


def publication_defaults(row: dict[str, Any]) -> dict[str, Any]:
    """Derive uniform v0.2 publication fields without changing score meaning."""
    score = row.get("score_0_100")
    if score is not None:
        status = row.get("score_status", "complete")
        minimum = row.get("score_min_0_100", score)
        maximum = row.get("score_max_0_100", score)
        coverage = row.get("coverage_weight_pct", 100)
        usable = row.get("usable_for_composite", status == "complete")
    else:
        reason = row.get("missing_reason")
        if reason in {"api_credentials_missing", "outside_source_coverage"}:
            default_status = "external_blocked"
        elif reason in {"insufficient_history", "normalization_degenerate"}:
            default_status = "methodology_pending"
        else:
            default_status = "engineering_pending"
        status = row.get("score_status", default_status)
        minimum = row.get("score_min_0_100", 0)
        maximum = row.get("score_max_0_100", 100)
        coverage = row.get("coverage_weight_pct", 0)
        usable = False

    source_id = str(row.get("source_id") or "")
    if "openstreetmap" in source_id or source_id.startswith("osm"):
        source_tier = "open_community"
    elif source_id:
        source_tier = "official"
    else:
        source_tier = "proxy"
    return {
        "score_status": status,
        "score_min_0_100": minimum,
        "score_max_0_100": maximum,
        "coverage_weight_pct": coverage,
        "rank_stability_0_100": row.get("rank_stability_0_100"),
        "source_tier": row.get("source_tier", source_tier),
        "method_variant": row.get("method_variant", "default"),
        "usable_for_composite": usable,
    }
