# Setup

Installers for the agentic hub. Two equivalent scripts:

- `setup.sh` for Linux, macOS, and Git Bash on Windows.
- `setup.ps1` for Windows PowerShell 5.1+ and PowerShell 7.

## Interactive run

```bash
./setup/setup.sh
```

```powershell
.\setup\setup.ps1
```

Both scripts show a checkbox picker. Type a number to toggle a component,
`a` to select all, and press enter on an empty line to confirm. The script
then prompts for each template variable, with defaults taken from
`answers.example.yml`.

## Non-interactive run with a profile

```bash
cp setup/answers.example.yml my-answers.yml
# edit my-answers.yml
./setup/setup.sh --profile my-answers.yml
```

```powershell
.\setup\setup.ps1 -Profile my-answers.yml
```

Add `--dry-run` (bash) or `-DryRun` (PowerShell) to print actions without
touching the filesystem.

## Profile format

Flat `key: value` lines. Comments start with `#`. Arrays are comma lists.
The format needs no YAML parser, so keep it flat. Never put secrets in a
profile. Reference env vars from the rendered files instead.

```yaml
components: skills, config-tmux, config-zsh
user_name: Jane Dev
accent_color: "#7aa2f7"
```

`answers.example.yml` documents every valid variable with an example.

## Components

One manifest per component in `setup/components/*.conf`. Each manifest is a
flat `key=value` file with `name`, `desc`, `type`, `source`, and `target`.
To add a component, add one manifest file. Two types exist:

- `link_children`: symlink each child of `source` into `target`.
- `install`: copy every file from `source` into `target`. The installer
  substitutes `{{variable}}` placeholders in files ending in `.tmpl` first,
  then drops the `.tmpl` suffix. It skips `README.md` files. A component
  whose source holds only a README prints "nothing installable yet" and
  does nothing. The harness and statusline components stay in that state
  until their real files move over.

## Idempotence and backups

Re-running the installer replaces links it created. It never overwrites a
real file or directory at a target path. It moves the existing path to
`<path>.bak` first.

## Symlinks per OS

Linux and macOS:

```bash
ln -s /path/to/repo/skills/core/brainstorm ~/.claude/skills/brainstorm
```

Windows PowerShell (needs Developer Mode, or an elevated shell):

```powershell
New-Item -ItemType SymbolicLink -Path $HOME\.claude\skills\brainstorm `
    -Target C:\path\to\repo\skills\core\brainstorm
```

Without Developer Mode or admin rights, symlink creation fails. The
installers then fall back automatically and print which fallback ran:

- Directories: a junction (`New-Item -ItemType Junction`, or
  `cmd /c mklink /J`). Junctions need no elevation.
- Files: a plain copy. A copy does not track later edits in the repo, so
  re-run the installer after pulling updates.

Git Bash note: plain `ln -s` in Git Bash silently copies. The installer
sets `MSYS=winsymlinks:nativestrict` so `ln -s` creates a real symlink or
fails cleanly into the fallback path.

## Templates

The installer renders any `.tmpl` file under `setup/templates/` or a
component source directory with the answers. Placeholders use
`{{variable}}`. Templates hold no secrets. The rendered file references
any secret as an env var instead.
