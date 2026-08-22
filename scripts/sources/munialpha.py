"""Local MuniAlpha CSV and ICGC geometry adapter for the static map."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from shapely.geometry import mapping, shape

DATASETS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("01_sale_price_score.csv", "sale_price", ("sale_price_eur_m2", "avg_sale_price_eur")),
    ("02_sale_momentum_score.csv", "sale_momentum", ("growth_1y_pct", "cagr_3y_pct")),
    ("03_rental_price_score.csv", "rental_price", ("avg_monthly_rent_eur", "rental_contracts")),
    ("04_yield_proxy_score.csv", "yield_proxy", ("gross_yield_proxy_pct",)),
    ("05_market_liquidity_score.csv", "market_liquidity", ("sales_per_1000", "rental_contracts_per_1000")),
    ("06_barcelona_access_score.csv", "barcelona_access", ("drive_minutes", "road_distance_km")),
    ("07_ski_access_score.csv", "ski_access", ("nearest_station", "nearest_station_minutes")),
    ("08_coast_access_score.csv", "coast_access", ("touches_coast", "distance_to_coast_km")),
    ("09_landscape_score.csv", "landscape", ("natural_area_pct", "protected_area_pct", "mean_slope_deg")),
    ("10_tourism_demand_score.csv", "tourism_demand", ("hut_count", "hut_per_1000", "etca_pressure")),
    (
        "11_hut_feasibility_score.csv",
        "hut_feasibility",
        (
            "subject_to_special_hut_license_regime",
            "explicit_local_moratorium",
            "explicit_local_prohibition",
            "local_regulation_checked",
        ),
    ),
    ("12_demographic_score.csv", "demographic", ("population_current", "growth_1y_pct", "cagr_5y_pct")),
    ("13_income_score.csv", "income", ("rfdb_eur_per_capita",)),
    ("14_services_score.csv", "services", ("hospital_minutes", "primary_care_minutes")),
    (
        "15_natural_risk_score.csv",
        "natural_risk",
        ("flood_red_flag", "fire_red_flag", "risk_review_required", "fire_safety_score"),
    ),
)

COMMON_FIELDS = (
    "score_0_100",
    "confidence_0_100",
    "score_status",
    "usable_for_composite",
    "missing_reason",
    "reference_period",
)


def parse_value(value: str | None, *, field: str) -> Any:
    """Parse CSV scalars while preserving blank values and code strings."""
    if value is None or value.strip() == "":
        return None
    text = value.strip()
    if field.endswith("_code") or field == "municipality_code":
        return text
    if text.lower() in {"true", "false"}:
        return text.lower() == "true"
    try:
        number = float(text)
    except ValueError:
        return text
    return int(number) if number.is_integer() else number


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


class Source:
    def __init__(
        self,
        *,
        project_root: Path,
        expected_count: int = 947,
        simplify_tolerance: float = 0.00035,
    ) -> None:
        self.project_root = project_root
        self.data_dir = project_root / "data"
        self.expected_count = expected_count
        self.simplify_tolerance = simplify_tolerance
        self._municipalities: list[dict[str, Any]] | None = None

    def _catalogue(self) -> list[dict[str, Any]]:
        if self._municipalities is None:
            rows = read_rows(self.data_dir / "municipalities.csv")
            self._municipalities = [
                {field: parse_value(value, field=field) for field, value in row.items()}
                for row in rows
            ]
            self._validate_count(self._municipalities, "municipalities.csv")
        return self._municipalities

    def geometry(self) -> dict[str, Any]:
        path = self.data_dir / "raw" / "icgc_municipal_boundaries.geojson"
        raw = json.loads(path.read_text(encoding="utf-8"))
        features = []
        for feature in raw.get("features", []):
            props = feature.get("properties", {})
            code = str(props.get("CODIMUNI", ""))
            geometry = feature.get("geometry")
            if geometry and self.simplify_tolerance > 0:
                geometry = mapping(
                    shape(geometry).simplify(self.simplify_tolerance, preserve_topology=True)
                )
            features.append(
                {
                    "type": "Feature",
                    "properties": {"CODIMUNI": code, "NOMMUNI": props.get("NOMMUNI")},
                    "geometry": geometry,
                }
            )
        self._validate_count(features, path.name)
        catalogue_codes = {row["municipality_code"] for row in self._catalogue()}
        geometry_codes = {feature["properties"]["CODIMUNI"] for feature in features}
        if geometry_codes != catalogue_codes:
            raise ValueError("ICGC geometry codes do not match municipalities.csv")
        return {"type": "FeatureCollection", "features": features}

    def indicators(self) -> list[dict[str, Any]]:
        combined = {
            row["municipality_code"]: dict(row)
            for row in self._catalogue()
        }
        for filename, prefix, raw_fields in DATASETS:
            rows = read_rows(self.data_dir / filename)
            self._validate_count(rows, filename)
            seen: set[str] = set()
            for source_row in rows:
                code = source_row.get("municipality_code", "")
                if code in seen:
                    raise ValueError(f"Duplicate municipality_code {code!r} in {filename}")
                seen.add(code)
                if code not in combined:
                    raise ValueError(f"Unknown municipality_code {code!r} in {filename}")
                target = combined[code]
                for field in (*COMMON_FIELDS, *raw_fields):
                    target[f"{prefix}_{field}"] = parse_value(source_row.get(field), field=field)
                usable = target[f"{prefix}_usable_for_composite"] is True
                score = target[f"{prefix}_score_0_100"]
                target[f"{prefix}_composite_score"] = score if usable else None
            if seen != set(combined):
                raise ValueError(f"{filename} does not cover the canonical municipality catalogue")
        return [combined[code] for code in sorted(combined)]

    def metadata(self) -> dict[str, Any]:
        return {
            "geometry": "data/raw/icgc_municipal_boundaries.geojson",
            "join": "CODIMUNI/municipality_code",
            "datasets": [filename for filename, _, _ in DATASETS],
            "geometry_simplify_tolerance_degrees": self.simplify_tolerance,
        }

    def _validate_count(self, rows: list[Any], name: str) -> None:
        if len(rows) != self.expected_count:
            raise ValueError(f"{name} has {len(rows)} rows; expected {self.expected_count}")
