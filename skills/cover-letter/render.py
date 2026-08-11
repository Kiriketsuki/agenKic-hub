#!/usr/bin/env python3
"""Render a cover letter markdown file to PDF via the LaTeX template.

Usage: python3 render.py "<letter.md>" [output.pdf]

Reads the markdown letter (greeting "Dear ...," through the paragraph before
"Best Regards,"), fills template.tex, compiles with tectonic in a temp dir,
and writes the PDF next to the markdown file (or to the given output path).
"""
import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent


def latex_escape(text: str) -> str:
    for a, b in [("\\", r"\textbackslash{}"), ("&", r"\&"), ("%", r"\%"),
                 ("$", r"\$"), ("#", r"\#"), ("_", r"\_"),
                 ("{", r"\{"), ("}", r"\}")]:
        if a == "\\":
            continue  # letters never contain raw backslashes; skip to keep escapes intact
        text = text.replace(a, b)
    text = re.sub(r'"([^"]*)"', r"``\1''", text)
    return text


def main() -> int:
    md_path = Path(sys.argv[1])
    md = md_path.read_text()

    # Anchor at the "Dear ...," greeting (skips any leading heading/letterhead),
    # take everything after it, then strip the trailing valediction + signature
    # block. The template supplies its own "Best Regards, Jovian" sign-off, so the
    # body must end at the last real paragraph regardless of how the source closed.
    m = re.search(r"^(Dear .+?,)\n(.*)", md, re.S | re.M)
    if not m:
        print("Could not find 'Dear ...,' greeting", file=sys.stderr)
        return 1
    greeting, rest = m.group(1), m.group(2)
    sig = re.compile(
        r"^\s*(best regards,?|best wishes,?|kind regards,?|regards,?|"
        r"sincerely,?|yours sincerely,?|yours faithfully,?|"
        r"jovian.*|lim zhe hong.*|limzh\.jovian@gmail\.com)\s*$",
        re.I,
    )
    lines = rest.rstrip().split("\n")
    while lines and (not lines[-1].strip() or sig.match(lines[-1])):
        lines.pop()
    rest = "\n".join(lines).strip()
    body = latex_escape(f"{greeting}\n\n{rest}")

    target = re.search(r"^target:\s*(.+)$", md, re.M)
    role = target.group(1).strip() if target else md_path.stem
    recipient = greeting.removeprefix("Dear ").removesuffix(",")

    tpl = (SKILL_DIR / "template.tex").read_text()
    tex = (tpl.replace("{{DATE}}", date.today().strftime("%-d %B %Y"))
              .replace("{{RECIPIENT}}", latex_escape(recipient))
              .replace("{{ROLE}}", latex_escape(role))
              .replace("{{BODY}}", body))

    out_pdf = Path(sys.argv[2]) if len(sys.argv) > 2 else md_path.with_suffix(".pdf")
    with tempfile.TemporaryDirectory() as td:
        tex_file = Path(td) / "letter.tex"
        tex_file.write_text(tex)
        r = subprocess.run(["tectonic", str(tex_file)], capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr[-2000:], file=sys.stderr)
            return r.returncode
        out_pdf.write_bytes((Path(td) / "letter.pdf").read_bytes())
    print(out_pdf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
