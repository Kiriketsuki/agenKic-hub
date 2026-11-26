"""Motion tests: the pose model, the built CSS, the frames and the motion lint."""

import math
import shutil
import xml.etree.ElementTree as ET

import pytest
from conftest import write_source

import kiconmaker
from iconkit import config, lint, motion, source, style, transform

GOLDEN_SOLID = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<mask id="a-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">'
    '<rect width="24" height="24" fill="#fff" stroke="none"/><g stroke="#000">'
    '<circle cx="11" cy="11" r="3" transform="matrix(1 0 0 1 1 0)"/></g></mask>'
    '<g mask="url(#a-cut)"><g transform="translate(1 0)">'
    '<rect x="4" y="4" width="14" height="14" rx="2" fill="currentColor"/></g></g></svg>\n')


def _load(cfg, name, body):
    path = write_source(cfg.source_dir, name, body)
    src, errors = source.load_source(path, cfg.parts_dir, cfg.size, {}, cfg.motion_duration)
    return src, errors


def _icon(cfg, body, name="probe", at=None):
    src, errors = _load(cfg, name, body)
    assert not errors, errors
    return style.build_icon(src, cfg, at=at)


# Style file

def test_old_style_file_loads_with_motion_defaults(project):
    assert project.motion_delivery == "inline"
    assert project.motion_duration == 360.0


@pytest.mark.parametrize("patch, word", [
    ({"easing": "bouncy"}, "motion.easing"),
    ({"easing": "cubic-bezier(1.5, 0, 0.5, 1)"}, "motion.easing"),
    ({"delivery": "svgo"}, "motion.delivery"),
    ({"trigger": "a b"}, "motion.trigger"),
    ({"duration": 0}, "motion.duration"),
])
def test_bad_motion_settings_are_rejected(project, patch, word):
    with pytest.raises(config.ConfigError, match=word):
        config.with_patch(project, {"motion": patch})


# Pose model

def test_bezier_matches_known_points():
    curve = motion.parse_easing("ease-in-out")
    assert motion.ease(curve, 0.5) == pytest.approx(0.5, abs=1e-6)
    assert motion.ease(motion.parse_easing("linear"), 0.3) == pytest.approx(0.3, abs=1e-6)
    over = motion.parse_easing("cubic-bezier(0.3, 1.6, 0.6, 1)")
    assert max(motion.ease(over, i / 50) for i in range(51)) > 1.0


def test_rotate_keeps_its_pivot_at_every_frame():
    m = motion.Motion(motion.parse_steps("rotate(40)", (12, 18)), "hold", 0, 300)
    for p in (0, 0.25, 0.5, 1, 1.2):
        x, y = transform.apply(m.matrix(p), (12, 18))
        assert (x, y) == pytest.approx((12, 18), abs=1e-9)


def test_rest_and_pose_css_share_one_function_list():
    m = motion.Motion(motion.parse_steps("translate(0 -2) rotate(-20 6 10) scale(1.1)", (12, 12)),
                      "hold", 0, 300)
    names = lambda text: [part.split("(")[0] for part in text.split()]  # noqa: E731
    assert names(m.css(0)) == names(m.css(1))
    assert "rotate(0deg)" in m.css(0) and "rotate(-20deg)" in m.css(1)


def test_pulse_returns_to_rest_and_hold_stays():
    curve = motion.parse_easing("ease-out")
    hold = motion.Motion((("translate", 0, -2),), "hold", 100, 300)
    pulse = motion.Motion((("translate", 0, -2),), "pulse", 0, 300)
    assert hold.progress(50, curve) == 0.0 and hold.progress(400, curve) == 1.0
    assert pulse.progress(150, curve) == pytest.approx(1.0)
    assert pulse.progress(300, curve) == 0.0
    swing = motion.Motion((("rotate", 10, 12, 4),), "swing", 0, 400)
    assert swing.progress(100, curve) == pytest.approx(1.0)
    assert swing.progress(300, curve) == pytest.approx(-1.0)
    assert swing.progress(400, curve) == 0.0


@pytest.mark.parametrize("text", ["skewX(10)", "rotate(1 2)", "scale(0)", "nonsense", "translate(1) junk"])
def test_bad_steps_raise(text):
    with pytest.raises(motion.MotionError):
        motion.parse_steps(text, (12, 12))


# Source checks

def test_motion_on_a_path_is_an_error(project):
    _, errors = _load(project, "bad", '<path data-motion="rotate(10)" d="M4 4 H20"/>')
    assert any("data-motion" in e for e in errors)


def test_nested_moving_groups_are_an_error(project):
    _, errors = _load(project, "nest", '<g data-motion="rotate(10)"><g data-motion="translate(0 1)">'
                                       '<path d="M4 4 H20"/></g></g>')
    assert any("inside another moving group" in e for e in errors)


def test_part_use_carries_motion(project):
    write_source(project.parts_dir, "lid", '<path d="M5 6 H19"/>')
    text = _icon(project, '<use data-part="lid" data-motion="translate(0 -2)"/>').file_text()
    assert 'class="kim-probe-0"' in text


# Build

def test_no_motion_build_matches_golden_bytes(project):
    cfg = config.with_patch(project, {"style": {"kind": "solid"}})
    body = ('<g transform="translate(1 0)"><rect data-role="body" x="4" y="4" width="14" height="14"/>'
            '<circle data-role="cut" cx="11" cy="11" r="3"/></g>')
    assert _icon(cfg, body, name="a").file_text() == GOLDEN_SOLID


