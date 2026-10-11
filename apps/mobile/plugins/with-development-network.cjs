const { withAndroidManifest } = require('expo/config-plugins');

module.exports = (config, { allowHttp = false } = {}) => withAndroidManifest(config, (mod) => {
  const application = mod.modResults.manifest.application?.[0];
  if (!application) throw new Error('Android manifest thiếu application.');
  application.$['android:usesCleartextTraffic'] = allowHttp ? 'true' : 'false';
  return mod;
});
