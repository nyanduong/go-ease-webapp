/* global process, console */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const names = ['api.json', 'operator.json', 'admin.json', 'pg-tools.json', 'summary.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
/** Complete compressed reports in free CI logs, never metered artifact storage. */
export function reportLogLines(name, bytes) {
  assert.ok(names.includes(name));
  const encoded = gzipSync(bytes).toString('base64'), chunks = encoded.match(/.{1,4000}/g);
  return [`GOEASE_SCAN_FILE ${name} ${hash(bytes)} ${chunks.length}`,
    ...chunks.map((chunk, index) => `GOEASE_SCAN_CHUNK ${name} ${index} ${chunk}`)];
}
export function extractReportLog(log) {
  const files = new Map();
  for (const line of log.split(/\r?\n/)) {
    const header = /GOEASE_SCAN_FILE ([a-z.-]+) ([a-f0-9]{64}) (\d+)$/.exec(line);
    if (header) {
      const [, name, digest, count] = header;
      assert.ok(names.includes(name) && !files.has(name), 'Unexpected/duplicate report');
      assert.ok(Number(count) > 0 && Number(count) <= 10_000);
      files.set(name, { digest, count: Number(count), chunks: [] });
    }
    const chunk = /GOEASE_SCAN_CHUNK ([a-z.-]+) (\d+) ([A-Za-z0-9+/=]+)$/.exec(line);
    if (chunk) {
      const [, name, index, data] = chunk, file = files.get(name);
      assert.ok(file && Number(index) === file.chunks.length, 'Missing/reordered report chunk');
      file.chunks.push(data);
    }
  }
  assert.deepEqual([...files.keys()].sort(), [...names].sort(), 'All five reports required');
  return new Map([...files].map(([name, file]) => {
    assert.equal(file.chunks.length, file.count, 'Incomplete report');
    const bytes = gunzipSync(Buffer.from(file.chunks.join(''), 'base64'), { maxOutputLength: 32 * 1024 * 1024 });
    assert.equal(hash(bytes), file.digest, 'Report checksum mismatch');
    JSON.parse(bytes.toString('utf8'));
    return [name, bytes];
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reports = extractReportLog(await readFile(process.argv[2], 'utf8'));
  const destination = path.resolve(process.argv[3]);
  await mkdir(destination, { mode: 0o700 }); // New directory only; no overwrite.
  for (const [name, bytes] of reports) await writeFile(path.join(destination, name), bytes, { flag: 'wx', mode: 0o600 });
  console.info('Five complete image reports extracted and checksum-verified.');
}
