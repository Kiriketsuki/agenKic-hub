# Write criteria reviewers can apply

## Make each criterion operational

Replace a quality word with an action and an observable result.

| Weak criterion | Problem | Better direction |
|---|---|---|
| Professional quality | No observable definition | Count claims without a traceable source in the decision summary. |
| Good usability | Undefined user and task | Run named tasks from specified starting states. Record completion and help requests. |
| Fast performance | No environment or workload | Measure the named operation under a fixed workload and stated environment. |
| Ready for production | Bundles unrelated concerns | Separate functional correctness, operational validation, and mandatory deployment checks. |

Specify the artifact revision, reviewer role, sample, environment, steps, and expected evidence where relevant.
Use existing requirements for numeric targets. If no target exists, state a justified provisional target in the rubric's assumptions.
Do not present a provisional target as an established benchmark.

For qualitative work, bound the review. Name the passages, scenarios, audience, and failure categories.
Prefer checks such as "each recommendation identifies an owner and next action" over "recommendations feel actionable".
If a criterion contains unrelated failure categories, split it. If two criteria punish the same defect, narrow or merge them.

Choose weights by consequence for the requested outcome. Equal weights are acceptable when the concerns have similar consequences.
Explain the choice. Do not assign weights solely to make an existing artifact achieve a desired score.

## Make anchors distinguishable

Write anchors against the same procedure and scope. A changed sample cannot justify a higher score.
Prefer cumulative capabilities at anchors 4 through 10. For qualitative defect levels, specify ordered quality bands that repair earlier defects.
Use 0 for observed failure below the positive anchors.
Separate missing evidence from observed failure. Missing required evidence produces an unknown result.

Give intermediate scores an explicit rule in the procedure. An exact count is often enough.
When a qualitative distinction remains necessary, name completed and incomplete upper-anchor conditions.
If the distinction remains subjective, award the lower anchor.

Keep 10 attainable within the task. It should mean complete evidence against the stated standard, not perfection in every possible context.
Avoid rewarding ornamental extras, unrelated scope, or production work in a prototype task.

## Small document handoff example

**Task:** Prepare a handoff note so a colleague can resume a paused data import.
The agreed handoff checklist requires ten items:

1. Objective.
2. Current input file path.
3. Input file checksum.
4. Last completed import step.
5. Last successful checkpoint ID.
6. Exact next command.
7. Expected result of that command.
8. Known blocker and its current state, or an explicit statement that no blocker exists.
9. Responsible owner.
10. Path to the relevant run log.

**Bad criterion:** "Handoff quality, weight 100. Score 0 for poor, 4 for basic, 6 for good, 8 for excellent, 10 for perfect."

The reviewer cannot determine a score from those adjectives. The criterion does not identify required evidence or intermediate scoring.

**Better criterion:** Use the following criterion within a `handoff` dimension with weight 100.
This example uses one criterion to show the scoring mechanics. Add separate criteria only for distinct task outcomes.

```json
{
  "id": "handoff-resume-context",
  "label": "Resume context completeness",
  "weight": 100,
  "question": "How many agreed handoff items can a colleague use without asking the author?",
  "procedure": [
    "Inspect the handoff note and the ten-item checklist above at the same saved revision.",
    "Check each item's presence, specificity, and agreement with the supplied input file, checkpoint record, and run log.",
    "Count an item only when all three checks pass. A vague placeholder or contradicted item fails.",
    "Record one row per checklist item with its note location, supporting source location, and pass or fail result.",
    "Award one point per passing item. This count defines intermediate scores 1, 2, 3, 5, 7, and 9.",
    "If a required source cannot be inspected, report unknown instead of assuming the affected checks pass or fail."
  ],
  "evidence_required": [
    "Saved handoff note and the agreed ten-item checklist.",
    "The referenced input file, checkpoint record, and run log.",
    "A ten-row evidence table with pass or fail results and exact source locations."
  ],
  "anchors": {
    "0": "None of the ten items passes all three checks.",
    "4": "At least four of the ten items pass all three checks.",
    "6": "At least six of the ten items pass all three checks.",
    "8": "At least eight of the ten items pass all three checks.",
    "10": "All ten items pass all three checks."
  },
  "minimum_score": null
}
```

With nine verified items and one vague owner, award 9. Identify the owner item as the unmet condition for 10.
With an unavailable run log, report unknown. Do not award 9 by treating the missing source as a confirmed failure.

Add a separate mandatory acceptance check when the task requires an accessible deliverable:

```json
{
  "id": "handoff-file-opens",
  "label": "Handoff file is accessible",
  "procedure": [
    "Open the final handoff file from the exact supplied path using the recipient's intended reader.",
    "Pass only when the file opens and its body text is readable."
  ],
  "evidence_required": [
    "Final file path and reader used.",
    "Recorded open result showing readable body text or the observed error."
  ]
}
```

This gate checks delivery. The criterion checks resume context. A strong content score cannot compensate for an inaccessible file.

## Match claims to evidence

A screenshot can support visible text, layout, contrast measurements, or visual comparison at its recorded viewport.
It cannot establish task completion, keyboard behavior, response time, production reliability, or business results.
Use interaction traces, measurements, logs, or suitable research for those claims.

For a prototype, evaluate feasibility through a defined scenario, component constraints, and explicit assumptions.
For production validation, require the actual environment, representative data, and relevant operational evidence.
Do not score both stages as one readiness claim. If production validation lies outside scope, state that limit in `rubric.md`.

## Final quality check

- Can two reviewers follow the same procedure and resolve most score differences from recorded evidence?
- Does each positive anchor state conditions that a reviewer can verify?
- Can the procedure distinguish every allowed intermediate score?
- Does unknown evidence prevent a passing result?
- Do weights reflect priorities without counting the same defect twice?
- Do gates express mandatory acceptance checks separately from quality scores?
- Can the intended artifact reach 10 without unrelated work?
- Do the Markdown and JSON files express the same rubric and version?
