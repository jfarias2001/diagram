import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Empacota o código TS do workspace; dependências npm continuam externas.
  noExternal: [/^@diagram\//],
});
