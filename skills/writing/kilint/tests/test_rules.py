"""One positive and one negative case per rule id (SPEC.md "Rules" table),
driven entirely through the CLI's --format json contract.

Negative cases matter most here, in particular the documented traps:
  - "is based on" must not be flagged as passive voice (VRB001)
  - the full VRB001 allow-list must not be flagged
  - "unlocked" must not match the "unlock" word-list entry (WRD003,
    also covered from the masking-fixture angle in test_text.py)
  - a quoted exclamation must not trip PUN003
  - "is going to" must still be flagged by VRB002 (explicitly not
    allow-listed per SPEC.md)
"""
from __future__ import annotations

import pytest

from conftest import count_id, first_file, lint_json, n_word_sentence

# --------------------------------------------------------------------------
# Table-driven positive/negative pairs, isolated with --select so that only
# the rule under test can appear in the violation list.
#
# Fields: rule_id, profile, positive_text, negative_text
# --------------------------------------------------------------------------
RULE_CASES = [
    (
        "SEN001",
        "flavored",
        n_word_sentence(30),
        n_word_sentence(10),
    ),
    (
        "SEN002",
        "flavored",
        "Install the package, and then restart the server to apply the change.",
        "Install the package. Restart the server to apply the change.",
    ),
    (
        "STR002",
        "strict",
        "Restart the server if it becomes unresponsive during peak business hours.",
        "If it becomes unresponsive during peak business hours, restart the server.",
    ),
    (
        "PUN001",
        "flavored",
        "Restart the server; then check the logs for errors.",
        "Restart the server. Then check the logs for errors.",
    ),
    (
        "PUN002",
        "flavored",
        "The cache is fast — very fast indeed.",
        "The cache is fast, very fast indeed.",
    ),
    (
        "PUN003",
        "flavored",
        "Stop the server now!",
        "Stop the server now.",
    ),
    (
        "PUN004",
        "strict",
        "The team said “this is the plan” going forward.",
        "The team said \"this is the plan\" going forward.",
    ),
    (
        "WRD001",
        "flavored",
        "It doesn't work as expected in this particular case.",
        "It does not work as expected in this particular case.",
    ),
    (
        "WRD002",
        "flavored",
        "Please utilize the correct method for this task today.",
        "Please use the correct method for this task today.",
    ),
    (
        "WRD003",
        "flavored",
        "Our seamless robust platform delivers results for every team.",
        "Our reliable platform delivers results for every team consistently.",
    ),
    (
        "WRD004",
        "flavored",
        "It is important to note that the system works correctly.",
        "The system works correctly under normal load conditions today.",
    ),
    (
        "WRD005",
        "flavored",
        "Let's spin up a new environment for the test run.",
        "Let's create a new environment for the test run today.",
    ),
    (
        "WRD006",
        "flavored",
        "We need to perform an analysis of the data set.",
        "We need to analyze the data set carefully this week.",
    ),
    (
        "WRD007",
        "flavored",
        "Great work today \U0001F600",
        "Great work today.",
    ),
    (
        "WRD008",
        "strict",
        "Several users reported various issues with the system this week.",
        "Twelve users reported two issues with the system this week.",
    ),
    (
        "VRB001",
        "flavored",
        "The report was written by the team last week.",
        "The report is based on last month's raw data.",
    ),
    (
        "VRB002",
        "flavored",
        "The service is running the batch job overnight for us.",
        "The service runs the batch job overnight for us daily.",
    ),
    (
        "VRB003",
        "flavored",
        "This change may help to reduce latency for every user.",
        "This change reduces latency for every user immediately today.",
    ),
]


@pytest.mark.parametrize("rule_id,profile,positive,negative", RULE_CASES, ids=[c[0] for c in RULE_CASES])
def test_rule_positive_and_negative(cli, write_file, rule_id, profile, positive, negative):
    pos_path = write_file(f"{rule_id}_positive.md", positive + "\n")
    pos_payload = lint_json(cli, pos_path, extra_args=["--select", rule_id, "--profile", profile])
    pos_entry = first_file(pos_payload)
    assert count_id(pos_entry, rule_id) >= 1, (
        f"{rule_id} did not fire on its documented positive case: {positive!r}"
    )
    for violation in pos_entry["violations"]:
        assert violation["rule_id"] == rule_id

    neg_path = write_file(f"{rule_id}_negative.md", negative + "\n")
    neg_payload = lint_json(cli, neg_path, extra_args=["--select", rule_id, "--profile", profile])
    neg_entry = first_file(neg_payload)
    assert count_id(neg_entry, rule_id) == 0, (
        f"{rule_id} incorrectly fired on its documented negative case: {negative!r}"
    )


# --------------------------------------------------------------------------
# Off-by-default rules: prove they stay silent under ordinary profiles even
# though the same text fires when explicitly selected above.
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "rule_id,text",
    [
        ("PUN004", "The team said “this is the plan” going forward."),
        ("WRD008", "Several users reported various issues with the system this week."),
    ],
)
def test_off_by_default_rules_stay_silent_without_select(cli, write_file, rule_id, text):
    path = write_file(f"{rule_id}_default.md", text + "\n")
    payload = lint_json(cli, path, extra_args=["--profile", "flavored"])
    entry = first_file(payload)
    assert count_id(entry, rule_id) == 0


