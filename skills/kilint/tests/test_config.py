"""Tests for config.py's documented contract: discovery order, deep merge,
extends, extend_* append semantics, last-match-wins path routing, and
unknown key rejection (SPEC.md "Config (config.py)").

Driven through the CLI + --format json, since config.py exposes no public
function names in SPEC.md beyond the discovery/merge *behaviour*.
"""
from __future__ import annotations

from conftest import count_id, first_file, lint_json


def _profile_of(cli, path, extra_args=None):
    payload = lint_json(cli, path, extra_args=extra_args)
    return first_file(payload)["profile"]


def test_discovery_nearest_kilint_toml_beats_home_config(cli, write_file, toml_file, isolated_env):
    # Item 4: ~/.config/kilint/config.toml
    home_config_dir = isolated_env / ".config" / "kilint"
    home_config_dir.mkdir(parents=True, exist_ok=True)
    (home_config_dir / "config.toml").write_text(
        'default_profile = "tier4"\n\n[profiles.tier4]\nextends = "flavored"\n',
        encoding="utf-8",
    )

    # Item 3: nearest .kilint.toml walking up from the linted file
    sub = write_file("project/sub/note.md", "placeholder\n").parent
    toml_file(
        "project/sub/.kilint.toml",
        """
        default_profile = "tier3"

        [profiles.tier3]
        extends = "flavored"
        """,
    )
    note = sub / "note.md"

    profile = _profile_of(cli, note)
    assert profile == "tier3"


def test_discovery_kilint_config_env_beats_nearest_toml(cli, write_file, toml_file, monkeypatch):
    note = write_file("project/note.md", "placeholder\n")
    toml_file(
        "project/.kilint.toml",
        """
        default_profile = "tier3"

        [profiles.tier3]
        extends = "flavored"
        """,
    )
    env_config = toml_file(
        "elsewhere/env.toml",
        """
        default_profile = "tier2"

        [profiles.tier2]
        extends = "flavored"
        """,
    )
    monkeypatch.setenv("KILINT_CONFIG", str(env_config))
    profile = _profile_of(cli, note)
    assert profile == "tier2"


def test_discovery_explicit_config_flag_wins_over_everything(cli, write_file, toml_file, monkeypatch):
    note = write_file("project/note.md", "placeholder\n")
    toml_file(
        "project/.kilint.toml",
        """
        default_profile = "tier3"

        [profiles.tier3]
        extends = "flavored"
        """,
    )
    env_config = toml_file(
        "elsewhere/env.toml",
        """
        default_profile = "tier2"

        [profiles.tier2]
        extends = "flavored"
        """,
    )
    monkeypatch.setenv("KILINT_CONFIG", str(env_config))
    explicit_config = toml_file(
        "explicit/cfg.toml",
        """
        default_profile = "tier1"

        [profiles.tier1]
        extends = "flavored"
        """,
    )
    profile = _profile_of(cli, note, extra_args=["--config", str(explicit_config)])
    assert profile == "tier1"


def test_deep_merge_of_rules_table_across_tiers(cli, write_file, toml_file, isolated_env):
    """Two configs each set a different key under [rules]; both overrides
    must survive the merge (deep merge of tables, not wholesale replace)."""
    home_config_dir = isolated_env / ".config" / "kilint"
    home_config_dir.mkdir(parents=True, exist_ok=True)
    (home_config_dir / "config.toml").write_text(
        '[rules]\nWRD008 = "info"\n', encoding="utf-8"
    )

    toml_file(
        "project/.kilint.toml",
        """
        [rules]
        SEN001 = "warn"
        """,
    )

    text = (
        "Several various issues were reported by several different users this week regarding "
        "the newly deployed configuration change that went out earlier today across every "
        "single team in the organization without exception this time around.\n"
    )
    path = write_file("project/body.md", text)
    payload = lint_json(cli, path)
    entry = first_file(payload)

    ids_and_sev = {v["rule_id"]: v["severity"] for v in entry["violations"]}
    assert "WRD008" in ids_and_sev, "home-tier [rules] override was dropped by the merge"
    assert ids_and_sev["WRD008"] == "info"
    assert "SEN001" in ids_and_sev, "local-tier [rules] override was dropped by the merge"
    assert ids_and_sev["SEN001"] == "warn"


