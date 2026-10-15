import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JsonRpcProcessLike } from './jsonRpcStdioTransport.ts';
import {
  ASTRID_ACP_COMMAND,
  createAstridAcpProcessHost,
} from './astridAcpLauncher.ts';
import {
  createReighAcpHttpServer,
  resolveReighAcpBridgeConfig,
  type ReighAcpBridgeConfig,
} from '../../../../../scripts/reigh-acp-bridge.ts';
import { ProjectChatRegistry } from '../../../../../scripts/reigh-project-chat.ts';
import { ApiError, type Project } from '@/integrations/runtime/generated.ts';

type Listener = (...args: unknown[]) => void;

class FakeReadable {
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

class FakeWritable {
  readonly writes: string[] = [];
  ended = false;

  write(chunk: string): boolean {
    this.writes.push(chunk);
    return true;
  }

  end(): void {
    this.ended = true;
  }
}

class FakeProcess {
  readonly stdin = new FakeWritable();
  readonly stdout = new FakeReadable();
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  kill(): boolean {
    return true;
  }

  asProcess(): JsonRpcProcessLike {
    return this as unknown as JsonRpcProcessLike;
  }
}

function lastRequest(process: FakeProcess): Record<string, unknown> {
  const line = process.stdin.writes.at(-1);
  if (!line) throw new Error('expected an ACP request');
  return JSON.parse(line) as Record<string, unknown>;
}

function respond(process: FakeProcess, id: unknown, result: unknown): void {
  process.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitForRequest(process: FakeProcess, after = 0): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (process.stdin.writes.length > after) return;
    await tick();
  }
  throw new Error('expected an ACP request');
}

async function listen(server: ReturnType<typeof createReighAcpHttpServer>['server']): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected a TCP server address');
  return address.port;
}

function headers(token = 'test-token'): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Astrid-Bridge-Version': 'v1',
    'Content-Type': 'application/json',
  };
}

