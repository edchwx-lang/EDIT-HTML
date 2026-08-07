[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceRoot,
  [string]$SkillRoot = (Join-Path $env:USERPROFILE ".codex\skills"),
  [string]$NpmCommand = "npm",
  [string]$NodeCommand = "node",
  [string]$GlobalPrefix,
  [string]$GlobalPackageRoot,
  [string]$CommandShim
)

$ErrorActionPreference = "Stop"
$resolvedSourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
$packagePath = Join-Path $resolvedSourceRoot "package.json"
$skillSource = Join-Path $resolvedSourceRoot "skills\EDIT-HTML"
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

Push-Location $resolvedSourceRoot
try {
  & $NpmCommand test
  if ($LASTEXITCODE -ne 0) { throw "npm test failed; global package and Skill were not updated" }
} finally {
  Pop-Location
}

$installArguments = @("install", "--global", $resolvedSourceRoot)
if ($GlobalPrefix) { $installArguments += @("--prefix", $GlobalPrefix) }
& $NpmCommand @installArguments
if ($LASTEXITCODE -ne 0) { throw "npm global installation failed" }

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

New-Item -ItemType Directory -Path $SkillRoot -Force | Out-Null
$skillDestination = Join-Path $SkillRoot "EDIT-HTML"
$skillStaging = Join-Path $SkillRoot (".EDIT-HTML-install-" + [Guid]::NewGuid().ToString("N"))
$skillBackup = Join-Path $SkillRoot (".EDIT-HTML-previous-" + [Guid]::NewGuid().ToString("N"))
Copy-Item -LiteralPath $skillSource -Destination $skillStaging -Recurse
$movedPrevious = $false
try {
  if (Test-Path -LiteralPath $skillDestination) {
    Move-Item -LiteralPath $skillDestination -Destination $skillBackup
    $movedPrevious = $true
  }
  Move-Item -LiteralPath $skillStaging -Destination $skillDestination
  if ($movedPrevious) { Remove-Item -LiteralPath $skillBackup -Recurse -Force }
} catch {
  if ((Test-Path -LiteralPath $skillStaging) -and -not (Test-Path -LiteralPath $skillDestination)) {
    Remove-Item -LiteralPath $skillStaging -Recurse -Force
  }
  if ($movedPrevious -and -not (Test-Path -LiteralPath $skillDestination)) {
    Move-Item -LiteralPath $skillBackup -Destination $skillDestination
  }
  throw
}

if (-not $CommandShim) {
  $resolvedCommand = Get-Command edit-html-report -ErrorAction Stop
  $CommandShim = $resolvedCommand.Source
}
$CommandShim = (Resolve-Path -LiteralPath $CommandShim).Path

& $NodeCommand $verificationScript `
  --source-root $resolvedSourceRoot `
  --package-root $GlobalPackageRoot `
  --skill-root $skillDestination `
  --shim-path $CommandShim
if ($LASTEXITCODE -ne 0) { throw "post-install verification failed" }
