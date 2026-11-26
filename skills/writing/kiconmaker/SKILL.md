---
name: kiconmaker
description: "Design, check and ship a consistent set of custom SVG icons for a product, static or with hover motion. Sets up an icons.toml style file, draws geometry-only sources, lints them, renders PNGs and motion frames to look at, builds currentColor SVGs with optional hover CSS, and wires them into the UI. Use this whenever the user asks for an icon set, custom icons, sidebar or toolbar or nav icons, animated or moving icons, hover icons, icons that animate on hover, 'draw an icon for X', 'make icons that match', 'make these icons move', 'redraw the icons', 'our icons look inconsistent', or mentions icons.toml. Use it even when the user asks for one icon, because a single icon still has to match the rest of the product."
---

# kiconmaker

Design a set of custom SVG icons that follow one style, check each icon by eye, and wire the set into the product. An icon can also move on hover. The motion is optional, and it follows the same loop: describe it, lint it, render its frames, look at them.

Coordinates and rules are easy for Claude. Seeing the result is not, because Claude cannot see an SVG until something renders it. So this skill is a loop: draw, lint, render to PNG, look at the PNG with the Read tool, fix, repeat. A small stdlib-only Python CLI does the lint, render and build steps.

## Resolve the CLI

The CLI is `scripts/kiconmaker.py` next to this file. It needs Python 3.11 or later and the `resvg` binary. It falls back to `rsvg-convert` when `resvg` is missing.

```bash
KICONMAKER="<folder of this SKILL.md>/scripts/kiconmaker.py"
if [ ! -f "$KICONMAKER" ]; then
  KICONMAKER="${AGENKIC_SKILLS_ROOT:-$HOME/.claude/skills/agenKic-hub}/skills/writing/kiconmaker/scripts/kiconmaker.py"
fi
python3 "$KICONMAKER" --help
command -v resvg || command -v rsvg-convert
```

If neither renderer exists, tell the user and stop at lint. Do not claim an icon looks right without a render.

Run the CLI from the product's root, or pass `--config path/to/icons.toml`.

| Command | What it does |
|---|---|
| `init --note "..."` | Writes a starter `icons.toml` and makes the source and parts folders. |
| `new NAME --metaphor "..."` | Writes an empty source. Add `--part` for a shared part. |
| `validate` | Checks the style file and that every source and part parses. |
| `lint [NAMES]` | Checks padding, grid, stroke gaps, detail, metaphor and ink weight. Exit 1 on an error. |
| `render NAMES` | One PNG per icon: a large gridded view with centrelines, plus each ship size at 1x and 2x, light and dark. |
| `sheet [NAMES]` | Contact sheet of the set at real sizes, plus a blurred copy to compare weight. |
| `frames NAMES [--count N]` | One PNG per moving icon: the hover timeline frame by frame, a trail of all frames, and each frame at the smallest ship size. |
| `build [--check]` | Writes styled `currentColor` SVGs into the build folder, plus the motion CSS when an icon moves. |
| `preview SNIPPET --option ...` | HTML page that shows 2 to 4 style options inside a snippet of the real UI. |
| `report` | Lists icons, metaphors, build state and waivers for the final report. |

Most commands take `--with "section.key=value, ..."` to try a style change without an edit to the file.

Render output goes to a cache folder outside the project: `$XDG_CACHE_HOME/kiconmaker/<project>-<hash>/`. Set `KICONMAKER_CACHE` to move it. Never copy renders into the product repository.

## Reference files

| File | Read it when |
|---|---|
| `references/source-format.md` | Before you write the style file, the first source, or a part. It lists every `icons.toml` key, the source rules, roles and waivers. |
| `references/craft.md` | Before you draw the first batch, and when lint or a render shows a problem you cannot explain. |
| `references/motion.md` | Before you add motion to any icon, and when `frames` or the motion lint shows a problem. |
| `references/wire-in.md` | After build, when the user wants the icons in the UI. |

## Workflow

### 1. Set up the style file

Skip this step when `icons.toml` already exists. Read it instead, and follow it.

1. **Inspect the product.** Read the UI code, the CSS tokens, the existing icons and the screens that will hold the new ones. Note the text size, the stroke weight of the existing icons, the corner radii and the tone of the product.
2. **Offer 2 to 4 concrete options.** Each option is a full style: kind, stroke width, caps and joins, corner radius, and detail. Recommend one, and give the reason from what you saw in the product. For example: "Outline at stroke 1.5 with round joins. The UI uses 14 px text and 6 px radii, so a light, round icon fits."
3. **Show the options in the real UI.** Draw two or three icons that the screen needs. Copy a small piece of the product's markup and CSS into a snippet file in the cache folder, and put `{{icon:name}}` or `{{icon:name:20}}` where the icons go. Then run:

   ```bash
   python3 "$KICONMAKER" preview snippet.html \
     --option "A Outline 1.5: style.kind=outline, stroke.width=1.5" \
     --option "B Duotone 2: style.kind=duotone, stroke.width=2"
   ```

   Open the printed HTML path for the user, or take a screenshot with a headless browser and look at it yourself first.
