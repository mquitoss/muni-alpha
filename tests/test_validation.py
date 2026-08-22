import pytest

from munialpha.validation import validate_score_rows


def row(**overrides: object) -> dict[str, object]:
    result: dict[str, object] = {
        "municipality_code": "080018",
        "score_0_100": 50,
        "confidence_0_100": 100,
        "data_scope": "municipality",
        "missing_reason": None,
        "score_status": "complete",
        "score_min_0_100": 50,
        "score_max_0_100": 50,
        "coverage_weight_pct": 100,
        "usable_for_composite": True,
    }
    result.update(overrides)
    return result


def test_validation_rejects_duplicate_codes() -> None:
    with pytest.raises(ValueError, match="duplicate"):
        validate_score_rows([row(), row()], expected_count=2)


def test_validation_requires_reason_for_missing_score() -> None:
    with pytest.raises(ValueError, match="missing_reason"):
        validate_score_rows(
            [row(score_0_100=None, confidence_0_100=0, data_scope="missing")],
            expected_count=1,
        )


def test_validation_rejects_scores_outside_contract() -> None:
    with pytest.raises(ValueError, match="between 0 and 100"):
        validate_score_rows([row(score_0_100=101)], expected_count=1)
