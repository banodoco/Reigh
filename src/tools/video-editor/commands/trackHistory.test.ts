import { describe, expect, it } from 'vitest';
import type { EditCommand } from '@/integrations/runtime/generated.ts';
import { isTrackHistoryBatch, isTrackHistoryInverse, trackHistoryInverse } from './trackHistory.ts';
const patch = (id = 'parent/track:A1'): EditCommand => ({ op: 'timeline.set', select: id, args: { values: { muted: true }, clear: [] }, expect: { [`${id}::muted`]: { state: 'absent' } } });
const write = (id = 'parent/track:A1', path = 'muted') => ({ id, path, before: { state: 'absent' }, after: { state: 'present', value: true } });
const receipt = (writes: unknown[] = [write()]) => ({ status: 'accepted', accepted_publication_id: 'actual', change: { direct_writes: writes } });
describe('bounded track publication inverse', () => {
  it('accepts exact multi-track patches and keeps tagged states', () => {
    const inverse = trackHistoryInverse([patch(), patch('parent/track:A4')], receipt([write(), write('parent/track:A4')]))!;
    expect(isTrackHistoryInverse(inverse)).toBe(true);
    expect(inverse.args.writes[0]).toEqual({ ...write(), before: write().after, after: write().before });
  });
  it.each(['foreign field', 'foreign target', 'duplicate', 'aggregate container'])('rejects %s in actual receipt', kind => {
    const writes = kind === 'foreign field' ? [write(undefined, 'app.secret')]
      : kind === 'foreign target' ? [write('parent/track:other')]
      : kind === 'duplicate' ? [write(), write()] : [write('parent', 'config.tracks')];
    expect(trackHistoryInverse([patch()], receipt(writes))).toBeUndefined();
  });
  it('does not adopt track reorder from missing receipt data or a consequence array', () => {
    expect(isTrackHistoryBatch([{ op: 'timeline.reorder', select: 'parent/track:A1', args: { order: [], expected_order: [] } }])).toBe(false);
    expect(trackHistoryInverse([patch()], receipt([]))).toBeUndefined();
    expect(isTrackHistoryInverse({ op: 'timeline.inverse', select: null, args: { publication: 'actual', writes: [write(undefined, 'track_order')] } })).toBe(false);
  });
  it('an inverse cannot obtain additional authored paths on Redo', () => {
    const inverse = trackHistoryInverse([patch()], receipt())!;
    expect(trackHistoryInverse([inverse], receipt([write(undefined, 'volume')]))).toBeUndefined();
  });
  it.each(['refused', 'conflict', 'error'])('%s supplies no ownership', status => {
    expect(trackHistoryInverse([patch()], { ...receipt(), status })).toBeUndefined();
  });
  it('preserves no_change as explicit null', () => {
    expect(trackHistoryInverse([patch()], { ...receipt(), status: 'no_change' })).toBeNull();
  });
});
