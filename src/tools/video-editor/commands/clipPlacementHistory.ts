import { validateEditCommand, type EditCommand } from '@/integrations/runtime/generated.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const scoped = (value: unknown): value is string => typeof value === 'string' && /^(?:parent|occurrence:[^/\s]+)\/clip:[^/\s]+$/.test(value);
const paths = (command: EditCommand): string[] => command.op === 'clip.nudge' ? ['at', 'intent.on', 'intent.fixed_start'] : command.op === 'clip.set-track' ? ['track'] : command.op === 'clip.set-duration' ? ['hold'] : command.op === 'clip.trim' ? ['from', 'to', 'hold'] : ['speed'];

/** Existing ordinary move/edge producers only; relation choices have separate owners. */
export function isClipPlacementBatch(commands: readonly EditCommand[]): boolean {
  return commands.length > 0 && commands.every((command) => scoped(command.select)
    && command.resolved?.length === 1 && command.resolved[0] === command.select
    && (command.op === 'clip.trim' ? Object.keys(command.args).every((key) => ['in_s', 'out_s'].includes(key)) : Object.keys(command.args).length === 1)
    && (command.op === 'clip.nudge' ? Number.isSafeInteger(command.args.frames) && command.args.frames !== 0
      : command.op === 'clip.set-track' ? typeof command.args.track === 'string' && Boolean(command.args.track)
      : command.op === 'clip.set-duration' ? typeof command.args.seconds === 'number' && Number.isFinite(command.args.seconds) && command.args.seconds > 0
        && command.expect?.['app.astrid.until']?.state === 'absent' && command.expect?.['app.astrid.for']?.state === 'absent'
      : command.op === 'clip.trim' ? typeof command.args.out_s === 'number' && Number.isFinite(command.args.out_s) && command.args.out_s > 0
        && (command.args.in_s === undefined || typeof command.args.in_s === 'number' && Number.isFinite(command.args.in_s) && command.args.in_s >= 0 && command.args.out_s > command.args.in_s)
      : command.op === 'clip.set-look' && typeof command.args.speed === 'number' && Number.isFinite(command.args.speed) && command.args.speed > 0)
    && record(command.expect) && Object.keys(command.expect).length > 0)
    && new Set(commands.map((command) => command.select!.split('/')[0])).size === 1
    && new Set(commands.map((command) => `${command.select}::${command.op}`)).size === commands.length;
}

/** Only publication-owned authored placement fields, never resolved consequences. */
export function isClipPlacementInverse(command: EditCommand | undefined): boolean {
  if (!command || command.op !== 'timeline.inverse' || command.select !== null || !record(command.args)
    || typeof command.args.publication !== 'string' || !command.args.publication
    || Object.keys(command.args).length !== 2 || !Array.isArray(command.args.writes) || !command.args.writes.length) return false;
  const writes = command.args.writes;
  return writes.every((write: unknown) => record(write) && scoped(write.id)
    && ['at', 'track', 'hold', 'speed', 'from', 'to', 'intent.on', 'intent.fixed_start'].includes(String(write.path))
    && Object.keys(write).length === 4 && Object.keys(write).every((key) => ['id', 'path', 'before', 'after'].includes(key))
    && [write.before, write.after].every((state) => record(state)
      && (state.state === 'absent' ? Object.keys(state).length === 1
        : state.state === 'present' && Object.prototype.hasOwnProperty.call(state, 'value') && Object.keys(state).length === 2)))
    && new Set(writes.map((write) => write.id.split('/')[0])).size === 1
    && new Set(writes.map((write) => `${write.id}::${write.path}`)).size === writes.length;
}

export function clipPlacementInverse(commands: readonly EditCommand[], result: {
  status: string; accepted_publication_id: string | null; change: { direct_writes: unknown[] };
}): EditCommand | null | undefined {
  const sourceInverse = commands.length === 1 && isClipPlacementInverse(commands[0]);
  if (!sourceInverse && !isClipPlacementBatch(commands)) return undefined;
  if (result.status === 'no_change') return null;
  if (result.status !== 'accepted' || !result.accepted_publication_id) return undefined;
  const inverse: EditCommand = { op: 'timeline.inverse', select: null, args: {
    publication: result.accepted_publication_id,
    writes: result.change.direct_writes.map((write) => record(write)
      ? { ...structuredClone(write), before: structuredClone(write.after), after: structuredClone(write.before) } : write),
  } };
  if (!isClipPlacementInverse(inverse)) return undefined;
  const writes = inverse.args.writes as Array<{ id: string; path: string }>;
  const allowed = sourceInverse ? commands[0].args.writes as Array<{ id: string; path: string }>
    : commands.flatMap((command) => paths(command).map((path) => ({ id: command.select!, path })));
  if (writes.some((write) => !allowed.some((row) => row.id === write.id && row.path === write.path))) return undefined;
  validateEditCommand(inverse);
  return inverse;
}
