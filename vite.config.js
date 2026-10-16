import {defineConfig} from 'vite';

export default defineConfig({
  root: 'frontend',
  publicDir: 'vendor',
  base: './',
  esbuild: {jsx: 'automatic'},
  build: {outDir: '../dist', emptyOutDir: true},
});
