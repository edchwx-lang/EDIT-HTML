[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceRoot,
  [string]$SkillRoot,
  [string]$NpmCommand = "npm",
  [string]$NodeCommand = "node",
  [string]$GlobalPrefix,
  [string]$GlobalPackageRoot,
  [string]$CommandShim
)

$ErrorActionPreference = "Stop"
$resolvedSourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
$profileRoot = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { $null }
if (-not $SkillRoot) {
  if (-not $profileRoot) {
    throw "Unable to resolve default SkillRoot because neither USERPROFILE nor HOME is set"
  }
  $SkillRoot = Join-Path (Join-Path $profileRoot ".codex") "skills"
}
$packagePath = Join-Path $resolvedSourceRoot "package.json"
$skillSource = Join-Path $resolvedSourceRoot "skills\edit-html"
$verificationScript = Join-Path $resolvedSourceRoot "scripts\verify-installation.mjs"

if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
  throw "SourceRoot is not an edit-html-report checkout: $resolvedSourceRoot"
}
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.name -ne "edit-html-report") {
  throw "SourceRoot package name is not edit-html-report: $resolvedSourceRoot"
}
if ($package.version -eq "4.0.0") {
  throw "Refusing to install the obsolete 4.0.0 checkout: $resolvedSourceRoot"
}

Write-Host "Installing edit-html-report from source root: $resolvedSourceRoot"

# Check business dependencies before replacing the user's global installation.
$sourceCli = Join-Path $resolvedSourceRoot "bin\edit-html-report.js"
$diagnostic = (& $NodeCommand $sourceCli doctor --json | Out-String) | ConvertFrom-Json
if (-not $diagnostic.checks.browserLaunch) {
  if ($env:EDIT_HTML_BROWSER -and $env:EDIT_HTML_BROWSER -ne "auto" -or $env:EDIT_HTML_BROWSER_EXECUTABLE_PATH) {
    throw "Configured browser failed; correct EDIT_HTML_BROWSER / EDIT_HTML_BROWSER_EXECUTABLE_PATH. $($diagnostic.errors -join '; ')"
  }
  & $NodeCommand $sourceCli setup browser
  if ($LASTEXITCODE -ne 0) { throw "Browser installation failed; global package and Skill were not updated" }
  $diagnostic = (& $NodeCommand $sourceCli doctor --json | Out-String) | ConvertFrom-Json
}
if (-not $diagnostic.workflowReady) { throw "Workflow dependencies are not ready: $($diagnostic.errors -join '; ')" }

# Browser-dependent tests can run on a clean machine only after bootstrap.
Push-Location $resolvedSourceRoot
try {
  & $NpmCommand test
  if ($LASTEXITCODE -ne 0) { throw "npm test failed; global package and Skill were not updated" }
} finally {
  Pop-Location
}

# A tarball installs a stable copy. Installing a directory creates a junction.
# This is an internal temporary npm payload, not a release ZIP/publication.
$packDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("edit-html-npm-install-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $packDirectory | Out-Null
try {
  Push-Location $resolvedSourceRoot
  try {
    $packResult = (& $NpmCommand pack --json --pack-destination $packDirectory | Out-String) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "npm pack failed; global package was not updated" }
  } finally { Pop-Location }
  $archiveName = [System.IO.Path]::GetFileName($packResult[0].filename)
  if (-not $archiveName -or $archiveName -ne $packResult[0].filename) { throw "Unsafe npm pack filename" }
  $archive = Join-Path $packDirectory $archiveName
  if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "npm pack did not create its payload" }
  $installArguments = @("install", "--global", $archive)
  if ($GlobalPrefix) { $installArguments += @("--prefix", $GlobalPrefix) }
  & $NpmCommand @installArguments
  if ($LASTEXITCODE -ne 0) { throw "npm global installation failed" }
} finally {
  $resolvedPackDirectory = [System.IO.Path]::GetFullPath($packDirectory)
  $temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if ($resolvedPackDirectory.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
      [System.IO.Path]::GetFileName($resolvedPackDirectory).StartsWith("edit-html-npm-install-")) {
    Remove-Item -LiteralPath $resolvedPackDirectory -Recurse -Force
  }
}

if (-not $GlobalPackageRoot) {
  if ($GlobalPrefix) {
    $GlobalPackageRoot = Join-Path (Resolve-Path -LiteralPath $GlobalPrefix).Path "node_modules\edit-html-report"
  } else {
    $npmGlobalRoot = (& $NpmCommand root --global).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $npmGlobalRoot) { throw "Unable to resolve npm global package root" }
    $GlobalPackageRoot = Join-Path $npmGlobalRoot "edit-html-report"
  }
}
$GlobalPackageRoot = (Resolve-Path -LiteralPath $GlobalPackageRoot).Path
if ((Get-Item -LiteralPath $GlobalPackageRoot).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
  throw "Global package is still linked to a source directory; refusing to claim a portable installation"
}

New-Item -ItemType Directory -Path $SkillRoot -Force | Out-Null
$skillDestination = Join-Path $SkillRoot "edit-html"
$backupRoot = Join-Path (Split-Path ([System.IO.Path]::GetFullPath($SkillRoot)) -Parent) "skill-install-backups"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$skillStaging = Join-Path $backupRoot ("edit-html-staging-" + [Guid]::NewGuid().ToString("N"))
$skillBackup = Join-Path $backupRoot ("edit-html-previous-" + [Guid]::NewGuid().ToString("N"))
Copy-Item -LiteralPath $skillSource -Destination $skillStaging -Recurse
$movedPrevious = $false
try {
  if (Test-Path -LiteralPath $skillDestination) {
    Move-Item -LiteralPath $skillDestination -Destination $skillBackup
    $movedPrevious = $true
  }
  Move-Item -LiteralPath $skillStaging -Destination $skillDestination
  if (-not $CommandShim) {
    if ($GlobalPrefix) { $CommandShim = Join-Path $GlobalPrefix "edit-html-report.cmd" }
    else { $CommandShim = (Get-Command edit-html-report -ErrorAction Stop).Source }
  }
  $CommandShim = (Resolve-Path -LiteralPath $CommandShim).Path
  & $NodeCommand $verificationScript --source-root $resolvedSourceRoot --package-root $GlobalPackageRoot --skill-root $skillDestination --shim-path $CommandShim
  if ($LASTEXITCODE -ne 0) { throw "post-install verification failed" }
  if ($movedPrevious) { Write-Host "Previous Skill retained outside discovery: $skillBackup" }
} catch {
  # Retain the failed new Skill for diagnosis and restore the previous one.
  if (Test-Path -LiteralPath $skillDestination) {
    $failedSkill = Join-Path $backupRoot ("edit-html-failed-" + [Guid]::NewGuid().ToString("N"))
    Move-Item -LiteralPath $skillDestination -Destination $failedSkill
  }
  if ($movedPrevious -and -not (Test-Path -LiteralPath $skillDestination)) {
    Move-Item -LiteralPath $skillBackup -Destination $skillDestination
  }
  throw
}
