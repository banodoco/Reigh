import { validateEditCommand, type EditCommand } from '@/integrations/runtime/generated.ts';
import { TRACK_SCALE_BAKE_MARKER } from '../lib/timeline-domain.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const trackId = (value: unknown): value is string => typeof value === 'string' && /^parent\/track:[^/\s]+$/.test(value);
const tagged = (value: unknown): value is { state: 'absent' } | { state: 'present'; value: unknown } => record(value)
  && (value.state === 'absent' ? Object.keys(value).length === 1
    : value.state === 'present' && Object.keys(value).length === 2 && Object.prototype.hasOwnProperty.call(value, 'value'));
const field = (path: unknown): path is string => typeof path === 'string' && (['label', 'role', 'scale', 'fit', 'opacity', 'volume', 'muted', 'blendMode'].includes(path)
  || /^app\.[A-Za-z0-9_-]+$/.test(path) && !['__proto__', 'constructor', 'prototype', TRACK_SCALE_BAKE_MARKER].includes(path.slice(4)));

/** Existing parent track creation and exact explicit property patches only.
 * Reorder is excluded: the qualified producer does not return its direct write.
 */
export function isTrackHistoryBatch(commands: readonly EditCommand[]): boolean {
  if (!commands.length || !commands.every(command => trackId(command.select))) return false;
  if (commands.length === 1 && commands[0].op === 'timeline.add') {
    const command = commands[0]; const row = command.args.track;
    return Object.keys(command.args).length === 1 && record(row) && row.id === command.select!.split(':')[1]
      && command.created?.length === 1 && command.created[0] === command.select
      && command.expect?.[`${command.select}::`]?.state === 'absent';
  }
  return new Set(commands.map(command => command.select)).size === commands.length && commands.every(command => {
    if (command.op !== 'timeline.set' || Object.keys(command.args).length !== 2
      || !record(command.args.values) || !Array.isArray(command.args.clear)) return false;
    const paths = [...Object.keys(command.args.values), ...command.args.clear];
    return paths.length > 0 && new Set(paths).size === paths.length && paths.every(path => field(path)
      && tagged(command.expect?.[`${command.select}::${path}`] ?? command.expect?.[path]));
  });
}

export function isTrackHistoryInverse(command: EditCommand | undefined): boolean {
  if (!command || command.op !== 'timeline.inverse' || command.select !== null || !record(command.args)
    || Object.keys(command.args).length !== 2 || typeof command.args.publication !== 'string' || !command.args.publication
    || !Array.isArray(command.args.writes) || !command.args.writes.length) return false;
  const writes = command.args.writes;
  return writes.every((write: unknown) => record(write) && trackId(write.id) && Object.keys(write).length === 4
    && Object.keys(write).every(key => ['id', 'path', 'before', 'after'].includes(key)) && tagged(write.before) && tagged(write.after)
    && (write.path === '' ? writes.length === 1 && write.before.state !== write.after.state
      && [write.before, write.after].every(state => state.state === 'absent' || record(state.value) && state.value.id === String(write.id).split(':')[1]) : field(write.path)))
    && new Set(writes.map(write => `${write.id}::${write.path}`)).size === writes.length;
}

export function trackHistoryInverse(commands: readonly EditCommand[], result: {
  status: string; accepted_publication_id: string | null; change: { direct_writes: unknown[] };
}): EditCommand | null | undefined {
  const undo = commands.length === 1 && isTrackHistoryInverse(commands[0]);
  if (!undo && !isTrackHistoryBatch(commands)) return undefined;
  if (result.status === 'no_change') return null;
  if (result.status !== 'accepted' || !result.accepted_publication_id) return undefined;
  const allowed = undo ? commands[0].args.writes as Array<{ id: string; path: string }>
    : commands.flatMap(command => (command.op === 'timeline.add' ? [''] : [...Object.keys(command.args.values as Record<string, unknown>), ...command.args.clear as string[]])
      .map(path => ({ id: command.select!, path })));
  if (result.change.direct_writes.some(write => !record(write) || !allowed.some(row => row.id === write.id && row.path === write.path))) return undefined;
  const inverse: EditCommand = { op: 'timeline.inverse', select: null, args: { publication: result.accepted_publication_id,
    writes: result.change.direct_writes.map(write => record(write)
      ? { ...structuredClone(write), before: structuredClone(write.after), after: structuredClone(write.before) } : write),
  } };
  if (!isTrackHistoryInverse(inverse)) return undefined;
  validateEditCommand(inverse); return inverse;
}
