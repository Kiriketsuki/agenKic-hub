"""kilint - a configurable anti-slop prose linter.

kilint checks the form of prose. It cannot judge whether the text is true or
useful. It never mutates the text it reads.
"""

from __future__ import annotations

import sys
from pathlib import Path

from . import config as _config
from . import rules as _rules
from . import source as _source
from . import text as _text
from .config import Config, ConfigError, Resolved
from .rules import RULES, FileResult, Rule, Violation

__version__ = "1.0.0"

__all__ = [
    "__version__", "lint_text", "lint_path", "Violation", "FileResult", "Rule",
    "RULES", "Config", "ConfigError", "Resolved", "MARKDOWN_EXTENSIONS",
    "TEXT_EXTENSIONS", "kind_for",
]

MARKDOWN_EXTENSIONS = {".md", ".markdown", ".mdx"}
TEXT_EXTENSIONS = {".txt", ".text"}


def kind_for(path: Path | None, override: str = "auto") -> str:
    """Decide how to read a file: markdown, text, or source."""
    if override and override != "auto":
        return override
    if path is None:
        return "markdown"
    extension = path.suffix.lower()
    if extension in MARKDOWN_EXTENSIONS:
        return "markdown"
    if extension in TEXT_EXTENSIONS:
        return "text"
    if _source.is_source_extension(extension):
        return "source"
    raise _source.SourceError(
        f"unknown extension '{extension or path.name}': pass --as markdown, text, or source"
    )


def lint_text(
    raw: str,
    path: str | Path | None = None,
    cfg: Config | None = None,
    profile: str | None = None,
    kind: str = "auto",
    select: set[str] | None = None,
    ignore: set[str] | None = None,
    warn: list[str] | None = None,
) -> FileResult:
    """Lint a string and return a FileResult. Never mutates the input."""
    target = Path(path) if path is not None else None
    cfg = cfg or _config.load(target)
    display = str(path) if path is not None else "<stdin>"
    resolved_kind = kind if kind != "auto" else kind_for(target, "auto")

    comment_spans = None
    if resolved_kind == "source":
        extension = target.suffix.lower() if target is not None else ".py"
        comment_spans = _source.extract(raw, extension)

    doc, unknown = _text.build_document(
        raw, path=display, kind=resolved_kind,
        known_ids=set(RULES), comment_spans=comment_spans,
    )
    for rule_id in unknown:
        message = f"kilint: unknown rule id '{rule_id}' in a suppression directive"
        if warn is None:
            print(message, file=sys.stderr)
        else:
            warn.append(message)

    front = doc.frontmatter
    resolved = cfg.resolve(target, profile or front.profile, extra_disable=front.disable)
    if resolved_kind == "source":
        doc = _text.drop_short_blocks(doc, resolved.comment_min_words)

    if resolved.profile == "off" or front.disabled or doc.suppressions.file_disabled:
        reason = "profile off" if resolved.profile == "off" else "disabled in file"
        return FileResult(display, resolved.profile, doc.word_count, len(doc.sentences),
                          None, [], skipped=True, reason=reason,
                          threshold=resolved.threshold)

    violations = _rules.run(doc, resolved, select, ignore)
    words = doc.word_count
    value = None if words < resolved.min_words else _rules.score(violations, words, resolved.weights)
    return FileResult(display, resolved.profile, words, len(doc.sentences), value,
                      violations, threshold=resolved.threshold)


def lint_path(
    path: str | Path,
    cfg: Config | None = None,
    profile: str | None = None,
    kind: str = "auto",
    select: set[str] | None = None,
    ignore: set[str] | None = None,
    warn: list[str] | None = None,
) -> FileResult:
    """Read a file from disk and lint it."""
    target = Path(path)
    raw = target.read_text(encoding="utf-8", errors="replace")
    cfg = cfg or _config.load(target)
    return lint_text(raw, path=target, cfg=cfg, profile=profile, kind=kind,
                     select=select, ignore=ignore, warn=warn)
