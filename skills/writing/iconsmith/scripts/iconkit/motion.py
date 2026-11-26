"""Hover motion for icon groups: one pose model for CSS, frames and lint.

A source marks a <g>, or a part <use>, with data-motion. The value is the
hover pose, written as a list of steps: translate(x y), rotate(deg) and
scale(s) or scale(sx sy). The steps compose left to right, the same way
as the SVG transform attribute. Rotate and scale turn about the motion
origin. The origin is data-motion-origin, or the canvas centre when that
attribute is absent. rotate(deg cx cy) names its own centre.

The rest pose uses the same steps with neutral values. CSS then moves each
step on its own, so a pivot stays fixed through every frame. The functions
in this module compute that same motion in Python. The emitter, the frame
renders and the lint all call them, so the three cannot disagree.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from . import transform

KINDS = ("hold", "pulse", "swing")
ATTRS = ("data-motion", "data-motion-kind", "data-motion-delay",
         "data-motion-duration", "data-motion-origin")
NAMED_EASINGS = {
    "linear": (0.0, 0.0, 1.0, 1.0),
    "ease": (0.25, 0.1, 0.25, 1.0),
    "ease-in": (0.42, 0.0, 1.0, 1.0),
    "ease-out": (0.0, 0.0, 0.58, 1.0),
    "ease-in-out": (0.42, 0.0, 0.58, 1.0),
}
_BEZIER_RE = re.compile(r"^cubic-bezier\(([^)]*)\)$")
_FUNC_RE = re.compile(r"([a-zA-Z]+)\s*\(([^)]*)\)")
_NUM_RE = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


class MotionError(ValueError):
    """A motion attribute or a motion setting cannot be read."""


def parse_easing(text: str) -> tuple[float, float, float, float]:
    """Return the four cubic-bezier control values for a CSS easing name."""
    text = text.strip()
    if text in NAMED_EASINGS:
        return NAMED_EASINGS[text]
    match = _BEZIER_RE.match(text.replace(" ", ""))
    if match:
        nums = [float(n) for n in _NUM_RE.findall(match.group(1))]
        if len(nums) == 4 and 0 <= nums[0] <= 1 and 0 <= nums[2] <= 1:
            return (nums[0], nums[1], nums[2], nums[3])
    names = ", ".join(NAMED_EASINGS)
    raise MotionError(f"easing '{text}' is not valid. Use {names}, or cubic-bezier(x1, y1, x2, y2) "
                      "with x1 and x2 from 0 to 1.")


def ease(curve: tuple, x: float) -> float:
    """Return the eased progress for time share x, the way a browser computes it."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    x1, y1, x2, y2 = curve

    def bez(a: float, b: float, s: float) -> float:
        return 3 * a * (1 - s) ** 2 * s + 3 * b * (1 - s) * s ** 2 + s ** 3

    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if bez(x1, x2, mid) < x:
            lo = mid
        else:
            hi = mid
    return bez(y1, y2, (lo + hi) / 2)


@dataclass(frozen=True)
class Motion:
    """One moving group. Steps hold normalised tuples, see parse_steps."""

    steps: tuple
    kind: str
    delay: float
    duration: float

    @property
    def end(self) -> float:
        return self.delay + self.duration

    def progress(self, t_ms: float, curve: tuple) -> float:
        """Return the eased progress from rest (0) to the pose (1) at time t_ms after hover starts."""
        u = (t_ms - self.delay) / self.duration if self.duration else 1.0
        if self.kind == "hold":
            return ease(curve, u)
        if u <= 0 or u >= 1:
            return 0.0
        if self.kind == "pulse":
            if u <= 0.5:
                return ease(curve, u * 2)
            return 1.0 - ease(curve, (u - 0.5) * 2)
        # swing: rest, pose, the mirrored pose, rest. Each leg eases on its own.
        if u <= 0.25:
            return ease(curve, u / 0.25)
        if u <= 0.75:
            return 1.0 - 2.0 * ease(curve, (u - 0.25) / 0.5)
        return -1.0 + ease(curve, (u - 0.75) / 0.25)

    def matrix(self, p: float) -> tuple:
        """Return the motion matrix at progress p. p may pass 1 on an easing that overshoots."""
        result = transform.IDENTITY
        for step in self.steps:
            result = transform.multiply(result, _step_matrix(step, p))
        return result

    def css(self, p: float) -> str:
        """Return the CSS transform list at progress p. Only 0, 1 and -1 reach a stylesheet."""
        return " ".join(_step_css(step, p) for step in self.steps)


