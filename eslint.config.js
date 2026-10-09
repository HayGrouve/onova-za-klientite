//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import convexPlugin from '@convex-dev/eslint-plugin'

export default [
  ...tanstackConfig,
  ...convexPlugin.configs.recommended,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // ADR 0008: money and the job fields it is cached from change only
    // through convex/lib/ledger.ts, which refreshes the caches it touched.
    files: ['convex/**/*.ts'],
    ignores: [
      'convex/lib/ledger.ts',
      'convex/lib/recompute.ts',
      'convex/test.setup.ts',
      'convex/**/*.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/recompute'],
              message: 'Change money through convex/lib/ledger.ts.',
            },
            {
              group: ['**/jobIndex'],
              message:
                'The job counts and assignments change through convex/lib/ledger.ts.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(insert|patch|replace|delete)$/][arguments.0.value=/^(payments|allocations|costs)$/]',
          message:
            'Write payments, allocations and costs through convex/lib/ledger.ts.',
        },
        {
          selector:
            "CallExpression[callee.property.name='insert'][arguments.0.value='jobs']",
          message: 'Insert a job with insertJob from convex/lib/ledger.ts.',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(insert|patch|replace)$/][arguments.0.value='jobs'] Property[key.name=/^(lines|typedPriceCents|writeOff|stageId|stageGroup|assigneeIds|dueDate|clientId|priceCents|paidCents|costCents|balanceCents|owes)$/]",
          message:
            'Change what a job costs, its stage, assignees, due date or client with patchJob from convex/lib/ledger.ts.',
        },
      ],
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'convex/_generated/**',
      'src/paraglide/**',
      'src/routeTree.gen.ts',
      'src/components/ui/**',
      '.vercel/**',
      '.output/**',
      'scripts/**',
    ],
  },
]
