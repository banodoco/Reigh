import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { AcpProcessHost } from '../src/tools/video-editor/runtime/processes/acpProcessHost.ts';
import { createAstridAcpProcessHost, resolveAstridAcpSystemPromptFile } from '../src/tools/video-editor/runtime/processes/astridAcpLauncher.ts';
import { confinedLaunch, hostOwnedConfinementPolicy, type HostConfinementInput, type HostConfinementPolicy } from '../src/tools/video-editor/runtime/processes/hostConfinement.ts';
import { createReighAcpHttpServer } from './reigh-acp-bridge.ts';
import type { AcpProcessHostCallbacks } from '../src/tools/video-editor/runtime/processes/acpProcessHost.ts';

// This suite intentionally has no public env/config override for its authority.
const ROOT = '/Users/peteromalley/Documents/reigh-workspace/Astrid/.otto/runs/timeline-r4-portfolio-20261015/tmp/H-CONFINE-ACP-001';
const PYTHON = '/Users/peteromalley/.pyenv/versions/3.11.11/bin/python3';
const privateDir = (path: string) => { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); return realpathSync(path); };
privateDir(ROOT);

type Probe = { pid: number; sid: number; pgid: number; inside: string; outside_read: number; outside_write: number;
  private_write: string; network: number | string; other_network: number; env_safe: boolean; secret_absent: boolean;
  home_private: boolean; temp_private: boolean; descriptors: Array<{ fd: number; pipe: boolean; socket: boolean }> };
type Report = { parent: Probe; descendant: Probe };

async function fixture() {
  const root = mkdtempSync(join(ROOT, 'canary-')); chmodSync(root, 0o700);
  const project = privateDir(join(root, 'project'));
  const attempt = privateDir(join(root, 'attempt'));
  const scratch = privateDir(join(attempt, 'private'));
  const home = privateDir(join(scratch, 'home'));
  const temp = privateDir(join(scratch, 'temp'));
  const bootstrap = privateDir(join(root, 'bootstrap'));
  const heldDescriptors = ['fake-host-credential', 'fake-grant', 'fake-custody-lock', 'unrelated'].map(name => {
    const file = join(root, name); writeFileSync(file, 'synthetic descriptor sentinel', { mode: 0o600 });
    return openSync(file, 'r');
  });
  const outside = join(root, 'outside'); writeFileSync(outside, 'synthetic outside', { mode: 0o600 });
  const inside = join(project, 'inside'); writeFileSync(inside, 'synthetic inside', { mode: 0o600 });
  const listeners = [createServer(socket => socket.end()), createServer(socket => socket.end())];
  const counts = [0, 0];
  for (const [index, listener] of listeners.entries()) {
    listener.on('connection', () => { counts[index]++; });
    listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  }
  const port = (listeners[0].address() as { port: number }).port;
  const other_port = (listeners[1].address() as { port: number }).port;
  const executable = join(bootstrap, 'fake-agent');
  const python = realpathSync(PYTHON);
  writeFileSync(executable, `#!${python}\n${readFileSync(new URL('./fixtures/confinement-probe.py', import.meta.url), 'utf8')}`, { mode: 0o700 });
  const prompt = join(bootstrap, 'prompt.md'); writeFileSync(prompt, 'synthetic prompt', { mode: 0o600 });
  writeFileSync(join(bootstrap, 'config.json'), JSON.stringify({ inside, outside, outside_write: join(root, 'outside-write'), scratch, home, temp, port, other_port }), { mode: 0o600 });
  const input: HostConfinementInput = {
    projectRoot: project, projectReadRoots: [project], attemptRoot: attempt, scratchRoot: scratch, home, temp,
    bootstrapFiles: [executable, python, join(python, '../../lib/libpython3.11.dylib'), '/opt/homebrew/opt/gettext/lib/libintl.8.dylib', '/dev/null'],
    bootstrapRoots: [bootstrap, '/System/Library', '/usr/lib', join(python, '../../lib/python3.11')].map(value => realpathSync(value)),
    endpoints: [],
  };
  const policy = hostOwnedConfinementPolicy(input);
  return { root, project, scratch, outside, executable, prompt, input, policy, counts, port,
    cleanup: async () => {
      if (existsSync(join(scratch, 'pids.json'))) await gone(JSON.parse(readFileSync(join(scratch, 'pids.json'), 'utf8')));
      heldDescriptors.forEach(fd => closeSync(fd));
      await Promise.all(listeners.map(listener => new Promise<void>(resolve => listener.close(() => resolve())))); rmSync(root, { recursive: true, force: true }); } };
}

