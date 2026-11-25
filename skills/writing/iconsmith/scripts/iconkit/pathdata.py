"""Path data parser and curve sampler.

The parser reads the SVG path grammar: absolute and relative commands,
implicit repeats, compact numbers such as "1.5-2" or ".5.5", and arc flags
written without separators. It returns subpaths in absolute coordinates.
The sampler turns each subpath into a dense polyline for the lint rules.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

Point = tuple[float, float]

_ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}


@dataclass(frozen=True)
class Segment:
    """One drawing segment. kind is L, C, Q or A. pts holds absolute points."""

    kind: str
    pts: tuple[Point, ...]
    arc: tuple[float, float, float, bool, bool] | None = None


@dataclass(frozen=True)
class Subpath:
    start: Point
    segments: tuple[Segment, ...]
    closed: bool

    def anchors(self) -> list[Point]:
        """Return the start point and every segment end point."""
        return [self.start] + [seg.pts[-1] for seg in self.segments]


class _Scanner:
    """Reads tokens from path data. The scanner object is local to one parse."""

    def __init__(self, text: str):
        self.text = text
        self.pos = 0

    def _skip(self) -> None:
        while self.pos < len(self.text) and self.text[self.pos] in " \t\r\n,":
            self.pos += 1

    def at_end(self) -> bool:
        self._skip()
        return self.pos >= len(self.text)

    def peek_command(self) -> str | None:
        self._skip()
        if self.pos < len(self.text) and self.text[self.pos].upper() in _ARGS:
            return self.text[self.pos]
        return None

    def command(self) -> str:
        cmd = self.peek_command()
        if cmd is None:
            raise ValueError(f"expected a path command at character {self.pos}")
        self.pos += 1
        return cmd

    def flag(self) -> bool:
        self._skip()
        if self.pos < len(self.text) and self.text[self.pos] in "01":
            self.pos += 1
            return self.text[self.pos - 1] == "1"
        raise ValueError(f"expected an arc flag 0 or 1 at character {self.pos}")

    def number(self) -> float:
        self._skip()
        text, start = self.text, self.pos
        i = start
        if i < len(text) and text[i] in "+-":
            i += 1
        digits_start = i
        while i < len(text) and text[i].isdigit():
            i += 1
        if i < len(text) and text[i] == ".":
            i += 1
            while i < len(text) and text[i].isdigit():
                i += 1
        if i == digits_start or text[digits_start:i] == ".":
            raise ValueError(f"expected a number at character {start}")
        if i < len(text) and text[i] in "eE":
            j = i + 1
            if j < len(text) and text[j] in "+-":
                j += 1
            if j < len(text) and text[j].isdigit():
                while j < len(text) and text[j].isdigit():
                    j += 1
                i = j
        self.pos = i
        return float(text[start:i])


def _read_args(scan: _Scanner, upper: str) -> list:
    if upper == "A":
        rx, ry, rot = scan.number(), scan.number(), scan.number()
        large, sweep = scan.flag(), scan.flag()
        return [rx, ry, rot, large, sweep, scan.number(), scan.number()]
    return [scan.number() for _ in range(_ARGS[upper])]


class _Builder:
    """Collects subpaths during one parse. The parse owns this object."""

    def __init__(self):
        self.done: list[Subpath] = []
        self.start: Point | None = None
        self.segs: list[Segment] = []
        self.cur: Point = (0.0, 0.0)
        self.last_ctrl: Point | None = None
        self.last_kind = ""

    def flush(self, closed: bool) -> None:
        if self.start is not None and (self.segs or closed):
            self.done.append(Subpath(self.start, tuple(self.segs), closed))
        self.start, self.segs = None, []

    def add(self, seg: Segment, ctrl: Point | None) -> None:
        if self.start is None:
            self.start = self.cur
        self.segs.append(seg)
        self.cur = seg.pts[-1]
        self.last_ctrl = ctrl
        self.last_kind = seg.kind


def _step(b: _Builder, cmd: str, args: list) -> None:
    upper, rel = cmd.upper(), cmd.islower()
    ox, oy = b.cur if rel else (0.0, 0.0)

    def pt(i: int) -> Point:
        return (args[i] + ox, args[i + 1] + oy)

    def mirror(kind: str) -> Point:
        if b.last_ctrl is not None and b.last_kind == kind:
            return (2 * b.cur[0] - b.last_ctrl[0], 2 * b.cur[1] - b.last_ctrl[1])
        return b.cur

    if upper == "M":
        b.flush(False)
        b.cur, b.start, b.last_ctrl = pt(0), pt(0), None
    elif upper == "L":
        b.add(Segment("L", (b.cur, pt(0))), None)
    elif upper == "H":
        b.add(Segment("L", (b.cur, (args[0] + ox, b.cur[1]))), None)
    elif upper == "V":
        b.add(Segment("L", (b.cur, (b.cur[0], args[0] + (b.cur[1] if rel else 0.0)))), None)
    elif upper == "C":
        b.add(Segment("C", (b.cur, pt(0), pt(2), pt(4))), pt(2))
    elif upper == "S":
        b.add(Segment("C", (b.cur, mirror("C"), pt(0), pt(2))), pt(0))
    elif upper == "Q":
        b.add(Segment("Q", (b.cur, pt(0), pt(2))), pt(0))
    elif upper == "T":
        ctrl = mirror("Q")
        b.add(Segment("Q", (b.cur, ctrl, pt(0))), ctrl)
    elif upper == "A":
        arc = (abs(args[0]), abs(args[1]), args[2], args[3], args[4])
        b.add(Segment("A", (b.cur, pt(5)), arc), None)


def parse(d: str) -> list[Subpath]:
    """Parse path data into absolute subpaths. Raise ValueError on bad data."""
    scan, b = _Scanner(d or ""), _Builder()
    while not scan.at_end():
        cmd = scan.command()
        upper = cmd.upper()
        if upper == "Z":
            start = b.start if b.start is not None else b.cur
            if b.start is not None and b.cur != b.start:
                b.add(Segment("L", (b.cur, b.start)), None)
            b.flush(True)
            b.cur = start
            continue
        if b.start is None and upper != "M" and not b.done:
            raise ValueError("path data must start with M or m")
        _step(b, cmd, _read_args(scan, upper))
        repeat = "l" if cmd == "m" else "L" if cmd == "M" else cmd
        while not scan.at_end() and scan.peek_command() is None:
            _step(b, repeat, _read_args(scan, upper))
    b.flush(False)
    return b.done


def _lerp(p: Point, q: Point, t: float) -> Point:
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def _cubic(p: tuple[Point, ...], t: float) -> Point:
    a, b, c = _lerp(p[0], p[1], t), _lerp(p[1], p[2], t), _lerp(p[2], p[3], t)
    return _lerp(_lerp(a, b, t), _lerp(b, c, t), t)


def _quad(p: tuple[Point, ...], t: float) -> Point:
    return _lerp(_lerp(p[0], p[1], t), _lerp(p[1], p[2], t), t)


def _arc_center(seg: Segment):
    """Convert an endpoint arc to centre form, following SVG 1.1 appendix F.6.5."""
    (x1, y1), (x2, y2) = seg.pts
    rx, ry, rot, large, sweep = seg.arc
    if rx == 0 or ry == 0 or (x1, y1) == (x2, y2):
        return None
    phi = math.radians(rot)
    cos, sin = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = cos * dx + sin * dy, -sin * dx + cos * dy
    lam = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
    den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2
    coef = math.sqrt(max(0.0, num / den)) if den else 0.0
    if large == sweep:
        coef = -coef
    cxp, cyp = coef * rx * y1p / ry, -coef * ry * x1p / rx
    cx = cos * cxp - sin * cyp + (x1 + x2) / 2
    cy = sin * cxp + cos * cyp + (y1 + y2) / 2
    th1 = math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
    th2 = math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
    delta = th2 - th1
    if sweep and delta < 0:
        delta += 2 * math.pi
    elif not sweep and delta > 0:
        delta -= 2 * math.pi
    return cx, cy, rx, ry, cos, sin, th1, delta


def _rough_length(seg: Segment) -> float:
    if seg.kind == "A":
        geo = _arc_center(seg)
        if geo is None:
            return math.dist(*seg.pts)
        return abs(geo[7]) * max(geo[2], geo[3])
    return sum(math.dist(a, b) for a, b in zip(seg.pts, seg.pts[1:]))


def point_at(seg: Segment, t: float) -> Point:
    """Return the point at parameter t in [0, 1] on one segment."""
    if seg.kind == "L":
        return _lerp(seg.pts[0], seg.pts[1], t)
    if seg.kind == "C":
        return _cubic(seg.pts, t)
    if seg.kind == "Q":
        return _quad(seg.pts, t)
    geo = _arc_center(seg)
    if geo is None:
        return _lerp(seg.pts[0], seg.pts[1], t)
    cx, cy, rx, ry, cos, sin, th1, delta = geo
    ang = th1 + delta * t
    x, y = rx * math.cos(ang), ry * math.sin(ang)
    return (cos * x - sin * y + cx, sin * x + cos * y + cy)


def sample(sub: Subpath, step: float = 0.25) -> list[Point]:
    """Return points along the subpath, no more than about step apart."""
    points = [sub.start]
    for seg in sub.segments:
        count = max(1, math.ceil(_rough_length(seg) / step))
        points.extend(point_at(seg, i / count) for i in range(1, count + 1))
    return points
