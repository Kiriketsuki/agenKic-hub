# Goal examples

These examples use fictional projects. Thresholds, filenames, and run counts illustrate supplied requirements, not defaults.
Adapt them only after checking the user's context.

## Performance

Request: Reduce report generation below two seconds on the agreed fixture.
Context: The project defines `bench:report` and `test:report` npm scripts.

```text
/goal Make report generation finish below two seconds on the agreed large-report fixture. Verify three consecutive npm run bench:report runs on the same machine and record every duration. Require npm run test:report to pass with unchanged expected outputs. Limit changes to the report generator and its tests. Preserve fixture size and benchmark settings. Compare each experiment with the recorded baseline and use the result to select the next change. If the environment prevents comparable measurements, report the failed commands and the environment change needed.
```

## Flaky test

Request: Resolve intermittent duplicate notifications.
Context: The notification integration suite covers this behavior. The user requests 50 repeated runs.

```text
/goal Fix duplicate notifications with a regression test that demonstrates the defect before the fix. Require 50 consecutive runs of the affected test and a passing notification integration suite. Preserve delivery guarantees and public API behavior. Limit changes to notification delivery and related tests. Record failures, seeds, and commands. Choose each experiment from the evidence about duplicate delivery. If reproduction or validation remains impossible after feasible investigations, report supported hypotheses, attempted checks, and the missing logs or environment access.
```

The draft requires evidence before the fix and repeated verification afterward.
It does not equate a single passing run with a resolved defect.

## Research audit

Request: Assess whether supplied experiment materials support three specified claims.

```text
/goal Produce an audit of the three specified claims using the supplied paper, dataset, and local CPU resources. Create one ledger entry per claim with source locations, method, result, evidence paths, and uncertainty. Run feasible checks and include their commands and outputs. Label each result as direct reproduction, approximation, indirect support, or unavailable evidence. Do not introduce external datasets or describe approximate results as exact reproduction. Prioritize experiments that resolve the largest remaining uncertainty. Document inaccessible evidence and the input required to test each unresolved claim. Finish when every claim has an evidence-supported status and the report links to all generated artifacts.
```

This outcome permits a complete audit with unresolved claims. It does not promise that every claim will reproduce.

## Insufficient context

Request: Make the app faster.

Ask which user operation matters and what measurement should define success.
If local evidence can answer this, propose a bounded profiling goal that produces a baseline and ranked bottlenecks.
Do not insert an arbitrary latency threshold.

## Small task

Request: Correct one heading in the README.

Recommend an ordinary edit request. If the user still requests a goal draft, provide a short goal with a diff check.
Do not add a benchmark, repeated test loop, or research ledger to this task.
