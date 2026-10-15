import { confinedLaunch, type HostConfinementPolicy } from '../src/tools/video-editor/runtime/processes/hostConfinement.ts';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../src/integrations/runtime/generated.ts';
import { ChatError, ProjectChatRegistry, chatClaimIdentity, chatStoreIdentity, projectChatClaimDirectory, runtimeChatClient, type QueuedChatMessage } from './reigh-project-chat.ts';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  AcpProcessHost,
  AcpProcessHostError,
  type AcpProcessHostCallbacks,
} from '../src/tools/video-editor/runtime/processes/acpProcessHost.ts';
import {
  ASTRID_ACP_CONTEXT_SYSTEM_PROMPT,
  createAstridAcpProcessHost,
  type AstridAcpLauncherOptions,
} from '../src/tools/video-editor/runtime/processes/astridAcpLauncher.ts';
import {
  ASTRID_BRIDGE_PROTOCOL_HEADER,
  ASTRID_BRIDGE_PROTOCOL_VERSION,
} from '../src/tools/video-editor/data/astridBridgeWire.ts';

const DEFAULT_PORT = 17_335;
const MAX_BODY_BYTES = 128 * 1024;
const MAX_NOTIFICATION_BYTES = 1024 * 1024;
const CLIENT_VERSION = 'reigh-r1-consumer-20260911';
const REQUEST_METHODS = new Set([
  'authenticate',
  'session/new',
  'session/load',
  'session/list',
  'session/resume',
  'session/fork',
  'session/close',
  'session/prompt',
  'session/set_config_option',
]);

type JsonRecord = Record<string, unknown>;

class LocalMediaOnlyError extends Error {}

export type ReighAcpBridgeConfig = {
  readonly token: string;
  readonly port: number;
  readonly cwd: string;
  readonly profile?: string;
  /** Optional OMP override; omission uses OMP's cwd-derived canonical store. */
  readonly sessionDir?: string;
  readonly systemPromptFile?: string;
  readonly command?: string;
  /** Hosted same-machine mode refuses inline prompt attachments. */
  readonly localMediaOnly?: boolean;
};

type Connection = {
  readonly host: AcpProcessHost;
  readonly notifications: unknown[];
  readonly terminals: Map<string, TerminalRecord>;
  readonly sessions: Set<string>;
  readonly configOptions: Map<string, Map<string, Set<string>>>;
  disconnected: boolean;
  notificationBytes: number;
  readonly localMediaOnly: boolean;
};

type TerminalExitStatus = {
  readonly exitCode: number | null;
  readonly signal: string | null;
};

type TerminalRecord = {
  readonly process: ChildProcessWithoutNullStreams;
  readonly outputByteLimit: number;
  exit: Promise<TerminalExitStatus>;
  output: string;
  outputBytes: number;
  truncated: boolean;
  exited: TerminalExitStatus | null;
};

type BridgeOptions = {
  /** Host capability only; intentionally absent from public config/env decoding. */
  readonly confinement?: HostConfinementPolicy;
  readonly chatRegistry?: ProjectChatRegistry;
  readonly config: ReighAcpBridgeConfig;
  readonly hostFactory?: (options: AstridAcpLauncherOptions) => AcpProcessHost;
  readonly idFactory?: () => string;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function parsePort(value: string | undefined): number {
  const candidate = value ?? String(DEFAULT_PORT);
  if (!/^\d{1,5}$/.test(candidate)) throw new Error('ASTRID_ACP_BRIDGE_PORT must be an integer from 1 to 65535');
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('ASTRID_ACP_BRIDGE_PORT must be an integer from 1 to 65535');
  }
  return port;
}

