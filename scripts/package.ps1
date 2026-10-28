param([switch]$Build)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location $taskRoot
try {
    $taskManifest = Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    $taskVersion = $taskManifest.version
    if ($taskVersion -notmatch '^\d+\.\d+\.\d+$') { throw '版本号格式不正确' }
    if ($Build) {
        & npm run desktop:build
        if ($LASTEXITCODE -ne 0) { throw '桌面构建失败，未打包' }
    }
    $taskSource = Join-Path $taskRoot 'src-tauri\target\release\math-input.exe'
    if (-not (Test-Path -LiteralPath $taskSource)) { throw '请先执行 npm run desktop:build' }
    $taskRelease = Join-Path $taskRoot 'release'
    New-Item -ItemType Directory -Path $taskRelease -Force | Out-Null
    Copy-Item -LiteralPath $taskSource -Destination (Join-Path $taskRelease 'MathInput.exe')
    Copy-Item -LiteralPath (Join-Path $taskRoot 'README.md') -Destination $taskRelease
    Copy-Item -LiteralPath (Join-Path $taskRoot 'THIRD_PARTY_NOTICES.md') -Destination $taskRelease
    Copy-Item -LiteralPath (Join-Path $taskRoot 'docs') -Destination $taskRelease -Recurse -Force
    & node scripts/collect-licenses.mjs $taskRelease
    if ($LASTEXITCODE -ne 0) { throw '依赖版权说明收集失败' }
    $taskEvidence = Join-Path $taskRelease 'reports'
    New-Item -ItemType Directory -Path $taskEvidence -Force | Out-Null
    foreach ($taskEvidenceFile in @('unit-results.json', 'ui-results.json', 'rust-tests.log', 'mathlive-probe.json', 'editor-ui.png', 'native-integration.json', 'native-integration.log', 'native-environment.json', 'native-attempts.jsonl', 'native-clipboard-regression-before.log', 'native-clipboard-guard.json', 'native-clipboard-formats.json', 'powershell-compatibility.json', 'v02-mathlive-baseline.json', 'v02-ui-geometry.json', 'ui-v02-compact.png', 'ui-v02-selection.png', 'verification-v02.json')) {
        $taskEvidenceSource = Join-Path $taskRoot ('reports\' + $taskEvidenceFile)
        if (Test-Path -LiteralPath $taskEvidenceSource) { Copy-Item -LiteralPath $taskEvidenceSource -Destination $taskEvidence }
    }
    $taskDesktopEvidence = Join-Path $taskRoot 'reports\desktop-acceptance'
    if (Test-Path -LiteralPath $taskDesktopEvidence) { Copy-Item -LiteralPath $taskDesktopEvidence -Destination $taskEvidence -Recurse -Force }
    $taskV02DesktopEvidence = Join-Path $taskRoot 'reports\desktop-v02'
    if (Test-Path -LiteralPath $taskV02DesktopEvidence) { Copy-Item -LiteralPath $taskV02DesktopEvidence -Destination $taskEvidence -Recurse -Force }
    $taskHash = Get-FileHash -LiteralPath (Join-Path $taskRelease 'MathInput.exe') -Algorithm SHA256
    $taskHash.Hash.ToLowerInvariant() + '  MathInput.exe' | Set-Content -LiteralPath (Join-Path $taskRelease 'SHA256SUMS.txt') -Encoding ascii
    $taskArchiveInputs = @('MathInput.exe', 'README.md', 'THIRD_PARTY_NOTICES.md', 'docs', 'licenses', 'reports', 'SHA256SUMS.txt') | ForEach-Object { Join-Path $taskRelease $_ }
    Compress-Archive -LiteralPath $taskArchiveInputs -DestinationPath (Join-Path $taskRelease ('MathInput-' + $taskVersion + '-win64.zip')) -Force
    $taskHash | Select-Object Hash,Path
} finally { Pop-Location }
