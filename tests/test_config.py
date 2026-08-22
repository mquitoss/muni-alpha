import os
from pathlib import Path

from munialpha.config import load_dotenv


def test_load_dotenv_does_not_override_explicit_environment(tmp_path: Path) -> None:
    path = tmp_path / ".env"
    path.write_text("EXISTING=file\nNEW_VALUE=loaded\n")
    os.environ["EXISTING"] = "environment"
    os.environ.pop("NEW_VALUE", None)

    load_dotenv(path)

    assert os.environ["EXISTING"] == "environment"
    assert os.environ["NEW_VALUE"] == "loaded"
    os.environ.pop("EXISTING")
    os.environ.pop("NEW_VALUE")
