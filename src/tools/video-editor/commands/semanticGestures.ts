import type { EditCommand } from '@/integrations/runtime/generated.ts';
import type { TimelineOccurrenceContext } from '../data/DataProvider.ts';
import type { CanonicalClipIdentity } from '../data/shotCompositionProjection.ts';
import type { ClipMeta, TimelineData } from '../lib/timeline-data.ts';
import type { TrackDefinition } from '../types/index.ts';
import { addTrackGestureCommands } from './trackGestures.ts';

/** Intent is attached by the handler, never inferred from the resulting document. */
const authoredCommands = new WeakMap<TimelineData, readonly EditCommand[]>();
const authoredOccurrences = new WeakMap<TimelineData, TimelineOccurrenceContext>();
const occurrenceOps = new Set(['clip.nudge', 'clip.set-track', 'clip.set-look', 'clip.set-param', 'clip.clear']);

export function occurrenceIdentityFor(data: Pick<TimelineData, 'config'>, id: string): CanonicalClipIdentity | undefined {
  const clips = data.config.clips.filter((clip) => clip.id === id);
  if (clips.length !== 1) return undefined;
  const identity = clips[0].app?.canonical as CanonicalClipIdentity | undefined;
  if (!identity || ![identity.projectId, identity.parentDocumentId, identity.headRevisionId,
    identity.occurrenceId, identity.shotId, identity.revisionId, identity.internalTimelineRevisionId,
    identity.sourceClipId, identity.outputIdentity].every((value) => typeof value === 'string' && value.length > 0)
    || identity.occurrenceId.includes('/') || identity.sourceClipId!.includes('/')
    || identity.sourceClip?.id !== identity.sourceClipId) return undefined;
  return identity;
}
function contextFor(identity: CanonicalClipIdentity): TimelineOccurrenceContext {
  return { projectId: identity.projectId, parentDocumentId: identity.parentDocumentId,
    headRevisionId: identity.headRevisionId!, occurrenceId: identity.occurrenceId,
    shotId: identity.shotId, shotRevisionId: identity.revisionId,
    internalRevisionId: identity.internalTimelineRevisionId };
}
export function attachGestureCommands(data: TimelineData, commands: readonly EditCommand[], source: TimelineData = data): void {
  authoredCommands.delete(data);
  authoredOccurrences.delete(data);
  let context: TimelineOccurrenceContext | undefined;
  let parent = false;
  for (const command of commands) {
    if (typeof command.select !== 'string') {
      if (source.config.clips.some((clip) => clip.app?.canonical)) return;
      parent = true;
      continue;
    }
    if (command.select.startsWith('occurrence:')) {
      const endChoice = command.op === 'clip.set-duration' && Array.isArray(command.args.relation_choices)
        && command.args.relation_choices.length === 1
        && command.args.relation_choices[0]?.target === command.select
        && command.args.relation_choices[0]?.edge === 'end'
        && ['detach', 'adjust-offset', 're-anchor'].includes(command.args.relation_choices[0]?.choice);
      if ((!occurrenceOps.has(command.op) && !endChoice) || command.resolved?.length !== 1
        || command.resolved[0] !== command.select) return;
      const matches = source.config.clips.flatMap((clip) => {
        const identity = occurrenceIdentityFor(source, clip.id);
        return identity && `occurrence:${identity.occurrenceId}/clip:${identity.sourceClipId}` === command.select ? [identity] : [];
      });
      if (matches.length !== 1) return;
      const next = contextFor(matches[0]);
      if (context && JSON.stringify(context) !== JSON.stringify(next)) return;
      context = next;
    } else {
      if (source.config.clips.some((clip) => clip.app?.canonical && command.select === `parent/clip:${clip.id}`)) return;
      parent = true;
    }
  }
  if (context && parent) return;
  if (context) authoredOccurrences.set(data, structuredClone(context));
  authoredCommands.set(data, structuredClone(commands));
}
export function gestureCommandsFor(data: TimelineData): readonly EditCommand[] | undefined {
  return authoredCommands.get(data);
}
export function gestureOccurrenceFor(data: TimelineData): TimelineOccurrenceContext | undefined {
  return authoredOccurrences.get(data);
}

