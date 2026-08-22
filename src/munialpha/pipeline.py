"""End-to-end phase-one data pipeline."""

from __future__ import annotations

import hashlib
import json
import math
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .geo import (
    calculate_coast_access,
    calculate_dem_relief,
    calculate_fire_hazard,
    calculate_landscape_surfaces,
)
from .io import download, utc_now, write_csv, write_json
from .normalization import (
    cagr,
    percentage_change,
    piecewise_linear_score,
    ratio_per_1000,
    robust_scores,
)
from .publication import calculate_score_interval, publication_defaults
from .routing import (
    collect_barcelona_matrix,
    collect_services_matrix,
    collect_ski_matrix,
    read_ski_stations,
)
from .services import build_service_candidates, extract_services_poi
from .sources import (
    ANNUAL_POPULATION_URL,
    CAPITALS_LAYER,
    ETCA_URL,
    HUT_REGULATION_URL,
    INCOME_URL,
    MUNICIPALITIES_LAYER,
    POPULATION_URL,
    parse_annual_population,
    parse_etca,
    parse_hut_regime,
    parse_income,
    parse_municipalities,
    parse_population,
    parse_rentals,
    parse_sales,
    parse_tourism_registry,
    rentals_url,
    sales_url,
    tourism_registry_url,
    wfs_url,
)
from .validation import validate_score_rows

METHOD_VERSION = "0.2.0"
COAST_URL = "https://datacloud.icgc.cat/datacloud/linia-costa/gpkg/linia-costa-v1r0-202602-202602.zip"
FIRE_HAZARD_URL = "https://gencat.cat/agricultura/sig/bases/PERILLBASICINCENDI.zip"
LANDCOVER_URL = "https://datacloud.icgc.cat/datacloud/cobertes-sol/gpkg/cobertes-sol-v1r0-2024.zip"
DEM_URL = "https://datacloud.icgc.cat/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-topografic-catalunya-5m-2009-2018.tif"
PROTECTED_URLS = {
    "pein": "https://sig.gencat.cat/ows/ESPAIS_NATURALS/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=ESPAIS_NATURALS:ESPAISNATURALS_PEIN&outputFormat=application/json&srsName=EPSG:25831",
    "enpe": "https://sig.gencat.cat/ows/ESPAIS_NATURALS/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=ESPAIS_NATURALS:ESPAISNATURALS_ENPE&outputFormat=application/json&srsName=EPSG:25831",
    "natura2000": "https://sig.gencat.cat/ows/ESPAIS_NATURALS/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=ESPAIS_NATURALS:ESPAISNATURALS_XARNAT_2000&outputFormat=application/json&srsName=EPSG:25831",
}
OSM_PBF_URLS = {
    "cataluna": "https://download.geofabrik.de/europe/spain/cataluna-260820.osm.pbf",
    "aragon": "https://download.geofabrik.de/europe/spain/aragon-260820.osm.pbf",
    "valencia": "https://download.geofabrik.de/europe/spain/valencia-260820.osm.pbf",
    "andorra": "https://download.geofabrik.de/europe/andorra-260820.osm.pbf",
    "languedoc": "https://download.geofabrik.de/europe/france/languedoc-roussillon-260820.osm.pbf",
}
MUNICIPALITY_COLUMNS = [
    "municipality_code", "municipality_name", "comarca_code", "comarca_name",
    "province_code", "province_name", "territorial_area_code", "territorial_area_name",
    "capital_lat", "capital_lon", "area_km2", "geometry_source_date",
]
COMMON_COLUMNS = [
    "municipality_code", "municipality_name", "comarca_code", "comarca_name",
    "reference_period", "score_0_100", "confidence_0_100", "data_scope", "source_id",
    "source_updated_at", "retrieved_at", "method_version", "missing_reason", "notes",
]
PUBLICATION_COLUMNS = [
    "score_status",
    "score_min_0_100",
    "score_max_0_100",
    "coverage_weight_pct",
    "rank_stability_0_100",
    "source_tier",
    "method_variant",
    "usable_for_composite",
]

SCORE_SCHEMAS: dict[str, list[str]] = {
    "01_sale_price_score.csv": ["sales_count", "avg_surface_m2", "avg_sale_price_eur", "sale_price_eur_m2"],
    "02_sale_momentum_score.csv": ["price_eur_m2_current", "price_eur_m2_1y_ago", "price_eur_m2_3y_ago", "growth_1y_pct", "cagr_3y_pct"],
    "03_rental_price_score.csv": ["rental_contracts", "avg_monthly_rent_eur"],
    "04_yield_proxy_score.csv": ["avg_monthly_rent_eur", "avg_sale_price_eur", "gross_yield_proxy_pct"],
    "05_market_liquidity_score.csv": ["population", "sales_count", "sales_per_1000", "rental_contracts", "rental_contracts_per_1000", "sale_liquidity_score", "rental_liquidity_score"],
    "06_barcelona_access_score.csv": ["origin_name", "destination_lat", "destination_lon", "drive_minutes", "road_distance_km", "routing_engine", "routing_profile", "routing_date"],
    "07_ski_access_score.csv": ["nearest_station", "nearest_station_minutes", "nearest_station_km", "best_station", "best_station_minutes", "best_station_skiable_km", "second_station", "second_station_minutes", "third_station", "third_station_minutes", "ski_raw"],
    "08_coast_access_score.csv": ["touches_coast", "distance_to_coast_km"],
    "09_landscape_score.csv": ["area_km2", "natural_area_pct", "forest_area_pct", "protected_area_pct", "elevation_mean", "elevation_p05", "elevation_p95", "elevation_range_p90", "mean_slope_deg", "terrain_ruggedness", "water_wetland_pct", "touches_coast", "landscape_units_count", "landscape_diversity_entropy", "official_viewpoints_count", "viewpoints_per_100km2", "natural_score", "protected_score", "relief_score", "water_score", "recognition_score"],
    "10_tourism_demand_score.csv": ["resident_population", "non_resident_present", "resident_absent", "population_etca", "population_etca_pct", "etca_pressure", "hut_count", "hut_per_1000", "hotel_count", "rural_count", "camping_count", "tourist_establishments_count", "tourist_establishments_per_1000", "ieet_available", "ieet_total_eur", "ieet_hut_eur", "ieet_eur_per_resident", "etca_score", "hut_density_score", "tourist_supply_score", "ieet_score"],
    "11_hut_feasibility_score.csv": ["subject_to_special_hut_license_regime", "existing_hut_count", "population", "hut_per_100_residents", "explicit_local_moratorium", "explicit_local_prohibition", "local_regulation_checked", "regulation_reference"],
    "12_demographic_score.csv": ["population_current", "population_1y_ago", "population_5y_ago", "population_change_5y", "growth_1y_pct", "cagr_5y_pct", "trend_score", "scale_adjusted_growth_score"],
    "13_income_score.csv": ["rfdb_total_eur", "rfdb_eur_per_capita", "rfdb_index_catalonia_100"],
    "14_services_score.csv": ["hospital_minutes", "primary_care_minutes", "supermarket_minutes", "school_minutes", "rail_station_minutes", "pharmacy_minutes", "hospital_score", "primary_care_score", "supermarket_score", "school_score", "rail_station_score", "pharmacy_score"],
    "15_natural_risk_score.csv": ["flood_t10_pct", "flood_t100_pct", "flood_t500_pct", "preferred_flow_zone_pct", "flood_risk_raw", "flood_safety_score", "high_fire_risk_area_pct", "very_high_fire_risk_area_pct", "fire_risk_raw", "fire_safety_score", "flood_red_flag", "fire_red_flag", "risk_review_required"],
}


