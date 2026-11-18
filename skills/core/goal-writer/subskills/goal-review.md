# Subskill: goal-review

Show a goal on a visual page before the user starts it. The user sees, at a glance, whether
another reader could tell from the work alone when the goal is done.

Run this subskill when:
- The user says `/goal-writer review`, "review this goal", or "goal review page".
- goal-writer finishes a draft and the user wants a visual check. Offer it once, with the draft.

## The page

| Item | Value |
|---|---|
| Source | `assets/goal-review.html` in this skill |
| Published page | https://claude.ai/artifact/8Y7gXhHcmy1uFPhxZKbCmZ (Aurrigo account, private) |
| State | Each viewer's ticks stay in that viewer's browser only |

The page is self-contained. It needs no repo, file, issue or link outside itself. The user pastes
the goal text and reads the result.

## What the page shows

1. **Verdict.** A stamp: Ready To Start, or Not Ready with a short list of reasons.
2. **Length.** Characters out of 4,000. Claude Code `/goal` takes at most 4,000 characters.
3. **Six things, plus two.** One mark each:
   - Finish line, Proof, Must not break, Where it may work, How it tries again, When to stop and ask.
     These are the six parts in OpenAI "Using Goals in Codex".
   - Shown in the chat. The Claude Code `/goal` checker is a small model that reads only the
     conversation. It does not run commands or read files. So each proof must appear in the chat.
   - A turn or try limit. Optional. Claude Code suggests a clause such as "or stop after 20 turns".
4. **How it ends.** A flow drawing: Start, Do the work, the finish-line points as gates, Done. A
   "not yet" loop goes back to the work. A Stuck branch stops and reports.
5. **Finish line: who can close each point.** The page splits the DONE WHEN points into two groups:
   - Claude can finish alone: Claude does the work and shows the proof in the chat.
   - Needs you: the point names the user, a sign-off, an approval, access, a secret or a production
     deploy. Claude stops and asks when only these points are left.
   If a point needs the user and the goal has no BLOCKED rule, the stamp stays Not Ready.
   Each point also gets one tag:
   - Clear: it ends in a number or an exact result.
   - Check: it has no number. The user decides.
   - Vague: words such as "better" or "works" with no number. The page marks the words.
   - Way out: words that let the worker call it done on its own word.
   Each point has a tick box. The user ticks a point when they could check it themselves.
6. **Rules while working** and **Never do**, as plain lists.

The stamp reads Ready To Start only when all of these hold:
- The goal is under 4,000 characters.
- The six parts are present.
- No point is Vague or Way out.
- The user ticked every point.

## Steps

1. Get the goal text. Use the goal-writer draft, or the text the user gives.
2. Give the user the page link. Tell them to paste the goal and press Review.
3. If the user asks you to read the result, ask what the stamp says. Do not claim a result you
   did not see.
4. Fix each Not Ready reason in the draft with the goal-writer rules. Then return the new text.

## Format the page reads

The page finds these labels, in any order after the outcome sentence:

```text
/goal <outcome sentence>
DONE WHEN:
1. <point with a number or exact result>
2. ...
BLOCKED: <when to stop, and what to report>
HOW: <rules while working>
NEVER: <things never to do>
```

## Change the page

1. Edit `assets/goal-review.html`.
2. Publish it with the Artifact tool and `url` set to the published page above, so the link stays.
3. Keep page words plain: no jargon, no file paths, no issue numbers, no outside links.
4. Keep the light and dark palettes, and a 16 px side gutter at phone width.

## Limits

- The page checks wording, not truth. A Clear point can still name the wrong number. The user's
  ticks decide.
- The checks are word patterns. A good goal can trip one. The user may tick past it, but the
  stamp stays Not Ready until the wording changes.
- The page is private to the account that owns it. Another person sees it only after the owner
  shares it.
