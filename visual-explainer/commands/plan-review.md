---
description: Generate a visual HTML plan review — current codebase state vs. proposed implementation plan
---
Load the visual-explainer skill, then generate a comprehensive visual plan review as a self-contained HTML page, comparing the current codebase against a proposed implementation plan.

Follow the visual-explainer skill workflow. Read the reference template, CSS patterns, and mermaid theming references before generating. Use a blueprint/editorial aesthetic with current-state vs. planned-state panels, but vary fonts and palette from previous diagrams.

**Inputs:**
- Plan file: `$1` (path to a markdown plan, spec, or RFC document)
- Codebase: `$2` if provided, otherwise the current working directory

**Data gathering phase** — only read files within the current working directory and the specified plan file. Do not read paths outside the project:

1. **Read the plan file in full.** Extract:
   - The problem statement and motivation
   - Each proposed change (files to modify, new files, deletions)
   - Rejected alternatives and their reasoning
   - Any explicit scope boundaries or non-goals

2. **Read every file the plan references.** For each file mentioned in the plan, read the current version in full. Also read files that import or depend on those files.

3. **Map the blast radius.** From the codebase, identify:
   - What imports/requires the files being changed
   - What tests exist for the affected files
   - Config files, types, or schemas that might need updates
   - Public API surface that callers depend on

4. **Cross-reference plan vs. code.** For each change the plan proposes, verify:
   - Does the file/function/type the plan references actually exist in the current code?
   - Does the plan's description of current behavior match what the code actually does?

**Verification checkpoint** — before generating HTML, produce a structured fact sheet:
- Every quantitative figure: file counts, estimated lines, function counts, test counts
- Every function, type, and module name from both the plan and the codebase
- Every behavior description: what the code currently does vs. what the plan proposes
- For each, cite the source: the plan section or the file:line where you read it
Verify each against the code and the plan. If something cannot be verified, mark it as uncertain.

**Diagram structure** — the page should include:

1. **Plan summary** — what problem does this plan solve, and what's the core insight? Then the scope: files touched, estimated scale, new modules or tests planned. *Visual treatment: hero depth.*
2. **Impact dashboard** — files to modify, files to create, files to delete, estimated lines added/removed, new test files planned, dependencies affected. Include completeness indicators for tests, docs, and migration/rollback.
3. **Current architecture** — Mermaid diagram of how the affected subsystem works *today*. Wrap in `.mermaid-wrap` with zoom controls.
4. **Planned architecture** — Mermaid diagram of how the subsystem will work *after* the plan. Use the same node names and layout direction as the current architecture diagram. Highlight new nodes with accent border, removed nodes with reduced opacity.
5. **Change-by-change breakdown** — for each change in the plan, a side-by-side panel:
   - **Left (current):** what the code does now, with relevant snippets
   - **Right (planned):** what the plan proposes
   - **Rationale:** why the plan chose this approach. Flag changes where the plan says *what* to do but not *why*.
   - Flag discrepancies where the plan's description of current behavior doesn't match the actual code.
6. **Dependency & ripple analysis** — *compact, consider `<details>` collapsed.* What other code depends on the files being changed. Color-code: covered by plan (green), not mentioned but likely affected (amber), definitely missed (red).
7. **Risk assessment** — styled cards for:
   - **Edge cases** the plan doesn't address
   - **Assumptions** the plan makes that should be verified
   - **Ordering risks** if changes need a specific sequence
   - **Rollback complexity**
   - **Cognitive complexity** — non-obvious coupling, implicit ordering requirements, action-at-a-distance behavior
   - Each risk gets a severity indicator (low/medium/high)
8. **Plan review** — structured Good/Bad/Ugly analysis:
   - **Good**: Solid design decisions, well-reasoned tradeoffs
   - **Bad**: Gaps in the plan — missing files, unaddressed edge cases, incorrect assumptions
   - **Ugly**: Complexity introduced, maintenance burden, things that will work initially but cause problems at scale
   - **Questions**: Ambiguities that need the plan author's clarification before implementation begins
9. **Understanding gaps** — rolls up decision-rationale gaps from section 5 and cognitive complexity flags from section 7:
   - Count of changes with clear rationale vs. missing rationale
   - List of cognitive complexity flags with severity
   - Recommendations: "Before implementing, document the rationale for changes X and Y"

**Visual hierarchy**: Sections 1-4 should dominate the viewport on load. Sections 6+ are reference material.

Include responsive section navigation. Use a current-vs-planned visual language: blue/neutral for current state, green/purple for planned additions, amber for areas of concern, red for gaps or risks. If `--publish` is specified, write to `./docs/visual-explainer/reviews/`. Otherwise write to `/tmp/visual-explainer/`. Open the result in the browser and tell the user the file path.

Ultrathink.

$@
