#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Open an existing issue branch in a worktree and an interactive tmux window."""

from __future__ import annotations

import argparse
import csv
import fcntl
import hashlib
import os
from pathlib import Path
import re
import shutil
import string
import subprocess
import sys
import tomllib
from dataclasses import dataclass, replace


class LaunchError(RuntimeError):
    """A configuration or preflight failure safe to show without a traceback."""


def run(*args: str, cwd: Path | None = None, check: bool = True):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode:
        # Do not echo argv: an agent argument may contain a private brief.
        raise LaunchError(result.stderr.strip() or f"{args[0]} exited {result.returncode}")
    return result


def git(repo: Path, *args: str, check: bool = True):
    return run("git", "-C", str(repo), *args, check=check)


def text(table: dict, key: str, default: str | None = None) -> str:
    value = table.get(key, default)
    if not isinstance(value, str) or not value or any(c in value for c in "\0\n\r\t"):
        raise LaunchError(f"{key} must be a nonempty single-line string")
    return value


def argv(value, label: str, *, allow_empty: bool = False) -> list[str]:
    if not isinstance(value, list) or (not value and not allow_empty):
        raise LaunchError(f"{label} must be an array of command arguments")
    if any(not isinstance(arg, str) or "\0" in arg for arg in value) or (value and not value[0]):
        raise LaunchError(f"{label} contains an invalid argument")
    return value


def resolve(base: Path, value: str) -> Path:
    return (base / Path(value).expanduser()).resolve()


def executable(command: list[str], base: Path) -> list[str]:
    if not command:
        return []
    name = command[0]
    if "/" in name:
        name = str(resolve(base, name))
    found = shutil.which(name)
    if not found:
        raise LaunchError(f"required executable not found: {name}")
    return [str(Path(found).absolute()), *command[1:]]


@dataclass(frozen=True)
class Stream:
    id: str
    issue: str
    branch: str
    setup: str


def read_manifest(path: Path) -> dict[str, Stream]:
    streams = {}
    with path.open(encoding="utf-8", newline="") as handle:
        for number, row in enumerate(csv.reader(handle, delimiter="\t"), 1):
            if not row or not any(row) or row[0].startswith("#"):
                continue
            if row == ["id", "issue", "branch", "setup"]:
                continue
            if len(row) != 4:
                raise LaunchError(f"{path}:{number}: expected id, issue, branch, setup (four TSV columns)")
            stream = Stream(*row)
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", stream.id):
                raise LaunchError(f"{path}:{number}: invalid stream ID")
            if not re.fullmatch(r"[0-9]+", stream.issue):
                raise LaunchError(f"{path}:{number}: issue must be a number")
            if not stream.branch or stream.branch.startswith("-") or any(c in stream.branch for c in "\0\n\r\t"):
                raise LaunchError(f"{path}:{number}: invalid branch")
            if stream.id in streams:
                raise LaunchError(f"{path}:{number}: duplicate stream ID {stream.id}")
            streams[stream.id] = stream
    if not streams:
        raise LaunchError(f"manifest is empty: {path}")
    return streams


@dataclass(frozen=True)
class Plan:
    config: Path
    stream: Stream
    repo: Path
    worktree: Path
    remote: str
    brief_path: Path
    brief: str
    agent: list[str]
    setup: list[str]
    env_example: str | None
    tmux: list[str]
    session: str
    window: str
    after: str | None
    key: str


