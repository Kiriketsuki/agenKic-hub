"""Compose review images: a single-icon panel and the contact sheet.

Each image is one SVG that the renderer turns into a PNG at zoom 1. Zoom 1
keeps the real-size icons at their true pixel size, so the PNG shows the
same blur and weight a user sees on screen.
"""

from __future__ import annotations

from xml.sax.saxutils import escape

from .config import Config
from .source import Shape
from .style import Icon

INK_LIGHT, BG_LIGHT = "#1d1d22", "#ffffff"
INK_DARK, BG_DARK = "#ececf1", "#1d1d22"
LABEL = 'font-family="sans-serif" font-size="11" fill="#6b6b76"'
BIG = 384


def _text(x: float, y: float, words: str, anchor: str = "start") -> str:
    return f'<text x="{x:g}" y="{y:g}" text-anchor="{anchor}" {LABEL}>{escape(words)}</text>'


def _grid(cfg: Config, x0: float, y0: float, scale: float) -> str:
    lines = []
    steps = int(cfg.size)
    for i in range(steps + 1):
        pos = i * scale
        tone = "#c9c9d2" if i % 4 == 0 else "#ececf0"
        lines.append(f'<line x1="{x0 + pos:g}" y1="{y0:g}" x2="{x0 + pos:g}" y2="{y0 + BIG:g}" stroke="{tone}"/>')
        lines.append(f'<line x1="{x0:g}" y1="{y0 + pos:g}" x2="{x0 + BIG:g}" y2="{y0 + pos:g}" stroke="{tone}"/>')
    pad, live = cfg.padding * scale, (cfg.size - 2 * cfg.padding) * scale
    lines.append(f'<rect x="{x0 + pad:g}" y="{y0 + pad:g}" width="{live:g}" height="{live:g}" '
                 f'fill="none" stroke="#e0566b" stroke-dasharray="6 4"/>')
    return "".join(lines)


def _centrelines(shapes: list[Shape], x0: float, y0: float, scale: float) -> str:
    parts = []
    for shape in shapes:
        for points, closed in shape.polylines(0.25):
            coords = " L".join(f"{x0 + x * scale:.1f} {y0 + y * scale:.1f}" for x, y in points)
            parts.append(f"M{coords}{' Z' if closed else ''}")
    dots = "".join(f'<circle cx="{x0 + x * scale:.1f}" cy="{y0 + y * scale:.1f}" r="2.5"/>'
                   for shape in shapes for x, y in shape.anchors())
    return (f'<path d="{" ".join(parts)}" fill="none" stroke="#2f8fe0" stroke-width="1.2"/>'
            f'<g fill="#2f8fe0">{dots}</g>')


def _real_sizes(icon: Icon, cfg: Config, x0: float, y0: float) -> tuple[str, float]:
    """Draw each ship size at 1x on light and dark tiles. Return markup and height used."""
    out, y = [], y0
    for size in cfg.sizes:
        tile = size + 16
        out.append(_text(x0, y + 12, f"{size}px"))
        y += 18
        out.append(f'<rect x="{x0:g}" y="{y:g}" width="{tile}" height="{tile}" fill="{BG_LIGHT}" stroke="#d8d8de"/>')
        out.append(icon.nested(x0 + 8, y + 8, size, INK_LIGHT, f"-l{size}"))
        dx = x0 + tile + 8
        out.append(f'<rect x="{dx:g}" y="{y:g}" width="{tile}" height="{tile}" fill="{BG_DARK}"/>')
        out.append(icon.nested(dx + 8, y + 8, size, INK_DARK, f"-d{size}"))
        x2 = dx + tile + 8
        out.append(f'<rect x="{x2:g}" y="{y:g}" width="{size * 2 + 16}" height="{size * 2 + 16}" '
                   f'fill="{BG_LIGHT}" stroke="#d8d8de"/>')
        out.append(icon.nested(x2 + 8, y + 8, size * 2, INK_LIGHT, f"-x{size}"))
        y += max(tile, size * 2 + 16) + 10
    return "".join(out), y - y0


def icon_panel(icon: Icon, shapes: list[Shape], cfg: Config, metaphor: str) -> str:
    """Return SVG text for one icon: a large gridded view plus real sizes."""
    scale = BIG / cfg.size
    x0, y0 = 16, 40
    side_x = x0 + BIG + 32
    real, used = _real_sizes(icon, cfg, side_x, y0)
    width = side_x + max(cfg.sizes) * 4 + 96
    height = max(y0 + BIG + 40, y0 + used + 16)
    head = f"{icon.name}: {metaphor or 'no metaphor recorded'}"
    body = [f'<rect width="{width}" height="{height}" fill="#f6f6f8"/>',
            _text(x0, 24, head),
            f'<rect x="{x0}" y="{y0}" width="{BIG}" height="{BIG}" fill="{BG_LIGHT}"/>',
            _grid(cfg, x0, y0, scale),
            icon.nested(x0, y0, BIG, INK_LIGHT, "-big"),
            f'<g opacity="0.75">{_centrelines(shapes, x0, y0, scale)}</g>',
            _text(x0, y0 + BIG + 20, "blue: centrelines and anchors. red dash: live area."),
            real]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
            f'{"".join(body)}</svg>')


