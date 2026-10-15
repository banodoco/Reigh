import { confinementReadPath, confinedLaunch, requireHostConfinement, type HostConfinementPolicy } from './hostConfinement.ts';
import {
  AcpProcessHost,
  AcpProcessHostError,
  type AcpProcessHostCallbacks,
  type AcpProcessSpawner,
} from './acpProcessHost.ts';

/** Resolve the real user-machine Astrid launcher; it selects the branded OMP build itself. */
export const ASTRID_ACP_COMMAND = 'astrid';
export const ASTRID_ACP_MODE_ARG = '--mode=acp';
export const ASTRID_ACP_PROFILE_FILE_ARG = '--agent-profile-file';
export const ASTRID_ACP_AGENT_IDENTITY = 'astrid';
/** Stable integration rules; the selected project itself is supplied per turn. */
export const ASTRID_ACP_CONTEXT_SYSTEM_PROMPT = [
  'When a Reigh editor prompt contains <reigh_editor_context>, treat that structured block as the authoritative editor context for that turn.',
  'Use the Astrid runtime tools available in the session; do not infer project, timeline, or asset state from the filesystem. The context block is a compact scoped read, not a full asset registry.',
  'The context IDs are resource references, not authorization. Preserve the selected project/timeline scope and use the document version returned by the runtime when saving.',
  'The context can change between turns, so never assume a prior project or timeline remains selected.',
  'For a scoped Reigh timeline request, do not repeat startup maintenance, skill discovery, ls/grep workspace scans, import-location checks, or exploratory one-off Python probes. The Astrid session preflight is already complete; only do those checks when a runtime command fails and diagnosis requires them.',
  'Use the compact runtime read first: astrid-tools timelines show --summary --project <project-slug> <timeline-ref>. It returns the timeline version, tracks, clip ids, start/duration/end timing, and counts without dumping prompts, effect parameters, media URLs, or the full asset registry.',
  'Every runtime command must include explicit --project <project-slug> and the timeline reference; do not rely on implicit current-project selection for an edit.',
  'For a single clip timing change, prefer the one-shot route: astrid-tools timelines retime-clip --project <project-slug> <timeline-ref> --clip-id <clip-id> --at <seconds> --expected-version <config_version>. It performs the scoped read, versioned CAS save, and returns before/after timing plus the new version in one operation; pass the context version when available.',
  'retime-clip defaults to preserve-end because it is the safe non-rippling interpretation: the clip end and downstream cuts stay fixed. Use --preserve-duration only when the user clearly means move/slide the whole clip at the same length; use --hold only for an explicit new duration.',
  'If the user says only "make it start at" and the intent is ambiguous, use the safe preserve-end policy and say that you kept the existing end. If they say move, slide, or keep the same length, use --preserve-duration.',
  'For more complex edits, do one bounded summary/full read, make one in-memory patch, perform one versioned save, and do at most one focused verification read. Avoid repeating equivalent inspections or saving one field at a time.',
  'For Reigh Elements edits, use the host operation boundary instead of hand-editing timeline JSON or claiming completion from prose. Emit each typed operation as one machine-readable block: <reigh_element_operation>{valid JSON}</reigh_element_operation>. The host executes these blocks after the turn and appends the result. For a new Remotion effect/animation/transition, emit elements.create_draft, then elements.validate, then the matching timeline operation; use the deterministic draft revision draft-<id> when pinning it. Do not publish a draft unless the user explicitly asks for a reusable published element.',
].join('\n');

type HostRuntime = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly getBuiltinModule?: (id: string) => unknown;
};

type HostChildProcess = {
  readonly spawnSync?: (
    command: string,
    args: readonly string[],
    options: {
      readonly encoding: 'utf8';
      readonly cwd: string;
      readonly shell: false;
      readonly env: Record<string, string | undefined>;
      readonly stdio: readonly ['ignore', 'pipe', 'pipe'];
      readonly timeout: number;
    },
  ) => {
    readonly status: number | null;
    readonly stdout?: string | Uint8Array;
    readonly stderr?: string | Uint8Array;
    readonly error?: Error;
  };
};

/** Ask the installed Astrid command for its immutable packaged profile resource. */
export function resolveAstridAcpSystemPromptFile(
  command = ASTRID_ACP_COMMAND,
  _env: Record<string, string | undefined> = {},
  confinement?: HostConfinementPolicy,
): string {
  const plan = confinedLaunch(confinement, command, [ASTRID_ACP_PROFILE_FILE_ARG]);
  const runtime = (globalThis as { readonly process?: HostRuntime }).process;
  const childProcess = runtime?.getBuiltinModule?.('node:child_process') as HostChildProcess | undefined;
  if (typeof childProcess?.spawnSync !== 'function') {
    throw new AcpProcessHostError(
      'Astrid ACP profile lookup is available only in the user-machine Node host.',
      { code: 'acp_unavailable' },
    );
  }
  const result = childProcess.spawnSync(plan.command, plan.args, {
    encoding: 'utf8',
    env: plan.options.env,
    cwd: plan.options.cwd,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5_000,
  });
  const path = typeof result.stdout === 'string'
    ? result.stdout.trim()
    : result.stdout ? new TextDecoder().decode(result.stdout).trim() : '';
  if (result.error || result.status !== 0 || !path) {
    const detail = typeof result.stderr === 'string'
      ? result.stderr.trim()
      : result.stderr ? new TextDecoder().decode(result.stderr).trim() : '';
    throw new AcpProcessHostError(
      `Astrid ACP packaged profile lookup failed${detail ? `: ${detail}` : ''}.`,
      { code: 'acp_unavailable', cause: result.error },
    );
  }
  return confinementReadPath(confinement, requireAbsolute(path, 'system prompt file'));
}

