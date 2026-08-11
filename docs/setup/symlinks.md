# Manual symlinks

The setup scripts create these links for you. This page shows the manual commands for each OS, for when you want to link a single component by hand.

The examples link the `skills/` directory into a Claude Code skills folder. Adjust source and target for other components.

## Linux and macOS

```bash
ln -s "$HOME/agenKic-sKills/skills" "$HOME/.claude/skills/agenKic-sKills"
```

- The source path must be absolute. A relative source resolves against the link's directory, not your shell's directory.
- Remove a link with `rm`, not `rm -r`. The target directory survives.

## Windows (PowerShell)

```powershell
New-Item -ItemType SymbolicLink `
  -Path "$env:USERPROFILE\.claude\skills\agenKic-sKills" `
  -Target "$env:USERPROFILE\agenKic-sKills\skills"
```

!!! note "Developer Mode"
    Windows restricts symlink creation. Either enable Developer Mode (Settings > System > For developers) or run PowerShell as Administrator. With Developer Mode on, a normal shell can create symlinks.

### Junction fallback

If you cannot enable Developer Mode, use a directory junction. Junctions need no elevation but only work for directories on local drives.

```powershell
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.claude\skills\agenKic-sKills" `
  -Target "$env:USERPROFILE\agenKic-sKills\skills"
```

### Copy fallback

As a last resort, copy the files. A copy does not track repository updates, so re-copy after each `git pull`.

```powershell
Copy-Item -Recurse `
  "$env:USERPROFILE\agenKic-sKills\skills" `
  "$env:USERPROFILE\.claude\skills\agenKic-sKills"
```

## Removing a link

```bash
# Linux / macOS
rm "$HOME/.claude/skills/agenKic-sKills"
```

```powershell
# Windows: removes the link or junction, not the target
Remove-Item "$env:USERPROFILE\.claude\skills\agenKic-sKills"
```