function requiredAbsolute(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = env[key]?.trim();
  if (!value || !value.startsWith('/')) throw new Error(`${key} must be an explicit absolute path`);
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Reject inline binary media while retaining text and scoped resource metadata. */
export function assertLocalMediaOnly(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertLocalMediaOnly(item);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  const inlineUri = typeof record.uri === 'string' && /^(data|blob):/i.test(record.uri);
  if (['image', 'audio', 'video'].includes(String(record.type))
      || typeof record.blob === 'string' || inlineUri) {
    throw new LocalMediaOnlyError('Hosted local-only ACP accepts text and scoped resource metadata, not inline image, audio, video or binary resources. Import the media into the local Runtime and send its resource ID instead.');
  }
  for (const child of Object.values(record)) assertLocalMediaOnly(child);
}

function advertisedConfigOptions(value: unknown): Map<string, Set<string>> {
  const record = asRecord(value);
  if (!Array.isArray(record?.configOptions)) return new Map();
  const result = new Map<string, Set<string>>();
  for (const candidate of record.configOptions) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !Array.isArray(candidate.options)) continue;
    const values = new Set<string>();
    for (const option of candidate.options) {
      if (isRecord(option) && typeof option.value === 'string') values.add(option.value);
    }
    if (values.size > 0) result.set(candidate.id, values);
  }
  return result;
}

function sessionIdFrom(value: unknown): string | null {
  const record = asRecord(value);
  const sessionId = record?.sessionId ?? record?.session_id ?? record?.id;
  return typeof sessionId === 'string' && sessionId ? sessionId : null;
}

function isPathWithin(root: string, candidate: string): boolean {
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
  return candidate === root || candidate.startsWith(normalizedRoot);
}

function terminalCwd(value: unknown, root: string): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return root;
  return isPathWithin(root, value) ? value : root;
}

function terminalOutputLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1_048_576;
  return Math.max(1, Math.min(Math.floor(value), 8 * 1_048_576));
}

function appendTerminalOutput(terminal: TerminalRecord, chunk: Buffer | string): void {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
  const remaining = terminal.outputByteLimit - terminal.outputBytes;
  if (remaining <= 0) {
    terminal.truncated = true;
    return;
  }
  const bytes = Buffer.byteLength(text);
  if (bytes <= remaining) {
    terminal.output += text;
    terminal.outputBytes += bytes;
    return;
  }
  terminal.output += Buffer.from(text).subarray(0, remaining).toString('utf8');
  terminal.outputBytes = terminal.outputByteLimit;
  terminal.truncated = true;
}

function createTerminal(
  params: unknown,
  root: string,
  terminals: Map<string, TerminalRecord>,
  confinement?: HostConfinementPolicy,
): { terminalId: string } {
  if (!isRecord(params) || typeof params.command !== 'string' || !params.command) {
    throw new Error('terminal/create requires a command');
  }
  const args = Array.isArray(params.args) ? params.args.filter((value): value is string => typeof value === 'string') : [];
  const plan = confinedLaunch(confinement, params.command, args, terminalCwd(params.cwd, root));
  const child = spawn(plan.command, [...plan.args], {
    ...plan.options, stdio: [...plan.options.stdio],
  });
  const terminal: TerminalRecord = {
    process: child,
    outputByteLimit: terminalOutputLimit(params.outputByteLimit),
    exit: Promise.resolve({ exitCode: null, signal: null }),
    output: '',
    outputBytes: 0,
    truncated: false,
    exited: null,
  };
  terminal.exit = new Promise<TerminalExitStatus>((resolve) => {
    let settled = false;
    const finish = (status: TerminalExitStatus): void => {
      if (settled) return;
      settled = true;
      terminal.exited = status;
      resolve(status);
    };
    child.once('exit', (code, signal) => finish({
      exitCode: typeof code === 'number' ? code : null,
      signal: signal ?? null,
    }));
    child.once('error', () => finish({ exitCode: null, signal: null }));
  });
  child.stdout.on('data', (chunk) => appendTerminalOutput(terminal, chunk));
  child.stderr.on('data', (chunk) => appendTerminalOutput(terminal, chunk));
  const terminalId = randomUUID();
  terminals.set(terminalId, terminal);
  return { terminalId };
}

