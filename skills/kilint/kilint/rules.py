"""Rule registry and every rule implementation.

A rule reads the segmented document and returns violations. Rules only ever see
prose: masked spans, code, link targets, and URLs are already blanked by the
text pipeline, so a word list can never fire inside a code span.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from . import patterns as P
from .config import Resolved
from .explanations import EXPLAIN
from .profiles import DEFAULT_SEVERITIES, REPLACEMENTS
from .text import Document, Sentence, count_words


@dataclass(frozen=True)
class Violation:
    rule_id: str
    line: int
    col: int
    severity: str
    message: str
    excerpt: str
    suggestion: str


@dataclass
class FileResult:
    path: str
    profile: str
    words: int
    sentences: int
    score: float | None
    violations: list[Violation] = field(default_factory=list)
    skipped: bool = False
    reason: str | None = None
    threshold: float = 1.5

    @property
    def failed(self) -> bool:
        return self.score is not None and self.score > self.threshold


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    category: str
    default_severity: str
    explain: str
    suggest: str
    check: Callable[[Document, Resolved], list[Violation]]


def _tidy(text: str) -> str:
    return " ".join(text.split())


def _mk(doc: Document, cfg: Resolved, rule_id: str, sentence: Sentence,
        start: int, end: int, message: str, suggestion: str) -> Violation:
    begin = sentence.offset_at(start)
    finish = sentence.offset_at(max(start, end - 1)) + 1
    line, col = doc.position(begin)
    return Violation(rule_id, line, col, cfg.severity(rule_id), message,
                     doc.excerpt(begin, finish), suggestion)


def _scan(doc: Document, cfg: Resolved, rule_id: str, pattern, label: str,
          suggestion: str) -> list[Violation]:
    out: list[Violation] = []
    for sentence in doc.sentences:
        for match in pattern.finditer(sentence.text):
            out.append(_mk(doc, cfg, rule_id, sentence, match.start(), match.end(),
                           f'{label}: "{_tidy(match.group(0))}"', suggestion))
    return out


def _simple(rule_id: str, pattern, label: str, suggestion: str):
    def check(doc: Document, cfg: Resolved) -> list[Violation]:
        return _scan(doc, cfg, rule_id, pattern, label, suggestion)

    return check


def _replacement_for(text: str) -> str | None:
    """The short replacement for a matched word list entry.

    An entry compiled with a trailing "*" can match an inflection such as
    "utilized", which is not itself a key. Fall back to the longest known
    key that the match starts with, so the message still names the fix.
    """
    lowered = text.lower()
    exact = REPLACEMENTS.get(lowered)
    if exact:
        return exact
    best: str | None = None
    for key, value in REPLACEMENTS.items():
        if lowered.startswith(key) and (best is None or len(key) > len(best)):
            best, exact = key, value
    return exact if best else None


def _quoted_spans(text: str) -> list[tuple[int, int]]:
    return [(m.start(), m.end()) for m in P.QUOTED.finditer(text)]


def _is_mention(text: str, spans: list[tuple[int, int]], start: int) -> bool:
    """True when a word-list hit names the banned word instead of using it.

    A style guide, a glossary, or a transcript quotes the words it bans, and a
    negative example writes them out in full, as in `use (not utilize)`. Both
    forms are mentions. PUN003 already skips quoted spans, so this keeps the
    word rules consistent with it.
    """
    if any(a <= start < b for a, b in spans):
        return True
    return P.NEGATION_LEAD.search(text[max(0, start - 14):start]) is not None


def _word_rule(rule_id: str, list_key: str, label: str, suggestion: str,
               replacements: bool = False):
    def check(doc: Document, cfg: Resolved) -> list[Violation]:
        pattern = P.compile_list(cfg.words.get(list_key, []))
        if pattern is None:
            return []
        out: list[Violation] = []
        for sentence in doc.sentences:
            spans = _quoted_spans(sentence.text)
            for match in pattern.finditer(sentence.text):
                if _is_mention(sentence.text, spans, match.start()):
                    continue
                text = _tidy(match.group(0))
                hint = suggestion
                if replacements:
                    swap = _replacement_for(text)
                    if swap:
                        hint = f'use "{swap}"'
                out.append(_mk(doc, cfg, rule_id, sentence, match.start(), match.end(),
                               f'{label}: "{text}"', hint))
        return out

    return check


def _is_imperative(sentence: Sentence, cfg: Resolved) -> bool:
    match = P.FIRST_WORD.match(sentence.text)
    if not match:
        return False
    verbs = {word.lower() for word in cfg.words.get("imperative_verbs", [])}
    return match.group(1).lower() in verbs


def _check_sen001(doc: Document, cfg: Resolved) -> list[Violation]:
    cap = cfg.max_sentence_words
    if doc.kind == "source":
        cap += cfg.comment_sentence_bonus
    out: list[Violation] = []
    for sentence in doc.sentences:
        if sentence.block_kind == "table":
            continue  # a row of cells is not a sentence
        count = sentence.word_count
        if count > cap:
            out.append(_mk(doc, cfg, "SEN001", sentence, 0, len(sentence.text),
                           f"long sentence: {count} words (cap {cap})",
                           "split it into two sentences"))
    return out


def _second_verb(tail: str, verbs: set[str]) -> bool:
    """True when the text after a joiner starts a second command.

    A sequencing adverb may sit in between, as in "..., and then restart the
    server". Anything else that is not an imperative verb is a list item or a
    second clause, not a second instruction.
    """
    cursor = 0
    for _ in range(2):
        head = P.FIRST_WORD.match(tail, cursor)
        if not head:
            return False
        word = head.group(1).lower()
        if word in verbs:
            return True
        if word not in P.JOINER_ADVERBS:
            return False
        cursor = head.end()
    return False


def _check_sen002(doc: Document, cfg: Resolved) -> list[Violation]:
    verbs = {word.lower() for word in cfg.words.get("imperative_verbs", [])}
    out: list[Violation] = []
    for sentence in doc.sentences:
        if not _is_imperative(sentence, cfg):
            continue
        for match in P.JOINER.finditer(sentence.text):
            comma_joiner = match.group(0).lstrip().startswith(",")
            if comma_joiner and "," in sentence.text[:match.start()]:
                continue  # "a, b, and c" is one serial list, not two commands
            if not _second_verb(sentence.text[match.end():], verbs):
                continue
            out.append(_mk(doc, cfg, "SEN002", sentence, match.start(), match.end(),
                           f'compound instruction: "{_tidy(match.group(0))}"',
                           "one instruction per sentence"))
            break
    return out


def _check_str001(doc: Document, cfg: Resolved) -> list[Violation]:
    if doc.kind == "source":
        return []
    out: list[Violation] = []
    for block in doc.blocks:
        if block.kind != "paragraph":
            continue  # list items never count as paragraph sentences
        sentences = len(block.sentences)
        words = block.word_count
        if sentences > cfg.max_paragraph_sentences and words > cfg.max_paragraph_words:
            first = block.sentences[0]
            out.append(_mk(doc, cfg, "STR001", first, 0, len(first.text),
                           f"long paragraph: {sentences} sentences, {words} words "
                           f"(caps {cfg.max_paragraph_sentences} and "
                           f"{cfg.max_paragraph_words})",
                           "break the paragraph or make it a list"))
    return out


def _check_str002(doc: Document, cfg: Resolved) -> list[Violation]:
    out: list[Violation] = []
    for sentence in doc.sentences:
        if not _is_imperative(sentence, cfg):
            continue
        match = P.CONDITION.search(sentence.text)
        if not match or count_words(sentence.text[:match.start()]) < 3:
            continue
        out.append(_mk(doc, cfg, "STR002", sentence, match.start(), match.end(),
                       f'condition after command: "{_tidy(match.group(0))}"',
                       "state the condition first"))
    return out


def _check_pun003(doc: Document, cfg: Resolved) -> list[Violation]:
    out: list[Violation] = []
    for sentence in doc.sentences:
        quoted = [(m.start(), m.end()) for m in P.QUOTED.finditer(sentence.text)]
        for match in P.BANG.finditer(sentence.text):
            if any(a <= match.start() < b for a, b in quoted):
                continue
            out.append(_mk(doc, cfg, "PUN003", sentence, match.start(), match.end(),
                           "exclamation mark outside quoted speech", "use a full stop"))
    return out


def _check_wrd001(doc: Document, cfg: Resolved) -> list[Violation]:
    subjects = {w.lower() for w in cfg.words.get("possessive_subjects", [])}
    out: list[Violation] = []
    for sentence in doc.sentences:
        quoted = _quoted_spans(sentence.text)
        for match in P.CONTRACTION.finditer(sentence.text):
            if match.group(2) == "s" and match.group(1).lower() not in subjects:
                continue  # a possessive, not a contraction
            if any(a <= match.start() < b for a, b in quoted):
                continue  # quoted speech is reported, not written
            out.append(_mk(doc, cfg, "WRD001", sentence, match.start(), match.end(),
                           f'contraction: "{match.group(0)}"', "write it out in full"))
    return out


def _check_wrd006(doc: Document, cfg: Resolved) -> list[Violation]:
    nominals = P.compile_list(cfg.words.get("nominalizations", []))
    checks = [P.NOMINAL_VERB] + ([nominals] if nominals is not None else [])
    out: list[Violation] = []
    for sentence in doc.sentences:
        spans = _quoted_spans(sentence.text)
        for pattern in checks:
            for match in pattern.finditer(sentence.text):
                if _is_mention(sentence.text, spans, match.start()):
                    continue
                out.append(_mk(doc, cfg, "WRD006", sentence, match.start(), match.end(),
                               f'nominalization: "{_tidy(match.group(0))}"',
                               "use the plain verb"))
    return out


def _check_wrd007(doc: Document, cfg: Resolved) -> list[Violation]:
    out: list[Violation] = []
    for sentence in doc.sentences:
        for match in P.EMOJI.finditer(sentence.text):
            out.append(_mk(doc, cfg, "WRD007", sentence, match.start(), match.end(),
                           "emoji character",
                           "remove it, the house style has no emoji"))
    return out


def _check_vrb001(doc: Document, cfg: Resolved) -> list[Violation]:
    pattern = P.passive_pattern(cfg.words.get("irregular_participles", []))
    allow = P.allow_patterns(cfg.words.get("allow_passive", []))
    out: list[Violation] = []
    for sentence in doc.sentences:
        for match in pattern.finditer(sentence.text):
            if any(p.match(sentence.text, match.start()) for p in allow):
                continue  # adjectival participle, not passive voice
            out.append(_mk(doc, cfg, "VRB001", sentence, match.start(), match.end(),
                           f'passive voice: "{_tidy(match.group(0))}"',
                           "name the actor and use an active verb"))
    return out


def _check_vrb002(doc: Document, cfg: Resolved) -> list[Violation]:
    pattern = P.progressive_pattern()
    allow = P.allow_patterns(cfg.words.get("allow_progressive", []))
    out: list[Violation] = []
    for sentence in doc.sentences:
        for match in pattern.finditer(sentence.text):
            if any(p.match(sentence.text, match.start()) for p in allow):
                continue  # stative adjective, not a progressive main verb
            out.append(_mk(doc, cfg, "VRB002", sentence, match.start(), match.end(),
                           f'progressive main verb: "{_tidy(match.group(0))}"',
                           "use the simple tense"))
    return out


def _clause_break(text: str) -> bool:
    """True when a clause boundary separates two modals.

    Two independent clauses that each carry one modal are not a stacked hedge,
    so only adjacent modals inside one clause count.
    """
    lowered = f" {text.lower()} "
    return "," in text or " and " in lowered or " or " in lowered


def _check_vrb003(doc: Document, cfg: Resolved) -> list[Violation]:
    out: list[Violation] = []
    for sentence in doc.sentences:
        modals = list(P.MODAL.finditer(sentence.text))
        hedges = list(P.HEDGE.finditer(sentence.text))
        hit = None
        stacked = next(
            (a for a, b in zip(modals, modals[1:])
             if 0 <= b.start() - a.end() <= 12
             and not _clause_break(sentence.text[a.end():b.start()])),
            None,
        )
        if stacked is not None:
            hit = stacked
        elif modals and hedges:
            for modal in modals:
                if any(0 <= hedge.start() - modal.end() <= 12 for hedge in hedges):
                    hit = modal
                    break
        if hit is None:
            continue
        out.append(_mk(doc, cfg, "VRB003", sentence, hit.start(), hit.end(),
                       f'stacked hedge: "{hit.group(0)}"',
                       "state the fact without hedging"))
    return out


def _check_trm001(doc: Document, cfg: Resolved) -> list[Violation]:
    if not cfg.terminology:
        return []  # silent until the user configures a terminology table
    out: list[Violation] = []
    for canonical, aliases in cfg.terminology.items():
        pattern = P.compile_list(list(aliases))
        if pattern is None:
            continue
        for sentence in doc.sentences:
            for match in pattern.finditer(sentence.text):
                out.append(_mk(doc, cfg, "TRM001", sentence, match.start(), match.end(),
                               f'inconsistent term: "{match.group(0)}"',
                               f'use "{canonical}"'))
    return out


def _rule(rule_id: str, name: str, category: str, suggest: str, check) -> Rule:
    return Rule(rule_id, name, category, DEFAULT_SEVERITIES[rule_id],
                EXPLAIN[rule_id], suggest, check)


RULES: dict[str, Rule] = {rule.id: rule for rule in (
    _rule("SEN001", "long-sentence", "sentence", "split the sentence", _check_sen001),
    _rule("SEN002", "compound-instruction", "sentence",
          "one instruction per sentence", _check_sen002),
    _rule("STR001", "long-paragraph", "structure", "break the paragraph", _check_str001),
    _rule("STR002", "condition-after-command", "structure",
          "state the condition first", _check_str002),
    _rule("PUN001", "semicolon", "punctuation", "use a full stop",
          _simple("PUN001", P.SEMICOLON, "semicolon", "use a full stop")),
    _rule("PUN002", "em-dash", "punctuation",
          "use a spaced hyphen or split the sentence",
          _simple("PUN002", P.DASH, "em-dash",
                  "use a spaced hyphen or split the sentence")),
    _rule("PUN003", "exclamation", "punctuation", "use a full stop", _check_pun003),
    _rule("PUN004", "smart-quotes", "punctuation", "use straight quotes",
          _simple("PUN004", P.SMART_QUOTE, "smart quote", "use straight quotes")),
    _rule("WRD001", "contraction", "words", "write it out in full", _check_wrd001),
    _rule("WRD002", "long-word", "words", "use the shorter word",
          _word_rule("WRD002", "long_word", "long word", "use a shorter word", True)),
    _rule("WRD003", "marketing-adjective", "words", "delete it or give a measurement",
          _word_rule("WRD003", "marketing", "marketing adjective",
                     "delete it or give a measurement")),
    _rule("WRD004", "filler-phrase", "words", "delete the phrase",
          _word_rule("WRD004", "filler", "filler phrase", "delete the phrase")),
    _rule("WRD005", "phrasal-verb", "words", "use the plain verb",
          _word_rule("WRD005", "phrasal", "phrasal verb", "use the plain verb", True)),
    _rule("WRD006", "nominalization", "words", "use the plain verb", _check_wrd006),
    _rule("WRD007", "emoji", "words", "remove the character", _check_wrd007),
    _rule("WRD008", "vague-quantifier", "words", "give the number",
          _word_rule("WRD008", "vague", "vague quantifier", "give the number")),
    _rule("VRB001", "passive-voice", "verbs", "name the actor", _check_vrb001),
    _rule("VRB002", "ing-main-verb", "verbs", "use the simple tense", _check_vrb002),
    _rule("VRB003", "modal-stack", "verbs", "state the fact", _check_vrb003),
    _rule("TRM001", "inconsistent-term", "terminology", "use the canonical term",
          _check_trm001),
)}


def run(doc: Document, cfg: Resolved, select: set[str] | None = None,
        ignore: set[str] | None = None) -> list[Violation]:
    """Run every active rule and drop suppressed results."""
    out: list[Violation] = []
    for rule_id, rule in RULES.items():
        if select and rule_id not in select:
            continue
        if ignore and rule_id in ignore:
            continue
        if not cfg.active(rule_id):
            continue
        for violation in rule.check(doc, cfg):
            if doc.suppressions.allows(violation.line, rule_id):
                out.append(violation)
    out.sort(key=lambda v: (v.line, v.col, v.rule_id))
    return out


def score(violations: list[Violation], words: int, weights: dict[str, float]) -> float:
    """Weighted violations per 100 words. Lower is cleaner."""
    if words <= 0:
        return 0.0
    total = sum(weights.get(v.severity, 1.0) for v in violations)
    return round(total * 100.0 / words, 2)


def categories(violations: list[Violation]) -> dict[str, int]:
    out: dict[str, int] = {}
    for violation in violations:
        rule = RULES.get(violation.rule_id)
        out.setdefault(rule.category if rule else "other", 0)
        out[rule.category if rule else "other"] += 1
    return dict(sorted(out.items()))
