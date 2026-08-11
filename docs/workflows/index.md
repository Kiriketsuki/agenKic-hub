# Workflows

The `workflows/` directory holds background workflow scripts (`.mjs`) for multi-agent pipelines. Each script is a pure coordinator: it sequences `agent()`, `parallel()`, and `workflow()` calls, and every world-touching action happens inside an agent prompt.

Companion `.md` files (`feature-loop.md`, `spec-loop.md`, `spec-loop-spec.md`) document the driver patterns for their scripts.

| Workflow | Purpose |
|:---|:---|
| [ai-co-scientist.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/ai-co-scientist.mjs) | Research hypothesis generation: generate, review, Elo tournament, dedup, and evolve, looped with a meta-review. |
| [autofix-swarm.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/autofix-swarm.mjs) | Autonomous fix swarm: diagnose, fan out competing worktree fixes, gate against gaming, promote a champion, and council-review. |
| [council-loop.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/council-loop.mjs) | Standalone adversarial council fix-loop. Reviews a branch and drives it to an unconditional FOR verdict through fix rounds. |
| [feature-loop.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/feature-loop.mjs) | Per-feature build pipeline: brainstorm, spec, implement, council review, and merge, for one feature end to end. |
| [feature-spec.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/feature-spec.mjs) | Single-spec implementation with an adversarial quality harness: verify, implement, review, arbitrate, and fix. |
| [financial-data-pipeline.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/financial-data-pipeline.mjs) | Parses bank statement PDFs into a transactions dataset, consolidates to CSV, and runs Python EDA with charts. |
| [gmail-recurring-payments.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/gmail-recurring-payments.mjs) | Crawls Gmail to surface recurring payments and subscriptions, then synthesizes a monthly-equivalent spend list. |
| [spec-loop.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/spec-loop.mjs) | Decomposes a whole spec into a routed dependency DAG, builds leaves in parallel worktree waves, and councils every PR. |
| [spec-loop.smoke.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/spec-loop.smoke.mjs) | Test harness for the workflow suite: syntax-checks the scripts and asserts the pure helper functions. |
| [spending-habits-categorizer.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/spending-habits-categorizer.mjs) | Crawls bank statements in cloud storage, parses transactions, and categorizes a year of spending into a habits report. |
| [ultracode-fix.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/ultracode-fix.mjs) | Tiered fix pipeline: explore, plan, fan-out implement, and review, with fixed model assignments per phase. |
| [ultracode-implement.mjs](https://github.com/Kiriketsuki/agenKic-sKills/blob/main/workflows/ultracode-implement.mjs) | Sibling of ultracode-fix aimed at building a feature instead of fixing a defect. Same tiered pipeline. |
