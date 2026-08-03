# Code comments and docstrings

Two different rules apply here, and mixing them up is the most common mistake on this
surface.

## Docstrings and public API comments: flavored, relaxed cap

Use the `flavored` profile for docstrings and comments on public functions, classes,
and exported types. Raise the sentence cap by `comment_sentence_bonus` (default +10
words, see `../../kilint/SPEC.md`). A docstring that names a parameter and its
constraint can legitimately run a little long. Active voice and no filler still
apply. kilint skips a comment shorter than 6 words. Do not force ceremony onto a
one-line note.

## Inline "why this is weird" comments: exempt, need voice

A comment that explains a non-obvious decision, a workaround, or a "yes this looks
wrong but here is why" is exempt from these rules. It needs a voice, because its job is
to stop the next reader from "fixing" something that is not broken. Do not flatten it
into STE.

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

**Inline "why this is weird" comment (exempt, keeps voice)**:

```python
# We re-check the checksum here even though parse_telemetry_frame already
# checked it. This copy comes from the replay buffer, not the wire, and the
# replay buffer has bit-rotted on us once before. Cheap insurance.
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
 * Does not retry on a 401 - a 401 means the refresh token is invalid,
 * not a network problem.
 */
export async function refreshWithRetry(): Promise<string> {
```

**Inline "why this is weird" comment (exempt, keeps voice)**:

```typescript
// Yes, we retry here even though the caller already retried once upstream.
// The upstream retry is for the websocket handshake; this one is for the
// token refresh inside it. They are not redundant, they just look like it.
```
