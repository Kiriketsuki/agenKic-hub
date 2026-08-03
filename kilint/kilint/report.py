"""Renderers: table, json, github, summary, and the delta report."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass

from .rules import RULES, FileResult, Violation, categories

SCHEMA_VERSION = 1

_COLORS = {
    "error": "\033[31m",
    "warn": "\033[33m",
    "info": "\033[36m",
    "dim": "\033[2m",
    "bold": "\033[1m",
    "reset": "\033[0m",
}

TOO_SHORT = "n/a (too short)"


def use_color(stream=None) -> bool:
    stream = stream or sys.stdout
    if os.environ.get("NO_COLOR") is not None:
        return False
    return bool(getattr(stream, "isatty", lambda: False)())


def _paint(text: str, key: str, enabled: bool) -> str:
    if not enabled or key not in _COLORS:
        return text
    return f"{_COLORS[key]}{text}{_COLORS['reset']}"


@dataclass(frozen=True)
class Summary:
    files: int
    words: int
    violations: int
    score: float | None
    threshold: float | None
    passed: bool


def summarize(results: list[FileResult], fail_over: float | None = None) -> Summary:
    active = [r for r in results if not r.skipped]
    words = sum(r.words for r in active)
    violations = sum(len(r.violations) for r in active)
    scored = [r for r in active if r.score is not None]
    score = None
    if scored:
        total = sum(r.score * r.words for r in scored)
        weight = sum(r.words for r in scored)
        score = round(total / weight, 2) if weight else 0.0
    thresholds = {r.threshold for r in active}
    threshold = fail_over if fail_over is not None else (thresholds.pop() if len(thresholds) == 1 else None)
    passed = not any(r.failed for r in active)
    return Summary(len(results), words, violations, score, threshold, passed)


def _score_text(result: FileResult) -> str:
    if result.score is None:
        return TOO_SHORT
    return f"score {result.score:.2f}"


def render_table(results: list[FileResult], summary: Summary, color: bool, quiet: bool = False) -> str:
    lines: list[str] = []
    if not quiet:
        for result in results:
            if result.skipped:
                lines.append(f"{result.path}  skipped ({result.reason})")
                continue
            head = (f"{result.path}  {result.profile}  {_score_text(result)}  "
                    f"({result.words} words, {len(result.violations)} violations)")
            lines.append(_paint(head, "bold", color))
            for violation in result.violations:
                position = f"{violation.line}:{violation.col}".rjust(7)
                severity = _paint(violation.severity.ljust(5), violation.severity, color)
                lines.append(f"  {position}  {severity}  {violation.rule_id}  "
                             f"{violation.message}  -> {violation.suggestion}")
            if result.violations:
                break_down = ", ".join(f"{k} {v}" for k, v in categories(result.violations).items())
                lines.append(_paint(f"           {break_down}", "dim", color))
            lines.append("")
    lines.append(render_summary(summary, color))
    return "\n".join(lines)


def render_summary(summary: Summary, color: bool = False) -> str:
    score = TOO_SHORT if summary.score is None else f"score {summary.score:.2f}/100w"
    threshold = "threshold none" if summary.threshold is None else f"threshold {summary.threshold}"
    verdict = "PASS" if summary.passed else "FAIL"
    verdict = _paint(verdict, "info" if summary.passed else "error", color)
    files = f"{summary.files} file" + ("" if summary.files == 1 else "s")
    return (f"{files}, {summary.words} words, {summary.violations} violations, "
            f"{score}   {threshold}   {verdict}")


def _violation_dict(violation: Violation) -> dict:
    rule = RULES.get(violation.rule_id)
    return {
        "rule_id": violation.rule_id,
        "name": rule.name if rule else violation.rule_id,
        "category": rule.category if rule else "other",
        "line": violation.line,
        "col": violation.col,
        "severity": violation.severity,
        "message": violation.message,
        "excerpt": violation.excerpt,
        "suggestion": violation.suggestion,
    }


def result_dict(result: FileResult) -> dict:
    return {
        "path": result.path,
        "profile": result.profile,
        "words": result.words,
        "sentences": result.sentences,
        "score": result.score,
        "threshold": result.threshold,
        "skipped": result.skipped,
        "reason": result.reason,
        "categories": categories(result.violations),
        "violations": [_violation_dict(v) for v in result.violations],
    }


def render_json(results: list[FileResult], summary: Summary, version: str) -> str:
    payload = {
        "version": version,
        "schema": SCHEMA_VERSION,
        "files": [result_dict(r) for r in results],
        "summary": {
            "files": summary.files,
            "words": summary.words,
            "violations": summary.violations,
            "score": summary.score,
            "threshold": summary.threshold,
            "passed": summary.passed,
        },
    }
    return json.dumps(payload, indent=2, sort_keys=False)


_GITHUB_LEVEL = {"error": "error", "warn": "warning", "info": "notice"}


def render_github(results: list[FileResult]) -> str:
    lines: list[str] = []
    for result in results:
        for violation in result.violations:
            level = _GITHUB_LEVEL.get(violation.severity, "notice")
            message = f"{violation.rule_id} {violation.message} -> {violation.suggestion}"
            message = message.replace("\r", " ").replace("\n", " ")
            lines.append(f"::{level} file={result.path},line={violation.line},"
                         f"col={violation.col}::{message}")
    return "\n".join(lines)


def render(results: list[FileResult], summary: Summary, fmt: str, version: str,
           color: bool = False, quiet: bool = False) -> str:
    if fmt == "json":
        return render_json(results, summary, version)
    if fmt == "github":
        return render_github(results)
    if fmt == "summary" or quiet:
        return render_summary(summary, color)
    return render_table(results, summary, color)


def _counts(result: FileResult) -> dict[str, int]:
    out: dict[str, int] = {}
    for violation in result.violations:
        out[violation.rule_id] = out.get(violation.rule_id, 0) + 1
    return out


def delta_payload(before: FileResult, after: FileResult) -> dict:
    old, new = _counts(before), _counts(after)
    gone = {k: old[k] - new.get(k, 0) for k in old if old[k] > new.get(k, 0)}
    added = {k: new[k] - old.get(k, 0) for k in new if new[k] > old.get(k, 0)}
    change = None
    if before.score is not None and after.score is not None:
        if before.score == after.score:
            # Identical scores are a zero-percent change, including 0.0 vs 0.0
            # where the ratio below would divide by zero.
            change = 0
        elif before.score > 0:
            change = round((after.score - before.score) * 100.0 / before.score)
    return {
        "before": result_dict(before),
        "after": result_dict(after),
        "delta": {
            "percent": change,
            "removed": sum(gone.values()),
            "added": sum(added.values()),
            "gone": dict(sorted(gone.items())),
            "new": dict(sorted(added.items())),
        },
    }


def _fmt_counts(counts: dict[str, int]) -> str:
    if not counts:
        return "none"
    return ", ".join(f"{rule} x{count}" for rule, count in counts.items())


def render_delta(before: FileResult, after: FileResult, fmt: str, version: str) -> str:
    payload = delta_payload(before, after)
    if fmt == "json":
        return json.dumps({"version": version, "schema": SCHEMA_VERSION, **payload},
                          indent=2, sort_keys=False)
    change = payload["delta"]["percent"]
    change_text = "n/a" if change is None else f"{change:+d}%"
    before_score = TOO_SHORT if before.score is None else f"{before.score:.2f}/100w"
    after_score = TOO_SHORT if after.score is None else f"{after.score:.2f}/100w"
    lines = [
        f"before  {before_score}  ({before.words} words, {len(before.violations)} violations)",
        f"after   {after_score}  ({after.words} words, {len(after.violations)} violations)",
        f"delta   {change_text}       {payload['delta']['removed']} violations removed, "
        f"{payload['delta']['added']} added",
        f"        gone:  {_fmt_counts(payload['delta']['gone'])}",
        f"        new:   {_fmt_counts(payload['delta']['new'])}",
    ]
    return "\n".join(lines)


def render_rules() -> str:
    header = f"{'id':<8}{'name':<24}{'category':<13}default"
    lines = [header, "-" * len(header)]
    for rule in RULES.values():
        lines.append(f"{rule.id:<8}{rule.name:<24}{rule.category:<13}{rule.default_severity}")
    return "\n".join(lines)


def render_explain(rule_id: str) -> str:
    rule = RULES.get(rule_id.upper())
    if rule is None:
        known = ", ".join(RULES)
        return f"unknown rule '{rule_id}'. Known ids: {known}"
    return (f"{rule.id}  {rule.name}  [{rule.category}]  default {rule.default_severity}\n\n"
            f"{rule.explain}\n\nFix hint: {rule.suggest}")
