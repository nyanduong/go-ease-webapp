import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const areas = ['apps/api', 'apps/web', 'apps/mobile', 'packages/contracts'] as const;
type Area = typeof areas[number];
export interface Violation { file: string; line: number; message: string }
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const testPath = /(?:^|\/)(?:__tests__|__mocks__|test|tests)(?:\/|$)|\.(?:test|spec)\.[^.]+$/;
const assetExtension = /\.(?:css|svg|png|jpe?g|webp|gif|ico|ttf|woff2?|json)$/;
const serverPackages = ['@nestjs/', '@prisma/', 'prisma', 'pg', 'postgres', 'mysql2', 'mongodb', 'typeorm', 'google-auth-library', '@google/genai', '@google/generative-ai', '@googlemaps/google-maps-services-js'];
const uiPackages = ['react', 'react-dom', 'react-native', 'expo', '@expo/', 'expo-'];
const slash = (path: string) => path.replaceAll('\\', '/');
const matchesPackage = (name: string, rule: string) => rule.endsWith('/') || rule.endsWith('-')
  ? name.startsWith(rule) : name === rule || name.startsWith(`${rule}/`);

function areaOf(root: string, file: string): Area | undefined {
  const path = slash(relative(root, file));
  return areas.find(area => path.startsWith(`${area}/`));
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (['node_modules', 'dist', '.expo', 'coverage'].includes(entry.name) || testPath.test(slash(path))) return [];
    return entry.isDirectory() ? sourceFiles(path) : sourceExtension.test(entry.name) ? [path] : [];
  });
}

