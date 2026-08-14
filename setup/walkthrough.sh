#!/usr/bin/env bash
# agenKic-hub interactive walkthrough for Linux and macOS.
# Run this after setup/setup.sh. It checks five things a new user needs, and
# it explains each one as it goes. It resumes from the last completed step.
#
# Usage:
#   setup/walkthrough.sh           run or resume the walkthrough
#   setup/walkthrough.sh --reset   clear saved progress, start over
#
# Every check reads setup/components/*.conf, the same manifests setup.sh
# reads. No component name is hardcoded here.
#
# The script prefers gum for prompts. It falls back to plain read and select
# when gum is absent or declined. Windows keeps setup.ps1 and the written
# walkthrough at docs/WALKTHROUGH.md, this script does not target Windows.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPONENTS_DIR="$SCRIPT_DIR/components"
EXAMPLE_ANSWERS="$SCRIPT_DIR/answers.example.yml"
STATE_DIR="$HOME/.cache/agentic-hub"
STATE_FILE="$STATE_DIR/walkthrough-state"
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
TMUX_CONF_TMPL="$REPO_DIR/config/tmux/tmux.conf.tmpl"
SPECS_TODO_DIR="$REPO_DIR/docs/specs/todo"

USE_GUM=0
TAB="$(printf '\t')"

# ---------------------------------------------------------------- presentation

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    C_RESET=$(printf '\033[0m'); C_BOLD=$(printf '\033[1m')
    C_DIM=$(printf '\033[2m');   C_CYAN=$(printf '\033[36m')
    C_GREEN=$(printf '\033[32m'); C_YELLOW=$(printf '\033[33m')
    C_RED=$(printf '\033[31m')
else
    C_RESET=""; C_BOLD=""; C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

