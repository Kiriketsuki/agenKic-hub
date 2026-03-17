---
description: Generate a visual HTML implementation plan — detailed feature specification with state machines, code snippets, and edge cases
---
Load the visual-explainer skill, then generate a comprehensive visual implementation plan for `$@` as a self-contained HTML page.

Follow the visual-explainer skill workflow. Read the reference template, CSS patterns, and mermaid theming references before generating. Use an editorial or blueprint aesthetic, but vary fonts and palette from previous diagrams.

**Data gathering phase** — understand the context before designing. Only read files within the current working directory:

1. **Parse the feature request.** Extract:
   - The core problem being solved
   - Desired user-facing behavior
   - Any constraints or requirements mentioned
   - Scope boundaries (what's explicitly out of scope)

2. **Read the relevant codebase.** Identify:
   - Files that will need modification
   - Existing patterns to follow (code style, architecture, naming conventions)
   - Related functionality that the feature should integrate with
   - Types, interfaces, and APIs the feature must conform to

3. **Understand the extension points.** Look for:
   - Hook points, event systems, or plugin architectures
   - Configuration options or flags
   - Public APIs that might need extension
   - Test patterns used in the codebase

4. **Check for prior art.** Search for:
   - Similar features already implemented
   - Related issues or discussions
   - Existing code that can be reused or extended

**Design phase** — work through the implementation before writing HTML:

1. **State design.** What new state variables are needed? What existing state is affected?
2. **API design.** What commands, functions, or endpoints are added? What are the signatures? What are the error cases?
3. **Integration design.** How does this feature interact with existing functionality?
4. **Edge cases.** Walk through unusual scenarios: concurrent operations, error conditions, boundary values, user mistakes.

**Verification checkpoint** — before generating HTML, produce a structured fact sheet:
- Every state variable (new and modified) with its type and purpose
- Every function/command/API with its signature
- Every file that needs modification with the specific changes
- Every edge case with expected behavior
- Every assumption about the codebase that the plan relies on
Verify each against the code. If something cannot be verified, mark it as uncertain.

**Diagram structure** — the page should include:

1. **Header** — feature name, one-line description, scope summary.
2. **The Problem** — side-by-side comparison panels showing current behavior vs. desired behavior. Use concrete examples.
3. **State Machine** — Mermaid flowchart or stateDiagram showing the states and transitions. Wrap in `.mermaid-wrap` with zoom controls.
4. **State Variables** — card grid showing new state and existing state (if modified). Use code blocks with `white-space: pre-wrap`.
5. **Modified Functions** — for each function that needs changes, show: function name and file path, key code snippet (10-20 lines), explanation of what changed and why.
6. **Commands / API** — table with command/function name, parameters, and behavior description.
7. **Edge Cases** — table listing scenarios and expected behaviors.
8. **Test Requirements** — table or card grid showing test categories and specific tests to add.
9. **File References** — table mapping files to the changes needed.
10. **Implementation Notes** — callout boxes for:
    - Backward compatibility considerations (gold border)
    - Critical implementation warnings (rose border)
    - Performance considerations if relevant (amber border)

**Visual hierarchy:**
- Sections 1-3 should dominate the viewport on load
- Sections 4-6 are core implementation details
- Sections 7-10 are reference material (compact, collapsible where appropriate)

**Code block requirements:**
- Always use `white-space: pre-wrap` and `word-break: break-word`
- Include file path headers where relevant
- Keep snippets focused — show the pattern, not the full implementation

**Overflow prevention:**
- Apply `min-width: 0` on all grid/flex children
- Use `overflow-wrap: break-word` on all text containers
- Never use `display: flex` on `<li>` for markers — use absolute positioning

If `--publish` is specified, write to `./docs/visual-explainer/plans/`. Otherwise write to `/tmp/visual-explainer/`. Open the result in the browser and tell the user the file path.

Ultrathink.
