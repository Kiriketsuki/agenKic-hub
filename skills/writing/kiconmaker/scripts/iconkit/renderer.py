"""Render SVG text to PNG through resvg, or rsvg-convert as a fall back.

Renders go to a cache folder outside the user's project, so review images
never land in the product repository. KICONMAKER_CACHE moves the cache.
KICONMAKER_RENDERER forces one backend by name.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from pathlib import Path

BACKENDS = ("resvg", "rsvg-convert")


class RenderError(RuntimeError):
    """No renderer is available, or the renderer failed."""


def cache_dir(project_root: Path) -> Path:
    """Return the per-project cache folder and create it."""
    base = os.environ.get("KICONMAKER_CACHE")
    if base:
        root = Path(base)
    else:
        xdg = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
        root = Path(xdg) / "kiconmaker"
    digest = hashlib.sha1(str(project_root.resolve()).encode()).hexdigest()[:8]
    folder = root / f"{project_root.resolve().name}-{digest}"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def pick_backend() -> tuple[str, str]:
    """Return (name, executable path) for the first available backend."""
    forced = os.environ.get("KICONMAKER_RENDERER")
    names = (forced,) if forced else BACKENDS
    for name in names:
        if name not in BACKENDS:
            raise RenderError(f"KICONMAKER_RENDERER='{name}' is not one of {', '.join(BACKENDS)}")
        exe = shutil.which(name)
        if exe:
            return name, exe
    raise RenderError("no SVG renderer found. Install resvg (preferred) or rsvg-convert (librsvg).")


def _sans_family() -> str | None:
    """Ask fontconfig for the system sans face. resvg defaults to Arial, which many Linux hosts lack."""
    exe = shutil.which("fc-match")
    if not exe:
        return None
    result = subprocess.run([exe, "-f", "%{family[0]}", "sans-serif"],
                            capture_output=True, text=True, check=False)
    return result.stdout.strip() or None


def render(svg_text: str, out_png: Path, zoom: float = 1.0) -> Path:
    """Write svg_text next to out_png and render it. Return the PNG path."""
    out_png.parent.mkdir(parents=True, exist_ok=True)
    svg_path = out_png.with_suffix(".svg")
    svg_path.write_text(svg_text, encoding="utf-8")
    name, exe = pick_backend()
    if name == "resvg":
        cmd = [exe, "-z", f"{zoom:g}"]
        family = _sans_family()
        if family:
            cmd += ["--sans-serif-family", family]
        cmd += [str(svg_path), str(out_png)]
    else:
        cmd = [exe, "-z", f"{zoom:g}", "-o", str(out_png), str(svg_path)]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not out_png.is_file():
        raise RenderError(f"{name} failed on {svg_path}: {result.stderr.strip() or 'no output'}")
    return out_png
