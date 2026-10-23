import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.wrangler/',
      '.wrangler-dry-run/',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: { 'import-x': importPlugin },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
      'import-x/no-duplicates': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        // 类型
        { selector: 'typeParameter', format: ['PascalCase'] },
        { selector: 'class', format: ['PascalCase'] },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: { regex: '^I[A-Z]', match: false },
        },
        { selector: 'typeAlias', format: ['PascalCase'] },
        { selector: 'enum', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        // 函数 / 方法
        { selector: 'function', format: ['camelCase'] },
        { selector: 'method', format: ['camelCase'] },
        {
          selector: 'method',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        { selector: 'method', modifiers: ['requiresQuotes'], format: null },
        { selector: 'accessor', format: ['camelCase'] },
        /* 参数 */
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        /* 变量 */
        { selector: 'variable', format: ['camelCase'] },
        { selector: 'variable', modifiers: ['const'], format: ['camelCase', 'UPPER_CASE'] },
        /* 属性 */
        { selector: 'property', format: ['camelCase'] },
        {
          selector: 'property',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        { selector: 'property', modifiers: ['requiresQuotes'], format: null },
        /* 类型属性（Worker 环境变量允许 UPPER_CASE） */
        { selector: 'typeProperty', format: ['camelCase', 'UPPER_CASE'] },
        /* 对象字面量属性（放行 snake_case API 参数） */
        { selector: 'objectLiteralProperty', format: null },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    files: ['src/http.ts', 'src/server.ts', 'src/worker.ts', 'src/env.ts', 'src/version.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', '@modelcontextprotocol/node', '@modelcontextprotocol/server/stdio'],
              message: '共享/Worker 层必须保持 Node-free',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
