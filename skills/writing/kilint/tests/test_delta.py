"""Tests for the delta workflow: --delta OLD NEW and the hero regression
fixture built from reference/before-after-samples.md.

Per the task instructions: assert direction and rough magnitude only for
the hero pair (STE scores at least 50% lower). Never assert kilint
reproduces the reference tool's exact numbers. Gone/new classification
correctness is tested separately with small, hand-countable synthetic
texts where the exact rule-id deltas are known in advance.
"""
from __future__ import annotations

import re

from conftest import first_file, lint_json


def _score_of(cli, path):
    payload = lint_json(cli, path)
    entry = first_file(payload)
    score = entry["score"]
    assert isinstance(score, (int, float)), f"expected a numeric score, got {score!r}"
    return score


def test_hero_fixture_ste_scores_direction_and_magnitude(cli, copy_fixture):
    """The real baseline-vs-STE README text from reference/before-after-samples.md:
    the STE rewrite must score at least 50% lower than the baseline, but we
    do not assert kilint's exact numbers (it has different rules by design)."""
    baseline_path = copy_fixture("hero_baseline.md")
    ste_path = copy_fixture("hero_ste.md")

    baseline_score = _score_of(cli, baseline_path)
    ste_score = _score_of(cli, ste_path)

    assert ste_score < baseline_score, "the STE version should score lower, not higher or equal"
    assert ste_score <= baseline_score * 0.5, (
        f"expected the STE version to score at least 50% lower "
        f"(baseline={baseline_score}, ste={ste_score})"
    )


def test_delta_flag_reports_a_negative_percentage_for_the_hero_pair(cli, copy_fixture):
    baseline_path = copy_fixture("hero_baseline.md")
    ste_path = copy_fixture("hero_ste.md")

    result = cli(["--delta", str(baseline_path), str(ste_path)])
    assert result.returncode == 0, "--delta ignores fail_over and should not exit 1"
    match = re.search(r"-?\d+(\.\d+)?\s*%", result.stdout)
    assert match, f"no percentage found in delta output:\n{result.stdout}"
    assert "-" in match.group(0), "expected a negative (improvement) delta percentage"


def _write_gone_new_pair(write_file):
    # OLD: 2x PUN002 (em dash), 2x WRD003 (seamless, robust), 1x SEN001 (long sentence).
    old_text = (
        "The platform is fast — very fast — and seamless in every way for teams.\n\n"
        "Our robust integration layer connects every downstream system reliably today.\n\n"
        + " ".join(["field"] * 30) + ".\n"
    )
    # NEW: em dashes fixed, one marketing word fixed, sentence shortened,
    # but a brand new WRD002 violation ("utilize") is introduced.
    new_text = (
        "The platform is fast, very fast, and reliable in every way for teams.\n\n"
        "Our robust integration layer connects every downstream system reliably today.\n\n"
        "Please utilize the shorter sentence style from now on for every document.\n"
    )
    old_path = write_file("old.md", old_text)
    new_path = write_file("new.md", new_text)
    return old_path, new_path


def test_delta_gone_and_new_classification_is_correct(cli, write_file):
    old_path, new_path = _write_gone_new_pair(write_file)
    result = cli(["--delta", str(old_path), str(new_path)])
    assert result.returncode == 0, "--delta ignores fail_over and should not exit 1"
    output = result.stdout

    gone_match = re.search(r"gone:\s*(.*)", output, re.IGNORECASE)
    new_match = re.search(r"new:\s*(.*)", output, re.IGNORECASE)
    assert gone_match, f"no 'gone:' section found in:\n{output}"
    assert new_match, f"no 'new:' section found in:\n{output}"

    gone_line = gone_match.group(1)
    new_line = new_match.group(1)

    gone_counts = dict(re.findall(r"([A-Z]{3}\d{3})\s*x(\d+)", gone_line))
    new_counts = dict(re.findall(r"([A-Z]{3}\d{3})\s*x(\d+)", new_line))

    assert gone_counts.get("PUN002") == "2", f"expected 2 PUN002 gone, got {gone_counts}"
    assert "SEN001" in gone_counts, f"expected SEN001 to be gone, got {gone_counts}"
    assert new_counts.get("WRD002") == "1", f"expected 1 new WRD002, got {new_counts}"
    assert "PUN002" not in new_counts
    assert "SEN001" not in new_counts


def test_delta_reports_no_change_for_identical_files(cli, write_file):
    # Must clear min_words (default 40), otherwise SPEC.md requires the score
    # to be suppressed as "n/a (too short)" and there is no percent to report.
    text = (
        "Please use the shorter sentence style from now on for every document.\n\n"
        "The parser reads the file and writes the result to disk.\n\n"
        "Run the migration script before you restart the service on the host.\n\n"
        "Check the log file when the run ends so you can confirm the result.\n"
    )
    path = write_file("same.md", text)
    result = cli(["--delta", str(path), str(path)])
    assert result.returncode == 0
    match = re.search(r"(-?\d+(\.\d+)?)\s*%", result.stdout)
    assert match
    assert float(match.group(1)) == 0.0


def test_delta_ignores_fail_over_and_exits_cleanly(cli, copy_fixture):
    """SPEC.md: '--delta ... ignores fail_over' -- a delta comparison must
    not fail the run even when the baseline file badly exceeds threshold."""
    baseline_path = copy_fixture("hero_baseline.md")
    ste_path = copy_fixture("hero_ste.md")
    result = cli(["--delta", str(baseline_path), str(ste_path), "--fail-over", "0"])
    assert result.returncode == 0
