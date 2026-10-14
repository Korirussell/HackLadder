from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


def read_fixture(rel: str) -> str:
    """Real Devpost pages saved by scripts/fetch_fixtures.py (see fixtures/manifest.json)."""
    return (FIXTURES / rel).read_text(encoding="utf-8")


@pytest.fixture
def fixture_text() -> Callable[[str], str]:
    return read_fixture
