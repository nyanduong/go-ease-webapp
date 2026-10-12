const { withProjectBuildGradle } = require('expo/config-plugins');

// Android's bundled Ninja 1.10 cannot stat some pnpm-prefab paths on Windows.
// Keep staging under the Android root, without changing vendor/toolchain files.
const begin = '// @generated begin goease-windows-native-staging';
const end = '// @generated end goease-windows-native-staging';
const gradle = `${begin}
if (System.getProperty('os.name').toLowerCase(java.util.Locale.ROOT).contains('windows')) {
    def goeaseNativeStages = [
        'expo-modules-core': 'expo',
        'react-native-nitro-modules': 'nitro',
        'react-native-nitro-google-signin': 'google-signin'
    ]
    subprojects { nativeProject ->
        def stageName = goeaseNativeStages[nativeProject.name]
        if (stageName != null) {
            nativeProject.plugins.withId('com.android.library') {
                nativeProject.extensions.getByName('androidComponents').finalizeDsl { androidDsl ->
                    androidDsl.externalNativeBuild.cmake.buildStagingDirectory =
                        rootProject.file('.cxx/' + stageName)
                }
            }
        }
    }
}
${end}`;

// The former plugin appended this unbounded block. Migrate only its exact known
// output: guessing the closing brace could delete unrelated Gradle configuration.
const legacyMarker = '// GoEase: short Windows Nitro build directories';
const legacy = `${legacyMarker}
if (System.getProperty('os.name').toLowerCase(java.util.Locale.ROOT).contains('windows')) {
    def goeaseNativeStages = [
        'react-native-nitro-modules': 'nitro',
        'react-native-nitro-google-signin': 'google-signin'
    ]
    subprojects { nativeProject ->
        def stageName = goeaseNativeStages[nativeProject.name]
        if (stageName != null) {
            nativeProject.plugins.withId('com.android.library') {
                nativeProject.extensions.getByName('android').externalNativeBuild.cmake.buildStagingDirectory =
                    rootProject.file('.cxx/' + stageName)
            }
        }
    }
}`;

function positions(contents, marker) {
  const result = [];
  for (let index = contents.indexOf(marker); index !== -1; index = contents.indexOf(marker, index + marker.length)) result.push(index);
  return result;
}

function hasLineBoundaries(contents, from, to) {
  return (from === 0 || contents[from - 1] === '\n') && ['', '\n', '\r\n'].includes(contents.slice(to, to + (contents[to] === '\r' ? 2 : 1)));
}

function upsert(contents) {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const block = gradle.replaceAll('\n', newline);
  const starts = positions(contents, begin);
  const ends = positions(contents, end);
  const oldStarts = positions(contents, legacyMarker);
  if (starts.length || ends.length) {
    if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0] || oldStarts.length) {
      throw new Error('GoEase Windows staging: managed block thiếu mốc hoặc bị trùng; giữ nguyên Gradle để kiểm tra.');
    }
    const from = starts[0];
    const to = ends[0] + end.length;
    if (!hasLineBoundaries(contents, from, to)) {
      throw new Error('GoEase Windows staging: mốc phải nằm trên dòng riêng; giữ nguyên Gradle để kiểm tra.');
    }
    return contents.slice(0, from) + block + contents.slice(to);
  }
  if (oldStarts.length) {
    const oldBlock = legacy.replaceAll('\n', newline);
    if (oldStarts.length !== 1 || contents.slice(oldStarts[0], oldStarts[0] + oldBlock.length) !== oldBlock || !hasLineBoundaries(contents, oldStarts[0], oldStarts[0] + oldBlock.length)) {
      throw new Error('GoEase Windows staging: block Nitro cũ đã thay đổi; giữ nguyên Gradle để kiểm tra trước khi migrate.');
    }
    return contents.slice(0, oldStarts[0]) + block + contents.slice(oldStarts[0] + oldBlock.length);
  }
  return contents + (contents.length ? (contents.endsWith('\n') ? newline : newline + newline) : '') + block + newline;
}

module.exports = config => withProjectBuildGradle(config, mod => {
  if (mod.modResults.language !== 'groovy') throw new Error('GoEase Android root Gradle phải dùng Groovy.');
  mod.modResults.contents = upsert(mod.modResults.contents);
  return mod;
});
