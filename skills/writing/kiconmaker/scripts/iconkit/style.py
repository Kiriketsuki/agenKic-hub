"""Apply the icons.toml style to a source and produce the shipped SVG.

The built SVG paints with currentColor, so the icon takes the text colour
of the element that holds it. Roles decide how a shape paints:

- line: a stroke in every style.
- body: a stroke in outline, a stroke over a tinted fill in duotone, and a
  filled shape in solid.
- cut: a stroke in outline and duotone. In solid it knocks a line out of the
  filled bodies through a mask, so detail stays visible on a solid shape.

A group with data-motion gets a wrapper <g> with a class name. The motion
CSS moves the wrapper, and the group keeps its own transform attribute
inside it. A CSS transform replaces a transform attribute, so the two must
sit on separate elements. A cut inside a moving group gets the same class
in the mask, so the knock-out moves with its body.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from xml.sax.saxutils import quoteattr

from . import SVG_NS, motion, transform
from .config import Config
from .source import Source, local



@dataclass(frozen=True)
class Icon:
    name: str
    size: float
    paint: tuple  # (key, value) pairs for the root element
    inner: str
    css: str = ""  # motion CSS. Inline delivery also puts it in inner as a <style>.

    def file_text(self) -> str:
        """Return the complete SVG file that build writes."""
        size = f"{self.size:g}"
        attrs = [("xmlns", SVG_NS), ("viewBox", f"0 0 {size} {size}"),
                 ("width", size), ("height", size), *self.paint]
        return f"<svg{_attrs(attrs)}>{self.inner}</svg>\n"

    def nested(self, x: float, y: float, px: float, color: str, uid: str = "") -> str:
        """Return the icon as a nested <svg> placed at (x, y) and px wide."""
        size = f"{self.size:g}"
        attrs = [("x", f"{x:g}"), ("y", f"{y:g}"), ("width", f"{px:g}"), ("height", f"{px:g}"),
                 ("viewBox", f"0 0 {size} {size}"), ("color", color), *self.paint]
        inner = self.inner.replace(f"{self.name}-cut", f"{self.name}-cut{uid}") if uid else self.inner
        return f"<svg{_attrs(attrs)}>{inner}</svg>"


def _attrs(pairs) -> str:
    return "".join(f" {k}={quoteattr(str(v))}" for k, v in pairs)


def _fmt(m: tuple) -> str:
    return "matrix(" + " ".join(f"{v:.6g}" for v in m) + ")"


def _geometry(el, cfg: Config) -> list:
    """Return the element attributes to keep, in source order, plus rect rounding."""
    keep = [(k, v) for k, v in el.attrib.items()
            if not k.startswith("data-") and k != "id"]
    if local(el.tag) == "rect" and el.get("rx") is None and el.get("ry") is None and cfg.corner_radius > 0:
        keep.append(("rx", f"{cfg.corner_radius:g}"))
    return keep


def _paint(role: str, cfg: Config) -> list:
    if role != "body" or cfg.kind == "outline":
        return []
    if cfg.kind == "duotone":
        return [("fill", "currentColor"), ("fill-opacity", f"{cfg.tone_opacity:g}")]
    return [("fill", "currentColor")]


@dataclass
class _Ctx:
    """Build state for one icon. Only build_icon creates it."""

    cfg: Config
    name: str
    at: float | None
    curve: tuple
    cuts: list = field(default_factory=list)
    entries: list = field(default_factory=list)


def _motion(el, ctx: _Ctx):
    if local(el.tag) != "g":
        return None
    if ctx.at is None and ctx.cfg.motion_delivery == "off":
        return None
    return motion.from_element(el, ctx.cfg.size, ctx.cfg.motion_duration)


def _emit(el, ctx: _Ctx, matrix: tuple, mover: tuple | None) -> str:
    """Serialise one element. matrix is the transform from this element up to the
    canvas, or up to the moving group named in mover. mover is (class, outer matrix)."""
    tag = local(el.tag)
    own = transform.parse(el.get("transform"))
    moving = _motion(el, ctx)
    if moving is not None and ctx.at is not None:
        moved = moving.matrix(moving.progress(ctx.at, ctx.curve))
        inner = _emit_plain(el, ctx, transform.multiply(transform.multiply(matrix, moved), own), mover)
        if moved == transform.IDENTITY or not inner:
            return inner
        return f'<g transform="{_fmt(moved)}">{inner}</g>'
    if moving is not None:
        cls = f"kim-{ctx.name}-{len(ctx.entries)}"
        ctx.entries.append((cls, moving))
        inner = _emit_plain(el, ctx, own, (cls, matrix))
        return f'<g class="{cls}">{inner}</g>' if inner else ""
    return _emit_plain(el, ctx, transform.multiply(matrix, own), mover)


def _emit_plain(el, ctx: _Ctx, here: tuple, mover: tuple | None) -> str:
    tag = local(el.tag)
    cfg = ctx.cfg
    if tag == "g":
        body = "".join(_emit(child, ctx, here, mover) for child in el)
        attrs = _geometry(el, cfg)
        if not body or not attrs:
            return body
        return f"<g{_attrs(attrs)}>{body}</g>"
    role = el.get("data-role", "line")
    if role == "cut" and cfg.kind == "solid":
        geo = [(k, v) for k, v in _geometry(el, cfg) if k != "transform"]
        shape = f"<{tag}{_attrs(geo + [('transform', _fmt(here))])}/>"
        if mover is not None:
            shape = f'<g transform="{_fmt(mover[1])}"><g class="{mover[0]}">{shape}</g></g>'
        ctx.cuts.append(shape)
        return ""
    return f"<{tag}{_attrs(_geometry(el, cfg) + _paint(role, cfg))}/>"


def build_icon(src: Source, cfg: Config, at: float | None = None) -> Icon:
    """Style one source with cfg and return the icon.

    With at=None the icon is the shipped file, with motion CSS when a group
    moves. With at set to a time in milliseconds after hover starts, every
    moving group is frozen at that moment as a plain transform. Review
    renders use that form, so a renderer never has to read CSS.
    """
    ctx = _Ctx(cfg, src.name, at, motion.parse_easing(cfg.motion_easing))
    body = "".join(_emit(child, ctx, transform.IDENTITY, None) for child in src.children)
    if ctx.cuts:
        mask_id = f"{src.name}-cut"
        size = f"{cfg.size:g}"
        mask = (f'<mask id="{mask_id}" maskUnits="userSpaceOnUse" x="0" y="0" '
                f'width="{size}" height="{size}">'
                f'<rect width="{size}" height="{size}" fill="#fff" stroke="none"/>'
                f'<g stroke="#000">{"".join(ctx.cuts)}</g></mask>')
        body = f'{mask}<g mask="url(#{mask_id})">{body}</g>'
    css = motion.stylesheet(ctx.entries, cfg.motion_easing, cfg.motion_trigger)
    if css and cfg.motion_delivery == "inline":
        body = f"<style>{css}</style>{body}"
    paint = (("fill", "none"), ("stroke", "currentColor"), ("stroke-width", f"{cfg.stroke_width:g}"),
             ("stroke-linecap", cfg.cap), ("stroke-linejoin", cfg.join))
    return Icon(src.name, cfg.size, paint, body, css)
