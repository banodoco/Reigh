/** Actual App relay + connector subprocess + disposable Runtime HTTP boundary.
 * Set PAIRED_RUNTIME_SOURCE and private HOME/TMPDIR before running. No providers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PairedRelay } from '../../config/vite/pairedRelay.ts';

function lines(child: ChildProcess) {
  const queue: string[] = []; const waiters: ((s: string) => void)[] = [];
  createInterface({ input: child.stdout! }).on('line', line => { const waiter = waiters.shift(); if (waiter) waiter(line); else queue.push(line); });
  return () => queue.length ? Promise.resolve(queue.shift()!) : new Promise<string>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('fixture produced no line; inspect child diagnostics')), 8000); waiters.push(s => { clearTimeout(timer); resolve(s); }); });
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited; clearTimeout(timer);
}

test('authenticated cookie traverses real relay and connector to immutable Runtime project grants', { timeout: 30000 }, async () => {
  const runtime = process.env.PAIRED_RUNTIME_SOURCE;
  assert(runtime, 'PAIRED_RUNTIME_SOURCE must identify the assigned Runtime worktree');
  assert(process.env.HOME && process.env.TMPDIR, 'private environment required');
  const root = mkdtempSync(join(process.env.TMPDIR, 'paired-e2e-'));
  const fixture = spawn('python3', [join(runtime, 'tests/paired_session_fixture.py'), join(root, 'fixture')], { cwd: runtime, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const fixtureLine = lines(fixture);
  let diagnostics = ''; fixture.stderr!.on('data', b => { diagnostics += b.toString(); });
  let connector: ChildProcess | undefined;
  const config = { origin: '', loopbackTest: true, enabled: true };
  const relay = new PairedRelay(config);
  const server = createServer(relay.handler()); relay.installUpgrade(server as never);
  const canaries: Record<string, unknown> = {};
  try {
    const info = JSON.parse(await fixtureLine());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    config.origin = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
    connector = spawn(process.execPath, ['--experimental-transform-types', 'scripts/reigh-local-connector.ts', '--discovery', info.discovery, '--relay-origin', config.origin, '--state', join(root, 'connector.json')], {
      cwd: process.cwd(), env: { ...process.env, REIGH_PAIRED_PRODUCT_ACTOR: 'connector-fixture', REIGH_PAIRED_REALM_ID: info.realm, ASTRID_PRODUCT_TOKEN_FILE: info.credential }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const connectorLine = lines(connector);
    connector.stderr!.on('data', b => { diagnostics += b.toString(); });
    const invitationLine = await connectorLine();
    const invitation = decodeURIComponent(new URL(invitationLine.replace('Pair this browser at ', '')).hash.slice(1));
    const redeem = async (invitation: string) => {
      const res = await fetch(config.origin + '/api/pairing/redeem', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({invitation}) });
      assert.equal(res.status, 200); return { cookie: res.headers.get('set-cookie')!.split(';')[0], pair: (await res.json() as any).pair_id };
    };
    const first = await redeem(invitation);
    const browser = async (cookie: string, path = '/v1/handshake', body?: unknown, extra: Record<string, string> = {}) => {
      const usePost = path === '/v1/handshake' || body !== undefined;
      const res = await fetch(config.origin + '/api/runtime' + path, { headers: { Origin: config.origin, Cookie: cookie, ...(usePost ? { 'Content-Type': 'application/json', 'Idempotency-Key': 'paired-fixture' } : {}), ...extra }, ...(usePost ? { method: 'POST', body: JSON.stringify(body ?? {}) } : {}) });
      return { status: res.status, body: await res.json() as any };
    };
    const valid = await browser(first.cookie);
    assert.equal(valid.status, 200);
    assert.equal(valid.body.project_grant.actor_id, 'connector-fixture');
    assert.equal(valid.body.project_grant.realm_id, info.realm);
    assert.equal(valid.body.project_grant.project_id, info.project);
    assert.equal(valid.body.project_grant.decision.code, 'project_grant_allowed');
    const pair = relay.registry.getPair(first.pair)!;
    assert(valid.body.project_grant.expiry <= Math.min(pair.expiresAt/1000, info.credential_expiry, Date.now()/1000 + 300));
    canaries.valid = valid.body.project_grant;
    const forgedHeader = await browser(first.cookie, '/v1/handshake', undefined, {'X-Reigh-Paired-Session': '{}'});
    assert.equal(forgedHeader.status, 403); assert.equal(forgedHeader.body.error, 'paired_header_not_allowed');
    canaries.forged_header = forgedHeader.body.error;
    const forgedBody = await browser(first.cookie, '/v1/handshake', { paired_session: { pair_id: 'forged' } });
    assert.equal(forgedBody.body.details.decision.code, 'paired_browser_context_forbidden');
    canaries.forged_body = forgedBody.body.details.decision;
    const forgedActor = await browser(first.cookie, '/v1/handshake', { authenticated_actor: 'owner', actor_id: 'owner', project_id: info.second });
    assert.equal(forgedActor.body.actor_id, 'connector-fixture'); assert.equal(forgedActor.body.project_grant.project_id, info.project);
    canaries.forged_actor_project_ignored = true;
    const connectorId = pair.connectorId;
    const second = await redeem(relay.registry.createInvitation(connectorId).code);
    assert.equal((await browser(second.cookie)).status, 200);
    const control = async (command: string, rest = {}) => { fixture.stdin!.write(JSON.stringify({command, ...rest})+'\n'); return JSON.parse(await fixtureLine()); };
    const exchange = await control('exchange', { pairs: [first.pair, second.pair] });
    assert.equal(exchange.decision.code, 'project_grant_unknown'); canaries.host_handle_exchange = exchange.decision;
    await control('select-second');
    assert.equal((await browser(first.cookie)).body.project_grant.project_id, info.project);
    const foreignProject = await browser(first.cookie, '/v1/projects/'+info.second);
    assert.equal(foreignProject.body.details.decision.code, 'project_grant_project_denied'); canaries.selection_snapshot = foreignProject.body.details.decision;
    const edit = await browser(first.cookie, '/v1/tasks', {project: info.project, capability_id: 'timeline.update'});
    assert.equal(edit.body.details.decision.code, 'project_capability_unavailable'); canaries.edit_unavailable = edit.body.details.decision;
    const context = { pair_id: first.pair, connector_id: connectorId, realm_id: info.realm, generation: pair.generation, expires_at: pair.expiresAt };
    const direct = async (credential: string, c: any) => {
      const res = await fetch(info.endpoint+'/v1/handshake', {headers: {Authorization: 'Bearer '+readFileSync(credential, 'utf8').trim(), 'X-Reigh-Paired-Session': JSON.stringify(c)}});
      return {status: res.status, body: await res.json() as any};
    };
    for (const [label, credential, ctx, expected] of [
      ['ordinary', info.ordinary, context, 'paired_connector_assertion_required'],
      ['actor', info.other, context, 'project_grant_actor_mismatch'],
      ['realm', info.credential, {...context, realm_id: 'foreign'}, 'paired_realm_mismatch'],
      ['connector', info.credential, {...context, connector_id: 'foreign'}, 'paired_connector_mismatch'],
      ['generation', info.credential, {...context, generation: pair.generation+1}, 'paired_session_binding_changed'],
      ['session_expiry', info.credential, {...context, expires_at: 1}, 'paired_session_expired'],
    ] as const) {
      const result = await direct(credential, ctx);
      assert.equal(result.body.details.decision.code, expected); canaries[label] = result.body.details.decision;
    }
    await stop(connector);
    connector = spawn(process.execPath, ['--experimental-transform-types', 'scripts/reigh-local-connector.ts', '--discovery', info.discovery, '--relay-origin', config.origin, '--state', join(root, 'connector.json')], {
      cwd: process.cwd(), env: { ...process.env, REIGH_PAIRED_PRODUCT_ACTOR: 'connector-fixture', REIGH_PAIRED_REALM_ID: info.realm, ASTRID_PRODUCT_TOKEN_FILE: info.credential }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    connector.stderr!.on('data', b => { diagnostics += b.toString(); });
    const reconnectInvitation = decodeURIComponent(new URL((await lines(connector)()).replace('Pair this browser at ', '')).hash.slice(1));
    const oldCookie = await browser(first.cookie);
    assert.equal(oldCookie.status, 401); assert.equal(oldCookie.body.error, 'invalid_connector');
    canaries.reconnect_old_cookie = oldCookie.body.error;
    const fresh = await redeem(reconnectInvitation);
    const rebound = await browser(fresh.cookie);
    assert.equal(rebound.status, 200); assert.equal(rebound.body.project_grant.project_id, info.second);
    const stale = await direct(info.credential, context);
    assert.equal(stale.body.details.decision.code, 'paired_generation_stale');
    canaries.reconnect_stale_grant = stale.body.details.decision;
    await control('expire-credential');
    const expired = await browser(fresh.cookie);
    assert.equal(expired.status, 401); assert.equal(expired.body.details.decision.code, 'paired_credential_expired'); canaries.credential_expiry = expired.body.details.decision;
    if (process.env.PAIRED_EVIDENCE_FILE) writeFileSync(process.env.PAIRED_EVIDENCE_FILE, JSON.stringify({canaries, pids: {runtime: fixture.pid, connector: connector.pid}, fixtures_removed_on_exit: root}, null, 2));
  } finally {
    await stop(connector); fixture.stdin!.end(); await stop(fixture);
    relay.restart(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, {recursive: true, force: true});
    // Diagnostics contain no bearer values. Display only on failure via test assertions.
    if (diagnostics.includes('Traceback')) console.error(diagnostics);
  }
});
