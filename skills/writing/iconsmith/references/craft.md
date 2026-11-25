# Icon Craft Guide

Read this file before you draw the first batch, and again when lint or a render shows a problem you cannot explain.

## Pick the metaphor

- **Draw the object, not the action.** "Settings" is a gear. "Notifications" is a bell. An action such as "configure" has no shape. An object has one, and people recognise objects at 16 px.
- **Prefer the known convention.** A magnifier for search, a house for home, a trash can for delete. A new metaphor costs the user a moment of thought on every visit. Use one only when no convention exists, and say so in the report.
- **Check `metaphors.avoid`.** The product owner bans some metaphors, often outdated ones such as a floppy disk for save. Lint fails a source whose `data-metaphor` uses a banned phrase.
- **One idea per icon.** Two objects at 16 px read as noise. When a label needs two ideas, such as "add user", draw the main object and add a small modifier (a plus) in a fixed corner. Use the same corner and the same modifier part for the whole set.
- **Keep the metaphor in the source.** Write it in `data-metaphor`. It goes in the final report and helps the next person who redraws the icon.

## Fill the live area evenly

The live area is the canvas minus the padding. Icons look the same size only when their masses look the same size, not when their boxes match.

- A square looks larger than a circle of the same width. Make a circle reach the full live area, and keep a square 1 to 2 units inside it.
- A triangle or a tall thin shape looks small. Let it use the full height.
- Centre by visual mass, not by bounding box. A play triangle sits a little right of the box centre.

## Stroke and gaps

- **Draw centrelines.** The stroke grows half its width to each side of the line.
- **Keep clear space.** Two strokes that do not meet keep at least `stroke.min_gap` of clear space between their edges. A smaller gap closes up at 16 px and turns into a blob. Lint flags it.
- **Meet cleanly or not at all.** A line that ends on another line must end exactly on its centreline. A near miss reads as a mistake.
- **Fused strokes count as one mass.** Two parallel strokes closer than one stroke width merge into a solid band. That is a valid way to draw a thick tooth or a solid tab.
- **Avoid tight acute angles.** Two strokes that meet at a sharp angle leave a wedge of ink near the join. Lint warns when one path folds back near itself.

## Grid

- Put anchor points on the grid (`canvas.grid`). A vertical or horizontal edge on the grid renders crisp. An edge between pixels renders as a grey blur.
- With an even stroke width and a grid of 1, put straight centrelines on whole units. With an odd width, put them on half units.
- Rotated parts cannot sit on the grid. Lint skips any shape with a rotation or scale in its transform. Accept the soft edge for those, or waive `off-grid` with a reason.

## Corners

- Match `stroke.join` and `stroke.corner_radius` across the set. Round joins with sharp outer path corners look inconsistent.
- Build applies `corner_radius` to a `<rect>` without `rx`. For a path, draw the corner with an arc: `H17 A2 2 0 0 1 19 6`.

## Detail

- `style.detail` caps the subpaths per icon: 6 for low, 10 for medium, 16 for high. Each extra part takes ink from the parts that carry the meaning.
- Drop the smallest part first. If the icon still reads at 16 px without it, it was decoration.
- Look at the 16 px render, not the large one, when you judge detail.

## Weight

- Every icon in the set should carry about the same ink. A heavy icon pulls the eye in a menu.
- Lint estimates each icon's ink share and warns when it drifts from the set median by more than `lint.ink_tolerance`.
- The blurred contact sheet shows the same thing to the eye. Blur hides shape, so you compare only grey value. A darker blob is heavier.
- To lighten an icon, open a hole, shorten a line, or drop a part. To make one heavier, use a body role in duotone or solid style, or close an open shape.

## Look at every render

Lint checks geometry. Only a look checks meaning. For each render, ask:

1. At 16 px, does the icon still read as the object in `data-metaphor`?
2. Do any strokes merge into a blob?
3. Does it sit centred, at the same visual size as its neighbours on the sheet?
4. On the dark tile, does any thin detail vanish?

When the answer to any question is no, fix the source and render again. Do not build an icon you have not looked at.