def _num(v: float) -> str:
    text = f"{round(v, 4):.4f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def _step_matrix(step: tuple, p: float) -> tuple:
    name = step[0]
    if name == "translate":
        return transform.parse(f"translate({step[1] * p} {step[2] * p})")
    if name == "rotate":
        return transform.parse(f"rotate({step[1] * p} {step[2]} {step[3]})")
    sx, sy, cx, cy = 1 + (step[1] - 1) * p, 1 + (step[2] - 1) * p, step[3], step[4]
    return transform.parse(f"translate({cx} {cy}) scale({sx} {sy}) translate({-cx} {-cy})")


def _step_css(step: tuple, p: float) -> str:
    name = step[0]
    if name == "translate":
        return f"translate({_num(step[1] * p)}px,{_num(step[2] * p)}px)"
    if name == "rotate":
        cx, cy = step[2], step[3]
        return (f"translate({_num(cx)}px,{_num(cy)}px) rotate({_num(step[1] * p)}deg) "
                f"translate({_num(-cx)}px,{_num(-cy)}px)")
    sx, sy, cx, cy = 1 + (step[1] - 1) * p, 1 + (step[2] - 1) * p, step[3], step[4]
    return (f"translate({_num(cx)}px,{_num(cy)}px) scale({_num(sx)},{_num(sy)}) "
            f"translate({_num(-cx)}px,{_num(-cy)}px)")


def parse_steps(text: str, origin: tuple[float, float]) -> tuple:
    """Parse a data-motion value into normalised steps.

    translate -> ("translate", x, y). rotate -> ("rotate", deg, cx, cy).
    scale -> ("scale", sx, sy, cx, cy).
    """
    steps, consumed = [], 0
    for match in _FUNC_RE.finditer(text):
        if text[consumed:match.start()].strip(" ,\t\n"):
            raise MotionError(f"cannot read data-motion near '{text[consumed:match.start()].strip()}'")
        name, args = match.group(1), [float(n) for n in _NUM_RE.findall(match.group(2))]
        consumed = match.end()
        if name == "translate" and len(args) in (1, 2):
            steps.append(("translate", args[0], args[1] if len(args) == 2 else 0.0))
        elif name == "rotate" and len(args) in (1, 3):
            centre = (args[1], args[2]) if len(args) == 3 else origin
            steps.append(("rotate", args[0], *centre))
        elif name == "scale" and len(args) in (1, 2):
            sy = args[1] if len(args) == 2 else args[0]
            if args[0] <= 0 or sy <= 0:
                raise MotionError("scale() in data-motion must be greater than 0")
            steps.append(("scale", args[0], sy, *origin))
        else:
            raise MotionError(f"data-motion step {name}() with {len(args)} argument(s) is not allowed. "
                              "Use translate(x y), rotate(deg) or scale(s).")
    if text[consumed:].strip(" ,\t\n") or not steps:
        raise MotionError(f"data-motion '{text}' holds no readable steps")
    return tuple(steps)


def _float(el, key: str, default: float) -> float:
    raw = el.get(key)
    if raw is None:
        return default
    try:
        value = float(raw.replace("ms", ""))
    except ValueError as exc:
        raise MotionError(f"{key}='{raw}' is not a number of milliseconds") from exc
    if value < 0:
        raise MotionError(f"{key} must be 0 or more")
    return value


def from_element(el, size: float, default_duration: float) -> Motion | None:
    """Return the Motion that an element declares, or None when it has no data-motion."""
    text = el.get("data-motion")
    if text is None:
        if any(el.get(a) is not None for a in ATTRS):
            raise MotionError("a data-motion-* attribute needs data-motion on the same element")
        return None
    raw_origin = el.get("data-motion-origin")
    origin = (size / 2, size / 2)
    if raw_origin is not None:
        nums = [float(n) for n in _NUM_RE.findall(raw_origin)]
        if len(nums) != 2:
            raise MotionError(f"data-motion-origin='{raw_origin}' needs two numbers, 'x y'")
        origin = (nums[0], nums[1])
    kind = el.get("data-motion-kind", "hold")
    if kind not in KINDS:
        raise MotionError(f"data-motion-kind='{kind}' is not one of {', '.join(KINDS)}")
    duration = _float(el, "data-motion-duration", default_duration)
    if duration <= 0:
        raise MotionError("data-motion-duration must be greater than 0")
    steps = parse_steps(text, origin)
    if kind == "swing" and any(s[0] == "scale" and max(s[1], s[2]) >= 2 for s in steps):
        raise MotionError("a swing mirrors scale(s) to scale(2 - s), so each scale must stay under 2")
    return Motion(steps, kind, _float(el, "data-motion-delay", 0.0), duration)


