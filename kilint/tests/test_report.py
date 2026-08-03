"""Tests for report.py: JSON schema stability, github annotation format,
and no colour when piped (SPEC.md "Output (report.py)").
"""
from __future__ import annotations

import json
import re

from conftest import first_file, lint_json, n_word_sentence

ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def _violating_file(write_file):
    text = (
        "It's important to note that this seamless robust platform will utilize "
        "and leverage a variety of cutting-edge features for every stakeholder — "
        "which the deployment script was written by the team to unlock revolutionary "
        "results for the whole organization without exception this quarter.\n"
    )
    return write_file("bad.md", text)


def test_json_top_level_schema_keys(cli, write_file):
    path = _violating_file(write_file)
    payload = lint_json(cli, path)
    for key in ("version", "files", "summary"):
        assert key in payload
    assert isinstance(payload["files"], list)
    assert isinstance(payload["summary"], dict)


def test_json_file_entry_schema_keys(cli, write_file):
    path = _violating_file(write_file)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    for key in ("path", "profile", "words", "sentences", "score", "violations", "skipped"):
        assert key in entry, f"missing key {key!r} in file entry {entry}"
    assert isinstance(entry["violations"], list)
    assert entry["violations"], "expected at least one violation in the fixture"


def test_json_violation_schema_keys(cli, write_file):
    path = _violating_file(write_file)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    violation = entry["violations"][0]
    for key in ("rule_id", "line", "col", "severity", "message", "excerpt", "suggestion"):
        assert key in violation, f"missing key {key!r} in violation {violation}"
    assert isinstance(violation["line"], int)
    assert isinstance(violation["col"], int)
    assert isinstance(violation["rule_id"], str)
    assert isinstance(violation["severity"], str)


def test_json_output_is_stable_across_repeated_runs(cli, write_file):
    path = _violating_file(write_file)
    first = cli([str(path), "--format", "json"])
    second = cli([str(path), "--format", "json"])
    assert json.loads(first.stdout) == json.loads(second.stdout)


def test_github_annotation_format(cli, write_file):
    path = _violating_file(write_file)
    result = cli([str(path), "--format", "github"])
    assert result.returncode in (0, 1)
    annotation_re = re.compile(
        r"^::(error|warning|notice) file=[^,]+,line=\d+,col=\d+::.+$"
    )
    matches = [line for line in result.stdout.splitlines() if annotation_re.match(line)]
    assert matches, f"no github-annotation-formatted lines found in:\n{result.stdout}"


def test_github_annotation_file_matches_linted_path(cli, write_file):
    path = _violating_file(write_file)
    result = cli([str(path), "--format", "github"])
    assert path.name in result.stdout


def test_no_ansi_colour_when_piped(cli, write_file):
    path = _violating_file(write_file)
    result = cli([str(path)])  # default table format, subprocess pipes are never a tty
    assert not ANSI_ESCAPE.search(result.stdout)


def test_table_format_shows_pass_or_fail_and_threshold(cli, write_file):
    path = write_file("clean.md", n_word_sentence(10) + "\n")
    result = cli([str(path)])
    lowered = result.stdout.lower()
    assert "pass" in lowered or "fail" in lowered
    assert "threshold" in lowered


def test_table_format_shows_line_and_column_positions(cli, write_file):
    path = _violating_file(write_file)
    result = cli([str(path)])
    assert re.search(r"\b\d+:\d+\b", result.stdout)


def test_summary_format_is_terser_than_table(cli, write_file):
    path = _violating_file(write_file)
    table_result = cli([str(path)])
    summary_result = cli([str(path), "--format", "summary"])
    assert summary_result.returncode in (0, 1)
    assert len(summary_result.stdout.splitlines()) <= len(table_result.stdout.splitlines())