function imports(source: ts.SourceFile): { node: ts.Node; specifier?: string }[] {
  const result: { node: ts.Node; specifier?: string }[] = [];
  const add = (node: ts.Node, value: ts.Node | undefined) => {
    result.push(value && ts.isStringLiteralLike(value) ? { node, specifier: value.text } : { node });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node, node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node, node.argument.literal);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      add(node, node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

export function checkArchitecture(repository: string): { files: number; violations: Violation[] } {
  const root = resolve(repository);
  const violations: Violation[] = [];
  const graph = new Map<string, string[]>();
  const options = new Map<Area, ts.CompilerOptions>();
  const workspaceNames = new Map<string, Area>();
  const pending: string[] = [];
  for (const area of areas) {
    const directory = join(root, area);
    workspaceNames.set(`@goease/${area.split('/')[1]}`, area);
    if (!existsSync(directory)) continue;
    const manifestPath = join(directory, 'package.json');
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string } : {};
    workspaceNames.set(manifest.name ?? `@goease/${area.split('/')[1]}`, area);
    const configPath = join(directory, 'tsconfig.json');
    let compilerOptions: ts.CompilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext };
    if (existsSync(configPath)) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
      compilerOptions = ts.parseJsonConfigFileContent(config.config, ts.sys, directory).options;
    }
    options.set(area, compilerOptions);
    pending.push(...sourceFiles(join(directory, 'src')));
    if (area === 'apps/mobile') {
      pending.push(...sourceFiles(join(directory, 'app')));
      for (const entry of ['App.tsx', 'App.js', 'index.ts', 'index.js']) {
        if (existsSync(join(directory, entry))) pending.push(join(directory, entry));
      }
    }
  }
  const cache = ts.createModuleResolutionCache(root, path => path);
  const visited = new Set<string>();
  for (let index = 0; index < pending.length; index++) {
    const file = pending[index]!;
    if (visited.has(file)) continue;
    visited.add(file);
    const area = areaOf(root, file)!;
    const compilerOptions = options.get(area)!;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const edges: string[] = [];
    graph.set(file, edges);
    for (const dependency of imports(source)) {
      const report = (message: string) => violations.push({ file: slash(relative(root, file)), line: source.getLineAndCharacterOfPosition(dependency.node.getStart(source)).line + 1, message });
      const name = dependency.specifier;
      if (name === undefined) { report('Import/require động phải dùng chuỗi cố định để kiểm tra ranh giới.'); continue; }
      if (area !== 'apps/api' && (name.startsWith('node:') || isBuiltin(name) || serverPackages.some(rule => matchesPackage(name, rule)))) {
        report(`Không được import module server/Node/DB: ${name}`);
      }
      if (area === 'packages/contracts' && uiPackages.some(rule => matchesPackage(name, rule))) report(`Contracts phải độc lập UI/framework: ${name}`);
      if (area === 'apps/web' && ['react-native', 'expo', '@expo/', 'expo-'].some(rule => matchesPackage(name, rule))) report(`Web không import UI native: ${name}`);
      if (area === 'apps/mobile' && ['react-dom', '@radix-ui/'].some(rule => matchesPackage(name, rule))) report(`Mobile không import UI DOM: ${name}`);
      let targetArea: Area | undefined;
      const workspace = [...workspaceNames].find(([packageName]) => name === packageName || name.startsWith(`${packageName}/`));
      if (workspace) targetArea = workspace[1];
      if (name.startsWith('.')) targetArea = areaOf(root, resolve(dirname(file), name));
      const aliasBase = compilerOptions.baseUrl
        ?? (compilerOptions as ts.CompilerOptions & { pathsBasePath?: string }).pathsBasePath ?? join(root, area);
      const aliasCandidates = Object.entries(compilerOptions.paths ?? {}).flatMap(([pattern, paths]) => {
        const [prefix, suffix] = pattern.split('*');
        const matches = suffix === undefined ? name === pattern : name.startsWith(prefix!) && name.endsWith(suffix);
        if (!matches) return [];
        const wildcard = suffix === undefined ? '' : name.slice(prefix!.length, name.length - suffix.length);
        return paths.map(path => resolve(aliasBase, path.replace('*', wildcard)));
      });
      const resolved = ts.resolveModuleName(name, file, compilerOptions, ts.sys, cache).resolvedModule;
      let target = resolved?.resolvedFileName;
      if (!target && assetExtension.test(name)) {
        target = name.startsWith('.') ? resolve(dirname(file), name) : aliasCandidates.find(path => existsSync(path));
      }
      // Workspace exports normally resolve to dist/.d.ts; inspect source instead.
      if (workspace && name === workspace[0]) target = join(root, workspace[1], 'src/index.ts');
      if (target && !slash(target).includes('/node_modules/')) targetArea = areaOf(root, target);
      targetArea ??= aliasCandidates.map(path => areaOf(root, path)).find(candidate => candidate !== undefined);
      if (targetArea && targetArea !== area && !(area !== 'packages/contracts' && targetArea === 'packages/contracts')) {
        report(`Import vượt ranh giới ${area} → ${targetArea}: ${name}`);
      }
      const internal = name.startsWith('.') || name.startsWith('#') || name.startsWith('@goease/') || !!workspace || aliasCandidates.length > 0;
      if ((!target || !existsSync(target)) && internal) {
        report(`Không phân giải được import nội bộ: ${name}`);
      }
      if (!target || slash(target).includes('/node_modules/') || assetExtension.test(name)) continue;
      target = resolve(target);
      if (!areaOf(root, target)) { report(`Import file ngoài workspace được phép: ${name}`); continue; }
      if (testPath.test(slash(relative(root, target)))) { report(`Code sản phẩm không import test/fixture: ${name}`); continue; }
      if (sourceExtension.test(target) && existsSync(target) && statSync(target).isFile()) {
        edges.push(target);
        pending.push(target);
      }
    }
  }
  const completed = new Set<string>();
  const active: string[] = [];
  const visit = (file: string) => {
    if (completed.has(file)) return;
    const cycleStart = active.indexOf(file);
    if (cycleStart >= 0) {
      violations.push({ file: slash(relative(root, file)), line: 1, message: `Vòng import: ${[...active.slice(cycleStart), file].map(path => slash(relative(root, path))).join(' → ')}` });
      return;
    }
    active.push(file);
    for (const target of graph.get(file) ?? []) visit(target);
    active.pop();
    completed.add(file);
  };
  for (const file of graph.keys()) visit(file);
  return { files: visited.size, violations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = checkArchitecture(root);
  for (const violation of result.violations) console.error(`${violation.file}:${violation.line} ${violation.message}`);
  console.log(`Architecture: ${result.files} source files, ${result.violations.length} violations.`);
  process.exitCode = result.violations.length ? 1 : 0;
}
