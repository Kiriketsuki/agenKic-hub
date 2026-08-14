"""Text pipeline for kilint.

Frontmatter, masking, block and sentence segmentation. The masking stages live
in `masking.py` and the suppression directives live in `directives.py`. Both are
re-exported here, because `kilint.text` is the public name for the pipeline.

Every stage preserves line and column offsets, so a violation is always reported
at a real position in the original text.
"""

from __future__ import annotations

import bisect
import re
from dataclasses import dataclass, field

from .directives import (DIRECTIVE_RE, Frontmatter, Suppressions,
                         parse_frontmatter, split_frontmatter)
from .directives import collect as collect_directives
from .masking import (LineInfo, blank, inert_ranges, line_starts, mask_inline,
                      mask_lines)

__all__ = [
    "WORD_RE", "ABBREVIATIONS", "DIRECTIVE_RE", "Sentence", "Block", "Document",
    "Frontmatter", "Suppressions", "blank", "count_words", "inert_ranges",
    "collect_directives", "split_frontmatter", "parse_frontmatter",
    "split_sentences", "build_document", "drop_short_blocks", "mask_lines",
    "mask_inline", "line_starts",
]

WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9'’\-/]*|\d+(?:\.\d+)?")

ABBREVIATIONS = {
    "e.g.", "i.e.", "etc.", "vs.", "dr.", "no.", "fig.", "mr.", "mrs.", "ms.",
    "prof.", "approx.", "inc.", "ltd.", "al.", "cf.", "st.", "ca.", "est.",
    "min.", "max.", "sec.", "ref.", "eq.", "ch.", "vol.", "pp.", "resp.",
}

PROSE_KINDS = {"paragraph", "list", "heading", "table"}


def count_words(text: str) -> int:
    return len(WORD_RE.findall(text))


@dataclass(frozen=True)
class Sentence:
    text: str
    offsets: tuple[int, ...]
    block_index: int
    block_kind: str

    @property
    def start(self) -> int:
        return self.offsets[0] if self.offsets else 0

    def offset_at(self, index: int) -> int:
        if not self.offsets:
            return 0
        index = max(0, min(index, len(self.offsets) - 1))
        return self.offsets[index]

    @property
    def word_count(self) -> int:
        return count_words(self.text)


@dataclass
class Block:
    kind: str
    index: int
    start: int
    sentences: list[Sentence] = field(default_factory=list)
    word_count: int = 0


@dataclass
class Document:
    raw: str
    masked: str
    kind: str
    path: str | None = None
    line_starts: list[int] = field(default_factory=list)
    blocks: list[Block] = field(default_factory=list)
    sentences: list[Sentence] = field(default_factory=list)
    word_count: int = 0
    suppressions: Suppressions = field(default_factory=Suppressions)
    frontmatter: Frontmatter = field(default_factory=Frontmatter)

    def position(self, offset: int) -> tuple[int, int]:
        """Return a 1-based (line, column) for an absolute character offset."""
        offset = max(0, min(offset, len(self.raw)))
        line = bisect.bisect_right(self.line_starts, offset) - 1
        return line + 1, offset - self.line_starts[line] + 1

    def excerpt(self, start: int, end: int, pad: int = 14) -> str:
        left = max(0, start - pad)
        right = min(len(self.raw), end + pad)
        snippet = self.raw[left:right].replace("\n", " ")
        return re.sub(r"\s+", " ", snippet).strip()


def _gather(masked: str, lines: list[LineInfo]) -> tuple[str, tuple[int, ...]]:
    """Join the prose of several lines, keeping one absolute offset per char."""
    text: list[str] = []
    offsets: list[int] = []
    for start, end, _kind, _is_list in lines:
        for pos in range(start, end):
            text.append(masked[pos])
            offsets.append(pos)
        text.append(" ")
        offsets.append(end)
    return "".join(text), tuple(offsets)


_BREAK_RE = re.compile(r"[.!?:][\"')\]”’]*(?=\s+[\"'“‘(\[]?[A-Z0-9])")
_LOOKBACK = 48


def _is_break(text: str, index: int) -> bool:
    """Decide whether the punctuation at `index` really ends a sentence.

    Only a short window before the mark is inspected, which keeps this linear on
    very large files. Abbreviations, initials, decimals, version strings,
    ellipses, and `file.md:12` refs are all protected.
    """
    char = text[index]
    if text[index:index + 3] == "..." or text[max(0, index - 2):index + 1] == "...":
        return False
    head = text[max(0, index - _LOOKBACK):index + 1]
    token = re.search(r"(\S+)$", head)
    if token and token.group(1).lower() in ABBREVIATIONS:
        return False
    if re.search(r"(?:^|[\s(])[A-Za-z]\.$", head):
        return False
    if char == ":" and re.search(r"\.[A-Za-z0-9]{1,6}$", head[:-1]):
        return False
    if char == ":" and re.search(r"\d$", head[:-1]):
        return False
    return True