log()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '  %s%s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn() { printf '  %s%s%s\n' "$C_YELLOW" "$*" "$C_RESET"; }
die()  { printf '%serror:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

banner() {
    printf '%s\n' "$C_CYAN$C_BOLD"
    printf '  agenKic-hub walkthrough\n'
    printf '%s' "$C_RESET"
    printf '%s  Five checks that take you from a fresh install to a first skill run.%s\n\n' \
        "$C_DIM" "$C_RESET"
}

step_header() {
    printf '\n%s[%s] %s%s\n' "$C_BOLD$C_CYAN" "$1" "$2" "$C_RESET"
}

# --------------------------------------------------------------------- prompts
#
# Every prompt goes through one of these three wrapper functions, so the gum
# path and the plain path share one call site each. A caller never invokes
# gum or read directly.

# confirm_prompt "question" "y|n" -> return 0 for yes, 1 for no
confirm_prompt() {
    local prompt="$1" default="${2:-y}" reply
    if [ "$USE_GUM" = 1 ]; then
        if [ "$default" = "y" ]; then
            gum confirm "$prompt" && return 0 || return 1
        else
            gum confirm --default=false "$prompt" && return 0 || return 1
        fi
    fi
    printf '  %s [%s]: ' "$prompt" "$default" >&2
    read -r reply || reply=""
    [ -z "$reply" ] && reply="$default"
    case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# choose_prompt "prompt" "opt1" "opt2" ... -> prints the chosen option
choose_prompt() {
    local prompt="$1"; shift
    if [ "$USE_GUM" = 1 ]; then
        gum choose --header="$prompt" "$@"
        return
    fi
    local opt i=0 reply
    printf '  %s\n' "$prompt" >&2
    for opt in "$@"; do
        i=$((i + 1))
        printf '    %d) %s\n' "$i" "$opt" >&2
    done
    printf '  Selection: ' >&2
    read -r reply || reply=""
    i=0
    for opt in "$@"; do
        i=$((i + 1))
        [ "$reply" = "$i" ] && { printf '%s' "$opt"; return; }
    done
    printf '%s' "$1"
}

# pause_prompt "message" waits for the user to acknowledge, no branch taken
pause_prompt() {
    local prompt="$1"
    if [ "$USE_GUM" = 1 ]; then
        gum confirm "$prompt" --affirmative="Continue" --negative="Continue" >/dev/null 2>&1
        return
    fi
    printf '  %s [press enter]: ' "$prompt" >&2
    read -r _ || true
}

detect_gum() {
    command -v gum >/dev/null 2>&1 && { USE_GUM=1; return; }
    USE_GUM=0
    offer_gum_install
}

offer_gum_install() {
    warn "gum is not installed. gum gives this walkthrough nicer prompts."
    if ! confirm_prompt "Install gum now?" y; then
        info "Continuing with plain prompts."
        return
    fi
    local installed=1
    if command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm gum && installed=0
    elif command -v brew >/dev/null 2>&1; then
        brew install gum && installed=0
    elif command -v apt >/dev/null 2>&1; then
        install_gum_apt && installed=0
    else
        warn "No known package manager found (pacman, brew, apt)."
    fi
    if [ "$installed" = 0 ] && command -v gum >/dev/null 2>&1; then
        USE_GUM=1
        ok "gum installed."
    else
        warn "gum install did not complete. Continuing with plain prompts."
    fi
}

# apt has no first-party gum package, Charm ships its own repository.
install_gum_apt() {
    sudo mkdir -p /etc/apt/keyrings || return 1
    curl -fsSL https://repo.charm.sh/apt/gpg.key \
        | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg 2>/dev/null || return 1
    echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" \
        | sudo tee /etc/apt/sources.list.d/charm.list >/dev/null || return 1
    sudo apt update && sudo apt install -y gum
}

# ------------------------------------------------------------------ state file

step_done() {
    [ -f "$STATE_FILE" ] || return 1
    grep -qx "$1" "$STATE_FILE" 2>/dev/null
}

mark_step_done() {
    step_done "$1" && return
    mkdir -p "$STATE_DIR"
    printf '%s\n' "$1" >> "$STATE_FILE"
}

reset_state() {
    rm -f "$STATE_FILE"
    ok "Cleared saved progress at $STATE_FILE."
}

# ---------------------------------------------------------------- step helpers

# List component names by reading setup/components/*.conf, the same manifest
# files setup.sh reads. This avoids hardcoding component names here.
component_names() {
    local c
    for c in "$COMPONENTS_DIR"/*.conf; do
        [ -f "$c" ] || continue
        sed -n 's/^name=//p' "$c" | head -n 1
    done
}

component_field() {
    local name="$1" key="$2" c
    for c in "$COMPONENTS_DIR"/*.conf; do
        [ -f "$c" ] || continue
        [ "$(sed -n 's/^name=//p' "$c" | head -n 1)" = "$name" ] || continue
        sed -n "s/^$key=//p" "$c" | head -n 1
        return
    done
}

# Expand a leading tilde in a manifest target the same way setup.sh does.
expand_manifest_target() {
    local target="$1"
    # shellcheck disable=SC2088  # The tilde is a case pattern, not a path.
    case "$target" in
        "~")   printf '%s' "$HOME" ;;
        "~/"*) printf '%s' "$HOME/${target#\~/}" ;;
        *)     printf '%s' "$target" ;;
    esac
}

# Run setup.sh for one or more components. setup.sh takes a profile file, not
# a component flag, so this writes a throwaway profile that keeps the example
# variable values and overrides only the components line.
run_setup_for() {
    local list="$1" tmp
    tmp="$(mktemp)" || { warn "mktemp failed, run setup/setup.sh yourself."; return 1; }
    {
        printf 'components: %s\n' "$list"
        grep -v '^[[:space:]]*components[[:space:]]*:' "$EXAMPLE_ANSWERS"
    } > "$tmp"
    info "Running setup.sh for: $list"
    bash "$SCRIPT_DIR/setup.sh" --profile "$tmp"
    local rc=$?
    rm -f "$tmp"
    return $rc
}

# List every artifact setup.sh creates for one local component, one per line
# as "kind<TAB>expected_path<TAB>source_path". kind is "link" for a
# link_children component (setup.sh symlinks each child of source into
# target) or "file" for an install component (setup.sh renders .tmpl files
# and copies the rest into target, mirroring the source tree). Reads the same
# manifest fields setup.sh reads, so no component name is hardcoded.
component_expected_paths() {
    local name="$1" type source target src_dir tgt_dir child rel f
    type="$(component_field "$name" type)"
    source="$(component_field "$name" source)"
    target="$(component_field "$name" target)"
    [ -n "$source" ] && [ -n "$target" ] || return
    src_dir="$REPO_DIR/$source"
    tgt_dir="$(expand_manifest_target "$target")"
    [ -d "$src_dir" ] || return
    if [ "$type" = "link_children" ]; then
        for child in "$src_dir"/*; do
            [ -e "$child" ] || continue
            case "$(basename "$child")" in README.md|.gitkeep) continue ;; esac
            printf 'link\t%s\t%s\n' "$tgt_dir/$(basename "$child")" "$child"
        done
        return
    fi
    while IFS= read -r f; do
        [ -n "$f" ] || continue
        rel="${f#"$src_dir"/}"
        case "$rel" in *.tmpl) rel="${rel%.tmpl}" ;; esac
        printf 'file\t%s\t%s\n' "$tgt_dir/$rel" "$f"
    done <<EOF
$(find "$src_dir" -type f ! -name README.md ! -name .gitkeep 2>/dev/null | sort)
EOF
}

# Print a found/missing/wrong-target line for every artifact one component
# declares, then return 0 only when every artifact matches what setup.sh
# would have produced. A "link" artifact must be a symlink whose target
# resolves inside this repo checkout, not merely present.
component_report() {
    local name="$1" kind path src link_target any=0 bad=0
    # shellcheck disable=SC2034  # src carries the manifest source, unused here.
    while IFS="$TAB" read -r kind path src; do
        [ -n "$path" ] || continue
        any=1
        if [ "$kind" = "link" ]; then
            if [ -L "$path" ]; then
                link_target="$(readlink "$path" 2>/dev/null)"
                case "$link_target" in
                    "$REPO_DIR"/*)
                        info "  found: $path -> $link_target" ;;
                    *)
                        warn "  wrong target: $path -> $link_target (expected inside $REPO_DIR)"
                        bad=$((bad + 1)) ;;
                esac
            elif [ -e "$path" ]; then
                warn "  wrong target: $path exists but is not a symlink"
                bad=$((bad + 1))
            else
                warn "  missing: $path"
                bad=$((bad + 1))
            fi
        else
            if [ -f "$path" ]; then
                info "  found: $path"
            else
                warn "  missing: $path"
                bad=$((bad + 1))
            fi
        fi
    done < <(component_expected_paths "$name")

    if [ "$any" = 0 ]; then
        return 2
    fi
    [ "$bad" = 0 ]
}

# A local component counts as checkable when its manifest declares at least
# one artifact. An empty harness scaffold declares none, so step 1 skips it.
component_is_checkable() {
    [ -n "$(component_expected_paths "$1" | head -n 1)" ]
}

# ---------------------------------------------------------------------- step 1

step1_symlinks() {
    step_header 1 "Verify the setup.sh install"
    info "setup.sh links or renders each component under setup/components/"
    info "into your config directories. This checks every component that"
    info "carries files today. Empty harness scaffolds stay out of the check."

    local name type missing="" checked=""
    for name in $(component_names); do
        type="$(component_field "$name" type)"
        [ "$type" = "external" ] && continue
        component_is_checkable "$name" || continue
        checked="$checked $name"
        printf '\n  %s%s%s -> %s\n' "$C_BOLD" "$name" "$C_RESET" "$(component_field "$name" target)"
        if component_report "$name"; then
            ok "component ok: $name"
        else
            warn "component incomplete: $name"
            missing="$missing $name"
        fi
    done

    if [ -z "$checked" ]; then
        warn "No component declares any artifact. Check setup/components/."
        return 1
    fi

    if [ -z "$missing" ]; then
        ok "All installable components are in place."
        mark_step_done step1
        return 0
    fi

    warn "These components are incomplete:$missing"
    info "Install everything, or install only the missing components."
    local answer
    answer="$(choose_prompt "What do you want to run?" \
        "Install the missing components" \
        "Run the full setup.sh picker" \
        "Skip for now")"
    case "$answer" in
        "Install the missing components")
            run_setup_for "$(printf '%s' "$missing" | sed 's/^ *//; s/ /, /g')" ;;
        "Run the full setup.sh picker")
            bash "$SCRIPT_DIR/setup.sh" ;;
        *)
            info "Skipping. Run setup/setup.sh yourself, then re-run this walkthrough."
            return 1 ;;
    esac

    info "Re-checking..."
    missing=""
    for name in $checked; do
        component_report "$name" >/dev/null || missing="$missing $name"
    done
    if [ -z "$missing" ]; then
        ok "All installable components are in place."
        mark_step_done step1
        return 0
    fi
    warn "Still incomplete:$missing"
    return 1
}

