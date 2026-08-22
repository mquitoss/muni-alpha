"""Streaming OpenStreetMap POI extraction and nearest-candidate selection."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Any

import numpy as np
import osmium  # type: ignore[import-untyped]
import pandas as pd
from pyproj import Transformer

CATEGORIES = (
    "hospital",
    "primary_care",
    "supermarket",
    "pharmacy",
    "school",
    "rail_station",
)
INACTIVE = {"disused", "abandoned", "demolished", "removed", "proposed", "construction", "razed"}
PRIMARY_CARE_NEGATIVE = {
    "dental", "odontologia", "veterinari", "estetica", "fertilitat", "reproduccio",
    "fisioterapia", "podologia", "psicologia",
}


def _normalize(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value.casefold())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in folded if not unicodedata.combining(c))).strip()


def classify(tags: dict[str, str]) -> str | None:
    if any(tags.get(key) == "yes" for key in INACTIVE):
        return None
    if any(any(key.startswith(f"{prefix}:") for prefix in INACTIVE) for key in tags):
        return None
    amenity = tags.get("amenity")
    healthcare = tags.get("healthcare")
    if amenity == "hospital" or healthcare == "hospital":
        return "hospital"
    if amenity == "clinic" or healthcare in {"clinic", "centre"} or amenity == "doctors":
        text = _normalize(" ".join((tags.get("name", ""), tags.get("healthcare:speciality", ""))))
        if not any(term in text for term in PRIMARY_CARE_NEGATIVE):
            return "primary_care"
    if tags.get("shop") == "supermarket":
        return "supermarket"
    if amenity == "pharmacy" or healthcare == "pharmacy":
        return "pharmacy"
    if amenity == "school":
        return "school"
    if (
        tags.get("railway") in {"station", "halt"}
        and tags.get("station") not in {"subway", "light_rail", "monorail"}
        and tags.get("tram") != "yes"
    ):
        return "rail_station"
    return None


class _PoiHandler(osmium.SimpleHandler):  # type: ignore[misc]
    def __init__(self, source: str) -> None:
        super().__init__()
        self.source = source
        self.rows: list[dict[str, Any]] = []

    def node(self, node: Any) -> None:
        if node.location.valid():
            self._append("node", node.id, dict(node.tags), node.location.lon, node.location.lat)

    def way(self, way: Any) -> None:
        coordinates = [(node.lon, node.lat) for node in way.nodes if node.location.valid()]
        if coordinates:
            self._append(
                "way",
                way.id,
                dict(way.tags),
                sum(point[0] for point in coordinates) / len(coordinates),
                sum(point[1] for point in coordinates) / len(coordinates),
            )

    def _append(self, osm_type: str, osm_id: int, tags: dict[str, str], lon: float, lat: float) -> None:
        category = classify(tags)
        if category is None:
            return
        self.rows.append(
            {
                "poi_id": f"osm:{osm_type}:{osm_id}:{category}",
                "category": category,
                "name": tags.get("name", ""),
                "lat": lat,
                "lon": lon,
                "source": "openstreetmap",
                "source_record_id": f"{osm_type}/{osm_id}",
                "source_priority": 2,
                "coordinate_source": "osm_geometry",
                "is_active": True,
                "dedup_status": "automatic",
                "confidence_0_100": 70,
                "snapshot_date": "2026-08-20",
                "source_region": self.source,
            }
        )


def extract_services_poi(pbf_paths: list[Path], output_path: Path) -> pd.DataFrame:
    if output_path.exists():
        return pd.read_parquet(output_path)
    rows = []
    for path in pbf_paths:
        handler = _PoiHandler(path.stem)
        handler.apply_file(str(path), locations=True, idx="flex_mem")
        rows.extend(handler.rows)
    frame = pd.DataFrame(rows).drop_duplicates(subset=["poi_id"])
    transformer = Transformer.from_crs(4326, 25831, always_xy=True)
    frame["x"], frame["y"] = transformer.transform(frame["lon"].to_numpy(), frame["lat"].to_numpy())
    frame["normalized_name"] = frame["name"].map(_normalize)
    frame = frame.sort_values(["category", "source_priority", "poi_id"]).reset_index(drop=True)
    # Remove common node/area duplicates while preserving distinct unnamed facilities.
    keep = np.ones(len(frame), dtype=bool)
    for _, indexes in frame[frame["normalized_name"] != ""].groupby(
        ["category", "normalized_name"]
    ).groups.items():
        accepted: list[int] = []
        for index in indexes:
            if any(
                (frame.at[index, "x"] - frame.at[other, "x"]) ** 2
                + (frame.at[index, "y"] - frame.at[other, "y"]) ** 2
                <= 30**2
                for other in accepted
            ):
                keep[index] = False
            else:
                accepted.append(index)
    frame = frame[keep].drop(columns=["normalized_name"]).reset_index(drop=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(output_path, index=False)
    return frame


def build_service_candidates(
    municipalities: list[dict[str, Any]], poi: pd.DataFrame, *, count: int = 5
) -> dict[str, list[dict[str, Any]]]:
    transformer = Transformer.from_crs(4326, 25831, always_xy=True)
    result: dict[str, list[dict[str, Any]]] = {}
    for municipality in municipalities:
        origin_x, origin_y = transformer.transform(
            municipality["capital_lon"], municipality["capital_lat"]
        )
        candidates = []
        for category in CATEGORIES:
            category_poi = poi[poi["category"] == category]
            distances = (
                (category_poi["x"].to_numpy() - origin_x) ** 2
                + (category_poi["y"].to_numpy() - origin_y) ** 2
            )
            k = min(count, len(category_poi))
            if k == 0:
                continue
            nearest = np.argpartition(distances, k - 1)[:k]
            selected = category_poi.iloc[nearest].copy()
            selected["geographic_distance_m"] = np.sqrt(distances[nearest])
            for row in selected.sort_values(["geographic_distance_m", "poi_id"]).to_dict("records"):
                candidates.append(row)
        result[municipality["municipality_code"]] = candidates
    return result
