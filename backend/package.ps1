$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot '..\dist'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendFiles = @('src', 'public', 'scripts', 'tests', 'package.json', 'package-lock.json', 'wrangler.jsonc', '.gitignore', 'README.md', 'package.ps1') | ForEach-Object { Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot $_) -File -Recurse }
$rootFiles = @('manifest.json', 'background.js', 'solver.js', 'content.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css', 'icons', 'fonts', 'README.md', 'STORE-READINESS.md', 'package.json', 'package-lock.json', 'package.ps1', 'tests') | ForEach-Object { Get-ChildItem -LiteralPath (Join-Path $root $_) -File -Recurse }
$version = (Get-Content -Raw -LiteralPath (Join-Path $root 'manifest.json') | ConvertFrom-Json).version
$zipPath = Join-Path $destination "MCQ-Lens-source-v$version.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in @($rootFiles) + @($backendFiles)) {
    $entryName = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName) | Out-Null
  }
} finally { $archive.Dispose(); $stream.Dispose() }
Write-Output $zipPath
