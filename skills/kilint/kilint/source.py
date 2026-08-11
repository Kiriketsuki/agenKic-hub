"""Comment and docstring extraction for source files.

Only comment prose is ever returned. Code, identifiers, and ordinary string
literals are never linted. Every extractor returns absolute character spans into
the original text so that reported positions stay accurate.
"""

from __future__ import annotations

import io
import re
import token as token_module
import tokenize

PY_EXT = {".py", ".pyi"}
C_LIKE_EXT = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".c",
    ".h", ".cpp", ".hpp", ".cc", ".cs", ".swift", ".kt", ".kts", ".scala",
    ".php", ".dart", ".m", ".mm",
}
HASH_EXT = {".sh", ".bash", ".zsh", ".fish", ".toml", ".yaml", ".yml", ".ini", ".cfg", ".rb", ".pl", ".r"}
LUA_EXT = {".lua"}

SOURCE_EXTENSIONS = PY_EXT | C_LIKE_EXT | HASH_EXT | LUA_EXT

_LEADER_RE = re.compile(r"^[ \t]*(?:#+|//+|/\*+|\*+|--+|<!--)[ \t]*")
_TRAILER_RE = re.compile(r"(?:\*+/|-->)[ \t]*$")


class SourceError(Exception):
    """Raised when a file cannot be scanned as source."""


def _line_offsets(text: str) -> list[int]:
    starts = [0]
    for match in re.finditer(r"\n", text):
        starts.append(match.end())
    return starts


def _trim(text: str, start: int, end: int) -> tuple[int, int]:
    """Strip comment leaders and trailers from a span, keeping absolute offsets."""
    raw = text[start:end]
    leader = _LEADER_RE.match(raw)
    if leader:
        start += leader.end()
        raw = text[start:end]
    trailer = _TRAILER_RE.search(raw)
    if trailer:
        end = start + trailer.start()
        raw = text[start:end]
    stripped = raw.strip()
    if not stripped:
        return start, start
    offset = raw.index(stripped[0])
    return start + offset, start + offset + len(stripped)


def extract_python(text: str) -> list[tuple[int, int]]:
    """Comments and module, class, and function docstrings, via tokenize."""
    starts = _line_offsets(text)
    spans: list[tuple[int, int]] = []
    skip = {token_module.NL, token_module.NEWLINE, token_module.INDENT,
            token_module.DEDENT, token_module.COMMENT, tokenize.ENCODING}
    expect_docstring = True
    pending_def = False
    depth = 0

    def absolute(position: tuple[int, int]) -> int:
        row, col = position
        return starts[row - 1] + col if row - 1 < len(starts) else len(text)

    try:
        stream = tokenize.generate_tokens(io.StringIO(text).readline)
        for tok in stream:
            begin = absolute(tok.start)
            finish = absolute(tok.end)
            if tok.type == token_module.COMMENT:
                for line in _split_comment_run(text, begin, finish):
                    spans.append(line)
                continue
            if tok.type in skip:
                continue
            if tok.type == token_module.OP:
                if tok.string in "([{":
                    depth += 1
                elif tok.string in ")]}":
                    depth = max(0, depth - 1)
                elif tok.string == ":" and depth == 0 and pending_def:
                    pending_def = False
                    expect_docstring = True
                    continue
                expect_docstring = expect_docstring and tok.string == ":"
                continue
            if tok.type == token_module.STRING and expect_docstring:
                spans.append(_docstring_body(text, begin, finish))
                expect_docstring = False
                continue
            if tok.type == token_module.NAME and tok.string in {"def", "class", "async"}:
                pending_def = True
            expect_docstring = False
    except (tokenize.TokenError, IndentationError, SyntaxError) as exc:
        raise SourceError(f"cannot tokenize python source: {exc}") from exc
    return [span for span in spans if span[1] > span[0]]


def _split_comment_run(text: str, start: int, end: int) -> list[tuple[int, int]]:
    trimmed = _trim(text, start, end)
    return [trimmed] if trimmed[1] > trimmed[0] else []


def _docstring_body(text: str, start: int, end: int) -> tuple[int, int]:
    body = text[start:end]
    prefix = re.match(r"[rRbBuUfF]*", body).end()
    quote = body[prefix:prefix + 3]
    if quote in ('"""', "'''"):
        inner_start = start + prefix + 3
        inner_end = max(inner_start, end - 3)
    else:
        inner_start = start + prefix + 1
        inner_end = max(inner_start, end - 1)
    raw = text[inner_start:inner_end]
    stripped = raw.strip()
    if not stripped:
        return inner_start, inner_start
    offset = raw.index(stripped[0])
    return inner_start + offset, inner_start + offset + len(stripped)