function gestureTarget(data: Pick<TimelineData, 'config'>, id: string): string | undefined {
  const clips = data.config.clips.filter((clip) => clip.id === id);
  if (clips.length !== 1) return undefined;
  if (!clips[0].app?.canonical) return id.startsWith('occurrence:') ? undefined : id;
  const identity = occurrenceIdentityFor(data, id);
  return identity ? `occurrence:${identity.occurrenceId}/clip:${identity.sourceClipId}` : undefined;
}
function gestureSource(data: Pick<TimelineData, 'config'>, id: string) {
  return (occurrenceIdentityFor(data, id)?.sourceClip ?? originalClip(data, id)) as ReturnType<typeof originalClip>;
}

export function scopedGestureClipId(id: string): string {
  if (/^(?:parent|shot:[^/]+|occurrence:[^/]+)\/clip:[^/]+$/.test(id)) return id;
  if (!id || id.includes('/')) throw new Error('Gesture clip requires an exact scoped identity.');
  // Main-editor clips come from canonical parent.clips. Do not guess an occurrence.
  return `parent/clip:${id}`;
}
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
function state(value: unknown, present: boolean): NonNullable<EditCommand['expect']>[string] {
  return present && value !== undefined ? { state: 'present', value: structuredClone(value) } : { state: 'absent' };
}
function command(id: string, op: string, args: EditCommand['args'], expect: EditCommand['expect']): EditCommand {
  const select = scopedGestureClipId(id);
  return { op, select, resolved: [select], args, expect };
}
function originalClip(data: Pick<TimelineData, 'config'>, id: string) {
  const clip = data.config.clips.find((candidate) => candidate.id === id);
  if (!clip) throw new Error(`Gesture clip '${id}' is not in its captured base.`);
  return clip;
}

// These are the admitted clip_fields.yaml names and their persisted App paths.
// Other App properties retain the temporary unconverted-writer route.
const lookFields: Record<string, string> = {
  opacity: 'opacity', volume: 'volume', speed: 'speed',
  cropTop: 'crop_top', cropBottom: 'crop_bottom', cropLeft: 'crop_left', cropRight: 'crop_right',
  entrance: 'entrance', exit: 'exit', transition: 'transition',
};
export function propertyGestureCommands(data: Pick<TimelineData, 'config'>, id: string, patch: Partial<ClipMeta>, options?: { mergeParams: boolean }): EditCommand[] | undefined {
  const entries = Object.entries(patch);
  if (entries.some(([key, value]) => key !== 'params' && (!lookFields[key] || value === null || (key === 'transition' && value !== undefined)))) return undefined;
  const target = gestureTarget(data, id);
  if (!target) return undefined;
  const clip = gestureSource(data, id);
  if (typeof clip.hold === 'number' && 'speed' in patch) return undefined;
  const result: EditCommand[] = [];
  for (const [key, value] of entries) {
    if (key === 'params') {
      // A params object is a value map. {op:'clear'} and {$absent:true} are values.
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      // Nested keys require the typed path producer; a literal dotted key must
      // never be mistaken for a nested path. Omitted keys in a replacement map
      // likewise do not express an explicit clear.
      if (Object.keys(value).some((key) => /[.[\]]/.test(key))
        || (!options?.mergeParams && Object.keys(clip.params ?? {}).some((key) => !hasOwn(value, key)))) return undefined;
      for (const [param, next] of Object.entries(value)) {
        const before = clip.params ?? {};
        result.push(command(target, next === undefined ? 'clip.clear' : 'clip.set-param',
          next === undefined ? { keys: [param] } : { path: param, value: next },
          { [`params.${param}`]: state(before[param], hasOwn(before, param)) }));
      }
    } else {
      result.push(command(target, value === undefined ? 'clip.clear' : 'clip.set-look',
        value === undefined ? { keys: [lookFields[key]] } : { [lookFields[key]]: value },
        { [key]: state(clip[key as keyof typeof clip], hasOwn(clip, key)) }));
    }
  }
  return result;
}
export function deleteGestureCommands(data: TimelineData, ids: string[]): EditCommand[] {
  return ids.map((id) => {
    const clip = originalClip(data, id);
    return command(id, 'clip.remove', {}, { '': state(clip, true) });
  });
}

