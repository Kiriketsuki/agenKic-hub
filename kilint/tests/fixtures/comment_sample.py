"""This module will utilize helper functions to facilitate request handling."""

import json


def helper(value):
    """The result is returned by this helper for further processing downstream."""
    # ensure this always uses the correct format going forward for callers
    # fix later
    return json.dumps(value)


class Widget:
    """A small widget that will utilize the shared configuration object."""

    def render(self):
        # short note
        msg = "please ensure this string literal is never linted by kilint"
        return msg
