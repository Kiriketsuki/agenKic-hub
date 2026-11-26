"""Shared fixtures. The tests import iconkit from the scripts folder."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from iconkit import config  # noqa: E402

STYLE = """
[product]
note = "Test product"
[canvas]
size = 24
padding = 2
grid = 0.5
[stroke]
width = 2
min_gap = 1.5
"""


def write_source(folder: Path, name: str, body: str, root_attrs: str = 'data-metaphor="test"') -> Path:
    """Write one source SVG with the given inner markup and return its path."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.svg"
    path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {root_attrs}>'
                    f"{body}</svg>", encoding="utf-8")
    return path


@pytest.fixture
def project(tmp_path, monkeypatch):
    """A temporary project with icons.toml and a cache outside the project."""
    monkeypatch.setenv("KICONMAKER_CACHE", str(tmp_path / "cache"))
    (tmp_path / "proj").mkdir()
    (tmp_path / "proj" / "icons.toml").write_text(STYLE, encoding="utf-8")
    return config.load(tmp_path / "proj" / "icons.toml")
