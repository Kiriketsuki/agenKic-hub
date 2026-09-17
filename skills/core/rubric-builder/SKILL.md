---
name: rubric-builder
description: Create concrete, reusable scoring rubrics for any task or artifact, including code, documents, designs, research, and plans. Use when the user asks for a rubric, scorecard, evaluation criteria, or measurable standards for a critique loop. Produce matching rubric.json and rubric.md with evidence requirements, scoring anchors, weights, and separate acceptance checks.
---

# Rubric Builder

Create a rubric that another reviewer can apply without inventing standards.

Read [writing-rubrics.md](references/writing-rubrics.md) before drafting.
Read the sibling [contract](../critique-loop/references/contracts.md) when producing JSON for `critique-loop`.
Resolve these paths from this skill's directory, not the task's working directory.

## Establish the task

1. Inspect the request, artifact, existing specifications, and available evidence.
2. Identify the intended outcome, audience, scope, maturity, constraints, and important failure modes.
3. Reuse explicit acceptance requirements. Distinguish them from assumptions and suggested quality improvements.
4. Infer routine details from context. Ask only about missing information that materially changes the rubric.
5. Continue independent drafting while an answer is pending. Label unresolved assumptions in `rubric.md`.

Do not ask for an approval ceremony before drafting. Do not change the artifact or execute a critique loop unless authorized.

## Build the rubric

1. Group distinct quality concerns into a small number of dimensions. Represent multiple conceptual rubrics as dimensions.
2. Assign dimension weights that sum to 100. Explain their relationship to the task's priorities in `rubric.md`.
3. Define non-overlapping criteria within each dimension. Make criterion weights sum to 100 within each dimension.
4. Give each criterion one question, a repeatable procedure, and exact evidence requirements.
5. Define observable anchors at 0, 4, 6, 8, and 10. Follow the scoring rules below.
6. Put mandatory acceptance checks in `gates`. Give every gate a procedure and required evidence.
7. Set `minimum_score` only when a criterion needs a quality floor. Otherwise use `null`.
8. Check that a high score represents the requested outcome, without adding unrelated scope.

Keep binary acceptance checks separate from scored quality criteria. A weighted average must never hide a failed acceptance check.
Avoid scoring the same defect twice. If criteria share evidence, explain which distinct property each measures.

Use measured checks when evidence supports them. Otherwise define a bounded qualitative review with explicit cases and failure definitions.
Do not invent performance, conversion, usability, or reliability benchmarks from screenshots.
Separate prototype feasibility from production validation. Name the evidence each stage requires and exclude unsupported readiness claims.

## Define scoring precisely

Use whole-number scores from 0 to 10. Higher scores always mean better results.

Prefer cumulative anchors at 4, 6, 8, and 10. Higher anchors retain each lower anchor's achieved capabilities.
If qualitative levels describe defects, define them as ordered quality bands in the procedure. Higher bands repair those defects rather than retain them.
Use 0 for an observed result below the first positive anchor, not missing evidence.
For a measured metric, explicit monotonic ranges may replace cumulative prose. Define boundaries and measurement conditions.

Award the highest fully evidenced anchor. Allow intermediate integers only with evidence and a stated rule in the criterion's procedure.
Require lower-anchor capabilities, identified progress toward the next anchor, and the specific unmet upper-anchor condition.
For scores 1 to 3, define evidenced progress toward 4. Prefer counts or bounded partial-completion rules over intuition.
If no rule distinguishes an intermediate score, keep the lower anchor. Never round upward to meet a target.

Treat missing required evidence as unknown. Report a `null` score and the missing evidence in the critique report.
An unknown criterion or gate cannot support acceptance. Do not convert it into a passing score or silently remove its weight.

## Write and validate the outputs

Write `rubric.json` and `rubric.md` in the requested location.
If no location exists, use a task-local `.critique/<rubric-id>/` directory. Preserve existing rubric versions.

Use exactly this JSON structure, following the sibling contract for validation:

- Top level: `schema_version: 1`, `id`, `version`, `title`, `scope`, `dimensions`, `gates`.
- Dimension: `id`, `label`, `weight`, `criteria`.
- Criterion: `id`, `label`, `weight`, `question`, `procedure`, `evidence_required`, `anchors`, `minimum_score`.
- Anchors: string keys `"0"`, `"4"`, `"6"`, `"8"`, and `"10"`, each with a concrete string description.
- Gate: `id`, `label`, `procedure`, `evidence_required`.

Use strings for IDs, labels, version, title, scope, and question. Use arrays of strings for procedures and evidence requirements.
Use numeric weights. Use a number or `null` for `minimum_score`. Keep criterion IDs unique across all dimensions.
Keep loop settings in the separate `config.json`. Do not add rounds, target scores, or model settings to `rubric.json`.

Make `rubric.md` match every JSON criterion, gate, weight, anchor, and floor.
Include the scope, assumptions, weight rationale, scoring instructions, and evidence checklist.
Explain any required validation that the current artifact cannot yet support.

Run the sibling validator with paths resolved from this skill's location:

```text
python <critique-loop>/scripts/evaluate.py validate --rubric <output>/rubric.json
```

Include `--config <output>/config.json` only when that file exists and applies.
If the companion is unavailable, check the structure and weights manually. Report that automated validation did not run.
Do not create fake evidence to validate a rubric. Validation checks the contract, not the truth of future scores.

Freeze the rubric ID and version during a critique loop. Change criteria, weights, gates, or scoring rules only in a new version.
If a rubric changes, start a new baseline. Do not compare scores across versions as evidence of improvement.

Return links to both files and identify material assumptions or evidence limits.
