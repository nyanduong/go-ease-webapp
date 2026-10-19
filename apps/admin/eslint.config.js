import ts from 'typescript-eslint';
export default [
  ...ts.configs.recommended,
  { ignores: ['dist/**', '.logic-tests/**'] },
  { files: ['tests/*.mjs'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
];