type HostFileSystem = {
  readonly statSync?: (path: string) => { isFile: () => boolean };
};

function isRegularFile(path: string): boolean {
  const runtime = (globalThis as { readonly process?: HostRuntime }).process;
  if (typeof runtime?.getBuiltinModule !== 'function') return false;
  const fs = runtime.getBuiltinModule('node:fs') as HostFileSystem | undefined;
  try {
    return fs?.statSync?.(path).isFile() === true;
  } catch {
    return false;
  }
}

function requireAbsolute(value: string, name: string): string {
  if (!value.trim() || !value.startsWith('/')) {
    throw new AcpProcessHostError(
      `Astrid ACP ${name} must be an explicit absolute path.`,
      { code: 'acp_unavailable' },
    );
  }
  return value;
}

export type AstridAcpLauncherOptions = {
  readonly confinement?: HostConfinementPolicy;
  /** Caller-owned project cwd; never inferred from the browser. */
  readonly cwd: string;
  /** Optional isolated Astrid/OMP profile; omitted uses the machine's normal profile. */
  readonly profile?: string;
  /**
   * Optional caller-owned OMP session directory override. When omitted, OMP
   * uses its canonical cwd-derived session directory, which ACP can discover
   * again in a fresh process.
   */
  readonly sessionDir?: string;
  /** Explicit prompt resource override; otherwise the installed Astrid command supplies it. */
  readonly systemPromptFile?: string;
  /** Defaults to the installed Astrid launcher selected on this machine. */
  readonly command?: string;
  readonly env?: Record<string, string | undefined>;
  readonly requestTimeoutMs?: number;
  readonly callbacks?: AcpProcessHostCallbacks;
  /** Test seam for prompt custody; production uses the host filesystem. */
  readonly fileIsRegularFile?: (path: string) => boolean;
  /** Test seam for the read-only installed-profile lookup. */
  readonly profileFileForCommand?: (command: string, env?: Record<string, string | undefined>) => string;
  /** Test seam; production uses AcpProcessHost's explicit Node spawner. */
  readonly spawnProcess?: AcpProcessSpawner;
};

/**
 * Build the one canonical Astrid ACP host. This is intentionally a host-only
 * factory: browser code cannot resolve the prompt or spawn a process. Astrid
 * owns named-agent discovery, its system prompt, branded OMP selection, and
 * identity; Reigh only asks that launcher to expose ACP over stdio. The
 * optional sessionDir/profile are forwarded as explicit OMP launch flags.
 */
export function createAstridAcpProcessHost(options: AstridAcpLauncherOptions): AcpProcessHost {
  // Fake spawners are a host test seam, never reachable from HTTP/config.
  if (!options.spawnProcess) requireHostConfinement(options.confinement);
  const cwd = requireAbsolute(options.cwd, 'cwd');
  const command = options.command ?? ASTRID_ACP_COMMAND;
  const profile = options.profile?.trim() || undefined;
  const sessionDir = options.sessionDir === undefined
    ? undefined
    : requireAbsolute(options.sessionDir, 'session directory');
  const systemPromptFile = requireAbsolute(
    options.systemPromptFile
      ?? (options.profileFileForCommand
        ? options.profileFileForCommand(command, options.env)
        : resolveAstridAcpSystemPromptFile(command, options.env, options.confinement)),
    'system prompt file',
  );
  if (!options.spawnProcess) confinementReadPath(options.confinement, systemPromptFile);
  const promptCheck = options.fileIsRegularFile ?? isRegularFile;
  if (!promptCheck(systemPromptFile)) {
    throw new AcpProcessHostError(
      `Astrid ACP system prompt is unavailable: ${systemPromptFile}`,
      { code: 'acp_unavailable' },
    );
  }
  const args = [
    ASTRID_ACP_MODE_ARG,
    ...(profile ? ['--profile', profile] : []),
    ...(sessionDir ? ['--session-dir', sessionDir] : []),
  ];
  const env = {
    ...(options.env ?? {}),
    OMP_AGENT_IDENTITY: ASTRID_ACP_AGENT_IDENTITY,
    ASTRID_AGENT_IDENTITY: ASTRID_ACP_AGENT_IDENTITY,
    ASTRID_SYSTEM_PROMPT: options.env?.ASTRID_SYSTEM_PROMPT ?? ASTRID_ACP_CONTEXT_SYSTEM_PROMPT,
  };
  return new AcpProcessHost({
    command,
    args,
    cwd,
    env,
    requestTimeoutMs: options.requestTimeoutMs,
    callbacks: options.callbacks,
    spawnProcess: options.spawnProcess,
    confinement: options.confinement,
  });
}
