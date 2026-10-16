/** Canonical generated SDK -> HTTP -> real relay/connector -> Runtime.
 * Explicit frozen Runtime/tests and Python -S dependencies are required.
 * The acceptance provider is synthetic: this proves transport/auth/durability,
 * not Astrid editing semantics. All data and credentials are disposable.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request as httpRequest } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { WorkspaceClient, type CommitRequest } from '../../src/integrations/runtime/generated.ts';
import { PairedRelay } from '../../config/vite/pairedRelay.ts';
import { PAIRED_CONSUMER_ROUTES } from '../../config/vite/pairedConsumerPolicy.generated.ts';

function lines(child: ChildProcess) {
  const queue: string[] = [], waiters: {resolve(value: string): void; reject(error: Error): void}[] = [];
  let closed = false;
  createInterface({ input: child.stdout! }).on('line', line => {
    const waiter = waiters.shift(); if (waiter) waiter.resolve(line); else queue.push(line);
  });
  child.on('exit', () => { closed = true; for (const waiter of waiters.splice(0)) waiter.reject(new Error('fixture exited before next line')); });
  return () => queue.length ? Promise.resolve(queue.shift()!) : closed ? Promise.reject(new Error('fixture closed')) : new Promise<string>((resolve, reject) => waiters.push({resolve, reject}));
}
async function stop(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited; clearTimeout(timer);
}

test('canonical SDK commit is accepted durably and paired refusal boundaries have no effects', { timeout: 30000 }, async () => {
  const { PAIRED_RUNTIME_SOURCE: runtime, PAIRED_ASTRID_SOURCE: astrid, PAIRED_PYTHON: python, PAIRED_TSX_IMPORT: tsx, TMPDIR: tmp } = process.env;
  assert(runtime && astrid && python && tsx && tmp, 'explicit frozen Runtime/Astrid grant, Python, TS loader and private TMPDIR required');
  assert.deepEqual(PAIRED_CONSUMER_ROUTES.filter(row => row.operation === 'commitTimeline'), [{
    service: 'runtime', operation: 'commitTimeline', method: 'POST',
    path: '/astrid/v1/projects/:project/timelines/:timeline/commit',
    headers: ['accept', 'content-type', 'idempotency-key', 'x-astrid-session'],
  }]);
  const root = mkdtempSync(join(tmp, 'canonical-commit-'));
  const fixtureRoot = join(root, 'runtime');
  const fixture = spawn(python, ['-S', fileURLToPath(new URL('./paired-commit-runtime-fixture.py', import.meta.url)), fixtureRoot], {
    cwd: runtime, env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const nextFixtureLine = lines(fixture);
  let diagnostics = ''; fixture.stderr!.on('data', b => { diagnostics += b.toString(); });
  let connector: ChildProcess | undefined;
  const config = { origin: '', loopbackTest: true, enabled: true };
  const relay = new PairedRelay(config), server = createServer(relay.handler());
  relay.installUpgrade(server as never);
  const evidence: Record<string, any> = { provider: 'synthetic-fixture-not-a-toolchain-attestation', root, controls: {}, sdkRequests: [] };
  try {
    const info = JSON.parse(await nextFixtureLine());
    assert.equal(info.python.no_site, 1);
    evidence.python = info.python; evidence.runtimeModule = info.runtime_module;
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    config.origin = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
    connector = spawn(process.execPath, ['--import', tsx, 'scripts/reigh-local-connector.ts', '--discovery', info.discovery,
      '--relay-origin', config.origin, '--state', join(root, 'connector.json')], {
      cwd: process.cwd(), env: { ...process.env, REIGH_PAIRED_PRODUCT_ACTOR: 'connector-fixture', REIGH_PAIRED_REALM_ID: info.realm,
        ASTRID_PRODUCT_TOKEN_FILE: info.credential }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    connector.stderr!.on('data', b => { diagnostics += b.toString(); });
    const invitation = decodeURIComponent(new URL((await lines(connector)()).replace('Pair this browser at ', '')).hash.slice(1));
    const redeemed = await fetch(config.origin + '/api/pairing/redeem', { method: 'POST',
      headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ invitation }) });
    assert.equal(redeemed.status, 200);
    const cookie = redeemed.headers.get('set-cookie')!.split(';')[0];
    const envelope = { Origin: config.origin, Cookie: cookie };
    const raw = async (path: string, method: string, headers: Record<string, string> = {}, body = '') => {
      const response = await new Promise<{status: number; body: any}>((resolve, reject) => {
        const req = httpRequest(config.origin + path, { method, headers: { ...envelope, ...headers,
          ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) } }, res => {
          const chunks: Buffer[] = []; res.on('data', b => chunks.push(b));
          res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }));
        });
        req.on('error', reject); req.end(body);
      });
      return response;
    };
    const handshake = await raw('/api/runtime/v1/handshake', 'POST', { 'Content-Type': 'application/json' }, '{}');
    assert.equal(handshake.status, 200);
    assert.equal(handshake.body.project_grant.project_id, info.project);
    assert.equal(handshake.body.project_grant.decision.code, 'project_grant_allowed');
    const keys = ['save-1', 'wrong-project', 'session-mismatch'];
    const snapshot = async () => {
      fixture.stdin!.write(JSON.stringify({ command: 'snapshot', keys }) + '\n');
      return JSON.parse(await nextFixtureLine());
    };
    const before = await snapshot(); evidence.before = before;
    for (const headers of [{ Origin: 'https://foreign.invalid', Cookie: cookie }, { Origin: config.origin, Cookie: 'reigh_pair=forged' }]) {
      const result = await raw('/api/runtime/v1/handshake', 'POST', { ...headers, 'Content-Type': 'application/json' }, '{}');
      assert([401, 403].includes(result.status));
      evidence.controls[headers.Origin === config.origin ? 'forgedCookie' : 'foreignOrigin'] = result;
    }
    assert.deepEqual(await snapshot(), before, 'cookie/origin refusals must have no upstream effects');
    // Adapter supplies only the browser cookie/origin envelope. SDK bytes,
    // method, path and all application headers are passed through unchanged.
    const client = new WorkspaceClient('', undefined, async (method, path, headers, body) => {
      const response = await fetch(config.origin + '/api/runtime' + path, { method, headers: { ...envelope, ...headers }, body: body as BodyInit });
      const bytes = new Uint8Array(await response.arrayBuffer());
      evidence.sdkRequests.push({ method, path, headers, body: JSON.parse(new TextDecoder().decode(body as Uint8Array)), status: response.status, response: JSON.parse(new TextDecoder().decode(bytes)) });
      return { status: response.status, headers: Object.fromEntries(response.headers), body: bytes };
    });
    const request = info.request as CommitRequest;
    await assert.rejects(client.commitTimeline({ ...request, project_id: info.other, request_id: 'wrong-project' }));
    const wrong = evidence.sdkRequests.at(-1);
    assert.equal(wrong.status, 403);
    assert.equal(wrong.response.details.decision.code, 'project_grant_project_denied');
    assert.deepEqual(await snapshot(), before, 'wrong project must not read Runtime body or change provider/request/store');
    evidence.controls.wrongProject = wrong.response;
    const path = `/api/runtime/astrid/v1/projects/${info.project}/timelines/main/commit`;
    for (const header of ['X-Reigh-Paired-Session', 'Authorization', 'X-Hostile-Canary']) {
      const result = await raw(path, 'POST', { [header]: 'forged' });
      assert.equal(result.status, 403); assert.equal(result.body.error, 'paired_header_not_allowed');
      evidence.controls[header] = result;
    }
    for (const [label, badPath, method] of [
      ['method', path, 'DELETE'], ['unknownPath', path + '/unknown', 'POST'],
      ['encodedPath', path.replace(info.project, info.project + '%2Fforeign'), 'POST'],
    ]) {
      const result = await raw(badPath, method); assert.equal(result.status, 404);
      evidence.controls[label] = result;
    }
    const unrelated = await raw(`/api/runtime/v1/projects/${info.project}`, 'PATCH', { 'Content-Type': 'application/json' }, '{"name":"blocked"}');
    assert.equal(unrelated.status, 403);
    assert.equal(unrelated.body.details.decision.code, 'project_grant_operation_unavailable');
    evidence.controls.unrelatedWrite = unrelated;
    assert.deepEqual(await snapshot(), before, 'refusals must retain body/provider/request/store state');
    const mismatch = await raw(path, 'POST', { 'Content-Type': 'application/json', 'Idempotency-Key': 'session-mismatch', 'X-Astrid-Session': 'different' }, JSON.stringify({ ...request, request_id: 'session-mismatch' }));
    assert.equal(mismatch.status, 400); assert.equal(mismatch.body.status, 'error');
    evidence.controls.sessionMismatch = mismatch;
    const afterMismatch = await snapshot();
    assert.deepEqual(afterMismatch, { ...before, body_reads: [...before.body_reads, path.slice('/api/runtime'.length)] });
    const accepted = await client.commitTimeline(request);
    assert.equal(accepted.status, 'accepted'); assert(accepted.accepted_revision_id); assert(accepted.accepted_publication_id);
    const after = await snapshot();
    assert.deepEqual(after.requests[info.project + ':save-1'].result, accepted);
    assert.equal(after.head.revision_id, accepted.accepted_revision_id);
    assert.equal(after.provider_calls.length, 1); assert.equal(after.revisions.length, before.revisions.length + 1);
    assert.notEqual(after.store_digest, before.store_digest);
    evidence.accepted = accepted; evidence.after = after;
    evidence.pids = { runtime: fixture.pid, connector: connector.pid }; evidence.node = process.version;
    // An orderly close/reopen verifies persisted request and head independently.
    fixture.stdin!.end(JSON.stringify({command: 'stop'}) + '\n');
    await once(fixture, 'exit'); assert.equal(fixture.exitCode, 0);
    const durable = JSON.parse(readFileSync(join(fixtureRoot, 'durable.json'), 'utf8'));
    assert.deepEqual(durable.request.result, accepted); assert.deepEqual(durable.head, after.head);
    for (const [name, identity] of Object.entries(durable.modules) as [string, {path: string}][]) {
      assert(identity.path.startsWith((name.startsWith('runtime_protocol') ? runtime : astrid) + '/'), name);
    }
    evidence.durable = durable;
    if (process.env.PAIRED_EVIDENCE_FILE) writeFileSync(process.env.PAIRED_EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + '\n');
  } finally {
    await stop(connector); fixture.stdin!.end(); await stop(fixture);
    relay.restart(); server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (diagnostics.includes('Traceback') || diagnostics.includes('Error:')) console.error(diagnostics);
  }
});