/** The existing runner allocates this exact child via OpCall.created. */
export function detachAudioGestureCommands(data: TimelineData, id: string, childId: string, track: string, newTrack?: TrackDefinition): EditCommand[] | undefined {
  const sources = data.config.clips.filter((clip) => clip.id === id);
  const clip = sources[0];
  if (sources.length !== 1 || !id || id.includes('/') || clip.clipType !== 'media'
    || !childId || childId.includes('/') || data.config.clips.some((clip) => clip.id === childId)
    || !track || track.includes('/')) return undefined;
  const additions = newTrack ? addTrackGestureCommands(data, newTrack) : [];
  if (!additions || (newTrack ? newTrack.id !== track || newTrack.kind !== 'audio'
    : data.config.tracks?.filter((candidate) => candidate.id === track).length !== 1
      || !data.config.tracks.some((candidate) => candidate.id === track && candidate.kind === 'audio'))) return undefined;
  const source = scopedGestureClipId(id);
  const created = `${source.slice(0, source.lastIndexOf('/'))}/clip:${childId}`;
  return [...additions, { ...command(id, 'clip.detach-audio', { track }, { '': state(clip, true) }), created: [created] }];
}

// Characterized compatibility provider behavior stays on its original save path.
/** Only a hold's authored end relation has the admitted duration/until choices.
 * Moment parsing and resolving remain with Astrid. Its TimeRef grammar accepts
 * successive offsets, so appending frames preserves the exact original anchor.
 */
export function legacyTiedEndResizeGesture(data: TimelineData, id: string, duration: number): {
  commands: EditCommand[]; astrid: Record<string, unknown>;
} | null | undefined {
  const clip = originalClip(data, id);
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  if (typeof clip.hold !== 'number' || typeof intent?.until !== 'string' || !intent.until) return undefined;
  const action = data.rows.flatMap((row) => row.actions).find((candidate) => candidate.id === id);
  if (!action) return undefined;
  if (Math.abs(duration - (action.end - action.start)) < 1e-7) return null;
  const choice = window.prompt(`The end of ${id} is tied to ${intent.until}. Choose keep to leave it unchanged, detach for a fixed duration, adjust-offset to keep the anchor, or re-anchor to choose another end anchor. Cancel leaves the clip unchanged.`, 'keep');
  if (choice === null || choice === 'keep') return null;
  const expect = {
    at: state(clip.at, hasOwn(clip, 'at')),
    hold: state(clip.hold, true),
    'app.astrid.on': state(intent.on, hasOwn(intent, 'on')),
    'app.astrid.until': state(intent.until, true),
    'app.astrid.for': state(intent.for, hasOwn(intent, 'for')),
  };
  if (choice === 'detach') {
    const { until: _until, ...astrid } = intent;
    return { commands: [command(id, 'clip.set-duration', { seconds: duration }, expect)], astrid: { ...astrid, for: duration } };
  }
  let moment: string;
  if (choice === 'adjust-offset') {
    const frames = Math.round((duration - (action.end - action.start)) * data.output.fps);
    moment = `${intent.until} ${frames < 0 ? '' : '+'}${frames}f`;
  } else if (choice === 're-anchor') {
    const answer = window.prompt('New end anchor (for example "hello", beat 4, or end of c2)', intent.until);
    if (!answer?.trim()) return null;
    moment = answer.trim();
  } else return null;
  const { for: _for, ...astrid } = intent;
  return { commands: [command(id, 'clip.until', { moment }, expect)], astrid: { ...astrid, until: moment } };
}

/** Existing hold-end choice UI. Astrid alone parses/resolves Moments and discovers
 * dependencies. The App asks for absolute offset components, never parses an
 * authored Moment or guesses an offset from pointer geometry.
 */
