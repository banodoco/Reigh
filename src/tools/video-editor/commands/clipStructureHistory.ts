import { isClipPlacementBatch } from './clipPlacementHistory.ts';
import { validateEditCommand, type EditCommand } from '@/integrations/runtime/generated.ts';
import { selectedMediaRegistryExpectationPath, readSelectedProjectMediaIdentity } from './selectedProjectMedia.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const clipId = (value: unknown): value is string => typeof value === 'string' && /^parent\/clip:[^/\s]+$/.test(value);
const trackId = (value: unknown): value is string => typeof value === 'string' && /^parent\/track:[^/\s]+$/.test(value);
const tagged = (state: unknown): state is { state: 'absent' } | { state: 'present'; value: unknown } => record(state) && (state.state === 'absent' ? Object.keys(state).length === 1
  : state.state === 'present' && Object.keys(state).length === 2 && Object.prototype.hasOwnProperty.call(state, 'value'));
const permutation = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0
  && value.every(trackId) && new Set(value).size === value.length;
const capturedOrder = (command: EditCommand): string[] | undefined => {
  const order = command.expect?.track_order;
  return order?.state === 'present' && permutation(order.value) ? order.value : undefined;
};
const clipPermutation = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0
  && value.every(clipId) && new Set(value).size === value.length;
const capturedClipOrder = (command: EditCommand): string[] | undefined => {
  const order = command.expect?.clip_order ?? (clipId(command.args.from) ? command.expect?.[`${command.args.from}::clip_order`] : undefined);
  return order?.state === 'present' && clipPermutation(order.value) ? order.value : undefined;
};
const literalRemoval = (command: EditCommand): boolean => {
  const captured = command.expect?.[''];
  const clip = captured?.state === 'present' && record(captured.value) ? captured.value : undefined;
  if (!clip || clip.app !== undefined && !record(clip.app)) return false;
  const app = record(clip.app) ? clip.app : {};
  if (app.canonical) return false;
  const intent = { ...app, ...(record(app.astrid) ? app.astrid : {}) };
  if (['on', 'until', 'for', 'cut', 'sequence', 'segment', 'formulas', 'loop', 'orphan'].some(key => intent[key] !== undefined)
    || ['keyframes', 'modifiers', 'keyframeOrigin'].some(key => Object.prototype.hasOwnProperty.call(clip, key))) return false;
  const groups = command.expect?.['parent::config.pinnedShotGroups'];
  return groups?.state === 'absent' || groups?.state === 'present' && Array.isArray(groups.value)
    && groups.value.every(group => record(group) && Array.isArray(group.clipIds) && !group.clipIds.includes(clip.id));
};
const wholeSource = (command: EditCommand, id: string): boolean => {
  const state = command.expect?.[`${id}::`] ?? command.expect?.[''];
  return state?.state === 'present' && record(state.value) && state.value.id === id.split(':')[1];
};

/** Exact existing managed-media producer; Redo replays this original command. */
export function isSelectedMediaCreation(command: EditCommand | undefined): boolean {
  if (!command) return false;
  const child = command.created?.[0];
  const selection = readSelectedProjectMediaIdentity(command.args.media);
  const registry = selection ? command.expect?.[selectedMediaRegistryExpectationPath(selection.asset)] : undefined;
  return command.op === 'timeline.add' && trackId(command.select) && selection !== null
    && (registry?.state === 'absent' || registry?.state === 'present' && record(registry.value) && registry.value.media_id === selection.object_id)
    && Object.keys(command.args).length === 4 && command.created?.length === 1 && clipId(child)
    && command.args.clip_id === child.slice('parent/clip:'.length)
    && typeof command.args.at === 'number' && Number.isFinite(command.args.at) && command.args.at >= 0
    && typeof command.args.duration === 'number' && Number.isFinite(command.args.duration) && command.args.duration > 0
    && command.expect?.[`${child}::`]?.state === 'absent';
}

