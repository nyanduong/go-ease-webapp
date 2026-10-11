import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/test-results/**', '**/playwright-report/**', '**/.expo/**', 'apps/mobile/android/**', 'apps/mobile/ios/**', '**/src/generated/prisma/**', '**/.local/**', '**/.database-upgrade-test/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/mobile/plugins/*.cjs'],
    languageOptions: { globals: { require: 'readonly', module: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true, allowExportNames: ['buttonVariants'] }],
    },
  },
];
