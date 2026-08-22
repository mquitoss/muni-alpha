import pytest

from munialpha.publication import calculate_score_interval, publication_defaults


def test_score_interval_preserves_missing_component_uncertainty() -> None:
    minimum, maximum, coverage = calculate_score_interval([(0.6, 80), (0.4, None)])
    assert minimum == 48
    assert maximum == 88
    assert coverage == 60


def test_score_interval_rejects_invalid_weights() -> None:
    with pytest.raises(ValueError, match="sum to one"):
        calculate_score_interval([(0.5, 50)])


def test_complete_score_is_usable_with_exact_interval() -> None:
    fields = publication_defaults({"score_0_100": 72, "source_id": "idescat"})
    assert fields["score_status"] == "complete"
    assert fields["score_min_0_100"] == 72
    assert fields["score_max_0_100"] == 72
    assert fields["usable_for_composite"] is True


def test_missing_score_is_not_usable() -> None:
    fields = publication_defaults(
        {"score_0_100": None, "missing_reason": "processing_not_available"}
    )
    assert fields["score_status"] == "engineering_pending"
    assert fields["score_min_0_100"] == 0
    assert fields["score_max_0_100"] == 100
    assert fields["usable_for_composite"] is False
