import csv
from pathlib import Path

from munialpha.io import write_csv


def test_csv_writer_preserves_codes_and_serializes_missing_as_empty(tmp_path: Path) -> None:
    path = tmp_path / "result.csv"
    write_csv(path, ["code", "value", "flag"], [{"code": "080018", "value": None, "flag": False}])

    with path.open(encoding="utf-8", newline="") as stream:
        row = next(csv.DictReader(stream))
    assert row == {"code": "080018", "value": "", "flag": "false"}
