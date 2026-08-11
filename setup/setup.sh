#!/usr/bin/env bash
# agentic-hub installer. Linux, macOS, and Git Bash on Windows.
# Usage: ./setup.sh [--profile answers.yml] [--dry-run]
# Bash 3.2 compatible. No associative arrays, no readlink -f.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPONENTS_DIR="$SCRIPT_DIR/components"
EXAMPLE_ANSWERS="$SCRIPT_DIR/answers.example.yml"
ANSWERS_TMP="$(mktemp)"
DRY_RUN=0
PROFILE=""
trap 'rm -f "$ANSWERS_TMP"' EXIT

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

is_windows() {
    case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac
}

# Expand a leading ~ to $HOME. Targets in manifests use ~ for portability.
expand_home() {
    case "$1" in
        "~") printf '%s' "$HOME" ;;
        "~/"*) printf '%s' "$HOME/${1#\~/}" ;;
        *) printf '%s' "$1" ;;
    esac
}

# Parse a flat "key: value" file into "key=value" lines in ANSWERS_TMP.
load_answers() {
    [ -f "$1" ] || die "profile not found: $1"
    sed -n 's/^[[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)[[:space:]]*:[[:space:]]*\(.*\)$/\1=\2/p' "$1" \
        | sed 's/[[:space:]]*$//; s/^\([^=]*\)="\(.*\)"$/\1=\2/' > "$ANSWERS_TMP"
}

get_answer() {
    sed -n "s/^$1=//p" "$ANSWERS_TMP" | head -n 1
}

# Move a real file or directory aside before we replace it. Links get removed,
# never backed up, because we can recreate them.
backup_if_real() {
    local path="$1"
    if [ -L "$path" ]; then
        [ "$DRY_RUN" = 1 ] && { log "  [dry] remove link $path"; return; }
        rm -f "$path"
    elif [ -e "$path" ]; then
        [ "$DRY_RUN" = 1 ] && { log "  [dry] backup $path -> $path.bak"; return; }
        rm -rf "$path.bak" 2>/dev/null
        mv "$path" "$path.bak"
        log "  backed up $path -> $path.bak"
    fi
}

# Create a symlink. On Windows, fall back to a junction for a directory or a
# copy for a file when symlink creation fails (needs Developer Mode or admin).
make_link() {
    local src="$1" dst="$2"
    backup_if_real "$dst"
    [ "$DRY_RUN" = 1 ] && { log "  [dry] link $dst -> $src"; return; }
    mkdir -p "$(dirname "$dst")"
    if is_windows; then
        # nativestrict makes ln -s create a real Windows symlink or fail.
        if MSYS=winsymlinks:nativestrict ln -s "$src" "$dst" 2>/dev/null; then
            log "  link $dst -> $src"
        elif [ -d "$src" ]; then
            local wsrc wdst
            wsrc="$(cygpath -w "$src")"; wdst="$(cygpath -w "$dst")"
            cmd //c mklink //J "$wdst" "$wsrc" >/dev/null 2>&1 \
                && log "  junction (fallback) $dst -> $src" \
                || die "junction failed for $dst"
        else
            cp "$src" "$dst" && log "  copy (fallback) $dst"
        fi
    else
        ln -s "$src" "$dst" && log "  link $dst -> $src"
    fi
}

# Substitute {{key}} placeholders from the answers file into dst.
render_template() {
    local src="$1" dst="$2" sedfile tmp
    sedfile="$(mktemp)"; tmp="$(mktemp)"
    while IFS='=' read -r k v; do
        [ -n "$k" ] || continue
        # | is the sed delimiter, so strip it from values for safety.
        v="$(printf '%s' "$v" | tr -d '|')"
        printf 's|{{%s}}|%s|g\n' "$k" "$v" >> "$sedfile"
    done < "$ANSWERS_TMP"
    sed -f "$sedfile" "$src" > "$tmp"
    backup_if_real "$dst"
    if [ "$DRY_RUN" = 1 ]; then log "  [dry] render $dst"; else
        mkdir -p "$(dirname "$dst")"
        mv "$tmp" "$dst"
        log "  rendered $dst"
    fi
    rm -f "$sedfile" "$tmp" 2>/dev/null
}

install_file() {
    local src="$1" dst="$2"
    case "$src" in
        *.tmpl) render_template "$src" "${dst%.tmpl}" ;;
        *)
            backup_if_real "$dst"
            [ "$DRY_RUN" = 1 ] && { log "  [dry] copy $dst"; return; }
            mkdir -p "$(dirname "$dst")"
            cp "$src" "$dst" && log "  copy $dst"
            ;;
    esac
}

