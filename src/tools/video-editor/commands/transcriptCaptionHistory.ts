import { validateEditCommand, type EditCommand } from '@/integrations/runtime/generated.ts';
import { isTranscriptCaptionBatch, transcriptBindTarget } from './transcriptCaptions.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const scoped = (value: unknown): value is string => typeof value === 'string' && /^(?:parent|occurrence:[^/\s]+)\/clip:[^/\s]+$/.test(value);
const bindingPaths = new Set(['app', 'app.transcript', 'app.transcript.binding']);
const captionPaths = new Set(['', 'intent.on', 'intent.until', 'intent.for']);

/** Publication-bound writes only; never derive an inverse from the UI projection. */
export function isTranscriptCaptionInverse(command: EditCommand | undefined): boolean {
  if (!command || command.op !== 'timeline.inverse' || command.select !== null
    || typeof command.args.publication !== 'string' || !command.args.publication
    || Object.keys(command.args).some((key) => !['publication', 'writes'].includes(key))
    || !Array.isArray(command.args.writes) || command.args.writes.length < 2) return false;
  const writes = command.args.writes;
  if (!writes.every((write: unknown) => record(write) && scoped(write.id) && typeof write.path === 'string'
    && Object.keys(write).length === 4 && Object.keys(write).every((key) => ['id', 'path', 'before', 'after'].includes(key))
    && [write.before, write.after].every((state) => record(state)
      && (state.state === 'absent' ? Object.keys(state).length === 1
        : state.state === 'present' && Object.prototype.hasOwnProperty.call(state, 'value') && Object.keys(state).length === 2)))) return false;
  const binding = writes.filter((write) => bindingPaths.has(write.path));
  if (binding.length !== 1) return false;
  const owner = binding[0].id;
  const captions = writes.filter((write) => write.id !== owner);
  const roots = new Set(captions.filter((write) => write.path === '').map((write) => write.id));
  return captions.length > 0 && roots.size > 0
    && writes.filter((write) => write.id === owner).every((write) => bindingPaths.has(write.path)
      || (binding[0].path === 'app.transcript.binding' && write.path === 'app.transcript.v'))
    && new Set(writes.map((write) => `${write.id}::${write.path}`)).size === writes.length
    && captions.every((write) => roots.has(write.id) && write.id.startsWith(`${owner.split('/')[0]}/clip:caption-`)
      && captionPaths.has(write.path));
}

export function transcriptCaptionInverse(commands: readonly EditCommand[], result: {
  status: string; accepted_publication_id: string | null; change: { direct_writes: unknown[] };
}): EditCommand | null | undefined {
  const forward = isTranscriptCaptionBatch(commands);
  if (!forward && !(commands.length === 1 && isTranscriptCaptionInverse(commands[0]))) return undefined;
  if (result.status === 'no_change') return null;
  if (result.status !== 'accepted' || !result.accepted_publication_id) return undefined;
  const inverse: EditCommand = { op: 'timeline.inverse', select: null, args: {
    publication: result.accepted_publication_id,
    writes: result.change.direct_writes.map((write) => record(write)
      ? { ...structuredClone(write), before: structuredClone(write.after), after: structuredClone(write.before) } : write),
  } };
  if (!isTranscriptCaptionInverse(inverse)) return undefined;
  const target = forward ? transcriptBindTarget(commands[0])! : undefined;
  const allowed = forward
    ? new Set([`${target!.occurrence_id === null ? 'parent' : `occurrence:${target!.occurrence_id}`}/clip:${target!.clip_id}`,
      ...commands.flatMap((command) => command.created ?? [])])
    : new Set((commands[0].args.writes as Array<{ id: string }>).map((write) => write.id));
  if ((inverse.args.writes as Array<{ id: string }>).some((write) => !allowed.has(write.id))) return undefined;
  validateEditCommand(inverse);
  return inverse;
}