describe('Reigh ACP HTTP bridge', () => {
  it('rejects nested inline project-draft media before durable storage in hosted local-only mode', async () => {
    const draft = async (_projectId: string, _expectedRevision: number, _text: string, _queued: unknown) => ({
      project_id: 'project-1', scope_key: 'scope', revision: 1, selected_session_id: null, sessions: [],
      draft: { text: 'saved', revision: 1, queued_messages: [] },
    });
    let writes = 0;
    const { bridge, server } = createReighAcpHttpServer({
      config: { token: 'test-token', port: 0, cwd: '/tmp/reigh-project', localMediaOnly: true },
      chatRegistry: { draft: async (...args: Parameters<typeof draft>) => { writes += 1; return draft(...args); } } as never,
      hostFactory: () => { throw new Error('no ACP host needed for draft route'); },
    });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;

    const rejected = await fetch(`${base}/projects/project-1/chat/draft`, {
      method: 'PATCH', headers: headers(),
      body: JSON.stringify({ expected_revision: 0, text: '', queued_messages: [{ id: 'q1', text: 'later', session_id: 's1', attachments: [{ type: 'resource', resource: { uri: 'data:audio/wav;base64,AAAA' } }] }] }),
    });
    expect(rejected.status).toBe(415);
    expect(writes).toBe(0);

    const accepted = await fetch(`${base}/projects/project-1/chat/draft`, {
      method: 'PATCH', headers: headers(),
      body: JSON.stringify({ expected_revision: 0, text: 'plain text', queued_messages: [] }),
    });
    expect(accepted.status).toBe(200);
    expect(writes).toBe(1);

    await bridge.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('routes project session creation, selection, draft persistence, and ownership-checked prompts', async () => {
    const fakeProcess = new FakeProcess();
    const storedProject: Project = { project_id: 'p1', realm_id: 'realm-a', slug: 'p1', name: 'P1', metadata: {}, version: 1, created_at: '', updated_at: '' };
    const projectStore = {
      getProject: async () => structuredClone(storedProject),
      listProjects: async () => ({ items: [structuredClone(storedProject)], next_cursor: null }),
      updateProject: async (_id: string, _key: string, expected: number, _name?: string, metadata?: Record<string, unknown>) => {
        if (expected !== storedProject.version) throw new ApiError(409, 'version_conflict', 'changed');
        storedProject.metadata = structuredClone(metadata ?? storedProject.metadata);
        storedProject.version += 1;
        return structuredClone(storedProject);
      },
    };
    const { bridge, server } = createReighAcpHttpServer({
      config: { token: 'test-token', port: 0, cwd: '/tmp/reigh-project', profile: 'astrid', systemPromptFile: '/tmp/astrid.md', command: ASTRID_ACP_COMMAND },
      idFactory: () => 'connection-1',
      chatRegistry: new ProjectChatRegistry(projectStore as never, 'omp-store', Date.now, mkdtempSync(join(tmpdir(), 'reigh-bridge-chat-'))),
      hostFactory: options => createAstridAcpProcessHost({ ...options, fileIsRegularFile: () => true, spawnProcess: () => fakeProcess.asProcess() }),
    });
    const base = `http://127.0.0.1:${await listen(server)}`;
    const connecting = fetch(`${base}/connect`, { method: 'POST', headers: headers(), body: '{}' });
    await waitForRequest(fakeProcess);
    respond(fakeProcess, lastRequest(fakeProcess).id, { agentCapabilities: { loadSession: true } });
    await connecting;

    const read = async () => fetch(`${base}/projects/p1/chat`, { headers: headers() });
    expect(await (await read()).json()).toMatchObject({ selected_session_id: null, sessions: [] });
    const beforeCreate = fakeProcess.stdin.writes.length;
    const creating = fetch(`${base}/projects/p1/chat/sessions`, { method: 'POST', headers: headers(), body: JSON.stringify({ connection_id: 'connection-1', mode: 'ensure_main', operation_id: 'new-op' }) });
    await waitForRequest(fakeProcess, beforeCreate);
    const createRequest = lastRequest(fakeProcess);
    expect(createRequest).toMatchObject({ method: 'session/new', params: { cwd: '/tmp/reigh-project', mcpServers: [] } });
    respond(fakeProcess, createRequest.id, { sessionId: 'session-1' });
    const created = await (await creating).json() as { selected_session_id: string };
    expect(created.selected_session_id).toBe('session-1');
    const currentChat = await (await read()).json() as { revision: number; main_session_id: string };
    expect(currentChat.main_session_id).toBe('session-1');
    const foreignMain = await fetch(`${base}/projects/p1/chat/main`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ expected_revision: currentChat.revision, main_session_id: 'foreign' }) });
    expect(foreignMain.status).toBe(403);
    const chooseMain = await fetch(`${base}/projects/p1/chat/main`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ expected_revision: currentChat.revision, main_session_id: 'session-1' }) });
    expect(chooseMain.status).toBe(200);
    expect(await chooseMain.json()).toMatchObject({ main_session_id: 'session-1', selected_session_id: 'session-1' });
    const staleMain = await fetch(`${base}/projects/p1/chat/main`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ expected_revision: currentChat.revision, main_session_id: 'session-1' }) });
    expect(staleMain.status).toBe(409);


    const savedDraft = await fetch(`${base}/projects/p1/chat/draft`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ expected_revision: 0, text: 'draft', queued_messages: [{ id: 'q1', text: 'queued', session_id: 'session-1' }] }) });
    expect(await savedDraft.json()).toMatchObject({ draft: { text: 'draft', queued_messages: [{ id: 'q1' }] } });
    const foreignPrompt = await fetch(`${base}/projects/p1/chat/prompt`, { method: 'POST', headers: headers(), body: JSON.stringify({ connection_id: 'connection-1', session_id: 'foreign', prompt: [] }) });
    expect(foreignPrompt.status).toBe(403);

    const beforePrompt = fakeProcess.stdin.writes.length;
    const prompting = fetch(`${base}/projects/p1/chat/prompt`, { method: 'POST', headers: headers(), body: JSON.stringify({ connection_id: 'connection-1', session_id: 'session-1', prompt: [{ type: 'text', text: 'hello' }] }) });
    await waitForRequest(fakeProcess, beforePrompt);
    const prompt = lastRequest(fakeProcess);
    expect(prompt).toMatchObject({ method: 'session/prompt', params: { sessionId: 'session-1' } });
    respond(fakeProcess, prompt.id, { stopReason: 'end_turn' });
    await expect((await prompting).json()).resolves.toEqual({ result: { stopReason: 'end_turn' } });

    await bridge.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it('defaults to OMP canonical session storage when no override is configured', () => {
    expect(resolveReighAcpBridgeConfig({
      ASTRID_BRIDGE_TOKEN: 'test-token',
      ASTRID_ACP_CWD: '/tmp/reigh-canonical-project',
      ASTRID_ACP_PROFILE: 'astrid',
    })).toMatchObject({
      token: 'test-token',
      cwd: '/tmp/reigh-canonical-project',
      profile: 'astrid',
    });
    expect(resolveReighAcpBridgeConfig({
      ASTRID_BRIDGE_TOKEN: 'test-token',
      ASTRID_ACP_CWD: '/tmp/reigh-canonical-project',
      ASTRID_ACP_PROFILE: 'astrid',
      ASTRID_ACP_SESSION_DIR: '/tmp/reigh-legacy-sessions',
    }).sessionDir).toBe('/tmp/reigh-legacy-sessions');
  });

  it('limits session config changes to advertised model/thinking values on an owned session', async () => {
    const fakeProcess = new FakeProcess();
    const { bridge, server } = createReighAcpHttpServer({
      config: {
        token: 'test-token', port: 0, cwd: '/tmp/reigh-project', profile: 'astrid',
        systemPromptFile: '/tmp/astrid.md', command: ASTRID_ACP_COMMAND,
      },
      hostFactory: (options) => createAstridAcpProcessHost({
        ...options,
        fileIsRegularFile: () => true,
        spawnProcess: () => fakeProcess.asProcess(),
      }),
    });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    const connecting = fetch(`${base}/connect`, { method: 'POST', headers: headers(), body: '{}' });
    await waitForRequest(fakeProcess);
    const initialize = lastRequest(fakeProcess);
    respond(fakeProcess, initialize.id, { agentCapabilities: { loadSession: true } });
    const { connection_id: connectionId } = await (await connecting).json() as { connection_id: string };

    const options = [
      { id: 'model', currentValue: 'openai-codex/gpt-5.6-sol', options: [
        { value: 'openai-codex/gpt-5.6-sol' }, { value: 'openai-codex/gpt-5.6-luna' },
      ] },
      { id: 'thinking', currentValue: 'high', options: [{ value: 'high' }, { value: 'xhigh' }] },
    ];
    const afterInitialize = fakeProcess.stdin.writes.length;
    const resuming = fetch(`${base}/${connectionId}/rpc`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ method: 'session/resume', params: { sessionId: 'owned-session' } }),
    });
    await waitForRequest(fakeProcess, afterInitialize);
    const resume = lastRequest(fakeProcess);
    respond(fakeProcess, resume.id, { sessionId: 'owned-session', configOptions: options });
    await resuming;

    const afterResume = fakeProcess.stdin.writes.length;
    const setting = fetch(`${base}/${connectionId}/rpc`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ method: 'session/set_config_option', params: {
        sessionId: 'owned-session', configId: 'model', value: 'openai-codex/gpt-5.6-luna',
      } }),
    });
    await waitForRequest(fakeProcess, afterResume);
    const setModel = lastRequest(fakeProcess);
    expect(setModel).toMatchObject({
      method: 'session/set_config_option',
      params: { sessionId: 'owned-session', configId: 'model', value: 'openai-codex/gpt-5.6-luna' },
    });
    const updatedOptions = [
      { ...options[0], currentValue: 'openai-codex/gpt-5.6-luna' }, options[1],
    ];
    respond(fakeProcess, setModel.id, { configOptions: updatedOptions });
    await expect((await setting).json()).resolves.toEqual({ result: { configOptions: updatedOptions } });

    const afterSet = fakeProcess.stdin.writes.length;
    const rejected = await fetch(`${base}/${connectionId}/rpc`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ method: 'session/set_config_option', params: {
        sessionId: 'owned-session', configId: 'model', value: 'openai-codex/gpt-5.6-sol', persist: true,
      } }),
    });
    expect(rejected.status).toBe(400);
    expect(fakeProcess.stdin.writes).toHaveLength(afterSet);

    const foreign = await fetch(`${base}/${connectionId}/rpc`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ method: 'session/set_config_option', params: {
        sessionId: 'other-session', configId: 'thinking', value: 'xhigh',
      } }),
    });
    expect(foreign.status).toBe(400);
    expect(fakeProcess.stdin.writes).toHaveLength(afterSet);

    await bridge.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('forwards browser lifecycle controls with host-owned cwd and ephemeral connection identity', async () => {
    const first = new FakeProcess();
    const second = new FakeProcess();
    const processes = [first, second];
    const config: ReighAcpBridgeConfig = {
      token: 'test-token',
      port: 0,
      cwd: '/tmp/reigh-project',
      profile: 'astrid',
      sessionDir: '/tmp/reigh-sessions',
      systemPromptFile: '/tmp/astrid.md',
      command: ASTRID_ACP_COMMAND,
    };
    const { bridge, server } = createReighAcpHttpServer({
      config,
      idFactory: (() => {
        let index = 0;
        return () => `connection-${++index}`;
      })(),
      hostFactory: (options) => createAstridAcpProcessHost({
        ...options,
        fileIsRegularFile: () => true,
        spawnProcess: () => {
          const process = processes.shift();
          if (!process) throw new Error('no fake ACP process remains');
          return process.asProcess();
        },
      }),
    });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;

    const unauthorized = await fetch(`${base}/health`);
    expect(unauthorized.status).toBe(401);

    const connecting = fetch(`${base}/connect`, { method: 'POST', headers: headers(), body: '{}' });
    await waitForRequest(first);
    const initialize = lastRequest(first);
    expect(initialize).toMatchObject({ method: 'initialize', params: { protocolVersion: 1 } });
    respond(first, initialize.id, { agentCapabilities: { loadSession: true } });
    const connected = await (await connecting).json() as { connection_id: string; initialize: unknown };
    expect(connected).toMatchObject({ connection_id: 'connection-1' });

    const afterInitialize = first.stdin.writes.length;
    const creating = fetch(`${base}/connection-1/rpc`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ method: 'session/new', params: { cwd: '/tmp/browser-must-not-redirect' } }),
    });
    await waitForRequest(first, afterInitialize);
    const newSession = lastRequest(first);
    expect(newSession).toMatchObject({
      method: 'session/new',
      params: { cwd: '/tmp/reigh-project', mcpServers: [] },
    });
    respond(first, newSession.id, { sessionId: 'omp-session-opaque' });
    await expect((await creating).json()).resolves.toEqual({ result: { sessionId: 'omp-session-opaque' } });

    const reconnecting = fetch(base + '/connection-1/reconnect', { method: 'POST', headers: headers(), body: '{}' });
    expect(await (await reconnecting).json()).toEqual({ connection_id: 'connection-1', reused: true });

    const afterReconnect = first.stdin.writes.length;
    const resuming = fetch(base + '/connection-1/rpc', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ method: 'session/resume', params: { sessionId: 'omp-session-opaque' } }),
    });
    await waitForRequest(first, afterReconnect);
    const resume = lastRequest(first);
    expect(resume).toMatchObject({
      method: 'session/resume',
      params: { sessionId: 'omp-session-opaque', cwd: '/tmp/reigh-project', mcpServers: [] },
    });
    respond(first, resume.id, { sessionId: 'omp-session-opaque' });
    await expect((await resuming).json()).resolves.toEqual({ result: { sessionId: 'omp-session-opaque' } });

    const afterResume = first.stdin.writes.length;
    const prompting = fetch(`${base}/connection-1/rpc`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({
        method: 'session/prompt',
        params: { sessionId: 'omp-session-opaque', prompt: [{ type: 'text', text: 'hello Astrid' }] },
      }),
    });
    await waitForRequest(first, afterResume);
    const prompt = lastRequest(first);
    expect(prompt).toMatchObject({
      method: 'session/prompt',
      params: { sessionId: 'omp-session-opaque', prompt: [{ type: 'text', text: 'hello Astrid' }] },
    });
    respond(first, prompt.id, { stopReason: 'end_turn' });
    await expect((await prompting).json()).resolves.toEqual({ result: { stopReason: 'end_turn' } });

    const afterPrompt = first.stdin.writes.length;
    const cancelling = fetch(`${base}/connection-1/cancel`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ sessionId: 'omp-session-opaque' }),
    });
    await waitForRequest(first, afterPrompt);
    const cancel = lastRequest(first);
    expect(cancel).toMatchObject({ method: 'session/cancel', params: { sessionId: 'omp-session-opaque' } });
    const cancelResponse = await cancelling;
    expect(cancelResponse.status).toBe(200);
    expect(await cancelResponse.json()).toEqual({ cancelled: true, session_id: 'omp-session-opaque' });

    const afterCancel = first.stdin.writes.length;
    const closing = fetch(`${base}/connection-1/rpc`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ method: 'session/close', params: { sessionId: 'omp-session-opaque' } }),
    });
    await waitForRequest(first, afterCancel);
    const close = lastRequest(first);
    expect(close).toMatchObject({ method: 'session/close', params: { sessionId: 'omp-session-opaque' } });
    respond(first, close.id, {});
    await expect((await closing).json()).resolves.toEqual({ result: {} });

    const secondConnecting = fetch(`${base}/connect`, { method: 'POST', headers: headers(), body: '{}' });
    await waitForRequest(second);
    const secondInitialize = lastRequest(second);
    respond(second, secondInitialize.id, { agentCapabilities: { loadSession: true } });
    await expect((await secondConnecting).json()).resolves.toMatchObject({ connection_id: 'connection-2' });

    const disconnected = await fetch(`${base}/connection-1`, { method: 'DELETE', headers: headers() });
    expect(disconnected.status).toBe(200);
    expect(await disconnected.json()).toEqual({ connection_id: 'connection-1', closed: true });

    await bridge.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('cancels permission claims and refuses terminal callbacks without host confinement', async () => {
    const fakeProcess = new FakeProcess();
    const config: ReighAcpBridgeConfig = {
      token: 'test-token',
      port: 0,
      cwd: globalThis.process.cwd(),
      profile: 'astrid',
      systemPromptFile: '/tmp/astrid.md',
      command: ASTRID_ACP_COMMAND,
    };
    const { bridge, server } = createReighAcpHttpServer({
      config,
      hostFactory: (options) => createAstridAcpProcessHost({
        ...options,
        fileIsRegularFile: () => true,
        spawnProcess: () => fakeProcess.asProcess(),
      }),
    });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;

    const connecting = fetch(`${base}/connect`, { method: 'POST', headers: headers(), body: '{}' });
    await waitForRequest(fakeProcess);
    const initialize = lastRequest(fakeProcess);
    respond(fakeProcess, initialize.id, { agentCapabilities: { loadSession: true } });
    await connecting;

    const afterInitialize = fakeProcess.stdin.writes.length;
    fakeProcess.stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      id: 'permission-1',
      method: 'session/request_permission',
      params: { toolCall: { title: 'astrid-tools timelines show --summary', kind: 'execute' } },
    })}\n`);
    await waitForRequest(fakeProcess, afterInitialize);
    expect(lastRequest(fakeProcess)).toMatchObject({
      id: 'permission-1',
      result: { outcome: { outcome: 'cancelled' } },
    });

    const afterPermission = fakeProcess.stdin.writes.length;
    fakeProcess.stdout.emit('data', `${JSON.stringify({
      jsonrpc: '2.0',
      id: 'terminal-1',
      method: 'terminal/create',
      params: { command: '/bin/echo', args: ['must-not-run'], cwd: globalThis.process.cwd() },
    })}\n`);
    await waitForRequest(fakeProcess, afterPermission);
    expect(lastRequest(fakeProcess)).toEqual({
      jsonrpc: '2.0',
      id: 'terminal-1',
      error: { code: -32000, message: 'ACP callback "terminal/create" failed.' },
    });

    await bridge.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
});