def test_str002_off_by_default_outside_strict(cli, write_file):
    text = "Restart the server if it becomes unresponsive during peak business hours.\n"
    path = write_file("str002_default.md", text)
    payload = lint_json(cli, path, extra_args=["--profile", "flavored"])
    entry = first_file(payload)
    assert count_id(entry, "STR002") == 0


def test_sen002_off_in_prose_profile(cli, write_file):
    text = "Install the package, and then restart the server to apply the change.\n"
    path = write_file("sen002_prose.md", text)
    payload = lint_json(cli, path, extra_args=["--profile", "prose"])
    entry = first_file(payload)
    assert count_id(entry, "SEN002") == 0


# --------------------------------------------------------------------------
# TRM001: driven entirely by config, empty (silent) unless configured.
# --------------------------------------------------------------------------
def test_trm001_fires_only_when_terminology_configured(cli, write_file, toml_file):
    text = "Please open a PR before the end of the day for review.\n"
    path = write_file("term.md", text)

    without_config = lint_json(cli, path, extra_args=["--profile", "flavored"])
    assert count_id(first_file(without_config), "TRM001") == 0

    config = toml_file(
        "kilint.toml",
        """
        default_profile = "flavored"

        [terminology]
        "pull request" = ["PR", "merge request"]
        """,
    )
    with_config = lint_json(cli, path, extra_args=["--config", str(config)])
    assert count_id(first_file(with_config), "TRM001") >= 1


# --------------------------------------------------------------------------
# Explicit trap: VRB001's full default allow-list must never fire.
# --------------------------------------------------------------------------
ALLOWED_PASSIVE_PHRASES = [
    "is based on",
    "is required",
    "is available",
    "is related to",
    "is known as",
    "is located",
    "is designed to",
    "is intended",
    "is supported",
    "is deprecated",
]


@pytest.mark.parametrize("phrase", ALLOWED_PASSIVE_PHRASES)
def test_vrb001_allow_list_never_flagged(cli, write_file, phrase):
    text = f"The current system {phrase} in this particular case today.\n"
    path = write_file("allow.md", text)
    payload = lint_json(cli, path, extra_args=["--select", "VRB001", "--profile", "flavored"])
    entry = first_file(payload)
    assert count_id(entry, "VRB001") == 0, f"{phrase!r} was wrongly flagged as passive voice"


def test_vrb001_is_based_on_specifically_not_flagged(cli, write_file):
    """The single trap named explicitly in the task instructions."""
    text = "This dashboard is based on the latest available production data.\n"
    path = write_file("based_on.md", text)
    payload = lint_json(cli, path, extra_args=["--select", "VRB001", "--profile", "flavored"])
    entry = first_file(payload)
    assert count_id(entry, "VRB001") == 0


def test_vrb002_is_going_to_is_flagged_not_allow_listed(cli, write_file):
    """SPEC.md is explicit: 'Allow is going to? No - flag it.'"""
    text = "We are going to deploy the update again later tonight.\n"
    path = write_file("going_to.md", text)
    payload = lint_json(cli, path, extra_args=["--select", "VRB002", "--profile", "flavored"])
    entry = first_file(payload)
    assert count_id(entry, "VRB002") >= 1


def test_pun003_quoted_exclamation_not_flagged(cli, write_file):
    """PUN003 fires on bare exclamations, not exclamations inside quoted speech."""
    text = '"Stop now!" she said calmly to the whole team.\n'
    path = write_file("quoted.md", text)
    payload = lint_json(cli, path, extra_args=["--select", "PUN003", "--profile", "flavored"])
    entry = first_file(payload)
    assert count_id(entry, "PUN003") == 0


def test_wrd002_message_names_the_short_replacement(cli, write_file):
    text = "Please utilize the correct method for this task today.\n"
    path = write_file("utilize.md", text)
    payload = lint_json(cli, path, extra_args=["--select", "WRD002", "--profile", "flavored"])
    entry = first_file(payload)
    violations = [v for v in entry["violations"] if v["rule_id"] == "WRD002"]
    assert violations
    combined = (violations[0]["message"] + " " + violations[0]["suggestion"]).lower()
    assert "use" in combined


def test_str001_positive_and_negative_prose_paragraph(cli, write_file):
    negative = " ".join(n_word_sentence(4) for _ in range(3))
    pos_path = write_file("str001_neg.md", negative + "\n")
    neg_payload = lint_json(cli, pos_path, extra_args=["--profile", "strict"])
    assert count_id(first_file(neg_payload), "STR001") == 0

    positive = " ".join(n_word_sentence(18) for _ in range(8))
    path2 = write_file("str001_pos.md", positive + "\n")
    pos_payload = lint_json(cli, path2, extra_args=["--profile", "strict"])
    assert count_id(first_file(pos_payload), "STR001") >= 1
