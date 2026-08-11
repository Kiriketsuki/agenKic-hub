---
name: croc-send
description: Send files and directories between machines using croc over tailscale. Use this skill whenever the user mentions croc, transferring files between computers, sending files over tailscale, copying files to another machine, or says "/croc-send". Trigger even if they just say "send this to my home PC" or "croc it".
---

# croc-send

This machine acts as the croc relay. All traffic stays on the tailscale network.

## When invoked, immediately output all copy-ready commands

Do NOT do discovery step-by-step. Run the two detection commands, then emit one ready-to-copy block the user can act on immediately.

### Step 1 — Detect IP and relay status

Run both in parallel:
```bash
tailscale ip -4
pgrep -x croc || echo "not running"
```

### Step 2 — Start relay if not running

```bash
croc relay > /tmp/croc-relay.log 2>&1 &
```

### Step 3 — Run the sender yourself, give the user the receiver command

Claude runs the send in the background (Bash tool, `run_in_background: true`) — the user never runs the sender:

```bash
CROC_SECRET=<phrase> croc --relay <ts-ip>:9009 send <absolute-path-to-file>
```

Always use the **absolute path** to the file — the background shell's cwd is not guaranteed. After launching, immediately `tail` the task output file to confirm croc printed "Code copied to clipboard!" (i.e. it is waiting on a receiver, not dead).

Then output only the receiver command, copy-ready:

```
RECEIVER (run on the other machine):
  croc --relay <ts-ip>:9009 <phrase>
```

- If the user specified a custom phrase, use it. Otherwise pick a short memorable one (e.g. the filename without extension).
- If the file to send is ambiguous, infer from recent context (most recently created/discussed file) and say what you picked.
- After the transfer completes (background task notification), confirm success or report the error from the task output.

### Step 4 — Kill the relay after the transfer

When the background send completes, stop the relay so it does not linger:

```bash
pkill -x croc
```

Only skip this if another transfer is queued in the same session.

## Key syntax notes (Linux/Arch)

| Task | Correct syntax |
|---|---|
| Custom code phrase | `CROC_SECRET="my-phrase" croc --relay <ip>:9009 send <file>` |
| Generated phrase | `croc --relay <ip>:9009 send <file>` (croc prints the code) |
| Receive | `croc --relay <ip>:9009 <phrase>` |
| Directory | `croc --relay <ip>:9009 send /path/to/dir/` (auto-zips) |
| Multiple files | `croc --relay <ip>:9009 send file1 file2` |
| Auto-accept on receiver | `croc --yes --relay <ip>:9009 <phrase>` |

**`--code` flag does NOT work on Linux** — always use `CROC_SECRET=` env var for custom phrases.
