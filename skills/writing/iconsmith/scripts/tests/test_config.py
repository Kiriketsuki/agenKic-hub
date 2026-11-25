"""Style file tests."""

import pytest

from iconkit import config


def test_defaults_fill_in(project):
    assert project.kind == "outline"
    assert project.sizes == (16, 20, 24)
    assert project.build_dir == project.root / "icons/build"


def test_unknown_key_is_rejected(project):
    with pytest.raises(config.ConfigError, match="stroke.widht"):
        config.with_patch(project, {"stroke": {"widht": 3}})


def test_bad_choice_is_rejected(project):
    with pytest.raises(config.ConfigError, match="style.kind"):
        config.with_patch(project, {"style": {"kind": "glass"}})


def test_note_is_required(tmp_path):
    (tmp_path / "icons.toml").write_text("[canvas]\nsize = 24\n", encoding="utf-8")
    with pytest.raises(config.ConfigError, match="product.note"):
        config.load(tmp_path / "icons.toml")


def test_override_parses_typed_values(project):
    label, patch = config.parse_override("Thin: stroke.width=1.5, style.kind=solid")
    assert label == "Thin"
    patched = config.with_patch(project, patch)
    assert patched.stroke_width == 1.5 and patched.kind == "solid"
    assert project.stroke_width == 2.0
