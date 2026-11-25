"""Path parser and sampler tests."""

import math

import pytest

from iconkit import pathdata, transform


def test_relative_and_implicit_repeats():
    subs = pathdata.parse("m2 2 3 0 0 3z")
    assert len(subs) == 1
    assert subs[0].closed
    assert subs[0].anchors() == [(2, 2), (5, 2), (5, 5), (2, 2)]


def test_compact_numbers():
    subs = pathdata.parse("M.5.5L1.5-2")
    assert subs[0].anchors() == [(0.5, 0.5), (1.5, -2)]


def test_arc_flags_without_separators():
    subs = pathdata.parse("M4 12a8 8 0 018 8")
    seg = subs[0].segments[0]
    assert seg.kind == "A"
    assert seg.arc[3] is False and seg.arc[4] is True
    assert seg.pts[-1] == (12, 20)


def test_arc_samples_stay_on_circle():
    subs = pathdata.parse("M4 12 A8 8 0 0 1 20 12")
    for x, y in pathdata.sample(subs[0]):
        assert math.isclose(math.dist((x, y), (12, 12)), 8, abs_tol=1e-6)
        assert y <= 12 + 1e-9


def test_smooth_cubic_mirrors_control():
    subs = pathdata.parse("M0 0 C0 4 4 4 4 0 S8 -4 8 0")
    assert subs[0].segments[1].pts[1] == (4, -4)


def test_bad_data_raises():
    with pytest.raises(ValueError):
        pathdata.parse("L2 2")
    with pytest.raises(ValueError):
        pathdata.parse("M0 0 A1 1 0 2 1 3 3")


def test_rotate_about_point():
    m = transform.parse("rotate(90 12 12)")
    x, y = transform.apply(m, (12, 4))
    assert math.isclose(x, 20) and math.isclose(y, 12)
    assert not transform.is_translate_only(m)
    assert transform.is_translate_only(transform.parse("translate(2 3)"))
