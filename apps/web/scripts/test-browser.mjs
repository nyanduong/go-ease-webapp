import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// The isolated build never contains personal .env values, never calls a live provider,
// and never replaces the production artifact in dist/.
execFileSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import { build } from 'vite'; await build({ build: { outDir: 'dist-test' } });",
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_API_BASE_URL: 'https://api.goease.test',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_fixture_00000000',
      VITE_GOOGLE_MAPS_API_KEY: 'offline_fixture_map_key',
      VITE_AI_DEMO_ENABLED: 'true',
      VITE_AI_API_BASE_URL: 'https://ai.goease.test',
    },
  },
);
execFileSync(process.execPath, ['--test', 'tests/browser.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
