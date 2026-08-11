"""Tests for the text pipeline (text.py) via the public CLI/JSON contract.

SPEC.md describes the pipeline stages (frontmatter split, masking, URL/link
masking, sentence segmentation, word counting) but does not name text.py's
internal functions. Per the task instructions, these are exercised through
`kilint --format json` rather than guessed-at internals.
"""
from __future__ import annotations

from conftest import count_id, first_file, lint_json, n_word_sentence


def test_fenced_code_em_dash_not_flagged_but_prose_em_dash_is(cli, copy_fixture):
    """The known false-positive trap: an em-dash inside a fenced code block
    must not be flagged, while a real em-dash in prose must be."""
    path = copy_fixture("masking_sample.md")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    # Real occurrences: the "Prose em dash" paragraph and the list
    # continuation line. The fenced block and the standalone indented code
    # block each contain one more em dash that must be masked out.
    assert count_id(entry, "PUN002") == 2


def test_inline_code_ensure_not_flagged(cli, copy_fixture):
    """'ensure' inside a backtick code span must not be flagged; the real
    prose occurrence on the same line must still be."""
    path = copy_fixture("masking_sample.md")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    # Real, unmasked occurrences, all of which SPEC.md says are prose:
    #   1. "ensure" in the heading on line 16 (headings are blocks, and the
    #      pipeline strips the leading "#" marker and lints the text)
    #   2. "ensure" in the body sentence on line 18
    #   3. "utilize" in the link *text* on line 23 (target masked, text kept)
    #   4. "utilize" in the table cell on line 29
    # The `ensure` code span on line 18 and the "utilize-this-path" URL are
    # masked. If the code span were double-counted this would be 5, not 4.
    assert count_id(entry, "WRD002") == 4


def test_unlocked_does_not_match_unlock(cli, copy_fixture):
    """'unlocked' in the numbered list must not match the 'unlock' entry
    in the marketing-adjective word list (no trailing '*' -> exact word)."""
    path = copy_fixture("masking_sample.md")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "WRD003") == 0


def test_numbered_list_of_nine_steps_does_not_trip_long_paragraph(cli, copy_fixture):
    """A numbered list of 9 short-ish steps must not trip STR001, even
    under the strict profile's tighter 6-sentence / 120-word caps, which
    a naive "count the list as one paragraph" implementation would trip."""
    path = copy_fixture("masking_sample.md")
    payload = lint_json(cli, path, extra_args=["--profile", "strict"])
    entry = first_file(payload)
    assert count_id(entry, "STR001") == 0


def test_bare_url_content_is_masked(cli, copy_fixture):
    """A trigger word embedded in a bare URL's path must not be linted,
    while the same word in surrounding or linked prose still is."""
    path = copy_fixture("masking_sample.md")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    excerpts = " ".join(v["excerpt"] for v in entry["violations"])
    assert "utilize-this-path" not in excerpts


def test_frontmatter_is_not_linted(cli, copy_fixture):
    """Frontmatter fields are config data, not prose, and must never
    contribute violations to the body's rule set."""
    path = copy_fixture("masking_sample.md")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    for violation in entry["violations"]:
        assert violation["line"] > 4, (
            "a violation was reported inside the frontmatter block "
            f"(lines 1-4): {violation}"
        )


def test_table_delimiter_row_produces_no_violations(cli, copy_fixture):
    """The '| --- | --- |' delimiter row must never itself be linted."""
    path = copy_fixture("masking_sample.md")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    for violation in entry["violations"]:
        assert violation["excerpt"].strip() not in {"---", "| --- | --- |"}


def test_frontmatter_kilint_off_skips_whole_file(cli, write_file):
    content = (
        "---\n"
        "kilint: off\n"
        "---\n\n"
        "This paragraph would normally utilize a long word and get flagged.\n"
    )
    path = write_file("note.md", content)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert entry.get("skipped") is True
    assert entry["violations"] == []