def validate(children, size: float, default_duration: float, where: str) -> list[str]:
    """Check every motion attribute in an expanded source tree. Return error lines."""
    errors: list[str] = []

    def walk(el, trail: str, inside: bool) -> None:
        tag = el.tag.rsplit("}", 1)[-1]
        try:
            moving = from_element(el, size, default_duration) is not None
        except MotionError as exc:
            errors.append(f"{where} {trail}: {exc}")
            moving = el.get("data-motion") is not None
        if moving and tag != "g":
            errors.append(f"{where} {trail}: data-motion goes on a <g> or a part <use>, not on <{tag}>")
        if moving and inside:
            errors.append(f"{where} {trail}: a moving group sits inside another moving group. "
                          "Give each moving part its own group at one level.")
        for index, child in enumerate(el):
            walk(child, f"{trail} > {child.tag.rsplit('}', 1)[-1]}[{index}]", inside or moving)

    for index, child in enumerate(children):
        walk(child, f"{child.tag.rsplit('}', 1)[-1]}[{index}]", False)
    return errors


def groups(children, size: float, default_duration: float) -> list[Motion]:
    """Return every Motion in an expanded source tree, in document order."""
    found: list[Motion] = []

    def walk(el) -> None:
        motion = from_element(el, size, default_duration)
        if motion is not None:
            found.append(motion)
        for child in el:
            walk(child)

    for child in children:
        walk(child)
    return found


def timeline_end(motions: list[Motion]) -> float:
    return max((m.end for m in motions), default=0.0)


KEY_SHARES = {"hold": (0.0, 1.0), "pulse": (0.0, 0.5, 1.0), "swing": (0.0, 0.25, 0.75, 1.0)}


def key_times(motions: list[Motion]) -> list[float]:
    """Return the times at which each motion reaches a keyframe: its start, its peaks and its end."""
    return sorted({round(m.delay + m.duration * share, 6) for m in motions for share in KEY_SHARES[m.kind]})


def sample_times(motions: list[Motion], count: int) -> list[float]:
    """Return count evenly spaced times from hover start to the end of the last motion.

    The keyframe times of every motion join the list. An even spacing alone
    can step over the peak of a pulse or a swing, and then neither the
    frames nor the lint would see the largest move.
    """
    end = timeline_end(motions)
    if count < 2 or end <= 0:
        return [0.0]
    even = {round(end * i / (count - 1), 6) for i in range(count)}
    return sorted(even | set(key_times(motions)))


def stylesheet(entries: list[tuple[str, Motion]], easing: str, trigger: str) -> str:
    """Return the CSS for (class name, motion) pairs.

    Hover rules apply only on devices with a real hover. Focus rules apply
    everywhere. Every rule sits inside prefers-reduced-motion: no-preference,
    so a user who asks for less motion sees the icon at rest.
    """
    if not entries:
        return ""
    frames, base, hover, focus = [], [], [], []
    for cls, m in entries:
        rest, pose = m.css(0.0), m.css(1.0)
        base.append(f".{cls}{{transform-box:view-box;transform-origin:0 0;transform:{rest}"
                    + (f";transition:transform {_num(m.duration)}ms {easing}}}" if m.kind == "hold" else "}"))
        if m.kind == "hold":
            state = f"{{transform:{pose};transition-delay:{_num(m.delay)}ms}}"
        else:
            middle = (f"50%{{transform:{pose}}}" if m.kind == "pulse" else
                      f"25%{{transform:{pose}}}75%{{transform:{m.css(-1.0)}}}")
            frames.append(f"@keyframes {cls}{{0%,100%{{transform:{rest}}}{middle}}}")
            state = f"{{animation:{cls} {_num(m.duration)}ms {easing} {_num(m.delay)}ms 1 both}}"
        hover.append(f".{trigger}:hover .{cls},svg:hover .{cls}{state}")
        focus.append(f".{trigger}:focus-visible .{cls}{state}")
    return ("".join(frames) + "@media (prefers-reduced-motion:no-preference){" + "".join(base)
            + "@media (hover:hover){" + "".join(hover) + "}" + "".join(focus) + "}")
