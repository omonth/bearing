const nodeAndVitestGlobals = {
  AbortController: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  __dirname: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  fetch: 'readonly',
  global: 'readonly',
  it: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  test: 'readonly',
  TextDecoder: 'readonly',
  vi: 'readonly',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'uploads/**',
      'logs/**',
      'coverage/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: nodeAndVitestGlobals,
    },
    rules: {
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
    },
  },
];
