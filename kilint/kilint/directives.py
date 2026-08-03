"""Frontmatter reading and suppression directives.

The frontmatter reader is deliberately small and hand-rolled. kilint has no YAML
dependency, and the only key it cares about is `kilint:`.
"""

from __future__ import annotations

import bisect
import re
from dataclasses import dataclass, field

from .masking import line_starts

DIRECTIVE_RE = re.compile(
    r"kilint-(disable-file|disable-next-line|disable|enable)"
    r"((?:[ \t]+[A-Za-z0-9_]+(?:[ \t]*,[ \t]*[A-Za-z0-9_]+)*)?)"
)

_OFF_VALUES = {"off", "false", "no", "none", "disabled"}
_MISSING = "missing"


@dataclass
class Suppressions:
    file_disabled: bool = False
    next_line: dict[int, frozenset[str] | None] = field(default_factory=dict)
    regions: list[tuple[int, int, frozenset[str] | None]] = field(default_factory=list)
    ids_seen: set[str] = field(default_factory=set)

    def allows(self, line: int, rule_id: str) -> bool:
        """True when the rule is still active at this 1-based line."""
        if self.file_disabled:
            return False
        ids = self.next_line.get(line, _MISSING)
        if ids != _MISSING and (ids is None or rule_id in ids):
            return False
        for start, end, region_ids in self.regions:
            if start <= line <= end and (region_ids is None or rule_id in region_ids):
                return False
        return True


@dataclass
class Frontmatter:
    present: bool = False
    disabled: bool = False
    profile: str | None = None
    disable: tuple[str, ...] = ()


def split_frontmatter(raw: str) -> tuple[int, int]:
    """Return (start, end) offsets of the YAML frontmatter body, or (0, 0)."""
    if not raw.startswith("---"):
        return 0, 0
    first_nl = raw.find("\n")
    if first_nl == -1 or raw[:first_nl].strip() != "---":
        return 0, 0
    for match in re.finditer(r"^(---|\.\.\.)[ \t]*$", raw[first_nl + 1:], re.M):
        return first_nl + 1, first_nl + 1 + match.start()
    return 0, 0


def parse_frontmatter(block: str) -> Frontmatter:
    """Read the `kilint:` key, either inline or as a small indented block."""
    front = Frontmatter(present=bool(block.strip()))
    lines = block.split("\n")
    for index, line in enumerate(lines):
        match = re.match(r"^kilint:[ \t]*(.*)$", line)
        if not match:
            continue
        value = match.group(1).strip()
        if value:
            if value.lower() in _OFF_VALUES:
                front.disabled = True
            else:
                front.profile = value.strip("\"'")
            return front
        _read_block(lines[index + 1:], front)
        return front
    return front


def _read_block(lines: list[str], front: Frontmatter) -> None:
    for nested in lines:
        if not nested.strip():
            continue
        if not re.match(r"^[ \t]+\S", nested):
            return
        pair = re.match(r"^[ \t]+([A-Za-z_]+):[ \t]*(.*)$", nested)
        if not pair:
            continue
        key, value = pair.group(1).lower(), pair.group(2).strip()
        if key == "profile":
            front.profile = value.strip("\"'")
        elif key == "disable":
            front.disable = tuple(i.upper() for i in re.findall(r"[A-Za-z0-9_]+", value))
        elif key in {"enabled", "active"} and value.lower() in _OFF_VALUES:
            front.disabled = True


def _inside(ranges: list[tuple[int, int]], offset: int) -> bool:
    """Membership test against merged, sorted, non-overlapping ranges."""
    index = bisect.bisect_right([start for start, _ in ranges], offset) - 1
    if index < 0:
        return False
    start, end = ranges[index]
    return start <= offset < end


def collect(raw: str, chars: list[str], known_ids: set[str],
            inert: list[tuple[int, int]] | None = None) -> tuple[Suppressions, list[str]]:
    """Read every directive, then blank it so the directive is not linted.

    Returns the suppressions and any rule ids that are not in the registry.
    """
    starts = line_starts(raw)
    inert = inert or []
    sup = Suppressions()
    unknown: list[str] = []
    open_regions: dict[str | None, int] = {}
    for match in DIRECTIVE_RE.finditer(raw):
        if _inside(inert, match.start()):
            continue
        kind = match.group(1)
        ids = tuple(i.upper() for i in re.findall(r"[A-Za-z0-9_]+", match.group(2) or ""))
        for rule_id in ids:
            sup.ids_seen.add(rule_id)
            if known_ids and rule_id not in known_ids:
                unknown.append(rule_id)
        selected: frozenset[str] | None = frozenset(ids) if ids else None
        line = bisect.bisect_right(starts, match.start())
        if kind == "disable-file":
            sup.file_disabled = True
        elif kind == "disable-next-line":
            _add_next_line(sup, line + 1, selected)
        elif kind == "disable":
            for key in (ids or (None,)):
                open_regions.setdefault(key, line + 1)
        else:
            _close_regions(sup, open_regions, ids, line)
        for pos in range(match.start(), match.end()):
            if chars[pos] != "\n":
                chars[pos] = " "
    end_line = len(starts) + 1
    for key, start_line in open_regions.items():
        sup.regions.append((start_line, end_line, frozenset([key]) if key else None))
    return sup, unknown


def _add_next_line(sup: Suppressions, line: int, selected: frozenset[str] | None) -> None:
    existing = sup.next_line.get(line, _MISSING)
    if existing == _MISSING or selected is None or existing is None:
        sup.next_line[line] = None if selected is None or existing is None else selected
    else:
        sup.next_line[line] = existing | selected


def _close_regions(sup: Suppressions, open_regions: dict[str | None, int],
                   ids: tuple[str, ...], line: int) -> None:
    if not ids:
        for key in list(open_regions):
            start = open_regions.pop(key)
            sup.regions.append((start, line, frozenset([key]) if key else None))
        return
    for key in ids:
        start = open_regions.pop(key, None)
        if start is not None:
            sup.regions.append((start, line, frozenset([key])))