def run(data_dir: Path, *, refresh: bool = False) -> dict[str, Any]:
    raw_dir = data_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    artifacts = {
        "municipalities": (wfs_url(MUNICIPALITIES_LAYER, properties="CODIMUNI,NOMMUNI,CODICOMAR,NOMCOMAR,CODIVEGUE,NOMVEGUE,CODIPROV,NOMPROV,AREAM5000"), raw_dir / "icgc_municipalities.geojson"),
        "capitals": (wfs_url(CAPITALS_LAYER), raw_dir / "icgc_municipal_capitals.geojson"),
        "sales": (sales_url(2025), raw_dir / "housing_sales_2025.xlsx"),
        "sales_2024": (sales_url(2024), raw_dir / "housing_sales_2024.xlsx"),
        "sales_2022": (sales_url(2022), raw_dir / "housing_sales_2022.xlsx"),
        "rentals": (rentals_url(), raw_dir / "housing_rentals_2025.json"),
        "population": (POPULATION_URL, raw_dir / "idescat_population.json"),
        "annual_population": (
            ANNUAL_POPULATION_URL,
            raw_dir / "idescat_annual_population.json",
        ),
        "income": (INCOME_URL, raw_dir / "idescat_income.json"),
        "etca": (ETCA_URL, raw_dir / "idescat_etca_2024.ssv"),
        "tourism_registry": (
            tourism_registry_url(),
            raw_dir / "tourism_registry_aggregated.json",
        ),
        "municipal_boundaries": (
            wfs_url(MUNICIPALITIES_LAYER),
            raw_dir / "icgc_municipal_boundaries.geojson",
        ),
        "coast": (COAST_URL, raw_dir / "icgc_coast_202602.zip"),
        "hut_regulation": (HUT_REGULATION_URL, raw_dir / "hut_decree_3_2023.xml"),
        "fire_hazard": (FIRE_HAZARD_URL, raw_dir / "fire_hazard_2024.zip"),
        "landcover": (LANDCOVER_URL, raw_dir / "landcover_2024.zip"),
        "dem": (DEM_URL, raw_dir / "icgc_dem_5m_2009_2018.tif"),
        "protected_pein": (PROTECTED_URLS["pein"], raw_dir / "protected_pein.geojson"),
        "protected_enpe": (PROTECTED_URLS["enpe"], raw_dir / "protected_enpe.geojson"),
        "protected_natura2000": (
            PROTECTED_URLS["natura2000"],
            raw_dir / "protected_natura2000.geojson",
        ),
        **{
            f"osm_{region}": (url, raw_dir / "osm" / f"{region}-260820.osm.pbf")
            for region, url in OSM_PBF_URLS.items()
        },
    }
    metadata: dict[str, dict[str, Any]] = {}
    for source_id, (url, path) in artifacts.items():
        metadata_path = path.with_suffix(path.suffix + ".metadata.json")
        if refresh or not path.exists() or not metadata_path.exists():
            metadata[source_id] = download(url, path)
        else:
            metadata[source_id] = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata[source_id].setdefault("raw_file", str(path))

    municipalities = parse_municipalities(artifacts["municipalities"][1], artifacts["capitals"][1])
    if len(municipalities) != 947:
        raise ValueError(f"expected 947 current municipalities, got {len(municipalities)}")
    write_csv(data_dir / "municipalities.csv", MUNICIPALITY_COLUMNS, municipalities)

    sales = _index_ine(parse_sales(artifacts["sales"][1]), municipalities)
    sales_2024 = _index_ine(parse_sales(artifacts["sales_2024"][1], 2024), municipalities)
    sales_2022 = _index_ine(parse_sales(artifacts["sales_2022"][1], 2022), municipalities)
    rentals = _index_ine(parse_rentals(artifacts["rentals"][1]), municipalities)
    population = parse_population(artifacts["population"][1])
    annual_population = parse_annual_population(artifacts["annual_population"][1])
    income_year, income = parse_income(artifacts["income"][1])
    etca_year, etca = parse_etca(artifacts["etca"][1])
    tourism_registry = parse_tourism_registry(artifacts["tourism_registry"][1])
    coast_access = calculate_coast_access(
        municipalities,
        artifacts["municipal_boundaries"][1],
        artifacts["coast"][1],
    )
    hut_regime = parse_hut_regime(artifacts["hut_regulation"][1], municipalities)
    fire_hazard = calculate_fire_hazard(
        artifacts["municipal_boundaries"][1], artifacts["fire_hazard"][1]
    )
    landscape_surfaces = calculate_landscape_surfaces(
        artifacts["municipal_boundaries"][1],
        artifacts["landcover"][1],
        [
            artifacts["protected_pein"][1],
            artifacts["protected_enpe"][1],
            artifacts["protected_natura2000"][1],
        ],
        data_dir / "intermediate" / "landscape_surfaces.json",
    )
    landscape_relief = calculate_dem_relief(
        artifacts["municipal_boundaries"][1],
        artifacts["dem"][1],
        data_dir / "intermediate" / "landscape_relief.json",
    )
    osm_paths = [artifacts[f"osm_{region}"][1] for region in OSM_PBF_URLS]
    services_poi = extract_services_poi(
        osm_paths, data_dir / "intermediate" / "services_poi.parquet"
    )
    service_candidates = build_service_candidates(municipalities, services_poi)
    retrieved_at = max(item["retrieved_at"] for item in metadata.values())

    manifest: dict[str, Any] = {"generated_at": utc_now(), "method_version": METHOD_VERSION, "datasets": {}}
    manifest["datasets"]["municipalities"] = _manifest_entry("complete", "municipalities.csv", len(municipalities), len(municipalities), metadata["municipalities"])

    sale_rows, sale_norm = _sale_price_rows(municipalities, sales, retrieved_at)
    _emit(data_dir, "01_sale_price_score.csv", sale_rows)
    manifest["datasets"]["sale_price"] = _score_manifest("01_sale_price_score.csv", sale_rows, sale_norm, metadata["sales"])

    rental_rows, rental_norm = _rental_rows(municipalities, rentals, retrieved_at)
    _emit(data_dir, "03_rental_price_score.csv", rental_rows)
    manifest["datasets"]["rental_price"] = _score_manifest("03_rental_price_score.csv", rental_rows, rental_norm, metadata["rentals"])

    momentum_rows, momentum_norm = _momentum_rows(
        municipalities, sales, sales_2024, sales_2022, retrieved_at
    )
    _emit(data_dir, "02_sale_momentum_score.csv", momentum_rows)
    manifest["datasets"]["sale_momentum"] = _score_manifest("02_sale_momentum_score.csv", momentum_rows, momentum_norm, metadata["sales"])

    yield_rows, yield_norm = _yield_rows(municipalities, sales, rentals, retrieved_at)
    _emit(data_dir, "04_yield_proxy_score.csv", yield_rows)
    manifest["datasets"]["yield_proxy"] = _score_manifest("04_yield_proxy_score.csv", yield_rows, yield_norm, metadata["sales"])

    liquidity_rows, liquidity_norm = _liquidity_rows(municipalities, sales, rentals, population, retrieved_at)
    _emit(data_dir, "05_market_liquidity_score.csv", liquidity_rows)
    manifest["datasets"]["market_liquidity"] = _score_manifest("05_market_liquidity_score.csv", liquidity_rows, liquidity_norm, metadata["population"])

    demographic_rows, demographic_norm = _demographic_rows(
        municipalities, annual_population, retrieved_at
    )
    _emit(data_dir, "12_demographic_score.csv", demographic_rows)
    manifest["datasets"]["demographic"] = _score_manifest(
        "12_demographic_score.csv",
        demographic_rows,
        demographic_norm,
        metadata["annual_population"],
    )

    income_rows, income_norm = _income_rows(municipalities, income_year, income, retrieved_at)
    _emit(data_dir, "13_income_score.csv", income_rows)
    manifest["datasets"]["income"] = _score_manifest("13_income_score.csv", income_rows, income_norm, metadata["income"])

    tourism_rows, tourism_norm = _tourism_rows(
        municipalities,
        population,
        etca_year,
        etca,
        tourism_registry,
        retrieved_at,
    )
    _emit(data_dir, "10_tourism_demand_score.csv", tourism_rows)
    manifest["datasets"]["tourism_demand"] = _score_manifest(
        "10_tourism_demand_score.csv",
        tourism_rows,
        tourism_norm,
        {"etca": metadata["etca"], "registry": metadata["tourism_registry"]},
    )

    coast_rows = _coast_rows(municipalities, coast_access, metadata["coast"]["retrieved_at"])
    _emit(data_dir, "08_coast_access_score.csv", coast_rows)
    manifest["datasets"]["coast_access"] = _score_manifest(
        "08_coast_access_score.csv",
        coast_rows,
        None,
        {"coast": metadata["coast"], "boundaries": metadata["municipal_boundaries"]},
    )

    hut_rows = _hut_feasibility_rows(
        municipalities,
        population,
        tourism_registry,
        hut_regime,
        metadata["hut_regulation"]["retrieved_at"],
    )
    _emit(data_dir, "11_hut_feasibility_score.csv", hut_rows)
    manifest["datasets"]["hut_feasibility"] = _score_manifest(
        "11_hut_feasibility_score.csv",
        hut_rows,
        None,
        {
            "regulation": metadata["hut_regulation"],
            "registry": metadata["tourism_registry"],
            "population": metadata["population"],
        },
    )

    risk_rows, fire_norm = _natural_risk_rows(
        municipalities, fire_hazard, metadata["fire_hazard"]["retrieved_at"]
    )
    _emit(data_dir, "15_natural_risk_score.csv", risk_rows)
    risk_manifest = _manifest_entry(
        "partial",
        "15_natural_risk_score.csv",
        len(risk_rows),
        len(fire_hazard),
        metadata["fire_hazard"],
    )
    risk_manifest.update(
        {
            "method_variant": "territorial_fire_7_8_high_9_10_very_high",
            "rows_with_score": 0,
            "coverage_weight_pct": 45,
            "usable_for_composite": False,
            "normalization": asdict(fire_norm),
            "limitations": [
                "Flood exposure is pending jurisdictional ACA/SNCZI mosaicking.",
                "Fire exposure currently uses municipal area, not built-up area.",
            ],
        }
    )
    manifest["datasets"]["natural_risk"] = risk_manifest

    landscape_rows, landscape_norm = _landscape_rows(
        municipalities,
        landscape_surfaces,
        landscape_relief,
        coast_access,
        metadata["landcover"]["retrieved_at"],
    )
    _emit(data_dir, "09_landscape_score.csv", landscape_rows)
    landscape_manifest = _manifest_entry(
        "partial",
        "09_landscape_score.csv",
        len(landscape_rows),
        len(landscape_surfaces),
        {
            "landcover": metadata["landcover"],
            "dem": metadata["dem"],
            "protected_pein": metadata["protected_pein"],
            "protected_enpe": metadata["protected_enpe"],
            "protected_natura2000": metadata["protected_natura2000"],
            "coast": metadata["coast"],
        },
    )
    landscape_manifest.update(
        {
            "method_variant": "landscape_core",
            "rows_with_score": sum(row["score_0_100"] is not None for row in landscape_rows),
            "coverage_weight_pct": 100,
            "usable_for_composite": True,
            "normalization": landscape_norm,
            "limitations": ["Landscape recognition remains optional and is not included."],
        }
    )
    manifest["datasets"]["landscape"] = landscape_manifest

    ors_key = os.environ.get("OPENROUTESERVICE_API_KEY", "").strip()
    if ors_key:
        routes, route_metadata = collect_barcelona_matrix(
            municipalities, raw_dir, ors_key, refresh=refresh
        )
        access_rows = _barcelona_access_rows(municipalities, routes, route_metadata)
        _emit(data_dir, "06_barcelona_access_score.csv", access_rows)
        manifest["datasets"]["barcelona_access"] = _score_manifest(
            "06_barcelona_access_score.csv", access_rows, None, {"batches": route_metadata}
        )
        ski_catalogue_path = Path("config/ski_stations.csv")
        stations = read_ski_stations(ski_catalogue_path)
        catalogue_payload = ski_catalogue_path.read_bytes()
        ski_catalogue_metadata = {
            "raw_file": str(ski_catalogue_path),
            "sha256": hashlib.sha256(catalogue_payload).hexdigest(),
            "url": None,
            "retrieved_at": retrieved_at,
            "bytes": len(catalogue_payload),
        }
        ski_routes, ski_metadata = collect_ski_matrix(
            municipalities, stations, raw_dir, ors_key, refresh=refresh
        )
        ski_rows, ski_norm = _ski_rows(municipalities, ski_routes, ski_metadata)
        _emit(data_dir, "07_ski_access_score.csv", ski_rows)
        manifest["datasets"]["ski_access"] = _score_manifest(
            "07_ski_access_score.csv",
            ski_rows,
            ski_norm,
            {"routing_batches": ski_metadata, "catalogue": ski_catalogue_metadata},
        )
        manifest["datasets"]["ski_access"]["source_tier"] = "curated"
        service_routes, service_metadata = collect_services_matrix(
            municipalities, service_candidates, raw_dir, ors_key, refresh=refresh
        )
        service_rows = _services_rows(municipalities, service_routes, service_metadata)
        _emit(data_dir, "14_services_score.csv", service_rows)
        service_manifest = _score_manifest(
            "14_services_score.csv",
            service_rows,
            None,
            {
                "osm_snapshots": {
                    region: metadata[f"osm_{region}"] for region in OSM_PBF_URLS
                },
                "routing_batches": service_metadata,
            },
        )
        service_limitations = [
            "Official healthcare and education directories are not yet merged.",
            "OSM areas are represented by the mean coordinate of their nodes.",
        ]
        if len(service_routes) < len(municipalities):
            service_manifest.update(
                {
                    "status": "partial",
                    "usable_for_composite": False,
                }
            )
            service_limitations.insert(
                0, "ORS daily matrix quota was reached; rerun to resume from cache."
            )
        service_manifest.update(
            {
                "source_tier": "open_community",
                "method_variant": "osm_cross_border_nearest5_ors",
                "limitations": service_limitations,
            }
        )
        manifest["datasets"]["services"] = service_manifest
    else:
        access_rows = _blocked_rows(municipalities, "api_credentials_missing", retrieved_at)
        _emit(data_dir, "06_barcelona_access_score.csv", access_rows)
        manifest["datasets"]["barcelona_access"] = _manifest_entry(
            "external_blocked", "06_barcelona_access_score.csv", len(access_rows), 0, None
        )
        ski_rows = _blocked_rows(municipalities, "api_credentials_missing", retrieved_at)
        _emit(data_dir, "07_ski_access_score.csv", ski_rows)
        manifest["datasets"]["ski_access"] = _manifest_entry(
            "external_blocked", "07_ski_access_score.csv", len(ski_rows), 0, None
        )
        service_rows = _blocked_rows(municipalities, "api_credentials_missing", retrieved_at)
        _emit(data_dir, "14_services_score.csv", service_rows)
        manifest["datasets"]["services"] = _manifest_entry(
            "external_blocked", "14_services_score.csv", len(service_rows), 0, None
        )

    built = {"01_sale_price_score.csv", "02_sale_momentum_score.csv", "03_rental_price_score.csv", "04_yield_proxy_score.csv", "05_market_liquidity_score.csv", "06_barcelona_access_score.csv", "07_ski_access_score.csv", "08_coast_access_score.csv", "09_landscape_score.csv", "10_tourism_demand_score.csv", "11_hut_feasibility_score.csv", "12_demographic_score.csv", "13_income_score.csv", "14_services_score.csv", "15_natural_risk_score.csv"}
    for filename in SCORE_SCHEMAS.keys() - built:
        rows = _blocked_rows(municipalities, "processing_not_available", retrieved_at)
        _emit(data_dir, filename, rows)
        key = filename.removesuffix(".csv").split("_", 1)[1]
        manifest["datasets"][key] = _manifest_entry(
            "engineering_pending", filename, len(rows), 0, None
        )

    write_json(data_dir / "manifest.json", manifest)
    return manifest


