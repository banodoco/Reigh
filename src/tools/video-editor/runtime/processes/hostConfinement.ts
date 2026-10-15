/** Host-only capability. Never decode this from JSON, env, MCP config or a title.
 * Construction describes authority; a future GRANT producer must authenticate it.
 * There is deliberately no production producer in the App bridge yet.
 */
export type HostConfinementInput = {
  readonly projectRoot: string;
  readonly projectReadRoots: readonly string[];
  readonly attemptRoot: string;
  readonly scratchRoot: string;
  readonly home: string;
  readonly temp: string;
  readonly bootstrapFiles: readonly string[];
  readonly bootstrapRoots: readonly string[];
  readonly endpoints: readonly { readonly address: string; readonly port: number }[];
  readonly environment?: Readonly<Partial<Record<'LANG' | 'LC_ALL' | 'LC_CTYPE' | 'TZ' | 'TERM', string>>>;
};

declare const hostAuthority: unique symbol;
export type HostConfinementPolicy = Readonly<HostConfinementInput> & { readonly [hostAuthority]: true };
const policies = new WeakSet<object>();
// Explicit bootstrap aliases and their symlink components are host-selected,
// frozen alongside the capability, and rechecked before each launch.
const aliases = new WeakMap<object, readonly { readonly path: string; readonly target: string; readonly root: boolean }[]>();

function builtins() {
  const runtime = (globalThis as { process?: NodeJS.Process }).process;
  if (!runtime?.getBuiltinModule) throw new Error('Confinement requires the Node host');
  return {
    runtime,
    fs: runtime.getBuiltinModule('node:fs') as typeof import('node:fs'),
    path: runtime.getBuiltinModule('node:path') as typeof import('node:path'),
  };
}

function denied(): never { throw new Error('A valid host-owned macOS confinement policy is required'); }

export function requireHostConfinement(policy: HostConfinementPolicy | undefined): HostConfinementPolicy {
  if (!policy || !policies.has(policy)) denied();
  const { runtime, fs } = builtins();
  if (runtime.platform !== 'darwin') denied();
  // No alternate backend, caller executable or unrestricted fallback.
  const backend = '/usr/bin/sandbox-exec';
  if (fs.realpathSync(backend) !== backend || !fs.statSync(backend).isFile()) denied();
  fs.accessSync(backend, fs.constants.X_OK);
  return policy;
}

/** Trusted host code only. Tests construct an unmistakably synthetic policy.
 * WeakSet provenance rejects object spreads, deserialized claims and forged types.
 * It does not authenticate the future production GRANT or protect a compromised host.
 */
export function hostOwnedConfinementPolicy(input: HostConfinementInput): HostConfinementPolicy {
  const { fs, path } = builtins();
  const inside = (root: string, value: string) => value === root || value.startsWith(root + path.sep);
  const canonical = (value: string, directory: boolean): string => {
    if (typeof value !== 'string' || !path.isAbsolute(value) || /[\0\r\n]/.test(value)) denied();
    const resolved = fs.realpathSync(value);
    const stat = fs.statSync(resolved);
    if (directory ? !stat.isDirectory() : !(stat.isFile() || stat.isCharacterDevice())) denied();
    if (resolved === path.parse(resolved).root) denied();
    return resolved;
  };
  const projectRoot = canonical(input.projectRoot, true);
  const projectReadRoots = input.projectReadRoots.map(value => canonical(value, true));
  if (!projectReadRoots.length || projectReadRoots.some(root => !inside(projectRoot, root))) denied();
  const attemptRoot = canonical(input.attemptRoot, true);
  const scratchRoot = canonical(input.scratchRoot, true);
  const home = canonical(input.home, true);
  const temp = canonical(input.temp, true);
  if (inside(projectRoot, attemptRoot) || inside(attemptRoot, projectRoot)
      || scratchRoot === attemptRoot || !inside(attemptRoot, scratchRoot)
      || home === scratchRoot || temp === scratchRoot || !inside(scratchRoot, home) || !inside(scratchRoot, temp)) denied();
  for (const root of [attemptRoot, scratchRoot, home, temp]) {
    const stat = fs.statSync(root);
    if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) denied();
  }
  const bootstrapFiles = input.bootstrapFiles.map(value => canonical(value, false));
  const bootstrapRoots = input.bootstrapRoots.map(value => canonical(value, true));
  const bootstrapAliases: { path: string; target: string; root: boolean }[] = [];
  for (const [resources, root] of [[input.bootstrapFiles, false], [input.bootstrapRoots, true]] as const) {
    for (const resource of resources) {
      const alias = path.normalize(resource);
      const target = fs.realpathSync(alias);
      if (alias !== target) bootstrapAliases.push({ path: alias, target, root });
      let parent = path.dirname(alias);
      while (parent !== '/') {
        if (fs.lstatSync(parent).isSymbolicLink()) bootstrapAliases.push({ path: parent, target: fs.realpathSync(parent), root: false });
        parent = path.dirname(parent);
      }
    }
  }
  if (!bootstrapFiles.length) denied();
  for (const resource of [...bootstrapFiles, ...bootstrapRoots, ...bootstrapAliases.map(alias => alias.path)]) {
    if ([projectRoot, attemptRoot].some(root => inside(root, resource) || inside(resource, root))) denied();
  }
  const endpoints = input.endpoints.map(endpoint => {
    const { address, port } = endpoint;
    if (typeof address !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)
        || address.split('.').some(part => String(Number(part)) !== part || Number(part) > 255)
        || address !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) denied();
    return Object.freeze({ address, port });
  });
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.environment ?? {})) {
    if (!['LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM'].includes(key)
        || typeof value !== 'string' || !/^[A-Za-z0-9_./+@:-]{1,128}$/.test(value)) denied();
    environment[key] = value;
  }
  const policy = Object.freeze({ projectRoot, projectReadRoots: Object.freeze(projectReadRoots), attemptRoot,
    scratchRoot, home, temp, bootstrapFiles: Object.freeze(bootstrapFiles), bootstrapRoots: Object.freeze(bootstrapRoots),
    endpoints: Object.freeze(endpoints), environment: Object.freeze(environment) }) as HostConfinementPolicy;
  policies.add(policy);
  aliases.set(policy, Object.freeze(bootstrapAliases.map(alias => Object.freeze(alias))));
  return policy;
}