def test_frontmatter_profile_override(cli, write_file):
    """A `kilint:` frontmatter block can force a profile, overriding
    whatever path routing would otherwise select."""
    content = (
        "---\n"
        "kilint:\n"
        "  profile: strict\n"
        "---\n\n"
        f"{n_word_sentence(30)}\n"
    )
    path = write_file("note.md", content)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert entry["profile"] == "strict"


def test_frontmatter_disable_list_suppresses_named_rule(cli, write_file):
    content = (
        "---\n"
        "kilint:\n"
        "  disable: [WRD002]\n"
        "---\n\n"
        "Please ensure this sentence would normally trigger a long-word rule today.\n"
    )
    path = write_file("note.md", content)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "WRD002") == 0


def test_abbreviation_does_not_split_a_long_sentence_in_two(cli, write_file):
    """A single long sentence containing 'e.g.' must be counted as one
    sentence, not split at the abbreviation's period into two sentences
    that individually fall under the length cap."""
    sentence = (
        "This single long sentence, e.g. as an illustration of the point, "
        "keeps going well past the twenty five word limit that flavored "
        "profile enforces on any one sentence in normal prose today."
    )
    path = write_file("note.md", sentence + "\n")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "SEN001") == 1


def test_file_ref_and_version_string_do_not_split_a_sentence(cli, write_file):
    """A 'file.md:12' style reference and a version string like 'v2.5.1'
    must not be mistaken for sentence boundaries."""
    sentence = (
        "See notes.md:12 and the v2.5.1 changelog for the full background "
        "on why this single sentence still needs to read as one continuous "
        "unit that exceeds the flavored profile's sentence length limit."
    )
    path = write_file("note.md", sentence + "\n")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "SEN001") == 1


def test_long_paragraph_requires_both_sentence_and_word_caps(cli, write_file):
    """STR001 must only fire when a prose paragraph exceeds BOTH the
    sentence-count cap AND the word-count cap (the documented fix for the
    list false positive), not either alone."""
    # Many very short sentences: exceeds the strict sentence-count cap (6)
    # but stays far under the strict word-count cap (120) -> must NOT fire.
    short_many = " ".join(n_word_sentence(3) for _ in range(9))
    path = write_file("short_many.md", short_many + "\n")
    payload = lint_json(cli, path, extra_args=["--profile", "strict"])
    entry = first_file(payload)
    assert count_id(entry, "STR001") == 0

    # Fewer, longer sentences that exceed both caps at once -> must fire.
    long_many = " ".join(n_word_sentence(18) for _ in range(8))
    path2 = write_file("long_many.md", long_many + "\n")
    payload2 = lint_json(cli, path2, extra_args=["--profile", "strict"])
    entry2 = first_file(payload2)
    assert count_id(entry2, "STR001") >= 1


def test_indented_code_block_masked_but_list_continuation_kept(cli, write_file):
    """A standalone 4-space indented block is code and must be masked; a
    4-space continuation line inside a list item is prose and must not be."""
    content = (
        "Intro paragraph with no violations at all in it whatsoever here.\n\n"
        "    This standalone indented block has an em dash — inside it.\n\n"
        "- A bullet with a continuation line that\n"
        "    wraps here and keeps a real em dash — right in the prose.\n"
    )
    path = write_file("note.md", content)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "PUN002") == 1


def test_word_count_reported(cli, write_file):
    """The reported word count matches a hand-countable simple sentence."""
    path = write_file("note.md", n_word_sentence(12) + "\n")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert entry["words"] == 12


def test_score_suppressed_below_min_words(cli, write_file):
    """Texts under min_words (default 40) report score as n/a, not a number."""
    path = write_file("short.md", n_word_sentence(10) + "\n")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    score = entry["score"]
    assert score is None or (isinstance(score, str) and "n/a" in score.lower())


def test_score_reported_above_min_words(cli, write_file):
    """Once a text clears min_words, score is a real number."""
    text = " ".join(n_word_sentence(10) for _ in range(5))  # 50 words total
    path = write_file("long.md", text + "\n")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert isinstance(entry["score"], (int, float))
