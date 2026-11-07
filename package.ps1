$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$destination = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$files = @('manifest.json', 'background.js', 'solver.js', 'content.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css', 'README.md', 'STORE-READINESS.md', 'package.json', 'package-lock.json', 'package.ps1', 'tests')
$sources = $files | ForEach-Object { Join-Path $projectRoot $_ }
$version = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'manifest.json') | ConvertFrom-Json).version
$zipPath = Join-Path $destination "MCQ-Lens-v$version.zip"
Compress-Archive -LiteralPath $sources -DestinationPath $zipPath -Force
Write-Output $zipPath
