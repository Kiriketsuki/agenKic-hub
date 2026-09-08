"""Local integration tests: disposable Git repos, a private tmux socket, dummy agents."""

import fcntl
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import uuid

LAUNCHER = Path(__file__).resolve().parents[1] / "open_stream.py"


@unittest.skipUnless(shutil.which("git") and shutil.which("tmux"), "requires git and tmux")
class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="open stream test ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.bundle = self.root / "stream bundle"
        self.bundle.mkdir()
        (self.bundle / "briefs").mkdir()
        self.config = self.bundle / "streams.toml"
        self.worktree = self.root / "worktrees" / "repo-123"
        self.socket = "open-stream-test-" + uuid.uuid4().hex
        self.tmux = ["tmux", "-L", self.socket]
        self.cmd("git", "init", "-q", "-b", "main", str(self.repo))
        self.git("config", "user.name", "Launcher Test")
        self.git("config", "user.email", "launcher-test@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.hooksPath", "/dev/null")
        (self.repo / ".env.example").write_text("VALUE=example\n")
        self.git("add", ".env.example")
        self.git("commit", "-qm", "test fixture")
        self.git("branch", "task/123")
        self.git("branch", "task/456")
        self.manifest = self.bundle / "streams.tsv"
        self.manifest.write_text("A\t123\ttask/123\tcustom\nB\t123\ttask/123\tcustom\n")
        self.brief = "Implement the fixture, not a real issue.\n"
        (self.bundle / "briefs" / "A.md").write_text(self.brief)
        (self.bundle / "briefs" / "B.md").write_text("Second stream\n")
        self.agent_script = self.bundle / "dummy agent.py"
        self.agent_script.write_text(
            "import json, pathlib, sys, time\n"
            "pathlib.Path('agent-result.json').write_text(json.dumps({'argv': sys.argv[1:], 'cwd': str(pathlib.Path.cwd())}))\n"
            "time.sleep(120)\n"
        )
        self.setup_script = self.bundle / "dummy setup.py"
        self.setup_script.write_text(
            "import pathlib, sys\n"
            "with pathlib.Path('.setup-runs').open('a') as handle: handle.write('run\\n')\n"
            "sys.exit(9 if pathlib.Path('fail-setup').exists() else 0)\n"
        )
        self.write_config()
        # Never load the user's tmux config or touch their normal server.
        self.cmd(*self.tmux, "-f", "/dev/null", "new-session", "-d", "-s", "control", "-c", str(self.root), "--", "sleep", "120")
        self.addCleanup(lambda: subprocess.run([*self.tmux, "kill-server"], capture_output=True))

    def cmd(self, *args, check=True, cwd=None):
        result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
        if check and result.returncode:
            self.fail(f"command failed: {args!r}\n{result.stdout}\n{result.stderr}")
        return result

    def git(self, *args, check=True):
        return self.cmd("git", "-C", str(self.repo), *args, check=check)

    def write_config(self, *, agent=None, template="repo-{issue}", after=None, setup=None):
        agent = agent if agent is not None else [sys.executable, str(self.agent_script), "{brief}"]
        setup = setup if setup is not None else [sys.executable, str(self.setup_script)]
        anchor = f"after = {json.dumps(after)}\n" if after else ""
        self.config.write_text(
            'repo = "../repo"\nworktree_root = "../worktrees"\n'
            f"worktree_name = {json.dumps(template)}\n"
            '[tmux]\nsession = "test-streams"\nwindow_prefix = "project-"\n'
            f"socket = {json.dumps(self.socket)}\n{anchor}"
            f"[agent]\ncommand = {json.dumps(agent)}\n"
            f"[setup.custom]\ncommand = {json.dumps(setup)}\nenv_example = '.env.example'\n"
        )

    def cli(self, *args, success=True):
        result = self.cmd(sys.executable, "-B", str(LAUNCHER), "--config", str(self.config), *args, check=False, cwd=self.root)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertNotIn("Traceback", result.stderr)
        return result

    def wait_for_agent(self):
        result_path = self.worktree / "agent-result.json"
        for _ in range(100):
            if result_path.exists():
                try:
                    return json.loads(result_path.read_text())
                except json.JSONDecodeError:
                    pass
            time.sleep(0.02)
        self.fail("dummy agent did not start")

    def window_ids(self):
        return self.cmd(*self.tmux, "list-windows", "-a", "-F", "#{window_id}").stdout.splitlines()

    def make_worktree(self, branch="task/123"):
        self.worktree.parent.mkdir(exist_ok=True)
        self.git("worktree", "add", str(self.worktree), branch)

    def test_list_preserves_existing_four_column_format(self):
        result = self.cli("--list")
        self.assertEqual(result.stdout, self.manifest.read_text())
        self.assertFalse(self.worktree.exists())

    def test_launch_creates_session_worktree_and_exact_prompt_argument(self):
        self.cli("A")
        data = self.wait_for_agent()
        self.assertEqual(data, {"argv": [self.brief], "cwd": str(self.worktree)})
        self.assertEqual((self.worktree / ".env").read_text(), "VALUE=example\n")
        self.assertEqual((self.worktree / ".env").stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.worktree / ".setup-runs").read_text(), "run\n")
        self.assertEqual(self.cmd("git", "-C", str(self.worktree), "branch", "--show-current").stdout.strip(), "task/123")

    def test_dry_run_has_no_files_refs_or_windows_side_effects(self):
        windows = self.window_ids()
        refs = self.git("show-ref").stdout
        result = self.cli("A", "--dry-run")
        self.assertIn("DRY RUN", result.stdout)
        self.assertFalse(self.worktree.parent.exists())
        self.assertFalse((self.repo / ".git" / "open-stream.lock").exists())
        self.assertEqual(self.git("show-ref").stdout, refs)
        self.assertEqual(self.window_ids(), windows)

    def test_second_launch_is_idempotent(self):
        self.cli("A")
        self.wait_for_agent()
        windows = self.window_ids()
        result = self.cli("A")
        self.assertIn("already open", result.stdout)
        self.assertEqual(self.window_ids(), windows)
        self.assertEqual((self.worktree / ".setup-runs").read_text(), "run\n")

    def test_reopen_refreshes_setup_and_preserves_existing_env(self):
        self.cli("A")
        self.wait_for_agent()
        self.cmd(*self.tmux, "kill-session", "-t", "=test-streams")
        (self.worktree / ".venv").mkdir()
        (self.worktree / ".env").write_text("KEEP=this\n")
        self.cli("A")
        self.assertEqual((self.worktree / ".setup-runs").read_text(), "run\nrun\n")
        self.assertEqual((self.worktree / ".env").read_text(), "KEEP=this\n")

    def test_shell_metacharacters_formats_and_newlines_are_literal(self):
        marker = self.root / "must not exist"
        prompt = f'"; touch "{marker}"; $(touch "{marker}") `touch "{marker}"` $HOME\n#{{session_name}}\nquotes: \' " \\ unicode: ✓\n'
        (self.bundle / "briefs" / "A.md").write_text(prompt)
        self.cli("A")
        self.assertEqual(self.wait_for_agent()["argv"], [prompt])
        self.assertFalse(marker.exists())

    def test_shared_worktree_requires_explicit_override(self):
        self.cli("A")
        self.wait_for_agent()
        windows = self.window_ids()
        result = self.cli("B", success=False)
        self.assertIn("--allow-shared", result.stderr)
        self.assertEqual(windows, self.window_ids())
        result = self.cli("B", "--allow-shared")
        self.assertIn("warning:", result.stderr)
        self.assertEqual(len(self.window_ids()), len(windows) + 1)

    def test_untagged_pane_in_worktree_subdirectory_blocks_launch(self):
        self.make_worktree()
        subdir = self.worktree / "nested"
        subdir.mkdir()
        self.cmd(*self.tmux, "new-window", "-d", "-t", "control:", "-c", str(subdir), "--", "sleep", "120")
        self.assertIn("already in use", self.cli("A", success=False).stderr)
        self.assertFalse((self.worktree / ".setup-runs").exists())

    def test_legacy_named_window_in_correct_worktree_is_reused(self):
        self.make_worktree()
        self.cmd(*self.tmux, "new-session", "-d", "-s", "test-streams", "-n", "project-A", "-c", str(self.worktree), "--", "sleep", "120")
        self.assertIn("already open", self.cli("A").stdout)
        self.assertFalse((self.worktree / ".setup-runs").exists())

    def test_name_collision_at_different_path_is_not_reused(self):
        self.cmd(*self.tmux, "new-session", "-d", "-s", "test-streams", "-n", "project-A", "-c", str(self.root), "--", "sleep", "120")
        self.assertIn("different worktree", self.cli("A", success=False).stderr)
        self.assertFalse(self.worktree.exists())

    def test_wrong_branch_in_existing_worktree_fails(self):
        self.make_worktree("task/456")
        self.assertIn("mismatch", self.cli("A", success=False).stderr)
        self.assertFalse((self.worktree / ".setup-runs").exists())

    def test_foreign_repository_is_not_reused(self):
        self.cmd("git", "init", "-q", str(self.worktree))
        self.assertIn("not a registered worktree", self.cli("A", success=False).stderr)

    def test_plain_existing_directory_is_not_reused(self):
        self.worktree.mkdir(parents=True)
        self.assertIn("not a registered worktree", self.cli("A", success=False).stderr)

    def test_branch_checked_out_elsewhere_fails(self):
        other = self.root / "other checkout"
        self.git("worktree", "add", str(other), "task/123")
        self.assertIn("already checked out elsewhere", self.cli("A", success=False).stderr)
        self.assertFalse(self.worktree.exists())

    def test_missing_registered_worktree_requires_repair(self):
        self.make_worktree()
        shutil.rmtree(self.worktree)
        self.assertIn("repair", self.cli("A", success=False).stderr)
        self.assertFalse(self.worktree.exists())

    def test_missing_branch_is_not_invented(self):
        remote = self.root / "origin.git"
        self.cmd("git", "init", "--bare", "-q", str(remote))
        self.git("remote", "add", "origin", str(remote))
        self.git("branch", "-D", "task/123")
        self.assertIn("existing branch not found", self.cli("A", success=False).stderr)
        self.assertFalse(self.worktree.exists())
        self.assertNotEqual(self.git("show-ref", "--verify", "refs/heads/task/123", check=False).returncode, 0)

    def test_remote_only_existing_branch_gets_tracking_checkout(self):
        remote = self.root / "origin.git"
        self.cmd("git", "init", "--bare", "-q", str(remote))
        self.git("remote", "add", "origin", str(remote))
        self.git("push", "origin", "task/123")
        self.git("branch", "-D", "task/123")
        self.git("update-ref", "-d", "refs/remotes/origin/task/123")
        refs = self.git("show-ref").stdout
        self.cli("A", "--dry-run")
        self.assertEqual(self.git("show-ref").stdout, refs)
        self.assertFalse(self.worktree.exists())
        self.cli("A")
        self.wait_for_agent()
        self.assertEqual(self.git("config", "branch.task/123.remote").stdout.strip(), "origin")
        self.assertEqual(self.git("config", "branch.task/123.merge").stdout.strip(), "refs/heads/task/123")

    def test_missing_brief_fails_before_mutations(self):
        (self.bundle / "briefs" / "A.md").unlink()
        self.cli("A", success=False)
        self.assertFalse(self.worktree.exists())
        self.assertFalse((self.repo / ".git" / "open-stream.lock").exists())

    def test_empty_brief_is_rejected(self):
        (self.bundle / "briefs" / "A.md").write_text(" \n")
        self.assertIn("empty", self.cli("A", success=False).stderr)

    def test_duplicate_stream_ids_are_rejected(self):
        self.manifest.write_text(self.manifest.read_text() + "A\t456\ttask/456\tdocs\n")
        self.assertIn("duplicate stream ID", self.cli("A", success=False).stderr)

    def test_malformed_manifest_is_rejected(self):
        self.manifest.write_text("A\t123\ttask/123\n")
        self.assertIn("four TSV columns", self.cli("A", success=False).stderr)

    def test_unknown_stream_is_actionable(self):
        self.assertIn("available: A, B", self.cli("unknown", success=False).stderr)

    def test_path_traversal_in_template_is_rejected(self):
        self.write_config(template="../../escape-{issue}")
        self.assertIn("safe directory name", self.cli("A", success=False).stderr)

    def test_unknown_template_placeholder_is_rejected(self):
        self.write_config(template="{branch}")
        self.assertIn("invalid worktree_name", self.cli("A", success=False).stderr)

    def test_invalid_branch_is_rejected(self):
        self.manifest.write_text("A\t123\tbad..branch\tcustom\n")
        self.cli("A", success=False)
        self.assertFalse(self.worktree.exists())

    def test_missing_agent_is_rejected_before_worktree_creation(self):
        self.write_config(agent=["no-such-stream-test-executable", "{brief}"])
        self.assertIn("required executable", self.cli("A", success=False).stderr)
        self.assertFalse(self.worktree.exists())

    def test_missing_setup_tool_is_rejected_before_worktree_creation(self):
        self.write_config(setup=["no-such-stream-test-executable"])
        self.assertIn("required executable", self.cli("A", success=False).stderr)
        self.assertFalse(self.worktree.exists())

    def test_agent_requires_one_whole_argument_placeholder(self):
        self.write_config(agent=[sys.executable, "prefix-{brief}"])
        self.assertIn("standalone {brief}", self.cli("A", success=False).stderr)

    def test_setup_failure_leaves_inspectable_worktree_without_window(self):
        self.make_worktree()
        (self.worktree / "fail-setup").touch()
        windows = self.window_ids()
        self.assertIn("setup failed", self.cli("A", success=False).stderr)
        self.assertEqual(self.window_ids(), windows)
        self.assertFalse((self.worktree / "agent-result.json").exists())

    def test_repository_lock_blocks_concurrent_launcher(self):
        with (self.repo / ".git" / "open-stream.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.assertIn("another launcher", self.cli("A", success=False).stderr)
        self.assertFalse(self.worktree.exists())

    def test_anchor_name_with_spaces_and_missing_anchor_fallback(self):
        self.write_config(after="editor window")
        self.cmd(*self.tmux, "new-session", "-d", "-s", "test-streams", "-n", "editor window", "--", "sleep", "120")
        self.cli("A")
        names = self.cmd(*self.tmux, "list-windows", "-t", "=test-streams", "-F", "#{window_name}").stdout.splitlines()
        self.assertEqual(names, ["editor window", "project-A"])
        self.cmd(*self.tmux, "kill-window", "-t", "test-streams:project-A")
        self.write_config(after="missing window")
        self.cli("A")
        names = self.cmd(*self.tmux, "list-windows", "-t", "=test-streams", "-F", "#{window_name}").stdout.splitlines()
        self.assertEqual(names, ["editor window", "project-A"])

    def test_docs_profile_has_no_setup(self):
        self.manifest.write_text("A\t123\ttask/123\tdocs\n")
        self.cli("A")
        self.wait_for_agent()
        self.assertFalse((self.worktree / ".setup-runs").exists())
        self.assertFalse((self.worktree / ".env").exists())

    def test_bad_toml_table_has_friendly_error(self):
        self.config.write_text('repo = "../repo"\nagent = "not a table"\n')
        self.assertIn("TOML table", self.cli("A", success=False).stderr)

    def test_unknown_setup_profile_is_rejected(self):
        self.manifest.write_text("A\t123\ttask/123\tunknown\n")
        self.assertIn("unknown setup profile", self.cli("A", success=False).stderr)

    def test_ambiguous_anchor_fails_before_worktree_setup(self):
        self.write_config(after="editor")
        self.cmd(*self.tmux, "new-session", "-d", "-s", "test-streams", "-n", "editor", "--", "sleep", "120")
        self.cmd(*self.tmux, "new-window", "-d", "-t", "test-streams:", "-n", "editor", "--", "sleep", "120")
        for extra in (["--dry-run"], []):
            self.assertIn("ambiguous tmux anchor", self.cli("A", *extra, success=False).stderr)
            self.assertFalse(self.worktree.exists())

    def test_worktree_symlink_cannot_escape_configured_root(self):
        self.worktree.parent.mkdir()
        self.worktree.symlink_to(self.root / "outside-root", target_is_directory=True)
        self.assertIn("outside worktree_root", self.cli("A", success=False).stderr)
        self.assertFalse((self.root / "outside-root").exists())

    def test_remote_failure_is_not_misreported_as_missing_branch(self):
        self.git("remote", "add", "origin", str(self.root / "nonexistent.git"))
        self.git("branch", "-D", "task/123")
        result = self.cli("A", success=False)
        self.assertIn("cannot verify branch", result.stderr)
        self.assertNotIn("existing branch not found", result.stderr)
        self.assertFalse(self.worktree.exists())

    def test_dry_run_with_no_tmux_server_does_not_start_one(self):
        self.cmd(*self.tmux, "kill-server")
        self.cli("A", "--dry-run")
        self.assertNotEqual(self.cmd(*self.tmux, "list-sessions", check=False).returncode, 0)
        self.assertFalse(self.worktree.parent.exists())

    def test_empty_command_argument_is_preserved(self):
        self.write_config(agent=[sys.executable, str(self.agent_script), "", "{brief}"])
        self.cli("A")
        self.assertEqual(self.wait_for_agent()["argv"], ["", self.brief])

    def test_failed_agent_remains_visible_and_requires_explicit_close(self):
        self.agent_script.write_text("import sys\nsys.exit(7)\n")
        self.cli("A")
        for _ in range(100):
            result = self.cmd(*self.tmux, "display-message", "-p", "-t", "test-streams:project-A", "#{pane_dead}")
            if result.stdout.strip() == "1":
                break
            time.sleep(0.02)
        else:
            self.fail("failed agent was not retained")
        self.assertIn("has exited", self.cli("A", success=False).stderr)
        self.assertEqual((self.worktree / ".setup-runs").read_text(), "run\n")

    def test_env_source_symlink_cannot_read_outside_worktree(self):
        self.make_worktree()
        outside = self.root / "outside.env"
        outside.write_text("PRIVATE=value\n")
        source = self.worktree / ".env.example"
        source.unlink()
        source.symlink_to(outside)
        self.assertIn("outside the worktree", self.cli("A", success=False).stderr)
        self.assertFalse((self.worktree / ".env").exists())
        self.assertFalse((self.worktree / "agent-result.json").exists())


if __name__ == "__main__":
    unittest.main()
