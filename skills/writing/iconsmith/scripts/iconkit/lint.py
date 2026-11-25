"""Geometry lint for icon sources. Pure geometry, no renderer needed.

Rules:
- padding: ink must stay inside the live area (canvas minus padding).
- off-grid: anchor points of unrotated, unscaled shapes sit on the grid.
- gap: strokes that do not meet keep at least stroke.min_gap of clear space.
  Strokes closer than one stroke width fuse into one mass, so the rule
  treats them as joined, not as a gap.
- detail: the count of subpaths stays within the style.detail limit.
- metaphor: each source names its metaphor and avoids the banned list.
- ink: each icon carries about the same ink as the set median.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from dataclasses import dataclass

from .config import Config
from .source import Shape, Source

STEP = 0.25
# Rounding slack in canvas units. Sampled curves land a few hundredths off.
TOL = 0.05
ERROR, WARN = "error", "warn"


@dataclass(frozen=True)
class Finding:
    icon: str
    rule: str
    severity: str
    message: str
    waived: bool = False


def _finding(src: Source, rule: str, severity: str, message: str) -> Finding:
    return Finding(src.name, rule, severity, message, rule in src.waive)


def check_padding(src: Source, shapes: list[Shape], cfg: Config) -> list[Finding]:
    pts = [p for s in shapes for line, _ in s.polylines(STEP) for p in line]
    if not pts:
        return [_finding(src, "padding", ERROR, "the source draws nothing")]
    half = cfg.stroke_width / 2
    lo, hi = cfg.padding, cfg.size - cfg.padding
    box = (min(x for x, _ in pts) - half, min(y for _, y in pts) - half,
           max(x for x, _ in pts) + half, max(y for _, y in pts) + half)
    tol = 0.01
    if box[0] < lo - tol or box[1] < lo - tol or box[2] > hi + tol or box[3] > hi + tol:
        shown = ", ".join(f"{v:.2f}" for v in box)
        return [_finding(src, "padding", ERROR,
                         f"ink box ({shown}) leaves the live area {lo:g}..{hi:g}")]
    return []


def _off(value: float, grid: float) -> bool:
    return abs(value / grid - round(value / grid)) > 1e-6


def check_grid(src: Source, shapes: list[Shape], cfg: Config) -> list[Finding]:
    found = []
    for shape in shapes:
        if not shape.translate_only:
            continue
        bad = [p for p in shape.anchors() if _off(p[0], cfg.grid) or _off(p[1], cfg.grid)]
        if bad:
            x, y = bad[0]
            found.append(_finding(src, "off-grid", WARN,
                                  f"{shape.label}: {len(bad)} point(s) off the {cfg.grid:g} grid, "
                                  f"first at ({x:.3g}, {y:.3g})"))
    return found


def _tracks(shapes: list[Shape]) -> list[dict]:
    tracks = []
    for shape in shapes:
        for points, closed in shape.polylines(STEP):
            arcs = [0.0]
            for a, b in zip(points, points[1:]):
                arcs.append(arcs[-1] + math.dist(a, b))
            tracks.append({"label": shape.label, "pts": points, "arcs": arcs,
                           "closed": closed, "total": arcs[-1]})
    return tracks


def _close_pairs(tracks: list[dict], reach: float, self_skip: float) -> dict:
    """Map (track_a, track_b) to [(distance, point_a, point_b)] for points closer than reach."""
    grid = defaultdict(list)
    items = [(t, i, p) for t, track in enumerate(tracks) for i, p in enumerate(track["pts"])]
    for n, (_, _, p) in enumerate(items):
        grid[(int(p[0] // reach), int(p[1] // reach))].append(n)
    pairs = defaultdict(list)
    for n, (ta, ia, pa) in enumerate(items):
        cx, cy = int(pa[0] // reach), int(pa[1] // reach)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for m in grid.get((cx + dx, cy + dy), ()):
                    if m <= n:
                        continue
                    tb, ib, pb = items[m]
                    d = math.dist(pa, pb)
                    if d >= reach - TOL:
                        continue
                    if ta == tb:
                        track = tracks[ta]
                        sep = abs(track["arcs"][ia] - track["arcs"][ib])
                        if track["closed"]:
                            sep = min(sep, track["total"] - sep)
                        if sep < self_skip:
                            continue
                    pairs[(ta, tb)].append((d, pa, pb))
    return pairs


def check_gaps(src: Source, shapes: list[Shape], cfg: Config) -> list[Finding]:
    reach = cfg.stroke_width + cfg.min_gap
    near_junction = reach * 1.5
    tracks = _tracks(shapes)
    found = []
    for (ta, tb), hits in sorted(_close_pairs(tracks, reach, math.pi / 2 * reach).items()):
        fused = cfg.stroke_width + TOL
        joins = [p for h in hits if h[0] <= fused for p in (h[1], h[2])]
        misses = [h for h in hits if h[0] > fused
                  and all(math.dist(h[1], j) > near_junction and math.dist(h[2], j) > near_junction
                          for j in joins)]
        if not misses:
            continue
        d, pa, _ = min(misses, key=lambda h: h[0])
        clear = max(0.0, d - cfg.stroke_width)
        same = ta == tb
        where = tracks[ta]["label"] if same else f"{tracks[ta]['label']} and {tracks[tb]['label']}"
        what = "folds back near itself" if same else "come close without meeting"
        found.append(_finding(src, "gap", WARN if same else ERROR,
                              f"{where} {what}: clear space {clear:.2f} at ({pa[0]:.1f}, {pa[1]:.1f}), "
                              f"needs {cfg.min_gap:g}. Join them or move them apart."))
    return found


def check_small_loops(src: Source, shapes: list[Shape], cfg: Config) -> list[Finding]:
    """Flag closed shapes whose hole is narrower than min_gap.

    The pair search in check_gaps skips points close along one path, so it
    cannot see a small loop. A loop narrower than one stroke width fills in
    and reads as a dot, which is fine. A loop a little wider keeps a pinhole
    that closes up at small sizes.
    """
    found = []
    for shape in shapes:
        for points, closed in shape.polylines(STEP):
            if not closed:
                continue
            span = min(max(x for x, _ in points) - min(x for x, _ in points),
                       max(y for _, y in points) - min(y for _, y in points))
            if cfg.stroke_width + TOL < span < cfg.stroke_width + cfg.min_gap - TOL:
                found.append(_finding(src, "gap", WARN,
                                      f"{shape.label}: closed shape leaves a hole {span - cfg.stroke_width:.2f} "
                                      f"wide, needs {cfg.min_gap:g}. Make it larger, or shrink it to a dot."))
    return found


def check_detail(src: Source, shapes: list[Shape], cfg: Config) -> list[Finding]:
    count = sum(len(s.subpaths) for s in shapes)
    if count > cfg.detail_limit:
        return [_finding(src, "detail", WARN,
                         f"{count} subpaths. Detail '{cfg.detail}' allows {cfg.detail_limit}. "
                         "Drop the smallest parts first.")]
    return []


def check_metaphor(src: Source, cfg: Config) -> list[Finding]:
    if not src.metaphor:
        return [_finding(src, "metaphor", WARN, "data-metaphor is empty. Name the object the icon shows.")]
    text = src.metaphor.lower()
    banned = [a for a in cfg.avoid if a.lower() in text]
    if banned:
        return [_finding(src, "metaphor", ERROR, f"metaphor uses '{banned[0]}', which icons.toml avoids")]
    return []


def _even_odd(px: float, py: float, rings: list) -> bool:
    inside = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > py) != (y2 > py) and px < x1 + (py - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
    return inside


def ink_ratio(shapes: list[Shape], cfg: Config, res: int = 4) -> float:
    """Estimate the inked share of the live area on a res-per-unit grid."""
    cells = int(cfg.size * res)
    ink = [[0.0] * cells for _ in range(cells)]
    radius = cfg.stroke_width / 2
    weight = {"solid": 1.0, "duotone": cfg.tone_opacity}.get(cfg.kind, 0.0)
    bodies = [line for s in shapes if s.role == "body" for line, _ in s.polylines(STEP)]
    if weight and bodies:
        for j in range(cells):
            for i in range(cells):
                if _even_odd((i + 0.5) / res, (j + 0.5) / res, bodies):
                    ink[j][i] = weight

    def stamp(points, value):
        reach = int(math.ceil(radius * res))
        for x, y in points:
            ci, cj = int(x * res), int(y * res)
            for j in range(max(0, cj - reach), min(cells, cj + reach + 1)):
                for i in range(max(0, ci - reach), min(cells, ci + reach + 1)):
                    if math.dist(((i + 0.5) / res, (j + 0.5) / res), (x, y)) <= radius:
                        ink[j][i] = value

    for shape in shapes:
        cut = shape.role == "cut" and cfg.kind == "solid"
        for points, _ in shape.polylines(STEP):
            stamp(points, 0.0 if cut else 1.0)
    live = (cfg.size - 2 * cfg.padding) ** 2
    return sum(map(sum, ink)) / (res * res) / live


def check_ink(ratios: dict, sources: dict, cfg: Config) -> list[Finding]:
    if len(ratios) < 3:
        return []
    median = statistics.median(ratios.values())
    found = []
    for name, ratio in sorted(ratios.items()):
        if median and abs(ratio / median - 1) > cfg.ink_tolerance:
            side = "heavier" if ratio > median else "lighter"
            found.append(_finding(sources[name], "ink", WARN,
                                  f"ink {ratio:.0%} of the live area, {side} than the set median "
                                  f"{median:.0%} by more than {cfg.ink_tolerance:.0%}"))
    return found


def lint_icon(src: Source, shapes: list[Shape], cfg: Config) -> list[Finding]:
    return (check_metaphor(src, cfg) + check_padding(src, shapes, cfg) + check_grid(src, shapes, cfg)
            + check_gaps(src, shapes, cfg) + check_small_loops(src, shapes, cfg)
            + check_detail(src, shapes, cfg))
