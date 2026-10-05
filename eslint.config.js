// Configuration ESLint minimale (détection des variables non définies / inutilisées).
const browser = {
  window: 'readonly', document: 'readonly', location: 'readonly', navigator: 'readonly', performance: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  WebSocket: 'readonly', ResizeObserver: 'readonly', Node: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
  fetch: 'readonly', alert: 'readonly', confirm: 'readonly', console: 'readonly', structuredClone: 'readonly',
};
const node = { process: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', URL: 'readonly' };

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
  { files: ['client/**/*.js'], languageOptions: { globals: browser } },
  { files: ['server/**/*.js', 'tools/**/*.js', 'test/**/*.js'], languageOptions: { globals: node } },
  { files: ['shared/**/*.js'], languageOptions: { globals: { console: 'readonly' } } },
];
