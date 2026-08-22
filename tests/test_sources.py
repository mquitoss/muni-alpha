import json
from pathlib import Path

from munialpha.sources import (
    parse_annual_population,
    parse_etca,
    parse_income,
    parse_municipalities,
    parse_population,
    parse_tourism_registry,
)


def test_parse_municipalities_joins_capital_by_code(tmp_path: Path) -> None:
    catalogue = {"features": [{"properties": {"CODIMUNI": "080018", "NOMMUNI": "Abrera", "CODICOMAR": "11", "NOMCOMAR": "Baix Llobregat", "CODIVEGUE": "01", "NOMVEGUE": "Barcelona", "CODIPROV": "08", "NOMPROV": "Barcelona", "AREAM5000": 19.9}}]}
    capitals = {"features": [{"properties": {"CODIMUNI": "080018"}, "geometry": {"coordinates": [1.9, 41.5]}}]}
    catalogue_path = tmp_path / "catalogue.json"
    capitals_path = tmp_path / "capitals.json"
    catalogue_path.write_text(json.dumps(catalogue))
    capitals_path.write_text(json.dumps(capitals))

    rows = parse_municipalities(catalogue_path, capitals_path)

    assert rows[0]["municipality_code"] == "080018"
    assert rows[0]["capital_lat"] == 41.5
    assert rows[0]["capital_lon"] == 1.9


def test_parse_sparse_json_stat_population(tmp_path: Path) -> None:
    dataset = {
        "id": ["SEMESTER", "MUN", "SEX", "CONCEPT"],
        "size": [1, 2, 3, 1],
        "dimension": {
            "SEMESTER": {"category": {"index": ["2025S1"]}},
            "MUN": {"category": {"index": ["080018", "TOTAL"]}},
            "SEX": {"category": {"index": ["M", "F", "TOTAL"]}},
            "CONCEPT": {"category": {"index": ["POP"]}},
        },
        "value": {"2": 12600, "5": 8000000},
    }
    path = tmp_path / "population.json"
    path.write_text(json.dumps(dataset))

    assert parse_population(path) == {"080018": {"2025S1": 12600.0}}


def test_parse_annual_population_uses_homogeneous_years(tmp_path: Path) -> None:
    dataset = {
        "id": ["YEAR", "MUN", "SEX", "CONCEPT"],
        "size": [2, 2, 1, 1],
        "dimension": {
            "YEAR": {"category": {"index": ["2020", "2025"]}},
            "MUN": {"category": {"index": ["080018", "TOTAL"]}},
            "SEX": {"category": {"index": ["TOTAL"]}},
            "CONCEPT": {"category": {"index": ["POP"]}},
        },
        "value": [12000, 7800000, 13000, 8100000],
    }
    path = tmp_path / "annual_population.json"
    path.write_text(json.dumps(dataset))

    assert parse_annual_population(path) == {
        "080018": {"2020": 12000.0, "2025": 13000.0}
    }


def test_parse_income_selects_latest_year_and_indicators(tmp_path: Path) -> None:
    dataset = {
        "id": ["YEAR", "MUN", "CONCEPT", "INDICATOR"],
        "size": [2, 2, 1, 3],
        "dimension": {
            "YEAR": {"category": {"index": ["2022", "2023"]}},
            "MUN": {"category": {"index": ["080018", "TOTAL"]}},
            "CONCEPT": {"category": {"index": ["GROSS_INCOME"]}},
            "INDICATOR": {
                "category": {
                    "index": ["VALUE_EK", "PER_CAPITA_EUR", "PER_CAPITA_INDEX"]
                }
            },
        },
        "value": {"6": 250000, "7": 22000, "8": 105.2},
    }
    path = tmp_path / "income.json"
    path.write_text(json.dumps(dataset))

    year, values = parse_income(path)

    assert year == "2023"
    assert values["080018"]["PER_CAPITA_EUR"] == 22000


def test_parse_etca_preserves_negative_resident_absence(tmp_path: Path) -> None:
    path = tmp_path / "etca.ssv"
    path.write_text(
        "Municipis. 2024 (p)\n"
        "Codi;Nom;No resident;Resident absent;Total;Resident;ETCA;ETCA pct\n"
        "080193;Barcelona;292739;-194612;98127;1686208;1784335;105,8\n"
    )

    period, values = parse_etca(path)

    assert period == "2024"
    assert values["080193"]["resident_absent"] == -194612


def test_parse_tourism_registry_aggregates_supported_categories(tmp_path: Path) -> None:
    path = tmp_path / "registry.json"
    path.write_text(
        json.dumps(
            [
                {"codi_municipi_idescat": "080193", "tipus_establiment": "Hotels", "n": "4"},
                {"codi_municipi_idescat": "080193", "tipus_establiment": "Habitatges d'ús turístic", "n": "10"},
            ]
        )
    )

    values = parse_tourism_registry(path)

    assert values["080193"]["hotel_count"] == 4
    assert values["080193"]["hut_count"] == 10
