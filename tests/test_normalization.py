import math

import pytest

from munialpha.normalization import cagr, percentile, piecewise_linear_score, robust_scores


def test_percentile_uses_linear_interpolation() -> None:
    assert percentile([0, 10, 20], 0.05) == 1
    assert percentile([0, 10, 20], 0.95) == 19


def test_robust_scores_preserve_missing_and_clip_outliers() -> None:
    scores, parameters = robust_scores([None, 0, 10, 20, 1000])
    assert scores[0] is None
    assert scores[1] == 0
    assert scores[-1] == 100
    assert parameters.p05 == pytest.approx(1.5)
    assert parameters.p95 == pytest.approx(853.0)


def test_cagr_rejects_missing_and_non_positive_values() -> None:
    assert round(cagr(133.1, 100, 3) or 0, 6) == 10
    assert cagr(None, 100, 3) is None
    assert cagr(100, 0, 3) is None


def test_piecewise_access_score_interpolates_and_clamps() -> None:
    points = [(45, 100), (90, 75), (120, 60), (300, 0)]
    assert piecewise_linear_score(20, points) == 100
    assert piecewise_linear_score(60, points) == pytest.approx(91.6667)
    assert piecewise_linear_score(400, points) == 0


def test_ski_contribution_decreases_with_generalized_time() -> None:
    close = math.exp(-30 / 60)
    far = math.exp(-120 / 60)
    assert close > far
    assert close + 0.5 * far > close
