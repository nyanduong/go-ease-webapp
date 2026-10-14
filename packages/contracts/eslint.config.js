import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  ...tseslint.configs.recommended,
  { files: ['tests/**/*.mjs'], languageOptions: { globals: { structuredClone: 'readonly', process: 'readonly' } } },
);
