---
name: sharpen
description: "Makes a task deeper, not bigger, then rewrites the prompt to ask for the deeper version. Use only when the user types /sharpen or asks to sharpen a task or prompt."
attribution: "Adapted from the sharpen skill in pstack by Lauren Tan (https://github.com/cursor/plugins/tree/main/pstack/skills/sharpen), MIT licence."
disable-model-invocation: true
---

# Sharpen

The user wants a deeper version of the task, not a bigger one. Before you rewrite the prompt, answer four questions.

1. What would a top professional in this field do here that the user does not ask for?
2. What is the rawest material that professional would start from, in place of what someone has already digested for the user? Examples: logs over a dashboard, the source over its README, the data over a chart.
3. Which specific methods and tools would that professional use?
4. What, other than the agent or the user, shows that the result is right? Name a test, a measurement, a reference, or an outside check. Prefer a check that the agent cannot fake. Examples are a stress run with a stated pass count, a known reference value, or a green CI run.

Then rewrite the prompt to ask for exactly that. Deeper means the same deliverable done better. A guard, a test or a safety exclusion that serves the original deliverable is depth. A new feature or a second deliverable is scope, so leave it out or list it as a separate idea under the prompt.

## Rules for the rewritten prompt

- Ask the agent to prototype each choice that an experiment can settle, and to recommend an option from what it observed.
- Leave product and preference choices that no experiment can settle to the user. Follow the "Asking the user" table in the global policy. If the user is away, the agent takes the recommended option and logs it.
- Route each heavy experiment (tests, builds, installs) through the governor: `HEAVY_MAX_LOAD=20 /home/kiriketsuki/.local/share/agent-governor/heavy.sh <cmd>`.
- Write the rewritten prompt in STE `flavored` form.

## Output

1. The four answers, short.
2. The rewritten prompt in one fenced block, ready to paste.

## Hand-off

Offer one line at the end. `/goal-writer` turns the prompt into a Codex goal. `/critique-loop` builds a rubric from answer 4. Do not start the next skill unless the user asks.