/** Existing literal split/clone, selected-media creation and empty-track removal. */
export function isClipStructureBatch(commands: readonly EditCommand[]): boolean {
  if (!commands.length) return false;
  if (commands.length === 1 && isSelectedMediaCreation(commands[0])) return true;
  if (commands.length > 1 && commands[0].op === 'timeline.add' && clipId(commands[0].args.from)) {
    const clone = commands[0]; const nudges = commands.slice(1); const order = capturedClipOrder(clone);
    return isClipStructureBatch([clone]) && Boolean(order) && order!.includes(String(clone.args.from))
      && !order!.includes(clone.created![0]) && isClipPlacementBatch(nudges)
      && nudges.every(command => command.op === 'clip.nudge' && clipId(command.select)
        && command.select !== clone.args.from && command.select !== clone.created![0] && order!.includes(command.select)
        && command.args.frames === nudges[0].args.frames && Number(command.args.frames) > 0
        && command.expect?.['app.astrid.on']?.state === 'absent' && command.expect?.['app.astrid.until']?.state === 'absent');
  }
  if (commands.every(command => command.op === 'clip.remove' && clipId(command.select)
    && Object.keys(command.args).length === 0 && wholeSource(command, command.select) && literalRemoval(command) && capturedClipOrder(command))) {
    const initial = capturedClipOrder(commands[0])!; const removed = new Set<string>();
    return commands.every(command => {
      const expected = initial.filter(id => !removed.has(id));
      if (!expected.includes(command.select!) || JSON.stringify(capturedClipOrder(command)) !== JSON.stringify(expected)) return false;
      removed.add(command.select!); return true;
    });
  }
  if (commands.every(command => command.op === 'timeline.remove' && trackId(command.select)
    && Object.keys(command.args).length === 0 && wholeSource(command, command.select)
    && capturedOrder(command))) {
    const initial = capturedOrder(commands[0])!;
    const removed = new Set<string>();
    return commands.every(command => {
      const order = capturedOrder(command)!;
      const expected = initial.filter(id => !removed.has(id));
      if (!expected.includes(command.select!) || JSON.stringify(order) !== JSON.stringify(expected)) return false;
      removed.add(command.select!); return true;
    });
  }
  if (!commands.every(command => (command.op === 'timeline.split' && clipId(command.select)
    && Object.keys(command.args).length === 1 && typeof command.args.at === 'number' && Number.isFinite(command.args.at)
    && wholeSource(command, command.select))
    || (commands.length === 1 && command.op === 'timeline.add' && command.select === null
      && Object.keys(command.args).length === 2 && clipId(command.args.from)
      && typeof command.args.at === 'number' && Number.isFinite(command.args.at) && command.args.at >= 0
      && wholeSource(command, command.args.from)))) return false;
  const sources = commands.map(command => String(command.select ?? command.args.from));
  const children = commands.flatMap(command => command.created ?? []);
  return commands.every(command => command.created?.length === 1 && clipId(command.created[0]))
    && new Set(sources).size === sources.length && new Set(children).size === commands.length
    && children.every(id => !sources.includes(id));
}

/** Root membership is guarded by its exact tagged payload; no aggregate arrays. */
export function isClipStructureInverse(command: EditCommand | undefined): boolean {
  if (!command || command.op !== 'timeline.inverse' || command.select !== null || !record(command.args)
    || Object.keys(command.args).length !== 2 || typeof command.args.publication !== 'string' || !command.args.publication
    || !Array.isArray(command.args.writes) || !command.args.writes.length) return false;
  const writes = command.args.writes;
  const tracks = writes.every((write: unknown) => record(write) && trackId(write.id));
  if (!writes.every((write: unknown) => record(write) && (tracks ? trackId(write.id) : clipId(write.id))
    && typeof write.id === 'string' && Object.keys(write).every(key => ['id', 'path', 'before', 'after', 'order'].includes(key))
    && tagged(write.before) && tagged(write.after)
    && (write.path === '' ? write.before.state !== write.after.state
      && [write.before, write.after].every(state => state.state === 'absent' || record(state.value) && state.value.id === String(write.id).split(':')[1])
      && (tracks ? permutation(write.order) && write.order.includes(write.id) : write.order === undefined || clipPermutation(write.order) && write.order.includes(write.id))
      : !tracks && ['to', 'hold', 'at'].includes(String(write.path)) && write.order === undefined))) return false;
  return writes.some(write => write.path === '')
    && new Set(writes.map(write => `${write.id}::${write.path}`)).size === writes.length;
}

export function clipStructureInverse(commands: readonly EditCommand[], result: {
  status: string; accepted_publication_id: string | null; change: { direct_writes: unknown[] };
}): EditCommand | null | undefined {
  const undo = commands.length === 1 && isClipStructureInverse(commands[0]);
  if (!undo && !isClipStructureBatch(commands)) return undefined;
  if (result.status === 'no_change') return null;
  if (result.status !== 'accepted' || !result.accepted_publication_id) return undefined;
  const prior = undo ? commands[0].args.writes as Array<{ id: string; path: string; order?: string[] }> : [];
  const allowed = undo ? prior : commands.flatMap(command => command.op === 'clip.nudge'
    ? [{ id: command.select!, path: 'at' }] : ['timeline.remove', 'clip.remove'].includes(command.op)
    ? [{ id: command.select!, path: '' }]
    : [{ id: command.created![0], path: '' }, ...(command.op === 'timeline.split'
      ? ['to', 'hold'].map(path => ({ id: command.select!, path })) : [])]);
  if (result.change.direct_writes.some(write => !record(write) || !allowed.some(row => row.id === write.id && row.path === write.path))) return undefined;
  const order = undo ? undefined : commands[0].op === 'timeline.remove' ? capturedOrder(commands[0])
    : commands[0].op === 'clip.remove' ? capturedClipOrder(commands[0]) : undefined;
  const inverse: EditCommand = { op: 'timeline.inverse', select: null, args: { publication: result.accepted_publication_id,
    writes: result.change.direct_writes.map(write => {
      if (!record(write)) return write;
      const capturedOrder = undo ? prior.find(row => row.id === write.id && row.path === write.path)?.order : order;
      return { ...structuredClone(write), before: structuredClone(write.after), after: structuredClone(write.before),
        ...(capturedOrder ? { order: structuredClone(capturedOrder) } : {}) };
    }),
  } };
  if (!isClipStructureInverse(inverse)) return undefined;
  validateEditCommand(inverse); return inverse;
}
