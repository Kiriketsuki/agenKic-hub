# Source Format and Style File

Read this file before you write the first source, a part, or a change to `icons.toml`.

## The style file: `icons.toml`

`icons.toml` sits at the project root. The CLI finds it by a search up from the current folder. Pass `--config PATH` to point at another file.

The loader rejects an unknown section or key. A typo such as `stroke.widht` fails loudly, because a silent default would change every icon in the set.

| Key | Default | Meaning |
|---|---|---|
| `product.note` | required | One line about the product: who uses it and the tone. It steers metaphor and style choices. |
| `canvas.size` | `24` | Edge of the square viewBox, in canvas units. |
| `canvas.padding` | `2` | Clear border. Ink, including half the stroke, stays inside the live area. |
| `canvas.grid` | `0.5` | Step that anchor points snap to. |
| `stroke.width` | `2` | Stroke width in canvas units. |
| `stroke.cap` | `round` | `butt`, `round` or `square`. |
| `stroke.join` | `round` | `miter`, `round` or `bevel`. |
| `stroke.corner_radius` | `2` | Default `rx` for a `<rect>` without one. For paths it is a drawing rule. |
| `stroke.min_gap` | `1.5` | Clear space between two strokes that do not meet. |
| `style.kind` | `outline` | `outline`, `duotone` or `solid`. |
| `style.tone_opacity` | `0.3` | Fill strength of body shapes in duotone. |
| `style.detail` | `medium` | `low`, `medium` or `high`. Caps the subpaths per icon at 6, 10 or 16. |
| `output.sizes` | `[16, 20, 24]` | Pixel sizes the product ships. Renders and sheets show each one. |
| `output.source_dir` | `icons/src` | Source SVGs. People edit these. |
| `output.parts_dir` | `icons/parts` | Shared parts. |
| `output.build_dir` | `icons/build` | Built SVGs. Nobody edits these by hand. |
| `metaphors.avoid` | `[]` | Phrases that no metaphor may use, for example `"floppy disk"`. |
| `lint.ink_tolerance` | `0.25` | Allowed drift of each icon's ink share from the set median. |

Set `output.build_dir` to the folder the product already imports icons from, for example `src/assets/icons`.

### Why a global change means a redraw

Stroke width, padding, grid and minimum gap set the geometry every icon was drawn against. A thinner stroke opens new gaps. A wider padding pushes shapes out of the live area. So a change to a global rule is a change to every icon. Ask the user before you make one, then lint, render and look at the whole set again.

### Try a change without editing the file

Most commands take `--with "section.key=value, section.key=value"`. Values use TOML syntax. A bare word becomes a string.

```bash
python3 "$ICONSMITH" sheet --with "style.kind=solid"
python3 "$ICONSMITH" lint --with "stroke.width=1.5"
```

## Source files

A source is an SVG in `output.source_dir`. The file name is the icon name, in kebab-case, for example `arrow-left.svg`.

Sources hold geometry only. Build adds stroke, fill, caps and joins from `icons.toml`. Validate rejects `stroke`, `fill`, `style`, `class`, `opacity` and any other paint attribute. One style file then controls the whole set, and a style change needs no edit to any source.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     data-metaphor="house with a door">
  <path data-role="body" d="M4 10 L12 4 L20 10 V20 H4 Z"/>
  <path data-role="cut" d="M10 20 V15 H14 V20"/>
</svg>
```

### Root attributes

| Attribute | Use |
|---|---|
| `viewBox` | Must be `0 0 <size> <size>`, the same as `canvas.size`. |
| `data-metaphor` | The object the icon shows, in a few words. Lint warns when it is empty. The final report lists it. |
| `data-waive` | Lint rules this icon knowingly breaks, separated by spaces or commas. |
| `data-waive-why` | One sentence that says why. The report prints it next to the waiver. |

### Allowed elements

`path`, `line`, `polyline`, `polygon`, `circle`, `ellipse`, `rect`, `g`, `use` (for parts only), `title` and `desc`.

Each drawing element takes its geometry attributes, `transform`, `id` and `data-role`. Build drops `id`, because two inlined copies of one icon on a page would clash.

### Centrelines

Draw the centre of each stroke. With a stroke width of 2, a line at `y=4` inks from `y=3` to `y=5`. So with padding 2 the outermost centreline sits at 3 and 21 on a 24 canvas, not at 2 and 22.

### Roles

The `data-role` attribute tells build how a shape paints in each style.

| Role | outline | duotone | solid |
|---|---|---|---|
| `line` (default) | stroke | stroke | stroke |
| `body` | stroke | stroke over a fill at `tone_opacity` | filled and stroked |
| `cut` | stroke | stroke | a line knocked out of the filled bodies |

Mark the main closed mass of the object as `body`. Mark detail that sits on top of a body as `cut`, so the detail stays visible when the body is solid. A `body` must be a closed shape. Otherwise the fill closes it with a straight edge.

In solid style, build puts the cut shapes in a `<mask>`. The mask id is `<icon>-cut`. If the product inlines one icon many times on one page, the ids repeat. The copies are the same, so the browser output is the same.

## Parts

A part is a reused sub-shape, such as a gear tooth, a document corner or an arrow head. It lives in `output.parts_dir` as `<name>.svg`. Its root is an `<svg>` with the same allowed children as a source.

Draw the part in canvas coordinates, in the place it sits in its most common icon. Place it with `<use>` and a transform:

```xml
<use data-part="gear-tooth" transform="rotate(60 12 12)"/>
```

Build expands each `<use>` into a `<g>` that holds the part geometry. The same object then has the same geometry in every icon. When you change a part, every icon that uses it changes. Render all of them before you build.

Parts can nest up to 4 levels.

`iconsmith new <name> --part` writes an empty part.

## Waivers

A waiver records a rule that one icon breaks on purpose. Rotated teeth on a gear cannot sit on the grid, for example:

```xml
<svg ... data-waive="off-grid" data-waive-why="rotated teeth cannot sit on the grid">
```

Lint still prints the finding, marked `waived`, and does not count it. `iconsmith report` lists every waiver with its reason. Put each waiver in the final report to the user.

## Built files

Build writes one SVG per source into `output.build_dir`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">...</svg>
```

The icon paints with `currentColor`, so it takes the text colour of its parent. Build writes the same bytes for the same input, so a diff shows only real changes. `build --check` reports out-of-date files without a write. Build never deletes a built file. It warns when a built file has no source.
