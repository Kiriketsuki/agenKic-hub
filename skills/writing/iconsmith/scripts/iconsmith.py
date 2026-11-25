#!/usr/bin/env python3
"""iconsmith: design, check and build a custom SVG icon set.

Run 'iconsmith.py <command> --help' for the options of one command.
Exit codes: 0 means clean, 1 means findings or failed checks, 2 means a
usage, style file or renderer error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from iconkit import compose, config, lint, preview, renderer, source, style  # noqa: E402

STARTER = """# Style file for the product icon set. Every icon follows these rules.
# A change to a global rule means a redraw of the whole set.

[product]
note = {note}

[canvas]
size = 24          # viewBox edge, in canvas units
padding = 2        # clear border. Ink stays inside the live area.
grid = 0.5         # anchor points snap to this step

[stroke]
width = 2
cap = "round"      # butt | round | square
join = "round"     # miter | round | bevel
corner_radius = 2  # default rx for <rect>. A drawing rule for paths.
min_gap = 1.5      # clear space between strokes that do not meet

[style]
kind = "outline"   # outline | duotone | solid
tone_opacity = 0.3 # fill strength of body shapes in duotone
detail = "medium"  # low | medium | high. Caps the subpath count per icon.

[output]
sizes = [16, 20, 24]
source_dir = "icons/src"
parts_dir = "icons/parts"
build_dir = "icons/build"

[metaphors]
avoid = []

