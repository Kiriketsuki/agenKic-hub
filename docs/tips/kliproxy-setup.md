# Pooled Claude Code Hub

Put your Claude logins on one host and share their quota across your machines. The kit
lives in its own repository, [kliproxy-setup](https://github.com/Kiriketsuki/kliproxy-setup),
and this hub carries it as a submodule at `tools/kliproxy-setup`.

Use [multi-account setup](multi-account.md) if one config directory for each account is
sufficient for you. That setup needs no proxy.

## Read this first

- A proxy for subscription accounts can be against the terms of your plan. An account can
  get a ban. You carry that risk.
- Pool your own accounts only. An employer owns its seats, so get approval before you pool
  a work account.
- Use the pooled accounts through Claude Code, and through no other client.

## What the kit adds

| Part | Purpose |
|---|---|
| Two pools | Personal and work accounts run as two proxy processes and never mix. |
| Router | Sends new sessions to the seat whose quota expires first. |
| Spend guard | Takes a seat out of the pool before it can bill extra usage. |
| Status endpoint | Gives the state of each seat as JSON, for a statusline. |
| Shell function | Selects the pool from the current directory. |

A hub session keeps its normal config directory and its claude.ai login. Session history,
memory, Artifacts and connectors work as in a direct session.

## Get the kit

```bash
git submodule update --init tools/kliproxy-setup
cd tools/kliproxy-setup
cp hub.env.example hub.env
```

Then follow the README of the kit. It covers the host setup, the logins, the client
setup and the tailnet policy.

## Cost note

A session that moves to a different seat sends its whole history again. Keep the context
of a long session small, and read the router section of the README before you run many
large sessions.