def _base(municipality: dict[str, Any], retrieved_at: str, source_id: str, period: str) -> dict[str, Any]:
    return {**{key: municipality[key] for key in ("municipality_code", "municipality_name", "comarca_code", "comarca_name")}, "reference_period": period, "score_0_100": None, "confidence_0_100": 0, "data_scope": "missing", "source_id": source_id, "source_updated_at": None, "retrieved_at": retrieved_at, "method_version": METHOD_VERSION, "missing_reason": None, "notes": None}


def _sale_price_rows(municipalities: list[dict[str, Any]], sales: dict[str, dict[str, Any]], retrieved_at: str) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        source = sales.get(municipality["municipality_code"], {})
        row = {**_base(municipality, retrieved_at, "gencat_housing_sales_2025", "2025"), **source}
        row.update(_presence(source.get("sale_price_eur_m2"), missing="not_published"))
        rows.append(row)
    scores, norm = robust_scores(row.get("sale_price_eur_m2") for row in rows)
    _assign_scores(rows, scores)
    return rows, norm


def _rental_rows(municipalities: list[dict[str, Any]], rentals: dict[str, dict[str, Any]], retrieved_at: str) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        source = rentals.get(municipality["municipality_code"], {})
        row = {**_base(municipality, retrieved_at, "gencat_incasol_qww9-bvhh", "2025"), **source}
        row.update(_presence(source.get("avg_monthly_rent_eur"), missing="suppressed" if source else "not_published"))
        rows.append(row)
    scores, norm = robust_scores(row.get("avg_monthly_rent_eur") for row in rows)
    _assign_scores(rows, scores)
    return rows, norm


