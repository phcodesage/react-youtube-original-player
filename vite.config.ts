import { defineConfig } from 'vite';
import { createOriginalRelay } from './src/relay';

export default defineConfig({
  root: 'demo',
  build: { outDir: '../demo-dist', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
  plugins: [{
    name: 'original-audio-relay',
    async configureServer(server) {
      const testOptions = process.env.ORIGINAL_RELAY_FIXTURE === '1'
        ? (await import('./tests/fixtures/relay')).fixtureRelayOptions : undefined;
      const relay = createOriginalRelay(testOptions);
      server.middlewares.use((req, res, next) => {
        void relay.handle(req, res).then((handled) => { if (!handled) next(); }).catch(next);
      });
    },
  }],
});
