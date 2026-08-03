# The cure for AI slop is a 1986 aircraft manual - the kit

Everything the episode promises "in the description": the distilled STE skill,
the linter, and the full first-party test data. Self-contained - no external
dependencies beyond Python 3.

## Files

| File | What it is |
|---|---|
| `ste-writing-skill.md` | The distilled ASD-STE100 agent skill, two modes: strict (procedures, error messages) and flavored (prose, no dictionary lockdown) |
| `ste-lint.py` | The heuristic anti-slop linter - the machine-checkable subset of STE. Deterministic; the score delta between two texts is the signal |
| `experiment-results.md` | The cross-model test: 6 writing tasks x 4 conditions on Claude and gpt-5.5 |
| `experiment-results-openai.md` | Per-category detail for the gpt-5.5 run |
| `before-after-samples.md` | The real baseline-vs-STE outputs quoted in the episode |
| `run-openai.py` | Reproduction script for the OpenAI side of the experiment |

## Run the linter

```
python3 ste-lint.py your-draft.md
```

Score is violations per 100 words - lower is cleaner. Lint a draft, apply the
skill, then lint it again - the delta between the two scores is the signal.

## The headline numbers

| Condition | Claude sonnet | gpt-5.5 |
|---|---|---|
| baseline | 4.36 | 3.54 |
| banned-words list | 4.21 (-3%) | 2.14 (-40%) |
| Orwell's 6 rules | 2.48 (-43%) | 1.69 (-52%) |
| STE skill | 1.12 (-74%) | 1.76 (-50%) |

Give the model a writing system and slop drops by half or more, on every model
tested. STE was best or tied-best. A banned-words list is the least reliable fix.

Not a certified STE checker. The judgment rules of ASD-STE100 need a human;
this covers the mechanical subset - which is where the slop lives.

Spec: ASD-STE100 Issue 9, free at asd-ste100.org
