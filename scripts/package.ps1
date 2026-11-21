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
    $taskReleaseRoot = Join-Path $taskRoot 'release'
    $taskRelease = Join-Path $taskReleaseRoot ('v' + $taskVersion)
    New-Item -ItemType Directory -Path $taskRelease -Force | Out-Null
    $taskVersionedExe = Join-Path $taskRelease 'MathInput.exe'
    if (-not (Test-Path -LiteralPath $taskVersionedExe) -or (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $taskVersionedExe -Algorithm SHA256).Hash) {
        Copy-Item -LiteralPath $taskSource -Destination $taskVersionedExe -Force
    }
    Copy-Item -LiteralPath (Join-Path $taskRoot 'README.md') -Destination $taskRelease
    $taskPackagedReadme = Join-Path $taskRelease 'README.md'
    $taskReadmeText = [System.IO.File]::ReadAllText($taskPackagedReadme).Replace('src/packs/examples/', 'formula-packs/').Replace('src/packs/university/', 'formula-packs/')
    [System.IO.File]::WriteAllText($taskPackagedReadme, $taskReadmeText, (New-Object System.Text.UTF8Encoding($false)))
    Copy-Item -LiteralPath (Join-Path $taskRoot 'THIRD_PARTY_NOTICES.md') -Destination $taskRelease
    Copy-Item -LiteralPath (Join-Path $taskRoot 'docs') -Destination $taskRelease -Recurse -Force
    $taskPackFolder = Join-Path $taskRelease 'formula-packs'
    New-Item -ItemType Directory -Path $taskPackFolder -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $taskRoot 'src\packs\examples\linear-algebra.mathpack.json') -Destination $taskPackFolder
    Get-ChildItem -LiteralPath (Join-Path $taskRoot 'src\packs\university') -Filter '*.mathpack.json' -File |
        Copy-Item -Destination $taskPackFolder
    & node scripts/collect-licenses.mjs $taskRelease
    if ($LASTEXITCODE -ne 0) { throw '依赖版权说明收集失败' }
    $taskEvidence = Join-Path $taskRelease 'reports'
    New-Item -ItemType Directory -Path $taskEvidence -Force | Out-Null
    foreach ($taskEvidenceFile in @('unit-results.json', 'ui-results.json', 'rust-tests.log', 'mathlive-probe.json', 'editor-ui.png', 'native-integration.json', 'native-integration.log', 'native-environment.json', 'native-attempts.jsonl', 'native-clipboard-regression-before.log', 'native-clipboard-guard.json', 'native-clipboard-formats.json', 'powershell-compatibility.json', 'v02-mathlive-baseline.json', 'v02-ui-geometry.json', 'ui-v02-compact.png', 'ui-v02-selection.png', 'verification-v02.json', 'verification-v03.json', 'v03-phase0-ui.json')) {
        $taskEvidenceSource = Join-Path $taskRoot ('reports\' + $taskEvidenceFile)
        if (Test-Path -LiteralPath $taskEvidenceSource) { Copy-Item -LiteralPath $taskEvidenceSource -Destination $taskEvidence }
    }
    $taskDesktopEvidence = Join-Path $taskRoot 'reports\desktop-acceptance'
    if (Test-Path -LiteralPath $taskDesktopEvidence) { Copy-Item -LiteralPath $taskDesktopEvidence -Destination $taskEvidence -Recurse -Force }
    $taskV02DesktopEvidence = Join-Path $taskRoot 'reports\desktop-v02'
    if (Test-Path -LiteralPath $taskV02DesktopEvidence) { Copy-Item -LiteralPath $taskV02DesktopEvidence -Destination $taskEvidence -Recurse -Force }
    $taskV03DesktopEvidence = Join-Path $taskRoot 'reports\desktop-v03'
    if (Test-Path -LiteralPath $taskV03DesktopEvidence) { Copy-Item -LiteralPath $taskV03DesktopEvidence -Destination $taskEvidence -Recurse -Force }
    $taskHash = Get-FileHash -LiteralPath (Join-Path $taskRelease 'MathInput.exe') -Algorithm SHA256
    $taskHash.Hash.ToLowerInvariant() + '  MathInput.exe' | Set-Content -LiteralPath (Join-Path $taskRelease 'SHA256SUMS.txt') -Encoding ascii
    $taskArchiveInputs = @('MathInput.exe', 'README.md', 'THIRD_PARTY_NOTICES.md', 'docs', 'licenses', 'reports', 'formula-packs', 'SHA256SUMS.txt') | ForEach-Object { Join-Path $taskRelease $_ }
    Compress-Archive -LiteralPath $taskArchiveInputs -DestinationPath (Join-Path $taskReleaseRoot ('MathInput-' + $taskVersion + '-win64.zip')) -Force
    # The versioned directory and archive are authoritative. A running older
    # process may hold the convenience EXE open; preserve it in that case.
    $taskConvenienceUpdated = $false
    try {
        Copy-Item -LiteralPath (Join-Path $taskRelease 'MathInput.exe') -Destination (Join-Path $taskReleaseRoot 'MathInput.exe') -Force
        Copy-Item -LiteralPath (Join-Path $taskRelease 'SHA256SUMS.txt') -Destination $taskReleaseRoot -Force
        foreach ($taskConvenienceItem in @('README.md', 'THIRD_PARTY_NOTICES.md', 'docs', 'licenses', 'reports', 'formula-packs')) {
            Copy-Item -LiteralPath (Join-Path $taskRelease $taskConvenienceItem) -Destination $taskReleaseRoot -Recurse -Force
        }
        $taskConvenienceUpdated = $true
    } catch {
        Write-Warning ('Root EXE is in use; launch release\v' + $taskVersion + '\MathInput.exe. ' + $_.Exception.Message)
    }
    @{ version = $taskVersion; primaryExe = ('v' + $taskVersion + '\MathInput.exe'); rootExeUpdated = $taskConvenienceUpdated; sha256 = $taskHash.Hash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskReleaseRoot 'current-release.json') -Encoding UTF8
    $taskHash | Select-Object Hash,Path
} finally { Pop-Location }
