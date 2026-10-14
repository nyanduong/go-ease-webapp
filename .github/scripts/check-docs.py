"""Check handover documents, local links and credential patterns in tracked text."""

import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[2]
REQUIRED = {
    'README.md',
    'docs/README.md',
    'docs/TECH_STACK.md',
    'docs/FOLDER_STRUCTURE.md',
    'docs/MVP_EXPO_GO.md',
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
        if path.suffix.lower() not in {'.md', '.ts', '.tsx', '.js', '.mjs', '.json', '.yaml', '.yml', '.py', '.example'} and path.name not in {'.gitignore', '.node-version'}:
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
