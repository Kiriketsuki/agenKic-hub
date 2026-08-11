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

function Expand-Home([string]$Path) {
    if ($Path -eq "~") { return $HOME }
    if ($Path.StartsWith("~/")) { return (Join-Path $HOME $Path.Substring(2)) }
    return $Path
}

# Parse a flat "key: value" or "key=value" file into a hashtable.
function Read-FlatFile([string]$File, [string]$Sep) {
    $map = @{}
    foreach ($line in Get-Content $File) {
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

# Move a real file or directory aside before replacing it. Links are removed,
# never backed up, because they can be recreated.
function Backup-IfReal([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.LinkType) {
        if ($DryRun) { Write-Host "  [dry] remove link $Path"; return }
        # Remove the link itself, not the target contents.
        $item.Delete()
    } else {
        if ($DryRun) { Write-Host "  [dry] backup $Path -> $Path.bak"; return }
        if (Test-Path -LiteralPath "$Path.bak") {
            Remove-Item -LiteralPath "$Path.bak" -Recurse -Force
        }
        Move-Item -LiteralPath $Path -Destination "$Path.bak"
        Write-Host "  backed up $Path -> $Path.bak"
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
    $text = Get-Content -LiteralPath $Src -Raw
    foreach ($k in $Answers.Keys) {
        $text = $text.Replace("{{$k}}", $Answers[$k])
    }
    Backup-IfReal $Dst
    if ($DryRun) { Write-Host "  [dry] render $Dst"; return }
    Ensure-ParentDir $Dst
    Set-Content -LiteralPath $Dst -Value $text -NoNewline
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
