import type { ConfigContext, ExpoConfig } from 'expo/config';
import { apiBaseUrl } from './src/lib/config.ts';
import { googleClientId } from './src/features/auth/google.ts';

export function buildConfig(environment: Record<string, string | undefined>): ExpoConfig {
  const variant = environment.GOEASE_APP_VARIANT ?? 'development';
  if (variant !== 'development' && variant !== 'preview') throw new Error('GOEASE_APP_VARIANT phải là development hoặc preview.');
  const development = variant === 'development';
  const iosClient = googleClientId(environment.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  if (!development) apiBaseUrl(environment.EXPO_PUBLIC_API_BASE_URL, 'preview');
  return {
    name: development ? 'GoEase Dev' : 'GoEase Preview', slug: 'goease', version: '0.1.0',
    platforms: ['android', 'ios'], orientation: 'portrait',
    scheme: development ? 'goease-dev' : 'goease-preview',
    android: { package: development ? 'vn.goease.mobile.dev' : 'vn.goease.mobile.preview' },
    ios: { bundleIdentifier: development ? 'vn.goease.mobile.dev' : 'vn.goease.mobile.preview', supportsTablet: false,
      infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: development },
        ...(development ? { NSLocalNetworkUsageDescription: 'Kết nối API và Metro trong mạng phát triển GoEase.' } : {}) } },
    plugins: ['expo-dev-client', ['./plugins/with-development-network.cjs', { allowHttp: development }],
      ['expo-splash-screen', { backgroundColor: '#f4f7f2', image: './assets/splash.png' }],
      ['expo-secure-store', { configureAndroidBackup: true }],
      './plugins/with-windows-native-staging.cjs',
      ...(iosClient ? [['react-native-nitro-google-signin', { iosUrlScheme: `com.googleusercontent.apps.${iosClient.replace('.apps.googleusercontent.com', '')}` }] as [string, { iosUrlScheme: string }]] : [])],
    extra: { appVariant: variant },
  };
}
export default (_context: ConfigContext) => buildConfig(process.env);