def _momentum_rows(
    municipalities: list[dict[str, Any]],
    sales: dict[str, dict[str, Any]],
    sales_2024: dict[str, dict[str, Any]],
    sales_2022: dict[str, dict[str, Any]],
    retrieved_at: str,
) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        code = municipality["municipality_code"]
        current = sales.get(code, {}).get("sale_price_eur_m2")
        one_year = sales_2024.get(code, {}).get("sale_price_eur_m2")
        three_year = sales_2022.get(code, {}).get("sale_price_eur_m2")
        metric = cagr(current, three_year, 3)
        row = _base(municipality, retrieved_at, "gencat_housing_sales_2022_2024_2025", "2022-2025")
        row.update({"price_eur_m2_current": current, "price_eur_m2_1y_ago": one_year, "price_eur_m2_3y_ago": three_year, "growth_1y_pct": percentage_change(current, one_year), "cagr_3y_pct": metric})
        row.update(_presence(metric, missing="insufficient_history", confidence=90))
        rows.append(row)
    scores, norm = robust_scores(row["cagr_3y_pct"] for row in rows)
    _assign_scores(rows, scores)
    return rows, norm


def _yield_rows(municipalities: list[dict[str, Any]], sales: dict[str, dict[str, Any]], rentals: dict[str, dict[str, Any]], retrieved_at: str) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        code = municipality["municipality_code"]
        rent = rentals.get(code, {}).get("avg_monthly_rent_eur")
        price = sales.get(code, {}).get("avg_sale_price_eur")
        value = 12 * rent / price * 100 if rent is not None and price and price > 0 else None
        row = _base(municipality, retrieved_at, "gencat_incasol_qww9-bvhh;gencat_housing_sales_2025", "2025")
        row.update({"avg_monthly_rent_eur": rent, "avg_sale_price_eur": price, "gross_yield_proxy_pct": value})
        row.update(_presence(value, missing="missing_dependency", confidence=85))
        rows.append(row)
    scores, norm = robust_scores(row["gross_yield_proxy_pct"] for row in rows)
    _assign_scores(rows, scores)
    return rows, norm


