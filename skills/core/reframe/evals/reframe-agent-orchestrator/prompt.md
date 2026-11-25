---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash, WebFetch, WebSearch]
---

/reframe I'm building a setup where one Claude session hands work to several worker sessions running in tmux. It watches whether they're stuck, restarts any worker that stops sending heartbeats, and workers claim cards from a shared store and release them when done.
