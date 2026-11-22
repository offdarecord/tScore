// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/coverage/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  // Tests build deliberately broken inputs; `any` is allowed there.
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // No `any` in the pure packages (Definition of Done).
  {
    files: ['packages/core/**/*.ts', 'packages/vision/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  prettier,
);
