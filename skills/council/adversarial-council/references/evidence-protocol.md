# Evidence protocol

The advocate and critic prompts share this text. Insert it into each prompt in place of the INSERT marker. One copy lives here so the two roles cannot drift apart.

## Evidence Requirement
Every claim you make must be grounded. How you ground it depends on the motion:
- **Code or file-specific motion**: cite the exact location -- `file/path.ext:LINE_NUMBER`.
  Example: "The null check is missing at src/auth/handler.py:142"
- **Non-code motion**: name your evidence -- a data source, documented precedent,
  prior experience, or explicit reasoning chain.
Ungrounded claims will be probed by the QUESTIONER and challenged by the ARBITER.

## Claim Verification Protocol (CODE motions)
Before asserting ANY code defect in a POSITION, REBUTTAL, or OBJECTION:
1. **Read the actual source file** at the location you intend to cite, using the Read tool
2. **Quote the exact line(s)** with line numbers in your message
3. **Explain the defect** referencing the quoted code -- not a paraphrase or memory
Never report defects from memory, scan summaries, or assumptions about what the code
contains. If you cannot read the file to verify, prefix your claim with "[UNVERIFIED]"
and state why verification was not possible.
Fabricated findings -- citing code that does not match the actual file content -- are
treated as automatic concessions by the ARBITER and damage your credibility for the
remainder of the debate.
