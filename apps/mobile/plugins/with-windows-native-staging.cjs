const { withProjectBuildGradle } = require('expo/config-plugins');

// Android's bundled Ninja 1.10 cannot stat some pnpm-prefab paths on Windows.
// A short build directory keeps both regeneration inputs and C++ objects below
// its path limit. Keep vendor sources, toolchains and other platforms intact.
const marker = '// GoEase: short Windows Nitro build directories';
const gradle = `
${marker}
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
}
`;

module.exports = config => withProjectBuildGradle(config, mod => {
  if (mod.modResults.language !== 'groovy') throw new Error('GoEase Android root Gradle phải dùng Groovy.');
  if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += gradle;
  return mod;
});
