# Install

The repo ships two installers with the same behavior:

| Script | Platform |
|:---|:---|
| `setup/setup.sh` | Linux and macOS |
| `setup/setup.ps1` | Windows PowerShell |

Both scripts symlink components from the repository into their target locations. They do not copy files, so a `git pull` updates everything in place.

## Interactive picker

Run the script with no arguments to get the picker.

```bash
./setup/setup.sh
```

```powershell
.\setup\setup.ps1
```

The picker lists the available components: skills, workflows, each harness, and the shell configs. Select the ones you want. The script resolves each component's target path for your OS and creates the links.

Some components carry templates with `{{variable}}` placeholders. The installer prompts for each variable and writes the rendered file to the target.

## Non-interactive install with a profile

Pass `--profile` with an answers file to skip all prompts.

```bash
./setup/setup.sh --profile my-answers.yml
```

```powershell
.\setup\setup.ps1 -Profile my-answers.yml
```

The answers file records which components to install and the values for template variables. Start from `setup/answers.example.yml`, copy it, and edit the values. A profile makes the install repeatable across machines.

## After installation

- Verify the links exist at the target paths. See [Manual symlinks](symlinks.md) for the per-OS locations.
- On Windows, symlink creation needs Developer Mode or an elevated shell. See the note in [Manual symlinks](symlinks.md).
- Each harness has its own config target. See [Harnesses](harnesses.md).
