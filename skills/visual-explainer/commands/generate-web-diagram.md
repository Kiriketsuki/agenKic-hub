---
name: generate-web-diagram
description: Generate a beautiful standalone HTML diagram and open it in the browser
---
Load the visual-explainer skill, then generate an HTML diagram for: $@

Follow the visual-explainer skill workflow. Read the reference template and CSS patterns before generating. Pick a distinctive aesthetic that fits the content -- vary fonts, palette, and layout style from previous diagrams.

If `--publish` is specified, write to `./docs/html/diagrams/`. Otherwise write to `/tmp/visual-explainer/`. Open the result in the browser and tell the user the file path.
