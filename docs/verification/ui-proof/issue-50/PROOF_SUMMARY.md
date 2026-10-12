# Android native component proof — issue #50

This is a test-only entry for the actual production `TripsList`, `Brand`, `PhotoCredit`, and shared native theme, with synthetic props. It does not import or mount production `AppScreens`, `NativeAuthProvider`, Trips store/transport, editor, Maps, or the technical Health screen. It does not bypass production authentication and does not prove live CRUD, Google OAuth, preview distribution, keyboard handling, real-phone or iOS UAT.

## Source/build

- Historical first source: `bc09e4fd9ff57dd2555977280ef71f8c26a42aa9` (use first-source manifest for exact commit; this abbreviated receipt line must not override manifest).
- Final component source: `ddd78ccd4da8b43738f318323b8a40f1b31c007e`.
- Host Windows11; Node24.21.0, pnpm10.34.6, JDK21, existing SDK36/NDK27.1/CMake3.22.1/Gradle9.3.1.
- Local generated debug test signer; Release variant, x86_64 only, `DEBUG=false`, unique application ID `vn.goease.mobile.uiproof`. This is not the EAS preview signer or a phone preview APK.
- One-shot bundled JS/assets via Gradle Expo `export:embed`; no Metro server, expo start, public listener, paid service, cloud build or API credentials.
- First successful build:8m18s,667tasks(604executed/63cached). First APK31,132,892bytes/SHA256 `E2B1E0CA1006AD13A32BDA250A7908FA2127BD73E5EFF2710D9772F436C25BA8`.
- Final incremental build:53s,667tasks(16executed/651cached). Final APK31,133,748bytes/SHA256 `40A8F2837AAA1A5928EB441D47113FF64752AA7E2CA8029358126BA2BBDADF1D`.
- Initial init hook incorrectly targeted included Gradle plugin builds without `:app`; failed11s, fixed only temporary hook guard. Next attempt failed5m49s because Expo modules-core Release CMake pnpm paths exceeded Windows Ninja limits. Supported temporary `externalNativeBuild.cmake.buildStagingDirectory=C:/ge50-cxx/expo` fixed this; no vendor/SDK/registry/security changes. Existing product plugin only shortens Nitro. Windows product Release is not claimed reproducible without this separate recipe.

## Runtime/tests

Android15/API35 existing Pixel4 AVD, read-only/no-snapshot/headless, WHPX, software GPU,1536MiB/2cores. AVD was stopped during compilation, and stopped after final proof; size/density/font overrides reset first. Only owned emulator/test package manipulated. Production development app/session preserved.

Final Maestro2.11.0 local flows:3/3 PASS. State flow39s covers six conditions (saved data,empty,error,loading,draft,pending), seven screenshots (data home/card plus five other conditions), and create/open/retry/resume callbacks. These callbacks only update an explicit fixture banner; no actual trip save/open/retry is performed. Two layout flows14s each cover scroll/create/open callbacks at360×800dp/fontScale1.3 and430×932dp/fontScale1.0. Baseline1080×2280px/density440 (~393×829dp)/fontScale1.0.

Final screenshots were visually inspected at small enlarged-font and large settings: Vietnamese text wraps, hero/card and actions remain reachable by scroll, no observed horizontal clipping. This is limited visual proof, not a complete accessibility/keyboard/device matrix. Test banner remains visible so synthetic data cannot be mistaken for live data.

First historical cold launch atbc09e4f showed white system status icons on cream; subsequent same-APK Maestro relaunch showed dark icons. Final fresh install/cold settled screenshot and all reviewed final captures show dark icons. The earlier symptom did not reproduce; cause remains unproven. The fixture itself mounts `StatusBar dark-content`; it does not prove production AppScreens lifecycle or root code fix. Keep this limitation until production runtime is tested.

App-specific logcat has no fatal Android/JS exception in reviewed runs. Warnings retained: deprecated native SDK/Kotlin/C++/Gradle10 compatibility; software GPU fallback; RN StatusBar background/translucency ignored under edge-to-edge (style still supported). Do not describe logs as clean.

## Reproduce and evidence

Use a clean temporary short clone at C:/ge50 with no real .env or account secrets; checkout the receipt commit. `REPRODUCE.ps1` accepts already-installed pinned Node/pnpm/JDK/SDK paths, frozen installs/builds contracts/prebuilds Android, copies the test entries only in that temporary clone, then assembles Release with `native.init.gradle`. Exact entry/init/source hashes are in final-source-manifest.json. Copy no APK/key/generated Android directory into Git.

Boot only owned test AVD after compiler exit:

```powershell
emulator -avd MMA301_Pixel_4_API_35 -read-only -no-snapshot -no-window -memory 1536 -cores 2 -gpu software
adb -s emulator-5554 install -r C:/ge50/apps/mobile/android/app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell am start -W -n vn.goease.mobile.uiproof/vn.goease.mobile.dev.MainActivity
```

Process-local Maestro settings: `JAVA_HOME` existingJDK21, `MAESTRO_OPTS=-Xmx256m`, `MAESTRO_CLI_NO_ANALYTICS=true`, `MAESTRO_DISABLE_UPDATE_CHECK=true`, `MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true`. Run local `maestro --device emulator-5554 test --format JUNIT --output <junit.xml> --test-output-dir <artifacts> --debug-output <debug> trips-home.yaml`. No cloud, login or analyze options.

For layout variants, use owned AVD only: `adb -s emulator-5554 shell wm size 1080x2400`, `adb -s emulator-5554 shell wm density 480`, `adb -s emulator-5554 shell settings put system font_scale 1.3`. Run trips-layout-variant.yaml. Large uses size1290x2796/density480/font1.0. Reset size/density/font1.0, then `adb -s emulator-5554 emu kill`. Never apply these settings to a user's real phone.

Artifacts remain local outside Git: final-maestro (seven screenshots), small-font13-maestro (three), large-font10-maestro (three), JUnit reports, app-specific logs and build logs. Public docs should copy only this test entry/init/flow/recipe/manifests and a concise log summary; no raw device logcat, APK, credentials or generated native output.

