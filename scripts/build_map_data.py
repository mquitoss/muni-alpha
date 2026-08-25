"""Build MuniAlpha's map bundle through the pinned Tesela pipeline."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
TESELA_BUILDER = REPOSITORY_ROOT / "vendor/tesela/scripts/build_data.py"
SOURCE_PATH = REPOSITORY_ROOT / "scripts/sources/munialpha.py"


def build_command(
    project_root: Path = REPOSITORY_ROOT,
    output: Path = Path("data/map_bundle.js"),
    decimals: int = 5,
) -> list[str]:
    """Return the canonical Tesela CLI invocation used by MuniAlpha."""
    if not TESELA_BUILDER.is_file():
        raise FileNotFoundError(
            "Tesela no está inicializado. Ejecuta: git submodule update --init --recursive"
        )
    return [
        sys.executable,
        str(TESELA_BUILDER),
        "--source-path",
        str(SOURCE_PATH),
        "--project-root",
        str(project_root.resolve()),
        "--output",
        str(output),
        "--join-property",
        "CODIMUNI",
        "--key-field",
        "municipality_code",
        "--namespace",
        "MUNIALPHA_DATA",
        "--decimals",
        str(decimals),
        "--no-attach-indicators",
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=REPOSITORY_ROOT)
    parser.add_argument("--output", type=Path, default=Path("data/map_bundle.js"))
    parser.add_argument("--decimals", type=int, default=5)
    args = parser.parse_args(argv)

    try:
        command = build_command(args.project_root, args.output, args.decimals)
    except FileNotFoundError as error:
        parser.exit(2, f"error: {error}\n")
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