def _sheet_rows(icons: list[Icon], cfg: Config, col: float, x0: float, y0: float, blur: bool):
    out, y = [], y0
    for size in (*cfg.sizes, max(cfg.sizes) * 2):
        for dark in (False, True):
            row_h = size + 16
            bg, ink = (BG_DARK, INK_DARK) if dark else (BG_LIGHT, INK_LIGHT)
            out.append(f'<rect x="{x0:g}" y="{y:g}" width="{col * len(icons):g}" height="{row_h}" fill="{bg}"/>')
            tag = f"{size}px {'dark' if dark else 'light'}"
            out.append(_text(x0 - 8, y + row_h / 2 + 4, tag, "end"))
            group = [icon.nested(x0 + i * col + (col - size) / 2, y + 8, size, ink, f"-s{size}{int(dark)}")
                     for i, icon in enumerate(icons)]
            filt = f' filter="url(#blur{size})"' if blur else ""
            out.append(f"<g{filt}>{''.join(group)}</g>")
            y += row_h + 6
    return "".join(out), y


def contact_sheet(icons: list[Icon], cfg: Config, blur: bool = False) -> str:
    """Return SVG text for the whole set at every ship size, light and dark.

    With blur, each row passes through a Gaussian blur. Blur hides shape, so
    the eye compares only the weight of each icon against its neighbours.
    """
    if not icons:
        raise ValueError("the contact sheet needs at least one icon")
    col = max(max(cfg.sizes) * 2 + 16, 72)
    x0, y0 = 96, 46
    defs = "".join(f'<filter id="blur{s}" x="-50%" y="-50%" width="200%" height="200%">'
                   f'<feGaussianBlur stdDeviation="{s / 8:g}"/></filter>'
                   for s in (*cfg.sizes, max(cfg.sizes) * 2))
    rows, y = _sheet_rows(icons, cfg, col, x0, y0, blur)
    names = "".join(_text(x0 + i * col + col / 2, 38, icon.name, "middle") for i, icon in enumerate(icons))
    width, height = x0 + col * len(icons) + 16, y + 10
    title = ("blurred copy: compare weight only" if blur else "real size, 1x") + f", style {cfg.kind}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:g}" height="{height:g}">'
            f'<defs>{defs}</defs><rect width="{width:g}" height="{height:g}" fill="#f6f6f8"/>'
            f'{_text(8, 18, title)}{names}{rows}</svg>')


FRAME = 160


def _frame_tile(icon: Icon, cfg: Config, x: float, y: float, uid: str) -> str:
    scale = FRAME / cfg.size
    pad, live = cfg.padding * scale, (cfg.size - 2 * cfg.padding) * scale
    return (f'<rect x="{x:g}" y="{y:g}" width="{FRAME}" height="{FRAME}" fill="{BG_LIGHT}" stroke="#d8d8de"/>'
            f'<rect x="{x + pad:g}" y="{y + pad:g}" width="{live:g}" height="{live:g}" fill="none" '
            f'stroke="#e0566b" stroke-dasharray="4 4" stroke-width="0.75"/>'
            + icon.nested(x, y, FRAME, INK_LIGHT, uid))


def frames_panel(name: str, metaphor: str, frames: list, cfg: Config) -> str:
    """Return SVG text for one icon over its hover timeline.

    frames holds (time in ms, Icon) pairs, from hover start to the end of the
    last move. Row one shows each frame large. The trail tile stacks every
    frame faintly, so the path of each moving part shows in one view. Row two
    shows each frame at the smallest ship size and at twice that size.
    """
    x0, y0, gap = 16, 40, 12
    out = [_text(x0, 24, f"{name}: {metaphor or 'no metaphor recorded'}. Hover timeline, rest to end.")]
    for i, (t, icon) in enumerate(frames):
        x = x0 + i * (FRAME + gap)
        out.append(_text(x, y0 + FRAME + 16, f"{t:.0f} ms"))
        out.append(_frame_tile(icon, cfg, x, y0, f"-f{i}"))
    tx = x0 + len(frames) * (FRAME + gap) + gap
    out.append(_text(tx, y0 + FRAME + 16, "trail: all frames"))
    out.append(f'<rect x="{tx}" y="{y0}" width="{FRAME}" height="{FRAME}" fill="{BG_LIGHT}" stroke="#d8d8de"/>')
    for i, (_, icon) in enumerate(frames):
        last = i == len(frames) - 1
        out.append(f'<g opacity="{1 if last else 0.22}">{icon.nested(tx, y0, FRAME, INK_LIGHT, f"-t{i}")}</g>')
    small = min(cfg.sizes)
    y1 = y0 + FRAME + 40
    for row, px in enumerate((small, small * 2)):
        out.append(_text(x0, y1 + 12, f"{px}px"))
        for i, (_, icon) in enumerate(frames):
            x = x0 + 40 + i * (px + 16)
            out.append(f'<rect x="{x:g}" y="{y1:g}" width="{px + 8}" height="{px + 8}" fill="{BG_LIGHT}"/>')
            out.append(icon.nested(x + 4, y1 + 4, px, INK_LIGHT, f"-s{row}{i}"))
        y1 += px + 20
    width = tx + FRAME + 16
    height = y1 + 10
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:g}" height="{height:g}">'
            f'<rect width="{width:g}" height="{height:g}" fill="#f6f6f8"/>{"".join(out)}</svg>')
