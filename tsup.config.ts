import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  shims: true,
  noExternal: [/^(?!simple-git|update-notifier).*/],
  banner: {
    js: '#!/usr/bin/env node',
  },
  define: {
    __DEV__: 'false',
  },
});