def _liquidity_rows(municipalities: list[dict[str, Any]], sales: dict[str, dict[str, Any]], rentals: dict[str, dict[str, Any]], population: dict[str, dict[str, float]], retrieved_at: str) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        code = municipality["municipality_code"]
        periods = population.get(code, {})
        latest_period = max(periods, default="")
        pop = periods.get(latest_period)
        sale_count = sales.get(code, {}).get("sales_count")
        rental_count = rentals.get(code, {}).get("rental_contracts")
        row = _base(municipality, retrieved_at, "idescat_ep;gencat_housing_sales_2025;gencat_incasol_qww9-bvhh", f"2025 ({latest_period})")
        row.update({"population": pop, "sales_count": sale_count, "sales_per_1000": ratio_per_1000(sale_count, pop), "rental_contracts": rental_count, "rental_contracts_per_1000": ratio_per_1000(rental_count, pop)})
        rows.append(row)
    sale_scores, sale_norm = robust_scores(row["sales_per_1000"] for row in rows)
    rental_scores, rental_norm = robust_scores(row["rental_contracts_per_1000"] for row in rows)
    for row, sale_score, rental_score in zip(rows, sale_scores, rental_scores, strict=True):
        row["sale_liquidity_score"] = sale_score
        row["rental_liquidity_score"] = rental_score
        if sale_score is not None and rental_score is not None:
            row.update(_presence(1, confidence=90))
            row["score_0_100"] = round(0.6 * sale_score + 0.4 * rental_score, 4)
        else:
            row.update(_presence(None, missing="missing_dependency"))
    return rows, {"sale": asdict(sale_norm), "rental": asdict(rental_norm)}


def _demographic_rows(municipalities: list[dict[str, Any]], population: dict[str, dict[str, float]], retrieved_at: str) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        periods = population.get(municipality["municipality_code"], {})
        years = sorted(periods)
        latest = years[-1] if years else ""
        current = periods.get(latest)
        current_year = int(latest[:4]) if latest else 0
        one_year = periods.get(str(current_year - 1))
        five_year = periods.get(str(current_year - 5))
        metric = cagr(current, five_year, 5)
        change = current - five_year if current is not None and five_year is not None else None
        adjusted = math.copysign(math.log1p(abs(change)), change) if change is not None else None
        row = _base(municipality, retrieved_at, "idescat_pmh_446_477", latest)
        row.update({"population_current": current, "population_1y_ago": one_year, "population_5y_ago": five_year, "population_change_5y": change, "growth_1y_pct": percentage_change(current, one_year), "cagr_5y_pct": metric, "_scale_adjusted_growth": adjusted})
        rows.append(row)
    trend_scores, trend_norm = robust_scores(row["cagr_5y_pct"] for row in rows)
    scale_scores, scale_norm = robust_scores(row["_scale_adjusted_growth"] for row in rows)
    for row, trend_score, scale_score in zip(rows, trend_scores, scale_scores, strict=True):
        row["trend_score"] = trend_score
        row["scale_adjusted_growth_score"] = scale_score
        if trend_score is not None and scale_score is not None:
            row["score_0_100"] = round(0.7 * trend_score + 0.3 * scale_score, 4)
            row.update(_presence(1, confidence=100))
            row["method_variant"] = "annual_trend_scale_adjusted"
        else:
            row.update(_presence(None, missing="insufficient_history"))
    return rows, {"trend": asdict(trend_norm), "scale_adjusted": asdict(scale_norm)}


def _blocked_rows(municipalities: list[dict[str, Any]], reason: str, retrieved_at: str) -> list[dict[str, Any]]:
    return [{**_base(municipality, retrieved_at, "", ""), "missing_reason": reason, "notes": "Collector requires routing, legal review, or geospatial source processing not available in this run."} for municipality in municipalities]


def _income_rows(
    municipalities: list[dict[str, Any]],
    year: str,
    income: dict[str, dict[str, float]],
    retrieved_at: str,
) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        source = income.get(municipality["municipality_code"], {})
        per_capita = source.get("PER_CAPITA_EUR")
        row = _base(municipality, retrieved_at, "idescat_rfdbc_21181_25017", year)
        row.update(
            {
                "rfdb_total_eur": (
                    source["VALUE_EK"] * 1000 if "VALUE_EK" in source else None
                ),
                "rfdb_eur_per_capita": per_capita,
                "rfdb_index_catalonia_100": source.get("PER_CAPITA_INDEX"),
            }
        )
        row.update(_presence(per_capita, missing="not_published", confidence=85))
        rows.append(row)
    scores, norm = robust_scores(row["rfdb_eur_per_capita"] for row in rows)
    _assign_scores(rows, scores)
    return rows, norm


