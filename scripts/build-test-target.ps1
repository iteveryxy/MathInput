$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskOutput = Join-Path $taskRoot '.local'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $taskCompiler)) { throw '需要 .NET Framework 4 C# 编译器来创建独立测试输入框' }
& $taskCompiler /nologo /target:winexe "/out:$taskOutput\MathInput.TestTarget.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $taskRoot 'tests\windows\TestTarget.cs')
if ($LASTEXITCODE -ne 0) { throw '测试输入框编译失败' }
Write-Output (Join-Path $taskOutput 'MathInput.TestTarget.exe')
