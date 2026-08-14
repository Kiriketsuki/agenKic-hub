---
name: cover-letter
description: Write a cover letter in the user's voice from a job posting and render it as a clean LaTeX PDF. Use when the user pastes a job description and asks for a cover letter, or says "cover letter for [company/role]", "/cover-letter", "apply to this", "write me a letter for this posting".
---

# Cover Letter

## Configuration

This skill is personal by design. Before first use, customize:

- `VOICE.md` (this skill directory): replace the example name, email, and voice notes
  with your own. It ships as a worked example.
- `template.tex`: replace the example name, location, and email in the header.
- `$LETTERS_DIR`: the folder that stores your letters, for example `~/documents/cover-letters`.
- `$VOICE_TEMPLATE` (optional): a past letter of yours that anchors structure and register.
- `$FACTS_FILE`: the only approved source for claims and numbers about your current role.

Turn a job posting into a cover letter in the user's voice, saved as markdown plus a clean single-page LaTeX PDF.

## Inputs

- The job posting (pasted text or URL). If a URL, fetch it first.
- If the company or role title is ambiguous, ask; otherwise proceed.

## Source material (read before writing, in this order)

1. **`VOICE.md`** (this skill directory) — the distilled voice card: signature moves, banned patterns, fixed elements, self-check. This is the primary style authority.
2. **Voice template**: `$VOICE_TEMPLATE` — a past letter that shows the canonical structure and register.
3. **Verified facts**: `$FACTS_FILE` — the only approved source for claims and numbers about your current role.
4. **Past letters**: other files in `$LETTERS_DIR` — reuse framing that worked, do not repeat a letter verbatim.

## Hard constraints

- Everything in `VOICE.md` — banned patterns, fixed opener/pivot/closer, self-check.
- Product, employer, and institution names must match `$FACTS_FILE` exactly. Keep a
  short list of easy-to-confuse names there.
- Use the email and sign-off name from `VOICE.md`.
- Every number must come from `$FACTS_FILE`. Do not invent metrics.
- Default to generic descriptions over tech name-dropping (say "backend API architecture", not "gRPC behind Envoy") — name a specific technology only when the target role makes it relevant (e.g. the posting lists it).
- Be honest about gaps: name them and frame the transfer, never inflate.
- Find one genuine hook per company (domain overlap with airport ops, their stack, a product you actually use, their culture) and build the "why you" section around it. A personal, concrete hook beats a flattering generic one.

## Workflow

1. Read the sources above.
2. Draft the letter (350-450 words), then run the `VOICE.md` self-check and rewrite anything that fails it before showing the user.
3. Save markdown to `$LETTERS_DIR/<Company> <Role> - Cover Letter.md` with frontmatter: `tags: [career, application]`, `date`, `status: draft`, `target: <Company> <Role>`.
4. Render the PDF:
   ```bash
   python3 <skill-dir>/render.py "$LETTERS_DIR/<name>.md"
   ```
   The script extracts the letter body (greeting through the paragraph before "Best Regards,"), fills `template.tex`, escapes LaTeX specials, converts quotes, compiles with **tectonic**, and writes the PDF next to the markdown.
5. Visually verify: `pdftoppm -png -r 80 <pdf> /tmp/page && Read /tmp/page-1.png`. Check it is one page and nothing overflows.
6. Show the user the full letter text in chat (never just the file path) and flag: the hook chosen, any honesty-sensitive framing, and anything needing their verification (dates, titles).
7. On revision requests, edit the markdown and re-run `render.py` — the PDF regenerates in place.

## Output

- `<Company> <Role> - Cover Letter.md` and `.pdf` in `$LETTERS_DIR`.
- Full letter text in the chat reply.
