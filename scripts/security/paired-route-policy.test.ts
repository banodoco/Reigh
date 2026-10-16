import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request, type IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { WebSocket } from 'ws';
import { ACP_ROUTE_ENTRIES } from '../../src/integrations/astrid/acpRouteContract.ts';
import { PAIRED_CONSUMER_ROUTES } from '../../config/vite/pairedConsumerPolicy.generated.ts';
import * as policy from '../../config/vite/pairedRoutePolicy.ts';
import { PAIRED_SESSION_HEADER, validatedPairedSession } from '../../config/vite/pairedSessionContext.ts';
import { PairedRelay } from '../../config/vite/pairedRelay.ts';
import { allowedAcpRoute, allowedRoute } from '../reigh-loopback-gateway.ts';

const samples = PAIRED_CONSUMER_ROUTES.map(route => ({ ...route, path: route.path.replace(/:[A-Za-z]+/g, 'disposable') }));
const acpSamples = ACP_ROUTE_ENTRIES.map(route => ({ service: 'acp', method: route.method, path: route.template.replace(/:[A-Za-z]+/g, 'disposable') }));
const publicPath = (route: {service: string; path: string}) => `/api/${route.service === 'runtime' ? 'runtime' : 'astrid'}${route.path}`;

test('every consumer observation passes; every unsupported method and unknown suffix defaults to deny', () => {
  for (const route of [...samples, ...acpSamples]) {
    const path = publicPath(route);
    assert.equal(policy.classifyPairedRoute(path, route.method)?.service, route.service, `${route.method} ${path}`);
    for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT']) {
      const expected = [...samples, ...acpSamples].some(other => publicPath(other) === path && other.method === method);
      assert.equal(policy.classifyPairedRoute(path, method) !== null, expected, `${method} ${path}`);
    }
    assert.equal(policy.classifyPairedRoute(`${path}/unknown-operation/unknown-operation/unknown-operation/unknown-operation/unknown-operation/unknown-operation`, route.method), null);
    if (route.service === 'runtime') assert(allowedRoute(route.path, route.method));
    if (route.service === 'acp') assert(allowedAcpRoute(route.path, route.method));
  }
  for (const path of ['/v1/doctor', '/v1/backup', '/v1/restore', '/v1/attempts/a/settle', '/v1/tasks/claim', '/v1/executors', '/v1/projects/p/timelines/t/commit', '/publish-document', '/v1/projects/p/documents/unknown']) {
    assert.equal(policy.classifyPairedRoute(`/api/runtime${path}`, 'POST'), null);
  }
  assert.equal(policy.classifyPairedRoute('/api/astrid/v1/projects/p/anything/nested', 'GET'), null);
  assert.equal(policy.classifyPairedRoute('/api/astrid/v1/handshake', 'POST'), null);
  for (const prefix of ['runtime', 'astrid']) for (const path of ['/v1/tasks/claim', '/v1/projects/selection']) for (const method of ['GET', 'POST', 'PUT']) assert.equal(policy.classifyPairedRoute(`/api/${prefix}${path}`, method), null);
  assert.equal(policy.classifyPairedRoute('/api/runtimeevil/v1/health', 'GET'), null);
  for (const path of ['/api/runtime/v1/objects/a%2Fb', '/api/runtime/v1/objects/a%252Fb', '/api/runtime/v1/objects/../health', '/api/runtime/v1/health#ignored', '/api/runtime//v1/health']) assert(!policy.isSafeForwardPath(path));
});

test('only consumer and media framing headers are forwarded with canonical names', () => {
  const positive = Object.fromEntries([...policy.PAIRED_FORWARD_HEADERS].map(name => [name.toUpperCase(), 'fixture']));
  assert.equal(policy.hasUnapprovedHeaders(positive), false);
  assert.deepEqual(Object.keys(policy.forwardHeaders(positive)).sort(), [...policy.PAIRED_FORWARD_HEADERS].sort());
  assert.deepEqual(policy.forwardHeaders({ 'X-Astrid-Session': 'disposable-session' }), { 'x-astrid-session': 'disposable-session' });
  for (const name of ['x-hostile-canary', 'x-reigh-paired-session', 'authorization', 'x-output-binding', 'x-astrid-bridge-version', 'x-filename', 'x-expected-version', 'unknown']) {
    assert(policy.hasUnapprovedHeaders({ [name]: 'disposable' }), name);
    assert.deepEqual(policy.forwardHeaders({ [name]: 'disposable' }), {});
  }
  assert.deepEqual(policy.forwardHeaders({ origin: 'https://fake.test', cookie: 'disposable', host: 'fake.test' }), {});
  assert(policy.hasUnapprovedHeaders({ 'x-original-name': ['a', 'b'] }));
  assert(policy.hasUnapprovedHeaders({ 'x-original-name': 'a\r\nb' }));
  assert(policy.hasUnapprovedHeaders({ Accept: 'a', accept: 'b' }));
  assert.equal(policy.classifyPairedRoute('/api/runtime/v1/health', 'GET', { 'Content-Length': '9007199254740992' }), null);
});

