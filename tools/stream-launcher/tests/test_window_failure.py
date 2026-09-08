"""Failure injection for window initialization, without starting any process."""

import importlib
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
launcher = importlib.import_module("open_stream")


class WindowFailureTests(unittest.TestCase):
    def plan(self):
        return SimpleNamespace(
            tmux=["tmux", "-L", "unused-test-socket"], session="test-streams",
            window="stream-A", worktree=Path("/unused"), after=None,
            agent=["/unused/agent", "{brief}"], brief="literal $(no-shell)\n",
            key="test-key",
        )

    def check_failure(self, fail_command):
        calls = []

        def fake_run(*args, **kwargs):
            calls.append(args)
            if args[3] == fail_command:
                raise launcher.LaunchError("injected tmux failure")
            return SimpleNamespace(stdout="@99\t%88\n", returncode=0, stderr="")

        with patch.object(launcher, "run", side_effect=fake_run):
            with self.assertRaisesRegex(launcher.LaunchError, "injected"):
                launcher.open_window(self.plan(), [])
        self.assertEqual(calls[-1], ("tmux", "-L", "unused-test-socket", "kill-window", "-t", "@99"))
        self.assertEqual(sum(call[3] == "kill-window" for call in calls), 1)
        return calls

    def test_metadata_failure_cleans_only_the_reserved_window(self):
        calls = self.check_failure("set-option")
        self.assertFalse(any(call[3] == "respawn-pane" for call in calls))

    def test_respawn_failure_cleans_only_the_reserved_window(self):
        calls = self.check_failure("respawn-pane")
        respawn = next(call for call in calls if call[3] == "respawn-pane")
        self.assertEqual(respawn[-2:], ("/unused/agent", "literal $(no-shell)\n"))
        self.assertIn("%88", respawn)


if __name__ == "__main__":
    unittest.main()
