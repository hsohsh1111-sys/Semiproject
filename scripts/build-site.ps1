$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $projectRoot 'frontend')
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'ONFIT frontend build failed.' }
} finally { Pop-Location }

Push-Location (Join-Path $projectRoot 'ai-fashion')
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'AI fashion frontend build failed.' }
} finally { Pop-Location }

$source = Join-Path $projectRoot 'ai-fashion\dist'
$target = Join-Path $projectRoot 'frontend\dist\ai-fashion'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem -LiteralPath $source | Copy-Item -Destination $target -Recurse -Force
Write-Output "Combined static site: $($projectRoot)\frontend\dist"
