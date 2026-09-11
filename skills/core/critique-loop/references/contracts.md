# Loop contracts

## Contents

- Configuration
- Rubric
- Reviewer output
- Evaluation
- Run state

## Configuration

Copy defaults.json and resolve overrides before round 1. Reject unknown keys to expose spelling mistakes. Numeric settings and weights support at most six decimal places. Reject excessive precision rather than rounding it.

| Field | Values | Meaning |
|---|---|---|
| schema_version | 1 | Contract version |
| threshold | Number from 0 to 10 | Required score |
| comparison | `gte`, `gt` | At least, strictly above |
| pass_mode | `all_dimensions`, `overall` | Check each dimension, or weighted overall |
| max_rounds | Positive integer | Total review rounds, including baseline |
| reviewer_count | Positive integer | Independent reviewers per round |
| aggregation | `minimum`, `median` | Combine reviewers per criterion |
| reviewer_lenses | String list | Optional emphasis, one per reviewer if present |
| max_minutes | Positive number or null | Soft elapsed-time limit for the complete run |
| stagnation_rounds | Positive integer or null | Revisions without improvement before stopping |
| min_improvement | Number from 0 to 10 | Smallest score gain counted as improvement |

Reviewer count is independent of concurrency slots. Run larger panels in batches. Every reviewer covers every criterion. Never silently reduce the count.

Use `minimum` for conservative evaluation. Under `median`, retain every score and report spreads of two or more points. Unknown evidence prevents success under either mode.

"Two reviewers, above 8, five rounds" resolves to reviewer_count 2, comparison gt, threshold 8, max_rounds 5.

## Rubric

Represent multiple rubrics as dimensions. Scale is fixed at 0 to 10, higher is better. Dimension weights total 100. Criterion weights total 100 within each dimension.

```json
{
  "schema_version": 1,
  "id": "handoff",
  "version": "1",
  "title": "Deployment handoff",
  "scope": "Written instructions assessed against supplied release evidence.",
  "dimensions": [{
    "id": "clarity", "label": "Operator clarity", "weight": 100,
    "criteria": [{
      "id": "recovery", "label": "Recovery instructions", "weight": 100,
      "question": "Can the operator identify and reverse this release?",
      "procedure": ["Compare the release ID, rollback steps, and verification with the runbook. Award anchor scores only."],
      "evidence_required": ["Handoff text", "Versioned release runbook"],
      "anchors": {
        "0": "No recovery instructions exist.",
        "4": "The release identifier matches the source runbook.",
        "6": "The release identifier and ordered rollback steps match the runbook.",
        "8": "Release, rollback sequence, and verification all match the runbook.",
        "10": "All 8-point conditions hold and a rehearsal log confirms each step."
      },
      "minimum_score": 6
    }]
  }],
  "gates": [{
    "id": "no-secret", "label": "No credentials in the handoff",
    "procedure": ["Inspect the complete handoff for credentials and tokens."],
    "evidence_required": ["Complete handoff text"]
  }]
}
```

Criterion IDs are globally unique. Dimension and gate IDs are unique within their lists. `minimum_score` is a number or null. Floors use at least, independently of the threshold comparator.

Every criterion includes anchors at 0, 4, 6, 8, and 10. Prefer cumulative capabilities or explicit measured ranges. Qualitative anchors may instead define ordered quality bands if the procedure states this. Higher bands repair lower-band deficiencies. They do not need to exhibit those deficiencies. Define intermediate integer scores in the criterion procedure. Missing evidence means null, not zero. The helper validates structure. Rubric Builder checks anchor quality.

Do not add N/A during review. Resolve relevance before freezing. Later scope changes require a new rubric version and run.

## Reviewer output

Create one JSON file per reviewer. Use exactly the rubric's criterion and gate IDs.

```json
{
  "reviewer_id": "fresh-agent-123",
  "snapshot_id": "sha256 from snapshot.json",
  "rubric_hash": "sha256 printed by validate",
  "scores": {
    "recovery": {
      "score": 8,
      "evidence": ["handoff.md:21 includes release 42, rollback commands, and health checks."],
      "reason": "All 8-point conditions match runbook.md:12. No rehearsal log supports 10.",
      "next_fix": "Provide a recovery rehearsal log to assess the 10-point anchor."
    }
  },
  "gates": {
    "no-secret": {
      "result": "pass",
      "evidence": ["Inspected all 46 lines of handoff.md."],
      "reason": "Commands reference environment variables without credential values."
    }
  },
  "findings": []
}
```

Scores are integers from 0 to 10, or null. Each reason and next_fix is a nonempty string. Use "None within the agreed scope" when no fix is needed. Numeric scores and known gate results require nonempty evidence. Unknown results still require an explanation.

Gate result is pass, fail, or unknown. Optional findings cannot introduce new pass conditions.

## Evaluation

The helper verifies snapshot files have not changed. It hashes canonical JSON for rubric and snapshot identities. Use IDs from actual subagents. IDs alone cannot establish reviewer independence.

1. Aggregate criterion scores using minimum or median.
2. Dimension score = sum of criterion score times criterion weight, divided by 100.
3. Overall score = sum of dimension score times dimension weight, divided by 100.
4. Compare exact decimal values with thresholds and floors. Round only for display.
5. Require every gate to pass from every reviewer. Failed or unknown gates prevent success.

Unknown scores make the affected dimension and overall null. Retain other known dimensions and list gaps. Never normalize weights around missing scores.

Result statuses: pass, revise, incomplete_evidence. The orchestrator applies run stop rules. Saved decimal scores are strings to preserve precision. Convert them to decimals before comparison. Exit codes: 0 for pass or validation success, 1 for valid non-passing reviews, 2 for invalid inputs.

## Run state

Record run_id, status, started_at_utc, config_hash, rubric_hash, rounds_consumed, best_round, and rounds. Each round stores snapshot, review paths, result path, changes, and completion time.

Increment rounds when review starts, including interrupted attempts. Resume an interrupted round only against its unchanged snapshot. Do not count continuation twice. Before resuming, compare frozen config and rubric hashes and verify existing snapshots. Never overwrite prior reports.

For the best version, prefer complete evidence, then fewer failed gates, then fewer failed score conditions, then higher primary score. Failed score conditions include both `failed_score_conditions` and `failed_criterion_floors`. Primary score is the lowest dimension for all_dimensions, or overall for overall mode. Break ties with overall, then the earlier round.

For stagnation, compare a revision against the best earlier complete round. Fewer failed gates or score conditions counts as improvement only if neither count worsens. Otherwise require unchanged failure counts and a positive primary-score gain at least min_improvement. Reset the counter on improvement. Null scores cannot establish numeric improvement. The baseline is not a stagnant revision.

The helper does not mutate state, launch agents, or stop processes. The orchestrator enforces budgets and records transitions.
