"""Entry point for `python3 -m kilint`."""

from __future__ import annotations

import os
import sys

from .cli import main


def run() -> int:
    """Run the CLI, tolerating a reader that closes the pipe early.

    Piping into `head` closes stdout before kilint finishes writing. Without
    this guard the interpreter prints a BrokenPipeError traceback at shutdown.
    """
    try:
        code = main()
        sys.stdout.flush()
        return code
    except BrokenPipeError:
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, sys.stdout.fileno())
        return 0


if __name__ == "__main__":
    sys.exit(run())
