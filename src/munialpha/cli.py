"""Command-line interface."""

from __future__ import annotations

import argparse
from pathlib import Path

from .config import load_dotenv
from .pipeline import run


def main() -> None:
    parser = argparse.ArgumentParser(description="Build MuniAlpha phase-one municipal datasets")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--refresh", action="store_true", help="download official sources again")
    arguments = parser.parse_args()
    load_dotenv(Path(".env"))
    manifest = run(arguments.data_dir, refresh=arguments.refresh)
    complete = sum(item["status"] == "complete" for item in manifest["datasets"].values())
    print(f"Generated {len(manifest['datasets'])} datasets in {arguments.data_dir} ({complete} complete)")


if __name__ == "__main__":
    main()
