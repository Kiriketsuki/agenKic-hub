"""Read geometry-only source SVGs and shared parts.

A source holds centrelines and shapes, never paint. The loader expands
each <use data-part="name"> into a group that holds the part geometry, so
lint and build see one plain tree. The loader never edits a parsed tree in
place. It builds new elements instead.
"""

from __future__ import annotations

import re
from xml.sax.saxutils import quoteattr
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from . import SVG_NS, pathdata, transform

NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DRAW_TAGS = {"path", "line", "polyline", "polygon", "circle", "ellipse", "rect"}
META_TAGS = {"title", "desc"}
GEOMETRY = {
    "path": {"d"},
    "line": {"x1", "y1", "x2", "y2"},
    "polyline": {"points"},
    "polygon": {"points"},
    "circle": {"cx", "cy", "r"},
    "ellipse": {"cx", "cy", "rx", "ry"},
    "rect": {"x", "y", "width", "height", "rx", "ry"},
    "g": set(),
    "use": {"data-part"},
}
COMMON = {"id", "transform", "data-role"}
ROOT_ATTRS = {"viewBox", "data-metaphor", "data-waive", "data-waive-why", "data-note",
              "width", "height", "version"}
ROLES = {"line", "body", "cut"}
MAX_PART_DEPTH = 4


@dataclass(frozen=True)
class Shape:
    """One drawing element after part expansion, with its full transform."""

    label: str
    role: str
    matrix: tuple
    subpaths: tuple

    @property
    def translate_only(self) -> bool:
        return transform.is_translate_only(self.matrix)

    def polylines(self, step: float = 0.25) -> list[tuple[list, bool]]:
        """Return (points, closed) for each subpath, in canvas coordinates."""
        return [([transform.apply(self.matrix, p) for p in pathdata.sample(sub, step)], sub.closed)
                for sub in self.subpaths]

    def anchors(self) -> list:
        return [transform.apply(self.matrix, p) for sub in self.subpaths for p in sub.anchors()]


@dataclass(frozen=True)
class Source:
    name: str
    path: Path
    metaphor: str
    waive: frozenset
    waive_why: str
    view_box: tuple
    children: tuple  # expanded ET elements, namespace stripped


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _num(el: ET.Element, key: str, default: float = 0.0) -> float:
    raw = el.get(key)
    if raw is None:
        return default
    try:
        return float(raw.replace("px", ""))
    except ValueError as exc:
        raise ValueError(f"<{local(el.tag)}> {key}='{raw}' is not a number") from exc


