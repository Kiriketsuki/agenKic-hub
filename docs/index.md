---
title: agenKic sKills
hide:
  - navigation
  - toc
---

<div class="ck-hero" markdown>
<div class="ck-hero__hatch"></div>
<img class="ck-hero__hex" src="assets/chrysaki-mark.svg" alt="">
<span class="ck-eyebrow"><span class="ck-chip">⬢ public hub</span> agentic tooling, symlinked</span>
<h1>Skills that<br><em>think in rounds.</em></h1>
<p>20+ Claude Code skills, 10+ multi-agent workflow scripts, harness scaffolds for five runtimes, and an installer that symlinks the lot into your machine. Adversarial councils, spec loops, and a prose linter that refuses to let AI slop through.</p>
<div class="ck-hero__actions">
<a class="ck-btn" href="setup/install/">⬢ Install</a>
<a class="ck-btn ck-btn--ghost" href="skills/">Browse skills →</a>
</div>
<div class="ck-clone"><code>git clone https://github.com/Kiriketsuki/agenKic-sKills && ./setup/setup.sh</code></div>
</div>

<span class="ck-kicker">01 · The stack</span>
<h2 class="ck-h2">One repo. <em>One symlink pass.</em></h2>

The installer does not copy files. It links them, so a `git pull` updates every harness in place.

<div class="ck-grid ck-grid--5">
<div class="ck-card"><div class="ck-card__kicker">20+ skills</div><div class="ck-card__title">skills/</div><div class="ck-card__desc">One SKILL.md each, symlinked into ~/.claude/skills/.</div></div>
<div class="ck-card ck-card--teal"><div class="ck-card__kicker">10+ scripts</div><div class="ck-card__title">workflows/</div><div class="ck-card__desc">.mjs coordinators for the Workflow tool.</div></div>
<div class="ck-card ck-card--amethyst"><div class="ck-card__kicker">5 runtimes</div><div class="ck-card__title">harnesses/</div><div class="ck-card__desc">Claude Code, Codex, OpenCode, Pi, Hermes.</div></div>
<div class="ck-card ck-card--blue"><div class="ck-card__kicker">terminal</div><div class="ck-card__title">config/</div><div class="ck-card__desc">tmux, zsh fragments, statusline.</div></div>
<div class="ck-card ck-card--blonde"><div class="ck-card__kicker">installer</div><div class="ck-card__title">setup/</div><div class="ck-card__desc">Component picker and variable templating.</div></div>
</div>

<span class="ck-kicker">02 · Signature loop</span>
<h2 class="ck-h2">Nothing merges <em>unopposed.</em></h2>

The council is the spine of this repo. Advocates argue for the change, critics argue against it, a Socratic questioner probes both, and an arbiter issues a verdict. Fix rounds run until the verdict is unconditional.

<div class="ck-loop">
<div class="ck-loop__step"><div class="ck-loop__n">01</div><div class="ck-loop__name">Brainstorm</div><div class="ck-loop__desc">One question at a time until the design is approved.</div></div>
<div class="ck-loop__step"><div class="ck-loop__n">02</div><div class="ck-loop__name">Spec</div><div class="ck-loop__desc">Gherkin scenarios and MoSCoW scope, section by section.</div></div>
<div class="ck-loop__step"><div class="ck-loop__n">03</div><div class="ck-loop__name">Implement</div><div class="ck-loop__desc">Tasks routed to subagents in dependency-aware waves.</div></div>
<div class="ck-loop__step"><div class="ck-loop__n">04</div><div class="ck-loop__name">Council</div><div class="ck-loop__desc">Advocates, critics, questioner, arbiter. Verdict or fix round.</div></div>
<div class="ck-loop__step"><div class="ck-loop__n">05</div><div class="ck-loop__name">Merge</div><div class="ck-loop__desc">Squash, advance to the next sibling branch, repeat.</div></div>
</div>

<span class="ck-kicker">03 · Read next</span>
<h2 class="ck-h2">Patterns, <em>not tutorials.</em></h2>

