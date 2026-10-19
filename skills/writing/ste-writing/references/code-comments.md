# Code comments and docstrings

Every comment and docstring uses the `prose` profile, with a 35-word sentence cap.
Inline comments are not exempt. See `../../kilint/SPEC.md` for the rule design.

## Docstrings and public API comments

Use the `prose` profile for docstrings and comments on public functions, classes,
and exported types. A docstring that names a parameter and its constraint can run
long, up to 35 words per sentence. Active voice and no filler still apply. kilint
skips a comment shorter than 6 words. Do not force ceremony onto a one-line note.

## Inline comments

A comment that explains a non-obvious decision, a workaround, or a "yes this looks
wrong but here is why" uses the same `prose` profile. Its job is to stop the next
reader from "fixing" something that is not broken, so it keeps its reasoning and its
citations. It loses the em-dash, the semicolon, the contraction and the filler.

Two carve-outs stay. A comment can quote source material verbatim when the quote is the
point. A comment can keep a term of art that the codebase already uses.

## When NOT to comment at all

- Do not restate what the code already says: `i += 1  # increment i`.
- Do not add a docstring to a private, single-call helper whose name already says what
  it does.
- Do not add a comment to explain code that would be clearer if renamed instead. Rename
  it.

## Python

**Bad** (stacked auxiliaries, nominalization, "leverage", "ultimately"):

```python
def parse_telemetry_frame(raw: bytes) -> TelemetryFrame:
    """
    This function is responsible for parsing the raw telemetry frame that is
    received from the vehicle's onboard unit, and it leverages the CRC16
    checksum in order to ensure that the data has not been corrupted during
    transmission, ultimately returning a fully validated TelemetryFrame object.
    """
```

**Good**:

```python
def parse_telemetry_frame(raw: bytes) -> TelemetryFrame:
    """Parse a raw telemetry frame from the vehicle's onboard unit.

    Checks the CRC16 checksum first. Raises ChecksumError if the frame
    is corrupt.
    """
```

**Inline "why this is weird" comment (prose mode, keeps the reason)**:

```python
# This code checks the checksum again, although parse_telemetry_frame already
# checked it. This copy comes from the replay buffer, not the wire. The replay
# buffer has corrupted frames once before, and the second check is cheap.
if not verify_crc16(raw):
    raise ChecksumError(raw)
```

## TypeScript

**Bad**:

```typescript
/**
 * This function is used to facilitate the seamless refreshing of the access
 * token, and it leverages an exponential backoff strategy in order to ensure
 * that transient network failures do not result in a failed request.
 */
export async function refreshWithRetry(): Promise<string> {
```

**Good**:

```typescript
/**
 * Refresh the access token. Retries up to 3 times on network errors,
 * with backoff of 200ms, 800ms, then 3200ms.
 *
 * Does not retry on a 401. A 401 means the refresh token is invalid,
 * not a network problem.
 */
export async function refreshWithRetry(): Promise<string> {
```

**Inline "why this is weird" comment (prose mode, keeps the reason)**:

```typescript
// This code retries here, although the caller already retried once upstream.
// The upstream retry covers the websocket handshake. This retry covers the
// token refresh inside it. The two retries look redundant, but they are not.
```
