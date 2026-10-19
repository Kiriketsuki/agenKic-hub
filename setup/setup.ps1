# agentic-hub installer for Windows PowerShell 5.1+ and PowerShell 7.
# Usage: .\setup.ps1 [-Profile answers.yml] [-DryRun]
[CmdletBinding()]
param(
    # Named AnswersFile because $Profile is a PowerShell automatic variable.
    # The Profile alias keeps the documented -Profile flag working.
    [Alias("Profile")]
    [string]$AnswersFile = "",
    [switch]$DryRun
)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir
$ComponentsDir = Join-Path $ScriptDir "components"
$ExampleAnswers = Join-Path $ScriptDir "answers.example.yml"

# Every file read and write uses UTF-8 without a BOM. Windows PowerShell 5.1 defaults to the
# ANSI code page on read and to a BOM on Set-Content -Encoding UTF8, and both corrupt
# non-ASCII answers and templates. .NET resolves relative paths against the process
# directory, not the PowerShell location, so callers pass absolute paths.
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Expand-Home([string]$Path) {
    if ($Path -eq "~") { return $HOME }
    if ($Path.StartsWith("~/")) { return (Join-Path $HOME $Path.Substring(2)) }
    return $Path
}

# Parse a flat "key: value" or "key=value" file into a hashtable.
function Read-FlatFile([string]$File, [string]$Sep) {
    $map = @{}
    $abs = (Resolve-Path -LiteralPath $File).Path
    foreach ($line in [System.IO.File]::ReadAllLines($abs, $Utf8NoBom)) {
        $t = $line.Trim()
        if ($t -eq "" -or $t.StartsWith("#")) { continue }
        $idx = $t.IndexOf($Sep)
        if ($idx -lt 1) { continue }
        $k = $t.Substring(0, $idx).Trim()
        $v = $t.Substring($idx + 1).Trim().Trim('"')
        $map[$k] = $v
    }
    return $map
}

# Pick an unused backup name. The first backup is <path>.bak. When that name is
# taken, use <path>.bak.<yyyyMMddHHmmss>. An older backup is never overwritten.
function Get-BackupName([string]$Path) {
    $cand = "$Path.bak"
    if (-not (Get-Item -LiteralPath $cand -Force -ErrorAction SilentlyContinue)) { return $cand }
    $ts = Get-Date -Format "yyyyMMddHHmmss"
    $cand = "$Path.bak.$ts"
    $n = 0
    while (Get-Item -LiteralPath $cand -Force -ErrorAction SilentlyContinue) {
        $n++
        $cand = "$Path.bak.$ts.$n"
    }
    return $cand
}

# Move a real file or directory aside before replacing it. Links are removed,
# never backed up, because they can be recreated.
# Test-Path returns $false for a dangling link, so the code uses Get-Item -Force
# with SilentlyContinue. That call still returns the link item.
function Backup-IfReal([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if (-not $item) { return }
    if ($item.LinkType) {
        if ($DryRun) { Write-Host "  [dry] remove link $Path"; return }
        # Remove the link itself, not the target contents.
        $item.Delete()
    } else {
        $to = Get-BackupName $Path
        if ($DryRun) { Write-Host "  [dry] backup $Path -> $to"; return }
        Move-Item -LiteralPath $Path -Destination $to
        Write-Host "  backed up $Path -> $to"
    }
}

function Ensure-ParentDir([string]$Path) {
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
}

# Symlink first. On failure (no Developer Mode, no admin): junction for a
# directory, plain copy for a file. Print which fallback was used.
function Make-Link([string]$Src, [string]$Dst) {
    Backup-IfReal $Dst
    if ($DryRun) { Write-Host "  [dry] link $Dst -> $Src"; return }
    Ensure-ParentDir $Dst
    try {
        New-Item -ItemType SymbolicLink -Path $Dst -Target $Src -ErrorAction Stop | Out-Null
        Write-Host "  link $Dst -> $Src"
    } catch {
        if (Test-Path -LiteralPath $Src -PathType Container) {
            New-Item -ItemType Junction -Path $Dst -Target $Src | Out-Null
            Write-Host "  junction (fallback) $Dst -> $Src"
        } else {
            Copy-Item -LiteralPath $Src -Destination $Dst
            Write-Host "  copy (fallback) $Dst"
        }
    }
}

# Substitute {{key}} placeholders from the answers into the destination.
function Render-Template([string]$Src, [string]$Dst, [hashtable]$Answers) {
    $text = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Src).Path, $Utf8NoBom)
    # String.Replace is literal, so values with \, & or | need no escaping here.
    foreach ($k in $Answers.Keys) {
        $text = $text.Replace("{{$k}}", $Answers[$k])
    }
    $left = @([regex]::Matches($text, '\{\{[^}]*\}\}') | ForEach-Object { $_.Value } | Sort-Object -Unique)
    if ($left.Count -gt 0) { throw "unresolved placeholder(s) in ${Src}: $($left -join ' ')" }
    Backup-IfReal $Dst
    if ($DryRun) { Write-Host "  [dry] render $Dst"; return }
    Ensure-ParentDir $Dst
    [System.IO.File]::WriteAllText($Dst, $text, $Utf8NoBom)
    Write-Host "  rendered $Dst"
}