def test_extends_inherits_unset_thresholds_and_rule_states(cli, write_file, toml_file):
    """A profile that extends "strict" and only overrides one threshold
    must still inherit strict's other settings, including STR002 being on."""
    toml_file(
        ".kilint.toml",
        """
        default_profile = "custom"

        [profiles.custom]
        extends = "strict"
        max_sentence_words = 50
        """,
    )
    # 30 words: over strict's own cap (20) but under the raised custom cap (50).
    thirty_words = " ".join(["field"] * 30) + "."
    path = write_file("note.md", thirty_words + "\n")
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "SEN001") == 0, "custom profile did not inherit the raised threshold"

    condition_after_command = "Restart the server if it becomes unresponsive during peak hours.\n"
    path2 = write_file("cond.md", condition_after_command)
    payload2 = lint_json(cli, path2)
    entry2 = first_file(payload2)
    assert count_id(entry2, "STR002") >= 1, "custom profile did not inherit STR002 being on from strict"


def test_extend_marketing_appends_without_dropping_defaults(cli, write_file, toml_file):
    toml_file(
        ".kilint.toml",
        """
        [words]
        extend_marketing = ["frictionless"]
        """,
    )
    text = "Our frictionless and seamless platform delivers results for every team.\n"
    path = write_file("note.md", text)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    excerpts = " ".join(v["excerpt"].lower() for v in entry["violations"] if v["rule_id"] == "WRD003")
    assert "frictionless" in excerpts, "extend_marketing did not add the new word"
    assert "seamless" in excerpts, "extend_marketing wrongly replaced the default list"


def test_replace_long_word_wholesale_replaces_the_list(cli, write_file, toml_file):
    toml_file(
        ".kilint.toml",
        """
        [words]
        replace_long_word = []
        """,
    )
    text = "Please utilize the correct method for this task every single day.\n"
    path = write_file("note.md", text)
    payload = lint_json(cli, path)
    entry = first_file(payload)
    assert count_id(entry, "WRD002") == 0, "replace_long_word = [] should wholesale-replace the list"


def test_last_match_wins_path_routing_by_order_not_specificity(cli, write_file, toml_file):
    """SPEC.md: '[[paths]] entries are evaluated in order, last match wins'
    -- positional, not most-specific-wins."""
    toml_file(
        ".kilint.toml",
        """
        [[paths]]
        glob = "sub/**"
        profile = "strict"

        [[paths]]
        glob = "sub/nested/**"
        profile = "prose"
        """,
    )
    note = write_file("sub/nested/note.md", "placeholder\n")
    assert _profile_of(cli, note) == "prose"

    # Reverse the order: now the broad glob is listed last and must win,
    # even though the specific glob also matches.
    toml_file(
        ".kilint.toml",
        """
        [[paths]]
        glob = "sub/nested/**"
        profile = "prose"

        [[paths]]
        glob = "sub/**"
        profile = "strict"
        """,
    )
    assert _profile_of(cli, note) == "strict"


def test_path_routing_matches_relative_to_config_directory(cli, write_file, toml_file):
    toml_file(
        "root/.kilint.toml",
        """
        [[paths]]
        glob = "docs/**"
        profile = "prose"
        """,
    )
    note = write_file("root/docs/guide.md", "placeholder\n")
    assert _profile_of(cli, note) == "prose"


def test_unknown_top_level_key_is_rejected(cli, write_file, toml_file):
    toml_file(
        ".kilint.toml",
        """
        default_profile = "flavored"
        this_key_does_not_exist_anywhere = true
        """,
    )
    note = write_file("note.md", "placeholder text that is otherwise perfectly fine here.\n")
    result = cli([str(note)])
    assert result.returncode == 2
    assert result.stderr.strip() != ""


def test_unknown_rule_id_in_rules_table_is_rejected(cli, write_file, toml_file):
    toml_file(
        ".kilint.toml",
        """
        [rules]
        ZZZ999 = "error"
        """,
    )
    note = write_file("note.md", "placeholder text that is otherwise perfectly fine here.\n")
    result = cli([str(note)])
    assert result.returncode == 2
