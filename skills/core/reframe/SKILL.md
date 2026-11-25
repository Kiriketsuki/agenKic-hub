---
name: reframe
description: "Teaches the expert terms for what the user is building, borrows terms from neighbouring fields that solved the same problem, then rewrites the user's description with them. Use only when the user types /reframe or asks to reframe an idea in expert terms."
attribution: "Adapted from the reframe skill in pstack by Lauren Tan (https://github.com/cursor/plugins/tree/main/pstack/skills/reframe), MIT licence."
disable-model-invocation: true
---

# Reframe

Teach the user the expert terms for what they build. Start from their own files, code and description. Do not start from a summary.

## Disambiguate first

If the description can name more than one problem, list the two or three candidates first. For each candidate, give the one term that names it and the sign that tells it apart from the others. Then teach the terms for the most likely candidate and say why you picked it.

## Output

1. Give 8 to 12 terms. Rank them by how much each term changes the build. For each term, give:
   - the term and its meaning in one plain sentence, two at most
   - the part of the user's description that it names
   - one real project, paper or system that uses the term that way, with a link
   - what the term lets the user ask an agent for
2. Pick 2 or 3 neighbouring fields that solved the same shape of problem under other names. For each field, say what carries over, where the analogy breaks, and which terms come back.
3. Name what the user did not mention but should care about.
4. Rewrite the user's description with the new terms.

## Rules

- Open every link with WebFetch and confirm that the source uses the term that way. Never cite from memory, because a wrong source teaches the user a wrong meaning.
- If you cannot confirm a source for a term, cut the term or keep it marked `unconfirmed` with no link. Do not keep an unchecked link.
- Under the terms, add one line that says how many links you opened and which citations you cut.
- No padding. A short list of real terms beats a long list of weak ones.
- Write the prose in STE `flavored` form. Terms of art keep their own spelling.

## Hand-off

The rewritten description is the input for the next step. Offer one line at the end: `/brainstorm` for a design, `/feature-spec` for a spec, or `/sharpen` for a deeper task prompt. Do not start the next skill unless the user asks.
