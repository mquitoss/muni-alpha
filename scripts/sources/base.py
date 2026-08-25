"""Domain-neutral source contract for the static map builder."""

from __future__ import annotations

from typing import Any, Protocol


class Source(Protocol):
    attach_indicators: bool

    def geometry(self) -> dict[str, Any]: ...

    def indicators(self) -> list[dict[str, Any]]: ...

    def metadata(self) -> dict[str, Any]: ...
