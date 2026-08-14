---
name: security-scan
description: >
  Audit Claude Code configuration (.claude/ directory) for security vulnerabilities,
  misconfigurations, and injection risks using AgentShield. Checks CLAUDE.md,
  settings.json, MCP servers, hooks, and agent definitions.
  Triggers: "security scan", "scan my claude config", "audit config security",
  "check for vulnerabilities", "/security-scan", "run agentshield".
origin: ECC (adapted)
---

## What It Scans

| File | Checks |
|:---|:---|
| `CLAUDE.md` | Hardcoded secrets, auto-run instructions, prompt injection patterns |
| `settings.json` | Overly permissive allow lists, missing deny lists, dangerous bypass flags |
| `mcp.json` | Risky MCP servers, hardcoded env secrets, npx supply chain risks |
| `hooks/` | Command injection via interpolation, data exfiltration, silent error suppression |
| `agents/*.md` | Unrestricted tool access, prompt injection surface, missing model specs |

## Prerequisites

```bash
# Check if installed
npx ecc-agentshield --version

# Install globally
npm install -g ecc-agentshield
```

## Running the Scan

```bash
# Scan ~/.claude/ (default)
npx ecc-agentshield scan

# Scan a specific path
npx ecc-agentshield scan --path /path/to/.claude

# Only medium severity and above
npx ecc-agentshield scan --min-severity medium

# Output formats
npx ecc-agentshield scan --format json
npx ecc-agentshield scan --format markdown
npx ecc-agentshield scan --format html > security-report.html

# Auto-fix safe issues
npx ecc-agentshield scan --fix

# Opus deep analysis (3-agent red/blue/audit pipeline)
export ANTHROPIC_API_KEY=your-key
npx ecc-agentshield scan --opus --stream
```

## Severity Grades

| Grade | Score | Action |
|:---|:---|:---|
| A | 90-100 | Secure |
| B | 75-89 | Minor issues |
| C | 60-74 | Needs attention |
| D | 40-59 | Significant risks |
| F | 0-39 | Critical vulnerabilities |

## What to Do When Triggered

1. Run `npx ecc-agentshield scan --min-severity medium` against `~/.claude/`
2. Report findings grouped by severity
3. For critical/high: explain the issue and propose a fix
4. For auto-fixable issues: offer to run `--fix`
5. Summarise the final grade and remaining action items
