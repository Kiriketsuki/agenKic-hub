---
name: share
description: Upload a visual-explainer HTML file to the LAN docs server under the correct repo directory and return a shareable URL.
---

# Share Visual Explainer

Upload a generated HTML file to the AutoConnect docs server, organized by repository.

## Usage

```
/visual-explainer:share <file-path>
/visual-explainer:share                        # most recent file, auto-detect repo
/visual-explainer:share --repo AutoConnect      # explicit repo
```

## Flags

- `--repo <name>` — Target repo directory. One of: `AutoConnect`, `<repo>`, `<repo>`, `<repo>`, `RemoteSupervisor`. If omitted, detect from `$PWD`.
- `--name <custom-name>` — Override the filename on the server (default: use the source filename).

## Behavior

1. **Locate the file.** If no path is given, find the most recently modified `.html` file in `/tmp/visual-explainer/`.

2. **Determine the repo.** In priority order:
   - Use `--repo` flag if provided
   - Detect from `$PWD` — if the current directory is under `~/<work-dir>/<RepoName>`, use that repo name
   - If neither works, ask the user which repo this belongs to

3. **Upload via SCP.** Transfer the file to the per-repo directory:
   ```bash
   sshpass -f <password-file> scp <file> <server-user>@<lan-host>:~/<docs-dir>/ve-uploads/<repo>/<filename>
   ```

4. **Return the URL.** Print the shareable LAN URL:
   ```
   http://<lan-host>:8081/ve/<repo>/<filename>
   ```

5. **Confirm accessibility.** Verify HTTP 200:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://<lan-host>:8081/ve/<repo>/<filename>
   ```

## Directory Structure

```
/ve/
  index.html                     <- browsable index linking all repos
  AutoConnect/
    versioning.html
    mission-lifecycle.html
    ...
  <repo>/
    ...
  <repo>/
    ...
  <repo>/
    ...
  RemoteSupervisor/
    ...
```

The root `index.html` dynamically reads each repo's directory listing and presents a browsable card layout.

## Server Details

- **Host**: `<lan-host>` (SG server, LAN only)
- **Port**: `8081`
- **Upload base**: `~/<docs-dir>/ve-uploads/<repo>/`
- **Serve base**: `http://<lan-host>:8081/ve/<repo>/`
- **Auth**: `<server-user>` / `<password>` (via sshpass)
- **Index**: `http://<lan-host>:8081/ve/` — root index with all repos

## Valid Repo Names

| Repo | Directory |
|------|-----------|
| AutoConnect | `ve-uploads/AutoConnect/` |
| <repo> | `ve-uploads/<repo>/` |
| <repo> | `ve-uploads/<repo>/` |
| <repo> | `ve-uploads/<repo>/` |
| RemoteSupervisor | `ve-uploads/RemoteSupervisor/` |

## Example

```
> cd ~/<work-dir>/AutoConnect
> /visual-explainer:generate-web-diagram "mission lifecycle"
# ... generates /tmp/visual-explainer/mission-lifecycle.html

> /visual-explainer:share
Detected repo: AutoConnect
Uploaded: AutoConnect/mission-lifecycle.html
URL: http://<lan-host>:8081/ve/AutoConnect/mission-lifecycle.html
```
