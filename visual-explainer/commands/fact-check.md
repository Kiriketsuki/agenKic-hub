---
description: Verify the factual accuracy of a document against the actual codebase, correct inaccuracies in place
---
Load the visual-explainer skill, then verify the factual accuracy of a document that makes claims about a codebase. Read the file, extract every verifiable claim, check each against the actual code and git history, correct inaccuracies in place, and add a verification summary.

For HTML files: read `./references/css-patterns.md` to match the existing page's styling when inserting the verification summary.

**Target file** — determine what to verify from `$1`:
- Explicit path: verify that specific file (`.html`, `.md`, or any text document)
- No argument: verify the most recently modified `.html` file — check `./docs/visual-explainer/` first, then fall back to `/tmp/visual-explainer/` (`ls -t ./docs/visual-explainer/**/*.html /tmp/visual-explainer/*.html 2>/dev/null | head -1`)

Auto-detect the document type and adjust the verification strategy:
- **HTML review pages** (diff-review, plan-review, project-recap): detect from page content, verify against the git ref or plan file the review was based on
- **Plan/spec documents** (markdown): verify file references, function/type names, behavior descriptions against the current codebase
- **Any other document**: extract and verify whatever factual claims about code it contains

**Phase 1: Extract claims.** Read the file. Extract every verifiable factual claim:
- **Quantitative**: line counts, file counts, function counts, module counts, test counts, any numeric metrics
- **Naming**: function names, type names, module names, file paths referenced in the document
- **Behavioral**: descriptions of what code does, how things work, before/after comparisons
- **Structural**: architecture claims, dependency relationships, import chains, module boundaries
- **Temporal**: git history claims, commit attributions, timeline entries

Skip subjective analysis (opinions, design judgments, readability assessments).

**Phase 2: Verify against source.** For each extracted claim, go to the source. Only read files within the current working directory:
- Re-read every file referenced in the document
- For claims about git history: re-run git commands and compare output against the document's numbers
- For diff-reviews: read both the ref version and working tree version to verify before/after claims
- For plan docs: verify that files, functions, and types the plan references actually exist

Classify each claim:
- **Confirmed**: claim matches the code/output exactly
- **Corrected**: claim was inaccurate — note what was wrong and what the correct value is
- **Unverifiable**: claim can't be checked

**Phase 3: Correct in place.** Edit the file directly using surgical text replacements:
- Fix incorrect numbers, function names, file paths, behavior descriptions
- Fix before/after swaps (a common error class in review pages)
- For HTML: preserve layout, CSS, animations, Mermaid diagrams (unless they contain factual errors)
- For markdown: preserve heading structure, formatting, and document organization

**Phase 4: Add verification summary.**
- **HTML files**: insert a verification section as a banner at the top or final section, matching the page's existing styling.
- **Markdown files**: append a `## Verification Summary` section at the end.

Include in the summary:
- Total claims checked
- Claims confirmed (with count)
- Corrections made (with brief list of what was fixed)
- Unverifiable claims flagged (if any)

**Phase 5: Report.** Tell the user what was checked, what was corrected, and open the file. If nothing needed correction, say so.

This is not a re-review. It does not second-guess analysis, opinions, or design judgments. It is a fact-checker only.

Write corrections to the original file.

Ultrathink.

$@
