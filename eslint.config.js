// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Carpetas generadas, y las Cloud Functions, que son un proyecto aparte
    ignores: ['dist/*', 'android/*', 'ios/*', 'functions/*'],
  },
]);
