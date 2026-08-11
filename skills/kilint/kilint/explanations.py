"""The rationale printed by `kilint --explain ID`.

Two to four sentences per rule: what the pattern costs the reader, why it is in
the house style, and what to do instead.
"""

EXPLAIN: dict[str, str] = {
    "SEN001": (
        "Long sentences hide the action. A reader has to hold every clause in memory "
        "before the verb arrives. Cap the length and split on the joining word."
    ),
    "SEN002": (
        "One sentence should carry one instruction. When a step says do this, and then "
        "do that, a reader can miss the second half. Split it into two numbered steps."
    ),
    "STR001": (
        "A paragraph that runs long in both sentences and words is doing too much work. "
        "It trips only when both caps are exceeded, so a list of short steps is never "
        "penalised. Break it up or convert it to a list."
    ),
    "STR002": (
        "A condition placed after the command makes the reader act first and check "
        "later. Put the condition in front so the reader knows whether the step "
        "applies. This is a strict-profile rule."
    ),
    "PUN001": (
        "A semicolon joins two independent clauses that would read better as two "
        "sentences. Technical readers scan for full stops. Replace it with a full stop."
    ),
    "PUN002": (
        "The em-dash and en-dash are the loudest markers of generated prose in this "
        "house style. They also break plain-text rendering in terminals and hooks. Use "
        "a spaced hyphen or split the sentence."
    ),
    "PUN003": (
        "An exclamation mark asks for an emotion the reader did not agree to. In "
        "technical prose it reads as sales copy. Use a full stop."
    ),
    "PUN004": (
        "Curly quotation marks are hard to type, hard to grep, and they break "
        "copy-paste into shells. Straight quotes are safer in technical prose. This "
        "rule is off unless a profile turns it on."
    ),
    "WRD001": (
        "Contractions read as chat, not as a record. Written-out forms also survive "
        "translation and screen readers better. Write do not instead of don't."
    ),
    "WRD002": (
        "Long Latinate words cost the reader time and buy nothing. Each entry in the "
        "list has a shorter, plainer replacement. The message names the replacement."
    ),
    "WRD003": (
        "Marketing adjectives make claims that no test can check. They are the clearest "
        "signal that prose was generated rather than written. Delete the adjective or "
        "replace it with a measurement."
    ),
    "WRD004": (
        "Filler phrases announce that something matters instead of showing it. They add "
        "words and delay the point. Delete the phrase and keep the sentence."
    ),
    "WRD005": (
        "Phrasal verbs are informal and often ambiguous for non-native readers. A "
        "single plain verb is shorter and clearer. Replace spin up with start."
    ),
    "WRD006": (
        "A nominalization buries a verb inside a noun and then needs a weak helper verb "
        "to carry it. Analyse is shorter than perform an analysis. Use the plain verb."
    ),
    "WRD007": (
        "The house style has no emoji anywhere, in notes, filenames, or agent output. "
        "Emoji also render inconsistently in terminals and PDFs. Remove the character."
    ),
    "WRD008": (
        "Vague quantifiers make a claim sound measured without measuring anything. "
        "Several failures is not a number. Give the number or drop the claim. This rule "
        "is off by default."
    ),
    "VRB001": (
        "Passive voice hides who performs the action, which matters most in procedures "
        "and error messages. The allow list keeps adjectival participles such as is "
        "based on out of the results. Name the actor and use an active verb."
    ),
    "VRB002": (
        "A be-verb plus an -ing verb is longer than the simple tense and rarely adds "
        "meaning. The system is running the job says no more than the system runs the "
        "job. An allow list keeps stative adjectives such as is missing out of the "
        "results. Use the simple tense."
    ),
    "VRB003": (
        "Stacked modals and hedging verbs signal that the writer is not sure. Two "
        "hedges next to each other, as in may possibly, mean the sentence is guessing. "
        "One modal per clause is fine. State what is true, or say plainly that it is "
        "unknown."
    ),
    "TRM001": (
        "One name for one thing. Aliases force the reader to work out whether two words "
        "mean the same object. This rule stays silent until a terminology table is "
        "configured."
    ),
}