# ---------------------------------------------------------------------- step 2

# Read the prefix binding out of the template, so the text matches the config.
tmux_prefix_key() {
    local raw
    [ -f "$TMUX_CONF_TMPL" ] || { printf 'Ctrl+b'; return; }
    raw="$(sed -n 's/^set -g prefix[[:space:]]*//p' "$TMUX_CONF_TMPL" | head -n 1)"
    case "$raw" in
        "")      printf 'Ctrl+b' ;;
        C-Space) printf 'Ctrl+Space' ;;
        C-*)     printf 'Ctrl+%s' "${raw#C-}" ;;
        *)       printf '%s' "$raw" ;;
    esac
}

step2_tmux() {
    step_header 2 "Verify the hub tmux config"
    local target prefix
    target="$(expand_manifest_target "$(component_field config-tmux target)")/tmux.conf"
    prefix="$(tmux_prefix_key)"

    command -v tmux >/dev/null 2>&1 || { warn "tmux is not installed. Install tmux first."; return 1; }

    if [ ! -f "$target" ]; then
        warn "No tmux config found at $target."
        if confirm_prompt "Run the config-tmux component through setup.sh now?" y; then
            run_setup_for config-tmux
        fi
    fi

    if [ -f "$target" ]; then
        ok "found tmux config at $target"
    else
        warn "Still no tmux config at $target. Skipping the demo session."
        return 1
    fi

    info "The hub prefix key is $prefix. Press it, then d, to detach from a"
    info "session without ending it. The session keeps running in the"
    info "background, so an agent working inside it survives a disconnect."
    info "Press $prefix then Space to open the command palette."

    if confirm_prompt "Start a demo tmux session to practice attach and detach?" y; then
        info "Starting session 'hub-demo'. Press $prefix then d to detach."
        info "Run 'tmux attach -t hub-demo' afterward to reattach."
        pause_prompt "Ready"
        tmux -f "$target" new-session -s hub-demo || warn "tmux session ended or failed to start."
        if tmux has-session -t hub-demo 2>/dev/null; then
            ok "Session 'hub-demo' is still running. You detached correctly."
            if confirm_prompt "Reattach now to confirm, then kill the demo session?" y; then
                tmux -f "$target" attach -t hub-demo
            fi
            tmux kill-session -t hub-demo 2>/dev/null
        fi
    fi

    mark_step_done step2
    return 0
}

