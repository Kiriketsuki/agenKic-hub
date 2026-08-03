"""Built-in profiles and the built-in word lists that encode the house style."""

from __future__ import annotations

DEFAULT_SEVERITIES: dict[str, str] = {
    "SEN001": "error",
    "SEN002": "warn",
    "STR001": "warn",
    "STR002": "info",
    "PUN001": "error",
    "PUN002": "error",
    "PUN003": "warn",
    "PUN004": "info",
    "WRD001": "error",
    "WRD002": "error",
    "WRD003": "error",
    "WRD004": "error",
    "WRD005": "warn",
    "WRD006": "warn",
    "WRD007": "error",
    "WRD008": "info",
    "VRB001": "error",
    "VRB002": "warn",
    "VRB003": "warn",
    "TRM001": "error",
}

ALL_RULE_IDS = tuple(DEFAULT_SEVERITIES)

# Rules that are present but silent unless a profile turns them on.
OPTIONAL_RULES = ("STR002", "PUN004", "WRD008")

PROSE_ACTIVE = ("PUN002", "WRD003", "WRD004", "WRD007", "SEN001")


def _all_on() -> dict[str, str]:
    return dict(DEFAULT_SEVERITIES)


def _flavored_rules() -> dict[str, str]:
    rules = _all_on()
    for rule_id in OPTIONAL_RULES:
        rules[rule_id] = "off"
    return rules


def _prose_rules() -> dict[str, str]:
    rules = {rule_id: "off" for rule_id in ALL_RULE_IDS}
    for rule_id in PROSE_ACTIVE:
        rules[rule_id] = DEFAULT_SEVERITIES[rule_id]
    return rules


BUILTIN_PROFILES: dict[str, dict] = {
    "strict": {
        "max_sentence_words": 20,
        "max_paragraph_sentences": 6,
        "max_paragraph_words": 120,
        "threshold": 0.8,
        "rules": _all_on(),
    },
    "flavored": {
        "max_sentence_words": 25,
        "max_paragraph_sentences": 8,
        "max_paragraph_words": 160,
        "threshold": 1.5,
        "rules": _flavored_rules(),
    },
    "prose": {
        "max_sentence_words": 35,
        "max_paragraph_sentences": 12,
        "max_paragraph_words": 400,
        "threshold": 3.0,
        "rules": _prose_rules(),
    },
    "off": {
        "max_sentence_words": 25,
        "max_paragraph_sentences": 8,
        "max_paragraph_words": 160,
        "threshold": 0.0,
        "rules": {rule_id: "off" for rule_id in ALL_RULE_IDS},
    },
}

