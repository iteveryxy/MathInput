#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$project = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $project
try {
    $manifest = Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    $tauri = Get-Content -LiteralPath 'src-tauri/tauri.conf.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    $version = $manifest.version
    if ($version -notmatch '^\d+\.\d+\.\d+$' -or $tauri.version -ne $version) { throw 'The package and Tauri versions must match.' }
    $rust = & rustc -vV
    if ($LASTEXITCODE -ne 0 -or $rust -notcontains 'host: x86_64-pc-windows-msvc') { throw 'Build this win64 release with x86_64-pc-windows-msvc.' }

    $staging = '.local/github-package-' + [guid]::NewGuid().ToString('N')
    $portable = Join-Path $project "$staging/portable"
    New-Item -ItemType Directory -Path "$portable/formula-packs" -Force | Out-Null
    & cargo fetch --locked --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the locked Rust dependencies.' }
    & node scripts/collect-licenses.mjs $portable
    if ($LASTEXITCODE -ne 0) { throw 'Could not collect third-party licenses.' }

    $overlay = Join-Path $project "$staging/tauri-release.json"
    $resources = @{ "../$staging/portable/licenses/" = "licenses/" }
    @{ bundle = @{ resources = $resources } } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $overlay -Encoding ascii
    & npm run tauri -- build --bundles nsis --no-binary-patching --config $overlay
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the Windows installer.' }

    $out = Join-Path $project "release/github/v$version"
    New-Item -ItemType Directory -Path $out -Force | Out-Null
    $setup = Join-Path $out "MathInput-$version-win64-setup.exe"
    $zip = Join-Path $out "MathInput-$version-win64-portable.zip"
    $installers = @(Get-ChildItem -LiteralPath 'src-tauri/target/release/bundle/nsis' -Filter "*_$($version)_x64-setup.exe" -File)
    if ($installers.Count -ne 1) { throw 'Expected one x64 NSIS installer for this version.' }
    Copy-Item -LiteralPath $installers[0].FullName -Destination $setup -Force
    Copy-Item -LiteralPath 'src-tauri/target/release/math-input.exe' -Destination "$portable/MathInput.exe"
    Copy-Item -LiteralPath 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/USER_GUIDE.md' -Destination $portable
    Get-ChildItem -LiteralPath 'src/packs' -Filter '*.mathpack.json' -Recurse -File |
        Copy-Item -Destination "$portable/formula-packs"
    @'
Math Input for Windows

Extract this ZIP and run MathInput.exe. Windows must have the WebView2 Runtime.
Press Ctrl+Alt+M in your target editor, type frac, then press Enter.
Use Tab between formula fields and Enter to finish or submit.
Use the tray menu to exit. Settings and formula packs are saved per Windows user.

Source and updates
https://github.com/iteveryxy/MathInput
'@ | Set-Content -LiteralPath "$portable/README.txt" -Encoding ascii
    $contents = Get-ChildItem -LiteralPath $portable -Force
    Compress-Archive -LiteralPath $contents.FullName -DestinationPath $zip -Force

    Get-FileHash -LiteralPath $setup, $zip -Algorithm SHA256 | ForEach-Object {
        $_.Hash.ToLowerInvariant() + '  ' + (Split-Path -Leaf $_.Path)
    } | Set-Content -LiteralPath (Join-Path $out 'SHA256SUMS.txt') -Encoding ascii
    Write-Output $out
}
finally {
    Pop-Location
}