def _barcelona_access_rows(
    municipalities: list[dict[str, Any]],
    routes: dict[str, dict[str, float | None]],
    metadata: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    retrieved_at = max(item["retrieved_at"] for item in metadata)
    points: list[tuple[float, float]] = [
        (45, 100),
        (90, 75),
        (120, 60),
        (180, 35),
        (240, 15),
        (300, 0),
    ]
    rows = []
    for municipality in municipalities:
        route = routes.get(municipality["municipality_code"], {})
        minutes = route.get("drive_minutes")
        row = _base(municipality, retrieved_at, "openrouteservice_osm", retrieved_at[:10])
        row.update(
            {
                "origin_name": "Plaça de Catalunya, Barcelona",
                "destination_lat": municipality.get("capital_lat"),
                "destination_lon": municipality.get("capital_lon"),
                "drive_minutes": minutes,
                "road_distance_km": route.get("road_distance_km"),
                "routing_engine": "openrouteservice",
                "routing_profile": "driving-car",
                "routing_date": retrieved_at[:10],
                "score_0_100": piecewise_linear_score(minutes, points),
            }
        )
        row.update(_presence(minutes, missing="routing_unavailable", confidence=90))
        rows.append(row)
    return rows


def _ski_rows(
    municipalities: list[dict[str, Any]],
    routes_by_municipality: dict[str, list[dict[str, Any]]],
    metadata: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], Any]:
    retrieved_at = max(item["retrieved_at"] for item in metadata)
    rows = []
    for municipality in municipalities:
        routes = routes_by_municipality.get(municipality["municipality_code"], [])
        reachable = [route for route in routes if route["contribution"] is not None]
        by_distance = sorted(
            reachable,
            key=lambda route: (route["generalized_minutes"], route["station_id"]),
        )
        by_contribution = sorted(
            reachable,
            key=lambda route: (-route["contribution"], route["station_id"]),
        )
        top = by_contribution[:3]
        ski_raw = (
            top[0]["contribution"]
            + (0.5 * top[1]["contribution"] if len(top) > 1 else 0)
            + (0.25 * top[2]["contribution"] if len(top) > 2 else 0)
            if top
            else None
        )
        row = _base(municipality, retrieved_at, "curated_ski_catalogue;openrouteservice", retrieved_at[:10])
        row.update(
            {
                "nearest_station": by_distance[0]["station_name"] if by_distance else None,
                "nearest_station_minutes": by_distance[0]["generalized_minutes"] if by_distance else None,
                "nearest_station_km": by_distance[0]["road_distance_km"] if by_distance else None,
                "best_station": top[0]["station_name"] if top else None,
                "best_station_minutes": top[0]["generalized_minutes"] if top else None,
                "best_station_skiable_km": top[0]["skiable_km"] if top else None,
                "second_station": top[1]["station_name"] if len(top) > 1 else None,
                "second_station_minutes": top[1]["generalized_minutes"] if len(top) > 1 else None,
                "third_station": top[2]["station_name"] if len(top) > 2 else None,
                "third_station_minutes": top[2]["generalized_minutes"] if len(top) > 2 else None,
                "ski_raw": ski_raw,
                "method_variant": "access_variety_no_tier",
                "source_tier": "curated",
                "notes": "No snow, traffic, parking capacity, or season duration is modelled.",
            }
        )
        row.update(_presence(ski_raw, missing="routing_unavailable", confidence=65))
        rows.append(row)
    scores, normalization = robust_scores(row["ski_raw"] for row in rows)
    _assign_scores(rows, scores)
    return rows, normalization


def _tourism_rows(
    municipalities: list[dict[str, Any]],
    population: dict[str, dict[str, float]],
    period: str,
    etca: dict[str, dict[str, float]],
    registry: dict[str, dict[str, int]],
    retrieved_at: str,
) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        code = municipality["municipality_code"]
        etca_values = etca.get(code, {})
        counts = registry.get(
            code,
            {"hut_count": 0, "hotel_count": 0, "rural_count": 0, "camping_count": 0},
        )
        current_population = etca_values.get("resident_population")
        if current_population is None:
            periods = population.get(code, {})
            current_population = periods.get(max(periods, default=""))
        establishments = sum(counts.values())
        hut_per_1000 = ratio_per_1000(counts["hut_count"], current_population)
        supply_per_1000 = ratio_per_1000(establishments, current_population)
        resident = etca_values.get("resident_population")
        population_etca = etca_values.get("population_etca")
        pressure = population_etca / resident if population_etca is not None and resident else None
        row = _base(
            municipality,
            retrieved_at,
            "idescat_etca;gencat_tourism_registry_t2h3-cgys",
            period,
        )
        row.update(
            {
                **etca_values,
                "etca_pressure": pressure,
                **counts,
                "hut_per_1000": hut_per_1000,
                "tourist_establishments_count": establishments,
                "tourist_establishments_per_1000": supply_per_1000,
                "ieet_available": False,
                "ieet_total_eur": None,
                "ieet_hut_eur": None,
                "ieet_eur_per_resident": None,
                "ieet_score": None,
            }
        )
        rows.append(row)

    etca_scores, etca_norm = robust_scores(row.get("etca_pressure") for row in rows)
    hut_scores, hut_norm = robust_scores(row.get("hut_per_1000") for row in rows)
    supply_scores, supply_norm = robust_scores(
        row.get("tourist_establishments_per_1000") for row in rows
    )
    for row, etca_score, hut_score, supply_score in zip(
        rows, etca_scores, hut_scores, supply_scores, strict=True
    ):
        row["etca_score"] = etca_score
        row["hut_density_score"] = hut_score
        row["tourist_supply_score"] = supply_score
        if etca_score is not None and hut_score is not None and supply_score is not None:
            row["score_0_100"] = round(
                0.55 * etca_score + 0.25 * hut_score + 0.20 * supply_score,
                4,
            )
            row.update(_presence(1, confidence=75))
            row["notes"] = "IEET municipal not used; score is the documented base formula."
        else:
            row.update(_presence(None, missing="not_published"))
            row["notes"] = "ETCA is not published for every municipality."
    return rows, {
        "etca": asdict(etca_norm),
        "hut_density": asdict(hut_norm),
        "tourist_supply": asdict(supply_norm),
    }


def _coast_rows(
    municipalities: list[dict[str, Any]],
    coast_access: dict[str, dict[str, float | bool]],
    retrieved_at: str,
) -> list[dict[str, Any]]:
    import math

    rows = []
    for municipality in municipalities:
        values = coast_access.get(municipality["municipality_code"], {})
        distance = values.get("distance_to_coast_km")
        touches = values.get("touches_coast")
        score = None
        if isinstance(distance, (int, float)):
            score = 100.0 if touches is True else min(100.0, 100.0 * math.exp(-distance / 50))
        row = _base(municipality, retrieved_at, "icgc_coast_v1r0_202602", "2026-02")
        row.update(
            {
                "touches_coast": touches,
                "distance_to_coast_km": distance,
                "score_0_100": round(score, 4) if score is not None else None,
            }
        )
        row.update(_presence(score, missing="processing_not_available"))
        rows.append(row)
    return rows