# Word lists. A trailing "*" on an entry opts that entry into prefix matching.
DEFAULT_WORDS: dict[str, list[str]] = {
    # Verbs carry a trailing "*" so their inflections are caught too:
    # "utilized" and "utilizing" are the same offence as "utilize".
    # "ensure" and the marketing list's "unlock" stay exact-match on purpose,
    # per SPEC.md's substring examples.
    "long_word": [
        "utilize*", "leverage*", "facilitate*", "ensure", "prior to", "subsequent to",
        "obtain*", "demonstrate*", "additionally", "furthermore", "moreover",
        "commence*", "initiate*", "in order to", "due to the fact that",
        "a variety of", "in the event that", "whilst", "amongst", "numerous",
        "myriad", "plethora", "aforementioned", "comprehensive",
    ],
    "marketing": [
        "seamless", "robust", "powerful", "cutting-edge", "effortless",
        "world-class", "next-generation", "revolutionary", "blazing",
        "lightning-fast", "battle-tested", "enterprise-grade", "best-in-class",
        "state-of-the-art", "game-changing", "turnkey", "supercharge",
        "unleash", "empower", "delightful", "elegant",
        # The marketing sense of "unlock" only. The bare verb is plain English
        # for a mutex, an account, or a bootloader, so it is not listed alone.
        "unlock the power", "unlock the potential", "unlock value", "unlocks value",
    ],
    "filler": [
        "it is important to note", "it should be noted", "it is worth noting",
        "please note that", "as mentioned", "as noted above", "needless to say",
        "at the end of the day", "when it comes to",
    ],
    "phrasal": [
        "spin up", "spin down", "reach out", "dive into", "kick off", "roll out",
        "tear down", "ramp up", "circle back", "drill down", "take a look at",
    ],
    "vague": [
        "several", "various", "a number of", "some amount of",
    ],
    "allow_passive": [
        "is based on", "is required", "is available", "is related to",
        "is known as", "is located", "is designed to", "is intended",
        "is supported", "is deprecated",
    ],
    # Stative "-ing" words that are adjectives, not progressive main verbs.
    # An entry that starts with a be-word covers every be-word.
    "allow_progressive": [
        "is missing", "is pending", "is binding", "is outstanding",
        "is existing", "is remaining", "is willing", "is standing",
        "is ongoing", "is incoming", "is outgoing", "is interesting",
        "is promising", "is surprising", "is confusing", "is misleading",
    ],
    # True deverbal nouns for WRD006. A closed list, because a suffix rule on
    # tion/ment/ance/ence also catches plain nouns such as "instance of" and
    # "environment of", which have no plain verb to swap in.
    "nominalizations": [
        "analysis of", "investigation of", "verification of", "validation of",
        "implementation of", "configuration of", "installation of",
        "creation of", "deletion of", "execution of", "evaluation of",
        "calculation of", "modification of", "utilisation of",
        "utilization of", "management of", "assessment of", "deployment of",
        "replacement of", "enforcement of", "generation of", "migration of",
        "registration of", "cancellation of", "termination of",
    ],
    "imperative_verbs": [
        "add", "apply", "build", "call", "change", "check", "choose", "clean",
        "clear", "click", "clone", "close", "commit", "confirm", "configure",
        "connect", "copy", "create", "define", "delete", "deploy", "disable",
        "disconnect", "do", "download", "edit", "enable", "enter", "export",
        "fetch", "find", "fix", "follow", "get", "give", "go", "import",
        "insert", "inspect", "install", "keep", "list", "load", "log", "look",
        "make", "merge", "mount", "move", "navigate", "note", "open", "pass",
        "paste", "press", "print", "pull", "push", "put", "read", "rebase",
        "reboot", "register", "reload", "remove", "rename", "repeat", "replace",
        "report", "reset", "restart", "restore", "return", "review", "roll",
        "run", "save", "scroll", "see", "select", "send", "set", "share",
        "start", "stop", "switch", "sync", "take", "test", "try", "turn",
        "type", "unmount", "update", "upgrade", "upload", "use", "verify",
        "wait", "watch", "write",
    ],
    "possessive_subjects": [
        "it", "that", "there", "here", "what", "who", "he", "she", "let",
        "one", "everyone", "someone", "something", "nothing", "everything",
        "this",
    ],
    "irregular_participles": [
        "done", "made", "sent", "read", "built", "kept", "held", "set", "put",
        "run", "written", "shown", "given", "taken", "found", "got", "gotten",
        "seen", "known", "thrown", "drawn", "lost", "left", "meant", "brought",
        "bought", "caught", "taught", "told", "sold", "hidden", "chosen",
        "broken", "spoken", "driven", "frozen", "forgotten",
    ],
}

REPLACEMENTS: dict[str, str] = {
    "utilize": "use",
    "leverage": "use",
    "facilitate": "help",
    "ensure": "make sure",
    "prior to": "before",
    "subsequent to": "after",
    "obtain": "get",
    "demonstrate": "show",
    "additionally": "also",
    "furthermore": "also",
    "moreover": "also",
    "commence": "start",
    "initiate": "start",
    "in order to": "to",
    "due to the fact that": "because",
    "a variety of": "some",
    "in the event that": "if",
    "whilst": "while",
    "amongst": "among",
    "numerous": "many",
    "myriad": "many",
    "plethora": "many",
    "aforementioned": "this",
    "comprehensive": "complete",
    "spin up": "start",
    "spin down": "stop",
    "reach out": "ask",
    "dive into": "read",
    "kick off": "start",
    "roll out": "release",
    "tear down": "remove",
    "ramp up": "increase",
    "circle back": "return to",
    "drill down": "examine",
    "take a look at": "check",
}


def resolve_profile(name: str, table: dict[str, dict]) -> dict:
    """Resolve one profile, following `extends` chains without cycles."""
    seen: list[str] = []
    chain: list[dict] = []
    current = name
    while current is not None:
        if current in seen:
            raise ValueError(f"profile '{name}' has a circular extends chain")
        seen.append(current)
        if current not in table:
            raise ValueError(f"unknown profile '{current}'")
        entry = table[current]
        chain.append(entry)
        current = entry.get("extends")
    merged: dict = {"rules": {}}
    for entry in reversed(chain):
        for key, value in entry.items():
            if key == "extends":
                continue
            if key == "rules":
                merged["rules"].update({k.upper(): str(v) for k, v in value.items()})
            else:
                merged[key] = value
    merged.setdefault("max_sentence_words", 25)
    merged.setdefault("max_paragraph_sentences", 8)
    merged.setdefault("max_paragraph_words", 160)
    merged.setdefault("threshold", 1.5)
    for rule_id, severity in DEFAULT_SEVERITIES.items():
        merged["rules"].setdefault(rule_id, severity)
    merged["name"] = name
    return merged
