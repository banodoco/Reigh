import type { EditCommand } from '@/integrations/runtime/generated.ts';
import type { TimelineData } from '../lib/timeline-data.ts';
import type { TimelineClip } from '../types/index.ts';
import { canonicalJsonStringify } from '../data/typed/timelineBundle.ts';

// Exact declaration from D e30f8d27's generated catalog. Runtime still validates
// the admitted declaration/resources; this reference grants no execution custody.
export const MANUAL_TEXT_REF = { id: 'am-type', kind: 'effect', packId: 'astrid_motion',
  revision: 'sha256:fd9bdcccf4ee0ffb7f32666de202d5e30617d3be59c68444910a2e7c8de7e047' } as const;
export const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
export const tagged = (v: unknown, present = v !== undefined): NonNullable<EditCommand['expect']>[string] =>
  present ? { state: 'present', value: structuredClone(v) } : { state: 'absent' };
export const isManualTextClip = (clip: { clipType?: string; text?: unknown; elementRef?: unknown } | null | undefined) =>
  !!clip && (clip.clipType === 'text' || clip.clipType === 'am-type' && record(clip.text) && same(clip.elementRef, MANUAL_TEXT_REF));

const jsonValue = (value: unknown): boolean => value === null || typeof value === 'string' || typeof value === 'boolean'
  || typeof value === 'number' && Number.isFinite(value) || Array.isArray(value) && value.every(jsonValue)
  || record(value) && Object.values(value).every(jsonValue);

/** The existing producer's explicit text projection, never a generic diff setter. */
export function manualTextParams(text: unknown, geometry: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!record(text) || !jsonValue(text) || typeof text.content !== 'string') return;
  const params = { text: text.content, size: text.fontSize ?? 64, color: text.color ?? '#ffffff', align: text.align ?? 'center',
    fontFamily: text.fontFamily ?? 'Georgia, serif', bold: text.bold ?? false, italic: text.italic ?? false,
    reveal: 'none', tracking: 0, lineHeight: 1.1 };
  if (typeof params.size !== 'number' || !Number.isFinite(params.size) || params.size < 1
    || typeof params.color !== 'string' || typeof params.fontFamily !== 'string'
    || !['left', 'center', 'right'].includes(String(params.align))
    || typeof params.bold !== 'boolean' || typeof params.italic !== 'boolean') return;
  // Null is malformed, not an omitted optional style.
  if (['fontSize', 'color', 'align', 'fontFamily', 'bold', 'italic'].some(key => text[key] === null)) return;
  for (const [key, value] of Object.entries(geometry)) {
    if (!['x', 'y', 'width', 'height'].includes(key) || typeof value !== 'number' || !Number.isFinite(value)
      || (['width', 'height'].includes(key) && value <= 0) || key === 'width' && value < 1) return;
  }
  try { canonicalJsonStringify(text); } catch { return; }
  return params;
}
export const geometryOf = (clip: object) => Object.fromEntries(['x', 'y', 'width', 'height']
  .filter(key => Object.prototype.hasOwnProperty.call(clip, key)).map(key => [key, (clip as Record<string, unknown>)[key]]));

export function manualTextPatch(clip: TimelineClip, text: unknown): Partial<TimelineClip> | undefined {
  if (!isManualTextClip(clip) || !record(text) || !jsonValue(text) || !record(clip.text)
    || clip.params !== undefined && !record(clip.params)
    || clip.elementRef != null && !same(clip.elementRef, MANUAL_TEXT_REF)) return;
  const next = { ...structuredClone(clip.text), ...structuredClone(text) };
  const params = manualTextParams(next, geometryOf(clip));
  if (!params) return;
  return { clipType: 'am-type', text: next as TimelineClip['text'], elementRef: { ...MANUAL_TEXT_REF }, params: { ...clip.params, ...params } };
}

export function setManualTextCommand(source: TimelineClip, select: string, text: unknown): EditCommand | undefined {
  const patch = manualTextPatch(source, text);
  if (!patch) return;
  return { op: 'clip.set-text', select, resolved: [select], args: { text: patch.text!, elementRef: { ...MANUAL_TEXT_REF } },
    expect: { '': tagged(source), text: tagged(source.text), params: tagged(source.params),
      clipType: tagged(source.clipType), elementRef: tagged(source.elementRef) } };
}

/** Apply only the stored, accepted text receipt to the local projection. */
export function applyManualTextWrites(clips: TimelineClip[], writes: Array<{ id: string; path: string; after: NonNullable<EditCommand['expect']>[string] }>): TimelineClip[] | undefined {
  const next = structuredClone(clips);
  for (const write of writes) {
    if (!write.id.startsWith('parent/clip:')) return;
    const id = write.id.slice('parent/clip:'.length), index = next.findIndex(clip => clip.id === id);
    if (write.path === '') {
      if (write.after.state === 'absent') { if (index < 0) return; next.splice(index, 1); }
      else { if (!record(write.after.value) || write.after.value.id !== id) return;
        if (index < 0) next.push(structuredClone(write.after.value) as TimelineClip); else next[index] = structuredClone(write.after.value) as TimelineClip; }
      continue;
    }
    if (index < 0) return;
    const root = next[index] as unknown as Record<string, unknown>;
    const parts = write.path.split('.');
    let owner = root;
    for (const key of parts.slice(0, -1)) {
      if (!record(owner[key])) return;
      owner = owner[key];
    }
    if (write.after.state === 'absent') delete owner[parts[parts.length - 1]];
    else owner[parts[parts.length - 1]] = structuredClone(write.after.value);
  }
  return next;
}

// Rollback ownership only. Accepted history remains in the existing native stack.
type TextBefore = { data: TimelineData; selectedClipId: string | null; selectedTrackId: string | null };
const beforeTextEdits = new WeakMap<TimelineData, TextBefore>();
export const captureManualTextBefore = (owner: TimelineData, before: TextBefore) => beforeTextEdits.set(owner, before);
export const manualTextBefore = (owner: TimelineData) => beforeTextEdits.get(owner);