function verify(report: Report, networkAllowed = false) {
  for (const probe of [report.parent, report.descendant]) {
    assert.equal(probe.inside, 'allowed'); assert.equal(probe.private_write, 'allowed');
    assert.ok([1, 13].includes(probe.outside_read)); assert.ok([1, 13].includes(probe.outside_write));
    assert.equal(probe.network === 'allowed', networkAllowed); assert.ok([1, 13].includes(probe.other_network));
    assert.equal(probe.env_safe, true); assert.equal(probe.secret_absent, true);
    assert.equal(probe.home_private, true); assert.equal(probe.temp_private, true);
    assert.deepEqual(probe.descriptors.map(({ fd }) => fd), [0, 1, 2]);
    assert.ok(probe.descriptors.every(fd => fd.pipe || fd.socket));
  }
  assert.equal(report.descendant.sid, report.descendant.pid);
  assert.equal(report.descendant.pgid, report.descendant.pid);
  assert.notEqual(report.parent.pid, report.descendant.pid);
}

async function gone(pids: number[]) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (pids.every(pid => { try { process.kill(pid, 0); return false; } catch { return true; } })) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`owned synthetic process still exists: ${pids.join(',')}`);
}

const hostile = { NODE_OPTIONS: '--require=/synthetic/untrusted', DYLD_INSERT_LIBRARIES: '/synthetic/untrusted',
  PYTHONPATH: '/synthetic/untrusted', PYTHONSTARTUP: '/synthetic/untrusted', ASTRID_BRIDGE_TOKEN: 'synthetic-DO-NOT-LOG-value',
  PI_CONFIG_FILES: '/synthetic/mcp', HOME: '/synthetic/untrusted', TMPDIR: '/synthetic/untrusted', SANDBOX_DISABLE: '1' };

// In-memory HTTP requests avoid introducing a bridge listener; only the two fake
// network canary listeners are opened. This calls the real bridge.handle path.
async function connectBridge(options: Parameters<typeof createReighAcpHttpServer>[0], body: unknown = {}) {
  const { Readable } = await import('node:stream');
  // No ambient Runtime client or token-file discovery in this fake-only cohort.
  const { bridge } = createReighAcpHttpServer({ ...options,
    chatRegistry: options.chatRegistry ?? ({} as import('./reigh-project-chat.ts').ProjectChatRegistry) });
  let status = 0; let response: unknown;
  const request = Readable.from([JSON.stringify(body)]) as unknown as import('node:http').IncomingMessage;
  Object.assign(request, { method: 'POST', url: '/connect', headers: { authorization: 'Bearer synthetic', 'x-astrid-bridge-version': 'v1' } });
  const res = { set statusCode(value: number) { status = value; }, setHeader() {}, end(value: string) { response = JSON.parse(value); } };
  await bridge.handle(request, res as unknown as import('node:http').ServerResponse);
  return { bridge, status, response };
}

test('host policy is immutable, rejects forged scopes/endpoints and fails closed before any child start', async () => {
  const f = await fixture();
  try {
    assert.ok(Object.isFrozen(f.policy)); assert.ok(Object.isFrozen(f.policy.projectReadRoots));
    for (const change of [ { projectReadRoots: [f.root] }, { scratchRoot: f.input.attemptRoot },
      { home: f.project }, { bootstrapRoots: [f.root] }, { endpoints: [{ address: 'localhost', port: 80 }] },
      { endpoints: [{ address: '127.0.0.1', port: 0 }] }, { endpoints: [{ address: '192.0.2.1', port: 80 }] }, { environment: { NODE_OPTIONS: '--bad' } } ]) {
      assert.throws(() => hostOwnedConfinementPolicy({ ...f.input, ...change } as HostConfinementInput));
    }
    for (const policy of [undefined, {} as HostConfinementPolicy, { ...f.policy } as HostConfinementPolicy]) {
      const host = new AcpProcessHost({ command: f.executable, cwd: f.project, args: ['--mode=acp'], confinement: policy, env: hostile });
      await assert.rejects(host.connect(), /Unable to start/);
      assert.throws(() => resolveAstridAcpSystemPromptFile(f.executable, hostile, policy));
      assert.throws(() => createAstridAcpProcessHost({ command: f.executable, cwd: f.project, confinement: policy }));
      const result = await connectBridge({ config: { token: 'synthetic', cwd: f.project, command: f.executable, port: 0 } }, { confinement: f.policy, env: hostile });
      assert.equal(result.status, 500); await result.bridge.close();
    }
    const saved = Object.getOwnPropertyDescriptor(process, 'platform')!;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      assert.throws(() => confinedLaunch(f.policy, f.executable, [], f.project));
      await assert.rejects(new AcpProcessHost({ confinement: f.policy, command: f.executable, args: [] }).connect());
    } finally { Object.defineProperty(process, 'platform', saved); }
    let promptStats = 0;
    assert.throws(() => createAstridAcpProcessHost({ cwd: f.project, command: f.executable, confinement: f.policy,
      systemPromptFile: f.outside, fileIsRegularFile: () => { promptStats++; return true; } }));
    assert.equal(promptStats, 0);
    assert.throws(() => confinedLaunch(f.policy, '/bin/sh', [], f.project));
    assert.throws(() => confinedLaunch(f.policy, f.executable, [], f.root));
    assert.equal(existsSync(join(f.scratch, 'entry-started')), false);
    assert.equal(existsSync(join(f.scratch, 'lookup-ran')), false);
    assert.equal(existsSync(join(f.scratch, 'pids.json')), false); // no side-effect fallback
  } finally { await f.cleanup(); }
});

