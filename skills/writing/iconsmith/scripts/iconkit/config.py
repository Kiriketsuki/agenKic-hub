"""Load and check the icons.toml style file.

The loader rejects unknown keys. A typo such as "stroke.widht" must fail
loudly, because a silent default would change every icon in the set.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_NAME = "icons.toml"
CAPS = ("butt", "round", "square")
JOINS = ("miter", "round", "bevel")
KINDS = ("outline", "duotone", "solid")
DETAIL_LIMITS = {"low": 6, "medium": 10, "high": 16}

# Each entry: section -> key -> (type, default). A default of None means required.
SCHEMA = {
    "product": {"note": (str, None)},
    "canvas": {"size": (float, 24.0), "padding": (float, 2.0), "grid": (float, 0.5)},
    "stroke": {
        "width": (float, 2.0),
        "cap": (str, "round"),
        "join": (str, "round"),
        "corner_radius": (float, 2.0),
        "min_gap": (float, 1.5),
    },
    "style": {"kind": (str, "outline"), "tone_opacity": (float, 0.3), "detail": (str, "medium")},
    "output": {
        "sizes": (list, [16, 20, 24]),
        "source_dir": (str, "icons/src"),
        "parts_dir": (str, "icons/parts"),
        "build_dir": (str, "icons/build"),
    },
    "metaphors": {"avoid": (list, [])},
    "lint": {"ink_tolerance": (float, 0.25)},
}


class ConfigError(ValueError):
    """The style file is missing, unreadable, or breaks a rule."""


@dataclass(frozen=True)
class Config:
    root: Path
    note: str
    size: float
    padding: float
    grid: float
    stroke_width: float
    cap: str
    join: str
    corner_radius: float
    min_gap: float
    kind: str
    tone_opacity: float
    detail: str
    sizes: tuple[int, ...]
    source_dir: Path
    parts_dir: Path
    build_dir: Path
    avoid: tuple[str, ...]
    ink_tolerance: float
    raw: dict = field(repr=False, compare=False, default_factory=dict)

    @property
    def detail_limit(self) -> int:
        return DETAIL_LIMITS[self.detail]


def find_config(start: Path) -> Path:
    """Walk up from start until a directory holds icons.toml."""
    here = start.resolve()
    for folder in (here, *here.parents):
        candidate = folder / CONFIG_NAME
        if candidate.is_file():
            return candidate
    raise ConfigError(f"no {CONFIG_NAME} found in {here} or any parent folder. Run 'init' first.")


def _coerce(section: str, key: str, value, kind: type):
    label = f"{section}.{key}"
    if kind is float and isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, kind) and not isinstance(value, bool):
        return value
    raise ConfigError(f"{label} must be a {kind.__name__}, not {type(value).__name__}")


def _merge(data: dict) -> dict:
    """Return a full section map with defaults filled in. Unknown keys raise."""
    unknown = sorted(set(data) - set(SCHEMA))
    if unknown:
        raise ConfigError(f"unknown section(s) in {CONFIG_NAME}: {', '.join(unknown)}")
    merged = {}
    for section, keys in SCHEMA.items():
        given = data.get(section, {})
        if not isinstance(given, dict):
            raise ConfigError(f"[{section}] must be a table")
        extra = sorted(set(given) - set(keys))
        if extra:
            names = ", ".join(f"{section}.{k}" for k in extra)
            raise ConfigError(f"unknown key(s): {names}")
        values = {}
        for key, (kind, default) in keys.items():
            if key not in given and default is None:
                raise ConfigError(f"{section}.{key} is required")
            raw = given.get(key, default)
            values[key] = _coerce(section, key, raw, kind)
        merged[section] = values
    return merged


def _check(m: dict) -> None:
    canvas, stroke, style, output = m["canvas"], m["stroke"], m["style"], m["output"]
    if not m["product"]["note"].strip():
        raise ConfigError("product.note must not be empty. One line about the product is enough.")
    if canvas["size"] <= 0 or canvas["grid"] <= 0:
        raise ConfigError("canvas.size and canvas.grid must be greater than 0")
    if not 0 <= canvas["padding"] < canvas["size"] / 2:
        raise ConfigError("canvas.padding must be at least 0 and less than half of canvas.size")
    if stroke["width"] <= 0 or stroke["min_gap"] < 0 or stroke["corner_radius"] < 0:
        raise ConfigError("stroke.width must be greater than 0. min_gap and corner_radius must be 0 or more.")
    choices = (("stroke.cap", stroke["cap"], CAPS), ("stroke.join", stroke["join"], JOINS),
               ("style.kind", style["kind"], KINDS), ("style.detail", style["detail"], tuple(DETAIL_LIMITS)))
    for label, value, allowed in choices:
        if value not in allowed:
            raise ConfigError(f"{label} is '{value}'. Use one of: {', '.join(allowed)}")
    if not 0 < style["tone_opacity"] <= 1:
        raise ConfigError("style.tone_opacity must be greater than 0 and at most 1")
    sizes = output["sizes"]
    if not sizes or not all(isinstance(s, int) and not isinstance(s, bool) and s > 0 for s in sizes):
        raise ConfigError("output.sizes must be a non-empty list of positive whole pixel sizes")
    if not all(isinstance(a, str) for a in m["metaphors"]["avoid"]):
        raise ConfigError("metaphors.avoid must be a list of strings")


def from_dict(data: dict, root: Path) -> Config:
    """Build a Config from parsed TOML data. Paths resolve against root."""
    m = _merge(data)
    _check(m)
    out = m["output"]
    return Config(
        root=root,
        note=m["product"]["note"].strip(),
        size=m["canvas"]["size"],
        padding=m["canvas"]["padding"],
        grid=m["canvas"]["grid"],
        stroke_width=m["stroke"]["width"],
        cap=m["stroke"]["cap"],
        join=m["stroke"]["join"],
        corner_radius=m["stroke"]["corner_radius"],
        min_gap=m["stroke"]["min_gap"],
        kind=m["style"]["kind"],
        tone_opacity=m["style"]["tone_opacity"],
        detail=m["style"]["detail"],
        sizes=tuple(out["sizes"]),
        source_dir=root / out["source_dir"],
        parts_dir=root / out["parts_dir"],
        build_dir=root / out["build_dir"],
        avoid=tuple(m["metaphors"]["avoid"]),
        ink_tolerance=m["lint"]["ink_tolerance"],
        raw=data,
    )


def load(path: Path) -> Config:
    """Read icons.toml at path and return a checked Config."""
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ConfigError(f"{path} does not exist") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{path} is not valid TOML: {exc}") from exc
    return from_dict(data, path.parent.resolve())


def parse_override(text: str) -> tuple[str, dict]:
    """Parse 'Label: section.key=value, section.key=value' into a label and a patch.

    Values use TOML syntax. A bare word that TOML cannot read becomes a string.
    """
    label, sep, body = text.partition(":")
    if not sep or not label.strip():
        raise ConfigError(f"option '{text}' needs the form 'Label: section.key=value, ...'")
    patch: dict = {}
    for item in filter(None, (part.strip() for part in body.split(","))):
        dotted, eq, value = item.partition("=")
        section, dot, key = dotted.strip().partition(".")
        if not eq or not dot:
            raise ConfigError(f"option item '{item}' needs the form section.key=value")
        try:
            parsed = tomllib.loads(f"v = {value.strip()}")["v"]
        except tomllib.TOMLDecodeError:
            parsed = value.strip()
        patch = {**patch, section: {**patch.get(section, {}), key: parsed}}
    return label.strip(), patch


def with_patch(cfg: Config, patch: dict) -> Config:
    """Return a new Config with patch merged over the original style file data."""
    data = {sec: dict(vals) for sec, vals in cfg.raw.items()}
    for section, values in patch.items():
        data = {**data, section: {**data.get(section, {}), **values}}
    return from_dict(data, cfg.root)
