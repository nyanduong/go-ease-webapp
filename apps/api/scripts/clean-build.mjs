import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2];
if (!['dist', 'dist-demos'].includes(output)) throw new Error('Unknown build output');
const target = resolve(root, output);
if (dirname(target) !== root) throw new Error('Build output must stay inside apps/api');
rmSync(target, { recursive: true, force: true });
