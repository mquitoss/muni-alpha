"""Geospatial aggregations performed in a metric CRS."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

import geopandas as gpd  # type: ignore[import-untyped]
import numpy as np
import rasterio  # type: ignore[import-untyped]
from affine import Affine
from rasterio.enums import Resampling  # type: ignore[import-untyped]
from rasterio.features import geometry_mask, geometry_window  # type: ignore[import-untyped]
from rasterio.mask import mask  # type: ignore[import-untyped]
from shapely import make_valid, union_all


def calculate_coast_access(
    municipalities: list[dict[str, Any]],
    boundaries_path: Path,
    coast_archive: Path,
) -> dict[str, dict[str, float | bool]]:
    """Calculate municipal coast contact and capital-to-coast distance."""
    extraction_dir = coast_archive.parent / "coast_extracted"
    extraction_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(coast_archive) as archive:
        members = [name for name in archive.namelist() if name.lower().endswith(".gpkg")]
        if len(members) != 1:
            raise ValueError("coast archive must contain exactly one GeoPackage")
        gpkg_path = Path(archive.extract(members[0], extraction_dir))

    coast = gpd.read_file(gpkg_path, layer="linia-costa").to_crs(25831)
    coast_geometry = coast.geometry.union_all()
    boundaries = gpd.read_file(boundaries_path).to_crs(25831)
    code_column = "CODIMUNI"
    if code_column not in boundaries.columns:
        raise ValueError("municipal boundary layer lacks CODIMUNI")

    capitals = gpd.GeoDataFrame(
        {"municipality_code": [row["municipality_code"] for row in municipalities]},
        geometry=gpd.points_from_xy(
            [row["capital_lon"] for row in municipalities],
            [row["capital_lat"] for row in municipalities],
            crs=4326,
        ),
    ).to_crs(25831)
    distance_by_code = dict(
        zip(
            capitals["municipality_code"],
            capitals.geometry.distance(coast_geometry) / 1000,
            strict=True,
        )
    )
    touch_by_code = {
        str(row[code_column]): bool(row.geometry.distance(coast_geometry) <= 10)
        for _, row in boundaries.iterrows()
    }
    return {
        code: {
            "touches_coast": touch_by_code.get(code, False),
            "distance_to_coast_km": float(distance),
        }
        for code, distance in distance_by_code.items()
    }


def calculate_fire_hazard(
    boundaries_path: Path,
    fire_archive: Path,
) -> dict[str, dict[str, float]]:
    """Calculate municipal shares for approved high (7-8) and very high (9-10) classes."""
    extraction_dir = fire_archive.parent / "fire_extracted"
    extraction_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(fire_archive) as archive:
        members = [
            name
            for name in archive.namelist()
            if name.lower().endswith((".tif", ".tiff"))
            and not name.lower().endswith(".tif.ovr")
        ]
        if len(members) != 1:
            raise ValueError(f"fire archive must contain one base GeoTIFF, got {members!r}")
        raster_path = Path(archive.extract(members[0], extraction_dir))

    boundaries = gpd.read_file(boundaries_path)
    result = {}
    with rasterio.open(raster_path) as dataset:
        projected = boundaries.to_crs(dataset.crs)
        for _, row in projected.iterrows():
            clipped, _ = mask(dataset, [row.geometry], crop=True, filled=False, indexes=1)
            values = clipped.compressed()
            if dataset.nodata is not None:
                values = values[values != dataset.nodata]
            if len(values) == 0:
                continue
            high_pct = float(((values == 7) | (values == 8)).sum() / len(values) * 100)
            very_high_pct = float(((values == 9) | (values == 10)).sum() / len(values) * 100)
            result[str(row["CODIMUNI"])] = {
                "high_fire_risk_area_pct": high_pct,
                "very_high_fire_risk_area_pct": very_high_pct,
            }
    return result


def calculate_landscape_surfaces(
    boundaries_path: Path,
    landcover_archive: Path,
    protected_paths: list[Path],
    cache_path: Path,
) -> dict[str, dict[str, float]]:
    """Aggregate land-cover and dissolved protected shares by municipality."""
    result: dict[str, dict[str, float]] = {}
    if cache_path.exists():
        result = json.loads(cache_path.read_text(encoding="utf-8"))
        if len(result) == 947:
            return result

    extraction_dir = landcover_archive.parent / "landcover_extracted"
    extraction_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(landcover_archive) as archive:
        members = [name for name in archive.namelist() if name.lower().endswith(".gpkg")]
        if len(members) != 1:
            raise ValueError("land-cover archive must contain exactly one GeoPackage")
        gpkg_path = Path(archive.extract(members[0], extraction_dir))

    boundaries = gpd.read_file(boundaries_path).to_crs(25831)
    protected_layers = [gpd.read_file(path).to_crs(25831) for path in protected_paths]
    natural_codes = set(range(221, 235))
    forest_codes = {221, 222, 223, 225, 226, 227, 229}
    water_codes = {234, 461, 462, 463, 464, 465, 466}
    for row_number, (_, municipality) in enumerate(boundaries.iterrows(), start=1):
        municipality_code = str(municipality["CODIMUNI"])
        if municipality_code in result:
            continue
        geometry = make_valid(municipality.geometry)
        municipal_area = geometry.area
        cover = gpd.read_file(
            gpkg_path,
            layer="cobertes_sol",
            columns=["nivell_2"],
            bbox=geometry.bounds,
        )
        if cover.crs != boundaries.crs:
            cover = cover.to_crs(boundaries.crs)
        cover_geometry = cover.geometry.copy()
        invalid = ~cover_geometry.is_valid
        if invalid.any():
            cover_geometry.loc[invalid] = cover_geometry.loc[invalid].make_valid()
        intersections = cover_geometry.intersection(geometry)
        areas = intersections.area
        codes = cover["nivell_2"]

        protected_parts = []
        for layer in protected_layers:
            indexes = layer.sindex.query(geometry, predicate="intersects")
            if len(indexes):
                protected_parts.extend(
                    layer.geometry.iloc[indexes].make_valid().intersection(geometry).tolist()
                )
        protected_area = union_all(protected_parts).area if protected_parts else 0.0
        result[municipality_code] = {
            "natural_area_pct": float(areas[codes.isin(natural_codes)].sum() / municipal_area * 100),
            "forest_area_pct": float(areas[codes.isin(forest_codes)].sum() / municipal_area * 100),
            "water_wetland_pct": float(areas[codes.isin(water_codes)].sum() / municipal_area * 100),
            "protected_area_pct": float(min(100, protected_area / municipal_area * 100)),
        }
        if row_number % 10 == 0:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(
                json.dumps(result, ensure_ascii=False, sort_keys=True), encoding="utf-8"
            )
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return result


def calculate_dem_relief(
    boundaries_path: Path,
    dem_path: Path,
    cache_path: Path,
    *,
    target_resolution_m: float = 30,
) -> dict[str, dict[str, float]]:
    """Calculate elevation and slope statistics from a downsampled official DEM."""
    result: dict[str, dict[str, float]] = {}
    if cache_path.exists():
        result = json.loads(cache_path.read_text(encoding="utf-8"))
        if len(result) == 947:
            return result
    boundaries = gpd.read_file(boundaries_path)
    with rasterio.open(dem_path) as dataset:
        boundaries = boundaries.to_crs(dataset.crs)
        for row_number, (_, municipality) in enumerate(boundaries.iterrows(), start=1):
            code = str(municipality["CODIMUNI"])
            if code in result:
                continue
            geometry = make_valid(municipality.geometry)
            window = geometry_window(dataset, [geometry])
            width = max(1, round(window.width * abs(dataset.transform.a) / target_resolution_m))
            height = max(1, round(window.height * abs(dataset.transform.e) / target_resolution_m))
            elevation = dataset.read(
                1,
                window=window,
                out_shape=(height, width),
                masked=True,
                resampling=Resampling.bilinear,
            )
            transform = dataset.window_transform(window) * Affine.scale(
                window.width / width, window.height / height
            )
            inside = geometry_mask(
                [geometry], out_shape=(height, width), transform=transform, invert=True
            )
            valid = inside & ~np.ma.getmaskarray(elevation) & np.isfinite(elevation.data)
            values = elevation.data[valid].astype(float)
            if len(values) == 0:
                continue
            filled = elevation.filled(float(np.median(values))).astype(float)
            gradient_y, gradient_x = np.gradient(
                filled, abs(transform.e), abs(transform.a)
            )
            slope = np.degrees(np.arctan(np.hypot(gradient_x, gradient_y)))[valid]
            p05, p95 = np.percentile(values, [5, 95])
            result[code] = {
                "elevation_mean": float(np.mean(values)),
                "elevation_p05": float(p05),
                "elevation_p95": float(p95),
                "elevation_range_p90": float(p95 - p05),
                "mean_slope_deg": float(np.mean(slope)),
                "terrain_ruggedness": float(np.std(values)),
            }
            if row_number % 10 == 0:
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(
                    json.dumps(result, ensure_ascii=False, sort_keys=True), encoding="utf-8"
                )
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return result