/** Validate a child-reported resource before the host performs even a stat.
 * Lexical denial comes first; canonical scope validation then rejects aliases
 * into unselected data. This does not provide race-free filesystem custody.
 */
export function confinementReadPath(policy: HostConfinementPolicy | undefined, value: string): string {
  const authority = requireHostConfinement(policy);
  const { fs, path } = builtins();
  if (!path.isAbsolute(value) || /[\0\r\n]/.test(value)) denied();
  const inside = (root: string, candidate: string) => candidate === root || candidate.startsWith(root + path.sep);
  const readable = (candidate: string) => authority.bootstrapFiles.includes(candidate)
    || [...authority.projectReadRoots, authority.scratchRoot, ...authority.bootstrapRoots].some(root => inside(root, candidate));
  const normalized = path.normalize(value);
  if (!readable(normalized) && !aliases.get(authority)!.some(alias => alias.root ? inside(alias.path, normalized) : alias.path === normalized)) denied();
  const resolved = fs.realpathSync(normalized);
  if (!readable(resolved)) denied();
  return resolved;
}

export function confinedLaunch(
  policy: HostConfinementPolicy | undefined,
  command: string,
  args: readonly string[],
  cwd?: string,
) {
  const authority = requireHostConfinement(policy);
  const { fs, path } = builtins();
  const inside = (root: string, value: string) => value === root || value.startsWith(root + path.sep);
  if (!path.isAbsolute(command) || /[\0\r\n]/.test(command) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) denied();
  const executable = fs.realpathSync(command);
  if (!fs.statSync(executable).isFile() || !(authority.bootstrapFiles.includes(executable)
      || authority.bootstrapRoots.some(root => inside(root, executable)))) denied();
  fs.accessSync(executable, fs.constants.X_OK);
  const directory = fs.realpathSync(cwd ?? authority.projectReadRoots[0]);
  if (!fs.statSync(directory).isDirectory() || ![...authority.projectReadRoots, authority.scratchRoot].some(root => inside(root, directory))) denied();
  // Revalidate paths at the boundary. No claim of race-free path custody.
  for (const resource of [authority.projectRoot, ...authority.projectReadRoots, authority.attemptRoot,
    authority.scratchRoot, authority.home, authority.temp, ...authority.bootstrapFiles, ...authority.bootstrapRoots]) {
    if (fs.realpathSync(resource) !== resource) denied();
  }
  for (const root of [authority.attemptRoot, authority.scratchRoot, authority.home, authority.temp]) {
    const stat = fs.statSync(root);
    if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) denied();
  }
  const bootstrapAliases = aliases.get(authority)!;
  for (const alias of bootstrapAliases) if (fs.realpathSync(alias.path) !== alias.target) denied();
  const literal = (value: string) => JSON.stringify(value);
  const fileFilters = [...authority.bootstrapFiles, ...bootstrapAliases.filter(alias => !alias.root).map(alias => alias.path)]
    .map(value => `(literal ${literal(value)})`);
  const rootFilters = [...authority.bootstrapRoots, ...bootstrapAliases.filter(alias => alias.root).map(alias => alias.path)]
    .map(value => `(subpath ${literal(value)})`);
  const ancestors = new Set(['/']);
  for (const resource of [...authority.projectReadRoots, authority.scratchRoot, ...authority.bootstrapFiles, ...authority.bootstrapRoots, ...bootstrapAliases.map(alias => alias.path)]) {
    let parent = path.dirname(resource);
    while (parent !== '/') { ancestors.add(parent); parent = path.dirname(parent); }
  }
  const profile = [
    '(version 1)', '(deny default)', '(allow process*)', '(allow sysctl-read)',
    `(allow file-read-metadata ${[...ancestors].map(value => `(literal ${literal(value)})`).join(' ')})`,
    '(allow file-read-data (literal "/"))',
    `(allow file-read* file-map-executable ${[...fileFilters, ...rootFilters].join(' ')})`,
    `(allow file-read* ${[...authority.projectReadRoots, authority.scratchRoot].map(value => `(subpath ${literal(value)})`).join(' ')})`,
    `(allow file-write* (subpath ${literal(authority.scratchRoot)}))`,
    // macOS SBPL accepts localhost, not numeric hosts. tcp4 pins localhost
    // to 127.0.0.1; other addresses are refused at policy construction.
    ...authority.endpoints.map(({ port }) => `(allow network-outbound (remote tcp4 ${literal(`localhost:${port}`)}))`),
  ].join('\n');
  return Object.freeze({
    command: '/usr/bin/sandbox-exec',
    args: Object.freeze(['-p', profile, executable, ...args]),
    options: Object.freeze({ cwd: directory, shell: false as const,
      // libuv closes unlisted descriptors at exec. No inherited fd or IPC channel.
      stdio: Object.freeze(['pipe', 'pipe', 'pipe'] as const),
      env: Object.freeze({ PATH: '/usr/bin:/bin', HOME: authority.home, TMPDIR: authority.temp,
        PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1', LANG: 'C', LC_ALL: 'C', ...authority.environment }),
    }),
  });
}
