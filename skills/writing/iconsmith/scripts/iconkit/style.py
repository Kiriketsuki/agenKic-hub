"""Apply the icons.toml style to a source and produce the shipped SVG.

The built SVG paints with currentColor, so the icon takes the text colour
of the element that holds it. Roles decide how a shape paints:

- line: a stroke in every style.
- body: a stroke in outline, a stroke over a tinted fill in duotone, and a
  filled shape in solid.
- cut: a stroke in outline and duotone. In solid it knocks a line out of the
  filled bodies through a mask, so detail stays visible on a solid shape.
"""

from __future__ import annotations

from dataclasses import dataclass
from xml.sax.saxutils import quoteattr

from . import SVG_NS, transform
from .config import Config
from .source import Source, local



@dataclass(frozen=True)
class Icon:
    name: str
    size: float
    paint: tuple  # (key, value) pairs for the root element
    inner: str

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


def _emit(el, cfg: Config, matrix: tuple, cuts: list) -> str:
    """Serialise one element. In solid style, collect cut shapes into cuts."""
    tag = local(el.tag)
    here = transform.multiply(matrix, transform.parse(el.get("transform")))
    if tag == "g":
        body = "".join(_emit(child, cfg, here, cuts) for child in el)
        attrs = _geometry(el, cfg)
        if not body or not attrs:
            return body
        return f"<g{_attrs(attrs)}>{body}</g>"
    role = el.get("data-role", "line")
    if role == "cut" and cfg.kind == "solid":
        geo = [(k, v) for k, v in _geometry(el, cfg) if k != "transform"]
        cuts.append(f"<{tag}{_attrs(geo + [('transform', _fmt(here))])}/>")
        return ""
    return f"<{tag}{_attrs(_geometry(el, cfg) + _paint(role, cfg))}/>"


def build_icon(src: Source, cfg: Config) -> Icon:
    """Style one source with cfg and return the icon."""
    cuts: list = []
    body = "".join(_emit(child, cfg, transform.IDENTITY, cuts) for child in src.children)
    if cuts:
        mask_id = f"{src.name}-cut"
        size = f"{cfg.size:g}"
        mask = (f'<mask id="{mask_id}" maskUnits="userSpaceOnUse" x="0" y="0" '
                f'width="{size}" height="{size}">'
                f'<rect width="{size}" height="{size}" fill="#fff" stroke="none"/>'
                f'<g stroke="#000">{"".join(cuts)}</g></mask>')
        body = f'{mask}<g mask="url(#{mask_id})">{body}</g>'
    paint = (("fill", "none"), ("stroke", "currentColor"), ("stroke-width", f"{cfg.stroke_width:g}"),
             ("stroke-linecap", cfg.cap), ("stroke-linejoin", cfg.join))
    return Icon(src.name, cfg.size, paint, body)
