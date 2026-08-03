"""Offset preserving masking.

Every stage replaces a masked span with spaces of the same length. Nothing is
ever deleted, so a violation can always be reported at a real line and column.
"""

from __future__ import annotations

import re

FENCE_OPEN = re.compile(r"^( {0,3})(`{3,}|~{3,})(.*)$")
HEADING = re.compile(r"^ {0,3}(#{1,6})([ \t]+|$)")
LIST_ITEM = re.compile(r"^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)")
QUOTE = re.compile(r"^([ \t]*(?:>[ \t]?)+)")
TABLE_DELIM = re.compile(r"^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|[ \t:|-]*$")
REF_DEF = re.compile(r"^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S+.*$")
HTML_OPEN = re.compile(r"^ {0,3}</?[A-Za-z!][^\n]*$")
AUTOLINK_LINE = re.compile(r"^ {0,3}<[A-Za-z][A-Za-z0-9+.\-]*://")
BACKTICK_RUN = re.compile(r"`+")
INDENTED_CODE = re.compile(r"^ {4,}\S")
CONTINUATION = re.compile(r"^[ \t]+\S")

LineInfo = tuple[int, int, str, bool]


def blank(text: str) -> str:
    """Return a same-length string with every character except newline blanked."""
    return "".join("\n" if ch == "\n" else " " for ch in text)


def line_starts(raw: str) -> list[int]:
    starts = [0]
    for match in re.finditer(r"\n", raw):
        starts.append(match.end())
    return starts


def code_span_ranges(text: str) -> list[tuple[int, int]]:
    """Offset ranges of inline code spans, using the CommonMark pairing rule.

    A run of N backticks closes on the next run of exactly N backticks. An
    unpaired run is literal text. This is a linear scan, which also keeps very
    large files fast.
    """
    runs = [(m.start(), m.end()) for m in BACKTICK_RUN.finditer(text)]
    spans: list[tuple[int, int]] = []
    index = 0
    while index < len(runs):
        start, end = runs[index]
        size = end - start
        peer = index + 1
        while peer < len(runs) and (runs[peer][1] - runs[peer][0]) != size:
            peer += 1
        if peer < len(runs):
            spans.append((start, runs[peer][1]))
            index = peer + 1
        else:
            index += 1
    return spans


def inert_ranges(raw: str) -> list[tuple[int, int]]:
    """Offset ranges where a suppression directive is documentation, not code.

    Fenced code blocks and inline code spans. This is what lets the kilint
    README print the directive syntax without disabling itself.
    """
    starts = line_starts(raw)
    ranges: list[tuple[int, int]] = []
    fence: tuple[str, int] | None = None
    for index, line in enumerate(raw.split("\n")):
        stripped = line.strip()
        begin = starts[index]
        if fence is not None:
            ranges.append((begin, begin + len(line)))
            marker, size = fence
            if stripped.startswith(marker * size) and set(stripped) <= set(marker):
                fence = None
            continue
        match = FENCE_OPEN.match(line)
        if match:
            fence = (match.group(2)[0], len(match.group(2)))
            ranges.append((begin, begin + len(line)))
    ranges.extend(code_span_ranges(raw))
    ranges.sort()
    merged: list[tuple[int, int]] = []
    for start, end in ranges:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def mask_lines(raw: str, chars: list[str]) -> list[LineInfo]:
    """Classify every line and blank the lines that are not prose.

    Returns tuples of (start, end, kind, starts_a_list_item).
    """
    starts = line_starts(raw)
    lines = raw.split("\n")
    info: list[LineInfo] = []
    fence: tuple[str, int] | None = None
    in_html = False
    in_comment = False
    in_math = False
    list_active = False

    def wipe(a: int, b: int) -> None:
        for pos in range(a, b):
            if chars[pos] != "\n":
                chars[pos] = " "

    for idx, line in enumerate(lines):
        start = starts[idx]
        end = start + len(line)
        stripped = line.strip()
        if fence is not None:
            wipe(start, end)
            marker, size = fence
            if stripped.startswith(marker * size) and set(stripped) <= set(marker):
                fence = None
            info.append((start, end, "code", False))
            continue
        open_match = FENCE_OPEN.match(line)
        if open_match:
            fence = (open_match.group(2)[0], len(open_match.group(2)))
            wipe(start, end)
            info.append((start, end, "code", False))
            continue
        if in_math:
            wipe(start, end)
            if "$$" in line:
                in_math = False
            info.append((start, end, "math", False))
            continue
        if stripped.startswith("$$"):
            wipe(start, end)
            in_math = stripped.count("$$") < 2
            info.append((start, end, "math", False))
            continue
        if in_comment:
            wipe(start, end)
            if "-->" in line:
                in_comment = False
            info.append((start, end, "html", False))
            continue
        if stripped.startswith("<!--"):
            wipe(start, end)
            in_comment = "-->" not in line
            info.append((start, end, "html", False))
            continue
        if in_html:
            if not stripped:
                in_html = False
                info.append((start, end, "blank", False))
                continue
            wipe(start, end)
            info.append((start, end, "html", False))
            continue
        if HTML_OPEN.match(line) and stripped and not AUTOLINK_LINE.match(line):
            in_html = True
            wipe(start, end)
            info.append((start, end, "html", False))
            continue
        if not stripped:
            info.append((start, end, "blank", False))
            continue
        if TABLE_DELIM.match(line) and "-" in line and "|" in line:
            wipe(start, end)
            info.append((start, end, "table_delim", False))
            continue
        if REF_DEF.match(line):
            wipe(start, end)
            info.append((start, end, "ref", False))
            continue
        if not list_active and INDENTED_CODE.match(line):
            wipe(start, end)
            info.append((start, end, "code", False))
            continue
        cursor = start
        quote = QUOTE.match(line)
        if quote:
            wipe(start, start + len(quote.group(1)))
            cursor = start + len(quote.group(1))
            line = raw[cursor:end]
        is_list = False
        heading = HEADING.match(line)
        list_item = LIST_ITEM.match(line)
        if heading:
            wipe(cursor, cursor + len(heading.group(0)))
            kind = "heading"
            list_active = False
        elif list_item:
            wipe(cursor, cursor + len(list_item.group(0)))
            kind = "list"
            is_list = True
            list_active = True
        elif "|" in line and line.strip().startswith("|"):
            for pos in range(cursor, end):
                if chars[pos] == "|":
                    chars[pos] = " "
            kind = "table"
        else:
            kind = "paragraph"
            if not CONTINUATION.match(line):
                list_active = False
        info.append((start, end, kind, is_list))
    return info


