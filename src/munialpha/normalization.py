"""Pure scoring and financial metric helpers."""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class Normalization:
    method: str
    p05: float | None
    p95: float | None


def percentile(values: list[float], probability: float) -> float:
    """Return a linearly interpolated percentile."""
    if not values:
        raise ValueError("cannot calculate a percentile without values")
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def robust_scores(
    values: Iterable[float | None], *, higher_is_better: bool = True
) -> tuple[list[float | None], Normalization]:
    """Winsorize at P05/P95 and min-max normalize valid finite values."""
    materialized = list(values)
    valid = [float(value) for value in materialized if value is not None and math.isfinite(value)]
    if not valid:
        return [None] * len(materialized), Normalization("winsorized_minmax", None, None)
    lower = percentile(valid, 0.05)
    upper = percentile(valid, 0.95)
    if math.isclose(lower, upper):
        return [None] * len(materialized), Normalization("winsorized_minmax", lower, upper)

    scores: list[float | None] = []
    for value in materialized:
        if value is None or not math.isfinite(value):
            scores.append(None)
            continue
        clipped = min(max(float(value), lower), upper)
        score = 100.0 * (clipped - lower) / (upper - lower)
        scores.append(round(score if higher_is_better else 100.0 - score, 4))
    return scores, Normalization("winsorized_minmax", lower, upper)


def cagr(current: float | None, previous: float | None, years: int) -> float | None:
    if current is None or previous is None or current <= 0 or previous <= 0 or years <= 0:
        return None
    return float(((current / previous) ** (1 / years) - 1) * 100)


def percentage_change(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None or previous <= 0:
        return None
    return (current / previous - 1) * 100


def ratio_per_1000(value: float | None, population: float | None) -> float | None:
    if value is None or population is None or population <= 0:
        return None
    return value / population * 1000


def piecewise_linear_score(value: float | None, points: list[tuple[float, float]]) -> float | None:
    """Interpolate a score between ordered metric/score control points."""
    if value is None or not math.isfinite(value):
        return None
    if len(points) < 2 or any(
        left[0] >= right[0] for left, right in zip(points, points[1:], strict=False)
    ):
        raise ValueError("piecewise points must contain increasing metric values")
    if value <= points[0][0]:
        return float(points[0][1])
    if value >= points[-1][0]:
        return float(points[-1][1])
    for (x0, y0), (x1, y1) in zip(points, points[1:], strict=False):
        if x0 <= value <= x1:
            fraction = (value - x0) / (x1 - x0)
            return round(y0 + fraction * (y1 - y0), 4)
    raise AssertionError("unreachable piecewise interval")
