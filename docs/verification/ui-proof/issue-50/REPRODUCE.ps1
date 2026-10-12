param(
  [Parameter(Mandatory = $true)][string] $PinnedNodeDirectory,
  [Parameter(Mandatory = $true)][string] $PinnedPnpmScript,
  [Parameter(Mandatory = $true)][string] $JdkDirectory,
  [Parameter(Mandatory = $true)][string] $AndroidSdkDirectory
)
# Run only on the isolated short checkout C:/ge50, checked out at the receipt commit.
# Prerequisites: existing approved toolchains/SDK licenses; no paid service/account required.
# Never copy these entries into the production workspace or change production index.ts.
$ErrorActionPreference = 'Stop'
$taskProofCheckout = 'C:/ge50'
$taskMobile = Join-Path $taskProofCheckout 'apps/mobile'
$taskExpectedCommit = 'ddd78ccd4da8b43738f318323b8a40f1b31c007e'
$taskExpectedMobileTree = '22b44b2c7d26289e4a2f4ee93750e1e1607d7e2c'
# Fail before install/prebuild/copy. Do not echo any configuration values.
$taskExternalConfig = @(Get-ChildItem Env: | Where-Object {
  $_.Value -ne '' -and $_.Name -match '^(EXPO_PUBLIC_|GOOGLE_|GEMINI_|DATABASE_|EXPO_TOKEN$|EAS_|ANDROID_KEYSTORE|ANDROID_KEY_ALIAS|ANDROID_KEY_PASSWORD|ANDROID_STORE_PASSWORD|GOEASE_.*SIGN)'
} | ForEach-Object { $_.Name })
if ($taskExternalConfig.Count -gt 0) {
  throw ('Use an isolated process without external config: ' + ($taskExternalConfig -join ', '))
}
foreach ($taskDirectory in @($taskProofCheckout, (Join-Path $taskProofCheckout 'apps'), $taskMobile, (Join-Path $taskMobile 'android'))) {
  if (Test-Path -LiteralPath $taskDirectory) {
    $taskItem = Get-Item -LiteralPath $taskDirectory
    if (-not $taskItem.PSIsContainer -or ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'Proof checkout directories must be ordinary directories, not links.'
    }
  }
}
$taskResolvedCheckout = (Resolve-Path -LiteralPath $taskProofCheckout).Path.Replace('\', '/').TrimEnd('/')
if ($taskResolvedCheckout -ine $taskProofCheckout) { throw 'Unexpected proof checkout path.' }
$taskGitRoot = & git -C $taskProofCheckout rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or $taskGitRoot.TrimEnd('/') -ine $taskProofCheckout) { throw 'Expected a separate Git checkout at C:/ge50.' }
$taskCommit = & git -C $taskProofCheckout rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $taskCommit -ne $taskExpectedCommit) { throw 'Proof checkout commit does not match the receipt.' }
$taskMobileTree = & git -C $taskProofCheckout rev-parse HEAD:apps/mobile
if ($LASTEXITCODE -ne 0 -or $taskMobileTree -ne $taskExpectedMobileTree) { throw 'Proof mobile tree does not match the receipt.' }
$taskDirty = & git -C $taskProofCheckout status --porcelain
if ($LASTEXITCODE -ne 0 -or $taskDirty) { throw 'Proof checkout must be clean; preserve existing work and use a fresh isolated clone.' }
foreach ($taskEntry in @((Join-Path $taskMobile '.goease-ui-proof.tsx'), (Join-Path $taskMobile 'android/.goease-ui-proof.tsx'))) {
  if (Test-Path -LiteralPath $taskEntry) { throw 'A fixture entry already exists; do not overwrite it.' }
}
$env:PATH = $PinnedNodeDirectory + ';' + (Join-Path $JdkDirectory 'bin') + ';' + $env:PATH
$env:JAVA_HOME = $JdkDirectory
$env:ANDROID_HOME = $AndroidSdkDirectory
$env:CI = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_NO_DOTENV = '1'
$env:GOEASE_APP_VARIANT = 'development'
# No Google/Maps/API/signing secrets are configured for this fixture.
Set-Location -LiteralPath $taskProofCheckout
& node $PinnedPnpmScript install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node $PinnedPnpmScript --filter @goease/contracts build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node $PinnedPnpmScript --filter @goease/mobile exec expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixture-entry.tsx') -Destination (Join-Path $taskMobile '.goease-ui-proof.tsx')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixture-native-forwarder.tsx') -Destination (Join-Path $taskMobile 'android/.goease-ui-proof.tsx')
$env:NODE_ENV = 'production'
[Environment]::SetEnvironmentVariable('ORG_GRADLE_PROJECT_kotlin.compiler.execution.strategy', 'in-process', 'Process')
$taskInitPath = Join-Path $PSScriptRoot 'native.init.gradle'
Set-Location -LiteralPath (Join-Path $taskMobile 'android')
# One-shot Expo export:embed -> Hermes -> packaged assets. No Metro/expo start/listener.
# Init script uses debug test signer from generated Android project, unique applicationId
# vn.goease.mobile.uiproof, one CMake worker, and C:/ge50-cxx/expo short staging.
.\gradlew.bat :app:assembleRelease --no-daemon --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m' '-Dorg.gradle.parallel=false' '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=x86_64' -I $taskInitPath
exit $LASTEXITCODE
