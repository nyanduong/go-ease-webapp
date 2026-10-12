param(
  [Parameter(Mandatory = $true)][string] $PinnedNodeDirectory,
  [Parameter(Mandatory = $true)][string] $PinnedPnpmScript,
  [Parameter(Mandatory = $true)][string] $JdkDirectory,
  [Parameter(Mandatory = $true)][string] $AndroidSdkDirectory
)
# Use a fresh separate local clone at C:/ge52 with the recorded product source.
# Existing approved JDK/SDK/licenses and cached packages are prerequisites.
# This script never removes a checkout or existing generated native directory.
$ErrorActionPreference = 'Stop'
$taskCheckout = 'C:/ge52'
$taskMobile = Join-Path $taskCheckout 'apps/mobile'
$taskExpectedCommit = '663d1552777fffcda5ffe931b386e854303e1c36'
$taskExpectedMobileTree = 'ed2931bd3c6468e5aac3f136696d158944ed2da5'
$taskExternalConfig = @(Get-ChildItem Env: | Where-Object {
  $_.Value -ne '' -and $_.Name -match '^(EXPO_PUBLIC_|GOOGLE_|GEMINI_|DATABASE_|EXPO_TOKEN$|EAS_|ANDROID_KEYSTORE|ANDROID_KEY_ALIAS|ANDROID_KEY_PASSWORD|ANDROID_STORE_PASSWORD|GOEASE_.*SIGN)'
} | ForEach-Object { $_.Name })
if ($taskExternalConfig.Count -gt 0) { throw ('Use an isolated process without external config: ' + ($taskExternalConfig -join ', ')) }
foreach ($taskDirectory in @($taskCheckout, (Join-Path $taskCheckout 'apps'), $taskMobile)) {
  $taskItem = Get-Item -LiteralPath $taskDirectory
  if (-not $taskItem.PSIsContainer -or ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Expected ordinary checkout directories, not links.' }
}
if ((Resolve-Path -LiteralPath $taskCheckout).Path.Replace('\', '/').TrimEnd('/') -ine $taskCheckout) { throw 'Unexpected checkout path.' }
$taskGitRoot = & git -C $taskCheckout rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or $taskGitRoot.TrimEnd('/') -ine $taskCheckout) { throw 'Expected separate C:/ge52 Git checkout.' }
$taskCommit = & git -C $taskCheckout rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $taskCommit -ne $taskExpectedCommit) { throw 'Source SHA differs from receipt.' }
$taskMobileTree = & git -C $taskCheckout rev-parse HEAD:apps/mobile
if ($LASTEXITCODE -ne 0 -or $taskMobileTree -ne $taskExpectedMobileTree) { throw 'Mobile tree differs from receipt.' }
$taskDirty = & git -C $taskCheckout status --porcelain
if ($LASTEXITCODE -ne 0 -or $taskDirty) { throw 'Preserve existing work; use a fresh clean clone.' }
foreach ($taskDirectory in @($taskCheckout, $taskMobile, (Join-Path $taskCheckout 'apps/api'), (Join-Path $taskCheckout 'apps/web'))) {
  $taskEnvFiles = @(Get-ChildItem -LiteralPath $taskDirectory -Force -Filter '.env*' | Where-Object { $_.Name -ne '.env.example' })
  if ($taskEnvFiles.Count) { throw 'Environment files are present; use a fresh clone without them.' }
}
if (Test-Path -LiteralPath (Join-Path $taskMobile 'android')) { throw 'Native directory already exists; preserve it and use a fresh clone.' }
$env:PATH = $PinnedNodeDirectory + ';' + (Join-Path $JdkDirectory 'bin') + ';' + $env:PATH
$env:JAVA_HOME = $JdkDirectory
$env:ANDROID_HOME = $AndroidSdkDirectory
$env:CI = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_NO_DOTENV = '1'
$env:GOEASE_APP_VARIANT = 'development'
Set-Location -LiteralPath $taskCheckout
& node $PinnedPnpmScript install --offline --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node $PinnedPnpmScript --filter @goease/contracts build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node $PinnedPnpmScript --filter @goease/mobile exec expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot 'check-prebuild.ps1') -PinnedNodeDirectory $PinnedNodeDirectory -PinnedPnpmScript $PinnedPnpmScript
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:NODE_ENV = 'production'
[Environment]::SetEnvironmentVariable('ORG_GRADLE_PROJECT_kotlin.compiler.execution.strategy', 'in-process', 'Process')
Set-Location -LiteralPath (Join-Path $taskMobile 'android')
# One-shot export:embed/Hermes/assets from real index.ts, not a dev-server.
# Generated default debug test signer only; no private preview signer or installation.
.\gradlew.bat :app:assembleRelease --no-daemon --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m' '-Dorg.gradle.parallel=false' '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=x86_64' -I (Join-Path $PSScriptRoot 'native.init.gradle')
exit $LASTEXITCODE
