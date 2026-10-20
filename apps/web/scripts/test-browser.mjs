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
      VITE_CLOUDINARY_DALAT_URL:
        'https://res.cloudinary.com/goease-test/image/upload/v1/goease/dalat-illustration.png',
      VITE_CLOUDINARY_LOGIN_LAKE_URL:
        'https://res.cloudinary.com/goease-test/image/upload/v1/goease/login-lake.webp',
      VITE_CLOUDINARY_LOGIN_LANE_URL:
        'https://res.cloudinary.com/goease-test/image/upload/v1/goease/login-lane.webp',
      VITE_AI_DEMO_ENABLED: 'true',
      VITE_AI_API_BASE_URL: 'https://ai.goease.test',
    },
  },
);
const targets = process.argv.slice(2);
execFileSync(
  process.execPath,
  [
    '--test',
    ...(targets.length ? targets : ['tests/browser.test.mjs', 'tests/discovery-browser.test.mjs']),
  ],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