4. **Write the choice into `icons.toml`.** Run `init --note "..."` for the starter file, then edit it to match the chosen option. Set `output.build_dir` to the folder the product imports icons from.

A change to a global rule after the set exists, such as stroke width, padding or grid, means a redraw of every icon. Confirm with the user before you make one.

### 2. Plan the set

List each icon the user needs, the object it shows, and the parts it shares with other icons. Pick metaphors by the object, not the action, and prefer known conventions. See `references/craft.md`.

For a set of more than about 6 icons, draw 3 very different ones first. For example, draw a round one, a square one and a detailed one. Render them, show the sheet to the user, and confirm the direction before you draw the rest. A wrong direction found after 3 icons costs 3 redraws, not 30.

### 3. Draw in small batches

Draw 3 to 5 icons per batch. For each icon:

1. Run `new NAME --metaphor "..."`, then write the geometry. Draw centrelines only, with no paint attributes. Put reused sub-shapes in parts.
2. Run `lint`. Fix every error. Fix each warning, or waive it on purpose with `data-waive` and a reason in `data-waive-why`.
3. Run `render NAME` and **look at the PNG with the Read tool.** Check the large view for geometry and the real sizes for legibility. The four questions at the end of `references/craft.md` are the check.
4. Fix and repeat until the icon reads at the smallest ship size.

Never report an icon as done when you have not looked at its render.

### 3a. Add motion

Skip this step when the user wants static icons. Otherwise, read `references/motion.md` first.

1. For each icon, name the move the object makes in real life, for example "the lid opens on its hinge". Add it to `data-metaphor`.
2. Put the moving part in its own `<g>`. Add `data-motion`, `data-motion-kind` and `data-motion-origin`.
3. Run `lint`. Fix each motion error. A `motion-pad` warning is fine when a part rises into the padding on purpose. Waive it with a reason.
4. Run `frames NAME` and **look at the PNG with the Read tool.** Check the peak frame, the pivot on the trail tile, and the smallest size.
5. Fix and repeat. Never report a moving icon as done when you have not looked at its frames.

Keep one duration and one easing for the set, in `[motion]`. Move one part per icon in most cases.

### 4. Check the batch together

Run `sheet` and look at both PNGs. On the sharp sheet, check that the icons share one size, one weight and one style. On the blurred sheet, find any icon that is darker or lighter than its neighbours. Fix it, then run `sheet` again.

Moving icons show at rest on the sheet. Their frames are the check for motion.

When the product ships more than one style, or the user is still choosing, run `sheet --with "style.kind=solid"` and the other kinds, and look at each one.

### 5. Build

Run `build`. It writes one SVG per source into the build folder. Edit sources, never built files. The next build overwrites a hand edit.

### 6. Wire the icons in

Follow `references/wire-in.md`. In short:

- Import the built SVGs inline, the way the project already does, so `currentColor` works.
- Replace only the icons the user asked for.
- Use the sizes from `output.sizes`.
- Give each icon-only button an `aria-label`, and set `aria-hidden="true"` on each decorative icon.
- For a moving icon, put the `motion.trigger` class on the button or link that holds it. Check that the project's SVG loader keeps the `<style>`, or use `motion.delivery = "stylesheet"`.
- Run the project's quick typecheck if one exists.

### 7. Report

Run `report`, then give the user a short summary:

- each icon made and its metaphor, and its move when it has one.
- the files changed in the product.
- where the sources, parts and built files live.
- each lint rule knowingly waived, and why.

## Rules of thumb

- **The style file wins.** When a user request conflicts with `icons.toml`, say so and ask. Do not quietly break the set's rules for one icon.
- **Sources are geometry.** Paint comes from the style file at build time. A `stroke` or `fill` in a source fails validation on purpose.
- **Parts keep objects the same.** A document, a person or an arrow head must look the same in every icon. Only a shared part makes sure of that.
- **Look, then trust.** A clean lint means the geometry follows the rules. It does not mean the icon reads as its object. Only the render shows that.
- **Keep renders out of the project.** They are review material, not product files.
- **Motion means the object, not decoration.** A move the object would not make confuses the user. When no honest move exists, leave the icon still.