def _hut_feasibility_rows(
    municipalities: list[dict[str, Any]],
    population: dict[str, dict[str, float]],
    registry: dict[str, dict[str, int]],
    hut_regime: set[str],
    retrieved_at: str,
) -> list[dict[str, Any]]:
    rows = []
    reference = (
        "Decreto-ley 3/2023, annex; DOGC 9036, 08/11/2023; "
        "effective from 09/11/2023"
    )
    for municipality in municipalities:
        code = municipality["municipality_code"]
        periods = population.get(code, {})
        latest_period = max(periods, default="")
        residents = periods.get(latest_period)
        hut_count = registry.get(code, {}).get("hut_count", 0)
        special_regime = code in hut_regime
        row = _base(municipality, retrieved_at, "decree_law_3_2023;t2h3-cgys", latest_period)
        row.update(
            {
                "subject_to_special_hut_license_regime": special_regime,
                "existing_hut_count": hut_count,
                "population": residents,
                "hut_per_100_residents": (
                    hut_count / residents * 100 if residents is not None and residents > 0 else None
                ),
                "explicit_local_moratorium": None,
                "explicit_local_prohibition": None,
                "local_regulation_checked": False,
                "regulation_reference": reference,
                "score_0_100": 40 if special_regime else 100,
                "notes": (
                    "A score of 100 only means the municipality is outside the regional special "
                    "regime; local planning has not been reviewed."
                ),
            }
        )
        row.update(_presence(1, confidence=70 if special_regime else 60))
        rows.append(row)
    return rows


def _natural_risk_rows(
    municipalities: list[dict[str, Any]],
    fire_hazard: dict[str, dict[str, float]],
    retrieved_at: str,
) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        fire = fire_hazard.get(municipality["municipality_code"], {})
        high = fire.get("high_fire_risk_area_pct")
        very_high = fire.get("very_high_fire_risk_area_pct")
        raw = high + 2 * very_high if high is not None and very_high is not None else None
        row = _base(municipality, retrieved_at, "gencat_fire_hazard_2024", "2024")
        row.update(
            {
                **fire,
                "fire_risk_raw": raw,
                "flood_red_flag": None,
                "fire_red_flag": very_high > 0 if very_high is not None else None,
                "risk_review_required": very_high > 0 if very_high is not None else None,
                "score_status": "partial",
                "coverage_weight_pct": 45,
                "source_tier": "official",
                "method_variant": "territorial_fire_7_8_high_9_10_very_high",
                "usable_for_composite": False,
                "missing_reason": "missing_dependency",
                "confidence_0_100": 70 if raw is not None else 0,
                "data_scope": "derived" if raw is not None else "missing",
                "notes": "Flood and built-up exposure are pending; interval reflects only fire's 45% weight.",
            }
        )
        rows.append(row)
    risk_scores, normalization = robust_scores(
        (row["fire_risk_raw"] for row in rows), higher_is_better=False
    )
    for row, fire_score in zip(rows, risk_scores, strict=True):
        row["fire_safety_score"] = fire_score
        minimum, maximum, coverage = calculate_score_interval(
            [(0.55, None), (0.45, fire_score)]
        )
        row["score_min_0_100"] = minimum
        row["score_max_0_100"] = maximum
        row["coverage_weight_pct"] = coverage
    return rows, normalization


def _landscape_rows(
    municipalities: list[dict[str, Any]],
    surfaces: dict[str, dict[str, float]],
    relief: dict[str, dict[str, float]],
    coast_access: dict[str, dict[str, float | bool]],
    retrieved_at: str,
) -> tuple[list[dict[str, Any]], Any]:
    rows = []
    for municipality in municipalities:
        code = municipality["municipality_code"]
        values = surfaces.get(code, {})
        row = _base(municipality, retrieved_at, "icgc_landcover_2024;gencat_protected_areas;icgc_coast_202602", "2024-2026")
        row.update(
            {
                "area_km2": municipality["area_km2"],
                **values,
                **relief.get(code, {}),
                "touches_coast": coast_access.get(code, {}).get("touches_coast"),
                "score_status": "partial",
                "source_tier": "official",
                "method_variant": "landscape_core",
                "usable_for_composite": True,
                "missing_reason": None,
                "confidence_0_100": 90 if values and code in relief else 0,
                "data_scope": "derived" if values else "missing",
                "notes": "Landscape Recognition is optional and not included in the core score.",
            }
        )
        rows.append(row)

    natural_scores, natural_norm = robust_scores(row.get("natural_area_pct") for row in rows)
    protected_scores, protected_norm = robust_scores(
        row.get("protected_area_pct") for row in rows
    )
    water_density_scores, water_norm = robust_scores(
        row.get("water_wetland_pct") for row in rows
    )
    elevation_scores, elevation_norm = robust_scores(
        row.get("elevation_range_p90") for row in rows
    )
    slope_scores, slope_norm = robust_scores(row.get("mean_slope_deg") for row in rows)
    for row, natural_score, protected_score, water_density_score, elevation_score, slope_score in zip(
        rows,
        natural_scores,
        protected_scores,
        water_density_scores,
        elevation_scores,
        slope_scores,
        strict=True,
    ):
        coast_score = 100 if row.get("touches_coast") is True else 0
        water_score = (
            0.6 * water_density_score + 0.4 * coast_score
            if water_density_score is not None
            else None
        )
        row["natural_score"] = natural_score
        row["protected_score"] = protected_score
        relief_score = (
            0.5 * elevation_score + 0.5 * slope_score
            if elevation_score is not None and slope_score is not None
            else None
        )
        row["relief_score"] = round(relief_score, 4) if relief_score is not None else None
        row["water_score"] = round(water_score, 4) if water_score is not None else None
        minimum, maximum, coverage = calculate_score_interval(
            [
                (0.35, natural_score),
                (0.25, protected_score),
                (0.25, relief_score),
                (0.15, water_score),
            ]
        )
        row["score_min_0_100"] = minimum
        row["score_max_0_100"] = maximum
        row["coverage_weight_pct"] = coverage
        if coverage == 100:
            row["score_0_100"] = minimum
            row["missing_reason"] = None
        else:
            row["usable_for_composite"] = False
            row["missing_reason"] = "missing_dependency"
    return rows, {
        "natural": asdict(natural_norm),
        "protected": asdict(protected_norm),
        "water_wetland": asdict(water_norm),
        "elevation_range": asdict(elevation_norm),
        "slope": asdict(slope_norm),
    }


