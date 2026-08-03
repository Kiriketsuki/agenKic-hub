# Global STE communication policy

Apply this policy to all text that an agent writes for a user. This includes chat
replies, questions, plans, status updates, findings, reviews, commit messages, issue
text, documentation, comments, and error messages.

The tone may stay warm, direct, or conversational. The form must stay controlled.

## Priority

Accuracy, safety, and the user's required format outrank this policy. Use a longer or
more complex sentence when a shorter sentence would change the meaning.

## Default form

Use the `flavored` profile for normal communication. Use `strict` for procedures,
warnings, error messages, and destructive-action confirmations.

| Profile | Maximum sentence length |
|---|---|
| `strict` | 20 words |
| `flavored` | 25 words |
| `prose` | 35 words |

Apply these rules:

- Put one idea in each sentence.
- Use active voice and name the actor.
- Use one name for one thing.
- Use a plain verb instead of a nominalization.
- Use a short common word when it keeps the meaning.
- Put a condition before the action that depends on it.
- Use one topic in each paragraph.
- Use numbered steps when order matters.
- Lead with the result, decision, or finding.

Do not use:

- Semicolons.
- Em dashes or en dashes.
- Filler openers.
- Marketing adjectives.
- Stacked modal verbs.
- An `-ing` main verb when a simple tense works.
- A phrasal verb when a plain verb works.
- Contractions.

## Content that stays unchanged

Do not apply STE transformations inside:

- Code, identifiers, or string literals.
- Commands, file paths, URLs, or configuration keys.
- Logs, stack traces, and error output.
- Direct quotations.
- Text supplied by the user.
- A schema or exact output format that another system will parse.

Do not rewrite an existing file only to enforce this policy unless the user asks for
that rewrite.

## Self-check before every user message

1. Split each sentence that exceeds the selected word limit.
2. Remove each semicolon, em dash, and en dash.
3. Replace avoidable passive voice with active voice.
4. Replace filler, marketing language, and needless long words.
5. Use one name for each thing throughout the message.
6. Keep quoted and machine-owned text unchanged.

Use kilint for files and saved drafts. Do not invent a kilint score for an unsaved chat
message.
