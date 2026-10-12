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
$env:PATH = $PinnedNodeDirectory + ';' + (Join-Path $JdkDirectory 'bin') + ';' + $env:PATH
$env:JAVA_HOME = $JdkDirectory
$env:ANDROID_HOME = $AndroidSdkDirectory
$env:CI = '1'
$env:EXPO_NO_TELEMETRY = '1'
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
