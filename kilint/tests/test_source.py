"""Tests for source.py: comment/docstring extraction for code files.

SPEC.md requires: Python docstrings and comments via tokenize; a `//`
inside a JS string literal must not be treated as a comment; short
comments are skipped; unknown extensions are refused unless --as is given.
All driven through the CLI + --format json.
"""
from __future__ import annotations

from conftest import count_id, first_file, lint_json


def test_python_module_docstring_is_linted(cli, copy_fixture):
    path = copy_fixture("comment_sample.py")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "WRD002") >= 1  # "utilize" / "facilitate" in docstrings


def test_python_function_docstring_is_linted(cli, copy_fixture):
    path = copy_fixture("comment_sample.py")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "VRB001") >= 1  # "is returned by" in the helper docstring


def test_python_long_enough_comment_is_linted(cli, copy_fixture):
    path = copy_fixture("comment_sample.py")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    excerpts = " ".join(v["excerpt"] for v in entry["violations"])
    assert "ensure" in excerpts.lower()


def test_python_short_comment_is_skipped(cli, write_file):
    """A comment under comment_min_words (default 6) is skipped entirely,
    even if it happens to contain a trigger word."""
    content = (
        "def f():\n"
        "    # please ensure ok\n"
        "    return 1\n"
    )
    path = write_file("short_comment.py", content)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert entry["violations"] == []


def test_python_code_and_string_literals_are_never_linted(cli, write_file):
    content = (
        "def utilize_cache():\n"
        '    msg = "please ensure this string literal is never linted at all"\n'
        "    return msg\n"
    )
    path = write_file("code_only.py", content)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert entry["violations"] == []


def test_python_comment_sentence_bonus_raises_the_cap(cli, write_file):
    """A sentence long enough to trip SEN001 in prose must NOT trip it as
    a comment, thanks to the +10 word comment_sentence_bonus."""
    words = ["field"] * 30  # 30 words: over the flavored prose cap (25),
    sentence = " ".join(words) + "."  # but under the comment-adjusted cap (35).
    py_content = f"def f():\n    # {sentence} plus extra words padding here\n    return 1\n"
    py_path = write_file("bonus.py", py_content)
    py_payload = lint_json(cli, py_path)
    py_entry = first_file(py_payload)
    assert count_id(py_entry, "SEN001") == 0

    md_path = write_file("bonus.md", sentence + " plus extra words padding here.\n")
    md_payload = lint_json(cli, md_path)
    md_entry = first_file(md_payload)
    assert count_id(md_entry, "SEN001") >= 1


def test_python_str001_forced_off_for_comments(cli, write_file):
    many_short_sentences = " ".join(f"Step {i} happens now." for i in range(1, 10))
    content = f'"""{many_short_sentences}"""\n\n\ndef f():\n    return 1\n'
    path = write_file("many_sentences.py", content)
    payload = lint_json(cli, path, extra_args=["--profile", "strict"])
    entry = first_file(payload)
    assert count_id(entry, "STR001") == 0


def test_js_double_slash_inside_string_literal_is_not_a_comment(cli, copy_fixture):
    """The required negative case: a real top-of-file comment triggers
    once; the '//' embedded inside the string literal on the next line
    must not be treated as a second, phantom comment."""
    path = copy_fixture("string_trap.js")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "WRD002") == 1  # only the real leading comment


def test_js_string_literal_line_produces_no_violation_of_its_own(cli, copy_fixture):
    path = copy_fixture("string_trap.js")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    for violation in entry["violations"]:
        assert "const message" not in violation["excerpt"]


def test_ts_block_and_jsdoc_comments_are_linted(cli, copy_fixture):
    path = copy_fixture("comment_sample.ts")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "WRD002") >= 1  # "facilitate" in the JSDoc block
    assert count_id(entry, "WRD003") >= 1  # "seamless" in the JSDoc block


def test_shell_comment_respects_quoted_hash(cli, copy_fixture):
    """A '#' inside a double-quoted string in a shell script must not
    start a comment; only the real trailing comment line should be linted."""
    path = copy_fixture("comment_sample.sh")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "WRD002") == 1


def test_lua_dash_comments_are_linted(cli, write_file):
    content = (
        "-- please ensure this comment obeys the minimum length threshold here\n"
        "local x = 1\n"
        "--[[ please ensure this block comment is also linted across enough words ]]\n"
    )
    path = write_file("sample.lua", content)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "WRD002") >= 1


def test_unknown_extension_refused_without_as_flag(cli, copy_fixture):
    path = copy_fixture("unknown_ext.xyz")
    result = cli([str(path)])
    assert result.returncode == 2
    assert result.stderr.strip() != ""


def test_unknown_extension_accepted_with_as_text(cli, copy_fixture):
    path = copy_fixture("unknown_ext.xyz")
    result = cli([str(path), "--as", "text", "--format", "json"])
    assert result.returncode in (0, 1)