export function tiedEndResizeGesture(data: TimelineData, id: string, duration: number): {
  commands: EditCommand[];
} | null | undefined {
  const target = gestureTarget(data, id);
  if (!target) return undefined;
  const select = scopedGestureClipId(target);
  if (!/^(?:parent|occurrence:[^/\s]+)\/clip:[^/\s]+$/.test(select)) return undefined;
  const clip = gestureSource(data, id);
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  const occurrence = occurrenceIdentityFor(data, id);
  const beds = (data.config.app?.astrid as Record<string, unknown> | undefined)?.music_beds;
  if (typeof clip.hold !== 'number' || typeof intent?.until !== 'string' || !intent.until.trim()
    || (clip.speed !== undefined && clip.speed !== 1)
    || ['sequence', 'sequence_fit', 'segment', 'formulas', 'loop', 'orphan'].some((key) => hasOwn(intent, key) || hasOwn(clip.app ?? {}, key))
    || data.config.pinnedShotGroups?.some((group) => group.clipIds.includes(id))
    || (beds != null && (typeof beds !== 'object' || Array.isArray(beds) || hasOwn(beds, select)))
    || (occurrence && (occurrence.headRevisionId !== data.head?.headRevisionId
      || occurrence.projectId !== data.head?.projectId || occurrence.parentDocumentId !== data.head?.timelineId))) return undefined;
  const actions = data.rows.flatMap((row) => row.actions).filter((candidate) => candidate.id === id);
  if (actions.length !== 1 || !Number.isFinite(duration) || duration <= 0
    || Math.abs(clip.hold - (actions[0].end - actions[0].start)) > 1e-7) return undefined;
  if (Math.abs(duration - clip.hold) < 1e-7) return null;
  const choice = window.prompt(`The end of ${id} is tied to ${intent.until}. Choose keep to leave it unchanged, detach for a fixed duration, adjust-offset to keep the anchor, or re-anchor to choose another end anchor. Cancel leaves the clip unchanged.`, 'keep');
  // Keep means abandoning this resize in the existing UI, not asking Astrid to
  // promise contradictory geometry. Cancel never reaches applyEdit or a draft.
  if (!choice || choice === 'keep' || !['detach', 'adjust-offset', 're-anchor'].includes(choice)) return null;
  const relation: Record<string, unknown> = { target: select, edge: 'end', choice };
  if (choice === 're-anchor') {
    const anchor = window.prompt('New end anchor without an offset (for example beat 8 or clip-end "parent/clip:clip-2")');
    if (!anchor?.trim()) return null;
    relation.anchor = anchor.trim();
  }
  if (choice !== 'detach') {
    const seconds = window.prompt('New absolute anchor offset in seconds (kept separately from frames)', '0');
    if (seconds === null || !seconds.trim() || !Number.isFinite(Number(seconds))) return null;
    const frames = window.prompt('New absolute anchor offset in whole frames (added to seconds)', '0');
    if (frames === null || !frames.trim() || !Number.isSafeInteger(Number(frames))) return null;
    relation.offset_seconds = Number(seconds);
    relation.offset_frames = Number(frames);
  }
  const expect = {
    '': state(clip, true),
    at: state(clip.at, hasOwn(clip, 'at')),
    hold: state(clip.hold, true),
    'app.astrid.on': state(intent.on, hasOwn(intent, 'on')),
    'app.astrid.until': state(intent.until, true),
    'app.astrid.for': state(intent.for, hasOwn(intent, 'for')),
    'app.astrid.fixed_start': state(intent.fixed_start, hasOwn(intent, 'fixed_start')),
  };
  return { commands: [command(target, 'clip.set-duration', {
    seconds: duration, relation_choices: [relation],
  }, expect)] };
}
export function moveGestureCommands(data: TimelineData, id: string, start: number, track?: string): EditCommand[] | undefined {
  const target = gestureTarget(data, id);
  if (!target) return undefined;
  const clip = gestureSource(data, id);
  if (occurrenceIdentityFor(data, id) && typeof clip.at !== 'number') return undefined;
  const action = data.rows.flatMap((row) => row.actions).find((candidate) => candidate.id === id);
  if (!action) return undefined;
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  // Moving both tied edges needs the relation-sensitive choice producer.
  if (intent?.until) return undefined;
  const commands: EditCommand[] = [];
  const deltaFrames = Math.round((start - action.start) * data.output.fps);
  if (deltaFrames) commands.push(command(target, 'clip.nudge', { frames: deltaFrames }, {
    at: state(clip.at, hasOwn(clip, 'at')),
    'app.astrid.on': state(intent?.on, Boolean(intent && hasOwn(intent, 'on'))),
    'app.astrid.until': state(intent?.until, Boolean(intent && hasOwn(intent, 'until'))),
  }));
  if (track && track !== clip.track) commands.push(command(target, 'clip.set-track', { track }, {
    track: state(clip.track, true),
  }));
  return commands;
}

/** A declined tied-start drag stays on compatibility; never normalize its anchor
 * through a generic nudge. Presence matters, including null/empty/legacy values.
 */
export function fallbackDragGestureCommands(data: TimelineData, id: string, start: number, track: string): EditCommand[] | undefined {
  const commands = moveGestureCommands(data, id, start, track);
  if (commands?.some((command) => command.op === 'clip.nudge') && data.config.clips.some((clip) => clip.id === id && (
    hasOwn(clip.app ?? {}, 'on') || hasOwn((clip.app?.astrid as object | undefined) ?? {}, 'on')
  ))) return undefined;
  // A track-only command does not touch timing or normalize the authored on.
  return commands;
}

