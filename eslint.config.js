// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import i18next from 'eslint-plugin-i18next';
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
      '**/test-results/**',
      '**/playwright-report/**',
      '_site/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  // Tests build deliberately broken inputs and index into results they just built:
  // `any` and `!` are allowed there (a wrong guess fails the test, which is the point).
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // No `any` in the pure packages (Definition of Done).
  {
    files: ['packages/core/**/*.ts', 'packages/vision/**/*.ts', 'packages/store/**/*.ts'],
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
  // Screens' wording comes from locales/en.json, never written straight into the markup (#64).
  {
    files: ['apps/desktop/src/renderer/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: [
              'label',
              'title',
              'placeholder',
              'description',
              'alt',
              'aria-label',
              'aria-description',
            ],
          },
          // Symbols, numbers and separators aren't words, nor are code values such as 'dark'.
          words: {
            exclude: [
              '^[\\s\\W\\d]*$',
              '^[a-z][a-z0-9_-]*$',
              // Colours: '#c92a2a', 'light-dark(#e3eefa, #1a3049)'.
              '^#[0-9a-fA-F]{3,8}$',
              '^light-dark\\(.*\\)$',
            ],
          },
        },
      ],
    },
  },
  prettier,
);
