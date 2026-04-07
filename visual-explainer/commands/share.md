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
   http://192.168.1.29:8081/<repo>/<filename>
   ```

5. **Confirm accessibility.** Verify HTTP 200:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://192.168.1.29:8081/<repo>/<filename>
   ```

## Directory Structure

```
/                                   <- browsable index linking all repos
  index.html
  AutoConnect/
    versioning.html
    ...
  AutoConnect-MEC-Miki/
    docs/visual-explainer/diagrams/   <- nested structure preserved from branch
    versioning.html
    ...
  AutoConnect-MEC-Mini/
  AutoConnect-VEH-Gufi/
  AutoConnect-INT-Doni/
  AutoConnect-ART-Desi/
  StandManagement/
  BHAManagement/
  FleetManagement/
  RemoteSupervisor/
  RouteVisualiser/
```

The root `index.html` dynamically reads each repo's directory listing and presents a browsable card layout.

## Server Details

- **Host**: `192.168.1.29` (SG server, LAN only)
- **Port**: `8081`
- **Upload base**: `~/autoconnect_docs/ve-uploads/<repo>/`
- **Serve base**: `http://192.168.1.29:8081/<repo>/`
- **Auth**: `sg-server-user` / `B!lt0n1213` (via sshpass)
- **Index**: `http://192.168.1.29:8081/` — root index with all repos

## Valid Repo Names

| Repo | Directory |
|------|-----------|
| AutoConnect | `ve-uploads/AutoConnect/` |
| AutoConnect-MEC-Miki | `ve-uploads/AutoConnect-MEC-Miki/` |
| AutoConnect-MEC-Mini | `ve-uploads/AutoConnect-MEC-Mini/` |
| AutoConnect-VEH-Gufi | `ve-uploads/AutoConnect-VEH-Gufi/` |
| AutoConnect-INT-Doni | `ve-uploads/AutoConnect-INT-Doni/` |
| AutoConnect-ART-Desi | `ve-uploads/AutoConnect-ART-Desi/` |
| StandManagement | `ve-uploads/StandManagement/` |
| BHAManagement | `ve-uploads/BHAManagement/` |
| FleetManagement | `ve-uploads/FleetManagement/` |
| RemoteSupervisor | `ve-uploads/RemoteSupervisor/` |
| RouteVisualiser | `ve-uploads/RouteVisualiser/` |

## Example

```
> cd ~/workdev/Aurrigo/AutoConnect-MEC-Miki
> /visual-explainer:generate-web-diagram "gRPC migration phases"
# ... generates /tmp/visual-explainer/grpc-migration.html

> /visual-explainer:share
Detected repo: AutoConnect-MEC-Miki
Uploaded: AutoConnect-MEC-Miki/grpc-migration.html
URL: http://192.168.1.29:8081/AutoConnect-MEC-Miki/grpc-migration.html
```
