import { describe, expect, it } from 'vitest';
import type { EditCommand } from '@/integrations/runtime/generated.ts';
import { isTranscriptCaptionInverse, transcriptCaptionInverse } from './transcriptCaptionHistory.ts';
import { attachGestureCommands, gestureCommandsFor } from './semanticGestures.ts';
import type { TimelineData } from '../lib/timeline-data.ts';

const absent = { state: 'absent' as const };
const binding = { schema_version: 1, occurrence_id: null, document: { id: 'opaque-document' }, source: { lineage_id: 'opaque-lineage', revision_id: 'opaque-revision' }, snapshot: { sha256: 'a'.repeat(64) }, word_ids: ['opaque-word'] };
const moment = `source-word ${['opaque-document', 'opaque-lineage', 'opaque-revision', 'parent/clip:media', 'a'.repeat(64), 'opaque-word'].map((value) => JSON.stringify(value)).join(' ')}`;
const calls: EditCommand[] = [
  { op: 'transcript.bind', select: null, args: { target: { clip_id: 'media', occurrence_id: null }, next: binding } },
  { op: 'timeline.add', select: null, args: { element: 'am-type', track: 'type', clip_id: 'caption-request-0', at: moment, params: { text: 'Hello' } }, created: ['parent/clip:caption-request-0'] },
  { op: 'clip.until', select: 'parent/clip:caption-request-0', resolved: ['parent/clip:caption-request-0'], args: { moment: `after ${moment}` } },
];
const writes = [
  { id: 'parent/clip:media', path: 'app', before: absent, after: { state: 'present' as const, value: { transcript: { v: 1, binding }, opaque: null } } },
  { id: 'parent/clip:caption-request-0', path: '', before: absent, after: { state: 'present' as const, value: { id: 'caption-request-0', element: 'am-type', app: { astrid: { on: moment } } } } },
  { id: 'parent/clip:caption-request-0', path: 'intent.until', before: absent, after: { state: 'present' as const, value: `after ${moment}` } },
];
const result = { status: 'accepted', accepted_publication_id: 'publication', change: { direct_writes: writes } };

describe('caption receipt history adapter (unit fixtures, not public acceptance evidence)', () => {
  it('inverts every recorded authored state without projecting, normalizing or mutating it', () => {
    const before = structuredClone(result);
    const inverse = transcriptCaptionInverse(calls, result)!;
    expect(isTranscriptCaptionInverse(inverse)).toBe(true);
    expect(inverse.args).toEqual({ publication: 'publication', writes: writes.map((w) => ({ ...w, before: w.after, after: w.before })) });
    expect(result).toEqual(before);
    const redo = transcriptCaptionInverse([inverse], { ...result, accepted_publication_id: 'undo-publication', change: { direct_writes: inverse.args.writes as never } })!;
    expect(redo.args.writes).toEqual(writes);
    // Native inverse requests stay aggregate requests across render projections.
    const data = { config: { clips: [{ id: 'projected', app: { canonical: {} } }] } } as unknown as TimelineData;
    attachGestureCommands(data, [inverse]);
    expect(gestureCommandsFor(data)).toEqual([inverse]);
  });
  it('keeps an existing transcript namespace version write as well as its binding', () => {
    const rows = [{ ...writes[0], path: 'app.transcript.binding' },
      { ...writes[0], path: 'app.transcript.v', after: { state: 'present' as const, value: 1 } }, ...writes.slice(1)];
    expect(transcriptCaptionInverse(calls, { ...result, change: { direct_writes: rows } })?.args.writes).toHaveLength(rows.length);
  });
  it('does not manufacture history for previews, refusals, missing receipts or foreign writes', () => {
    for (const status of ['preview', 'refused', 'error']) expect(transcriptCaptionInverse(calls, { ...result, status })).toBeUndefined();
    expect(transcriptCaptionInverse(calls, { ...result, accepted_publication_id: null })).toBeUndefined();
    expect(transcriptCaptionInverse(calls, { ...result, status: 'no_change' })).toBeNull();
    for (const patch of [{ id: 'occurrence:foreign/clip:caption-request-0' }, { id: 'parent/clip:caption-foreign' }, { path: 'registry' }]) {
      expect(transcriptCaptionInverse(calls, { ...result, change: { direct_writes: [writes[0], { ...writes[1], ...patch }] } })).toBeUndefined();
    }
    expect(transcriptCaptionInverse(calls, { ...result, change: { direct_writes: [writes[0], writes[1], writes[1]] } })).toBeUndefined();
  });
});
