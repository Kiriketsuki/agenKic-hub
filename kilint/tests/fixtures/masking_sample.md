---
title: Sample
description: "Please utilize this doc."
---

# Prose em dash

This paragraph has a real em dash — right here in the prose itself.

# Fenced code em dash, must not flag

```text
This fenced block has an em dash — that must never be flagged by kilint.
```

# Inline code ensure, must not double count

Use the `ensure` keyword carefully, but you must ensure this works.

# Links and URLs

See https://example.com/utilize-this-path for details, or read
[please utilize this link](https://example.com/other-target) instead.

# Table, delimiter row must not be linted

| Col A | Col B |
| --- | --- |
| Please utilize this | ok |

# Numbered list of nine steps, must not trip long-paragraph

1. Turn on the main power switch located on the back panel before starting.
2. Wait five full seconds for the indicator light to turn a solid green.
3. Check that the light no longer blinks before you proceed further today.
4. Open the front access panel using the small latch on the left side.
5. Flip the safety lever fully to the unlocked position before continuing.
6. Close the access panel firmly until you hear a distinct clicking sound.
7. Test the output by running the built in diagnostic check routine now.
8. Record the result in the maintenance log for future reference purposes.
9. Sign the checklist and hand it to the shift supervisor before leaving.

# Standalone indented code block, must not flag

    This indented block is a real standalone code block with an em dash — inside it.

# List item continuation line, must still count as prose

- A bullet item with a continuation line that
    wraps onto a new line and still counts as real prose with an em dash — right here.