def extract_c_like(text: str) -> list[tuple[int, int]]:
    """A small state machine that keeps `//` inside string literals out."""
    spans: list[tuple[int, int]] = []
    index = 0
    length = len(text)
    prev_significant = ""
    while index < length:
        char = text[index]
        if char in "\"'`":
            quote = char
            index += 1
            while index < length:
                if text[index] == "\\":
                    index += 2
                    continue
                if text[index] == quote:
                    index += 1
                    break
                if quote != "`" and text[index] == "\n":
                    break
                index += 1
            prev_significant = quote
            continue
        if char == "/" and index + 1 < length:
            nxt = text[index + 1]
            if nxt == "/":
                end = text.find("\n", index)
                end = length if end == -1 else end
                spans.append(_trim(text, index, end))
                index = end
                prev_significant = ""
                continue
            if nxt == "*":
                end = text.find("*/", index + 2)
                end = length if end == -1 else end + 2
                spans.extend(_block_lines(text, index, end))
                index = end
                prev_significant = ""
                continue
            if prev_significant in "(,=:[!&|?{};+-*%~^<>" or prev_significant == "":
                index = _skip_regex(text, index)
                prev_significant = "/"
                continue
        if not char.isspace():
            prev_significant = char
        index += 1
    return [span for span in spans if span[1] > span[0]]


def _skip_regex(text: str, index: int) -> int:
    length = len(text)
    cursor = index + 1
    in_class = False
    while cursor < length:
        char = text[cursor]
        if char == "\\":
            cursor += 2
            continue
        if char == "\n":
            return index + 1
        if char == "[":
            in_class = True
        elif char == "]":
            in_class = False
        elif char == "/" and not in_class:
            return cursor + 1
        cursor += 1
    return index + 1


def _block_lines(text: str, start: int, end: int) -> list[tuple[int, int]]:
    """Split a block comment into per-line spans so line numbers stay right."""
    out: list[tuple[int, int]] = []
    cursor = start
    while cursor < end:
        newline = text.find("\n", cursor)
        stop = end if newline == -1 or newline > end else newline
        out.append(_trim(text, cursor, stop))
        cursor = stop + 1
    return out


def extract_hash(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    index = 0
    length = len(text)
    line_start = True
    while index < length:
        char = text[index]
        if char in "\"'":
            quote = char
            index += 1
            while index < length:
                if text[index] == "\\" and quote == '"':
                    index += 2
                    continue
                if text[index] == quote:
                    index += 1
                    break
                index += 1
            line_start = False
            continue
        if char == "#" and (line_start or text[index - 1] in " \t"):
            end = text.find("\n", index)
            end = length if end == -1 else end
            spans.append(_trim(text, index, end))
            index = end
            continue
        if char == "\n":
            line_start = True
        elif not char.isspace():
            line_start = False
        index += 1
    return [span for span in spans if span[1] > span[0]]


def extract_lua(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char in "\"'":
            quote = char
            index += 1
            while index < length:
                if text[index] == "\\":
                    index += 2
                    continue
                if text[index] == quote or text[index] == "\n":
                    index += 1
                    break
                index += 1
            continue
        if text[index:index + 2] == "--":
            if text[index + 2:index + 4] == "[[":
                end = text.find("]]", index + 4)
                end = length if end == -1 else end + 2
                spans.extend(_block_lines(text, index, end))
                index = end
                continue
            end = text.find("\n", index)
            end = length if end == -1 else end
            spans.append(_trim(text, index, end))
            index = end
            continue
        index += 1
    return [span for span in spans if span[1] > span[0]]


def extract(text: str, extension: str) -> list[tuple[int, int]]:
    extension = extension.lower()
    if extension in PY_EXT:
        return extract_python(text)
    if extension in C_LIKE_EXT:
        return extract_c_like(text)
    if extension in HASH_EXT:
        return extract_hash(text)
    if extension in LUA_EXT:
        return extract_lua(text)
    raise SourceError(f"no comment scanner for extension '{extension}'")


def is_source_extension(extension: str) -> bool:
    return extension.lower() in SOURCE_EXTENSIONS
