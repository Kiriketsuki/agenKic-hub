---
name: visual-explainer
description: Generate beautiful, self-contained HTML pages that visually explain systems, code changes, plans, and data. Use when the user asks for a diagram, architecture overview, diff review, plan review, project recap, comparison table, or any visual explanation of technical concepts.
license: MIT
metadata:
  author: nicobailon
  version: "0.5.2"
---

# Visual Explainer

Generate self-contained HTML files for technical diagrams, visualizations, and data tables. Always open the result in the browser.

**Table rendering is opt-in.** Only generate HTML tables when the user explicitly requests visual or HTML output. Do not generate HTML pages proactively for terminal output — present data as plain text in the terminal unless asked.

## Available Commands

Detailed prompt templates in `./commands/`. Invoke as `/visual-explainer:diff-review`, `/visual-explainer:generate-web-diagram`, etc.

| Command | What it does |
|---------|-------------|
| `generate-web-diagram` | Generate an HTML diagram for any topic |
| `generate-visual-plan` | Generate a visual implementation plan for a feature |
| `generate-slides` | Generate a magazine-quality slide deck |
| `diff-review` | Visual diff review with architecture comparison and code review |
| `plan-review` | Compare a plan against the codebase with risk assessment |
| `project-recap` | Mental model snapshot for context-switching back to a project |
| `fact-check` | Verify accuracy of a document against actual code |

## Workflow

### 1. Think (5 seconds, not 5 minutes)

Before writing HTML, commit to a direction. Don't default to "dark theme with blue accents" every time.

**Visual is always default.** Even essays, blog posts, and articles get visual treatment — extract structure into cards, diagrams, grids, tables.

Prose patterns (lead paragraphs, pull quotes, callout boxes) are **accent elements** within visual pages, not a separate mode. Use them to highlight key points or provide breathing room, but the page structure remains visual.

For prose accents (lead paragraphs, pull quotes, callout boxes), use the standard freeform approach with the aesthetic directions below.

**Who is looking?** A developer understanding a system? A PM seeing the big picture? A team reviewing a proposal? This shapes information density and visual complexity.

**What type of content?** Architecture, flowchart, sequence, data flow, schema/ER, state machine, mind map, class diagram, C4 architecture, data table, timeline, dashboard, or prose-first page. Each has distinct layout needs and rendering approaches (see Diagram Types below).

**What aesthetic?** Pick one and commit. The constrained aesthetics (Blueprint, Editorial, Paper/ink) are safer — they have specific requirements that prevent generic output. The flexible ones (IDE-inspired) require more discipline.

**Constrained aesthetics (prefer these):**
- Blueprint (technical drawing feel, subtle grid background, deep slate/blue palette, monospace labels, precise borders)
- Editorial (serif headlines like Instrument Serif or Crimson Pro, generous whitespace, muted earth tones or deep navy + gold)
- Paper/ink (warm cream `#faf7f5` background, terracotta/sage accents, informal feel)
- Monochrome terminal (green/amber on near-black, monospace everything, CRT glow optional)

**Flexible aesthetics (use with caution):**
- IDE-inspired (borrow a real, named color scheme: Dracula, Nord, Catppuccin Mocha/Latte, Solarized Dark/Light, Gruvbox, One Dark, Rosé Pine) — commit to the actual palette, don't approximate
- Data-dense (small type, tight spacing, maximum information, muted colors)

**Explicitly forbidden:**
- Neon dashboard (cyan + magenta + purple on dark) — always produces AI slop
- Gradient mesh (pink/purple/cyan blobs) — too generic
- Any combination of Inter font + violet/indigo accents + gradient text

Vary the choice each time. If the last diagram was dark and technical, make the next one light and editorial. The swap test: if you replaced your styling with a generic dark theme and nobody would notice the difference, you haven't designed anything.

### 2. Structure

**Read the reference material** before generating. Don't memorize it — read it each time to absorb the patterns.
- For flowcharts, sequence diagrams, ER, state machines, mind maps, class diagrams, C4: read `./templates/mermaid-flowchart.html`
- For slide deck presentations (when `--slides` flag is present or `/generate-slides` is invoked): read `./templates/slide-deck.html`
- For all other content (architecture overviews, data tables, comparisons, dashboards, etc.): use the freeform approach with the patterns documented in this skill.

