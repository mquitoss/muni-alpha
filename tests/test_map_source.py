from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

import pytest

from scripts.build_map_data import build_bundle, validate_join
from scripts.sources.munialpha import COMMON_FIELDS, DATASETS, Source, parse_value


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def make_project(root: Path) -> None:
    codes = ["080018", "080023"]
    write_csv(
        root / "data/municipalities.csv",
        ["municipality_code", "municipality_name", "comarca_name", "area_km2"],
        [
            {"municipality_code": codes[0], "municipality_name": "Abrera", "comarca_name": "Baix Llobregat", "area_km2": "19.9"},
            {"municipality_code": codes[1], "municipality_name": "Aguilar", "comarca_name": "Bages", "area_km2": "43.2"},
        ],
    )
    features = []
    for index, code in enumerate(codes):
        features.append(
            {
                "type": "Feature",
                "properties": {"CODIMUNI": code, "NOMMUNI": "Municipi"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[index, 0], [index + 0.5, 0], [index, 0.5], [index, 0]]],
                },
            }
        )
    geometry_path = root / "data/raw/icgc_municipal_boundaries.geojson"
    geometry_path.parent.mkdir(parents=True)
    geometry_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")

    for dataset_index, (filename, _, raw_fields) in enumerate(DATASETS):
        fields = ["municipality_code", *COMMON_FIELDS, *raw_fields]
        rows = []
        for row_index, code in enumerate(codes):
            row: dict[str, object] = {
                "municipality_code": code,
                "score_0_100": "" if row_index and dataset_index == 0 else str(50 + dataset_index),
                "confidence_0_100": "80",
                "score_status": "complete",
                "usable_for_composite": "true",
                "missing_reason": "not_published" if row_index and dataset_index == 0 else "",
                "reference_period": "2025",
            }
            row.update({field: str(dataset_index + 1) for field in raw_fields})
            rows.append(row)
        write_csv(root / "data" / filename, fields, rows)


def test_parse_value_preserves_null_codes_and_booleans() -> None:
    assert parse_value("", field="score_0_100") is None
    assert parse_value("080018", field="municipality_code") == "080018"
    assert parse_value("false", field="usable_for_composite") is False
    assert parse_value("12.50", field="score_0_100") == 12.5


def test_source_joins_all_datasets_by_code_and_preserves_null(tmp_path: Path) -> None:
    make_project(tmp_path)
    source = Source(project_root=tmp_path, expected_count=2, simplify_tolerance=0)
    indicators = source.indicators()

    assert [row["municipality_code"] for row in indicators] == ["080018", "080023"]
    assert indicators[0]["sale_price_score_0_100"] == 50
    assert indicators[0]["natural_risk_score_0_100"] == 64
    assert indicators[1]["sale_price_score_0_100"] is None
    assert indicators[1]["sale_price_composite_score"] is None
    assert len(source.metadata()["datasets"]) == 15


def test_source_uses_icgc_geometry_and_builder_emits_compact_js(tmp_path: Path) -> None:
    make_project(tmp_path)
    source = Source(project_root=tmp_path, expected_count=2, simplify_tolerance=0)
    output = tmp_path / "data/map_bundle.js"
    bundle = build_bundle(source, output)

    assert bundle["geo"]["features"][0]["properties"] == {"CODIMUNI": "080018", "NOMMUNI": "Municipi"}
    assert bundle["meta"]["join"] == "CODIMUNI/municipality_code"
    text = output.read_text(encoding="utf-8")
    assert text.startswith("window.MUNIALPHA_DATA=")
    assert "\n " not in text


def test_builder_is_reproducible_and_preserves_codes_and_null(tmp_path: Path) -> None:
    make_project(tmp_path)
    first = tmp_path / "first.js"
    second = tmp_path / "second.js"

    build_bundle(Source(project_root=tmp_path, expected_count=2, simplify_tolerance=0), first)
    build_bundle(Source(project_root=tmp_path, expected_count=2, simplify_tolerance=0), second)

    assert first.read_bytes() == second.read_bytes()
    payload = json.loads(first.read_text(encoding="utf-8").removeprefix("window.MUNIALPHA_DATA=").removesuffix(";\n"))
    assert payload["indicators"][0]["municipality_code"] == "080018"
    assert payload["indicators"][1]["sale_price_score_0_100"] is None


def test_builder_rejects_mismatched_join_keys() -> None:
    geo = {"features": [{"properties": {"CODIMUNI": "1"}}]}
    with pytest.raises(ValueError, match="differ"):
        validate_join(geo, [{"municipality_code": "2"}], "CODIMUNI", "municipality_code")


def test_versioned_map_bundle_contains_all_municipalities() -> None:
    project_root = Path(__file__).resolve().parents[1]
    bundle_path = project_root / "data/map_bundle.js"
    raw = bundle_path.read_bytes()
    text = raw.decode("utf-8")
    payload = text.removeprefix("window.MUNIALPHA_DATA=").removesuffix(";\n")
    bundle = json.loads(payload)

    assert len(bundle["geo"]["features"]) == 947
    assert len(bundle["indicators"]) == 947
    assert len({row["municipality_code"] for row in bundle["indicators"]}) == 947
    assert any(row["sale_price_score_0_100"] is None for row in bundle["indicators"])
    assert len(raw) == 7_874_013
    assert hashlib.sha256(raw).hexdigest() == "64f4b7367e56b9a6f296afc12b05abd61426387293eb246fa6e88c791f2998ce"
    assert {
        key
        for feature in bundle["geo"]["features"]
        for key in feature["properties"]
    } == {"CODIMUNI", "NOMMUNI"}