<div class="ck-grid ck-grid--3">
<a class="ck-card" href="patterns/debugging-protocol/"><div class="ck-card__kicker">Pattern 01</div><div class="ck-card__title">Debugging protocol</div><div class="ck-card__desc">Evidence-first diagnosis: enumerate hypotheses, cite evidence, then fix.</div></a>
<a class="ck-card ck-card--teal" href="patterns/model-tiering/"><div class="ck-card__kicker">Pattern 02</div><div class="ck-card__title">Model tiering</div><div class="ck-card__desc">Assign a model tier per agent role instead of inheriting the top model everywhere.</div></a>
<a class="ck-card ck-card--amethyst" href="patterns/council-patterns/"><div class="ck-card__kicker">Pattern 03</div><div class="ck-card__title">Council patterns</div><div class="ck-card__desc">The adversarial council: roles, round protocol, evidence grounding, and scope discipline.</div></a>
<a class="ck-card ck-card--blonde" href="patterns/gherkin-and-specs/"><div class="ck-card__kicker">Pattern 04</div><div class="ck-card__title">Gherkin and specs</div><div class="ck-card__desc">How to read the feature specs this repo's skills produce.</div></a>
<a class="ck-card ck-card--blue" href="patterns/hooks/"><div class="ck-card__kicker">Pattern 05</div><div class="ck-card__title">Claude Code hooks</div><div class="ck-card__desc">Deterministic guard rails around tool calls: naming gates, lint gates, auth safety.</div></a>
<a class="ck-card" href="patterns/authoring-workflows/"><div class="ck-card__kicker">Pattern 06</div><div class="ck-card__title">Authoring workflows</div><div class="ck-card__desc">How to write Workflow tool scripts: meta, schemas, tiering, budget, and patterns.</div></a>
</div>

<span class="ck-kicker">04 · The rest of the family</span>
<h2 class="ck-h2">Same palette, <em>other surfaces.</em></h2>

This repo is one node in a set. The statusline reads the same tokens the bar draws, and the bar sits above the terminal the skills run in. Siblings ship their own palettes on purpose.

<div class="ck-grid ck-grid--3">
<a class="ck-card" href="https://github.com/Kiriketsuki/chrysaki"><div class="ck-card__kicker">⬢ design system</div><div class="ck-card__title">chrysaki</div><div class="ck-card__desc">The palette, the tiling spec, the manga-ink direction, and every themed port.</div></a>
<a class="ck-card ck-card--blonde" href="https://github.com/Kiriketsuki/claude-statusKine"><div class="ck-card__kicker">◆ statusline</div><div class="ck-card__title">claude-statusKine</div><div class="ck-card__desc">Three-line Claude Code statusline. Chrysaki tokens rendered in unicode geometry.</div></a>
<a class="ck-card ck-card--amethyst" href="https://github.com/Kiriketsuki/chrysaki-pi"><div class="ck-card__kicker">▰ harness port</div><div class="ck-card__title">chrysaki-pi</div><div class="ck-card__desc">The Pi harness dressed in the same dark glass. Pairs with the harness scaffolds here.</div></a>
<a class="ck-card ck-card--blue" href="https://github.com/Kiriketsuki/kiex-status"><div class="ck-card__kicker">▱ desktop bar</div><div class="ck-card__title">kiex-status</div><div class="ck-card__desc">AGS bar. Trapezoid tiles, interlocking base-tile architecture, Cairo-drawn pips.</div></a>
<a class="ck-card ck-card--teal" href="https://github.com/Kiriketsuki/seeKi"><div class="ck-card__kicker">◇ sibling brand</div><div class="ck-card__title">seeKi</div><div class="ck-card__desc">Rust + Svelte database viewer. Its own light palette, not Chrysaki, by design.</div></a>
<a class="ck-card ck-card--error" href="https://github.com/Kiriketsuki/TrKixel"><div class="ck-card__kicker">△ sibling brand</div><div class="ck-card__title">TrKixel</div><div class="ck-card__desc">Triangle-pixel art engine. Also its own visual language.</div></a>
</div>
