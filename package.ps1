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
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
# tar writes forward-slash paths; Compress-Archive in Windows PowerShell writes icons\icon16.png, which Firefox and non-Windows unzip tools misread.
Remove-Item -Force -LiteralPath $storePath -ErrorAction SilentlyContinue
& $tar -a -c -f $storePath -C $projectRoot @runtime
if ($LASTEXITCODE) { throw 'tar failed' }
Write-Output $storePath
# Firefox: same files, but Firefox runs the background as a module script (no service_worker) and needs an add-on ID.
$stage = Join-Path $destination 'firefox-stage'
Remove-Item -Recurse -Force -LiteralPath $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$runtime | ForEach-Object { Copy-Item -Recurse -LiteralPath (Join-Path $projectRoot $_) -Destination $stage }
$manifest = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'manifest.json') | ConvertFrom-Json
$manifest.PSObject.Properties.Remove('minimum_chrome_version')
$manifest.background = [ordered]@{ scripts = @('background.js'); type = 'module' }
$manifest | Add-Member -NotePropertyName browser_specific_settings -NotePropertyValue ([ordered]@{ gecko = [ordered]@{ id = 'mcq-lens@mcq-lens.pages.dev'; strict_min_version = '128.0' } })
[IO.File]::WriteAllText((Join-Path $stage 'manifest.json'), ($manifest | ConvertTo-Json -Depth 10))
$firefoxPath = Join-Path $destination "MCQ-Lens-firefox-v$version.zip"
Remove-Item -Force -LiteralPath $firefoxPath -ErrorAction SilentlyContinue
& $tar -a -c -f $firefoxPath -C $stage @runtime
if ($LASTEXITCODE) { throw 'tar failed' }
Remove-Item -Recurse -Force -LiteralPath $stage
Write-Output $firefoxPath
