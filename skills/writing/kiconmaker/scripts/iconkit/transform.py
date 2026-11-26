"""Affine transforms for the SVG transform attribute.

A matrix is a tuple (a, b, c, d, e, f). It maps (x, y) to
(a*x + c*y + e, b*x + d*y + f), the same layout that SVG uses.
"""

from __future__ import annotations

import math
import re

Matrix = tuple[float, float, float, float, float, float]

IDENTITY: Matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)

_FUNC_RE = re.compile(r"([a-zA-Z]+)\s*\(([^)]*)\)")
_NUM_RE = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def multiply(m1: Matrix, m2: Matrix) -> Matrix:
    """Return m1 x m2. The result applies m2 first, then m1."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def apply(m: Matrix, point: tuple[float, float]) -> tuple[float, float]:
    """Map one (x, y) point through matrix m."""
    a, b, c, d, e, f = m
    x, y = point
    return (a * x + c * y + e, b * x + d * y + f)


def is_translate_only(m: Matrix, tol: float = 1e-9) -> bool:
    """Return True when m only moves points and does not scale or rotate them."""
    a, b, c, d, _, _ = m
    return abs(a - 1) < tol and abs(d - 1) < tol and abs(b) < tol and abs(c) < tol


def scale_factor(m: Matrix) -> float:
    """Return the mean linear scale of m. Lint uses it to scale radii."""
    a, b, c, d, _, _ = m
    return math.sqrt(abs(a * d - b * c))


def _one(name: str, args: list[float]) -> Matrix:
    if name == "matrix" and len(args) == 6:
        return tuple(args)
    if name == "translate" and len(args) in (1, 2):
        return (1.0, 0.0, 0.0, 1.0, args[0], args[1] if len(args) == 2 else 0.0)
    if name == "scale" and len(args) in (1, 2):
        sy = args[1] if len(args) == 2 else args[0]
        return (args[0], 0.0, 0.0, sy, 0.0, 0.0)
    if name == "rotate" and len(args) in (1, 3):
        rad = math.radians(args[0])
        cos, sin = math.cos(rad), math.sin(rad)
        rot = (cos, sin, -sin, cos, 0.0, 0.0)
        if len(args) == 1:
            return rot
        cx, cy = args[1], args[2]
        to_origin = (1.0, 0.0, 0.0, 1.0, -cx, -cy)
        back = (1.0, 0.0, 0.0, 1.0, cx, cy)
        return multiply(back, multiply(rot, to_origin))
    if name == "skewX" and len(args) == 1:
        return (1.0, 0.0, math.tan(math.radians(args[0])), 1.0, 0.0, 0.0)
    if name == "skewY" and len(args) == 1:
        return (1.0, math.tan(math.radians(args[0])), 0.0, 1.0, 0.0, 0.0)
    raise ValueError(f"transform {name}() with {len(args)} arguments is not valid")


def parse(text: str | None) -> Matrix:
    """Parse an SVG transform attribute into one matrix.

    An empty or missing attribute gives the identity matrix.
    """
    if not text or not text.strip():
        return IDENTITY
    result = IDENTITY
    consumed = 0
    for match in _FUNC_RE.finditer(text):
        gap = text[consumed:match.start()].strip(" ,\t\n")
        if gap:
            raise ValueError(f"cannot read transform near '{gap}'")
        args = [float(n) for n in _NUM_RE.findall(match.group(2))]
        result = multiply(result, _one(match.group(1), args))
        consumed = match.end()
    if text[consumed:].strip(" ,\t\n"):
        raise ValueError(f"cannot read transform near '{text[consumed:].strip()}'")
    return result
