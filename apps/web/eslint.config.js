import ts from 'typescript-eslint';
export default [...ts.configs.recommended, { ignores: ['dist/**', 'test-results/**'] }];
