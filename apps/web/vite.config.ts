import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serviceWorkerSource } from './scripts/service-worker.mjs';

function customerPwa(): Plugin {
  let output = '';
  return {
    name: 'goease-customer-pwa',
    apply: 'build',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await readdir(output, { recursive: true }))
        .filter((file) => /\.(html|js|css|png|webmanifest)$/.test(file) && file !== 'sw.js')
        .sort();
      const hash = createHash('sha256');
      for (const file of files) {
        hash.update(file);
        hash.update(await readFile(resolve(output, file)));
      }
      await writeFile(
        resolve(output, 'sw.js'),
        serviceWorkerSource(
          hash.digest('hex').slice(0, 16),
          files.map((file) => '/' + file.replaceAll('\\', '/')),
        ),
      );
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), customerPwa()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