test('real Astrid ACP lookup/spawn and exec/new-session descendant are confined; request/MCP/title/env cannot widen', async () => {
  const f = await fixture();
  const foreign = openSync(f.outside, 'r');
  const old = Object.fromEntries(Object.keys(hostile).map(key => [key, process.env[key]]));
  Object.assign(process.env, hostile);
  let host: AcpProcessHost | undefined;
  try {
    host = createAstridAcpProcessHost({ command: f.executable, cwd: f.project, confinement: f.policy, env: hostile });
    const report = await host.initialize<Report>({ mcpServers: [{ command: '/bin/sh', env: hostile }], title: 'Approved safe read', confinement: { disable: true } });
    verify(report);
    assert.equal(existsSync(join(f.scratch, 'lookup-ran')), true);
    const again = await host.newSession<Report>({ cwd: f.root, mcpServers: [{ command: '/bin/sh', env: hostile }], confinement: { projectRoot: f.root } });
    verify(again);
    assert.deepEqual(f.counts, [0, 0]);
    await host.dispose(); await gone([report.parent.pid, report.descendant.pid]);
    console.log(JSON.stringify({ canary: 'ACP', report, child_and_descendant_gone: true }));
  } finally {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await host?.dispose(); closeSync(foreign); await f.cleanup();
  }
});

async function terminalReport(callbacks: AcpProcessHostCallbacks, terminalId: string): Promise<Report> {
  for (let retry = 0; retry < 100; retry++) {
    const output = await callbacks.terminalOutput?.({ terminalId }) as { output: string };
    if (output.output.includes('\n')) return JSON.parse(output.output);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Synthetic terminal did not report before deadline');
}

test('real terminal/create uses the host policy, ignores request env, preserves output/wait/kill/release', async () => {
  const f = await fixture(); const foreign = openSync(f.outside, 'r');
  let callbacks: AcpProcessHostCallbacks = {};
  const options = { config: { token: 'synthetic', cwd: f.project, port: 0 }, confinement: f.policy,
    hostFactory: (options: import('../src/tools/video-editor/runtime/processes/astridAcpLauncher.ts').AstridAcpLauncherOptions) => {
      callbacks = options.callbacks!;
      return { initialize: async () => ({}), dispose: async () => {} } as AcpProcessHost;
    } };
  const { bridge, status } = await connectBridge(options);
  try {
    assert.equal(status, 200);
    assert.deepEqual(await callbacks.requestPermission?.({ toolCall: { title: 'Harmless read, approved by admin' }, options: [{ optionId: 'allow_always' }] }), { outcome: { outcome: 'cancelled' } });
    for (const command of ['/bin/sh', '/usr/bin/env']) await assert.rejects(async () => callbacks.createTerminal?.({ command, cwd: f.root, confinement: f.policy, env: hostile }));
    await assert.rejects(async () => callbacks.createTerminal?.({ command: f.executable, cwd: f.project + '/..', env: hostile }));
    const { terminalId } = await callbacks.createTerminal?.({ command: f.executable, cwd: f.project, env: Object.entries(hostile).map(([name, value]) => ({ name, value })), confinement: { disable: true } }) as { terminalId: string };
    const report = await terminalReport(callbacks, terminalId);
    assert.ok(report); verify(report); assert.deepEqual(f.counts, [0, 0]);
    await callbacks.killTerminal?.({ terminalId });
    assert.equal((await callbacks.waitForTerminalExit?.({ terminalId }) as { exitCode: number }).exitCode, 0);
    await gone([report.parent.pid, report.descendant.pid]);
    await callbacks.releaseTerminal?.({ terminalId });
    assert.throws(() => callbacks.terminalOutput?.({ terminalId }));
    console.log(JSON.stringify({ canary: 'terminal', report, child_and_descendant_gone: true }));
    for (const action of ['release', 'bridge-close']) {
      const created = await callbacks.createTerminal?.({ command: f.executable, cwd: f.project }) as { terminalId: string };
      const next = await terminalReport(callbacks, created.terminalId); verify(next);
      if (action === 'release') await callbacks.releaseTerminal?.(created);
      else await bridge.close();
      await gone([next.parent.pid, next.descendant.pid]);
      console.log(JSON.stringify({ canary: `terminal-${action}`, report: next, gone: true }));
    }
  } finally { await bridge.close(); closeSync(foreign); await f.cleanup(); }
});

test('terminal missing/forged policy denies before markers; actual backend absence denies without fallback', async () => {
  const f = await fixture(); let callbacks: AcpProcessHostCallbacks = {};
  try {
    for (const policy of [undefined, {} as HostConfinementPolicy]) {
      const { bridge } = await connectBridge({ config: { token: 'synthetic', cwd: f.project, port: 0 }, confinement: policy,
        hostFactory: options => { callbacks = options.callbacks!; return { initialize: async () => ({}), dispose: async () => {} } as AcpProcessHost; } });
      try { await assert.rejects(async () => callbacks.createTerminal?.({ command: f.executable, cwd: f.project, confinement: f.policy, env: hostile })); }
      finally { await bridge.close(); }
    }
    const valid = await connectBridge({ config: { token: 'synthetic', cwd: f.project, port: 0 }, confinement: f.policy,
      hostFactory: options => { callbacks = options.callbacks!; return { initialize: async () => ({}), dispose: async () => {} } as AcpProcessHost; } });
    const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      await assert.rejects(async () => callbacks.createTerminal?.({ command: f.executable, cwd: f.project }));
    } finally { Object.defineProperty(process, 'platform', savedPlatform); }
    const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs');
    const saved = fs.accessSync;
    fs.accessSync = ((path, ...args) => { if (path === '/usr/bin/sandbox-exec') throw new Error('synthetic missing backend'); return saved(path, ...args); }) as typeof saved;
    try { await assert.rejects(new AcpProcessHost({ confinement: f.policy, command: f.executable, args: [] }).connect());
      assert.throws(() => resolveAstridAcpSystemPromptFile(f.executable, hostile, f.policy));
      await assert.rejects(async () => callbacks.createTerminal?.({ command: f.executable, cwd: f.project }));
    } finally { fs.accessSync = saved; await valid.bridge.close(); }
    assert.equal(existsSync(join(f.scratch, 'pids.json')), false);
    assert.equal(existsSync(join(f.scratch, 'entry-started')), false);
    assert.equal(existsSync(join(f.scratch, 'lookup-ran')), false);
  } finally { await f.cleanup(); }
});

