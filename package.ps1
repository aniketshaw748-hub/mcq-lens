$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$destination = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$runtime = @('manifest.json', 'background.js', 'solver.js', 'content.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css', 'icons')
$files = $runtime + @('README.md', 'STORE-READINESS.md', 'package.json', 'package-lock.json', 'package.ps1', 'tests')
$sources = $files | ForEach-Object { Join-Path $projectRoot $_ }
$version = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'manifest.json') | ConvertFrom-Json).version
$zipPath = Join-Path $destination "MCQ-Lens-v$version.zip"
Compress-Archive -LiteralPath $sources -DestinationPath $zipPath -Force
Write-Output $zipPath
# Store upload: only the files the extension runs, with manifest.json at the root.
$storePath = Join-Path $destination "MCQ-Lens-store-v$version.zip"
Compress-Archive -LiteralPath ($runtime | ForEach-Object { Join-Path $projectRoot $_ }) -DestinationPath $storePath -Force
Write-Output $storePath