def load_plan(config: Path, raw: dict, stream: Stream) -> Plan:
    base = config.parent
    repo = resolve(base, text(raw, "repo"))
    root = resolve(base, text(raw, "worktree_root", "../worktrees"))
    template = text(raw, "worktree_name", "{issue}")
    try:
        for _, field, spec, conversion in string.Formatter().parse(template):
            if field is not None and (field not in {"id", "issue"} or spec or conversion):
                raise ValueError("use only {id} and {issue}, without format modifiers")
        name = template.format(id=stream.id, issue=stream.issue)
    except ValueError as error:
        raise LaunchError(f"invalid worktree_name: {error}") from error
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name):
        raise LaunchError("worktree_name must produce a single safe directory name")
    worktree = (root / name).resolve()
    if worktree.parent != root:
        raise LaunchError("worktree path resolves outside worktree_root")
    brief_path = resolve(base, text(raw, "brief_dir", "briefs")) / f"{stream.id}.md"
    brief = brief_path.read_text(encoding="utf-8")
    if not brief.strip() or "\0" in brief:
        raise LaunchError(f"brief is empty or contains NUL: {brief_path}")
    agent = argv(raw.get("agent", {}).get("command", ["claude", "{brief}"]), "agent.command")
    if agent.count("{brief}") != 1 or agent[0] == "{brief}":
        raise LaunchError("agent.command must contain exactly one standalone {brief} argument")
    defaults = {
        "none": {"command": []},
        "docs": {"command": []},
        "uv": {"command": ["uv", "sync", "--locked"]},
        "npm": {"command": ["npm", "ci"]},
    }
    profiles = defaults | raw.get("setup", {})
    if stream.setup not in profiles or not isinstance(profiles[stream.setup], dict):
        raise LaunchError(f"unknown setup profile: {stream.setup}")
    profile = profiles[stream.setup]
    setup = argv(profile.get("command", []), f"setup.{stream.setup}.command", allow_empty=True)
    env_example = text(profile, "env_example") if "env_example" in profile else None
    if env_example and (Path(env_example).is_absolute() or ".." in Path(env_example).parts):
        raise LaunchError("env_example must be a relative path inside the worktree")
    tmux = raw.get("tmux", {})
    session = text(tmux, "session", "streams")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", session):
        raise LaunchError("tmux.session must contain only letters, digits, underscores, and hyphens")
    prefix = tmux.get("window_prefix", "stream-")
    if not isinstance(prefix, str) or not re.fullmatch(r"[A-Za-z0-9_-]*", prefix):
        raise LaunchError("tmux.window_prefix must contain only letters, digits, underscores, and hyphens")
    tmux_command = ["tmux"]
    if "socket" in tmux:
        socket = text(tmux, "socket")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", socket):
            raise LaunchError("tmux.socket must be a simple socket name")
        tmux_command += ["-L", socket]
    remote = text(raw, "remote", "origin")
    if remote.startswith("-"):
        raise LaunchError("remote cannot start with a hyphen")
    key = hashlib.sha256(f"{config}\0{stream.id}".encode()).hexdigest()
    return Plan(config, stream, repo, worktree, remote, brief_path, brief,
                agent, setup, env_example, tmux_command, session, prefix + stream.id,
                text(tmux, "after") if "after" in tmux else None, key)


