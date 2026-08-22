"""Build a compact, zero-build JavaScript map bundle from a source adapter."""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def round_coordinates(geojson: dict[str, Any], decimals: int = 5) -> dict[str, Any]:
    """Return a copy of a GeoJSON FeatureCollection with rounded coordinates."""

    def rounded(value: Any) -> Any:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return round(float(value), decimals)
        if isinstance(value, list):
            return [rounded(item) for item in value]
        return value

    features = []
    for feature in geojson.get("features", []):
        geometry = feature.get("geometry")
        if geometry and "coordinates" in geometry:
            geometry = {**geometry, "coordinates": rounded(geometry["coordinates"])}
        features.append({**feature, "geometry": geometry})
    return {**geojson, "features": features}


def validate_join(
    geojson: dict[str, Any],
    indicators: list[dict[str, Any]],
    join_property: str,
    key_field: str,
) -> None:
    """Reject duplicate, missing, or mismatched canonical keys before publication."""
    geo_keys = [feature.get("properties", {}).get(join_property) for feature in geojson["features"]]
    indicator_keys = [row.get(key_field) for row in indicators]
    if None in geo_keys or None in indicator_keys:
        raise ValueError("Canonical join keys cannot be null")
    if len(geo_keys) != len(set(geo_keys)) or len(indicator_keys) != len(set(indicator_keys)):
        raise ValueError("Canonical join keys must be unique")
    if set(geo_keys) != set(indicator_keys):
        missing_geometry = sorted(set(indicator_keys) - set(geo_keys), key=str)
        missing_indicators = sorted(set(geo_keys) - set(indicator_keys), key=str)
        raise ValueError(
            "Geometry and indicator keys differ: "
            f"missing geometry={missing_geometry[:5]}, missing indicators={missing_indicators[:5]}"
        )


def emit_bundle(bundle: dict[str, Any], output: Path, namespace: str = "MUNIALPHA_DATA") -> None:
    """Write deterministic compact JSON as a browser global."""
    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(f"window.{namespace}={payload};\n", encoding="utf-8")


def load_source(name: str, project_root: Path) -> Any:
    module = importlib.import_module(f"scripts.sources.{name}")
    return module.Source(project_root=project_root)


def build_bundle(
    source: Any,
    output: Path,
    *,
    join_property: str = "CODIMUNI",
    key_field: str = "municipality_code",
    decimals: int = 5,
    namespace: str = "MUNIALPHA_DATA",
) -> dict[str, Any]:
    geojson = round_coordinates(source.geometry(), decimals)
    indicators = source.indicators()
    validate_join(geojson, indicators, join_property, key_field)
    metadata = {
        "source": source.__class__.__module__,
        "zones": len(geojson["features"]),
        "indicators": len(indicators),
        **(source.metadata() if hasattr(source, "metadata") else {}),
    }
    bundle = {"geo": geojson, "indicators": indicators, "meta": metadata}
    emit_bundle(bundle, output, namespace)
    return bundle


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="munialpha")
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, default=Path("data/map_bundle.js"))
    parser.add_argument("--decimals", type=int, default=5)
    args = parser.parse_args(argv)
    source = load_source(args.source, args.project_root.resolve())
    bundle = build_bundle(source, args.output, decimals=args.decimals)
    print(f"Built {args.output}: {bundle['meta']['zones']} municipalities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
