"""Regression tests for the false-positive classes found by the build audit.

Each case pairs a phrase that must stay silent with a phrase that must still
fire, so a future loosening of a guard cannot silently disable its rule.
"""
from __future__ import annotations

import pytest

from conftest import count_id, first_file, lint_json


def _hits(cli, write_file, name, text, rule_id, profile="flavored"):
    path = write_file(name, text if text.endswith("\n") else text + "\n")
    payload = lint_json(cli, path, extra_args=["--select", rule_id, "--profile", profile])
    return count_id(first_file(payload), rule_id)


# --------------------------------------------------------------------------
# VRB001: predicate adjectives shipped in kilint.toml's extend_allow_passive.
# --------------------------------------------------------------------------
STATIVE_PARTICIPLES = [
    "is set", "are enabled", "was closed", "is expired", "is broken",
    "are focused", "is undefined", "is installed", "is configured",
    "is related", "is done", "is empty",
]


@pytest.mark.parametrize("phrase", STATIVE_PARTICIPLES)
def test_vrb001_stative_participles_are_allowed(cli, write_file, phrase):
    text = f"The current option {phrase} on every worker node in this cluster."
    assert _hits(cli, write_file, "stative.md", text, "VRB001") == 0


def test_vrb001_still_flags_a_real_agentless_passive(cli, write_file):
    text = "The report was written by the team during the last release week."
    assert _hits(cli, write_file, "passive.md", text, "VRB001") >= 1


# --------------------------------------------------------------------------
# VRB002: stative -ing adjectives versus a genuine progressive main verb.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("phrase", ["is missing", "are binding", "is pending", "is ongoing"])
def test_vrb002_stative_ing_adjectives_are_allowed(cli, write_file, phrase):
    text = f"If the record {phrase} then ask the user before you rebuild it."
    assert _hits(cli, write_file, "ing.md", text, "VRB002") == 0


def test_vrb002_still_flags_a_transitive_progressive(cli, write_file):
    text = "The service is running the batch job overnight for us every night."
    assert _hits(cli, write_file, "progressive.md", text, "VRB002") >= 1


# --------------------------------------------------------------------------
# SEN002: a serial list and a noun-first clause are not two instructions.
# --------------------------------------------------------------------------
SEN002_SILENT = [
    "Use the GitNexus tools to understand code, assess impact, and navigate safely.",
    "Use types to make public APIs, shared models, and component props explicit.",
    "Test coverage is at 80 percent, and coverage reports land nightly for us.",
    "Check digits are appended by the encoder, and parity bits follow them.",
    "Note that the runner clones the repo, and that failures retry twice here.",
]


@pytest.mark.parametrize("text", SEN002_SILENT)
def test_sen002_ignores_serial_lists_and_noun_clauses(cli, write_file, text):
    assert _hits(cli, write_file, "serial.md", text, "SEN002") == 0


@pytest.mark.parametrize("text", [
    "Install the package, and then restart the server to apply the change.",
    "Run the migration and then verify the schema before you continue here.",
    "Open the file, then save it again to trigger the watcher on the host.",
])
def test_sen002_still_flags_two_commands(cli, write_file, text):
    assert _hits(cli, write_file, "compound.md", text, "SEN002") >= 1


# --------------------------------------------------------------------------
# WRD006: a closed nominalization list, not a tion/ment/ance/ence suffix rule.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("phrase", [
    "the intersection of", "the environment of", "the presence of",
    "the absence of", "the sequence of", "the balance of", "the distance of",
    "the sentences of", "the descriptions of", "an instance of",
])
def test_wrd006_ignores_plain_nouns_before_of(cli, write_file, phrase):
    text = f"The report names {phrase} the two sets for every run in the suite."
    assert _hits(cli, write_file, "plain.md", text, "WRD006") == 0