def test_moving_group_gets_wrapper_style_and_keeps_transform(project):
    text = _icon(project, '<g transform="translate(1 0)" data-motion="rotate(-30 6 8)">'
                          '<path d="M6 8 H18"/></g><path d="M4 18 H20"/>').file_text()
    root = ET.fromstring(text)
    ns = "{http://www.w3.org/2000/svg}"
    assert root.find(f"{ns}style") is not None
    wrapper = root.find(f"{ns}g")
    assert wrapper.get("class") == "kim-probe-0" and wrapper.get("transform") is None
    assert wrapper.find(f"{ns}g").get("transform") == "translate(1 0)"
    css = root.find(f"{ns}style").text
    assert "prefers-reduced-motion:no-preference" in css and "@media (hover:hover)" in css
    assert ".icon-trigger:focus-visible .kim-probe-0" in css


def test_delivery_off_and_frozen_rest_equal_a_static_build(project):
    body = '<g data-motion="translate(0 -2)"><path d="M6 8 H18"/></g>'
    plain = _icon(project, '<g><path d="M6 8 H18"/></g>', name="plain").file_text()
    off = _icon(config.with_patch(project, {"motion": {"delivery": "off"}}), body, name="plain").file_text()
    rest = _icon(project, body, name="plain", at=0.0).file_text()
    assert off == plain and rest == plain


def test_frozen_frame_moves_the_group(project):
    text = _icon(project, '<g data-motion="translate(0 -2)"><path d="M6 8 H18"/></g>', at=10_000).file_text()
    assert 'transform="matrix(1 0 0 1 0 -2)"' in text


def test_solid_cut_moves_with_its_body(project):
    cfg = config.with_patch(project, {"style": {"kind": "solid"}})
    text = _icon(cfg, '<g data-motion="translate(0 -2)"><rect data-role="body" x="4" y="6" width="16" height="12"/>'
                      '<path data-role="cut" d="M8 12 H16"/></g>').file_text()
    mask = text[text.index("<mask"):text.index("</mask>")]
    assert 'class="kim-probe-0"' in mask


def test_stylesheet_delivery_writes_motion_css(project, capsys):
    cfg_path = project.root / "icons.toml"
    cfg_path.write_text(cfg_path.read_text() + '\n[motion]\ndelivery = "stylesheet"\n', encoding="utf-8")
    write_source(project.source_dir, "bell", '<g data-motion="rotate(15 12 4)"><path d="M6 16 H18"/></g>')
    assert kiconmaker.main(["--config", str(cfg_path), "build"]) == 0
    assert "<style>" not in (project.build_dir / "bell.svg").read_text()
    assert ".kim-bell-0" in (project.build_dir / "motion.css").read_text()
    assert kiconmaker.main(["--config", str(cfg_path), "build", "--check"]) == 0


# Lint

def _rules(cfg, body, name="probe"):
    src, errors = _load(cfg, name, body)
    assert not errors, errors
    return {f.rule: f for f in lint.lint_motion(src, cfg)}


def test_lint_flags_ink_that_leaves_the_canvas(project):
    rules = _rules(project, '<g data-motion="translate(0 -6)"><path d="M6 4 H18"/></g>')
    assert rules["motion-clip"].severity == lint.ERROR


def test_lint_flags_a_long_motion(project):
    rules = _rules(project, '<g data-motion="translate(0 -1)" data-motion-delay="600"><path d="M6 12 H18"/></g>')
    assert "motion-time" in rules


def test_lint_flags_a_move_too_small_to_see(project):
    rules = _rules(project, '<g data-motion="translate(0.5 0)"><path d="M6 12 H18"/></g>')
    assert "motion-small" in rules


def test_lint_passes_a_clean_motion(project):
    assert _rules(project, '<g data-motion="rotate(-25 6 12)"><path d="M6 12 H16"/></g>') == {}


def test_frames_command_renders_png(project, capsys):
    if not (shutil.which("resvg") or shutil.which("rsvg-convert")):
        pytest.skip("no renderer")
    write_source(project.source_dir, "bell", '<g data-motion="rotate(15 12 4)" data-motion-kind="pulse">'
                                             '<path d="M6 16 H18"/></g>')
    assert kiconmaker.main(["--config", str(project.root / "icons.toml"), "frames", "bell", "--count", "4"]) == 0
    png = capsys.readouterr().out.strip().splitlines()[-1]
    with open(png, "rb") as fh:
        assert fh.read(4) == b"\x89PNG"


def test_sample_times_span_the_timeline():
    m = motion.Motion((("translate", 0, 1),), "hold", 100, 300)
    times = motion.sample_times([m], 5)
    assert times[0] == 0 and times[-1] == 400 and math.isclose(times[1], 100)


def test_lint_flags_a_scale_that_changes_stroke_weight(project):
    rules = _rules(project, '<g data-motion="scale(1 0.5)" data-motion-origin="12 20"><path d="M4 11 H20"/></g>')
    assert "motion-stroke" in rules


def test_swing_scale_must_stay_under_two(project):
    _, errors = _load(project, "big", '<g data-motion="scale(2)" data-motion-kind="swing"><path d="M8 12 H16"/></g>')
    assert any("under 2" in e for e in errors)


def test_sample_times_include_every_peak():
    swing = motion.Motion((("rotate", 10, 12, 4),), "swing", 30, 400)
    pulse = motion.Motion((("translate", 0, 1),), "pulse", 0, 250)
    times = motion.sample_times([swing, pulse], 6)
    for t in (130, 330, 125):
        assert t in times
