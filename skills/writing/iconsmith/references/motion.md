# Motion

Read this file before you add motion to an icon, and when `frames` or the motion lint shows a problem.

Motion is optional. An icon moves only when a source marks a group with `data-motion`. A set without `data-motion` builds the same bytes as before.

## When to add motion

Add motion when the user asks for animated, hover or moving icons. Motion helps in navigation, toolbars and buttons that the pointer reaches often. Leave it out of dense tables, long lists and icons that only label content. Twenty moving icons in one view compete for the eye.

## Pick the move from the object

The move should be the thing the object does in real life. The user then reads the move as the meaning, not as decoration.

| Object | Move | Steps |
|---|---|---|
| Bell | Swings on its hook | `rotate(14)` about the hook, kind `swing` |
| Folder, box, chest | Lid opens | `rotate(-30)` about the hinge, kind `hold` |
| Trash can | Lid lifts | `translate(0 -2) rotate(-12)` about the hinge |
| Send, plane | Leaves to the upper right, then comes back | `translate(2 -2)`, kind `pulse` |
| Download | Arrow drops into the tray | `translate(0 2)`, kind `pulse` |
| Gear, refresh | Turns | `rotate(60)`, kind `hold` |
| Heart, star | Beats once | `scale(1.12)`, kind `pulse` |
| Search | Lens tilts as if it looks | `rotate(-12)` about the handle end |

Move one part of the object, not the whole icon. A lid opens on a still box. A whole icon that slides reads as a layout glitch.

## The three kinds

| Kind | Timeline | Use it for |
|---|---|---|
| `hold` | Rest to pose. Holds the pose while the pointer stays, and returns on leave. | A state that the hover reveals: an open lid, a turned gear. |
| `pulse` | Rest, pose, rest. Plays once each time the hover starts. | A single action: a send, a beat, a drop. |
| `swing` | Rest, pose, mirrored pose, rest. Plays once. | A movement both ways: a bell, a wave, a shake. |

The mirrored pose negates each step: `rotate(14)` swings to `-14`, `translate(0 -2)` mirrors to `translate(0 2)`, and `scale(1.1)` mirrors to `scale(0.9)`. So a `swing` scale must stay under 2.

## Timing

- 250 to 450 ms suits most moves. Under 200 ms reads as a flicker. Over 600 ms makes a button feel slow.
- `ease-out` starts fast and settles. It is the default because a hover is a response to the user.
- An overshoot curve such as `cubic-bezier(0.3, 1.5, 0.6, 1)` gives a small spring. Use it on one or two icons, not on the set.
- `data-motion-delay` lets a second part start after the first. Keep the total under `motion.max_ms`.
- Keep the same duration and easing across the set. One file sets them in `[motion]`, so the set moves with one hand.

## Pivots

Rotate and scale turn about the motion origin. Set `data-motion-origin` on the hinge, the hook or the base of the moving part. The canvas centre is the default, and it is wrong for most lids and hinges. Check the pivot on the trail tile of `frames`: a fixed hinge shows as one sharp point where every frame overlaps.

## Stroke weight

CSS scales the stroke with the shape. A `scale(1 0.5)` halves the stroke height, so the moving part looks thinner than the rest. Lint warns about a scale step that changes the weight by more than 15 percent. Move a part with `translate` or `rotate` instead, and keep `scale` for a small beat.

## Look at the frames

Run `frames NAME` and look at the PNG with the Read tool. It shows the hover timeline from rest to the end. A trail tile stacks every frame. A last row shows each frame at the smallest ship size and at twice that size.

For each frames PNG, ask:

1. At the peak frame, does the move read as the object doing its job?
2. Does the pivot stay still on the trail tile?
3. At the smallest ship size, can you see the move at all?
4. Does any frame cut ink off at the canvas edge?

Lint helps with questions 3 and 4. It checks 25 even frames plus the start, peak and end of each move. An overshoot curve can peak between two samples, so a look still counts. Only a look answers questions 1 and 2. Do not ship motion you have not looked at.

## How the build moves an icon

Build wraps each moving group in a `<g class="ism-<icon>-<n>">`. CSS moves the wrapper, and the group keeps its own `transform` attribute inside it. A CSS `transform` replaces a `transform` attribute, so the two cannot sit on one element.

The rest pose uses the same CSS functions as the hover pose with neutral values, for example `rotate(0deg)`. The browser then moves each function on its own, and the pivot stays fixed through every frame.

`frames`, the motion lint and the built CSS all use one Python model of this motion. A test in `scripts/tests/test_browser.py` loads built icons in headless Chromium and checks that the browser matches that model at each frame. Run it after a change to `motion.py` or `style.py`.