def _services_rows(
    municipalities: list[dict[str, Any]],
    routes_by_municipality: dict[str, list[dict[str, Any]]],
    metadata: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    retrieved_at = max(item["retrieved_at"] for item in metadata)
    points: list[tuple[float, float]] = [(5, 100), (15, 80), (30, 50), (60, 10), (90, 0)]
    categories = {
        "hospital": ("hospital_minutes", "hospital_score"),
        "primary_care": ("primary_care_minutes", "primary_care_score"),
        "supermarket": ("supermarket_minutes", "supermarket_score"),
        "school": ("school_minutes", "school_score"),
        "rail_station": ("rail_station_minutes", "rail_station_score"),
        "pharmacy": ("pharmacy_minutes", "pharmacy_score"),
    }
    weights = {
        "hospital": 0.25,
        "primary_care": 0.15,
        "supermarket": 0.20,
        "school": 0.10,
        "rail_station": 0.20,
        "pharmacy": 0.10,
    }
    rows = []
    for municipality in municipalities:
        routes = routes_by_municipality.get(municipality["municipality_code"], [])
        row = _base(
            municipality,
            retrieved_at,
            "openstreetmap_geofabrik;openrouteservice",
            "2026-08-20",
        )
        component_scores = {}
        for category, (minutes_field, score_field) in categories.items():
            reachable = [
                route
                for route in routes
                if route["category"] == category and route["drive_minutes"] is not None
            ]
            best = min(reachable, key=lambda route: route["drive_minutes"]) if reachable else None
            minutes = best["drive_minutes"] if best else None
            score = piecewise_linear_score(minutes, points)
            row[minutes_field] = minutes
            row[score_field] = score
            component_scores[category] = score
        if all(score is not None for score in component_scores.values()):
            total_score = 0.0
            for category, component_score in component_scores.items():
                assert component_score is not None
                total_score += weights[category] * component_score
            row["score_0_100"] = round(total_score, 4)
            row.update(_presence(1, confidence=70))
        else:
            row.update(_presence(None, missing="routing_unavailable"))
        row.update(
            {
                "source_tier": "open_community",
                "method_variant": "osm_cross_border_nearest5_ors",
                "notes": "© OpenStreetMap contributors, ODbL 1.0; nearest five geographic candidates routed.",
            }
        )
        rows.append(row)
    return rows


def _presence(value: Any, *, missing: str = "not_published", confidence: int = 100) -> dict[str, Any]:
    if value is None:
        return {"confidence_0_100": 0, "data_scope": "missing", "missing_reason": missing}
    return {"confidence_0_100": confidence, "data_scope": "municipality", "missing_reason": None}


def _assign_scores(rows: list[dict[str, Any]], scores: list[float | None]) -> None:
    for row, score in zip(rows, scores, strict=True):
        row["score_0_100"] = score
        if score is None and row["missing_reason"] is None:
            row.update(_presence(None, missing="normalization_degenerate"))


def _index_ine(source_rows: list[dict[str, Any]], municipalities: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    prefix = {row["municipality_code"][:5]: row["municipality_code"] for row in municipalities}
    if len(prefix) != len(municipalities):
        raise ValueError("IDESCAT codes do not have unique INE prefixes")
    indexed = {}
    for row in source_rows:
        code = prefix.get(row["ine_code"])
        if code:
            if code in indexed:
                raise ValueError(f"duplicate source row for municipality {code}")
            indexed[code] = row
    return indexed


def _emit(data_dir: Path, filename: str, rows: list[dict[str, Any]]) -> None:
    for row in rows:
        for field, value in publication_defaults(row).items():
            row.setdefault(field, value)
    try:
        validate_score_rows(rows, expected_count=947)
    except ValueError as error:
        raise ValueError(f"{filename}: {error}") from error
    write_csv(
        data_dir / filename,
        COMMON_COLUMNS[:5] + SCORE_SCHEMAS[filename] + COMMON_COLUMNS[5:] + PUBLICATION_COLUMNS,
        rows,
    )


def _manifest_entry(status: str, output: str, total: int, with_data: int, source: dict[str, Any] | None) -> dict[str, Any]:
    coverage = round(with_data / total * 100, 2) if total else 0
    snapshots = _collect_snapshots(source)
    return {
        "status": status,
        "method_version": METHOD_VERSION,
        "method_variant": "default",
        "source_tier": "official" if source else "proxy",
        "source": source,
        "source_datasets": sorted(
            {snapshot["url"] for snapshot in snapshots if snapshot.get("url")}
        ),
        "snapshots": snapshots,
        "retrieved_at": max(
            (snapshot["retrieved_at"] for snapshot in snapshots if snapshot.get("retrieved_at")),
            default=None,
        ),
        "reference_period": None,
        "output_file": output,
        "rows_total": total,
        "rows_with_data": with_data,
        "rows_with_score": with_data,
        "rows_missing": total - with_data,
        "coverage_pct": coverage,
        "coverage_weight_pct": 100 if status == "complete" else 0,
        "usable_for_composite": status == "complete",
        "limitations": [],
        "validation": {
            "schema": "passed",
            "geometry": "not_applicable",
            "manual_sample": "pending",
            "regression": "pending",
        },
    }


def _score_manifest(filename: str, rows: list[dict[str, Any]], normalization: Any, source: dict[str, Any]) -> dict[str, Any]:
    with_data = sum(row["score_0_100"] is not None for row in rows)
    entry = _manifest_entry(
        "complete" if with_data else "methodology_pending",
        filename,
        len(rows),
        with_data,
        source,
    )
    entry["normalization"] = asdict(normalization) if hasattr(normalization, "method") else normalization
    entry["reference_period"] = sorted(
        {str(row["reference_period"]) for row in rows if row.get("reference_period")}
    )
    return entry


def _collect_snapshots(value: Any) -> list[dict[str, Any]]:
    snapshots: list[dict[str, Any]] = []
    if isinstance(value, list):
        for item in value:
            snapshots.extend(_collect_snapshots(item))
    elif isinstance(value, dict):
        if value.get("raw_file") and value.get("sha256"):
            snapshots.append(
                {
                    key: value.get(key)
                    for key in ("raw_file", "sha256", "url", "retrieved_at", "bytes")
                }
            )
        else:
            for item in value.values():
                snapshots.extend(_collect_snapshots(item))
    return snapshots
