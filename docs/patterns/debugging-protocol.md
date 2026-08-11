# Debugging protocol

A discipline for diagnosing bugs before touching code. The core rule: no fix without a cited diagnosis.

## Hypothesis checklist

Before any diagnosis:

1. Enumerate three or more hypotheses, with a one-line rationale for each.
2. Gather evidence for all hypotheses before choosing.
3. Mark the best-supported hypothesis only after the evidence is in hand.

Do not skip this step for "obvious" bugs. The obvious answer is often wrong.

## Evidence-first rule

Every diagnosis must cite:

- `file:line`, where the defect lives
- Log output, verbatim, not paraphrased
- Stack trace, the relevant frames
- Reproduction steps, the exact inputs that trigger the bug

If you cannot cite evidence, state the hypothesis as unconfirmed and gather more data.

## Diagnosis report template

Fill this template before proposing any fix:

```
## Diagnosis
**Symptom**: [observed behavior, exact, not interpreted]
**Hypotheses**:
  1. [H1 description]: [one-line rationale]
  2. [H2 description]: [one-line rationale]
  3. [H3 description]: [one-line rationale]
**Evidence Gathered**:
  - H1: [file:line / log / trace / repro]
  - H2: [file:line / log / trace / repro]
  - H3: [file:line / log / trace / repro]
**Root Cause**: [H#], [citation: file:line or log excerpt]
**Confidence**: high / medium / low
**Verification**: [how you confirmed the fix: test run, log check, repro attempt]
```

## Diagnosis agents

For non-trivial bugs (cross-file, unclear symptoms, or more than 15 minutes of investigation), delegate the diagnosis to a dedicated read-only agent:

1. Spawn a diagnosis agent that never edits code.
2. The agent generates hypotheses, gathers evidence, and fills the report template.
3. The agent reports the root cause with citations.
4. The main session reviews the report, then implements the fix.

Do not start fixing while the diagnosis agent is still gathering evidence.

## Timeboxing

- If a hypothesis is not confirmed within 10 minutes of investigation, pivot to the next.
- After exhausting all hypotheses, escalate. Ask for more context or logs.
- Never loop on the same hypothesis with a minor variation. That is thrashing, not debugging.

## Anti-patterns

| Anti-pattern | What to do instead |
|:---|:---|
| "It must be X" (no evidence) | Enumerate hypotheses first |
| Fix before diagnosis | Fill the template before touching code |
| Blame the framework | Check your own code at the immediate callers first |
| Assume the error message is literal | Reproduce with a minimal repro case |
| Skip hypotheses 2 and 3 | Evidence often points to the non-obvious hypothesis |