**Choosing a rendering approach:**

| Content type | Approach | Why |
|---|---|---|
| Architecture (text-heavy) | CSS Grid cards + flow arrows | Rich card content (descriptions, code, tool lists) needs CSS control |
| Architecture (topology-focused) | **Mermaid** | Visible connections between components need automatic edge routing |
| Flowchart / pipeline | **Mermaid** | Automatic node positioning and edge routing |
| Sequence diagram | **Mermaid** | Lifelines, messages, and activation boxes need automatic layout |
| Data flow | **Mermaid** with edge labels | Connections and data descriptions need automatic edge routing |
| ER / schema diagram | **Mermaid** | Relationship lines between many entities need auto-routing |
| State machine | **Mermaid** | State transitions with labeled edges need automatic layout |
| Mind map | **Mermaid** | Hierarchical branching needs automatic positioning |
| Class diagram | **Mermaid** | Inheritance, composition, aggregation lines with automatic routing |
| C4 architecture | **Mermaid** | Use `graph TD` + `subgraph` for C4 (not native `C4Context` — it ignores themes) |
| Data table | HTML `<table>` | Semantic markup, accessibility, copy-paste behavior |
| Timeline | CSS (central line + cards) | Simple linear layout doesn't need a layout engine |
| Dashboard | CSS Grid + Chart.js | Card grid with embedded charts |

**Mermaid theming:** Always use `theme: 'base'` with custom `themeVariables` so colors match your page palette. Use `layout: 'elk'` for complex graphs (requires the `@mermaid-js/layout-elk` package). Override Mermaid's SVG classes with CSS for pixel-perfect control.

**Mermaid containers:** Always center Mermaid diagrams with `display: flex; justify-content: center;`. Add zoom controls (+/−/reset/expand) to every `.mermaid-wrap` container. Include the click-to-expand JavaScript so clicking the diagram (or the ⛶ button) opens it full-size in a new tab.

**Never use bare `<pre class="mermaid">`.** It renders but has no zoom/pan controls — diagrams become tiny and unusable. Always use the full `diagram-shell` pattern from `templates/mermaid-flowchart.html`.

**Mermaid scaling:** Diagrams with 10+ nodes render too small by default. For 10-12 nodes, increase `fontSize` in themeVariables to 18-20px and set `INITIAL_ZOOM` to 1.5-1.6. For 15+ elements, use the hybrid pattern instead (simple Mermaid overview + CSS Grid cards).

**Mermaid layout direction:** Prefer `flowchart TD` (top-down) over `flowchart LR` (left-to-right) for complex diagrams. Use LR only for simple 3-4 node linear flows.

**Mermaid line breaks in flowchart labels:** Do NOT use `<br/>` in labels — Mermaid converts it to `<br>` inside SVG `<foreignObject>`, which is invalid XML and causes parse errors in browsers. Keep labels single-line instead. If a label is too long, shorten the text or split into multiple connected nodes.

**Mermaid CSS class collision constraint:** Never define `.node` as a page-level CSS class. Use the namespaced `.ve-card` class for card components instead.

### 3. Style

Apply these principles to every diagram:

**Typography is the diagram.** Pick a distinctive font pairing. Every page should use a different pairing from recent generations.

**Forbidden as `--font-body`:** Inter, Roboto, Arial, Helvetica, system-ui alone.

**Good pairings (use these):**
- DM Sans + Fira Code (technical, precise)
- Instrument Serif + JetBrains Mono (editorial, refined)
- IBM Plex Sans + IBM Plex Mono (reliable, readable)
- Bricolage Grotesque + Fragment Mono (bold, characterful)
- Plus Jakarta Sans + Azeret Mono (rounded, approachable)

Load via `<link>` in `<head>`. Include a system font fallback in the `font-family` stack for offline resilience.

**Color tells a story.** Use CSS custom properties for the full palette. Define at minimum: `--bg`, `--surface`, `--border`, `--text`, `--text-dim`, and 3-5 accent colors.

**Forbidden accent colors:** `#8b5cf6` `#7c3aed` `#a78bfa` (indigo/violet), `#d946ef` (fuchsia), the cyan-magenta-pink combination.