read_manifest_key() {
    sed -n "s/^$2=//p" "$1" | head -n 1
}

# Install one component from its manifest file.
run_component() {
    local conf="$1" name type source target src_dir tgt_dir
    name="$(read_manifest_key "$conf" name)"
    type="$(read_manifest_key "$conf" type)"
    source="$(read_manifest_key "$conf" source)"
    target="$(read_manifest_key "$conf" target)"
    src_dir="$REPO_DIR/$source"
    tgt_dir="$(expand_home "$target")"
    log "== $name"
    [ -d "$src_dir" ] || { log "  source missing, skipped: $source"; return; }
    if [ "$type" = "link_children" ]; then
        local child found=0
        for child in "$src_dir"/*; do
            [ -e "$child" ] || continue
            found=1
            make_link "$child" "$tgt_dir/$(basename "$child")"
        done
        [ "$found" = 1 ] || log "  nothing to link in $source"
    else
        # install type: copy or render every file except README.md.
        local f rel any=0
        while IFS= read -r f; do
            [ -n "$f" ] || continue
            any=1
            rel="${f#"$src_dir"/}"
            install_file "$f" "$tgt_dir/$rel"
        done <<EOF
$(find "$src_dir" -type f ! -name README.md 2>/dev/null)
EOF
        [ "$any" = 1 ] || log "  nothing installable yet (scaffold), skipped"
    fi
}

list_components() {
    local c
    for c in "$COMPONENTS_DIR"/*.conf; do
        read_manifest_key "$c" name
    done
}

# Simple checkbox picker: toggle by number, a = all, empty line = confirm.
pick_components() {
    local names sel i n line
    names="$(list_components)"
    n=$(printf '%s\n' "$names" | wc -l | tr -d ' ')
    sel=""
    while :; do
        i=0
        printf '\nComponents:\n' >&2
        while IFS= read -r line; do
            i=$((i + 1))
            case " $sel " in
                *" $i "*) printf '  [x] %2d) %s\n' "$i" "$line" >&2 ;;
                *)        printf '  [ ] %2d) %s\n' "$i" "$line" >&2 ;;
            esac
        done <<EOF
$names
EOF
        printf 'Toggle number, a = all, enter = confirm: ' >&2
        read -r line || break
        [ -z "$line" ] && break
        if [ "$line" = "a" ]; then
            sel=""; i=0
            while [ "$i" -lt "$n" ]; do i=$((i + 1)); sel="$sel $i"; done
        else
            case " $sel " in
                *" $line "*) sel="$(printf '%s' " $sel " | sed "s/ $line / /")" ;;
                *) sel="$sel $line" ;;
            esac
        fi
    done
    i=0
    while IFS= read -r line; do
        i=$((i + 1))
        case " $sel " in *" $i "*) printf '%s\n' "$line" ;; esac
    done <<EOF
$names
EOF
}

# Prompt for every variable documented in the example answers file.
prompt_variables() {
    local k v ans
    load_answers "$EXAMPLE_ANSWERS"
    grep -v '^components=' "$ANSWERS_TMP" > "$ANSWERS_TMP.vars" || true
    : > "$ANSWERS_TMP"
    while IFS='=' read -r k v; do
        [ -n "$k" ] || continue
        printf '%s [%s]: ' "$k" "$v" >&2
        read -r ans || ans=""
        [ -z "$ans" ] && ans="$v"
        printf '%s=%s\n' "$k" "$ans" >> "$ANSWERS_TMP"
    done < "$ANSWERS_TMP.vars"
    rm -f "$ANSWERS_TMP.vars"
}

main() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --profile) PROFILE="${2:-}"; shift 2 ;;
            --dry-run) DRY_RUN=1; shift ;;
            -h|--help) log "usage: setup.sh [--profile answers.yml] [--dry-run]"; exit 0 ;;
            *) die "unknown flag: $1" ;;
        esac
    done
    local selected c name
    if [ -n "$PROFILE" ]; then
        load_answers "$PROFILE"
        selected="$(get_answer components | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$')"
        [ -n "$selected" ] || die "profile has no components: line"
    else
        selected="$(pick_components)"
        [ -n "$selected" ] || { log "nothing selected, exiting"; exit 0; }
        prompt_variables
    fi
    log ""
    for c in "$COMPONENTS_DIR"/*.conf; do
        name="$(read_manifest_key "$c" name)"
        if printf '%s\n' "$selected" | grep -qx "$name"; then
            run_component "$c"
        fi
    done
    log ""
    log "done."
}

main "$@"
