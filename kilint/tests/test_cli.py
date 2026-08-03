"""Tests for cli.py: exit codes, argument parsing, stdin, --explain,
--list-rules, and directory walking (SPEC.md "CLI (cli.py)").
"""
from __future__ import annotations

import json
import re

from conftest import count_id, first_file, lint_json, n_word_sentence


def test_exit_code_0_on_clean_text(cli, write_file):
    path = write_file("clean.md", n_word_sentence(10) + "\n")
    result = cli([str(path)])
    assert result.returncode == 0


def test_exit_code_1_when_over_threshold(cli, write_file):
    violating = " ".join(
        [
            "It's important to note that this seamless robust platform will utilize",
            "and leverage a variety of cutting-edge features that were facilitated",
            "by the deployment script — which was written by the team —",
            "in order to unlock revolutionary results for every single stakeholder.",
        ]
    )
    path = write_file("bad.md", violating + "\n")
    result = cli([str(path), "--fail-over", "0"])
    assert result.returncode == 1


def test_exit_code_2_on_nonexistent_path(cli, tmp_path):
    missing = tmp_path / "does_not_exist.md"
    result = cli([str(missing)])
    assert result.returncode == 2


def test_exit_code_2_on_malformed_toml_config(cli, write_file, toml_file):
    toml_file("bad.toml", "this is [ not valid toml >>>\n")
    note = write_file("note.md", "placeholder text that would otherwise pass cleanly.\n")
    result = cli([str(note), "--config", str(note.parent / "bad.toml")])
    assert result.returncode == 2


def test_no_fail_always_exits_0(cli, write_file):
    violating = (
        "It's important to note that this seamless robust platform will utilize "
        "and leverage a variety of cutting-edge features — which were facilitated "
        "by the deployment script that was written by the team in order to "
        "unlock revolutionary results for every single stakeholder involved here.\n"
    )
    path = write_file("bad.md", violating)
    result = cli([str(path), "--fail-over", "0", "--no-fail"])
    assert result.returncode == 0


def test_select_restricts_to_named_rules(cli, write_file):
    text = "Please utilize seamless robust patterns; it's important to note this works.\n"
    path = write_file("multi.md", text)
    payload = lint_json(cli, path, extra_args=["--select", "WRD002,WRD003"])
    entry = first_file(payload)
    ids = {v["rule_id"] for v in entry["violations"]}
    assert ids <= {"WRD002", "WRD003"}
    assert ids  # at least one of them actually fired


def test_ignore_drops_named_rule(cli, write_file):
    text = "Please utilize seamless robust patterns for every deployment we run.\n"
    path = write_file("multi.md", text)

    baseline = lint_json(cli, path)
    baseline_entry = first_file(baseline)
    assert count_id(baseline_entry, "WRD002") >= 1  # sanity: it fires normally

    ignored = lint_json(cli, path, extra_args=["--ignore", "WRD002"])
    ignored_entry = first_file(ignored)
    assert count_id(ignored_entry, "WRD002") == 0


def test_stdin_is_linted_as_markdown_when_no_paths_given(cli):
    text = "Please utilize this pattern for every deployment we run today.\n"
    result = cli(["--format", "json"], input_text=text)
    assert result.returncode in (0, 1)
    payload = json.loads(result.stdout)
    assert len(payload["files"]) == 1
    entry = payload["files"][0]
    assert count_id(entry, "WRD002") >= 1


def test_explain_known_rule_prints_rationale(cli):
    result = cli(["--explain", "VRB001"])
    assert result.returncode == 0
    assert result.stdout.strip() != ""
    assert "VRB001" in result.stdout or "passive" in result.stdout.lower()


def test_explain_unknown_rule_does_not_crash(cli):
    result = cli(["--explain", "ZZZ999"])
    assert result.returncode != 0
    assert "Traceback" not in result.stderr


def test_list_rules_includes_known_ids(cli):
    result = cli(["--list-rules"])
    assert result.returncode == 0
    for rule_id in ("SEN001", "PUN002", "WRD002", "VRB001", "TRM001"):
        assert rule_id in result.stdout


def test_version_flag_prints_a_version(cli):
    result = cli(["--version"])
    assert result.returncode == 0
    assert re.search(r"\d+\.\d+", result.stdout)


def test_directory_walk_collects_known_extensions_only(cli, write_file):
    write_file("proj/a.md", n_word_sentence(10) + "\n")
    write_file("proj/b.py", '"""just a short docstring here."""\n')
    write_file("proj/c.txt", n_word_sentence(10) + "\n")
    write_file("proj/d.unknownext", "should never be collected at all\n")
    project_dir = write_file("proj/a.md", n_word_sentence(10) + "\n").parent

    result = cli([str(project_dir), "--format", "json"])
    payload = json.loads(result.stdout)
    paths = [f["path"] for f in payload["files"]]
    assert any(p.endswith("a.md") for p in paths)
    assert any(p.endswith("c.txt") for p in paths)
    assert not any(p.endswith("d.unknownext") for p in paths)


def test_directory_walk_honours_off_path_routing(cli, write_file, toml_file):
    toml_file(
        "proj/.kilint.toml",
        """
        [[paths]]
        glob = "skip/**"
        profile = "off"
        """,
    )
    write_file("proj/keep/note.md", n_word_sentence(10) + "\n")
    write_file("proj/skip/note.md", n_word_sentence(10) + "\n")
    project_dir = write_file("proj/keep/note.md", n_word_sentence(10) + "\n").parent.parent

    result = cli([str(project_dir), "--format", "json"])
    payload = json.loads(result.stdout)
    keep_entries = [f for f in payload["files"] if f["path"].endswith("keep/note.md")]
    skip_entries = [f for f in payload["files"] if f["path"].endswith("skip/note.md")]
    assert keep_entries and keep_entries[0].get("skipped") is not True
    assert not skip_entries or skip_entries[0].get("skipped") is True


def test_profile_flag_overrides_off_routing(cli, write_file, toml_file):
    toml_file(
        "proj/.kilint.toml",
        """
        [[paths]]
        glob = "skip/**"
        profile = "off"
        """,
    )
    note = write_file("proj/skip/note.md", n_word_sentence(10) + "\n")
    payload = lint_json(cli, note, extra_args=["--profile", "flavored"])
    entry = first_file(payload)
    assert entry.get("skipped") is not True
    assert entry["profile"] == "flavored"


def test_quiet_prints_only_a_summary_line(cli, write_file):
    violating = (
        "It's important to note that this seamless robust platform will utilize "
        "and leverage a variety of cutting-edge features for every stakeholder here.\n"
    )
    path = write_file("bad.md", violating)
    result = cli([str(path), "--quiet"])
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    assert len(lines) <= 2


def test_default_format_is_table_not_json(cli, write_file):
    path = write_file("note.md", n_word_sentence(10) + "\n")
    result = cli([str(path)])
    stripped = result.stdout.strip()
    assert not stripped.startswith("{")
