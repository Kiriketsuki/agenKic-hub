# Wire the Icons into the Product

Read this file after the build, when the user wants the icons in the UI.

## Find how the project already uses icons

Search before you write. Look for:

- An icon component, for example `Icon.tsx`, `icon.vue` or `<svg-icon>`.
- An SVG loader in the build config, for example `vite-plugin-svgr`, `@svgr/webpack`, `?raw` or `?react` imports, or `vite-svg-loader`.
- An inline sprite, or SVG files under `assets/`, `public/` or `static/`.
- An icon library import, for example `lucide-react` or `@heroicons/react`.

Follow the pattern the project already has. Do not add a new loader or dependency unless the user asks.

## Inline, so currentColor works

A built icon paints with `currentColor`. That works only when the SVG markup is inline in the page. An `<img src="icon.svg">` or a CSS `background-image` cannot see the text colour, so the icon renders black.

| Project pattern | How to import |
|---|---|
| React with SVGR | `import HomeIcon from "./icons/home.svg?react"` |
| Vite raw import | `import home from "./icons/home.svg?raw"`, then render the string inline |
| Vue with vite-svg-loader | `import HomeIcon from "./icons/home.svg?component"` |
| Svelte | `{@html home}` with a `?raw` import |
| Server templates | Read the file and include the markup |

If the project only has `<img>` tags for icons, tell the user that `currentColor` needs inline markup, and ask before you change the pattern.

## Moving icons

Read this part when any built icon moves.

- **Inline only.** Hover motion works only with inline SVG markup, the same as `currentColor`. An `<img>` shows the rest pose.
- **Mark the trigger.** Add the `motion.trigger` class, `icon-trigger` by default, to the button or link that holds the icon. A hover anywhere on that control then moves the icon. A hover on the SVG itself also works, but the SVG is a small target.
- **Keyboard focus moves it too.** The CSS uses `:focus-visible` on the trigger, so a keyboard user sees the same motion.
- **Build honours reduced motion.** Every motion rule sits inside `prefers-reduced-motion: no-preference`. Hover rules also sit inside `(hover: hover)`, so a touch screen does not leave an icon stuck in its pose.
- **Keep the CSS.** An SVG optimiser can drop `<style>` elements or rename classes. Check SVGO, SVGR and `vite-svg-loader` settings for `removeStyleElement`, `inlineStyles`, `minifyStyles` or `prefixIds`. If the project cannot keep the `<style>`, set `motion.delivery = "stylesheet"`, build again, and import `motion.css` once in the app entry.
- **Content Security Policy.** A strict `style-src` without `'unsafe-inline'` blocks an inline `<style>` in an inlined SVG. Use `motion.delivery = "stylesheet"` in that case too.
- **Check it in the browser.** Hover each changed control, then use the keyboard to focus it. Then turn on reduced motion in the browser or the OS, and confirm that the icon stays still.

## Change only what the user asked for

Replace the icons the user named. Leave every other icon, label and layout as it is. A broad sweep makes the diff hard to review and can break screens nobody looked at.

## Keep the sizes

Use the pixel sizes from `output.sizes`. Set `width` and `height` on the icon, or the size prop of the project's icon component. Do not scale an icon to a size outside that list without asking. The set was checked at those sizes only.

## Keep accessibility

- **Icon-only button:** the button gets an accessible name, and `aria-hidden` hides the icon from assistive technology.

  ```html
  <button type="button" aria-label="Notifications">
    <svg aria-hidden="true" focusable="false">...</svg>
  </button>
  ```

- **Icon next to visible text:** the text names the control. Hide the icon with `aria-hidden="true"`.
- **Icon that carries meaning alone, outside a control:** give the SVG `role="img"` and an `aria-label`.
- Keep any existing `aria-label`, `title` or tooltip. A new icon does not change what the control does.

## Check the result

1. Run the project's quick typecheck if one exists, for example `npm run typecheck`, `tsc --noEmit` or `vue-tsc --noEmit`. Use the script the project defines. Run heavy commands through the local job governor when the environment has one.
2. If the project has a dev server and a browser tool is available, take a screenshot of the changed screen and look at it.
3. Check the hover, active and disabled colours. The icon should follow the text colour in each state.
