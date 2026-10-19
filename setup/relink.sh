#!/bin/bash
# One-shot repair for vault skill symlinks after the skills/ regroup.
#
# The Obsidian vault stores each skill as a symlink at
# 000-System/Skills/<name>, pointing (relative path) at
# agenKic-hub/skills/<name>. The regroup moves every skill under
# agenKic-hub/skills/<group>/<name>, so each old symlink now points at a
# path that no longer exists. This script finds every symlink under the
# vault Skills directory that still targets the old flat path for a skill
# this repo owns, and repoints it at the new group path.
#
# ~/.claude/skills is itself a single symlink to the vault Skills
# directory, so repairing the vault symlinks repairs both sides at once.
#
# Pass --sweep to run a second repair instead. The sweep looks for links
# under the harness config directories ($HOME/.claude, $HOME/.claude-aurrigo,
# $HOME/.codex and $HOME/.config/opencode). It repoints a link when its
# target holds the old repo name agenKic-sKills, or when the link is dangling
# and points into agenKic-hub. The new target must exist.
set -u

DRY_RUN=0
SWEEP=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --sweep) SWEEP=1 ;;
        -h|--help)
            echo "usage: relink.sh [--sweep] [--dry-run]"
            exit 0
            ;;
        *)
            echo "unknown flag: $arg" >&2
            exit 1
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_NAME="$(basename "$REPO_DIR")"
log() { printf '%s\n' "$*"; }

# Find where a repo-owned entry lives now. Skills sit under skills/<group>/<name>
# and workflows sit directly under workflows/. Prints the path, or nothing.
locate_in_repo() {
    local base="$1" cand
    for cand in "$REPO_DIR"/skills/*/"$base" "$REPO_DIR/workflows/$base"; do
        if [ -e "$cand" ]; then printf '%s' "$cand"; return 0; fi
    done
    return 1
}

# Repoint stale links under the harness config directories.
sweep_links() {
    local root link cur new base fixed=0 skipped=0 check
    for root in "$HOME/.claude" "$HOME/.claude-aurrigo" "$HOME/.codex" "$HOME/.config/opencode"; do
        [ -e "$root" ] || continue
        # -H follows a symlinked root, such as ~/.claude. Depth 3 keeps the walk small.
        while IFS= read -r link; do
            [ -n "$link" ] || continue
            cur="$(readlink "$link")"
            case "$cur" in
                *agenKic-sKills*) ;;
                *agenKic-hub*) [ -e "$link" ] && continue ;;   # ours and healthy
                *)
                    if [ ! -e "$link" ]; then
                        log "skip: dangling link not owned by this repo: $link -> $cur"
                        skipped=$((skipped + 1))
                    fi
                    continue
                    ;;
            esac
            new="${cur//agenKic-sKills/agenKic-hub}"
            case "$new" in /*) check="$new" ;; *) check="$(dirname "$link")/$new" ;; esac
            if [ ! -e "$check" ]; then
                base="$(basename "$cur")"
                new="$(locate_in_repo "$base")" || new=""
            fi
            if [ -z "$new" ] || [ ! -e "$new" ]; then
                log "skip: no target found in $REPO_DIR for $link -> $cur"
                skipped=$((skipped + 1))
                continue
            fi
            if [ "$new" = "$cur" ]; then continue; fi
            log "sweep: $link"
            log "  from: $cur"
            log "  to:   $new"
            if [ "$DRY_RUN" = 1 ]; then
                log "  [dry] would run: ln -sfn $new $link"
                fixed=$((fixed + 1))
            elif ln -sfn "$new" "$link"; then
                fixed=$((fixed + 1))
            else
                log "  warning: could not repoint $link"
                skipped=$((skipped + 1))
            fi
        done <<EOF
$(find -H "$root" -maxdepth 3 -type l 2>/dev/null)
EOF
    done
    if [ "$DRY_RUN" = 1 ]; then
        log "sweep finished (dry run): $fixed would be repointed, $skipped skipped"
    else
        log "sweep finished: $fixed repointed, $skipped skipped"
    fi
}

if [ "$SWEEP" = 1 ]; then
    sweep_links
    exit 0
fi

# The vault root is not hardcoded. The VAULT_SKILLS env var overrides.
# Without an override, the script uses the repo parent when the repo sits
# inside a vault Skills directory, and exits with guidance otherwise.
if [ -z "${VAULT_SKILLS:-}" ]; then
    parent="$(dirname "$REPO_DIR")"
    case "$(basename "$parent")" in
      Skills|skills) VAULT_SKILLS="$parent" ;;
      *)
        log "cannot locate the vault Skills directory from $REPO_DIR"
        log "set VAULT_SKILLS=/path/to/vault/000-System/Skills and rerun"
        exit 1
        ;;
    esac
fi

# A relative target only resolves when the repo is a direct child of
# VAULT_SKILLS. Fall back to the absolute repo path otherwise.
if [ "$(dirname "$REPO_DIR")" = "$VAULT_SKILLS" ]; then
    TARGET_BASE="$REPO_NAME"
else
    TARGET_BASE="$REPO_DIR"
fi

if [ ! -d "$VAULT_SKILLS" ]; then
    log "vault Skills directory not found, nothing to do: $VAULT_SKILLS"
    exit 0
fi

if [ ! -d "$REPO_DIR/skills" ]; then
    log "repo skills directory not found: $REPO_DIR/skills"
    exit 1
fi

any=0
for group_dir in "$REPO_DIR"/skills/*/; do
    [ -d "$group_dir" ] || continue
    group="$(basename "$group_dir")"
    for skill_dir in "$group_dir"*/; do
        [ -d "$skill_dir" ] || continue
        name="$(basename "$skill_dir")"
        new_target="$TARGET_BASE/skills/$group/$name"
        link_path="$VAULT_SKILLS/$name"

        if [ -L "$link_path" ]; then
            current_target="$(readlink "$link_path")"
            if [ "$current_target" = "$new_target" ]; then
                continue
            fi
            any=1
            log "relink: $name"
            log "  from: $current_target"
            log "  to:   $new_target"
            if [ "$DRY_RUN" = 1 ]; then
                log "  [dry] would run: ln -sfn $new_target $link_path"
            else
                ln -sfn "$new_target" "$link_path"
                [ -e "$link_path" ] || log "  warning: $name still does not resolve"
            fi
        elif [ -e "$link_path" ]; then
            log "skip: $name exists and is not a symlink, leaving it alone"
        else
            any=1
            log "create: $name -> $new_target"
            if [ "$DRY_RUN" = 1 ]; then
                log "  [dry] would run: ln -sn $new_target $link_path"
            else
                ln -sn "$new_target" "$link_path"
                [ -e "$link_path" ] || log "  warning: $name still does not resolve"
            fi
        fi
    done
done

if [ "$any" = 0 ]; then
    log "nothing to relink, every skill symlink already resolves"
fi

log ""
log "done."