# ---------------------------------------------------------------------- step 3

# The statusline is an external component. canon ships a pointer README only,
# the real renderer comes from the sibling repo the ext-statusline manifest
# names. This step reads that manifest, it hardcodes no repo and no path.
step3_statusline() {
    step_header 3 "Verify the statusline"
    local ext=ext-statusline repo clone_to dest run settings
    settings="$CLAUDE_CONFIG_DIR/settings.json"
    repo="$(component_field "$ext" repo)"
    clone_to="$(component_field "$ext" clone_to)"
    run="$(component_field "$ext" run)"

    if [ -z "$clone_to" ]; then
        warn "No $ext manifest found under setup/components/. Skipping."
        return 1
    fi
    dest="$(expand_manifest_target "$clone_to")"

    if [ ! -d "$dest" ]; then
        warn "The statusline is not installed. Nothing at $dest."
        info "canon does not ship the statusline itself. The $ext component"
        info "clones $repo and runs its own installer."
        if confirm_prompt "Install $ext now?" y; then
            run_setup_for "$ext"
        else
            info "Skipping the statusline. Run: bash setup/setup.sh, then pick $ext."
            info "The rest of the hub works without it."
            mark_step_done step3
            return 0
        fi
    fi

    if [ -d "$dest" ]; then
        ok "found the statusline checkout at $dest"
    else
        warn "Still nothing at $dest. Skipping the wiring check."
        info "Install it later with setup/setup.sh, then re-run this walkthrough."
        mark_step_done step3
        return 0
    fi

    if [ -f "$settings" ] && grep -q '"statusLine"' "$settings" 2>/dev/null; then
        ok "settings.json already points at the statusline"
    else
        warn "settings.json does not reference the statusline yet."
        if [ -n "$run" ] && [ -f "$dest/$run" ]; then
            info "Run: cd $dest && sh $run"
            if confirm_prompt "Run it now?" y; then
                ( cd "$dest" && bash "$run" ) \
                    || warn "$run reported a problem. Check the output above."
            fi
        else
            info "Read $dest/README.md for the wiring step."
        fi
    fi

    info "The statusline renders your model, usage, context budget, and git"
    info "state above the prompt. Restart Claude Code to see it."

    mark_step_done step3
    return 0
}

