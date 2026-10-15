import type { EditCommand } from '@/integrations/runtime/generated.ts';
import type { ClipMeta, TimelineData } from '../lib/timeline-data.ts';

/** Intent is attached by the handler, never inferred from the resulting document. */
const authoredCommands = new WeakMap<TimelineData, readonly EditCommand[]>();
export function attachGestureCommands(data: TimelineData, commands: readonly EditCommand[]): void {
  authoredCommands.set(data, structuredClone(commands));
}
export function gestureCommandsFor(data: TimelineData): readonly EditCommand[] | undefined {
  return authoredCommands.get(data);
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
function originalClip(data: TimelineData, id: string) {
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
export function propertyGestureCommands(data: TimelineData, id: string, patch: Partial<ClipMeta>): EditCommand[] | undefined {
  const entries = Object.entries(patch);
  if (entries.some(([key, value]) => key !== 'params' && (!lookFields[key] || value === null || (key === 'transition' && value !== undefined)))) return undefined;
  const clip = originalClip(data, id);
  if (typeof clip.hold === 'number' && 'speed' in patch) return undefined;
  const result: EditCommand[] = [];
  for (const [key, value] of entries) {
    if (key === 'params') {
      // A params object is a value map. {op:'clear'} and {$absent:true} are values.
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      // Nested keys require the typed path producer; a literal dotted key must
      // never be mistaken for a nested path. Omitted keys in a replacement map
      // likewise do not express an explicit clear.
      if (Object.keys(value).some((key) => /[.\[\]]/.test(key))
        || Object.keys(clip.params ?? {}).some((key) => !hasOwn(value, key))) return undefined;
      for (const [param, next] of Object.entries(value)) {
        const before = clip.params ?? {};
        result.push(command(id, next === undefined ? 'clip.clear' : 'clip.set-param',
          next === undefined ? { keys: [param] } : { path: param, value: next },
          { [`params.${param}`]: state(before[param], hasOwn(before, param)) }));
      }
    } else {
      result.push(command(id, value === undefined ? 'clip.clear' : 'clip.set-look',
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
export function detachAudioGestureCommands(data: TimelineData, id: string, childId: string, track: string): EditCommand[] | undefined {
  const clip = originalClip(data, id);
  if (clip.clipType !== 'media' || !childId || childId.includes('/')
    || !data.config.tracks?.some((candidate) => candidate.id === track && candidate.kind === 'audio')) return undefined;
  const source = scopedGestureClipId(id);
  const created = `${source.slice(0, source.lastIndexOf('/'))}/clip:${childId}`;
  return [{ ...command(id, 'clip.detach-audio', { track }, { '': state(clip, true) }), created: [created] }];
}

/** Only a hold's authored end relation has the admitted duration/until choices.
 * Moment parsing and resolving remain with Astrid. Its TimeRef grammar accepts
 * successive offsets, so appending frames preserves the exact original anchor.
 */
export function tiedEndResizeGesture(data: TimelineData, id: string, duration: number): {
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
export function moveGestureCommands(data: TimelineData, id: string, start: number, track?: string): EditCommand[] | undefined {
  const clip = originalClip(data, id);
  const action = data.rows.flatMap((row) => row.actions).find((candidate) => candidate.id === id);
  if (!action) return undefined;
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  // Moving both tied edges needs the relation-sensitive choice producer.
  if (intent?.until) return undefined;
  const commands: EditCommand[] = [];
  const deltaFrames = Math.round((start - action.start) * data.output.fps);
  if (deltaFrames) commands.push(command(id, 'clip.nudge', { frames: deltaFrames }, {
    at: state(clip.at, hasOwn(clip, 'at')),
    'app.astrid.on': state(intent?.on, Boolean(intent && hasOwn(intent, 'on'))),
    'app.astrid.until': state(intent?.until, Boolean(intent && hasOwn(intent, 'until'))),
  }));
  if (track && track !== clip.track) commands.push(command(id, 'clip.set-track', { track }, {
    track: state(clip.track, true),
  }));
  return commands;
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
