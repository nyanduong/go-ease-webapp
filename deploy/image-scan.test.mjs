/* global structuredClone */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { summarizeImageReport } from './image-scan.mjs';
import { extractReportLog, reportLogLines } from './image-report-log.mjs';

const imageID = 'sha256:' + 'a'.repeat(64);
const report = results => ({ SchemaVersion: 2, ArtifactType: 'container_image', Metadata: {
  ImageID: imageID, ImageConfig: { architecture: 'amd64', os: 'linux' }, OS: { Family: 'debian', Name: '12' },
}, Results: results });
const advisory = (id, severity, fixed) => ({ VulnerabilityID: id, PkgName: 'TEST_ONLY',
  InstalledVersion: '1.0', Severity: severity, ...(fixed === undefined ? {} : { FixedVersion: fixed }) });
const osPackages = { Class: 'os-pkgs', Type: 'debian', Packages: [{ Name: 'perl-base', Version: '1.0' }] };
const nodePackages = { Class: 'lang-pkgs', Type: 'node-pkg', Packages: [{ Name: '@nestjs/core', Version: '1.0' }] };

test('image gate retains unfixed/unknown advisories separately from fixable OS and library findings', () => {
  const value = summarizeImageReport(report([
    { ...osPackages, Vulnerabilities: [advisory('TEST-1', 'CRITICAL'), advisory('TEST-2', 'LOW', '2.0')] },
    { ...nodePackages, Vulnerabilities: [advisory('TEST-3', 'HIGH', '3.0'), advisory('TEST-4', 'UNKNOWN', '')] },
  ]), imageID, 'api');
  assert.equal(value.fixable, 2);
  assert.equal(value.findings.length, 4);
  assert.deepEqual(value.counts, { CRITICAL: 1, HIGH: 1, MEDIUM: 0, LOW: 1, UNKNOWN: 1 });
  assert.equal(value.releaseReady, false);
  assert.deepEqual(value.inventory, { debian: 1, 'node-pkg': 1 });
  assert.equal(summarizeImageReport(report([osPackages]), imageID, 'admin').fixable, 0);
  assert.throws(() => summarizeImageReport(report([osPackages]), imageID, 'api'));
  assert.throws(() => summarizeImageReport(report([osPackages, nodePackages]), imageID, 'operator'));
  const operator = { ...nodePackages, Packages: [...nodePackages.Packages, { Name: 'prisma', Version: '1.0' }] };
  assert.equal(summarizeImageReport(report([osPackages, operator]), imageID, 'operator').fixable, 0);
});

test('full image reports round-trip byte-exact through prefixed CI logs without artifact storage', () => {
  const inventory = Array.from({ length: 1000 }, (_, index) => createHash('sha256').update(`TEST_ONLY-${index}`).digest('hex'));
  const bytes = Buffer.from(JSON.stringify({ inventory, findings: [advisory('TEST-1', 'CRITICAL')] }, null, 2));
  const chunks = reportLogLines('api.json', bytes);
  assert.ok(chunks.length > 3, 'fixture must exercise multiple log chunks');
  const log = ['api.json', 'operator.json', 'admin.json', 'pg-tools.json', 'summary.json']
    .flatMap(name => reportLogLines(name, bytes)).map(line => `Quality Gate\tcontainer step\t2026-10-12T00:00:00Z ${line}`).join('\n');
  const decoded = extractReportLog(log);
  assert.equal(decoded.size, 5);
  for (const value of decoded.values()) assert.deepEqual(value, bytes);
  assert.throws(() => extractReportLog(log.split('\n').slice(0, -1).join('\n')));
  const reordered = log.split('\n');
  [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  assert.throws(() => extractReportLog(reordered.join('\n')));
  const missing = log.split('\n'); missing.splice(2, 1);
  assert.throws(() => extractReportLog(missing.join('\n')));
  assert.throws(() => extractReportLog(log.replace(/(GOEASE_SCAN_FILE api.json )([a-f0-9]{64})/, '$1' + 'b'.repeat(64))));
});

test('image reports cannot pass with another image, platform, schema, coverage or malformed advisory', () => {
  const valid = report([osPackages]);
  assert.throws(() => summarizeImageReport(valid, 'sha256:' + 'b'.repeat(64), 'admin'));
  for (const mutation of [
    value => { value.SchemaVersion = 1; },
    value => { value.Metadata.ImageConfig.architecture = 'arm64'; },
    value => { delete value.Metadata.OS; },
    value => { delete value.Results; },
    value => { value.Results = []; },
    value => { delete value.Results[0].Packages; },
    value => { value.Results = [{ Class: 'other' }]; },
    value => { value.Results[0].Vulnerabilities = [advisory('TEST-1', 'unexpected')]; },
    value => { value.Results[0].Vulnerabilities = [advisory('TEST-1', 'HIGH', ['2.0'])]; },
  ]) {
    const invalid = structuredClone(valid); mutation(invalid);
    assert.throws(() => summarizeImageReport(invalid, imageID, 'admin'));
  }
});