**Good accent palettes (use these):**
- Terracotta + sage (`#c2410c`, `#65a30d`) — warm, earthy
- Teal + slate (`#0891b2`, `#0369a1`) — technical, precise
- Rose + cranberry (`#be123c`, `#881337`) — editorial, refined
- Amber + emerald (`#d97706`, `#059669`) — data-focused
- Deep blue + gold (`#1e3a5f`, `#d4a73a`) — premium, sophisticated

**Surfaces whisper, they don't shout.** Build depth through subtle lightness shifts (2-4% between levels). Borders should be low-opacity rgba.

**Backgrounds create atmosphere.** Use subtle gradients or faint grid patterns via CSS.

**Visual weight signals importance.** Executive summaries and key metrics should dominate the viewport on load. Reference sections should be compact.

**Surface depth creates hierarchy.** Hero sections get elevated shadows. Body content stays flat. Code blocks feel recessed.

**Animation earns its place.** Staggered fade-ins on page load are almost always worth it. Always respect `prefers-reduced-motion`.

**Forbidden animations:**
- Animated glowing box-shadows
- Pulsing/breathing effects on static content
- Continuous animations that run after page load

### 4. Deliver

**Output location:** Two modes controlled by the `--publish` flag:
- **Without `--publish`** (default): write to `/tmp/visual-explainer/` and open in browser. Output is ephemeral — not tracked in git.
- **With `--publish`**: write to `./docs/visual-explainer/<type>/` relative to the current project root. The `<type>` subdirectory matches the command: `diagrams/`, `slides/`, `reviews/`, `recaps/`, `plans/`. This output is tracked in git and served by GitHub Pages if the `deploy-docs` workflow is configured.

Use a descriptive filename based on content: `modem-architecture.html`, `pipeline-flow.html`, `schema-overview.html`.

**Open in browser:**
- macOS: `open <path>/filename.html`
- Linux: `xdg-open <path>/filename.html`

**Tell the user** the file path and whether it was written to the tracked `./docs/` directory or the temp location.

## Diagram Types

### Architecture / System Diagrams
Three approaches depending on complexity:

**Simple topology (under 10 elements):** Use Mermaid.

**Text-heavy overviews (under 15 elements):** CSS Grid with explicit row/column placement.

**Complex architectures (15+ elements):** Use the **hybrid pattern** — a simple Mermaid overview (5-8 nodes) followed by detailed CSS Grid cards for each module's internals.

### Flowcharts / Pipelines
**Use Mermaid.** Prefer `graph TD`; use `graph LR` only for simple 3-4 node linear flows.

### Sequence Diagrams
**Use Mermaid.** Use `sequenceDiagram` syntax.

### Data Flow Diagrams
**Use Mermaid.** Use `graph TD` with edge labels for data descriptions.

### Schema / ER Diagrams
**Use Mermaid.** Use `erDiagram` syntax.

### State Machines / Decision Trees
**Use Mermaid.** Use `stateDiagram-v2` for states with labeled transitions. Use `flowchart TD` if labels need special characters (colons, parentheses). Avoid `<br/>` in labels — it produces malformed SVG XML.

### Mind Maps / Hierarchical Breakdowns
**Use Mermaid.** Use `mindmap` syntax.

### Class Diagrams
**Use Mermaid.** Use `classDiagram` syntax.

### C4 Architecture Diagrams
**Use Mermaid flowchart syntax — NOT native C4.** Use `graph TD` with `subgraph` blocks for C4 boundaries.

### Data Tables / Comparisons / Audits
Use a real `<table>` element. Sticky `<thead>`, alternating row backgrounds, responsive wrapper with `overflow-x: auto`.

Status indicators (use styled `<span>` elements, never emoji):
- Match/pass/yes: green background
- Gap/fail/no: red background
- Partial/warning: amber indicator
- Neutral/info: dim text or muted badge

### Timeline / Roadmap Views
Vertical or horizontal timeline with a central line (CSS pseudo-element).

### Dashboard / Metrics Overview
Card grid layout. Hero numbers large and prominent. Sparklines via inline SVG `<polyline>`. For real charts, use **Chart.js via CDN**.

### Implementation Plans

**Don't dump full files.** Show file structure with descriptions — list functions/exports with one-line explanations and key snippets only.

**Structure for implementation plans:**
1. Overview/purpose
2. Flow diagram (Mermaid or CSS cards)
3. File structure with descriptions (not full code)
4. Key implementation details (snippets)
5. API/interface summary
6. Usage examples

