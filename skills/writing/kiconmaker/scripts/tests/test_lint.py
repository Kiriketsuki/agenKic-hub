"""Lint rule tests. Each broken icon must trip exactly the rule it breaks."""

from conftest import write_source

from iconkit import lint, source

CLEAN = '<path d="M4 10 L12 4 L20 10 V20 H4 Z"/><path d="M10 20 V15 H14 V20"/>'


def _run(cfg, body, root_attrs='data-metaphor="test"'):
    path = write_source(cfg.source_dir, "probe", body, root_attrs)
    src, errors = source.load_source(path, cfg.parts_dir, cfg.size, {})
    assert not errors
    shapes, errors = source.shapes(src, cfg.corner_radius)
    assert not errors
    return lint.lint_icon(src, shapes, cfg)


def _rules(findings):
    return {f.rule for f in findings if not f.waived}


def test_clean_icon_has_no_findings(project):
    assert _rules(_run(project, CLEAN)) == set()


def test_tight_gap_is_an_error(project):
    found = _run(project, '<path d="M4 8 H20"/><path d="M4 11 H20"/>')
    gaps = [f for f in found if f.rule == "gap"]
    assert gaps and gaps[0].severity == lint.ERROR


def test_wide_gap_passes(project):
    assert "gap" not in _rules(_run(project, '<path d="M4 8 H20"/><path d="M4 12 H20"/>'))


def test_off_grid_point(project):
    assert "off-grid" in _rules(_run(project, '<path d="M4.3 8 H20"/>'))


def test_rotated_shape_skips_grid(project):
    body = '<path d="M4 8 H20" transform="rotate(10 12 12)"/>'
    assert "off-grid" not in _rules(_run(project, body))


def test_outside_padding(project):
    assert "padding" in _rules(_run(project, '<path d="M2 8 H20"/>'))


def test_waiver_is_recorded(project):
    found = _run(project, '<path d="M4.3 8 H20"/>', 'data-metaphor="t" data-waive="off-grid"')
    assert [f.waived for f in found if f.rule == "off-grid"] == [True]


def test_banned_metaphor(project):
    from iconkit import config
    cfg = config.with_patch(project, {"metaphors": {"avoid": ["floppy disk"]}})
    found = _run(cfg, CLEAN, 'data-metaphor="Floppy disk for save"')
    assert "metaphor" in _rules(found)


def test_styling_attribute_is_rejected(project):
    path = write_source(project.source_dir, "styled", '<path d="M4 8 H20" stroke="red"/>')
    _, errors = source.load_source(path, project.parts_dir, project.size, {})
    assert any("geometry only" in e for e in errors)


def test_small_loop_warns(project):
    assert "gap" in _rules(_run(project, '<circle cx="12" cy="12" r="1.5"/>'))


def test_dot_and_large_loop_pass(project):
    assert "gap" not in _rules(_run(project, '<circle cx="12" cy="12" r="0.5"/>'))
    assert "gap" not in _rules(_run(project, '<circle cx="12" cy="12" r="3"/>'))


def test_strokes_one_width_apart_fuse(project):
    assert "gap" not in _rules(_run(project, '<path d="M4 8 H20"/><path d="M4 10 H20"/>'))


def test_u_turn_with_narrow_inside_warns(project):
    found = _run(project, '<path d="M9 18 V6 H12 V18"/>')
    assert [f.severity for f in found if f.rule == "gap"] == [lint.WARN]
