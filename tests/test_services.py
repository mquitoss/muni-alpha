from munialpha.services import classify


def test_classifies_required_osm_services() -> None:
    assert classify({"amenity": "hospital"}) == "hospital"
    assert classify({"shop": "supermarket"}) == "supermarket"
    assert classify({"amenity": "pharmacy"}) == "pharmacy"
    assert classify({"amenity": "school"}) == "school"
    assert classify({"railway": "halt"}) == "rail_station"


def test_excludes_inactive_and_specialist_facilities() -> None:
    assert classify({"shop": "supermarket", "disused": "yes"}) is None
    assert classify({"amenity": "clinic", "name": "Clínica Dental"}) is None
    assert classify({"railway": "station", "station": "subway"}) is None
