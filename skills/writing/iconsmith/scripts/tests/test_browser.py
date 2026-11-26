"""Cross-check the Python pose model against a real browser.

The frames and the motion lint come from the Python model in motion.py.
This test proves that Chromium moves the built SVG the same way. It loads
the built icons in headless Chromium, turns on the trigger state, pauses
each animation at fixed times and reads the matrix of a probe shape.

Headless Chromium matches :focus-visible on a script focus only some of
the time. So the test page renames :focus-visible to a .forced class in
the built CSS and sets that class. Every other part of the CSS stays as
the build wrote it. The test skips when no Chromium binary is installed.
Run it under the shared browser lock on a busy host.
"""

import json
import re
import shutil
import subprocess

import pytest
from conftest import write_source

from iconkit import motion, source, style, transform

BROWSER = next((shutil.which(b) for b in ("chromium", "google-chrome-stable", "google-chrome")
                if shutil.which(b)), None)
pytestmark = pytest.mark.skipif(BROWSER is None, reason="no Chromium binary")

CASES = {
    "hinge": ('<g transform="translate(1 0)" data-motion="rotate(-35 6 8)" '
              'data-motion-delay="40"><path id="probe" d="M6 8 H18"/></g>', 1),
    "bell": ('<g data-motion="rotate(18) translate(0 -1)" data-motion-kind="pulse" '
             'data-motion-origin="12 4"><path id="probe" d="M6 16 H18"/></g>', 0),
    "grow": ('<g data-motion="scale(1.2 0.8)" data-motion-origin="12 20">'
             '<rect id="probe" x="6" y="6" width="12" height="12"/></g>', 0),
    "clapper": ('<g data-motion="rotate(12)" data-motion-kind="swing" data-motion-origin="12 4">'
                '<path id="probe" d="M8 14 H16"/></g>', 0),
}
TIMES = (0, 45, 60, 150, 220, 290, 330, 400)

SCRIPT = """
const out = {};
document.querySelectorAll('.icon-trigger svg [class^="ism-"]').forEach(el => getComputedStyle(el).transform);
for (const b of document.querySelectorAll('.icon-trigger')) {
  b.classList.add('forced');
  getComputedStyle(b.querySelector('svg [class^="ism-"]')).transform;
  const svg = b.querySelector('svg');
  const probe = svg.querySelector('[data-probe]');
  const anims = svg.getAnimations({subtree: true});
  anims.forEach(a => a.pause());
  const rows = [];
  for (const t of TIMES) {
    anims.forEach(a => { a.currentTime = t; });
    const m = svg.getScreenCTM().inverse().multiply(probe.getScreenCTM());
    rows.push([t, m.a, m.b, m.c, m.d, m.e, m.f]);
  }
  out[b.dataset.name] = {anims: anims.length, rows};
}
document.getElementById('out').textContent = JSON.stringify(out);
"""


def _forced(svg: str) -> str:
    assert ":focus-visible" in svg
    return svg.replace(":focus-visible", ".forced")


def _expected(src, cfg, t):
    """Probe matrix from the Python model: the pose, then the group own transform."""
    group = src.children[0]
    found = motion.from_element(group, cfg.size, cfg.motion_duration)
    posed = found.matrix(found.progress(t, motion.parse_easing(cfg.motion_easing)))
    return transform.multiply(posed, transform.parse(group.get("transform")))


def test_chromium_moves_icons_like_the_model(project, tmp_path):
    buttons, sources = [], {}
    for name, (body, _) in CASES.items():
        write_source(project.source_dir, name, body)
        src, errors = source.load_source(project.source_dir / f"{name}.svg", project.parts_dir,
                                         project.size, {}, project.motion_duration)
        assert not errors, errors
        sources[name] = src
        svg = _forced(style.build_icon(src, project).file_text())
        # The build drops ids. Put a probe marker back on the first drawing element.
        svg = re.sub(r"<(path|rect) ", r'<\1 data-probe="1" ', svg, count=1)
        buttons.append(f'<button class="icon-trigger" data-name="{name}">{svg}</button>')
    page = tmp_path / "page.html"
    page.write_text("<!doctype html><html><body>" + "".join(buttons) + '<pre id="out"></pre><script>'
                    + f"const TIMES = {json.dumps(TIMES)};" + SCRIPT + "</script></body></html>",
                    encoding="utf-8")
    run = subprocess.run([BROWSER, "--headless", "--disable-gpu", "--no-sandbox",
                          "--virtual-time-budget=2000", "--dump-dom", page.as_uri()],
                         capture_output=True, text=True, timeout=120, check=False)
    match = re.search(r'<pre id="out">(.*?)</pre>', run.stdout, re.S)
    assert match and match.group(1), run.stderr[-2000:]
    results = json.loads(match.group(1).replace("&quot;", '"'))
    for name in CASES:
        row = results[name]
        assert row["anims"] >= 1, f"{name}: Chromium started no animation"
        for t, *got in row["rows"]:
            want = _expected(sources[name], project, t)
            assert got == pytest.approx(list(want), abs=2e-3), f"{name} at {t} ms"


SOLID_SCRIPT = """
const b = document.querySelector('.icon-trigger');
const svg = b.querySelector('svg');
const movers = [...svg.querySelectorAll('[class^="ism-"]')];
// Compute the rest style first. A focus before that leaves no change to animate.
movers.forEach(el => getComputedStyle(el).transform);
b.classList.add('forced');
movers.forEach(el => getComputedStyle(el).transform);
const anims = svg.getAnimations({subtree: true});
anims.forEach(a => { a.pause(); a.currentTime = 180; });
document.getElementById('out').textContent = JSON.stringify({
  inMask: movers.map(el => !!el.closest('mask')),
  transforms: movers.map(el => getComputedStyle(el).transform),
  anims: anims.length});
"""


def test_chromium_moves_a_solid_cut_with_its_body(project, tmp_path):
    from iconkit import config
    cfg = config.with_patch(project, {"style": {"kind": "solid"}})
    write_source(cfg.source_dir, "box", '<g data-motion="translate(0 -2) rotate(-10)" data-motion-origin="4 8">'
                                        '<rect data-role="body" x="4" y="8" width="16" height="10"/>'
                                        '<path data-role="cut" d="M9 13 H15"/></g>')
    src, errors = source.load_source(cfg.source_dir / "box.svg", cfg.parts_dir, cfg.size, {}, cfg.motion_duration)
    assert not errors, errors
    svg = _forced(style.build_icon(src, cfg).file_text())
    page = tmp_path / "solid.html"
    page.write_text(f'<!doctype html><html><body><button class="icon-trigger">{svg}</button>'
                    f'<pre id="out"></pre><script>{SOLID_SCRIPT}</script></body></html>', encoding="utf-8")
    run = subprocess.run([BROWSER, "--headless", "--disable-gpu", "--no-sandbox",
                          "--virtual-time-budget=2000", "--dump-dom", page.as_uri()],
                         capture_output=True, text=True, timeout=120, check=False)
    match = re.search(r'<pre id="out">(.*?)</pre>', run.stdout, re.S)
    assert match and match.group(1), run.stderr[-2000:]
    data = json.loads(match.group(1).replace("&quot;", '"'))
    assert sorted(data["inMask"]) == [False, True], "expected one body wrapper and one mask copy"
    assert data["anims"] == 2, f"Chromium must animate the body and its cut: {data}"
    body, cut = data["transforms"]
    assert body == cut and body not in ("none", "matrix(1, 0, 0, 1, 0, 0)")
