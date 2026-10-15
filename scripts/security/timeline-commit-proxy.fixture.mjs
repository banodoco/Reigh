// Disposable HTTP integration fixture. Uses the existing App proxy and guard.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(url)) return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { createServer: createViteServer } = await import(pathToFileURL(process.env.ACCEPT_VITE_ENTRY).href);
const { createAstridBridgeProxyOptions, createAstridBridgeAuthPlugin } = await import('../../config/vite/astridBridgeProxy.ts');
const policy = { token: process.env.ACCEPT_FIXTURE_TOKEN, acpToken: null, allowUnauthenticatedStub: false };
const vite = await createViteServer({
  configFile: false,
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  cacheDir: process.env.ACCEPT_VITE_CACHE,
  plugins: [createAstridBridgeAuthPlugin(policy)],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: {
    middlewareMode: true, watch: null,
    proxy: { '/api/astrid': createAstridBridgeProxyOptions(policy, Number(process.env.ACCEPT_FIXTURE_RUNTIME_PORT)) },
  },
});
// Check the actual Runtime provider override as well as the generic default.
assert.match(readFileSync('src/integrations/runtime/dataProvider.ts', 'utf8'), /readonly refreshIntervalMs = 30_000;/);
assert.match(readFileSync('src/tools/video-editor/hooks/useTimelineQueries.ts', 'utf8'), /DEFAULT_TIMELINE_REFRESH_INTERVAL_MS = 30_000;/);
const server = createServer(vite.middlewares);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
process.stdout.write(JSON.stringify({ port: server.address().port, vite: 'existing App proxy options and auth guard', polling_ms: 30000 }) + '\n');
process.once('SIGTERM', async () => {
  await vite.close();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