/** Plain, same-track drag only. D's clip.nudge parses then formats a TimeRef;
 * admit only the canonical word / word-relative music subset whose anchor bytes
 * survive that round trip. This is an eligibility check, never an anchor resolver.
 * In particular c2 means a cut in D, not a neighbouring clip.
 */
export function tiedStartDragGesture(data: TimelineData, id: string, start: number, track: string): {
  commands: EditCommand[]; meta: Partial<ClipMeta>;
} | undefined {
  const clips = data.config.clips.filter((clip) => clip.id === id);
  const actions = data.rows.flatMap((row) => row.actions).filter((action) => action.id === id);
  if (clips.length !== 1 || actions.length !== 1 || !id || id.includes('/')
    || clips[0].app?.canonical) return undefined;
  const clip = clips[0];
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  if (!intent || typeof intent.on !== 'string' || track !== clip.track
    || (typeof clip.hold !== 'number' && !(typeof clip.from === 'number' && typeof clip.to === 'number'))
    || (typeof clip.hold === 'number' && (hasOwn(clip, 'from') || hasOwn(clip, 'to')))
    || data.config.pinnedShotGroups?.some((group) => group.clipIds.includes(id))
    || ['until', 'sequence', 'cut', 'segment', 'formulas', 'loop', 'orphan'].some((key) => hasOwn(intent, key) || hasOwn(clip.app ?? {}, key))
    || ['keyframes', 'modifiers', 'keyframeOrigin'].some((key) => hasOwn(clip, key) || hasOwn(clip.params ?? {}, key))) return undefined;
  // Canonical format_moment: optional beat/downbeat prefix, quoted word,
  // optional exact line/occurrence, and one nonzero signed integer frame offset.
  const match = /^(?<anchor>(?:(?:beat|downbeat) [1-9]\d* (?:after|before) )?(?:after )?"(?<word>[^"\n]+)"(?: in [A-Za-z0-9_-]+)?(?: #[1-9]\d*)?)(?: (?<offset>[+-][1-9]\d*)f)?$/.exec(intent.on);
  if (!match?.groups?.word.trim()) return undefined;
  const fps = data.output.fps;
  const delta = (start - actions[0].start) * fps;
  const frames = Math.round(delta);
  const previousOffset = Number(match.groups.offset ?? 0);
  const offset = previousOffset + frames;
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isSafeInteger(previousOffset) || !Number.isSafeInteger(frames) || !Number.isSafeInteger(offset)
    || !frames || Math.abs(delta - frames) > 1e-6
    || Math.abs(start * fps - Math.round(start * fps)) > 1e-6) return undefined;
  const on = `${match.groups.anchor}${offset ? ` ${offset > 0 ? '+' : ''}${offset}f` : ''}`;
  const commands = moveGestureCommands(data, id, start, track)!;
  // Retrying/rebasing cannot silently acquire sequence/animation/other ownership.
  commands[0].expect![''] = state(clip, true);
  return { commands,
    meta: { app: { ...clip.app, astrid: { ...intent, on } } } };
}

/** Right-edge resizing with unchanged source edges, no tied end, no overlap side effects. */
export function rightResizeGestureCommands(data: TimelineData, id: string, duration: number, patch: Partial<ClipMeta>): EditCommand[] | undefined {
  const clip = originalClip(data, id);
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  if (intent?.until || intent?.for !== undefined) return undefined;
  if (typeof clip.hold === 'number') return [command(id, 'clip.set-duration', { seconds: duration }, {
    hold: state(clip.hold, true),
    'app.astrid.until': state(intent?.until, false),
    'app.astrid.for': state(intent?.for, false),
  })];
  if (typeof patch.speed !== 'number' || patch.from !== clip.from || patch.to !== clip.to) return undefined;
  const result = propertyGestureCommands(data, id, { speed: patch.speed });
  if (result) Object.assign(result[0].expect!, {
    from: state(clip.from, hasOwn(clip, 'from')),
    to: state(clip.to, hasOwn(clip, 'to')),
  });
  return result;
}

