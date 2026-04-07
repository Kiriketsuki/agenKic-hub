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

- `--repo <name>` — Target repo directory. One of: `AutoConnect`, `StandManagement`, `BHAManagement`, `FleetManagement`, `RemoteSupervisor`. If omitted, detect from `$PWD`.
- `--name <custom-name>` — Override the filename on the server (default: use the source filename).

## Behavior

1. **Locate the file.** If no path is given, find the most recently modified `.html` file in `/tmp/visual-explainer/`.

2. **Determine the repo.** In priority order:
   - Use `--repo` flag if provided
   - Detect from `$PWD` — if the current directory is under `~/workdev/Aurrigo/<RepoName>`, use that repo name
   - If neither works, ask the user which repo this belongs to

3. **Upload via SCP.** Transfer the file to the per-repo directory:
   ```bash
   sshpass -p 'B!lt0n1213' scp <file> sg-server-user@192.168.1.29:~/autoconnect_docs/ve-uploads/<repo>/<filename>
   ```

4. **Return the URL.** Print the shareable LAN URL:
   ```
   http://192.168.1.29:8081/ve/<repo>/<filename>
   ```

5. **Confirm accessibility.** Verify HTTP 200:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://192.168.1.29:8081/ve/<repo>/<filename>
   ```

## Directory Structure

```
/ve/
  index.html                     <- browsable index linking all repos
  AutoConnect/
    versioning.html
    mission-lifecycle.html
    ...
  StandManagement/
    ...
  BHAManagement/
    ...
  FleetManagement/
    ...
  RemoteSupervisor/
    ...
```

The root `index.html` dynamically reads each repo's directory listing and presents a browsable card layout.

## Server Details

- **Host**: `192.168.1.29` (SG server, LAN only)
- **Port**: `8081`
- **Upload base**: `~/autoconnect_docs/ve-uploads/<repo>/`
- **Serve base**: `http://192.168.1.29:8081/ve/<repo>/`
- **Auth**: `sg-server-user` / `B!lt0n1213` (via sshpass)
- **Index**: `http://192.168.1.29:8081/ve/` — root index with all repos

## Valid Repo Names

| Repo | Directory |
|------|-----------|
| AutoConnect | `ve-uploads/AutoConnect/` |
| StandManagement | `ve-uploads/StandManagement/` |
| BHAManagement | `ve-uploads/BHAManagement/` |
| FleetManagement | `ve-uploads/FleetManagement/` |
| RemoteSupervisor | `ve-uploads/RemoteSupervisor/` |

## Example

```
> cd ~/workdev/Aurrigo/AutoConnect
> /visual-explainer:generate-web-diagram "mission lifecycle"
# ... generates /tmp/visual-explainer/mission-lifecycle.html

> /visual-explainer:share
Detected repo: AutoConnect
Uploaded: AutoConnect/mission-lifecycle.html
URL: http://192.168.1.29:8081/ve/AutoConnect/mission-lifecycle.html
```
