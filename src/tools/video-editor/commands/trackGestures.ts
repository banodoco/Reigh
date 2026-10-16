import { validateEditCommand, type EditCommand } from '@/integrations/runtime/generated.ts';
import type { TimelineData } from '../lib/timeline-data.ts';
import { TRACK_SCALE_BAKE_MARKER } from '../lib/timeline-domain.ts';
import type { TrackDefinition } from '../types/index.ts';

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const scoped = (id: string) => id && !id.includes('/') ? `parent/track:${id}` : undefined;
const fields = new Set(['label', 'role', 'scale', 'fit', 'opacity', 'volume', 'muted', 'blendMode']);
const enums: Record<string, readonly string[]> = {
  role: ['output', 'source'], fit: ['contain', 'cover', 'manual'],
  blendMode: ['darken', 'hard-light', 'lighten', 'multiply', 'normal', 'overlay', 'screen', 'soft-light'],
};
const tagged = (row: object, key: string): NonNullable<EditCommand['expect']>[string] =>
  own(row, key) && Reflect.get(row, key) !== undefined
    ? { state: 'present', value: structuredClone(Reflect.get(row, key)) } : { state: 'absent' };

/** Read authored parent rows, never display defaults or inferred occurrence owners. */
export function authoredTracks(data: TimelineData): TrackDefinition[] | undefined {
  const tracks = data.config.tracks;
  if (!tracks || tracks.some((track) => !scoped(track.id))
    || new Set(tracks.map((track) => track.id)).size !== tracks.length) return undefined;
  return tracks;
}

export function addTrackGestureCommands(data: TimelineData, track: TrackDefinition): EditCommand[] | undefined {
  const tracks = authoredTracks(data);
  const select = scoped(track.id);
  if (!tracks || !select || tracks.some((row) => row.id === track.id)) return undefined;
  return [{ op: 'timeline.add', select, args: { track: structuredClone(track) }, created: [select],
    expect: { [`${select}::`]: { state: 'absent' } } }];
}

export function reorderTrackGestureCommands(data: TimelineData, activeId: string, tracks: TrackDefinition[]): EditCommand[] | undefined {
  const before = authoredTracks(data);
  const select = scoped(activeId);
  if (!before || !select || !before.some((track) => track.id === activeId)
    || tracks.length !== before.length || new Set(tracks.map((track) => track.id)).size !== before.length
    || tracks.some((track) => !before.some((row) => row.id === track.id))) return undefined;
  const expected_order = before.map((track) => scoped(track.id)!);
  return [{ op: 'timeline.reorder', select, args: { order: tracks.map((track) => scoped(track.id)!), expected_order },
    expect: { [`${select}::track_order`]: { state: 'present', value: expected_order } } }];
}

/** One command for the explicit patch. Undefined clears; null remains a JSON value. */
function planTrackPropertyGesture(data: TimelineData, id: string, patch: Partial<TrackDefinition>): {
  commands: EditCommand[]; track: TrackDefinition;
} | undefined {
  const before = authoredTracks(data)?.find((track) => track.id === id);
  const select = scoped(id);
  if (!before || !select) return undefined;
  const values: Record<string, unknown> = {};
  const clear: string[] = [];
  const expect: EditCommand['expect'] = {};
  const track = structuredClone(before);
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'app') {
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || (before.app !== undefined && (!before.app || typeof before.app !== 'object' || Array.isArray(before.app)))) return undefined;
      track.app = { ...before.app };
      for (const [name, next] of Object.entries(value)) {
        if (!/^[A-Za-z0-9_-]+$/.test(name)
          || ['__proto__', 'constructor', 'prototype', TRACK_SCALE_BAKE_MARKER].includes(name)) return undefined;
        const path = `app.${name}`;
        expect[`${select}::${path}`] = tagged(before.app ?? {}, name);
        if (next === undefined) { clear.push(path); delete track.app[name]; }
        else { values[path] = structuredClone(next); track.app[name] = structuredClone(next); }
      }
      continue;
    }
    if (!fields.has(key) || (key === 'label' && value === undefined)) return undefined;
    if (value !== undefined && (enums[key] ? !enums[key].includes(value as string)
      : key === 'label' ? typeof value !== 'string' : key === 'muted' ? typeof value !== 'boolean'
        : typeof value !== 'number' || !Number.isFinite(value))) return undefined;
    expect[`${select}::${key}`] = tagged(before, key);
    if (value === undefined) { clear.push(key); Reflect.deleteProperty(track, key); }
    else { values[key] = value; Reflect.set(track, key, value); }
  }
  const commands: EditCommand[] = Object.keys(expect).length ? [{ op: 'timeline.set', select, args: { values, clear }, expect }] : [];
  commands.forEach(validateEditCommand);
  return { track, commands };
}

export function trackPropertyGesture(data: TimelineData, id: string, patch: Partial<TrackDefinition>) {
  // Unsupported/non-JSON metadata keeps the whole existing compatibility edit.
  try { return planTrackPropertyGesture(data, id, patch); } catch { return undefined; }
}
