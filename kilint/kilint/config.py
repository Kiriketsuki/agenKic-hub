"""Configuration discovery, merging, profile resolution, and path routing."""

from __future__ import annotations

import fnmatch
import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from . import profiles as _profiles

TOP_LEVEL_KEYS = {
    "default_profile", "min_words", "fail_over", "comment_sentence_bonus",
    "comment_min_words", "weights", "rules", "words", "terminology", "paths",
    "profiles",
}

WORD_LIST_KEYS = set(_profiles.DEFAULT_WORDS)

KNOWN_RULE_IDS = set(_profiles.ALL_RULE_IDS)

DEFAULT_WEIGHTS = {"error": 1.0, "warn": 0.6, "info": 0.25}

SEVERITIES = {"error", "warn", "info", "off"}

CONFIG_NAME = ".kilint.toml"
SHIPPED_CONFIG = Path(__file__).resolve().parent.parent / "kilint.toml"


class ConfigError(Exception):
    """Raised for an unreadable or invalid configuration."""


@dataclass(frozen=True)
class Resolved:
    """Everything a rule needs for one file."""

    profile: str
    max_sentence_words: int
    max_paragraph_sentences: int
    max_paragraph_words: int
    threshold: float
    severities: dict[str, str]
    words: dict[str, list[str]]
    terminology: dict[str, list[str]]
    weights: dict[str, float]
    min_words: int
    comment_sentence_bonus: int
    comment_min_words: int

    def severity(self, rule_id: str) -> str:
        return self.severities.get(rule_id, "off")

    def active(self, rule_id: str) -> bool:
        return self.severity(rule_id) != "off"


