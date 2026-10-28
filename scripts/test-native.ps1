#requires -Version 5.1
param([switch]$Interactive, [switch]$PrepareTestBaseline)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location $taskRoot
try {
    $taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (-not (Test-Path -LiteralPath $taskCompiler)) { throw '需要 .NET Framework C# 编译器' }
    New-Item -ItemType Directory -Path '.local','reports' -Force | Out-Null
    @{ success = $false; stage = 'not-completed'; expected = 4; passed = 0; skipped = 0 } | ConvertTo-Json | Set-Content -LiteralPath 'reports\native-integration.json' -Encoding utf8
    & $taskCompiler /nologo /target:winexe '/out:.local\MathInput.NativeFixture.exe' /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll 'tests\windows\NativeFixture.cs'
    if ($LASTEXITCODE -ne 0) { throw '隔离原生测试框构建失败' }
    $taskBridgeHash = (Get-FileHash -LiteralPath 'src-tauri\src\native.rs' -Algorithm SHA256).Hash
    $taskArguments = @('run', '--manifest-path', 'src-tauri/Cargo.toml', '--example', 'native_acceptance', '--offline')
    if ($Interactive -or $PrepareTestBaseline) { $taskArguments += '--' }
    if ($Interactive) { $taskArguments += '--interactive' }
    # This explicit test-only option replaces the disposable clipboard with a
    # fixed public baseline using production NativeBridge::copy.
    if ($PrepareTestBaseline) { $taskArguments += '--prepare-test-baseline' }
    $taskCargo = (Get-Command cargo -CommandType Application -ErrorAction Stop).Source
    $taskPreviousErrorPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 wraps native stderr as ErrorRecord objects.
        # Cargo writes normal progress there; its exit code determines success.
        $ErrorActionPreference = 'Continue'
        & $taskCargo @taskArguments 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { $_.ToString() }
        } | Tee-Object -FilePath 'reports\native-integration.log' -ErrorAction Stop
        $taskExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $taskPreviousErrorPreference
    }
    if ($taskBridgeHash -ne (Get-FileHash -LiteralPath 'src-tauri\src\native.rs' -Algorithm SHA256).Hash) { throw '测试期间生产桥接源码发生变化' }
    $taskReport = $null
    if (Test-Path -LiteralPath 'reports\native-integration.json') {
        $taskReport = Get-Content -LiteralPath 'reports\native-integration.json' -Raw -Encoding UTF8 | ConvertFrom-Json
        $taskReport | Add-Member -NotePropertyName bridgeSourceSha256 -NotePropertyValue $taskBridgeHash -Force
        $taskReport | Add-Member -NotePropertyName releaseExeSha256 -NotePropertyValue (Get-FileHash -LiteralPath 'release\MathInput.exe' -Algorithm SHA256).Hash -Force
        $taskReport | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath 'reports\native-integration.json' -Encoding utf8
    }
    if ($taskExit -ne 0 -or -not $taskReport -or -not $taskReport.success -or $taskReport.passed -ne 4 -or $taskReport.expected -ne 4 -or $taskReport.skipped -ne 0) {
        throw '原生集成测试未通过，详见 reports/native-integration.json 和日志'
    }
} finally { Pop-Location }