function getTerminal(params: unknown, terminals: Map<string, TerminalRecord>): TerminalRecord {
  const terminalId = isRecord(params) && typeof params.terminalId === 'string' ? params.terminalId : '';
  const terminal = terminals.get(terminalId);
  if (!terminal) throw new Error('terminal is not available');
  return terminal;
}

function closeTerminals(terminals: Map<string, TerminalRecord>): void {
  for (const terminal of terminals.values()) {
    if (!terminal.exited) terminal.process.kill('SIGTERM');
  }
  terminals.clear();
}

export function resolveReighAcpBridgeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReighAcpBridgeConfig {
  const token = env.ASTRID_ACP_BRIDGE_TOKEN?.trim() || env.ASTRID_BRIDGE_TOKEN?.trim();
  if (!token) throw new Error('ASTRID_ACP_BRIDGE_TOKEN (or legacy ASTRID_BRIDGE_TOKEN) is required');
  const policy = env.ASTRID_ACP_LOCAL_MEDIA_ONLY?.trim();
  if (policy && policy !== '0' && policy !== '1') throw new Error('ASTRID_ACP_LOCAL_MEDIA_ONLY must be 0 or 1');
  const profile = env.ASTRID_ACP_PROFILE?.trim() || undefined;
  return {
    token,
    localMediaOnly: policy === '1',
    port: parsePort(env.ASTRID_ACP_BRIDGE_PORT),
    cwd: requiredAbsolute(env, 'ASTRID_ACP_CWD'),
    profile,
    ...(env.ASTRID_ACP_SESSION_DIR?.trim()
      ? { sessionDir: requiredAbsolute(env, 'ASTRID_ACP_SESSION_DIR') }
      : {}),
    ...(env.ASTRID_ACP_SYSTEM_PROMPT_FILE?.trim()
      ? { systemPromptFile: env.ASTRID_ACP_SYSTEM_PROMPT_FILE.trim() }
      : {}),
    ...(env.ASTRID_ACP_COMMAND?.trim() ? { command: env.ASTRID_ACP_COMMAND.trim() } : {}),
  };
}

function jsonResponse(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader(ASTRID_BRIDGE_PROTOCOL_HEADER, ASTRID_BRIDGE_PROTOCOL_VERSION);
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) throw new Error('request body exceeds 128 KiB');
    chunks.push(value);
  }
  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('request body is not valid JSON');
  }
}

function hostError(error: unknown): { status: number; body: JsonRecord } {
  if (error instanceof ChatError || error instanceof ApiError) {
    return { status: error.status, body: { error: error.code, detail: error.message } };
  }
  if (error instanceof AcpProcessHostError) {
    return { status: 502, body: { error: error.code, detail: error.message } };
  }
  return {
    status: 500,
    body: { error: 'acp_bridge_error', detail: error instanceof Error ? error.message : String(error) },
  };
}

export class ReighAcpBridge {
  private readonly config: ReighAcpBridgeConfig;
  private readonly confinement?: HostConfinementPolicy;
  private readonly hostFactory: (options: AstridAcpLauncherOptions) => AcpProcessHost;
  private readonly idFactory: () => string;
  private readonly connections = new Map<string, Connection>();
  private readonly chatRegistry?: ProjectChatRegistry;

