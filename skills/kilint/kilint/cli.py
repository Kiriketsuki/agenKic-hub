"""Command line entry point: argument parsing, orchestration, exit codes."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from . import (MARKDOWN_EXTENSIONS, TEXT_EXTENSIONS, __version__, kind_for,
               lint_path, lint_text)
from . import config as config_module
from . import report as report_module
from .config import ConfigError
from .rules import RULES
from .source import SOURCE_EXTENSIONS, SourceError

WALKABLE = MARKDOWN_EXTENSIONS | TEXT_EXTENSIONS | SOURCE_EXTENSIONS
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".mypy_cache"}

USAGE_ERROR = 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kilint",
        description="Anti-slop prose linter. Checks the form of prose, never the substance.",
    )
    parser.add_argument("paths", nargs="*", metavar="PATHS",
                        help="files or directories. With no paths, read stdin as markdown.")
    parser.add_argument("--profile", help="force a profile, ignoring path routing")
    parser.add_argument("--config", help="path to a config file")
    parser.add_argument("--as", dest="as_kind", default="auto",
                        choices=["markdown", "text", "source", "auto"],
                        help="how to read the input (default auto, by extension)")
    parser.add_argument("--select", help="comma-separated rule ids to run exclusively")
    parser.add_argument("--ignore", help="comma-separated rule ids to drop")
    parser.add_argument("--explain", metavar="ID", help="print a rule's rationale and exit")
    parser.add_argument("--list-rules", action="store_true", help="print the registry and exit")
    parser.add_argument("--format", default="table",
                        choices=["table", "json", "github", "summary"])
    parser.add_argument("--delta", nargs=2, metavar=("OLD", "NEW"),
                        help="score two files and report the change")
    parser.add_argument("--baseline", metavar="REF",
                        help="compare each path against its content at a git ref")
    parser.add_argument("--fail-over", type=float, dest="fail_over",
                        help="override the failure threshold")
    parser.add_argument("--no-fail", action="store_true", help="always exit 0")
    parser.add_argument("--quiet", action="store_true", help="only the summary line")
    parser.add_argument("--version", action="version", version=f"kilint {__version__}")
    return parser


def _ids(value: str | None) -> set[str] | None:
    if not value:
        return None
    return {part.strip().upper() for part in value.split(",") if part.strip()}


def collect(paths: list[str]) -> list[Path]:
    """Expand directories into lintable files, pruning noisy directories."""
    found: list[Path] = []
    for entry in paths:
        target = Path(entry)
        if not target.is_dir():
            found.append(target)
            continue
        for directory, subdirs, files in os.walk(target):
            subdirs[:] = sorted(d for d in subdirs if d not in SKIP_DIRS and not d.startswith("."))
            for name in sorted(files):
                if Path(name).suffix.lower() in WALKABLE:
                    found.append(Path(directory) / name)
    return found


def _git_show(ref: str, path: Path) -> str:
    repo = path.resolve().parent
    result = subprocess.run(
        ["git", "-C", str(repo), "show", f"{ref}:./{path.name}"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise SourceError(f"cannot read {path} at ref {ref}: {result.stderr.strip()}")
    return result.stdout


def _apply_overrides(cfg: config_module.Config, fail_over: float | None) -> config_module.Config:
    if fail_over is not None:
        cfg.data = dict(cfg.data)
        cfg.data["fail_over"] = fail_over
    return cfg


def _lint_one(path: Path, args, warn: list[str]):
    cfg = _apply_overrides(config_module.load(path, args.config), args.fail_over)
    return lint_path(path, cfg=cfg, profile=args.profile, kind=args.as_kind,
                     select=_ids(args.select), ignore=_ids(args.ignore), warn=warn)


def _run_delta(args, warn: list[str]) -> int:
    old_path, new_path = Path(args.delta[0]), Path(args.delta[1])
    before = _lint_one(old_path, args, warn)
    after = _lint_one(new_path, args, warn)
    print(report_module.render_delta(before, after, args.format, __version__))
    return 0


def _run_baseline(args, targets: list[Path], warn: list[str]) -> int:
    for path in targets:
        cfg = _apply_overrides(config_module.load(path, args.config), args.fail_over)
        old_raw = _git_show(args.baseline, path)
        before = lint_text(old_raw, path=path, cfg=cfg, profile=args.profile,
                           kind=args.as_kind, select=_ids(args.select),
                           ignore=_ids(args.ignore), warn=warn)
        after = _lint_one(path, args, warn)
        print(f"{path}")
        print(report_module.render_delta(before, after, args.format, __version__))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    warn: list[str] = []

    if args.list_rules:
        print(report_module.render_rules())
        return 0
    if args.explain:
        text = report_module.render_explain(args.explain)
        if text.startswith("unknown rule"):
            print(text, file=sys.stderr)
            return USAGE_ERROR
        print(text)
        return 0

    try:
        if args.delta:
            return _run_delta(args, warn)

        results = []
        if not args.paths:
            raw = sys.stdin.read()
            cfg = _apply_overrides(config_module.load(None, args.config), args.fail_over)
            kind = args.as_kind if args.as_kind != "auto" else "markdown"
            results.append(lint_text(raw, path=None, cfg=cfg, profile=args.profile,
                                     kind=kind, select=_ids(args.select),
                                     ignore=_ids(args.ignore), warn=warn))
        else:
            targets = collect(args.paths)
            for path in targets:
                if not path.is_file():
                    print(f"kilint: cannot read {path}", file=sys.stderr)
                    return USAGE_ERROR
                kind_for(path, args.as_kind)
            if args.baseline:
                return _run_baseline(args, targets, warn)
            for path in targets:
                results.append(_lint_one(path, args, warn))
    except (ConfigError, SourceError) as exc:
        print(f"kilint: {exc}", file=sys.stderr)
        return USAGE_ERROR
    except OSError as exc:
        print(f"kilint: {exc}", file=sys.stderr)
        return USAGE_ERROR

    for message in warn:
        print(message, file=sys.stderr)

    summary = report_module.summarize(results, args.fail_over)
    color = report_module.use_color()
    output = report_module.render(results, summary, args.format, __version__,
                                  color=color, quiet=args.quiet)
    if output:
        print(output)
    if args.no_fail:
        return 0
    return 0 if summary.passed else 1


if __name__ == "__main__":
    sys.exit(main())
