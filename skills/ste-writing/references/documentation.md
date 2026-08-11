# Documentation and READMEs

Profile: `flavored`. Sentence cap: 25 words.

## The hero example (verbatim, from the kilint experiment)

Same prompt, `claude-sonnet`, baseline system prompt versus the ste-writing rules.
Quoted as-is from `../../kilint/reference/before-after-samples.md`.
The baseline quote below keeps its em dashes and marketing language on purpose. It is
the flawed example this page diagnoses, not text this skill writes, so a
`kilint-disable` region wraps it.

**BASELINE** (191 words, 4.19/100w, 4 em dashes):

<!-- kilint-disable -->
> Traditional caches miss constantly in LLM workloads because users rarely phrase the
> same question identically -- fluxcache solves this by embedding incoming prompts and
> matching them against previously cached queries within a configurable similarity
> threshold. [...] It ships with sensible defaults so you can get semantic caching
> running in a few lines of code, while exposing the knobs -- similarity thresholds,
> TTLs, namespacing, custom scoring -- that real applications need as they scale.
> Whether you're building a chatbot, a RAG pipeline, or an agentic workflow, fluxcache
> is designed to slot into your existing stack with minimal friction and no vendor
> lock-in.
<!-- kilint-enable -->

**STE** (169 words, 1.18/100w, 0 em dashes):

> A normal cache matches requests by exact text. A small change in wording then causes
> a cache miss. fluxcache compares the meaning of a new prompt with the prompts already
> in the cache. If two prompts are close enough in meaning, fluxcache returns the
> stored response instead of a new call to the model. This lowers the number of calls
> to the model and cuts the cost and response time of the application.

## The transferable move

The baseline opens with an abstract claim: "traditional caches miss constantly". The
rewrite opens with the concrete failure that claim is standing in for: "a small change
in wording causes a cache miss". Find the specific failure behind the abstract opener
and lead with that. The reader needs the failure before the fix makes sense.

## Empty phrases to delete

- "sensible defaults"
- "designed to slot into your existing stack with minimal friction and no vendor
  lock-in"
- "battle-tested"
- "seamless integration"
- "powerful and flexible"
- "built with performance in mind"
- "under the hood"

None of these name a fact. Replace each one with the concrete thing behind it, or
delete it.

## Applying the move to a fleet-platform README

**Baseline opener** (for a fictional telemetry ingester README):

<!-- kilint-disable -->
> The vehicle-telemetry-ingester is a powerful, extensible service that seamlessly
> handles high-throughput telemetry data from the fleet, providing a robust foundation
> for real-time vehicle monitoring at scale.
<!-- kilint-enable -->

**Rewrite**:

<!-- kilint-disable-next-line SEN001 -->
> A vehicle sends a GPS reading every 2 seconds. With 40 vehicles on the road, that is
> 20 readings a second. vehicle-telemetry-ingester batches these readings and writes
> them to the fleet database every 500ms, instead of one write per reading.

The sentence splitter cannot see the boundary before the lowercase package name, so it
reads the last two sentences as one. The rewrite names the real load (40 vehicles, 20
readings a second) and the real mechanism (batching, 500ms writes). It drops
"powerful", "seamlessly", and "at scale".