### Documentation (READMEs, Library Docs, API References)

| Content | Visual Treatment |
|---------|------------------|
| Features | Card grid (2-3 columns) |
| Install/setup steps | Numbered cards or vertical flow |
| API endpoints/commands | Table with sticky header |
| Config options | Table |
| Architecture | Mermaid diagram or CSS card layout |
| Comparisons | Side-by-side panels or table |
| Warnings/notes | Callout boxes |

### Prose Accent Elements

- **Lead paragraph** — larger intro text
- **Pull quote** — one per page maximum
- **Callout box** — warnings, tips, important notes
- **Section divider** — visual break between major sections

## Slide Deck Mode

An alternative output format for presenting content as a magazine-quality slide presentation. **Opt-in only** — only generate slides when the user invokes `/generate-slides`, passes `--slides`, or explicitly asks for a slide deck.

**Slides are not pages reformatted.** Each slide is exactly one viewport tall (100dvh) with no scrolling. Typography is 2–3× larger. Compositions are bolder.

**Content completeness.** Every section, decision, data point, and specification from the source must appear in the deck. Add more slides rather than cutting content.

**Slide types (10):** Title, Section Divider, Content, Split, Diagram, Dashboard, Table, Code, Quote, Full-Bleed.

**Compositional variety:** Consecutive slides must vary spatial approach — centered, left-heavy, right-heavy, split, edge-aligned, full-bleed.

**Curated presets:** Midnight Editorial, Warm Signal, Terminal Mono, Swiss Clean. Pick one and commit.

## File Structure

Every diagram is a single self-contained `.html` file. No external assets except CDN links (fonts, optional libraries). Structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Descriptive Title</title>
  <link href="https://fonts.googleapis.com/css2?family=...&display=swap" rel="stylesheet">
  <style>
    /* CSS custom properties, theme, layout, components — all inline */
  </style>
</head>
<body>
  <!-- Semantic HTML: sections, headings, lists, tables, inline SVG -->
  <!-- No script needed for static CSS-only diagrams -->
  <!-- Optional: <script> for Mermaid, Chart.js, or anime.js when used -->
</body>
</html>
```

## Quality Checks

Before delivering, verify:
- **The squint test**: Blur your eyes. Can you still perceive hierarchy?
- **The swap test**: Would replacing your fonts and colors with a generic dark theme make this indistinguishable from a template?
- **Both themes**: Toggle your OS between light and dark mode. Both should look intentional.
- **Information completeness**: Does the diagram actually convey what the user asked for?
- **No overflow**: Resize the browser to different widths. No content should clip or escape its container.
- **Mermaid zoom controls**: Every `.mermaid-wrap` container must have zoom controls.
- **File opens cleanly**: No console errors, no broken font loads, no layout shifts.

## Anti-Patterns (AI Slop)

### Typography
**Forbidden fonts as primary `--font-body`:** Inter, Roboto, Arial, Helvetica, system-ui alone.

### Color Palette
**Forbidden accent colors:** Indigo-500/violet-500, the cyan + magenta + pink neon gradient combination.

**Forbidden color effects:**
- Gradient text on headings
- Animated glowing box-shadows on cards
- Multiple overlapping radial glows in accent colors

### Section Headers
**Forbidden:** Emoji icons in section headers, headers that all use the same icon-in-rounded-box pattern.

**Required:** Styled monospace labels with colored dot indicators, numbered badges, or asymmetric section dividers.

### Layout & Hierarchy
**Forbidden:** Perfectly centered everything, all cards styled identically, every section getting equal visual treatment, symmetric layouts.

### Template Patterns
**Forbidden:** Three-dot window chrome on code blocks, KPI cards where every metric has identical gradient text, Neon Dashboard aesthetic, gradient meshes.

### The Slop Test

Before delivering, apply this test: **Would a developer looking at this page immediately think "AI generated this"?** The telltale signs:

1. Inter or Roboto font with purple/violet gradient accents
2. Every heading has `background-clip: text` gradient
3. Emoji icons leading every section
4. Glowing cards with animated shadows
5. Cyan-magenta-pink color scheme on dark background
6. Perfectly uniform card grid with no visual hierarchy
7. Three-dot code block chrome

If two or more of these are present, regenerate with Editorial, Blueprint, Paper/ink, or a specific IDE theme.