@pytest.mark.parametrize("phrase", ["an analysis of", "a validation of", "a deployment of"])
def test_wrd006_still_flags_true_deverbal_nouns(cli, write_file, phrase):
    text = f"The team scheduled {phrase} the payload before the release goes out."
    assert _hits(cli, write_file, "deverbal.md", text, "WRD006") >= 1


# --------------------------------------------------------------------------
# VRB003: one modal per clause is not a stacked hedge.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("text", [
    "The build can fail and the operator can retry it later on the same runner.",
    "If the token expires you should rotate it, or you should ask the team.",
    "The folder should show Up to Date and the directory should never appear.",
])
def test_vrb003_ignores_one_modal_per_clause(cli, write_file, text):
    assert _hits(cli, write_file, "clauses.md", text, "VRB003") == 0


@pytest.mark.parametrize("text", [
    "This change may help to reduce latency for every user on the platform.",
    "The retry could possibly might fire twice under load on a slow disk.",
])
def test_vrb003_still_flags_adjacent_hedges(cli, write_file, text):
    assert _hits(cli, write_file, "hedge.md", text, "VRB003") >= 1


# --------------------------------------------------------------------------
# Word rules: a quoted or negated mention is not a use.
# --------------------------------------------------------------------------
def test_word_rules_skip_quoted_mentions(cli, write_file):
    text = 'The style guide bans "seamless" and "utilize" in every published page.'
    assert _hits(cli, write_file, "mention.md", text, "WRD003") == 0
    assert _hits(cli, write_file, "mention.md", text, "WRD002") == 0


def test_wrd001_skips_a_quoted_contraction(cli, write_file):
    text = 'The user said: "I don\'t think that will work for our team at all."'
    assert _hits(cli, write_file, "quoted_contraction.md", text, "WRD001") == 0


def test_word_rules_skip_a_negative_example(cli, write_file):
    text = "Write the short common word, not utilize, in every guide that we ship."
    assert _hits(cli, write_file, "negative.md", text, "WRD002") == 0


def test_word_rules_still_flag_a_plain_use(cli, write_file):
    text = "Our seamless platform will utilize the newest engine for every team."
    assert _hits(cli, write_file, "use.md", text, "WRD003") >= 1
    assert _hits(cli, write_file, "use.md", text, "WRD002") >= 1


# --------------------------------------------------------------------------
# WRD003: "unlock" as a plain technical verb is not marketing.
# --------------------------------------------------------------------------
def test_wrd003_allows_the_plain_verb_unlock(cli, write_file):
    text = "Unlock the mutex before you return from the handler in the worker."
    assert _hits(cli, write_file, "mutex.md", text, "WRD003") == 0


def test_wrd003_still_flags_the_marketing_sense_of_unlock(cli, write_file):
    text = "Our platform will unlock the power of your data across every team."
    assert _hits(cli, write_file, "power.md", text, "WRD003") >= 1


# --------------------------------------------------------------------------
# Masking: inline math and path-shaped wiki targets are not prose.
# --------------------------------------------------------------------------
def test_inline_math_is_masked(cli, write_file):
    text = "The density is $p(x; \\theta)$ and the kernel is $k(x, y; \\sigma)$ here."
    assert _hits(cli, write_file, "math.md", text, "PUN001") == 0


def test_currency_is_not_masked_as_math(cli, write_file):
    text = "The cost is $5 and the platform is seamless for every single team."
    assert _hits(cli, write_file, "money.md", text, "WRD003") >= 1


def test_wiki_link_path_target_is_masked(cli, write_file):
    text = "A wiki reference: [[some/page;anchor]] sits in the middle of this line."
    assert _hits(cli, write_file, "wiki.md", text, "PUN001") == 0


def test_plain_wiki_target_is_still_prose(cli, write_file):
    text = "See [[the seamless plan]] before you touch the deployment pipeline."
    assert _hits(cli, write_file, "wiki_prose.md", text, "WRD003") >= 1