  constructor(options: BridgeOptions) {
    this.config = options.config;
    this.confinement = options.confinement;
    this.hostFactory = options.hostFactory ?? createAstridAcpProcessHost;
    this.idFactory = options.idFactory ?? randomUUID;
    const runtime = options.chatRegistry ? undefined : runtimeChatClient();
    this.chatRegistry = options.chatRegistry ?? (runtime ? new ProjectChatRegistry(runtime, chatStoreIdentity(this.config), Date.now, projectChatClaimDirectory(this.config), chatClaimIdentity(this.config)) : undefined);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.isAuthorized(request)) {
      jsonResponse(response, this.config.token ? 401 : 503, {
        error: this.config.token ? 'unauthorized' : 'acp_auth_not_configured',
        detail: this.config.token ? 'A valid Astrid bridge bearer credential is required' : 'ASTRID_BRIDGE_TOKEN is required',
      });
      return;
    }
    if (request.headers[ASTRID_BRIDGE_PROTOCOL_HEADER.toLowerCase()] !== ASTRID_BRIDGE_PROTOCOL_VERSION) {
      jsonResponse(response, 400, {
        error: 'invalid_protocol',
        detail: `Expected ${ASTRID_BRIDGE_PROTOCOL_HEADER}: ${ASTRID_BRIDGE_PROTOCOL_VERSION}`,
      });
      return;
    }

    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        jsonResponse(response, 200, { status: 'ok', bridge: 'reigh-acp', protocol: ASTRID_BRIDGE_PROTOCOL_VERSION });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/connect') {
        await this.connect(response, this.localMediaOnly(request));
        return;
      }

      const projectChat = url.pathname.match(/^\/projects\/([^/]+)\/chat(?:\/(sessions|unassigned|associate|draft|prompt|main))?$/);
      if (projectChat) {
        await this.projectChat(decodeURIComponent(projectChat[1]), projectChat[2], request, response, this.localMediaOnly(request));
        return;
      }

      const match = url.pathname.match(/^\/([^/]+)(?:\/(rpc|cancel|events|reconnect))?$/);
      if (!match) {
        jsonResponse(response, 404, { error: 'not_found', detail: 'Unknown Reigh ACP route' });
        return;
      }
      const connection = this.connections.get(match[1]);
      if (!connection) {
        jsonResponse(response, 404, { error: 'not_found', detail: 'ACP connection is not available; reconnect' });
        return;
      }
      if (this.localMediaOnly(request) && !connection.localMediaOnly) {
        jsonResponse(response, 409, { error: 'hosted_connection_required', detail: 'Create a new hosted ACP connection to enable local media protections in the installed agent' });
        return;
      }
      if (match[2] === 'events' && request.method === 'GET') {
        const notifications = connection.notifications.splice(0);
        connection.notificationBytes = 0;
        jsonResponse(response, 200, { notifications, disconnected: connection.disconnected });
        return;
      }
      if (match[2] === 'rpc' && request.method === 'POST') {
        await this.rpc(connection, request, response, connection.localMediaOnly || this.localMediaOnly(request));
        return;
      }
      if (match[2] === 'cancel' && request.method === 'POST') {
        await this.cancel(connection, request, response);
        return;
      }
      if (match[2] === 'reconnect' && request.method === 'POST') {
        jsonResponse(response, connection.disconnected ? 502 : 200, connection.disconnected
          ? { error: 'acp_process_exited', detail: 'The live ACP process exited; reconnect requires a new host process' }
          : { connection_id: match[1], reused: true });
        return;
      }
      if (!match[2] && (request.method === 'DELETE' || request.method === 'POST')) {
        await connection.host.dispose();
        closeTerminals(connection.terminals);
        this.connections.delete(match[1]);
        jsonResponse(response, 200, { connection_id: match[1], closed: true });
        return;
      }
      jsonResponse(response, 404, { error: 'not_found', detail: 'Unknown Reigh ACP connection route' });
    } catch (error) {
      const result = error instanceof LocalMediaOnlyError
        ? { status: 415, body: { error: 'local_media_required', detail: error.message } }
        : error instanceof Error && error.message.includes('128 KiB')
        ? { status: 413, body: { error: 'payload_too_large', detail: error.message } }
      : error instanceof Error && (error.message.includes('request body') || error.message.includes('method') || error.message.includes('sessionId') || error.message.includes('config option'))
          ? { status: 400, body: { error: 'invalid_body', detail: error.message } }
          : hostError(error);
      jsonResponse(response, result.status, result.body);
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.connections.values()].map(async ({ host, terminals }) => {
      await host.dispose();
      closeTerminals(terminals);
    }));
    this.connections.clear();
  }

  private isAuthorized(request: IncomingMessage): boolean {
    return Boolean(this.config.token) && request.headers.authorization === `Bearer ${this.config.token}`;
  }

  private localMediaOnly(request: IncomingMessage): boolean {
    return this.config.localMediaOnly === true || request.headers['x-reigh-local-media-only'] === '1';
  }

  private async connect(response: ServerResponse, localMediaOnly: boolean): Promise<void> {
    const connectionId = this.idFactory();
    const notifications: unknown[] = [];
    const terminals = new Map<string, TerminalRecord>();
    let connection: Connection | null = null;
    const callbacks: AcpProcessHostCallbacks = {
      // No real human approval consumer exists here. Titles/options are claims,
      // never security approval or a source of confinement authority.
      requestPermission: () => ({ outcome: { outcome: 'cancelled' } }),
      createTerminal: (params) => createTerminal(params, this.config.cwd, terminals, this.confinement),
      terminalOutput: (params) => {
        const terminal = getTerminal(params, terminals);
        return {
          output: terminal.output,
          truncated: terminal.truncated,
          exitStatus: terminal.exited,
        };
      },
      waitForTerminalExit: async (params) => getTerminal(params, terminals).exit,
      killTerminal: (params) => {
        const terminal = getTerminal(params, terminals);
        if (!terminal.exited) terminal.process.kill('SIGTERM');
        return {};
      },
      releaseTerminal: (params) => {
        const terminalId = isRecord(params) && typeof params.terminalId === 'string' ? params.terminalId : '';
        const terminal = terminals.get(terminalId);
        if (terminal && !terminal.exited) terminal.process.kill('SIGTERM');
        terminals.delete(terminalId);
        return {};
      },
      onNotification: (notification) => {
        if (!connection || connection.disconnected) return;
        const bytes = Buffer.byteLength(JSON.stringify(notification));
        if (connection.notificationBytes + bytes > MAX_NOTIFICATION_BYTES) {
          connection.disconnected = true;
          notifications.splice(0, notifications.length, {
            jsonrpc: '2.0', method: 'reigh/acp/disconnected',
            params: { code: 'acp_event_overflow', detail: 'ACP event queue exceeded 1 MiB; reconnect and resume the installed session' },
          });
          connection.notificationBytes = 0;
          closeTerminals(terminals);
          void connection.host.dispose();
          return;
        }
        connection.notificationBytes += bytes;
        notifications.push(notification);
      },
      onDisconnect: (error) => {
        if (connection?.disconnected) return;
        if (connection) connection.disconnected = true;
        closeTerminals(terminals);
        notifications.push({
          jsonrpc: '2.0',
          method: 'reigh/acp/disconnected',
          params: { code: error.code },
        });
      },
    };
    const host = this.hostFactory({
      confinement: this.confinement,
      cwd: this.config.cwd,
      profile: this.config.profile,
      sessionDir: this.config.sessionDir,
      systemPromptFile: this.config.systemPromptFile,
      command: this.config.command,
      callbacks,
      ...(localMediaOnly ? { env: {
        PI_CONFIG_FILES: fileURLToPath(new URL('./reigh-acp-local-only.yml', import.meta.url)),
        PI_BASH_NO_LOGIN: '1',
        ASTRID_SYSTEM_PROMPT: `${ASTRID_ACP_CONTEXT_SYSTEM_PROMPT}\nHosted same-machine mode: keep all media bytes on this computer. Use Runtime IDs, text and scoped metadata for CPU edits. Do not send media to model/provider tools or cloud media executors, including through shell commands. Native image submission and inspection are disabled for this session.`,
      } } : {}),
    });
    connection = { host, notifications, terminals, sessions: new Set(), configOptions: new Map(), disconnected: false, notificationBytes: 0, localMediaOnly };
    this.connections.set(connectionId, connection);
    try {
      const initialize = await host.initialize({
        protocolVersion: 1,
        clientCapabilities: { terminal: true },
        clientInfo: { name: 'reigh-acp-bridge', version: CLIENT_VERSION },
      });
      jsonResponse(response, 200, { connection_id: connectionId, initialize });
    } catch (error) {
      this.connections.delete(connectionId);
      closeTerminals(terminals);
      await host.dispose();
      throw error;
    }
  }

  private async projectChat(projectId: string, action: string | undefined, request: IncomingMessage, response: ServerResponse, localMediaOnly: boolean): Promise<void> {
    const registry = this.chatRegistry;
    if (!registry) throw new ChatError(503, 'chat_storage_unavailable', 'Project chat requires the configured Workspace Runtime endpoint and credential');
    if (!action && request.method === 'GET') {
      jsonResponse(response, 200, await registry.get(projectId));
      return;
    }
    if (action === 'unassigned' && request.method === 'GET') {
      const connectionId = new URL(request.url ?? '/', 'http://localhost').searchParams.get('connection_id');
      const connection = connectionId ? this.connections.get(connectionId) : undefined;
      if (!connection || connection.disconnected) throw new ChatError(404, 'connection_not_found', 'ACP connection is unavailable; reconnect');
      if (localMediaOnly && !connection.localMediaOnly) throw new ChatError(409, 'hosted_connection_required', 'Create a hosted ACP connection to enable installed-agent media protections');
      const result = await connection.host.request('session/list', { cwd: this.config.cwd });
      const root = asRecord(result) ?? {};
      const items = Array.isArray(result) ? result : Array.isArray(root.sessions) ? root.sessions : Array.isArray(root.items) ? root.items : [];
      const candidates = items.flatMap(item => {
        const session = asRecord(item);
        const id = sessionIdFrom(item);
        if (!id) return [];
        const title = typeof session?.title === 'string' ? session.title : undefined;
        return [{ id, ...(title ? { title } : {}) }];
      });
      jsonResponse(response, 200, { sessions: await registry.unassigned(projectId, candidates) });
      return;
    }
    const body = asRecord(await readJson(request));
    if (!body) throw new ChatError(400, 'invalid_body', 'Expected a JSON object');
    if (localMediaOnly) assertLocalMediaOnly(body);
    if (request.method === 'PATCH' && (!action || action === 'draft' || action === 'main')) {
      if (!Number.isInteger(body.expected_revision) || (body.expected_revision as number) < 0) throw new ChatError(400, 'invalid_body', 'expected_revision must be a nonnegative integer');
      if (action === 'draft') {
        if (typeof body.text !== 'string' || body.text.length > 100_000) throw new ChatError(400, 'invalid_body', 'Draft text must be a string of at most 100000 characters');
        if (body.queued_messages !== undefined && (!Array.isArray(body.queued_messages) || body.queued_messages.length > 100 || !body.queued_messages.every(item => isRecord(item) && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.session_id === 'string' && (item.attachments === undefined || Array.isArray(item.attachments))))) throw new ChatError(400, 'invalid_body', 'queued_messages must contain scoped message records');
        jsonResponse(response, 200, await registry.draft(projectId, body.expected_revision as number, body.text, body.queued_messages as QueuedChatMessage[] | undefined));
      } else if (action === 'main') {
        if (typeof body.main_session_id !== 'string' || !body.main_session_id) throw new ChatError(400, 'invalid_body', 'main_session_id is required');
        jsonResponse(response, 200, await registry.setMain(projectId, body.expected_revision as number, body.main_session_id));
      } else {
        if (body.selected_session_id !== null && typeof body.selected_session_id !== 'string') throw new ChatError(400, 'invalid_body', 'selected_session_id is required');
        jsonResponse(response, 200, await registry.select(projectId, body.expected_revision as number, body.selected_session_id as string | null));
      }
      return;
    }
    if (request.method === 'POST' && (action === 'sessions' || action === 'prompt' || action === 'associate')) {
      const connection = typeof body.connection_id === 'string' ? this.connections.get(body.connection_id) : undefined;
      if (!connection || connection.disconnected) throw new ChatError(404, 'connection_not_found', 'ACP connection is unavailable; reconnect');
      if (localMediaOnly && !connection.localMediaOnly) throw new ChatError(409, 'hosted_connection_required', 'Create a hosted ACP connection to enable installed-agent media protections');
      // Follow-up requests inherit the connection's sticky hosted policy even
      // when a direct caller omits the per-request header. Check before registry
      // mutations, session creation/resume or agent forwarding.
      if (connection.localMediaOnly || localMediaOnly) assertLocalMediaOnly(body);
      if (action === 'sessions') {
        if ((body.mode !== 'ensure' && body.mode !== 'ensure_main' && body.mode !== 'new') || typeof body.operation_id !== 'string' || !body.operation_id || body.operation_id.length > 200) throw new ChatError(400, 'invalid_body', 'mode and operation_id are required');
        const state = await registry.create(projectId, body.mode, body.operation_id, async () => {
          const result = await connection.host.request('session/new', { cwd: this.config.cwd, mcpServers: [] });
          this.rememberSession(connection, 'session/new', {}, result);
          return result;
        }, async sessionId => {
          try {
            const result = await connection.host.request('session/resume', { sessionId, cwd: this.config.cwd, mcpServers: [] });
            this.rememberSession(connection, 'session/resume', { sessionId }, result);
            return true;
          } catch (error) {
            if (error instanceof AcpProcessHostError && error.code === 'acp_transport' && error.message === `ACP request "session/resume" failed: ACP session not found: ${sessionId}`) return false;
            throw error;
          }
        });
        if (state.operation_session_id) connection.sessions.add(state.operation_session_id);
        jsonResponse(response, 200, state);
      } else if (action === 'associate') {
        if (typeof body.session_id !== 'string' || !Number.isInteger(body.expected_revision)) throw new ChatError(400, 'invalid_body', 'session_id and expected_revision are required');
        const state = await registry.associate(projectId, body.expected_revision as number, body.session_id, async sessionId => {
          try {
            const result = await connection.host.request('session/resume', { sessionId, cwd: this.config.cwd, mcpServers: [] });
            this.rememberSession(connection, 'session/resume', { sessionId }, result);
            return true;
          } catch (error) {
            if (error instanceof AcpProcessHostError && error.code === 'acp_transport' && error.message === `ACP request "session/resume" failed: ACP session not found: ${sessionId}`) return false;
            throw error;
          }
        });
        jsonResponse(response, 200, state);
      } else {
        if (typeof body.session_id !== 'string' || !Array.isArray(body.prompt)) throw new ChatError(400, 'invalid_body', 'session_id and prompt are required');
        await registry.assertOwned(projectId, body.session_id);
        const result = await connection.host.request('session/prompt', { sessionId: body.session_id, prompt: body.prompt });
        jsonResponse(response, 200, { result });
      }
      return;
    }
    throw new ChatError(404, 'not_found', 'Unknown project chat operation');
  }

  private rememberSession(connection: Connection, method: string, params: unknown, result: unknown): void {
    if (method !== 'session/new' && method !== 'session/load' && method !== 'session/resume') return;
    const input = asRecord(params);
    const sessionId = sessionIdFrom(result) ?? (method === 'session/load' || method === 'session/resume' ? sessionIdFrom(input) : null);
    if (!sessionId) return;
    connection.sessions.add(sessionId);
    const options = advertisedConfigOptions(result);
    if (options.size > 0) connection.configOptions.set(sessionId, options);
  }

  private async rpc(connection: Connection, request: IncomingMessage, response: ServerResponse, localMediaOnly: boolean): Promise<void> {
    const body = asRecord(await readJson(request));
    const method = body?.method;
    if (typeof method !== 'string' || !REQUEST_METHODS.has(method)) {
      throw new Error(`method must be one of: ${[...REQUEST_METHODS].join(', ')}`);
    }
    let params = body?.params;
    if (localMediaOnly) assertLocalMediaOnly(params);
    if (method === 'session/new' || method === 'session/load' || method === 'session/resume') {
      const input = asRecord(params) ?? {};
      // The host owns the process cwd; the browser cannot redirect the ACP session.
      params = { ...input, cwd: this.config.cwd, mcpServers: input.mcpServers ?? [] };
    }
    if (method === 'session/set_config_option') {
      const input = asRecord(params);
      if (!input || Object.keys(input).some((key) => !['sessionId', 'configId', 'value'].includes(key))) {
        throw new Error('config option request accepts only sessionId, configId, and value');
      }
      if (typeof input.sessionId !== 'string' || !input.sessionId) throw new Error('sessionId is required for config option updates');
      if (!connection.sessions.has(input.sessionId)) throw new Error('config option sessionId is not owned by this ACP connection');
      if (input.configId !== 'model' && input.configId !== 'thinking') throw new Error('config option id must be model or thinking');
      if (typeof input.value !== 'string' || !input.value) throw new Error('config option value is required');
      const allowedValues = connection.configOptions.get(input.sessionId)?.get(input.configId);
      if (!allowedValues?.has(input.value)) throw new Error('config option value was not advertised for this session');
    }
    const result = await connection.host.request(method, params);
    if (method === 'session/new' || method === 'session/load' || method === 'session/resume' || method === 'session/fork') {
      const input = asRecord(params);
      const sessionId = sessionIdFrom(result) ?? (method === 'session/load' || method === 'session/resume' ? sessionIdFrom(input) : null);
      if (sessionId) {
        connection.sessions.add(sessionId);
        const options = advertisedConfigOptions(result);
        if (options.size > 0) connection.configOptions.set(sessionId, options);
      }
    } else if (method === 'session/list') {
      const items = Array.isArray(result) ? result : isRecord(result) && Array.isArray(result.sessions) ? result.sessions : [];
      for (const item of items) {
        const sessionId = sessionIdFrom(item);
        if (sessionId) connection.sessions.add(sessionId);
      }
    } else if (method === 'session/set_config_option') {
      const input = asRecord(params)!;
      const options = advertisedConfigOptions(result);
      if (options.size > 0) connection.configOptions.set(input.sessionId as string, options);
    } else if (method === 'session/close') {
      const sessionId = sessionIdFrom(params);
      if (sessionId) {
        connection.sessions.delete(sessionId);
        connection.configOptions.delete(sessionId);
      }
    }
    jsonResponse(response, 200, { result });
  }

  private async cancel(connection: Connection, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = asRecord(await readJson(request));
    const sessionId = body?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('sessionId is required');
    await connection.host.cancel({ sessionId });
    jsonResponse(response, 200, { cancelled: true, session_id: sessionId });
  }
}

export function createReighAcpHttpServer(options: BridgeOptions): {
  readonly bridge: ReighAcpBridge;
  readonly server: ReturnType<typeof createServer>;
} {
  const bridge = new ReighAcpBridge(options);
  const server = createServer((request, response) => {
    void bridge.handle(request, response);
  });
  server.once('close', () => { void bridge.close(); });
  return { bridge, server };
}

export function startReighAcpBridge(config: ReighAcpBridgeConfig): ReturnType<typeof createServer> {
  const { server } = createReighAcpHttpServer({ config });
  server.listen(config.port, '127.0.0.1');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = resolveReighAcpBridgeConfig();
  const server = startReighAcpBridge(config);
  server.once('listening', () => {
    console.log(`Reigh ACP bridge listening on 127.0.0.1:${config.port}`);
  });
}