_IMAGE = re.compile(r"!\[[^\]\n]*\]\([^)\n]*\)")
_WIKI = re.compile(r"\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]")
_INLINE_LINK = re.compile(r"\[([^\]\n]*)\]\((?:[^)\n]*)\)")
_REF_LINK = re.compile(r"\[([^\]\n]*)\]\[[^\]\n]*\]")
_ANGLE_LINK = re.compile(r"<[a-zA-Z][a-zA-Z0-9+.\-]*://[^>\s]*>|<[^@\s>]+@[^@\s>]+>")
_BARE_URL = re.compile(r"(?:[a-zA-Z][a-zA-Z0-9+.\-]*://|www\.)\S+")
_FOOTNOTE = re.compile(r"\[\^[^\]\n]+\]:?")
# Inline LaTeX. The lookarounds keep this off currency ("$5 and $10") and off
# the `$$` display delimiters that mask_lines already handles.
_INLINE_MATH = re.compile(r"(?<![\\$])\$(?!\s)(?:\\.|[^$\n\\])+?(?<!\s)\$(?!\$)")
# A wiki target that looks like a path rather than a phrase.
_WIKI_PATH = re.compile(r"[/#;?]")


def mask_inline(text: str) -> str:
    """Mask code spans, inline math, URLs, link targets, and footnote markers.

    Link text survives, because link text is prose.
    """
    chars = list(text)

    def wipe(a: int, b: int) -> None:
        for pos in range(a, b):
            if chars[pos] != "\n":
                chars[pos] = " "

    def keep_only(match: re.Match[str], group: int) -> None:
        wipe(match.start(), match.start(group))
        wipe(match.end(group), match.end())

    for start, end in code_span_ranges(text):
        wipe(start, end)
    for match in _INLINE_MATH.finditer("".join(chars)):
        wipe(match.start(), match.end())
    for match in _IMAGE.finditer("".join(chars)):
        wipe(match.start(), match.end())
    for match in _WIKI.finditer("".join(chars)):
        if match.group(2) is not None:
            keep_only(match, 2)  # the alias is prose
        elif _WIKI_PATH.search(match.group(1)):
            wipe(match.start(), match.end())  # a path, not a phrase
        else:
            keep_only(match, 1)
    for match in _INLINE_LINK.finditer("".join(chars)):
        keep_only(match, 1)
    for match in _REF_LINK.finditer("".join(chars)):
        keep_only(match, 1)
    for match in _ANGLE_LINK.finditer("".join(chars)):
        wipe(match.start(), match.end())
    for match in _BARE_URL.finditer("".join(chars)):
        wipe(match.start(), match.end())
    for match in _FOOTNOTE.finditer("".join(chars)):
        wipe(match.start(), match.end())
    return "".join(chars)