def _points_d(text: str, close: bool) -> str:
    nums = [float(n) for n in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", text or "")]
    if len(nums) < 4 or len(nums) % 2:
        raise ValueError("points must hold an even count of numbers, at least two points")
    pairs = [f"{nums[i]} {nums[i + 1]}" for i in range(0, len(nums), 2)]
    return "M" + " L".join(pairs) + (" Z" if close else "")


def _ellipse_d(cx: float, cy: float, rx: float, ry: float) -> str:
    return (f"M{cx - rx} {cy} A{rx} {ry} 0 1 0 {cx + rx} {cy} "
            f"A{rx} {ry} 0 1 0 {cx - rx} {cy} Z")


def _rect_d(el: ET.Element, default_r: float) -> str:
    x, y, w, h = (_num(el, k) for k in ("x", "y", "width", "height"))
    rx = _num(el, "rx", _num(el, "ry", default_r))
    ry = _num(el, "ry", rx)
    rx, ry = min(rx, w / 2), min(ry, h / 2)
    if rx <= 0 or ry <= 0:
        return f"M{x} {y} H{x + w} V{y + h} H{x} Z"
    return (f"M{x + rx} {y} H{x + w - rx} A{rx} {ry} 0 0 1 {x + w} {y + ry} "
            f"V{y + h - ry} A{rx} {ry} 0 0 1 {x + w - rx} {y + h} H{x + rx} "
            f"A{rx} {ry} 0 0 1 {x} {y + h - ry} V{y + ry} A{rx} {ry} 0 0 1 {x + rx} {y} Z")


def element_d(el: ET.Element, default_r: float) -> str:
    """Return path data that traces one drawing element."""
    tag = local(el.tag)
    if tag == "path":
        return el.get("d", "")
    if tag == "line":
        return f"M{_num(el, 'x1')} {_num(el, 'y1')} L{_num(el, 'x2')} {_num(el, 'y2')}"
    if tag in ("polyline", "polygon"):
        return _points_d(el.get("points", ""), tag == "polygon")
    if tag == "circle":
        r = _num(el, "r")
        return _ellipse_d(_num(el, "cx"), _num(el, "cy"), r, r)
    if tag == "ellipse":
        return _ellipse_d(_num(el, "cx"), _num(el, "cy"), _num(el, "rx"), _num(el, "ry"))
    return _rect_d(el, default_r)


def _check_attrs(el: ET.Element, where: str) -> list[str]:
    tag = local(el.tag)
    errors = []
    allowed = GEOMETRY.get(tag, set()) | COMMON
    for key in el.attrib:
        name = local(key)
        if name not in allowed:
            errors.append(f"{where}: <{tag}> has '{name}'. Sources hold geometry only. "
                          "Build applies paint and stroke from icons.toml.")
    role = el.get("data-role", "line")
    if role not in ROLES:
        errors.append(f"{where}: data-role='{role}' is not one of {', '.join(sorted(ROLES))}")
    return errors


def _load_part(parts_dir: Path, name: str, cache: dict) -> tuple[ET.Element, list[str]]:
    if name in cache:
        return cache[name], []
    path = parts_dir / f"{name}.svg"
    if not NAME_RE.match(name) or not path.is_file():
        return None, [f"part '{name}' not found at {path}"]
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        return None, [f"part {path.name}: XML error: {exc}"]
    cache[name] = root
    return root, []


def _expand(el: ET.Element, parts_dir: Path, cache: dict, where: str, depth: int):
    """Return (new_element_or_None, errors). Never edits el."""
    tag = local(el.tag)
    if tag in META_TAGS:
        return None, []
    if tag not in DRAW_TAGS | {"g", "use"}:
        return None, [f"{where}: <{tag}> is not allowed in a source"]
    errors = _check_attrs(el, where)
    if tag == "use":
        name = el.get("data-part", "")
        if depth >= MAX_PART_DEPTH:
            return None, errors + [f"{where}: parts nest deeper than {MAX_PART_DEPTH} levels"]
        part, perr = _load_part(parts_dir, name, cache)
        if part is None:
            return None, errors + [f"{where}: {e}" for e in perr]
        group = ET.Element("g", {k: v for k, v in el.attrib.items() if k == "transform"})
        group.set("data-part", name)
        kids, kerr = _expand_children(part, parts_dir, cache, f"{where} > part {name}", depth + 1)
        group.extend(kids)
        return group, errors + kerr
    copy = ET.Element(tag, {local(k): v for k, v in el.attrib.items()})
    if tag == "g":
        kids, kerr = _expand_children(el, parts_dir, cache, where, depth)
        copy.extend(kids)
        errors = errors + kerr
    return copy, errors


def _expand_children(parent, parts_dir, cache, where, depth):
    out, errors = [], []
    for index, child in enumerate(parent):
        new, errs = _expand(child, parts_dir, cache, f"{where} > {local(child.tag)}[{index}]", depth)
        errors.extend(errs)
        if new is not None:
            out.append(new)
    return out, errors


def _view_box(root: ET.Element) -> tuple:
    raw = root.get("viewBox", "")
    nums = tuple(float(n) for n in raw.replace(",", " ").split()) if raw else ()
    return nums


def load_source(path: Path, parts_dir: Path, size: float, cache: dict) -> tuple[Source | None, list[str]]:
    """Load one source file. Return (source, errors). Source is None on a fatal error."""
    name = path.stem
    if not NAME_RE.match(name):
        return None, [f"{path.name}: file name must be kebab-case, for example 'arrow-left.svg'"]
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        return None, [f"{path.name}: XML error: {exc}"]
    if local(root.tag) != "svg":
        return None, [f"{path.name}: the root element must be <svg>"]
    errors = [f"{path.name}: root has '{local(k)}'. Sources hold geometry only."
              for k in root.attrib if local(k) not in ROOT_ATTRS]
    try:
        view_box = _view_box(root)
    except ValueError:
        view_box = ()
    if view_box != (0.0, 0.0, size, size):
        errors.append(f"{path.name}: viewBox must be '0 0 {size:g} {size:g}' to match canvas.size")
    kids, kerr = _expand_children(root, parts_dir, cache, path.name, 0)
    waive = frozenset(w.strip() for w in root.get("data-waive", "").replace(",", " ").split() if w.strip())
    source = Source(name, path, root.get("data-metaphor", "").strip(), waive,
                    root.get("data-waive-why", "").strip(), view_box, tuple(kids))
    return source, errors + kerr


def load_all(source_dir: Path, parts_dir: Path, size: float) -> tuple[list[Source], list[str]]:
    """Load every *.svg in source_dir, sorted by name."""
    if not source_dir.is_dir():
        return [], [f"source folder {source_dir} does not exist"]
    cache: dict = {}
    sources, errors = [], []
    for path in sorted(source_dir.glob("*.svg")):
        src, errs = load_source(path, parts_dir, size, cache)
        errors.extend(errs)
        if src is not None:
            sources.append(src)
    return sources, errors


def shapes(src: Source, default_r: float) -> tuple[list[Shape], list[str]]:
    """Flatten a source into shapes with absolute transforms."""
    out, errors = [], []

    def walk(el, matrix, trail):
        tag = local(el.tag)
        try:
            here = transform.multiply(matrix, transform.parse(el.get("transform")))
        except ValueError as exc:
            errors.append(f"{src.name} {trail}: {exc}")
            return
        if tag == "g":
            label = f"{trail} part {el.get('data-part')}" if el.get("data-part") else trail
            for i, child in enumerate(el):
                walk(child, here, f"{label} > {local(child.tag)}[{i}]")
            return
        try:
            subs = tuple(pathdata.parse(element_d(el, default_r)))
        except ValueError as exc:
            errors.append(f"{src.name} {trail}: {exc}")
            return
        out.append(Shape(trail, el.get("data-role", "line"), here, subs))

    for index, child in enumerate(src.children):
        walk(child, transform.IDENTITY, f"{local(child.tag)}[{index}]")
    return out, errors


def blank_source(size: float, metaphor: str) -> str:
    """Return the text of a new, empty source file."""
    return (f'<svg xmlns="{SVG_NS}" viewBox="0 0 {size:g} {size:g}"\n'
            f'     data-metaphor={quoteattr(metaphor)}>\n'
            f'  <!-- Draw centrelines here. No stroke, fill or style attributes. -->\n'
            f'</svg>\n')
