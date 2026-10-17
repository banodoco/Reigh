import type { EditCommand } from '@/integrations/runtime/generated.ts';
import type { ExplicitTranscriptSelection, PinnedTranscriptRead, TranscriptBinding } from '../extensions/transcript-caption-foundry/consumer.ts';

/** Ordinary runner commands. Source-word TimeRefs leave all timing to Astrid. */
export function buildTranscriptCaptionCommands(input: {
  selection: ExplicitTranscriptSelection;
  transcript: PinnedTranscriptRead;
  binding: TranscriptBinding;
  trackId: string;
}) {
  const { selection, transcript, binding, trackId } = input;
  if (!trackId || trackId.includes('/')) throw new Error('Choose an existing caption track.');
  const scope = selection.target.occurrence_id === null ? 'parent' : `occurrence:${selection.target.occurrence_id}`;
  const source = [binding.document.id, binding.source.lineage_id, binding.source.revision_id,
    selection.target.selector, binding.snapshot.sha256.replace(/^sha256:/, '')];
  const words = transcript.words.filter((word) => binding.word_ids.includes(word.id));
  const commands: EditCommand[] = [];
  for (const [index, word] of words.entries()) {
    if (word.end_s <= word.start_s) throw new Error('Transcript caption requires a nonempty word interval.');
    // These are new caption clip identities, never transcript/word identities.
    const clipId = `caption-${selection.request_id}-${index}`;
    const sid = `${scope}/clip:${clipId}`;
    const moment = `source-word ${[...source, word.id].map((value) => JSON.stringify(value)).join(' ')}`;
    commands.push({ op: 'timeline.add', select: null,
      args: { element: 'am-type', at: moment, track: trackId, params: { text: word.text }, clip_id: clipId },
      created: [sid], expect: { [`${sid}::`]: { state: 'absent' } } });
    commands.push({ op: 'clip.until', select: sid, resolved: [sid], args: { moment: `after ${moment}` } });
  }
  return { commands, correspondence: [] };
}

const record = (value: unknown): Record<string, unknown> | undefined => value !== null
  && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function transcriptBindTarget(command: EditCommand | undefined): { clip_id: string; occurrence_id: string | null } | undefined {
  const target = record(command?.args.target);
  if (command?.op !== 'transcript.bind' || command.select !== null || !target
    || Object.keys(target).sort().join(',') !== 'clip_id,occurrence_id'
    || typeof target.clip_id !== 'string' || !target.clip_id || target.clip_id.includes('/')
    || !(target.occurrence_id === null || (typeof target.occurrence_id === 'string' && target.occurrence_id && !target.occurrence_id.includes('/')))) return undefined;
  return { clip_id: target.clip_id, occurrence_id: target.occurrence_id as string | null };
}

/** The sole mixed timeline/occurrence batch admitted by the caption producer. */
export function isTranscriptCaptionBatch(commands: readonly EditCommand[]): boolean {
  const bind = commands[0];
  const target = transcriptBindTarget(bind);
  if (!bind || !target || (bind.resolved?.length ?? 0) !== 0
    || commands.length < 3 || commands.length % 2 !== 1) return false;
  const next = record(bind.args.next);
  const document = record(next?.document);
  const source = record(next?.source);
  const snapshot = record(next?.snapshot);
  if (!next || next.schema_version !== 1 || next.occurrence_id !== target.occurrence_id
    || typeof document?.id !== 'string' || typeof source?.lineage_id !== 'string'
    || typeof source.revision_id !== 'string' || typeof snapshot?.sha256 !== 'string'
    || !Array.isArray(next.word_ids) || next.word_ids.length !== (commands.length - 1) / 2
    || next.word_ids.some((id) => typeof id !== 'string' || !id)) return false;
  const scope = target.occurrence_id === null ? 'parent' : `occurrence:${target.occurrence_id}`;
  const selector = `${scope}/clip:${target.clip_id}`;
  const wordSource = [document.id, source.lineage_id, source.revision_id,
    selector, snapshot.sha256.replace(/^sha256:/, '')];
  const created = new Set<string>();
  for (let index = 1; index < commands.length; index += 2) {
    const add = commands[index]!;
    const until = commands[index + 1]!;
    const sid = add.created?.[0];
    const params = record(add.args.params);
    if (add.op !== 'timeline.add' || add.select !== null || add.created?.length !== 1
      || !sid?.startsWith(`${scope}/clip:`) || created.has(sid)
      || add.args.element !== 'am-type' || typeof add.args.track !== 'string'
      || add.args.clip_id !== sid.split('/clip:')[1]
      || Object.keys(add.args).sort().join(',') !== 'at,clip_id,element,params,track'
      || add.args.at !== `source-word ${[...wordSource, next.word_ids[(index - 1) / 2]].map((value) => JSON.stringify(value)).join(' ')}`
      || !params || Object.keys(params).length !== 1 || typeof params.text !== 'string'
      || until.op !== 'clip.until' || until.select !== sid
      || until.resolved?.length !== 1 || until.resolved[0] !== sid
      || Object.keys(until.args).length !== 1 || until.args.moment !== `after ${add.args.at}`) return false;
    created.add(sid);
  }
  return true;
}
