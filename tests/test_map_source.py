from __future__ import annotations

import csv
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest

from scripts.sources.munialpha import COMMON_FIELDS, DATASETS, Source, parse_value

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
TESELA_BUILDER = REPOSITORY_ROOT / "vendor/tesela/scripts/build_data.py"
NAMESPACE_PREFIX = "window.MUNIALPHA_DATA = "
TESELA_ALIAS = "window.TESELA_DATA = window.MUNIALPHA_DATA;"
SSM_ALIAS = "window.SSM_DATA = window.MUNIALPHA_DATA;"


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


def write_test_source(root: Path) -> Path:
    source_path = root / "munialpha_test_source.py"
    source_path.write_text(
        "from scripts.sources.munialpha import Source as MuniAlphaSource\n\n"
        "class Source(MuniAlphaSource):\n"
        "    attach_indicators = False\n\n"
        "    def __init__(self, *, project_root):\n"
        "        super().__init__(project_root=project_root, expected_count=2, simplify_tolerance=0)\n",
        encoding="utf-8",
    )
    return source_path


def tesela_command(project_root: Path, source_path: Path, output: Path) -> list[str]:
    return [
        sys.executable,
        str(TESELA_BUILDER),
        "--source-path",
        str(source_path),
        "--project-root",
        str(project_root),
        "--output",
        str(output),
        "--join-property",
        "CODIMUNI",
        "--key-field",
        "municipality_code",
        "--namespace",
        "MUNIALPHA_DATA",
        "--decimals",
        "5",
        "--no-attach-indicators",
    ]


def run_tesela(project_root: Path, source_path: Path, output: Path) -> None:
    environment = {**os.environ, "PYTHONPATH": str(REPOSITORY_ROOT)}
    subprocess.run(
        tesela_command(project_root, source_path, output),
        cwd=project_root,
        env=environment,
        check=True,
    )


def read_bundle(path: Path) -> dict[str, Any]:
    lines = path.read_text(encoding="utf-8").splitlines()
    assert lines[0].startswith(NAMESPACE_PREFIX) and lines[0].endswith(";")
    assert lines[1:] == [TESELA_ALIAS, SSM_ALIAS]
    return cast(dict[str, Any], json.loads(lines[0][len(NAMESPACE_PREFIX) : -1]))


def test_parse_value_preserves_null_codes_and_booleans() -> None:
    assert parse_value("", field="score_0_100") is None
    assert parse_value("080018", field="municipality_code") == "080018"
    assert parse_value("false", field="usable_for_composite") is False
    assert parse_value("12.50", field="score_0_100") == 12.5


def test_source_joins_all_datasets_by_code_and_preserves_null(tmp_path: Path) -> None:
    make_project(tmp_path)
    source = Source(project_root=tmp_path, expected_count=2, simplify_tolerance=0)
    indicators = source.indicators()
    geo_codes = {feature["properties"]["CODIMUNI"] for feature in source.geometry()["features"]}

    assert source.attach_indicators is False
    assert geo_codes == {row["municipality_code"] for row in indicators}
    assert [row["municipality_code"] for row in indicators] == ["080018", "080023"]
    assert indicators[0]["sale_price_score_0_100"] == 50
    assert indicators[0]["natural_risk_score_0_100"] == 64
    assert indicators[1]["sale_price_score_0_100"] is None
    assert indicators[1]["sale_price_composite_score"] is None
    assert len(source.metadata()["datasets"]) == 15


def test_tesela_cli_emits_compact_reproducible_bundle(tmp_path: Path) -> None:
    make_project(tmp_path)
    source_path = write_test_source(tmp_path)
    first = tmp_path / "first.js"
    second = tmp_path / "second.js"

    run_tesela(tmp_path, source_path, first)
    run_tesela(tmp_path, source_path, second)

    assert first.read_bytes() == second.read_bytes()
    bundle = read_bundle(first)
    features = bundle["geo"]["features"]
    indicators = bundle["indicators"]
    meta = bundle["meta"]
    assert features[0]["properties"] == {"CODIMUNI": "080018", "NOMMUNI": "Municipi"}
    assert indicators[0]["municipality_code"] == "080018"
    assert indicators[1]["sale_price_score_0_100"] is None
    assert meta["join"] == "CODIMUNI/municipality_code"
    assert (meta["zonas"], meta["indicadores"], meta["con_dato"]) == (2, 2, 2)


def test_source_rejects_mismatched_geometry_keys(tmp_path: Path) -> None:
    make_project(tmp_path)
    geometry_path = tmp_path / "data/raw/icgc_municipal_boundaries.geojson"
    geometry = json.loads(geometry_path.read_text(encoding="utf-8"))
    geometry["features"][0]["properties"]["CODIMUNI"] = "999999"
    geometry_path.write_text(json.dumps(geometry), encoding="utf-8")

    with pytest.raises(ValueError, match="do not match"):
        Source(project_root=tmp_path, expected_count=2, simplify_tolerance=0).geometry()


def test_versioned_map_bundle_contains_all_municipalities() -> None:
    bundle_path = REPOSITORY_ROOT / "data/map_bundle.js"
    raw = bundle_path.read_bytes()
    bundle = read_bundle(bundle_path)

    assert len(bundle["geo"]["features"]) == 947
    assert len(bundle["indicators"]) == 947
    assert len({row["municipality_code"] for row in bundle["indicators"]}) == 947
    assert all(isinstance(row["municipality_code"], str) for row in bundle["indicators"])
    assert {feature["properties"]["CODIMUNI"] for feature in bundle["geo"]["features"]} == {
        row["municipality_code"] for row in bundle["indicators"]
    }
    assert any(row["sale_price_score_0_100"] is None for row in bundle["indicators"])
    assert bundle["meta"]["source"] == "munialpha"
    assert (
        bundle["meta"]["zonas"],
        bundle["meta"]["indicadores"],
        bundle["meta"]["con_dato"],
    ) == (947, 947, 947)
    assert len(raw) == 7_874_100
    assert hashlib.sha256(raw).hexdigest() == "a979130ff74baf67936835640bf319d0cbf784dac2c8998e85a2a3c7ea162a5b"
    assert {
        key
        for feature in bundle["geo"]["features"]
        for key in feature["properties"]
    } == {"CODIMUNI", "NOMMUNI"}