# ---------------------------------------------------------------------- step 4

step4_first_spec() {
    step_header 4 "Run your first skill"
    info "Open Claude Code in this repo and complete one skill run."
    info "The guided example is the spec pair:"
    info "  /brainstorm      talk through the idea, answer the questions"
    info "  /feature-spec    turn the brainstorm into a spec file"
    info "The spec lands under docs/specs/todo/ in this repo."
    info "Any other completed skill run also counts."

    mkdir -p "$SPECS_TODO_DIR"
    local before after new
    before="$(find "$SPECS_TODO_DIR" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort)"

    pause_prompt "Come back here once /feature-spec finishes"

    after="$(find "$SPECS_TODO_DIR" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort)"
    new="$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") 2>/dev/null)"

    if [ -n "$new" ]; then
        ok "found a new spec file:"
        printf '%s\n' "$new" | while IFS= read -r f; do [ -n "$f" ] && info "$f"; done
        mark_step_done step4
        return 0
    fi

    warn "No new file appeared under docs/specs/todo/."
    if confirm_prompt "Confirm a skill run completed (any skill counts), and move on?" n; then
        mark_step_done step4
        return 0
    fi
    info "Complete one skill run, then re-run this walkthrough."
    return 1
}

# ---------------------------------------------------------------------- step 5

step5_self_check() {
    step_header 5 "Cold-start self-check"
    info "This mirrors the success condition for onboarding. Confirm each line."

    local checks=(
        "The hub is installed (setup/setup.sh ran without error)"
        "At least one skill group is linked into your skills directory"
        "You attached and detached a tmux session"
        "The statusline renders, or you chose to skip it"
        "A skill run completed (the guided example lands a spec in docs/specs/todo/)"
    )
    local c all_yes=1
    for c in "${checks[@]}"; do
        confirm_prompt "$c?" y || all_yes=0
    done

    if [ "$all_yes" = 1 ]; then
        ok "Cold-start check passed. You are set up."
        mark_step_done step5
        return 0
    fi
    warn "Not every check passed. Revisit the step above that failed, then re-run."
    return 1
}

# --------------------------------------------------------------------- driver

usage() {
    cat <<'USAGE'
agenKic-hub walkthrough

usage: setup/walkthrough.sh [options]

  --reset      clear saved progress, start the walkthrough over
  -h, --help   print this help
USAGE
}

main() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --reset) reset_state; shift ;;
            -h|--help) usage; exit 0 ;;
            *) die "unknown flag: $1" ;;
        esac
    done

    banner
    detect_gum

    local fn_list=(step1_symlinks step2_tmux step3_statusline step4_first_spec step5_self_check)
    local mark_list=(step1 step2 step3 step4 step5)
    local fn mark i=0

    while [ "$i" -lt "${#fn_list[@]}" ]; do
        fn="${fn_list[$i]}"
        mark="${mark_list[$i]}"
        i=$((i + 1))
        if step_done "$mark"; then
            ok "[skip] $mark already done"
            continue
        fi
        if ! "$fn"; then
            warn "Stopped at $mark. Re-run setup/walkthrough.sh to resume here."
            exit 1
        fi
    done

    log ""
    printf '%sWalkthrough complete. You are ready for the next tier in%s\n' "$C_GREEN" "$C_RESET"
    printf '%sdocs/WALKTHROUGH.md.%s\n' "$C_GREEN" "$C_RESET"
}

main "$@"
