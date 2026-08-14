"""Regex constants and word-list compilation used by the rules.

Word-list entries are matched on word boundaries and case-insensitively. A
trailing `*` on an entry opts that entry into prefix matching, so `unlock` never
matches `unlocked` unless the list says `unlock*`.
"""

from __future__ import annotations

import re

BE_WORDS = ("been", "being", "be", "am", "is", "are", "was", "were", "gets", "got", "get")
BE = r"(?:" + "|".join(BE_WORDS) + r")"
MODALS = ("may", "might", "could", "should", "would", "can")

EMOJI = re.compile(
    "["
    "\U0001F000-\U0001FAFF"   # pictographs, faces, symbols, extended-A
    "\U00002600-\U000026FF"   # miscellaneous symbols
    "\U00002700-\U000027BF"   # dingbats
    "\U00002B00-\U00002BFF"   # arrows and geometric shapes
    "\U0000FE0F\U0000FE0E"    # variation selectors
    "\U000024C2"
    "]"
)
CONTRACTION = re.compile(r"\b([A-Za-z]+)['’](t|re|ve|ll|d|s|m)\b")
SEMICOLON = re.compile(r";")
DASH = re.compile(r"[—–]")
BANG = re.compile(r"!")
SMART_QUOTE = re.compile(r"[“”‘’]")
QUOTED = re.compile(r'"[^"\n]*"|“[^”\n]*”')
NOMINAL_VERB = re.compile(
    r"\b(?:perform(?:s|ed|ing)?|conduct(?:s|ed|ing)?|carry out|carries out|carried out"
    r"|carrying out|make use of|makes use of|made use of|provide support for"
    r"|provides support for|undertak(?:e|es|ing)|undertook)\b",
    re.I,
)
CONDITION = re.compile(r",?\s+\b(?:if|when|unless|once|after)\b\s+\S+(?:\s+\S+){0,2}", re.I)
JOINER = re.compile(r",\s+and\s+|\s+and\s+then\s+|,\s+then\s+")
FIRST_WORD = re.compile(r"\s*([A-Za-z][A-Za-z\-]*)")
MODAL = re.compile(r"\b(" + "|".join(MODALS) + r")\b", re.I)
HEDGE = re.compile(r"\b(help|helps|try|tries|attempt|attempts)\b", re.I)

# Sequencing adverbs that sit between a joiner and the second imperative verb.
JOINER_ADVERBS = ("then", "also", "next", "afterwards", "finally", "again")

# Words that mark the following word-list hit as a mention of a banned term
# rather than a use of it, as in `use (not utilize)`.
NEGATION_LEAD = re.compile(
    r"\b(?:not|never|avoid|instead\s+of|rather\s+than)\s+\W{0,3}$", re.I
)


def compile_list(entries: list[str]) -> re.Pattern[str] | None:
    """Build one word-boundary, case-insensitive alternation from a word list."""
    parts: list[str] = []
    for entry in entries:
        if not entry:
            continue
        prefix = entry.endswith("*")
        core = entry[:-1] if prefix else entry
        body = re.escape(core).replace(r"\ ", r"\s+")
        parts.append(body + (r"[A-Za-z'’\-]*" if prefix else ""))
    if not parts:
        return None
    parts.sort(key=len, reverse=True)
    return re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(parts) + r")(?![A-Za-z0-9])", re.I)


def passive_pattern(irregular: list[str]) -> re.Pattern[str]:
    """A be-verb, an optional adverb, then a past participle."""
    alternates = "|".join(re.escape(word) for word in irregular)
    tail = rf"(?:[A-Za-z]+ed|{alternates})" if alternates else r"(?:[A-Za-z]+ed)"
    return re.compile(rf"\b{BE}\s+(?:[A-Za-z]+ly\s+)?{tail}\b", re.I)


def progressive_pattern() -> re.Pattern[str]:
    return re.compile(rf"\b{BE}\s+(?:[A-Za-z]+ly\s+)?([A-Za-z]+ing)\b", re.I)


def allow_patterns(entries: list[str]) -> list[re.Pattern[str]]:
    """Adjectival participles that are not really passive.

    An entry that starts with a be-verb matches any be-verb, so `is based on`
    also covers `are based on` and `was based on`.
    """
    patterns: list[re.Pattern[str]] = []
    for entry in entries:
        tokens = entry.split()
        if not tokens:
            continue
        if tokens[0].lower() in BE_WORDS:
            rest = r"\s+".join(re.escape(t) for t in tokens[1:])
            body = BE + (r"\s+" + rest if rest else "")
        else:
            body = r"\s+".join(re.escape(t) for t in tokens)
        patterns.append(re.compile(body, re.I))
    return patterns