[lint]
ink_tolerance = 0.25 # allowed drift from the set median ink share
"""


class Fail(Exception):
    """A user-facing error. The message goes to stderr and the exit code is 2."""


def _config(args: argparse.Namespace) -> config.Config:
    path = Path(args.config) if args.config else config.find_config(Path.cwd())
    cfg = config.load(path)
    if getattr(args, "with_", None):
        _, patch = config.parse_override(f"override: {args.with_}")
        cfg = config.with_patch(cfg, patch)
    return cfg


def _load(cfg: config.Config, names: list[str] | None = None) -> tuple[list, dict, list[str]]:
    """Load sources and their shapes. Return (sources, shapes_by_name, errors)."""
    sources, errors = source.load_all(cfg.source_dir, cfg.parts_dir, cfg.size)
    if names:
        missing = sorted(set(names) - {s.name for s in sources})
        errors += [f"no source named '{n}' in {cfg.source_dir}" for n in missing]
        sources = [s for s in sources if s.name in names]
    shapes = {}
    for src in sources:
        shp, errs = source.shapes(src, cfg.corner_radius)
        shapes[src.name] = shp
        errors += errs
    return sources, shapes, errors


def _print_errors(errors: list[str]) -> int:
    for err in errors:
        print(f"error: {err}")
    return 1 if errors else 0


def cmd_init(args: argparse.Namespace) -> int:
    root = Path(args.dir).resolve()
    target = root / config.CONFIG_NAME
    if target.exists() and not args.force:
        raise Fail(f"{target} already exists. Pass --force to replace it.")
    target.write_text(STARTER.format(note=json.dumps(args.note)), encoding="utf-8")
    cfg = config.load(target)
    for folder in (cfg.source_dir, cfg.parts_dir):
        folder.mkdir(parents=True, exist_ok=True)
    print(f"wrote {target}")
    print(f"sources: {cfg.source_dir}\nparts:   {cfg.parts_dir}\nbuild:   {cfg.build_dir}")
    return 0


def cmd_new(args: argparse.Namespace) -> int:
    cfg = _config(args)
    folder = cfg.parts_dir if args.part else cfg.source_dir
    if not source.NAME_RE.match(args.name):
        raise Fail(f"'{args.name}' is not kebab-case, for example 'arrow-left'")
    target = folder / f"{args.name}.svg"
    if target.exists():
        raise Fail(f"{target} already exists")
    folder.mkdir(parents=True, exist_ok=True)
    target.write_text(source.blank_source(cfg.size, args.metaphor), encoding="utf-8")
    print(f"wrote {target}")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    cfg = _config(args)
    sources, _, errors = _load(cfg)
    print(f"style file ok: {cfg.kind}, stroke {cfg.stroke_width:g}, canvas {cfg.size:g}, "
          f"sizes {list(cfg.sizes)}")
    print(f"{len(sources)} source(s) read from {cfg.source_dir}")
    return _print_errors(errors)


def _lint_all(cfg: config.Config, sources: list, shapes: dict) -> tuple[list, dict]:
    findings = []
    ratios = {}
    for src in sources:
        findings += lint.lint_icon(src, shapes[src.name], cfg)
        ratios[src.name] = lint.ink_ratio(shapes[src.name], cfg)
    findings += lint.check_ink(ratios, {s.name: s for s in sources}, cfg)
    return findings, ratios


def cmd_lint(args: argparse.Namespace) -> int:
    cfg = _config(args)
    sources, shapes, errors = _load(cfg)
    if errors:
        return _print_errors(errors)
    findings, ratios = _lint_all(cfg, sources, shapes)
    if args.names:
        findings = [f for f in findings if f.icon in args.names]
    if args.json:
        rows = [f.__dict__ for f in findings]
        print(json.dumps({"findings": rows, "ink": ratios}, indent=2))
    else:
        for f in sorted(findings, key=lambda f: (f.icon, f.rule)):
            mark = "waived" if f.waived else f.severity
            print(f"{f.icon:<20} {mark:<6} {f.rule:<9} {f.message}")
        print("ink: " + ", ".join(f"{n} {r:.0%}" for n, r in sorted(ratios.items())))
    live = [f for f in findings if not f.waived]
    errors_n = sum(f.severity == lint.ERROR for f in live)
    print(f"{len(sources)} icon(s), {errors_n} error(s), {len(live) - errors_n} warning(s), "
          f"{len(findings) - len(live)} waived")
    return 1 if errors_n else 0


def cmd_render(args: argparse.Namespace) -> int:
    cfg = _config(args)
    sources, shapes, errors = _load(cfg, args.names)
    if errors:
        return _print_errors(errors)
    out = renderer.cache_dir(cfg.root) / "render"
    for src in sources:
        icon = style.build_icon(src, cfg)
        svg = compose.icon_panel(icon, shapes[src.name], cfg, src.metaphor)
        print(renderer.render(svg, out / f"{src.name}.png"))
    return 0


def cmd_sheet(args: argparse.Namespace) -> int:
    cfg = _config(args)
    sources, _, errors = _load(cfg, args.names)
    if errors:
        return _print_errors(errors)
    if not sources:
        raise Fail(f"no sources in {cfg.source_dir}")
    icons = [style.build_icon(s, cfg) for s in sources]
    out = renderer.cache_dir(cfg.root) / "sheet"
    tag = f"-{cfg.kind}"
    print(renderer.render(compose.contact_sheet(icons, cfg), out / f"sheet{tag}.png"))
    print(renderer.render(compose.contact_sheet(icons, cfg, blur=True), out / f"sheet{tag}-blur.png"))
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    cfg = _config(args)
    sources, _, errors = _load(cfg)
    if errors:
        return _print_errors(errors)
    wanted = {f"{s.name}.svg": style.build_icon(s, cfg).file_text() for s in sources}
    stale = sorted(p.name for p in cfg.build_dir.glob("*.svg") if p.name not in wanted) \
        if cfg.build_dir.is_dir() else []
    changed = [n for n, text in wanted.items()
               if not (cfg.build_dir / n).is_file() or (cfg.build_dir / n).read_text(encoding="utf-8") != text]
    if args.check:
        for name in changed:
            print(f"out of date: {cfg.build_dir / name}")
        return 1 if changed else 0
    cfg.build_dir.mkdir(parents=True, exist_ok=True)
    for name in changed:
        (cfg.build_dir / name).write_text(wanted[name], encoding="utf-8")
    print(f"built {len(wanted)} icon(s) into {cfg.build_dir}, {len(changed)} changed")
    for name in stale:
        print(f"warning: {cfg.build_dir / name} has no source. Remove it if the icon is gone.")
    return 0


def cmd_preview(args: argparse.Namespace) -> int:
    base = _config(args)
    snippet_path = Path(args.snippet)
    if not snippet_path.is_file():
        raise Fail(f"snippet {snippet_path} does not exist")
    snippet = snippet_path.read_text(encoding="utf-8")
    names = preview.placeholders(snippet)
    if not names:
        raise Fail("the snippet has no {{icon:name}} placeholders")
    specs = [config.parse_override(o) for o in args.option] or [("Current", {})]
    panels = []
    for label, patch in specs:
        cfg = config.with_patch(base, patch)
        sources, _, errors = _load(cfg, names)
        if errors:
            return _print_errors([f"option '{label}': {e}" for e in errors])
        icons = {s.name: style.build_icon(s, cfg) for s in sources}
        summary = (f"{cfg.kind}, stroke {cfg.stroke_width:g}, cap {cfg.cap}, join {cfg.join}, "
                   f"source {cfg.source_dir.name}")
        panels.append((label, summary, preview.fill(snippet, icons, cfg.sizes[0])))
    out = renderer.cache_dir(base.root) / "preview.html"
    out.write_text(preview.page(args.title, panels), encoding="utf-8")
    print(out)
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    cfg = _config(args)
    sources, shapes, errors = _load(cfg)
    if errors:
        return _print_errors(errors)
    findings, _ = _lint_all(cfg, sources, shapes)
    for src in sources:
        built = (cfg.build_dir / f"{src.name}.svg").is_file()
        print(f"{src.name:<20} {'built' if built else 'not built':<10} {src.metaphor or '(no metaphor)'}")
        for f in (f for f in findings if f.icon == src.name and f.waived):
            print(f"{'':<20} waived {f.rule}: {src.waive_why or 'no reason recorded'}")
    print(f"sources: {cfg.source_dir}\nparts:   {cfg.parts_dir}\nbuild:   {cfg.build_dir}")
    return 0


def parser() -> argparse.ArgumentParser:
    top = argparse.ArgumentParser(prog="iconsmith", description=__doc__.split("\n")[0])
    top.add_argument("--config", help="path to icons.toml. Default: search up from the current folder.")
    sub = top.add_subparsers(dest="command", required=True)

    def add(name, func, text, override=True):
        p = sub.add_parser(name, help=text, description=text)
        p.set_defaults(func=func)
        if override:
            p.add_argument("--with", dest="with_", metavar="SETTINGS",
                           help="override style keys for this run, for example 'style.kind=solid, stroke.width=1.5'")
        return p

    p = add("init", cmd_init, "write a starter icons.toml and make the source folders", override=False)
    p.add_argument("--dir", default=".", help="project root. Default: current folder.")
    p.add_argument("--note", required=True, help="one line about the product")
    p.add_argument("--force", action="store_true", help="replace an existing icons.toml")
    p = add("new", cmd_new, "write an empty source file, or a part with --part")
    p.add_argument("name")
    p.add_argument("--metaphor", default="", help="the object the icon shows")
    p.add_argument("--part", action="store_true", help="write into the parts folder")
    add("validate", cmd_validate, "check the style file and that every source parses")
    p = add("lint", cmd_lint, "check geometry: padding, grid, gaps, detail, metaphor, ink weight")
    p.add_argument("names", nargs="*", help="limit the report to these icons")
    p.add_argument("--json", action="store_true", help="print findings as JSON")
    p = add("render", cmd_render, "render icons large with grid and at real sizes, to PNG")
    p.add_argument("names", nargs="+")
    p = add("sheet", cmd_sheet, "render the set side by side at real sizes, plus a blurred copy")
    p.add_argument("names", nargs="*", help="limit the sheet to these icons")
    p = add("build", cmd_build, "write styled SVGs that use currentColor into the build folder")
    p.add_argument("--check", action="store_true", help="only report built files that are out of date")
    p = add("preview", cmd_preview, "show style options inside a product UI snippet, as HTML")
    p.add_argument("snippet", help="HTML file with {{icon:name}} or {{icon:name:px}} placeholders")
    p.add_argument("--option", action="append", default=[],
                   help="'Label: section.key=value, ...'. Repeat for 2 to 4 options.")
    p.add_argument("--title", default="Icon style options")
    add("report", cmd_report, "list icons, metaphors, build state and waivers for the final report")
    return top


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return args.func(args)
    except (Fail, config.ConfigError, renderer.RenderError) as exc:
        print(f"iconsmith: {exc}", file=sys.stderr)
        return 2
    except KeyError as exc:
        print(f"iconsmith: the snippet asks for icon {exc}, which has no source", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
