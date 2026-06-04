import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    ignores: [
      'admin/**',
      'backend/**',
      '.worktrees/**',
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
    ],
  },
];

export default config;
