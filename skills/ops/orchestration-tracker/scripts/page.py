#!/usr/bin/env python3
"""Fill the tracker page template from a goal config, and check a page before publish.

Usage:
  page.py fill CONFIG.json OUT.html [--template PATH]
  page.py check PAGE.html [--allow-tokens]

fill replaces each {{TOKEN}} in assets/tracker-template.html with an exact string
replace. It never uses a regex on the page text. A regex that replaced a whole CSS
comment line once dropped the closing */ and the browser discarded the stylesheet.
After the fill, the script runs the same checks as `check`.

check exits 1 on any failure. It parses each inline script with node, counts /* and
*/ and { and } in each <style>, and refuses leftover tokens and a dark media block.
"""
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL / "assets" / "tracker-template.html"
NODE = shutil.which("node") or "node"

# Tokens that sit inside JavaScript string or regex literals.
JS_TOKENS = {"SCENARIO_PLURAL", "CHECKS_EMPTY", "LIVE_PROD", "LIVE_MAIN", "LIVE_EPIC", "STORAGE_KEY"}
JS_UNSAFE = re.compile(r'["`\\$<\n\r]')


def fail(msg):
    print("FAIL: " + msg, file=sys.stderr)
    sys.exit(1)


def tokens_from(cfg):
    """Map every template token to its value. Derived tokens get defaults."""
    p = cfg.get("page") or fail("config has no 'page' object")
    lanes = cfg.get("lanes") or fail("config has no 'lanes' list")
    live = p.get("live", {})
    checks = p.get("checks", {})
    need = ["title", "eyebrow", "plan", "sessions_note", "owner_prefixes", "storage_key"]
    missing = [k for k in need if not p.get(k)]
    if missing:
        fail("page is missing: " + ", ".join(missing))
    if not re.fullmatch(r"[A-Za-z0-9_|-]+", p["owner_prefixes"]):
        fail("owner_prefixes must be a plain alternation such as build- or ops-|build-")
    scen = p.get("scenario_name", "Milestone")
    checks_title = checks.get("title", "Checklist")
    return {
        "TITLE": p["title"],
        "EYEBROW": p["eyebrow"],
        "PLAN": p["plan"],
        "SESSIONS_NOTE": p["sessions_note"],
        "STEP_NAME": p.get("step_name", "step"),
        "SCENARIO_NAME": scen,
        "SCENARIO_NAME_LOWER": scen.lower(),
        "SCENARIO_PLURAL": p.get("scenario_plural", scen + "s"),
        "OUTSIDERS": p.get("outsiders", "you"),
        "OWNER_PREFIXES": p["owner_prefixes"],
        "STORAGE_KEY": p["storage_key"],
        "LANES": ", ".join(json.dumps(l) for l in lanes),
        "LIVE_TITLE": live.get("title", "Where each part stands"),
        "LIVE_HINT": live.get("hint", ""),
        "LIVE_PROD": live.get("prod", "Live in production"),
        "LIVE_MAIN": live.get("main", "On main, not live yet"),
        "LIVE_EPIC": live.get("epic", "In the epic, not on main yet"),
        "CHECKS_TITLE": checks_title,
        "CHECKS_LOADING": checks.get("loading", "The " + checks_title.lower() + " load here."),
        "CHECKS_EMPTY": checks.get("empty", "No " + checks_title.lower() + " yet."),
    }


def fill(cfg_path, out_path, template=TEMPLATE):
    cfg = json.loads(Path(cfg_path).read_text())
    vals = tokens_from(cfg)
    text = Path(template).read_text()
    for tok, val in vals.items():
        if tok == "LANES":
            mark = "/*{{LANES}}*/"
            if mark not in text:
                fail("template has no " + mark)
            text = text.replace(mark, val)
            continue
        mark = "{{" + tok + "}}"
        if mark not in text:
            fail("template has no " + mark)
        if tok in JS_TOKENS or tok == "OWNER_PREFIXES":
            if JS_UNSAFE.search(val):
                fail(tok + " sits in a JS literal. Remove quotes, backticks, $, < and line breaks.")
            text = text.replace(mark, val)
        else:
            text = text.replace(mark, html.escape(val, quote=False))
    Path(out_path).write_text(text)
    print("wrote " + str(out_path))
    return check(out_path)


def check(page_path, allow_tokens=False):
    text = Path(page_path).read_text()
    problems = []
    left = sorted(set(re.findall(r"\{\{[A-Z_]+\}\}", text)))
    if left and not allow_tokens:
        problems.append("unfilled tokens: " + ", ".join(left))
    if "prefers-color-scheme: dark" in text or "prefers-color-scheme:dark" in text:
        problems.append("a prefers-color-scheme dark block exists. Dark goes under :root[data-theme=\"dark\"] only")
    if 'window.claude.use("db")' not in text:
        problems.append('the page never calls window.claude.use("db")')
    styles = re.findall(r"<style[^>]*>(.*?)</style>", text, re.S)
    for i, css in enumerate(styles, 1):
        o, c = css.count("/*"), css.count("*/")
        lb, rb = css.count("{"), css.count("}")
        status = "ok" if (o == c and lb == rb) else "UNBALANCED"
        print(f"style {i}: /* {o} */ {c}, {{ {lb} }} {rb}: {status}")
        if status != "ok":
            problems.append(f"style {i} is unbalanced")
    scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", text, re.S)
    for i, js in enumerate(scripts, 1):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as fh:
            fh.write(js)
            js_file = fh.name
        probe = "new Function(require('fs').readFileSync(process.argv[1], 'utf8'))"
        r = subprocess.run([NODE, "-e", probe, js_file], capture_output=True, text=True)
        Path(js_file).unlink()
        print(f"script {i}: {'parses' if r.returncode == 0 else 'PARSE ERROR'}")
        if r.returncode != 0:
            problems.append(f"script {i} does not parse: " + r.stderr.strip().splitlines()[-1])
    if problems:
        for p in problems:
            print("FAIL: " + p, file=sys.stderr)
        sys.exit(1)
    print("page checks pass")
    return 0


def main(argv):
    if len(argv) >= 3 and argv[0] == "fill":
        tpl = argv[argv.index("--template") + 1] if "--template" in argv else TEMPLATE
        return fill(argv[1], argv[2], tpl)
    if len(argv) >= 2 and argv[0] == "check":
        return check(argv[1], "--allow-tokens" in argv)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
