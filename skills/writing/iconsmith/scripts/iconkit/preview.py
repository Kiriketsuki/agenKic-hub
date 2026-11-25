"""Build an HTML page that shows each style option inside a real UI snippet.

The snippet is a small piece of the product's own markup and CSS. It marks
each icon spot with a placeholder: {{icon:name}} or {{icon:name:20}}, where
the last part is the pixel size. Each option renders in its own iframe, so
the snippet CSS of one option cannot leak into another.
"""

from __future__ import annotations

import html
import re

from .style import Icon

PLACEHOLDER = re.compile(r"\{\{\s*icon:([a-z0-9-]+)(?::(\d+))?\s*\}\}")


def placeholders(snippet: str) -> list[str]:
    """Return the icon names the snippet asks for, in order, without repeats."""
    seen: list[str] = []
    for match in PLACEHOLDER.finditer(snippet):
        if match.group(1) not in seen:
            seen.append(match.group(1))
    return seen


def fill(snippet: str, icons: dict[str, Icon], default_px: int) -> str:
    """Replace each placeholder with the inline SVG. A missing icon raises KeyError."""
    counter = iter(range(1, 10_000))

    def swap(match: re.Match) -> str:
        name, px = match.group(1), int(match.group(2) or default_px)
        if name not in icons:
            raise KeyError(name)
        svg = icons[name].nested(0, 0, px, "currentColor", f"-p{next(counter)}")
        return svg.replace("<svg ", '<svg aria-hidden="true" focusable="false" '
                           'style="display:inline-block;vertical-align:middle" ', 1)

    return PLACEHOLDER.sub(swap, snippet)


def page(title: str, options: list[tuple[str, str, str]]) -> str:
    """Return the preview page. options holds (label, settings summary, filled snippet)."""
    cards = []
    for label, summary, body in options:
        doc = ("<!doctype html><html><head><meta charset=\"utf-8\">"
               "<style>body{margin:16px}</style></head><body>" + body + "</body></html>")
        cards.append(
            f'<section class="opt"><h2>{html.escape(label)}</h2>'
            f'<p class="sum">{html.escape(summary)}</p>'
            f'<iframe title="{html.escape(label)}" srcdoc="{html.escape(doc, quote=True)}"></iframe></section>')
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
:root{{--bg:#f4f4f6;--card:#fff;--ink:#1d1d22;--muted:#6b6b76;--line:#dcdce2}}
@media (prefers-color-scheme: dark){{:root{{--bg:#16161a;--card:#222228;--ink:#ececf1;--muted:#a0a0ab;--line:#33333b}}}}
body{{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}}
h1{{font-size:18px;margin:0 0 4px}} .lead{{color:var(--muted);margin:0 0 16px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}
.opt{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}}
.opt h2{{font-size:15px;margin:0}} .sum{{color:var(--muted);font-size:12px;margin:4px 0 8px}}
iframe{{width:100%;height:360px;border:1px solid var(--line);border-radius:6px;background:#fff}}
</style></head><body>
<h1>{html.escape(title)}</h1>
<p class="lead">Each panel shows the same product snippet with one icon style option.<br>Pick the option by its label.</p>
<div class="grid">{''.join(cards)}</div>
</body></html>
"""
