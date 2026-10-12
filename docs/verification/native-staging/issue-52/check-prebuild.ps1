param([Parameter(Mandatory = $true)][string] $PinnedNodeDirectory, [Parameter(Mandatory = $true)][string] $PinnedPnpmScript)
# Internal scratch helper of guarded REPRODUCE.ps1, before any native build.
# Do not run independently on a generated checkout with work/builds in progress.
$ErrorActionPreference = 'Stop'
$taskCheckout = 'C:/ge52'
$taskGradle = Join-Path $taskCheckout 'apps/mobile/android/build.gradle'
if ((& git -C $taskCheckout rev-parse HEAD) -ne '663d1552777fffcda5ffe931b386e854303e1c36') { throw 'Unexpected source SHA.' }
$env:PATH = $PinnedNodeDirectory + ';' + $env:PATH
$env:CI = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_NO_DOTENV = '1'
$env:GOEASE_APP_VARIANT = 'development'
$taskOriginal = [IO.File]::ReadAllText($taskGradle)
$taskFreshHash = (Get-FileHash -LiteralPath $taskGradle -Algorithm SHA256).Hash
$taskSentinelSource = "// GoEase #52 proof: preserve outside-before`n" + $taskOriginal + "// GoEase #52 proof: preserve outside-after`n"
[IO.File]::WriteAllText($taskGradle, $taskSentinelSource, (New-Object Text.UTF8Encoding($false)))
$taskBeforeHash = (Get-FileHash -LiteralPath $taskGradle -Algorithm SHA256).Hash
Set-Location -LiteralPath $taskCheckout
& node $PinnedPnpmScript --filter @goease/mobile exec expo prebuild --platform android --no-install --no-clean
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ((Get-FileHash -LiteralPath $taskGradle -Algorithm SHA256).Hash -ne $taskBeforeHash) { throw 'Repeated prebuild changed root Gradle bytes.' }
Write-Output 'PASS real repeated prebuild: root Gradle SHA256 unchanged'
$taskBegin = '// @generated begin goease-windows-native-staging'
$taskEnd = '// @generated end goease-windows-native-staging'
$taskFrom = $taskSentinelSource.IndexOf($taskBegin)
$taskTo = $taskSentinelSource.IndexOf($taskEnd) + $taskEnd.Length
if ($taskFrom -lt 0 -or $taskTo -le $taskFrom) { throw 'Missing current managed block.' }
$taskFixture = [IO.File]::ReadAllText((Join-Path $taskCheckout 'apps/mobile/test/fixtures/windows-native-staging-legacy.gradle')).Replace("`r`n", "`n")
$taskLegacyFrom = $taskFixture.IndexOf('// GoEase: short Windows Nitro build directories')
$taskLegacyTo = $taskFixture.IndexOf("`n`n// Sentinel configuration after")
if ($taskLegacyFrom -lt 0 -or $taskLegacyTo -le $taskLegacyFrom) { throw 'Missing known legacy fixture block.' }
$taskLegacy = $taskFixture.Substring($taskLegacyFrom, $taskLegacyTo - $taskLegacyFrom)
$taskLegacySource = $taskSentinelSource.Substring(0, $taskFrom) + $taskLegacy + $taskSentinelSource.Substring($taskTo)
[IO.File]::WriteAllText($taskGradle, $taskLegacySource, (New-Object Text.UTF8Encoding($false)))
& node $PinnedPnpmScript --filter @goease/mobile exec expo prebuild --platform android --no-install --no-clean
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ((Get-FileHash -LiteralPath $taskGradle -Algorithm SHA256).Hash -ne $taskBeforeHash) { throw 'Legacy upgrade differs from fresh prebuild root Gradle bytes.' }
Write-Output 'PASS real legacy-upgrade prebuild: matches fresh root Gradle SHA256, preserving outside bytes'
Write-Output ('rootGradleSha256=' + $taskBeforeHash)
[IO.File]::WriteAllText($taskGradle, $taskOriginal, (New-Object Text.UTF8Encoding($false)))
if ((Get-FileHash -LiteralPath $taskGradle -Algorithm SHA256).Hash -ne $taskFreshHash) { throw 'Fresh generated Gradle bytes were not restored.' }
Write-Output ('restoredFreshRootGradleSha256=' + $taskFreshHash)