function call(port: number, path: string, method: string, headers: Record<string, string> = {}, body = '', chunked = false): Promise<{status: number; headers: IncomingHttpHeaders; body: string}> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers: { ...headers, ...(body && !chunked ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) } }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withRelay(run: (venue: {port: number; origin: string; cookie: string; frames: Record<string, any>[]; waitForFrame(type: string): Promise<void>}) => Promise<void>) {
  const config = { origin: '', loopbackTest: true, enabled: true };
  const relay = new PairedRelay(config);
  const server = createServer(relay.handler());
  relay.installUpgrade(server as never);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as {port: number}).port;
  config.origin = `http://127.0.0.1:${port}`;
  const socket = new WebSocket(`${config.origin.replace('http:', 'ws:')}/api/pairing/connector`);
  const frames: Record<string, any>[] = [];
  const waitForFrame = async (type: string) => {
    if (frames.some(frame => frame.type === type)) return;
    while (!frames.some(frame => frame.type === type)) await once(socket, 'message');
  };
  try {
    await once(socket, 'open');
    const hello = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'connector_hello', connector_id: 'fixture', connector_secret: 'synthetic-credential', realm_id: 'disposable' }));
    const ack = JSON.parse((await hello)[0].toString());
    socket.on('message', raw => {
      const frame = JSON.parse(raw.toString()); if (frame.type.startsWith('request_')) frames.push(frame);
      if (frame.type === 'request_end') {
        socket.send(JSON.stringify({ type: 'response_start', id: frame.id, status: 200, headers: { 'content-type': 'application/json' } }));
        socket.send(JSON.stringify({ type: 'response_chunk', id: frame.id, data: Buffer.from('{"synthetic":true}').toString('base64') }));
        socket.send(JSON.stringify({ type: 'response_end', id: frame.id }));
      }
    });
    const redeem = await call(port, '/api/pairing/redeem', 'POST', { Origin: config.origin, 'Content-Type': 'application/json' }, JSON.stringify({ invitation: ack.invitation }));
    assert.equal(redeem.status, 200);
    const cookie = String(redeem.headers['set-cookie']).split(';', 1)[0];
    await run({ port, origin: config.origin, cookie, frames, waitForFrame });
  } finally {
    relay.restart(); socket.terminate(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test('live relay refuses hostile headers and unsupported paths/methods before the connector', {timeout: 10000}, async () => {
  await withRelay(async ({port, origin, cookie, frames}) => {
    const headers = { Origin: origin, Cookie: cookie };
    for (const name of ['X-Hostile-Canary', 'X-Reigh-Paired-Session', 'Authorization', 'X-Output-Binding']) {
      const result = await call(port, '/api/runtime/v1/health', 'GET', { ...headers, [name]: 'disposable' });
      assert.equal(result.status, 403); assert.equal(JSON.parse(result.body).error, 'paired_header_not_allowed');
    }
    assert.equal((await call(port, '/api/runtime/v1/health', 'DELETE', headers)).status, 404);
    assert.equal((await call(port, '/api/runtime/v1/unlisted', 'GET', headers)).status, 404);
    assert.equal(frames.length, 0);
    for (const path of ['/api/runtime/v1/projects/p/timelines/t/composition-revisions', '/api/astrid/acp/projects/p/chat/main']) {
      assert.equal((await call(port, path, path.endsWith('/main') ? 'PATCH' : 'GET', headers)).status, 200);
    }
  });
});

test('relay chunks bounded synthetic JSON above 128KiB, refusing declared and observed overflow independently', {timeout: 10000}, async () => {
  await withRelay(async ({port, origin, cookie, frames, waitForFrame}) => {
    const path = '/api/runtime/v1/projects/p/timelines/t/composition-revisions';
    const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': 'disposable' };
    const body = JSON.stringify({ synthetic: 'x'.repeat(policy.PAIRED_MAX_JSON_BYTES - 16) });
    assert.equal(Buffer.byteLength(body), policy.PAIRED_MAX_JSON_BYTES);
    for (const chunked of [false, true]) {
      frames.length = 0;
      assert.equal((await call(port, path, 'POST', headers, body, chunked)).status, 200);
      const chunks = frames.filter(f => f.type === 'request_chunk');
      assert(chunks.length > 3);
      assert(chunks.every(f => Buffer.from(f.data, 'base64').length <= 40 * 1024));
      assert.equal(Buffer.concat(chunks.map(f => Buffer.from(f.data, 'base64'))).toString(), body);
      assert(frames.some(f => f.type === 'request_end'));
    }
    frames.length = 0;
    assert.equal((await call(port, path, 'POST', headers, body + ' ')).status, 413);
    assert.equal(frames.length, 0);
    assert.equal((await call(port, path, 'POST', headers, body + ' ', true)).status, 413);
    await waitForFrame('request_cancel');
    assert(frames.some(f => f.type === 'request_cancel'));
    assert(!frames.some(f => f.type === 'request_end'));
    frames.length = 0;
    assert.equal((await call(port, '/api/runtime/v1/projects/p/objects', 'POST', { Origin: origin, Cookie: cookie }, 'x', true)).status, 411);
    assert.equal((await call(port, '/api/astrid/acp/projects/p/chat/draft', 'PATCH', headers, 'x'.repeat(policy.PAIRED_MAX_CONTROL_JSON_BYTES + 1))).status, 413);
    assert.equal((await call(port, '/api/astrid/generation/compose', 'POST', headers, 'x'.repeat(policy.PAIRED_MAX_COMPOSE_JSON_BYTES + 1))).status, 413);
  });
});

// Compile the actual connector function without importing its executable entry
// point, which would read discovery/credentials and contact a Runtime.
test('connector rechecks service, normalizes and preserves media headers, and uses the same JSON cap', async () => {
  const source = ts.createSourceFile('connector.ts', readFileSync(new URL('../reigh-local-connector.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const functions = ['routePath', 'beginRequest'].map(name => {
    const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert(declaration, name); return declaration.getText(source);
  });
  const messages: Record<string, unknown>[] = [];
  const requests = new Map();
  const outgoing: Record<string, string>[] = [];
  const redirects: string[] = [];
  const context = { pair_id: 'p', connector_id: 'c', realm_id: 'r', generation: 1, expires_at: Date.now() + 60_000 };
  const dependencies = { ...policy, PAIRED_SESSION_HEADER, validatedPairedSession, state: { connectorId: 'c' }, realm: { realm_id: 'r' }, generation: 1, pairs: new Map([['p', context.expires_at]]), send: (message: Record<string, unknown>) => messages.push(message), requests, endpoint: new URL('http://127.0.0.1:1'), token: 'synthetic-product', acpBridgeToken: 'synthetic-acp', process: {env: {}}, ASTRID_BRIDGE_PROTOCOL_HEADER: 'X-Astrid-Bridge-Version', ASTRID_BRIDGE_PROTOCOL_VERSION: 'v1', pausedResponses: new Map(), fetch: async (_url: URL, options: {headers: Record<string, string>; redirect: string}) => { outgoing.push(options.headers); redirects.push(options.redirect); return { status: 200, headers: new Headers(), body: null }; } };
  const compiled = ts.transpileModule(functions.join('\n'), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  const begin = new Function(...Object.keys(dependencies), `${compiled}; return beginRequest;`)(...Object.values(dependencies));
  await begin('a', 'runtime', '/v1/projects/p/media-imports', 'POST', { 'Content-Length': '1', 'X-Expected-Digest': 'sha256:disposable', 'X-Media-Width': '2', 'X-Media-Height': '3', 'X-Media-Duration-Seconds': '1' }, context);
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0]['x-media-width'], '2'); assert.equal(outgoing[0]['x-expected-digest'], 'sha256:disposable');
  assert.equal(outgoing[0].Authorization, 'Bearer synthetic-product');
  assert.equal(redirects[0], 'error');
  assert.deepEqual(JSON.parse(outgoing[0][PAIRED_SESSION_HEADER]), context);
  for (const [service, path, method, headers] of [
    ['runtime', '/v1/health', 'GET', {'x-hostile-canary': 'disposable'}],
    ['astrid', '/acp/connect', 'POST', {}],
    ['runtime', '/v1/projects/p/media-imports', 'POST', {}],
    ['runtime', '/v1/projects/p/timelines/t/composition-revisions', 'POST', {'content-length': String(policy.PAIRED_MAX_JSON_BYTES + 1)}],
  ] as const) await begin('reject', service, path, method, headers, context);
  assert.equal(outgoing.length, 1); assert.equal(messages.filter(m => m.type === 'response_error').length, 4);
  let redirectedHits = 0;
  const redirected = createServer((_req, res) => { redirectedHits += 1; res.end('should never be fetched'); });
  await new Promise<void>(resolve => redirected.listen(0, '127.0.0.1', resolve));
  const redirectPort = (redirected.address() as {port: number}).port;
  const local = createServer((_req, res) => { res.writeHead(307, { Location: `http://127.0.0.1:${redirectPort}/unapproved` }); res.end(); });
  await new Promise<void>(resolve => local.listen(0, '127.0.0.1', resolve));
  try {
    const fixed = { ...dependencies, endpoint: new URL(`http://127.0.0.1:${(local.address() as {port: number}).port}`), fetch: globalThis.fetch };
    const beginLocal = new Function(...Object.keys(fixed), `${compiled}; return beginRequest;`)(...Object.values(fixed));
    await beginLocal('redirect', 'runtime', '/v1/objects/disposable', 'GET', {}, context);
    assert.equal(redirectedHits, 0);
    assert(messages.some(message => message.id === 'redirect' && message.type === 'response_error'));
  } finally {
    for (const server of [local, redirected]) server.closeAllConnections();
    await Promise.all([local, redirected].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  }
});
