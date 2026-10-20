import ts from 'typescript-eslint';
const nativeDialogNames = ['alert', 'confirm', 'prompt'];
const dialogMessage = 'Use the GoEase popup service for application dialogs.';
export default [
  ...ts.configs.recommended,
  { ignores: ['dist/**', 'test-results/**'] },
  {
    files: ['src/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...nativeDialogNames.map((name) => ({ name, message: dialogMessage })),
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].flatMap((object) =>
          nativeDialogNames.map((property) => ({ object, property, message: dialogMessage })),
        ),
      ],
    },
  },
];