def worktree_state(plan: Plan) -> bool:
    """Validate checkout ownership. Return True only for a reusable worktree."""
    ref = f"refs/heads/{plan.stream.branch}"
    git(plan.repo, "check-ref-format", ref)
    records = git(plan.repo, "worktree", "list", "--porcelain", "-z").stdout.split("\0\0")
    registered = False
    for record in records:
        fields = dict(field.split(" ", 1) for field in record.split("\0") if " " in field)
        if "worktree" not in fields:
            continue
        path = Path(fields["worktree"]).resolve()
        if path == plan.worktree:
            registered = True
        elif fields.get("branch") == ref:
            raise LaunchError(f"branch is already checked out elsewhere: {path}")
    if not plan.worktree.exists():
        if registered:
            raise LaunchError(f"registered worktree is missing; repair it first: {plan.worktree}")
        return False
    if not registered:
        raise LaunchError(f"existing path is not a registered worktree of this repository: {plan.worktree}")
    top = git(plan.worktree, "rev-parse", "--show-toplevel").stdout.strip()
    common = git(plan.repo, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.strip()
    actual_common = git(plan.worktree, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.strip()
    actual_ref = git(plan.worktree, "symbolic-ref", "--quiet", "HEAD", check=False).stdout.strip()
    if Path(top).resolve() != plan.worktree or Path(common).resolve() != Path(actual_common).resolve() or actual_ref != ref:
        raise LaunchError(f"worktree repository/branch mismatch: {plan.worktree} (expected {ref})")
    return True


def branch_source(plan: Plan) -> str:
    ref = f"refs/heads/{plan.stream.branch}"
    if git(plan.repo, "show-ref", "--verify", "--quiet", ref, check=False).returncode == 0:
        return "local"
    git(plan.repo, "remote", "get-url", plan.remote)
    result = git(plan.repo, "ls-remote", "--exit-code", "--heads", plan.remote, ref, check=False)
    if result.returncode not in (0, 2):
        raise LaunchError(f"cannot verify branch on {plan.remote}: {result.stderr.strip() or 'remote query failed'}")
    if result.returncode == 2 or not any(line.endswith("\t" + ref) for line in result.stdout.splitlines()):
        raise LaunchError(f"existing branch not found on {plan.remote}: {plan.stream.branch}; fetch/check the issue workflow first")
    return "remote"


@dataclass(frozen=True)
class Pane:
    session_id: str
    session: str
    window_id: str
    window: str
    pane_id: str
    cwd: str
    dead: str
    worktree: str
    key: str


def panes(plan: Plan) -> list[Pane]:
    fields = ("session_id", "session_name", "window_id", "window_name", "pane_id",
              "pane_current_path", "pane_dead", "@open_stream_worktree", "@open_stream_key")
    result = run(*plan.tmux, "list-panes", "-a", "-F", "\t".join(f"#{{{field}}}" for field in fields), check=False)
    if result.returncode:
        if "no server running" in result.stderr or "No such file or directory" in result.stderr:
            return []
        raise LaunchError(f"cannot inspect tmux: {result.stderr.strip()}")
    result_panes = []
    for line in result.stdout.splitlines():
        values = line.split("\t")
        if len(values) != len(fields):
            raise LaunchError("cannot safely parse tmux pane inventory (control character in a name/path)")
        result_panes.append(Pane(*values))
    return result_panes


def check_windows(plan: Plan, inventory: list[Pane], allow_shared: bool) -> str | None:
    matching = [pane for pane in inventory if pane.key == plan.key or
                (pane.session == plan.session and pane.window == plan.window)]
    if matching:
        if len({pane.window_id for pane in matching}) != 1:
            raise LaunchError(f"multiple windows match {plan.window}; resolve the collision first")
        if any(pane.key and pane.key != plan.key for pane in matching):
            raise LaunchError(f"window name is owned by a different stream: {plan.window}")
        if not any(pane.dead == "0" for pane in matching):
            raise LaunchError(f"window {plan.window} has exited; inspect and close it before reopening")
        if any((pane.worktree and Path(pane.worktree).resolve() != plan.worktree) or
               (not pane.worktree and not Path(pane.cwd).resolve().is_relative_to(plan.worktree)) for pane in matching):
            raise LaunchError(f"window {plan.window} points at a different worktree")
        return f"{matching[0].session}:{matching[0].window} ({matching[0].window_id})"
    anchors = {pane.window_id for pane in inventory
               if pane.session == plan.session and pane.window == plan.after}
    if len(anchors) > 1:
        raise LaunchError(f"ambiguous tmux anchor: {plan.after}")
    occupied = sorted({f"{pane.session}:{pane.window} ({pane.pane_id})" for pane in inventory
                       if pane.dead == "0" and (pane.worktree == str(plan.worktree) or
                           Path(pane.cwd).resolve().is_relative_to(plan.worktree))})
    if occupied:
        message = "worktree is already in use by " + ", ".join(occupied)
        if not allow_shared:
            raise LaunchError(message + "; use --allow-shared only for intentional sharing")
        print(f"warning: {message}", file=sys.stderr)
    return None


def prepare_worktree(plan: Plan, exists: bool, source: str) -> None:
    if not exists:
        plan.worktree.parent.mkdir(parents=True, exist_ok=True)
        if source == "remote":
            branch = plan.stream.branch
            remote_ref = f"refs/remotes/{plan.remote}/{branch}"
            git(plan.repo, "fetch", "--no-tags", plan.remote, f"+refs/heads/{branch}:{remote_ref}")
            # Only materialize a local tracking checkout of the verified remote branch.
            git(plan.repo, "worktree", "add", "--track", "-b", branch, str(plan.worktree), remote_ref)
        else:
            git(plan.repo, "worktree", "add", "--", str(plan.worktree), plan.stream.branch)
    if plan.env_example and not (plan.worktree / ".env").exists():
        source_path = (plan.worktree / plan.env_example).resolve()
        if not source_path.is_relative_to(plan.worktree):
            raise LaunchError("env_example resolves outside the worktree")
        contents = source_path.read_bytes()
        try:
            fd = os.open(plan.worktree / ".env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "wb") as handle:
                handle.write(contents)
    if plan.setup:
        # Do not use an inherited uv override to sync a different checkout's environment.
        env = os.environ.copy()
        env.pop("VIRTUAL_ENV", None)
        env.pop("UV_PROJECT_ENVIRONMENT", None)
        result = subprocess.run(plan.setup, cwd=plan.worktree, env=env)
        if result.returncode:
            raise LaunchError(f"setup failed ({result.returncode}); worktree kept for inspection, no agent launched")


def open_window(plan: Plan, inventory: list[Pane]) -> str:
    session = next((pane.session_id for pane in inventory if pane.session == plan.session), None)
    output_format = "#{window_id}\t#{pane_id}"
    if session:
        anchors = {pane.window_id for pane in inventory if pane.session == plan.session and pane.window == plan.after}
        if len(anchors) > 1:
            raise LaunchError(f"ambiguous tmux anchor: {plan.after}")
        placement = ["-a", "-t", next(iter(anchors))] if anchors else ["-t", session + ":"]
        command = ["new-window", "-d", "-P", "-F", output_format, *placement]
    else:
        command = ["new-session", "-d", "-P", "-F", output_format, "-s", plan.session]
    # Reserve our window before launching, so metadata and exit handling are in place.
    result = run(*plan.tmux, *command, "-n", plan.window, "-c", str(plan.worktree), "--",
                 sys.executable, "-c", "import time; time.sleep(86400)")
    window, pane = result.stdout.strip().split("\t")
    try:
        for option, value in (("automatic-rename", "off"), ("allow-rename", "off"),
                              ("remain-on-exit", "failed"),
                              ("@open_stream_worktree", str(plan.worktree)), ("@open_stream_key", plan.key)):
            run(*plan.tmux, "set-option", "-w", "-t", window, option, value)
        command = [plan.brief if arg == "{brief}" else arg for arg in plan.agent]
        # Multiple tmux command arguments execute directly, without a shell or send-keys.
        run(*plan.tmux, "respawn-pane", "-k", "-t", pane, "-c", str(plan.worktree), "--", *command)
    except (LaunchError, OSError, KeyboardInterrupt):
        run(*plan.tmux, "kill-window", "-t", window, check=False)
        raise
    return window


def launch(plan: Plan, *, dry_run: bool, allow_shared: bool) -> None:
    for name in ("git", "tmux"):
        executable([name], plan.config.parent)
    common = Path(git(plan.repo, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.strip())

    def preflight():
        exists = worktree_state(plan)
        inventory = panes(plan)
        already = check_windows(plan, inventory, allow_shared)
        if already:
            if not exists:
                raise LaunchError("existing stream window has no valid worktree")
            return exists, inventory, already, "local"
        source = "local" if exists else branch_source(plan)
        executable(plan.agent, plan.config.parent)
        executable(plan.setup, plan.config.parent)
        return exists, inventory, None, source

    if dry_run:
        exists, _, already, source = preflight()
        if already:
            print(f"already open: {already}")
            return
        print(f"DRY RUN: {plan.stream.id} / issue #{plan.stream.issue}")
        print(f"  repository: {plan.repo}")
        print(f"  worktree: {'reuse' if exists else 'create'} {plan.worktree}")
        print(f"  branch: {plan.stream.branch} ({source})")
        print(f"  setup: {plan.setup or 'none'}" + (f"; seed .env from {plan.env_example} if absent" if plan.env_example else ""))
        print(f"  tmux: {plan.session}:{plan.window}; after {plan.after or '(append)'} if present")
        print(f"  agent: {plan.agent}; brief: {plan.brief_path}")
        return

    # Serialize launchers for the same repository, including across config files.
    with (common / "open-stream.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise LaunchError("another launcher is preparing this repository; retry when it finishes") from error
        exists, inventory, already, source = preflight()
        if already:
            print(f"already open: {already}")
            return
        plan = replace(plan, agent=executable(plan.agent, plan.config.parent),
                       setup=executable(plan.setup, plan.config.parent))
        prepare_worktree(plan, exists, source)
        # Setup can be slow. Recheck for windows opened manually in the meantime.
        inventory = panes(plan)
        already = check_windows(plan, inventory, allow_shared)
        if already:
            print(f"already open: {already}")
            return
        worktree_state(plan)
        window = open_window(plan, inventory)
        print(f"opened {plan.session}:{plan.window} ({window}) in {plan.worktree} on {plan.stream.branch}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stream", nargs="?", help="stream ID from the TSV manifest")
    parser.add_argument("--config", type=Path, default=Path("streams.toml"))
    parser.add_argument("--dry-run", action="store_true", help="validate and show the plan without writes or launches")
    parser.add_argument("--allow-shared", action="store_true", help="explicitly allow another live pane in the same worktree")
    parser.add_argument("--list", action="store_true", help="list the configured streams without launching")
    args = parser.parse_args()
    if not args.stream and not args.list:
        parser.error("a stream ID is required unless --list is used")
    try:
        config = args.config.expanduser().resolve()
        raw = tomllib.loads(config.read_text(encoding="utf-8"))
        for section in ("agent", "tmux", "setup"):
            if section in raw and not isinstance(raw[section], dict):
                raise LaunchError(f"{section} must be a TOML table")
        streams = read_manifest(resolve(config.parent, text(raw, "manifest", "streams.tsv")))
        if args.list:
            for stream in streams.values():
                print(f"{stream.id}\t{stream.issue}\t{stream.branch}\t{stream.setup}")
            return 0
        if args.stream not in streams:
            raise LaunchError(f"unknown stream {args.stream}; available: {', '.join(streams)}")
        plan = load_plan(config, raw, streams[args.stream])
        launch(plan, dry_run=args.dry_run, allow_shared=args.allow_shared)
        return 0
    except (LaunchError, OSError, ValueError) as error:
        print(f"open-stream: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("open-stream: interrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