function Install-File([string]$Src, [string]$Dst, [hashtable]$Answers) {
    if ($Src.EndsWith(".tmpl")) {
        Render-Template $Src ($Dst -replace '\.tmpl$', '') $Answers
    } else {
        Backup-IfReal $Dst
        if ($DryRun) { Write-Host "  [dry] copy $Dst"; return }
        Ensure-ParentDir $Dst
        Copy-Item -LiteralPath $Src -Destination $Dst
        Write-Host "  copy $Dst"
    }
}

function Run-Component([string]$ConfPath, [hashtable]$Answers) {
    $m = Read-FlatFile $ConfPath "="
    $srcDir = Join-Path $RepoDir $m.source
    $tgtDir = Expand-Home $m.target
    Write-Host "== $($m.name)"
    if ($m.type -eq "external") {
        # TODO: port the type=external handler from setup.sh. It clones repo=
        # into clone_to=, then runs run= (method=script) or stow (method=stow).
        # stow has no Windows equivalent, so the port needs a link strategy.
        # Until then this guard stops the install branch from copying the repo.
        Write-Host "  type=external is not supported on Windows yet, skipped"
        Write-Host "  install it by hand: git clone https://github.com/$($m.repo) $(Expand-Home $m.clone_to)"
        return
    }
    if (-not (Test-Path -LiteralPath $srcDir)) {
        Write-Host "  source missing, skipped: $($m.source)"; return
    }
    if ($m.type -eq "link_children") {
        $children = Get-ChildItem -LiteralPath $srcDir
        if (-not $children) { Write-Host "  nothing to link in $($m.source)"; return }
        foreach ($child in $children) {
            Make-Link $child.FullName (Join-Path $tgtDir $child.Name)
        }
    } else {
        $files = Get-ChildItem -LiteralPath $srcDir -Recurse -File |
            Where-Object { $_.Name -ne "README.md" }
        if (-not $files) {
            Write-Host "  nothing installable yet (scaffold), skipped"; return
        }
        foreach ($f in $files) {
            $rel = $f.FullName.Substring($srcDir.Length).TrimStart('\', '/')
            Install-File $f.FullName (Join-Path $tgtDir $rel) $Answers
        }
    }
}

# Simple checkbox picker: toggle by number, a = all, empty line = confirm.
function Pick-Components([string[]]$Names) {
    $sel = New-Object System.Collections.ArrayList
    while ($true) {
        Write-Host "`nComponents:"
        for ($i = 0; $i -lt $Names.Count; $i++) {
            $mark = if ($sel.Contains($i)) { "x" } else { " " }
            Write-Host ("  [{0}] {1,2}) {2}" -f $mark, ($i + 1), $Names[$i])
        }
        $line = Read-Host "Toggle number, a = all, enter = confirm"
        if ($line -eq "") { break }
        if ($line -eq "a") {
            $sel.Clear()
            0..($Names.Count - 1) | ForEach-Object { [void]$sel.Add($_) }
        } elseif ($line -match '^\d+$') {
            $idx = [int]$line - 1
            if ($idx -ge 0 -and $idx -lt $Names.Count) {
                if ($sel.Contains($idx)) { $sel.Remove($idx) } else { [void]$sel.Add($idx) }
            }
        }
    }
    return @($sel | ForEach-Object { $Names[$_] })
}

# Prompt for every variable documented in the example answers file.
function Prompt-Variables {
    $defaults = Read-FlatFile $ExampleAnswers ":"
    $answers = @{}
    foreach ($k in $defaults.Keys) {
        if ($k -eq "components") { continue }
        $v = Read-Host "$k [$($defaults[$k])]"
        if ($v -eq "") { $v = $defaults[$k] }
        $answers[$k] = $v
    }
    return $answers
}

# Main.
$confs = Get-ChildItem -LiteralPath $ComponentsDir -Filter *.conf | Sort-Object Name
$allNames = @($confs | ForEach-Object { (Read-FlatFile $_.FullName "=").name })

if ($AnswersFile -ne "") {
    if (-not (Test-Path -LiteralPath $AnswersFile)) { throw "profile not found: $AnswersFile" }
    $answers = Read-FlatFile $AnswersFile ":"
    if (-not $answers.ContainsKey("components")) { throw "profile has no components: line" }
    $selected = @($answers.components -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
} else {
    $selected = Pick-Components $allNames
    if (-not $selected) { Write-Host "nothing selected, exiting"; exit 0 }
    $answers = Prompt-Variables
}

Write-Host ""
foreach ($conf in $confs) {
    $name = (Read-FlatFile $conf.FullName "=").name
    if ($selected -contains $name) { Run-Component $conf.FullName $answers }
}
Write-Host "`ndone."
