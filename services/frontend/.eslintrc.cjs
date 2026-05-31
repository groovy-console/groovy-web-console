module.exports = {
  env: {
    browser: true,
    es2021: true
  },
  extends: [
    'standard'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  plugins: [
    '@typescript-eslint'
  ],
  rules: {
  },
  globals: {
    // also define in src/@types/globals.d.ts
    GROOVY_CONSOLE_SERVICE_URL: 'readonly',
    LOCAL_DEVELOPMENT: 'readonly'
  }
}