def split_sentences(text: str, offsets: tuple[int, ...], block_index: int,
                    kind: str) -> list[Sentence]:
    ends = [m.end() for m in _BREAK_RE.finditer(text) if _is_break(text, m.start())]
    ends.append(len(text))
    sentences: list[Sentence] = []
    cursor = 0
    for end in ends:
        if end <= cursor:
            continue
        piece = text[cursor:end]
        lead = len(piece) - len(piece.lstrip())
        trail = len(piece) - len(piece.rstrip())
        a, b = cursor + lead, end - trail
        if b > a and text[a:b].strip():
            sentences.append(Sentence(text[a:b], offsets[a:b], block_index, kind))
        cursor = end
    return sentences


def _block_kind(group: list[LineInfo]) -> str:
    kinds = {item[2] for item in group}
    if "list" in kinds:
        return "list"
    if "table" in kinds:
        return "table"
    if "heading" in kinds:
        return "heading"
    return "paragraph"


def _units(kind: str, group: list[LineInfo]) -> list[list[LineInfo]]:
    """Split a block into the spans that sentence counting treats separately.

    A list item is its own unit, so list items never count as the sentences of a
    paragraph. A table row is its own unit for the same reason.
    """
    if kind == "list":
        units: list[list[LineInfo]] = []
        for item in group:
            if item[3] or not units:
                units.append([item])
            else:
                units[-1].append(item)
        return units
    if kind == "table":
        return [[item] for item in group]
    return [group]


def _build_blocks(masked: str, infos: list[LineInfo]) -> list[Block]:
    blocks: list[Block] = []
    group: list[LineInfo] = []

    def flush() -> None:
        nonlocal group
        if not group:
            return
        kind = _block_kind(group)
        index = len(blocks)
        block = Block(kind=kind, index=index, start=group[0][0])
        for unit in _units(kind, group):
            text, offsets = _gather(masked, unit)
            block.sentences.extend(split_sentences(text, offsets, index, kind))
            block.word_count += count_words(text)
        if block.sentences:
            blocks.append(block)
        group = []

    for info in infos:
        start, end, kind, _is_list = info
        if kind not in PROSE_KINDS or not masked[start:end].strip():
            flush()
            continue
        if kind == "heading":
            flush()
            group = [info]
            flush()
            continue
        group.append(info)
    flush()
    return blocks


def drop_short_blocks(doc: Document, min_words: int) -> Document:
    """Remove comment blocks that are too terse to judge."""
    kept = [block for block in doc.blocks if block.word_count >= min_words]
    doc.blocks = kept
    doc.sentences = [s for block in kept for s in block.sentences]
    doc.word_count = sum(block.word_count for block in kept)
    return doc


def _source_blocks(raw: str, masked: str, spans: list[tuple[int, int]]) -> list[Block]:
    """Group comment spans that sit on consecutive lines into one block."""
    groups: list[list[LineInfo]] = []
    for start, end in spans:
        info: LineInfo = (start, min(end, len(raw)), "comment", False)
        if groups and raw[groups[-1][-1][1]:start].count("\n") == 1:
            groups[-1].append(info)
            continue
        groups.append([info])
    blocks: list[Block] = []
    for order, group in enumerate(groups):
        text, offsets = _gather(masked, group)
        sentences = split_sentences(text, offsets, order, "comment")
        if sentences:
            blocks.append(Block("comment", order, group[0][0], sentences, count_words(text)))
    return blocks


def _mask_everything_but(chars: list[str], spans: list[tuple[int, int]]) -> None:
    keep: set[int] = set()
    for start, end in spans:
        keep.update(range(start, min(end, len(chars))))
    for pos in range(len(chars)):
        if pos not in keep and chars[pos] != "\n":
            chars[pos] = " "


def build_document(
    raw: str,
    path: str | None = None,
    kind: str = "markdown",
    known_ids: set[str] | None = None,
    comment_spans: list[tuple[int, int]] | None = None,
) -> tuple[Document, list[str]]:
    """Build a Document. Returns the document and any unknown directive ids."""
    chars = list(raw)
    inert = inert_ranges(raw) if kind == "markdown" else []
    suppressions, unknown = collect_directives(raw, chars, known_ids or set(), inert)
    front = Frontmatter()

    if kind == "source" and comment_spans is not None:
        _mask_everything_but(chars, comment_spans)
        masked = mask_inline("".join(chars))
        blocks = _source_blocks(raw, masked, comment_spans)
    elif kind == "markdown":
        fm_start, fm_end = split_frontmatter(raw)
        if fm_end > fm_start:
            front = parse_frontmatter(raw[fm_start:fm_end])
            for pos in range(0, min(fm_end + 4, len(chars))):
                if chars[pos] != "\n":
                    chars[pos] = " "
        infos = mask_lines(raw, chars)
        masked = mask_inline("".join(chars))
        blocks = _build_blocks(masked, infos)
    else:
        starts = line_starts(raw)
        infos = [
            (starts[idx], starts[idx] + len(line),
             "paragraph" if line.strip() else "blank", False)
            for idx, line in enumerate(raw.split("\n"))
        ]
        masked = "".join(chars)
        blocks = _build_blocks(masked, infos)

    sentences = [s for block in blocks for s in block.sentences]
    doc = Document(
        raw=raw,
        masked=masked,
        kind=kind,
        path=path,
        line_starts=line_starts(raw),
        blocks=blocks,
        sentences=sentences,
        word_count=sum(block.word_count for block in blocks),
        suppressions=suppressions,
        frontmatter=front,
    )
    return doc, unknown
