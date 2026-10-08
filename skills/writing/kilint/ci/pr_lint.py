#!/usr/bin/env python3
"""Lint a pull request with kilint for the STE check in CI.

The script lints the PR title, the PR body, each commit message in the PR, and
each Markdown file the PR adds or changes. A kilint error fails the check. A
warning or an info finding only shows in the annotations and the job summary.

The workflow passes the PR through the environment, never through ${{ }} in a
script, so a title or a body cannot run as a command:

    PR_TITLE, PR_BODY, BASE_SHA, HEAD_SHA

The script skips bot commits (github-actions, dependabot) and merge commits. Path
routing in kilint.toml, and in any .kilint.toml of the repository, decides the
profile of each Markdown file, so an exempt path such as reference/ stays off.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

KILINT = Path(__file__).resolve().parent.parent / "bin" / "kilint"
DOC_SUFFIXES = (".md", ".mdx", ".markdown")
BOT_AUTHORS = ("github-actions[bot]", "dependabot[bot]")


@dataclass(frozen=True)
class Finding:
    source: str
    path: str | None
    line: int
    col: int
    severity: str
    rule: str
    message: str
    suggestion: str


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def run_kilint(paths: list[Path], profile: str | None) -> list[dict]:
    cmd = [sys.executable, str(KILINT), "--format", "json", "--no-fail"]
    if profile is not None:
        cmd += ["--profile", profile]
    result = subprocess.run(cmd + [str(p) for p in paths], capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"kilint failed with exit {result.returncode}: {result.stderr.strip()}")
    return json.loads(result.stdout)["files"]


def findings_of(files: list[dict], label_of: dict[str, tuple[str, str | None]]) -> list[Finding]:
    out: list[Finding] = []
    for f in files:
        source, path = label_of.get(f["path"], (f["path"], f["path"]))
        for v in f.get("violations", []):
            out.append(Finding(source, path, v["line"], v["col"], v["severity"], v["rule_id"], v["message"], v.get("suggestion") or ""))
    return out


def commits(base: str, head: str) -> list[tuple[str, str]]:
    """The non-merge commits of the PR that a person wrote, as (sha, message)."""
    rows = git("log", "--no-merges", "--format=%H%x1f%an", f"{base}..{head}").splitlines()
    out = []
    for row in rows:
        sha, _, author = row.partition("\x1f")
        if author in BOT_AUTHORS:
            continue
        out.append((sha, git("log", "-1", "--format=%B", sha).strip()))
    return out


def changed_docs(base: str, head: str) -> list[Path]:
    names = git("diff", "--name-only", "--diff-filter=AMR", f"{base}...{head}").splitlines()
    return [Path(n) for n in names if n.lower().endswith(DOC_SUFFIXES) and Path(n).is_file()]


def text_findings(base: str, head: str, tmp: Path) -> list[Finding]:
    """The PR title, the PR body and the commit messages, in flavored mode."""
    label_of: dict[str, tuple[str, str | None]] = {}
    paths: list[Path] = []

    def add(name: str, text: str, source: str) -> None:
        if text.strip() == "":
            return
        p = tmp / name
        p.write_text(text + "\n", encoding="utf-8")
        label_of[str(p)] = (source, None)
        paths.append(p)

    add("pr-title.txt", os.environ.get("PR_TITLE", ""), "PR title")
    add("pr-body.md", os.environ.get("PR_BODY", ""), "PR body")
    for sha, message in commits(base, head):
        add(f"commit-{sha[:12]}.md", message, f"commit {sha[:7]}")
    return findings_of(run_kilint(paths, "flavored"), label_of) if paths else []


def annotate(f: Finding) -> str:
    level = "error" if f.severity == "error" else "warning" if f.severity == "warn" else "notice"
    text = f"{f.rule} {f.message}" + (f" -> {f.suggestion}" if f.suggestion else "")
    if f.path is not None:
        return f"::{level} file={f.path},line={f.line},col={f.col}::{text}"
    return f"::{level} title=STE {f.source}::line {f.line}: {text}"


def summary(all_findings: list[Finding], checked: list[str]) -> str:
    errors = sum(1 for f in all_findings if f.severity == "error")
    lines = ["## STE check", "", f"Checked: {', '.join(checked) or 'nothing'}.", ""]
    if not all_findings:
        return "\n".join(lines + ["No findings."]) + "\n"
    lines += [f"{errors} errors, {len(all_findings) - errors} warnings and notices. Errors fail the check.", ""]
    lines += ["| Where | Line | Rule | Severity | Finding |", "|:---|---:|:---|:---|:---|"]
    for f in all_findings:
        where = f.path or f.source
        msg = f"{f.message}" + (f" -> {f.suggestion}" if f.suggestion else "")
        lines.append(f"| {where} | {f.line} | {f.rule} | {f.severity} | {msg.replace('|', '/')} |")
    return "\n".join(lines) + "\n"


def main() -> int:
    base, head = os.environ.get("BASE_SHA", ""), os.environ.get("HEAD_SHA", "")
    if base == "" or head == "":
        print("BASE_SHA and HEAD_SHA must be set.", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory() as d:
        found = text_findings(base, head, Path(d))
    docs = changed_docs(base, head)
    if docs:
        found += findings_of(run_kilint(docs, None), {})
    checked = ["PR title", "PR body", "commit messages"] + ([f"{len(docs)} changed Markdown files"] if docs else [])
    for f in found:
        print(annotate(f))
    report = summary(found, checked)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as out:
            out.write(report)
    else:
        print(report)
    return 1 if any(f.severity == "error" for f in found) else 0


if __name__ == "__main__":
    sys.exit(main())
