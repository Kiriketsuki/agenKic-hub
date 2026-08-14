# PR descriptions

Profile: `flavored`. Sentence cap: 25 words.

## Evidence

From the kilint experiment (`../../kilint/reference/before-after-samples.md`):
a baseline PR description that stacked parentheticals into 30-to-40 word sentences
scored 3.46 violations per 100 words. The same information, rewritten as one action per
line, scored 1.35 per 100 words. The information did not change. The sentence shape did.

## Template

```
## What
<one sentence: the change itself, no trailing "which" or "so that" clause>

## Why
<one sentence: the actual failure this fixes, not "improves reliability">

## How
- <action 1>
- <action 2>
- <action 3>

## Test plan
- [ ] <test 1>
- [ ] <test 2>
```

Keep `How` to one action per line, imperative form. If an item needs a reason, put the
reason in a second sentence on the same line, not a parenthetical.

## Delete these openers

- "This PR introduces"
- "This PR adds"
- "in order to"
- "ensures"
- "is designed to"
- "aims to"

`"This PR introduces a retry mechanism that ensures requests..."` becomes
`"Add retry logic. Requests..."`.

## Worked example -- fleet platform

**PR title**: `fix(auth): retry token refresh on transient network failures`

**Baseline (AI slop)**

<!-- kilint-disable -->
> This PR introduces a retry mechanism for the token refresh flow in the fleet-platform
> auth module, which was previously surfaced immediately to callers with no retry,
> forcing every call site (the vehicle telemetry poller, the fleet dashboard websocket
> handshake, and the background sync worker) to implement its own ad-hoc retry logic in
> order to work around transient network failures that occur during the refresh call,
> and this change also ensures that a single shared retry policy is used everywhere
> instead of three divergent implementations that had drifted out of sync over time.
<!-- kilint-enable -->

One sentence, 89 words, three stacked parentheticals.

**Rewrite**

```
## What
Add a shared retry policy to the auth token refresh call.

## Why
The refresh call failed on any transient network error with no retry. Three
callers, the telemetry poller, the dashboard websocket handshake, and the
background sync worker, each wrote their own retry logic. The three
implementations drifted apart.

## How
- Add `refreshWithRetry()` in `auth/tokenRefresh.ts`.
- Retry up to 3 times on network errors, with backoff of 200ms, 800ms, 3200ms.
- Do not retry on a 401. A 401 means the refresh token is invalid, not the network.
- Replace the three call-site retry loops with `refreshWithRetry()`.

## Test plan
- [ ] Unit test: `refreshWithRetry()` retries on `ECONNRESET`, stops on 401.
- [ ] Manual: kill the network mid-refresh on the dashboard, confirm it recovers
      without a page reload.
```

Same information as the baseline. Six short sentences plus four list items, instead of
one 89-word sentence.
