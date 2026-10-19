#!/usr/bin/env bash
# agentic-hub installer. Linux, macOS, and Git Bash on Windows.
# Usage: ./setup.sh [--profile answers.yml] [--dry-run] [--force]
# Exits non-zero when any step fails.
# Bash 3.2 compatible. No associative arrays, no readlink -f.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPONENTS_DIR="$SCRIPT_DIR/components"
EXAMPLE_ANSWERS="$SCRIPT_DIR/answers.example.yml"
ANSWERS_TMP="$(mktemp)"
REPO_REAL="$(cd "$REPO_DIR" && pwd -P)"
DRY_RUN=0
FORCE=0
FAILURES=0
PROFILE=""
trap 'rm -f "$ANSWERS_TMP"' EXIT

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

is_windows() {
    case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac
}

# Expand a leading ~ to $HOME. Targets in manifests use ~ for portability.
expand_home() {
    # shellcheck disable=SC2088  # The tilde is a case pattern, not a path.
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

# Count a failure and keep going. main() exits non-zero at the end when any failed.
fail() {
    log "  FAILED: $*"
    FAILURES=$((FAILURES + 1))
}

# Print an unused backup name. The first backup is <path>.bak. When that name is
# taken, use <path>.bak.<YYYYmmddHHMMSS>. An older backup is never overwritten.
backup_name() {
    local path="$1" cand ts n
    cand="$path.bak"
    if [ ! -e "$cand" ] && [ ! -L "$cand" ]; then printf '%s' "$cand"; return; fi
    ts="$(date +%Y%m%d%H%M%S)"
    cand="$path.bak.$ts"
    n=0
    while [ -e "$cand" ] || [ -L "$cand" ]; do
        n=$((n + 1))
        cand="$path.bak.$ts.$n"
    done
    printf '%s' "$cand"
}

# Move a real file or directory aside. Returns 1 when the move fails.
do_backup() {
    local path="$1" to
    to="$(backup_name "$path")"
    if [ "$DRY_RUN" = 1 ]; then log "  [dry] backup $path -> $to"; return 0; fi
    if mv "$path" "$to"; then
        log "  backed up $path -> $to"
    else
        fail "cannot back up $path"
        return 1
    fi
}

# True when two files, or two directory trees, hold the same bytes.
same_content() {
    if [ -d "$1" ] && [ -d "$2" ]; then
        diff -rq "$1" "$2" >/dev/null 2>&1
    elif [ -f "$1" ] && [ -f "$2" ]; then
        cmp -s "$1" "$2"
    else
        return 1
    fi
}

# Print the absolute, physical path that a symlink points at. A dangling link
# prints its target as written, made absolute.
link_dest_abs() {
    local link="$1" t d
    t="$(readlink "$link")"
    case "$t" in /*) ;; *) t="$(dirname "$link")/$t" ;; esac
    d="$(dirname "$t")"
    if [ -d "$d" ]; then
        printf '%s/%s' "$(cd "$d" && pwd -P)" "$(basename "$t")"
    else
        printf '%s' "$t"
    fi
}

# Decide what to do with whatever sits at dst before we write src there.
# Returns 0 when the caller may write. Returns 1 when the caller must skip,
# because the target is already right, is a foreign link, or is a real
# directory that differs from src.
clear_target() {
    local src="$1" dst="$2" cur abs
    if [ -L "$dst" ]; then
        cur="$(readlink "$dst")"
        if [ ! -e "$dst" ]; then
            log "  dangling link $dst -> $cur, replacing"
        elif [ "$cur" = "$src" ]; then
            log "  link already correct: $dst"
            return 1
        else
            abs="$(link_dest_abs "$dst")"
            case "$abs" in
                "$REPO_REAL"/*) ;;
                *)
                    if [ "$FORCE" = 1 ]; then
                        log "  --force: replacing link $dst (old target: $cur)"
                    else
                        log "  skip: $dst is a link to $cur, outside this repo. Use --force to replace it"
                        return 1
                    fi
                    ;;
            esac
        fi
        if [ "$DRY_RUN" = 1 ]; then log "  [dry] remove link $dst"; return 0; fi
        rm -f "$dst" || { fail "cannot remove link $dst"; return 1; }
        return 0
    fi
    if [ -d "$dst" ]; then
        if same_content "$src" "$dst"; then
            if [ "$DRY_RUN" = 1 ]; then log "  [dry] remove identical directory $dst"; return 0; fi
            rm -rf "$dst" || { fail "cannot remove $dst"; return 1; }
            log "  removed directory $dst (identical to the repo copy)"
            return 0
        fi
        if [ "$FORCE" = 1 ]; then
            do_backup "$dst" || return 1
            return 0
        fi
        log "  differs, merge by hand: $dst is a real directory that differs from $src. Use --force to back it up and replace it"
        return 1
    fi
    if [ -e "$dst" ]; then
        if same_content "$src" "$dst"; then
            if [ "$DRY_RUN" = 1 ]; then log "  [dry] replace identical file $dst"; return 0; fi
            rm -f "$dst" || { fail "cannot remove $dst"; return 1; }
            return 0
        fi
        do_backup "$dst" || return 1
    fi
    return 0
}

# Create a symlink. On Windows, fall back to a junction for a directory or a
# copy for a file when symlink creation fails (needs Developer Mode or admin).
make_link() {
    local src="$1" dst="$2"
    clear_target "$src" "$dst" || return 0
    [ "$DRY_RUN" = 1 ] && { log "  [dry] link $dst -> $src"; return 0; }
    mkdir -p "$(dirname "$dst")" || { fail "cannot create directory $(dirname "$dst")"; return 0; }
    if is_windows; then
        # nativestrict makes ln -s create a real Windows symlink or fail.
        if MSYS=winsymlinks:nativestrict ln -s "$src" "$dst" 2>/dev/null; then
            log "  link $dst -> $src"
        elif [ -d "$src" ]; then
            local wsrc wdst
            wsrc="$(cygpath -w "$src")"; wdst="$(cygpath -w "$dst")"
            if cmd //c mklink //J "$wdst" "$wsrc" >/dev/null 2>&1; then
                log "  junction (fallback) $dst -> $src"
            else
                fail "junction failed for $dst"
            fi
        else
            if cp "$src" "$dst"; then log "  copy (fallback) $dst"; else fail "copy failed for $dst"; fi
        fi
    else
        if ln -s "$src" "$dst"; then
            log "  link $dst -> $src"
        else
            fail "ln -s failed: $dst -> $src"
        fi
    fi
}

# Escape a value for the replacement side of a sed s||| command.
# Backslash and ampersand are special in a replacement. The pipe is our delimiter.
sed_escape() {
    printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

# Substitute {{key}} placeholders from the answers file into dst.
# Fails, and writes nothing, when a placeholder has no answer.
render_template() {
    local src="$1" dst="$2" sedfile tmp k v left
    sedfile="$(mktemp)"; tmp="$(mktemp)"
    while IFS='=' read -r k v; do
        [ -n "$k" ] || continue
        printf 's|{{%s}}|%s|g\n' "$k" "$(sed_escape "$v")" >> "$sedfile"
    done < "$ANSWERS_TMP"
    if ! sed -f "$sedfile" "$src" > "$tmp"; then
        fail "sed failed while rendering $src"
        rm -f "$sedfile" "$tmp"
        return 0
    fi
    left="$(grep -o '{{[^}]*}}' "$tmp" | sort -u | tr '\n' ' ')"
    if [ -n "$left" ]; then
        fail "unresolved placeholder(s) in $src: $left"
        rm -f "$sedfile" "$tmp"
        return 0
    fi
    write_file "$tmp" "$dst" render
    rm -f "$sedfile" "$tmp" 2>/dev/null
    return 0
}

# Write the file at $1 to $2. Skips an identical file, keeps older backups,
# and counts a failure. $3 names the action in the log.
write_file() {
    local from="$1" dst="$2" verb="$3"
    if [ -f "$dst" ] && [ ! -L "$dst" ] && cmp -s "$from" "$dst"; then
        log "  unchanged $dst"
        return 0
    fi
    clear_target "$from" "$dst" || return 0
    if [ "$DRY_RUN" = 1 ]; then log "  [dry] $verb $dst"; return 0; fi
    mkdir -p "$(dirname "$dst")" || { fail "cannot create directory $(dirname "$dst")"; return 0; }
    if [ "$verb" = render ]; then
        if mv "$from" "$dst"; then log "  rendered $dst"; else fail "cannot write $dst"; fi
    else
        if cp "$from" "$dst"; then log "  copy $dst"; else fail "cannot copy to $dst"; fi
    fi
}

install_file() {
    local src="$1" dst="$2"
    case "$src" in
        *.tmpl) render_template "$src" "${dst%.tmpl}" ;;
        *) write_file "$src" "$dst" copy ;;
    esac
}

read_manifest_key() {
    sed -n "s/^$2=//p" "$1" | head -n 1
}

# Print the short HEAD sha of a git checkout. Prints "unknown" on failure.
repo_head_sha() {
    git -C "$1" rev-parse --short HEAD 2>/dev/null || printf 'unknown'
}

# Clone a repo, or pull it when the clone directory is already a git checkout.
# gh is the preferred client. git over https is the fallback.
clone_or_pull() {
    local repo="$1" dest="$2"
    if [ -d "$dest/.git" ]; then
        [ "$DRY_RUN" = 1 ] && { log "  [dry] pull $dest"; return 0; }
        if git -C "$dest" pull --ff-only >/dev/null 2>&1; then
            log "  pulled $dest"
        else
            log "  pull failed, kept the existing checkout: $dest"
            EXT_STALE=1
        fi
        return 0
    fi
    if [ -e "$dest" ]; then
        log "  target exists and is not a git checkout, skipped: $dest"
        return 1
    fi
    if [ "$DRY_RUN" = 1 ]; then
        log "  [dry] clone $repo -> $dest"
        log "  [dry]   gh repo clone $repo $dest"
        log "  [dry]   fallback: git clone https://github.com/$repo $dest"
        return 0
    fi
    mkdir -p "$(dirname "$dest")" || { fail "cannot create directory $(dirname "$dest")"; return 1; }
    if command -v gh >/dev/null 2>&1 && gh repo clone "$repo" "$dest" >/dev/null 2>&1; then
        log "  cloned $repo -> $dest"
    elif git clone "https://github.com/$repo" "$dest" >/dev/null 2>&1; then
        log "  cloned $repo -> $dest (git fallback)"
    else
        fail "clone failed: $repo"
        return 1
    fi
    return 0
}

# Install one type=external component. Clones the sibling repo, then hands the
# install to that repo's own installer or to stow.
run_external() {
    local conf="$1" name repo clone_to method run dest
    EXT_STALE=0
    name="$(read_manifest_key "$conf" name)"
    repo="$(read_manifest_key "$conf" repo)"
    clone_to="$(read_manifest_key "$conf" clone_to)"
    method="$(read_manifest_key "$conf" method)"
    run="$(read_manifest_key "$conf" run)"
    [ -n "$repo" ] || { log "  manifest has no repo=, skipped"; return; }
    [ -n "$clone_to" ] || { log "  manifest has no clone_to=, skipped"; return; }
    dest="$(expand_home "$clone_to")"
    log "  plan: clone $repo into $dest, then method=$method"
    clone_or_pull "$repo" "$dest" || return
    case "$method" in
        script)
            [ -n "$run" ] || { log "  method=script needs run=, skipped"; return; }
            if [ "$DRY_RUN" = 1 ]; then
                log "  [dry] run $dest/$run from $dest"
            elif [ -f "$dest/$run" ]; then
                ( cd "$dest" && bash "$run" ) \
                    && log "  ran $run" \
                    || fail "delegate installer failed: $run"
            else
                log "  delegate installer not found: $dest/$run"
            fi
            ;;
        stow)
            if ! command -v stow >/dev/null 2>&1; then
                log "  stow not found, skipped. Install it: apt install stow, or brew install stow"
                return
            fi
            if [ "$DRY_RUN" = 1 ]; then
                log "  [dry] stow . from $dest, target $HOME"
            else
                ( cd "$dest" && stow --target "$HOME" . ) \
                    && log "  stowed $dest into $HOME" \
                    || fail "stow failed in $dest"
            fi
            ;;
        clone)
            log "  clone only, no delegate step"
            ;;
        *)
            log "  unknown method: $method"
            ;;
    esac
    if [ "$DRY_RUN" = 1 ]; then
        log "  [dry] summary: $name at $dest"
    else
        if [ "$EXT_STALE" = 1 ]; then
            log "  summary: $name at $dest, HEAD $(repo_head_sha "$dest") (stale, pull failed)"
        else
            log "  summary: $name at $dest, HEAD $(repo_head_sha "$dest")"
        fi
    fi
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
    if [ "$type" = "external" ]; then
        run_external "$conf"
        return
    fi
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
            --force) FORCE=1; shift ;;
            -h|--help) log "usage: setup.sh [--profile answers.yml] [--dry-run] [--force]"; exit 0 ;;
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
    if [ "$FAILURES" -gt 0 ]; then
        log "done with $FAILURES failure(s). Read the FAILED lines above."
        exit 1
    fi
    log "done."
}

main "$@"
