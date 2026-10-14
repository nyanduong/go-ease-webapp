"""Check handover documents, local links and credential patterns in tracked text."""

import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[2]
REQUIRED = {
    'docs/ADMIN_CATALOG.md',
    'apps/web/package.json',
    'apps/web/src/main.tsx',
    'apps/web/src/controller.ts',
    'packages/contracts/src/admin-catalog.ts',
    'apps/api/src/admin-catalog.ts',
    'docs/MOBILE_ACCOUNT_SYNC.md',
    'apps/mobile/src/app/account.tsx',
    'apps/mobile/src/features/trips/account-session.ts',
    'apps/mobile/src/features/trips/account-trip-controller.ts',
    'apps/mobile/tests/account-trips.test.cjs',
    'README.md',
    'docs/README.md',
    'docs/TECH_STACK.md',
    'docs/FOLDER_STRUCTURE.md',
    'docs/MVP_EXPO_GO.md',
    'docs/CORE_DEMO_QA.md',
    'apps/mobile/src/features/trips/qa-storage-controller.ts',
    'apps/mobile/src/features/trips/components/qa-storage-banner.tsx',
    'apps/mobile/tests/qa-storage.test.cjs',
    'apps/api/README.md',
    'apps/api/package.json',
    'apps/api/tsconfig.json',
    'apps/api/.env.example',
    'apps/api/src/app.ts',
    'apps/api/src/catalog.ts',
    'apps/api/src/config.ts',
    'apps/api/src/errors.ts',
    'apps/api/src/main.ts',
    'apps/api/tests/http.test.mjs',
    'apps/api/GEMINI.md',
    'apps/api/src/ai/controller.ts',
    'apps/api/src/ai/gemini.ts',
    'apps/api/src/ai/projection.ts',
    'apps/api/src/ai/quota.ts',
    'apps/api/src/ai/service.ts',
    'apps/api/src/request-signal.ts',
    'apps/api/tests/ai.test.mjs',
    'apps/api/scripts/gemini-live.mjs',
    'packages/contracts/src/ai.ts',
    'packages/contracts/src/api.ts',
    'apps/mobile/.env.example',
    'apps/mobile/src/features/trips/catalog-api-controller.ts',
    'apps/mobile/src/app/catalog-check.tsx',
    'apps/mobile/tests/catalog-api.test.cjs',
    'tests/catalog-api-http.test.mjs',
    '.gitignore',
    '.github/workflows/quality.yml',
    '.github/scripts/check-docs.py',
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.node-version',
    'apps/mobile/package.json',
    'apps/mobile/app.json',
    'apps/mobile/src/app/_layout.tsx',
    'apps/mobile/src/app/index.tsx',
    'apps/mobile/src/app/about.tsx',
    'packages/contracts/package.json',
    'packages/contracts/README.md',
    'packages/contracts/src/index.ts',
    'packages/contracts/src/calendar.ts',
    'packages/contracts/src/schemas.ts',
    'packages/contracts/src/itinerary.ts',
    'packages/contracts/tests/contracts.test.mjs',
    'packages/contracts/src/catalog.ts',
    'packages/catalog/package.json',
    'packages/catalog/README.md',
    'packages/catalog/src/index.ts',
    'packages/catalog/src/dalat.ts',
    'packages/catalog/tests/catalog.test.mjs',
    'packages/trip-storage/README.md',
    'packages/trip-storage/package.json',
    'packages/trip-storage/src/index.ts',
    'packages/trip-storage/src/repository.ts',
    'packages/trip-storage/src/store.ts',
    'packages/trip-storage/tests/storage.test.mjs',
    'apps/mobile/src/features/trips/local-trip-store.ts',
    'apps/mobile/src/app/storage-check.tsx',
    'packages/itinerary/README.md',
    'packages/itinerary/package.json',
    'packages/itinerary/src/index.ts',
    'packages/itinerary/tests/itinerary.test.mjs',
    'apps/mobile/src/app/trips/new.tsx',
    'apps/mobile/src/features/trips/create-trip-controller.ts',
    'apps/mobile/src/features/trips/screens/new-trip.tsx',
    'apps/mobile/src/features/trips/screens/trip-list.tsx',
    'apps/mobile/tests/create-trip.test.cjs',
    'apps/mobile/src/app/trips/[id]/index.tsx',
    'apps/mobile/src/app/trips/[id]/map.tsx',
    'apps/mobile/src/features/trips/map-controller.ts',
    'apps/mobile/src/features/trips/screens/trip-map.tsx',
    'apps/mobile/src/features/trips/components/day-map.tsx',
    'apps/mobile/src/features/trips/components/day-map.native.tsx',
    'apps/mobile/tests/map.test.cjs',
    'apps/mobile/src/features/trips/edit-trip-controller.ts',
    'apps/mobile/src/features/trips/screens/trip-detail.tsx',
    'apps/mobile/src/features/trips/components/activity-editor.tsx',
    'apps/mobile/tests/edit-trip.test.cjs',
    'apps/mobile/src/features/trips/budget-controller.ts',
    'apps/mobile/src/features/trips/components/budget-summary.tsx',
    'apps/mobile/src/features/trips/components/group-budget-editor.tsx',
    'apps/mobile/tests/budget.test.cjs',
}
LINK = re.compile(r'!?\[[^\]\n]*\]\(([^\s)]+)\)')
SECRETS = re.compile(
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
    r'|\bAIza[0-9A-Za-z_-]{35}\b'
    r'|\bgh[pousr]_[0-9A-Za-z]{36,}\b'
    r'|\bgithub_pat_[0-9A-Za-z_]{50,}\b'
)


def check(root, tracked):
    errors = []
    for name in sorted(REQUIRED):
        path = root / name
        if not path.is_file() or path.is_symlink():
            errors.append(f'Missing regular file: {name}')
    for name in sorted(set(tracked) | REQUIRED):
        path = root / name
        if (path.name.startswith('.env') and path.name != '.env.example') or path.suffix in {'.pem', '.key', '.p12', '.p8', '.jks', '.keystore', '.mobileprovision'}:
            errors.append(f'Potential credential file: {name}')
            continue
        if not path.is_file() or path.is_symlink():
            continue
        if path.suffix.lower() not in {'.md', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.py', '.example'} and path.name not in {'.gitignore', '.node-version'}:
            continue
        try:
            text = path.read_text(encoding='utf-8-sig')
        except UnicodeError:
            errors.append(f'Invalid UTF-8: {name}')
            continue
        if not text.strip():
            errors.append(f'Empty file: {name}')
        if SECRETS.search(text):
            errors.append(f'Potential credential in {name}; value omitted.')
        if path.suffix != '.md':
            continue
        if not text.startswith('# '):
            errors.append(f'Missing document title: {name}')
        if sum(line.startswith('```') for line in text.splitlines()) % 2:
            errors.append(f'Unclosed code fence: {name}')
        for target in LINK.findall(text):
            parts = urlsplit(target)
            if parts.scheme or parts.netloc or not parts.path:
                continue
            linked = (path.parent / unquote(parts.path)).resolve()
            if not linked.is_relative_to(root.resolve()) or not linked.is_file():
                errors.append(f'Invalid local link in {name}: {target}')
    return errors


if __name__ == '__main__':
    result = subprocess.run(
        ['git', 'ls-files', '-z'], cwd=ROOT, check=True, capture_output=True,
    )
    tracked = result.stdout.decode('utf-8').rstrip('\0').split('\0')
    problems = check(ROOT, tracked)
    if problems:
        raise SystemExit('\n'.join(problems))
    print('PASS: required documents/source, local links and credential patterns.')