/** Map explicit planner moves; row comparison only refuses unsupported side effects. */
export function plannedMoveGestureCommands(
  data: TimelineData,
  moves: readonly { clipId: string; targetRowId: string }[],
  rows: TimelineData['rows'],
): EditCommand[] | undefined {
  const moved = new Set(moves.map((move) => move.clipId));
  const oldActions = new Map(data.rows.flatMap((row) => row.actions).map((action) => [action.id, action]));
  if (rows.some((row) => row.actions.some((action) => {
    const old = oldActions.get(action.id);
    return !moved.has(action.id) && old && (old.start !== action.start || old.end !== action.end);
  }))) return undefined;
  const groups = moves.map((move) => {
    const old = oldActions.get(move.clipId);
    const row = rows.find((candidate) => candidate.actions.some((action) => action.id === move.clipId));
    const actual = row?.actions.find((action) => action.id === move.clipId);
    if (!old || !actual || row?.id !== move.targetRowId
      || Math.abs((actual.end - actual.start) - (old.end - old.start)) > 1e-7) return undefined;
    return moveGestureCommands(data, move.clipId, actual.start, move.targetRowId);
  });
  return groups.every((commands) => commands !== undefined) ? groups.flat() : undefined;
}

/** Parent-only until the editor transports real recorded occurrence identities.
 * Match D gesture_producers._literal_source conservatively; no intent is detached.
 */
export function literalStructuralSource(data: TimelineData, id: string): boolean {
  if (!id || id.includes('/') || data.config.clips.filter((clip) => clip.id === id).length !== 1) return false;
  const clip = originalClip(data, id);
  const intent = { ...clip.app, ...(clip.app?.astrid as Record<string, unknown> | undefined) } as Record<string, unknown>;
  if (['on', 'until', 'for', 'cut', 'sequence', 'segment', 'formulas', 'loop', 'orphan'].some((key) => intent[key] !== undefined)
    || ['keyframes', 'modifiers', 'keyframeOrigin'].some((key) => hasOwn(clip, key))
    || (clip.hold != null && (hasOwn(clip, 'from') || hasOwn(clip, 'to')))) return false;
  const beds = (data.config.app?.astrid as Record<string, unknown> | undefined)?.music_beds;
  if (beds != null && (typeof beds !== 'object' || Array.isArray(beds) || hasOwn(beds, scopedGestureClipId(id)))) return false;
  return typeof clip.at === 'number' && Number.isFinite(clip.at);
}

/** Stable allocation, captured once with the command and reused on retry. */
export function structuralChildId(data: TimelineData, id: string): string {
  const used = new Set(data.config.clips.map((clip) => clip.id));
  let index = 1;
  while (used.has(`${id}-${String(index).padStart(2, '0')}`)) index++;
  return `${id}-${String(index).padStart(2, '0')}`;
}

export function splitGestureCommands(data: TimelineData, id: string, at: number, childId: string): EditCommand[] | undefined {
  if (!literalStructuralSource(data, id) || !Number.isFinite(at)
    || Math.abs(at * data.output.fps - Math.round(at * data.output.fps)) > 1e-6) return undefined;
  const source = scopedGestureClipId(id);
  return [{ op: 'timeline.split', select: source, args: { at },
    created: [`parent/clip:${childId}`], expect: { [`${source}::`]: state(originalClip(data, id), true) } }];
}

export function duplicateGestureCommands(data: TimelineData, id: string, at: number, childId: string): EditCommand[] | undefined {
  if (!literalStructuralSource(data, id) || !Number.isFinite(at) || at < 0
    || Math.abs(at * data.output.fps - Math.round(at * data.output.fps)) > 1e-6) return undefined;
  const source = scopedGestureClipId(id);
  return [{ op: 'timeline.add', select: null, args: { from: source, at },
    created: [`parent/clip:${childId}`], expect: { [`${source}::`]: state(originalClip(data, id), true) } }];
}

export function emptyTrackGestureCommands(data: TimelineData, ids: readonly string[]): EditCommand[] | undefined {
  const beds = (data.config.app?.astrid as Record<string, unknown> | undefined)?.music_beds;
  if (beds != null && (typeof beds !== 'object' || Array.isArray(beds))) return undefined;
  const result: EditCommand[] = [];
  for (const id of ids) {
    const tracks = data.config.tracks?.filter((track) => track.id === id) ?? [];
    if (!id || id.includes('/') || tracks.length !== 1 || data.config.clips.some((clip) => clip.track === id)
      || Object.values(beds ?? {}).some((entry) => !entry || typeof entry !== 'object'
        || (entry as { source?: { track?: string } }).source?.track === id)) return undefined;
    result.push({ op: 'timeline.remove', select: `parent/track:${id}`, args: {}, expect: { '': state(tracks[0], true) } });
  }
  return result;
}
