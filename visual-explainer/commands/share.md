---
name: share
description: Upload a visual-explainer HTML file to the LAN docs server and return a shareable URL.
---

# Share Visual Explainer

Upload a generated HTML file to the AutoConnect docs server for LAN-accessible sharing.

## Usage

```
/visual-explainer:share <file-path>
```

Or after generating a visual explainer:

```
/visual-explainer:share          # shares the most recently generated file
```

## Flags

- `--name <custom-name>` — Override the filename on the server (default: use the source filename)

## Behavior

1. **Locate the file.** If no path is given, find the most recently modified `.html` file in `/tmp/visual-explainer/`.

2. **Upload via SCP.** Transfer the file to the docs server:
   ```bash
   sshpass -f <password-file> scp <file> <server-user>@<lan-host>:~/<docs-dir>/ve-uploads/<filename>
   ```

3. **Return the URL.** Print the shareable LAN URL:
   ```
   http://<lan-host>:8081/ve/<filename>
   ```

4. **Confirm accessibility.** Verify the file is served correctly:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://<lan-host>:8081/ve/<filename>
   ```
   Expect HTTP 200.

## Server Details

- **Host**: `<lan-host>` (SG server, LAN only)
- **Port**: `8081`
- **Upload path**: `~/<docs-dir>/ve-uploads/`
- **Serve path**: `http://<lan-host>:8081/ve/`
- **Auth**: `<server-user>` / `<password>` (via sshpass)
- **Access**: LAN only — not exposed to the internet

## Directory Index

The `/ve/` endpoint has `autoindex on`, so visiting `http://<lan-host>:8081/ve/` shows a browsable list of all uploaded files.

## Example

```
> /visual-explainer:generate-web-diagram "AutoConnect mission lifecycle"
# ... generates /tmp/visual-explainer/mission-lifecycle.html

> /visual-explainer:share
Uploaded: mission-lifecycle.html
URL: http://<lan-host>:8081/ve/mission-lifecycle.html
```
