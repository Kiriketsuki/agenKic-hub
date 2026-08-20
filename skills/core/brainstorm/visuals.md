# Visuals

Three ways to show something. Climb only as far as you need.

## The ladder

| Rung | Mechanism | Reach for it when | Cost |
|---|---|---|---|
| 1 | Inline mermaid fence, markdown table, ASCII sketch | Structure, flow, comparison, state machine. Most visual questions. | Free, zero tool calls, stays in the transcript |
| 2 | Artifact tool, one self-contained HTML page | The user must see a rendered layout, mockup or side-by-side | One tool call, no process, the page persists at a URL |
| 3 | `scripts/start-server.sh` live server | Several rounds of iterate-and-click on the same surface | A background process, a port, a lifecycle to clean up |

## Default to rung 1

An architecture question is a fenced mermaid block that costs zero tool calls, not a browser tab. Reach for rung 2 only when fidelity is the point: a layout, a mockup, a look-and-feel comparison.

## What is not visual

This test applies to all three rungs. Stay in the terminal when the content is text or tabular:

- **Requirements and scope questions** — "what does X mean?", "which features are in scope?"
- **Conceptual A/B/C choices** — picking between approaches described in words
- **Tradeoff lists** — pros/cons, comparison tables
- **Technical decisions** — API design, data modeling, architectural approach selection
- **Clarifying questions** — anything where the answer is words, not a visual preference

A question *about* a UI topic is not automatically a visual question. "What kind of wizard do you want?" is conceptual — use the terminal. "Which of these wizard layouts feels right?" is visual — climb the ladder.

## Rung 2 recipe

Write one self-contained HTML file, then publish it with the Artifact tool. Load the `artifact-design` skill before writing the page.

- Render options as cards with clear labels (A, B, C). The user replies in chat with the pick.
- Keep the page self-contained: inline CSS, no external assets.
- Scale fidelity to the question. Wireframes for layout questions, polish for polish questions.
- 2 to 4 options per page. Explain the question on the page itself.
- Iterate by editing the same file and republishing. The URL stays stable.

No click capture, no live reload, no process, no cleanup. This covers most of what the live server was built for.

## Climbing to rung 3

Finish this sentence before starting the server: "I need the server because ___". If the answer is anything other than repeated iteration with click capture across several turns, use rung 2. Ask the user before starting it, because it launches a background process.

**Read `scripts/SERVER.md` before running `start-server.sh`.**
