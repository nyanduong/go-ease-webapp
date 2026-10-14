// Check the frozen installation against the SDK manifest it ships with.
// Remote patch recommendations are reviewed separately; never auto-upgrade the demo.
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { resolve, dirname, join } = require('node:path');
const mobileRequire = createRequire(resolve(__dirname, '../../apps/mobile/package.json'));
const expoPath = mobileRequire.resolve('expo/package.json');
const expoRequire = createRequire(expoPath);
const cliRequire = createRequire(expoRequire.resolve('@expo/cli'));
const { satisfies } = cliRequire('semver');
function incompatibilities(expected, installed) {
  return Object.entries(expected).filter(([name, range]) => !installed[name] || !satisfies(installed[name], range));
}
module.exports = { incompatibilities };
if (require.main === module) {
  try {
    const pkg = mobileRequire('./package.json');
    const expo = JSON.parse(readFileSync(expoPath, 'utf8'));
    const bundled = JSON.parse(readFileSync(join(dirname(expoPath), 'bundledNativeModules.json'), 'utf8'));
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    const expected = { expo: declared.expo };
    for (const name of Object.keys(declared)) if (bundled[name]) expected[name] = bundled[name];
    const installed = {};
    for (const name of Object.keys(expected)) {
      try { installed[name] = JSON.parse(readFileSync(mobileRequire.resolve(`${name}/package.json`), 'utf8')).version; }
      catch { /* Missing or unreadable installed package must fail. */ }
    }
    const bad = incompatibilities(expected, installed);
    if (bad.length) {
      console.error('SDK compatibility failed:', bad.map(([name, range]) => `${name}: installed ${installed[name] ?? 'missing'}, expected ${range}`).join('; '));
      process.exitCode = 1;
    } else console.info(`SDK ${expo.version}: ${Object.keys(expected).length} installed dependencies match bundled manifest + declared Expo range. Remote patch freshness is not checked.`);
  } catch { console.error('SDK compatibility check failed to read the installed manifest/packages.'); process.exitCode = 1; }
}
