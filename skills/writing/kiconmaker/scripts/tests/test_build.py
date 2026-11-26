"""Build and render tests."""

import shutil
import xml.etree.ElementTree as ET

import pytest
from conftest import write_source

import kiconmaker
from iconkit import config, source, style


def _icon(cfg, body, name="probe"):
    path = write_source(cfg.source_dir, name, body)
    src, errors = source.load_source(path, cfg.parts_dir, cfg.size, {})
    assert not errors
    return style.build_icon(src, cfg)


def test_build_uses_current_color_and_drops_data(project):
    text = _icon(project, '<rect data-role="body" x="4" y="4" width="16" height="16"/>').file_text()
    root = ET.fromstring(text)
    assert root.get("stroke") == "currentColor"
    assert "data-" not in text
    assert 'rx="2"' in text


def test_solid_cut_becomes_mask(project):
    cfg = config.with_patch(project, {"style": {"kind": "solid"}})
    text = _icon(cfg, '<circle data-role="body" cx="12" cy="12" r="8"/>'
                      '<circle data-role="cut" cx="12" cy="12" r="3"/>').file_text()
    assert "<mask" in text and 'fill="currentColor"' in text


def test_part_expands_with_transform(project):
    write_source(project.parts_dir, "dot", '<circle cx="12" cy="6" r="1"/>')
    text = _icon(project, '<use data-part="dot" transform="translate(0 4)"/>').file_text()
    assert '<g transform="translate(0 4)"><circle' in text


def test_build_is_deterministic(project, capsys):
    write_source(project.source_dir, "house", '<path d="M4 10 L12 4 L20 10 V20 H4 Z"/>')
    args = ["--config", str(project.root / "icons.toml"), "build"]
    assert kiconmaker.main(args) == 0
    first = (project.build_dir / "house.svg").read_bytes()
    assert kiconmaker.main(args + ["--check"]) == 0
    assert (project.build_dir / "house.svg").read_bytes() == first


@pytest.mark.skipif(not (shutil.which("resvg") or shutil.which("rsvg-convert")), reason="no renderer")
def test_render_writes_png_outside_project(project, tmp_path, capsys):
    write_source(project.source_dir, "house", '<path d="M4 10 L12 4 L20 10 V20 H4 Z"/>')
    assert kiconmaker.main(["--config", str(project.root / "icons.toml"), "render", "house"]) == 0
    png = capsys.readouterr().out.strip().splitlines()[-1]
    assert png.startswith(str(tmp_path / "cache"))
    with open(png, "rb") as fh:
        assert fh.read(8) == b"\x89PNG\r\n\x1a\n"


def test_default_cache_is_outside_project(project, tmp_path, monkeypatch):
    from iconkit import renderer
    monkeypatch.delenv("KICONMAKER_CACHE")
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "xdg"))
    folder = renderer.cache_dir(project.root)
    assert folder.parent == tmp_path / "xdg" / "kiconmaker"
    assert project.root not in folder.parents


def test_bad_viewbox_is_an_error_line(project):
    path = project.source_dir / "odd.svg"
    project.source_dir.mkdir(parents=True, exist_ok=True)
    path.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 a b"/>', encoding="utf-8")
    _, errors = source.load_source(path, project.parts_dir, project.size, {})
    assert any("viewBox" in e for e in errors)
