/* global process, console */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { reportLogLines } from './image-report-log.mjs';

const execute = promisify(execFile);
export const trivyVersion = '0.75.0';
const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

/** Preserve every advisory. A fixable gate is distinct from release approval. */
export function summarizeImageReport(report, imageID, target) {
  assert.ok(['api', 'operator', 'admin', 'pg-tools'].includes(target));
  assert.equal(report?.SchemaVersion, 2, 'Unsupported image report schema');
  assert.equal(report.ArtifactType, 'container_image');
  assert.equal(report.Metadata?.ImageID, imageID, 'Scan must identify the actual built image');
  assert.equal(report.Metadata.ImageConfig?.architecture, 'amd64');
  assert.equal(report.Metadata.ImageConfig?.os, 'linux');
  assert.ok(typeof report.Metadata.OS?.Family === 'string' && report.Metadata.OS.Family.length > 0);
  assert.ok(Array.isArray(report.Results), 'Missing image results');
  assert.ok(report.Results.some(result => result.Class === 'os-pkgs'), 'Missing OS package coverage');
  const inventory = {};
  const counts = Object.fromEntries(severities.map(severity => [severity, 0]));
  const findings = [];
  for (const result of report.Results) {
    assert.ok(['os-pkgs', 'lang-pkgs'].includes(result.Class), 'Unrecognized package coverage');
    assert.ok(Array.isArray(result.Packages) && result.Packages.length > 0, 'Missing package inventory');
    inventory[result.Type] = (inventory[result.Type] ?? 0) + result.Packages.length;
    assert.ok(result.Vulnerabilities === undefined || Array.isArray(result.Vulnerabilities));
    for (const vulnerability of result.Vulnerabilities ?? []) {
      assert.ok(severities.includes(vulnerability.Severity), 'Missing/invalid advisory severity');
      for (const name of ['VulnerabilityID', 'PkgName', 'InstalledVersion']) {
        assert.ok(typeof vulnerability[name] === 'string' && vulnerability[name].length > 0);
      }
      assert.ok(vulnerability.FixedVersion === undefined || typeof vulnerability.FixedVersion === 'string');
      counts[vulnerability.Severity]++;
      findings.push({
        class: result.Class, type: result.Type, id: vulnerability.VulnerabilityID,
        package: vulnerability.PkgName, installed: vulnerability.InstalledVersion,
        fixed: vulnerability.FixedVersion ?? '', severity: vulnerability.Severity,
      });
    }
  }
  if (target === 'api' || target === 'operator') {
    const nodePackages = report.Results.filter(result => result.Class === 'lang-pkgs' && result.Type === 'node-pkg')
      .flatMap(result => result.Packages);
    for (const name of target === 'operator' ? ['@nestjs/core', 'prisma'] : ['@nestjs/core']) {
      assert.ok(nodePackages.some(pkg => pkg.Name === name), 'Missing expected application library coverage');
    }
  }
  return { imageID, os: report.Metadata.OS, inventory, counts, findings,
    fixable: findings.filter(finding => finding.fixed.trim().length > 0).length,
    releaseReady: false };
}

/** Scan local final image IDs only, before any fixture secrets are mounted. */
export async function scanFinalImages(targets, reportDirectory, executable) {
  assert.ok(path.isAbsolute(reportDirectory ?? ''), 'Separate absolute report directory required');
  assert.ok(path.isAbsolute(executable ?? ''), 'Verified Trivy executable required');
  const reportRoot = path.resolve(reportDirectory), workspace = process.cwd();
  assert.ok(reportRoot !== workspace && !reportRoot.startsWith(workspace + path.sep), 'Reports must be outside build context');
  await mkdir(reportRoot, { recursive: true, mode: 0o700 });
  const scanRoot = await mkdtemp(path.join(os.tmpdir(), 'goease-trivy-'));
  const dockerConfig = path.join(scanRoot, 'docker'); await mkdir(dockerConfig);
  const cache = path.join(scanRoot, 'cache');
  // No inherited TRIVY options, registry credentials, repo ignore/config files,
  // source filesystem or private DB fixtures enter the scanner process.
  const env = { PATH: process.env.PATH, HOME: scanRoot, DOCKER_CONFIG: dockerConfig };
  const run = async args => (await execute(executable, args, {
    cwd: scanRoot, env, timeout: 240_000, maxBuffer: 1024 * 1024,
  })).stdout;
  const tool = JSON.parse(await run(['version', '--format', 'json']));
  assert.equal(tool.Version, trivyVersion, 'Unexpected scanner version');
  const results = [], errors = [];
  for (const { target, imageID } of targets) {
    assert.ok(['api', 'operator', 'admin', 'pg-tools'].includes(target));
    assert.match(imageID, /^sha256:[a-f0-9]{64}$/);
    const file = path.join(reportRoot, `${target}.json`);
    try {
      await run(['image', '--image-src', 'docker', '--scanners', 'vuln', '--pkg-types', 'os,library',
        '--db-repository', 'ghcr.io/aquasecurity/trivy-db:2', '--cache-dir', cache,
        '--offline-scan', '--list-all-pkgs', '--no-progress', '--timeout', '3m', '--format', 'json', '--output', file, imageID]);
      const bytes = await readFile(file);
      for (const line of reportLogLines(`${target}.json`, bytes)) console.info(line);
      const summary = summarizeImageReport(JSON.parse(bytes), imageID, target);
      results.push({ target, ...summary, reportSha256: createHash('sha256').update(bytes).digest('hex') });
      console.info(`Final image ${target}: ${JSON.stringify(summary.counts)}, fixable=${summary.fixable}; residuals are NOT release approval.`);
    } catch {
      // Never print raw child errors/diagnostics or inherited environment.
      errors.push(target);
    }
  }
  let database;
  try {
    database = JSON.parse(await readFile(path.join(cache, 'db/metadata.json'), 'utf8'));
    assert.equal(database.Version, 2);
    assert.ok(Number.isFinite(Date.parse(database.UpdatedAt)) && Number.isFinite(Date.parse(database.DownloadedAt)));
    const age = Date.now() - Date.parse(database.UpdatedAt);
    assert.ok(age >= -5 * 60 * 1000 && age < 48 * 60 * 60 * 1000, 'Stale/future vulnerability database');
  } catch { errors.push('database'); }
  const receipt = { sourceHead: process.env.GOEASE_SOURCE_HEAD ?? 'local-unattested',
    checkoutCommit: process.env.GITHUB_SHA ?? 'local-unattested', platform: 'linux/amd64',
    trivyVersion, database, results, errors, releaseReady: false };
  const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2));
  await writeFile(path.join(reportRoot, 'summary.json'), receiptBytes);
  for (const line of reportLogLines('summary.json', receiptBytes)) console.info(line);
  assert.deepEqual(errors, [], 'Final image scan incomplete/invalid; see dedicated reports');
  assert.equal(new Set(results.map(result => result.target)).size, 4, 'All four final targets must be scanned');
  return { fixable: results.reduce((count, result) => count + result.fixable, 0), releaseReady: false };
}