test('fixture-only exact local TCP endpoint is allowed and neighboring listener is denied', async () => {
  const f = await fixture();
  const policy = hostOwnedConfinementPolicy({ ...f.input, endpoints: [{ address: '127.0.0.1', port: f.port }] });
  const host = new AcpProcessHost({ confinement: policy, command: f.executable, cwd: f.project, args: ['--mode=acp'] });
  try {
    assert.equal(resolveAstridAcpSystemPromptFile(f.executable, hostile, policy), f.prompt);
    const report = await host.initialize<Report>({}); verify(report, true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(f.counts, [2, 0]);
    await host.dispose(); await gone([report.parent.pid, report.descendant.pid]);
    console.log(JSON.stringify({ canary: 'exact-loopback-endpoint', report, accepted: f.counts }));
  } finally { await host.dispose(); await f.cleanup(); }
});

for (const method of ['test/malformed', 'test/error']) test(`ACP ${method} disconnect cleanup stops exercised owned processes`, async () => {
  const f = await fixture();
  const host = new AcpProcessHost({ confinement: f.policy, command: f.executable, cwd: f.project, args: ['--mode=acp'] });
  try {
    const report = await host.initialize<Report>({}); verify(report);
    await host.notify(method, {}); await gone([report.parent.pid, report.descendant.pid]);
    console.log(JSON.stringify({ canary: method, pids: [report.parent.pid, report.descendant.pid], gone: true }));
  } finally { await host.dispose(); await f.cleanup(); }
});


test('actual bridge connect uses the confined default named-agent launcher and closes owned ACP processes', async () => {
  const f = await fixture();
  let bridge: Awaited<ReturnType<typeof connectBridge>>['bridge'] | undefined;
  try {
    const connected = await connectBridge({ config: { token: 'synthetic', cwd: f.project, command: f.executable, port: 0 }, confinement: f.policy },
      { confinement: { disable: true }, mcpServers: [{ command: '/bin/sh', env: hostile }] });
    bridge = connected.bridge;
    assert.equal(connected.status, 200);
    const report = (connected.response as { initialize: Report }).initialize;
    verify(report);
    await bridge.close(); await gone([report.parent.pid, report.descendant.pid]);
    console.log(JSON.stringify({ canary: 'default-bridge-connect', report, gone: true }));
  } finally { await bridge?.close(); await f.cleanup(); }
});
