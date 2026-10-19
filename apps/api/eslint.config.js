import base from '../../packages/contracts/eslint.config.js';

const productionBoundary = {
  group: ['**/dev/**', '**/demos/**'],
  message: 'Production code must not depend on dev/demo code.',
};
const features = ['auth', 'catalog', 'trips', 'ai', 'health'];

export default [
  ...base,
  { ignores: ['dist-demos/**', 'src/generated/**'] },
  {
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [productionBoundary] }] },
  },
  ...features.map((feature) => ({
    files: [`src/modules/${feature}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            productionBoundary,
            ...features
              .filter((other) => other !== feature)
              .map((other) => ({
                group: [
                  `**/${other}/*.repository.js`,
                  `**/${other}/*.controller.js`,
                  `**/${other}/admin/**`,
                  `**/${other}/providers/**`,
                ],
                message: `Use the public service exported by ${other}, not its controller, repository or adapter.`,
              })),
          ],
        },
      ],
    },
  })),
  {
    files: ['src/modules/ai/ai.service.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            productionBoundary,
            {
              group: ['./providers/**', '**/catalog/*.repository.js'],
              message: 'AI orchestration uses a provider interface and the public catalog service.',
            },
          ],
        },
      ],
    },
  },
];
