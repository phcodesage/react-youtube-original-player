import { defineConfig, type Options } from 'tsup';

const shared: Options = {
  format: ['esm'],
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  external: ['react', 'react-dom', 'react-player'],
};

export default defineConfig([
  { ...shared, entry: ['src/index.ts'], banner: { js: '"use client";' } },
  { ...shared, entry: ['src/server.ts'] },
  { ...shared, entry: ['src/relay.ts'], platform: 'node' },
]);
