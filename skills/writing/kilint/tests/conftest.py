"""Shared fixtures and helpers for the kilint test suite.

This suite is written from SPEC.md alone, without reading the kilint
package's implementation. Per the task's own guidance: when an internal
detail is not nailed down by the spec, test the public behaviour instead.
Concretely that means almost everything here drives the package through
`python -m kilint` and asserts against the documented `--format json`
schema and exit codes, rather than importing private helpers out of
kilint.text / kilint.rules / kilint.config / kilint.source.

The only import from the package itself is the top-level public surface
documented in SPEC.md's Layout section: "kilint/__init__.py - __version__,
public lint() API".
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

# The kilint project root: the directory that directly contains the
# "kilint" package, the shipped kilint.toml, and this tests/ directory.
# Derived from this file's location so nothing in the suite hardcodes an
# absolute path into the vault.
PKG_ROOT = Path(__file__).resolve().parent.parent
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

@pytest.fixture(autouse=True)
def isolated_env(monkeypatch, tmp_path):
    """Give every test a private HOME and a clean slate of kilint env vars.

    Without this, a real ~/.config/kilint/config.toml on the dev machine
    (or a leftover KILINT_CONFIG) could silently change which profile a
    test resolves to.
    """
    fake_home = tmp_path / "_home"
    fake_home.mkdir(exist_ok=True)
    monkeypatch.setenv("HOME", str(fake_home))
    monkeypatch.delenv("KILINT_CONFIG", raising=False)
    monkeypatch.delenv("NO_COLOR", raising=False)
    return fake_home


def run_kilint(args, cwd=None, input_text=None, env=None, timeout=30):
    """Invoke `python -m kilint` as a subprocess, return the CompletedProcess."""
    full_env = dict(os.environ)
    existing_pp = full_env.get("PYTHONPATH", "")
    full_env["PYTHONPATH"] = (
        str(PKG_ROOT) if not existing_pp else str(PKG_ROOT) + os.pathsep + existing_pp
    )
    if env:
        full_env.update(env)
    return subprocess.run(
        [sys.executable, "-m", "kilint", *args],
        cwd=str(cwd) if cwd else str(PKG_ROOT),
        input=input_text,
        capture_output=True,
        text=True,
        env=full_env,
        timeout=timeout,
    )


@pytest.fixture
def cli(tmp_path):
    """Factory fixture: cli(args, ...) -> CompletedProcess, cwd defaults to tmp_path."""

    def _run(args, cwd=None, input_text=None, env=None):
        return run_kilint(args, cwd=cwd or tmp_path, input_text=input_text, env=env)

    return _run


@pytest.fixture
def write_file(tmp_path):
    """Factory fixture: write_file("rel/name.md", "content") -> Path."""

    def _write(name, content):
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    return _write


@pytest.fixture
def copy_fixture(tmp_path):
    """Factory fixture: copy_fixture("hero_baseline.md") -> Path in tmp_path.

    Copies a static fixture's *content* into an isolated tmp_path file, so
    linting it never picks up any ambient config that might live near the
    real fixtures/ directory on disk.
    """

    def _copy(name, dest_name=None):
        src = FIXTURES_DIR / name
        content = src.read_text(encoding="utf-8")
        dest = tmp_path / (dest_name or name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")
        return dest

    return _copy


def lint_json(cli_fn, path, extra_args=None):
    """Run kilint on a single path with --format json, return the parsed payload."""
    result = cli_fn([str(path), "--format", "json", *(extra_args or [])])
    assert result.returncode in (0, 1), (
        f"expected exit 0 or 1, got {result.returncode}\n"
        f"stdout={result.stdout!r}\nstderr={result.stderr!r}"
    )
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"stdout was not valid JSON: {result.stdout!r}") from exc


def first_file(payload):
    assert payload["files"], f"expected at least one file entry, got {payload}"
    return payload["files"][0]


def find_file(payload, name):
    for entry in payload["files"]:
        if entry["path"] == name or entry["path"].endswith("/" + name) or entry["path"].endswith(name):
            return entry
    raise AssertionError(f"no file entry ending in {name!r} among {[f['path'] for f in payload['files']]}")


def violation_ids(entry):
    return [v["rule_id"] for v in entry["violations"]]


def count_id(entry, rule_id):
    return violation_ids(entry).count(rule_id)


def n_word_sentence(n, filler="field"):
    """Build a grammar-free sentence with exactly n word-tokens.

    Uses a neutral filler word that does not appear in any default
    kilint word list, so the sentence trips length-based rules (SEN001,
    STR001) without accidentally tripping word-list rules (WRD00x).
    """
    assert n >= 1
    words = [filler] * n
    text = " ".join(words) + "."
    return text[0].upper() + text[1:]


def toml_write(tmp_path, name, content):
    """Write a dedented TOML fragment to tmp_path/name and return the Path."""
    path = tmp_path / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content).lstrip("\n"), encoding="utf-8")
    return path


@pytest.fixture
def toml_file(tmp_path):
    def _write(name, content):
        return toml_write(tmp_path, name, content)

    return _write