def _deep_merge(base: dict, override: dict) -> dict:
    """Merge override onto base. Tables merge, arrays replace, extend_* appends."""
    result = dict(base)
    for key, value in override.items():
        if key.startswith("extend_") and isinstance(value, list):
            existing = result.get(key)
            result[key] = list(existing) + list(value) if isinstance(existing, list) else list(value)
        elif isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _read_toml(path: Path) -> dict:
    try:
        with open(path, "rb") as handle:
            return tomllib.load(handle)
    except OSError as exc:
        raise ConfigError(f"cannot read config {path}: {exc}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"invalid TOML in {path}: {exc}") from exc


def _validate(data: dict, path: Path) -> None:
    unknown = sorted(set(data) - TOP_LEVEL_KEYS)
    if unknown:
        raise ConfigError(f"{path}: unknown top-level key(s): {', '.join(unknown)}")
    for rule_id, severity in (data.get("rules") or {}).items():
        if rule_id.upper() not in KNOWN_RULE_IDS:
            known = ", ".join(sorted(KNOWN_RULE_IDS))
            raise ConfigError(f"{path}: unknown rule id '{rule_id}' in [rules]. Known ids: {known}")
        if str(severity) not in SEVERITIES:
            raise ConfigError(f"{path}: rule {rule_id} has bad severity '{severity}'")
    for key in (data.get("words") or {}):
        base = key.split("_", 1)[1] if key.startswith(("extend_", "replace_")) else key
        if base not in WORD_LIST_KEYS:
            raise ConfigError(f"{path}: unknown word list '{key}'")
    for entry in (data.get("paths") or []):
        if "glob" not in entry:
            raise ConfigError(f"{path}: every [[paths]] entry needs a glob")


def discover(target: Path | None, explicit: str | None = None) -> list[Path]:
    """Return config files, highest priority first."""
    found: list[Path] = []

    def add(candidate: Path | None) -> None:
        if candidate and candidate.is_file() and candidate not in found:
            found.append(candidate)

    if explicit:
        candidate = Path(explicit).expanduser()
        if not candidate.is_file():
            raise ConfigError(f"config not found: {candidate}")
        add(candidate)
    env = os.environ.get("KILINT_CONFIG")
    if env:
        add(Path(env).expanduser())
    if target is not None:
        start = target if target.is_dir() else target.parent
        for directory in [start, *start.parents]:
            add(directory / CONFIG_NAME)
    add(Path.home() / ".config" / "kilint" / "config.toml")
    add(SHIPPED_CONFIG)
    return found


@dataclass
class Config:
    data: dict = field(default_factory=dict)
    sources: list[Path] = field(default_factory=list)
    root: Path = field(default_factory=Path.cwd)

    @property
    def default_profile(self) -> str:
        return str(self.data.get("default_profile", "flavored"))

    @property
    def min_words(self) -> int:
        return int(self.data.get("min_words", 40))

    @property
    def fail_over(self) -> float | None:
        value = self.data.get("fail_over", "unset")
        if value == "unset" or value is None:
            return None
        return float(value)

    @property
    def weights(self) -> dict[str, float]:
        merged = dict(DEFAULT_WEIGHTS)
        merged.update({k: float(v) for k, v in (self.data.get("weights") or {}).items()})
        return merged

    def profile_table(self) -> dict[str, dict]:
        table = {name: dict(entry) for name, entry in _profiles.BUILTIN_PROFILES.items()}
        for name, entry in (self.data.get("profiles") or {}).items():
            base = table.get(name, {})
            table[name] = _deep_merge(base, entry)
        return table

    def word_lists(self) -> dict[str, list[str]]:
        merged = {key: list(value) for key, value in _profiles.DEFAULT_WORDS.items()}
        section = self.data.get("words") or {}
        for key, value in section.items():
            if key.startswith("extend_"):
                name = key[len("extend_"):]
                merged[name] = merged.get(name, []) + list(value)
            elif key.startswith("replace_"):
                merged[key[len("replace_"):]] = list(value)
            else:
                merged[key] = list(value)
        return merged

    def terminology(self) -> dict[str, list[str]]:
        return {str(k): [str(a) for a in v] for k, v in (self.data.get("terminology") or {}).items()}

    def route(self, path: Path | None) -> str | None:
        """Last matching [[paths]] entry wins."""
        entries = self.data.get("paths") or []
        if path is None or not entries:
            return None
        absolute = Path(path).resolve()
        try:
            relative = absolute.relative_to(self.root).as_posix()
        except ValueError:
            relative = absolute.as_posix()
        candidates = (relative, absolute.as_posix())
        chosen: str | None = None
        for entry in entries:
            glob = str(entry["glob"])
            if any(_glob_match(glob, candidate) for candidate in candidates):
                chosen = str(entry.get("profile", self.default_profile))
        return chosen

    def resolve(self, path: Path | None, forced_profile: str | None = None,
                extra_disable: tuple[str, ...] = ()) -> Resolved:
        name = forced_profile or self.route(path) or self.default_profile
        table = self.profile_table()
        try:
            profile = _profiles.resolve_profile(name, table)
        except ValueError as exc:
            raise ConfigError(str(exc)) from exc
        severities = {k: str(v) for k, v in profile["rules"].items()}
        for rule_id, severity in (self.data.get("rules") or {}).items():
            severities[rule_id.upper()] = str(severity)
        for rule_id in extra_disable:
            severities[rule_id.upper()] = "off"
        threshold = profile["threshold"]
        if self.fail_over is not None:
            threshold = self.fail_over
        return Resolved(
            profile=name,
            max_sentence_words=int(profile["max_sentence_words"]),
            max_paragraph_sentences=int(profile["max_paragraph_sentences"]),
            max_paragraph_words=int(profile["max_paragraph_words"]),
            threshold=float(threshold),
            severities=severities,
            words=self.word_lists(),
            terminology=self.terminology(),
            weights=self.weights,
            min_words=self.min_words,
            comment_sentence_bonus=int(self.data.get("comment_sentence_bonus", 10)),
            comment_min_words=int(self.data.get("comment_min_words", 6)),
        )


def _glob_match(pattern: str, path: str) -> bool:
    pattern = pattern.replace("\\", "/")
    if fnmatch.fnmatchcase(path, pattern):
        return True
    if pattern.startswith("**/") and fnmatch.fnmatchcase(path, pattern[3:]):
        return True
    if pattern.endswith("/**") and fnmatch.fnmatchcase(path, pattern[:-3]):
        return True
    return False


_CACHE: dict[tuple, Config] = {}


def clear_cache() -> None:
    _CACHE.clear()


def load(target: Path | None = None, explicit: str | None = None) -> Config:
    """Load and merge configuration for a target path. Results are cached."""
    sources = discover(target, explicit)
    root = _config_root(sources, target)
    key = (tuple(str(s) for s in sources), str(root))
    cached = _CACHE.get(key)
    if cached is not None:
        return Config(data=cached.data, sources=list(sources), root=root)
    data: dict = {}
    for source in reversed(sources):
        parsed = _read_toml(source)
        _validate(parsed, source)
        data = _deep_merge(data, parsed)
    config = Config(data=data, sources=sources, root=root)
    _CACHE[key] = config
    return config


def _config_root(sources: list[Path], target: Path | None) -> Path:
    """The directory that relative path globs are measured from.

    The nearest project config wins. Failing that, the repository root above the
    target, so the shipped vault globs still resolve. Failing that, the cwd.
    """
    for source in sources:
        if source.name == CONFIG_NAME:
            return source.resolve().parent
    repo = _repo_root(target)
    if repo is not None:
        return repo
    return Path.cwd()


def _repo_root(target: Path | None) -> Path | None:
    if target is None:
        return None
    start = target.resolve()
    start = start if start.is_dir() else start.parent
    for directory in [start, *start.parents]:
        if (directory / ".git").exists():
            return directory
    return None
