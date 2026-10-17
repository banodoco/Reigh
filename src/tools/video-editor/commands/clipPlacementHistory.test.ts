import { describe, expect, it } from 'vitest';
import type { EditCommand } from '@/integrations/runtime/generated.ts';
import { clipPlacementInverse, isClipPlacementBatch, isClipPlacementInverse } from './clipPlacementHistory.ts';

const move = (id = 'parent/clip:a'): EditCommand => ({ op: 'clip.nudge', select: id, resolved: [id], args: { frames: 9 },
  expect: { at: { state: 'present', value: 1 }, 'app.astrid': { state: 'present', value: {} } } });
const write = (id = 'parent/clip:a', path = 'at') => ({ id, path, before: { state: 'present', value: 1 }, after: { state: 'present', value: 1.3 } });
const receipt = (writes = [write()]) => ({ status: 'accepted', accepted_publication_id: 'pub-actual', change: { direct_writes: writes } });

describe('bounded clip placement publication inverse', () => {
  it('owns exact ordered multiple targets and captures only accepted direct fields', () => {
    const commands = [move(), move('parent/clip:b')];
    expect(isClipPlacementBatch(commands)).toBe(true);
    expect(clipPlacementInverse(commands, receipt([write(), write('parent/clip:b')]))).toEqual({ op: 'timeline.inverse', select: null,
      args: { publication: 'pub-actual', writes: [write(), write('parent/clip:b')].map((row) => ({ ...row, before: row.after, after: row.before })) } });
  });
  it.each(['outside target', 'outside field', 'duplicate field', 'mixed owners', 'malformed tagged state'])('refuses %s in an accepted receipt', (kind) => {
    const writes = kind === 'outside target' ? [write('parent/clip:unselected')]
      : kind === 'outside field' ? [write('parent/clip:a', 'params.secret')]
      : kind === 'duplicate field' ? [write(), write()]
      : kind === 'mixed owners' ? [write(), write('occurrence:B/clip:a')]
      : [{ ...write(), before: { state: 'absent', value: 0 } }];
    expect(clipPlacementInverse([move()], receipt(writes))).toBeUndefined();
  });
  it('cannot acquire another authored path when an inverse supplies the Redo receipt', () => {
    const undo = clipPlacementInverse([move()], receipt())!;
    expect(isClipPlacementInverse(undo)).toBe(true);
    expect(clipPlacementInverse([undo], receipt([write('parent/clip:a', 'track')]))).toBeUndefined();
  });
  it.each(['refused', 'conflict', 'error'])('%s supplies no inverse', (status) => {
    expect(clipPlacementInverse([move()], { ...receipt(), status })).toBeUndefined();
  });
  it('keeps relation-sensitive trim batches with their existing inverse owner', () => {
    expect(isClipPlacementBatch([{ op: 'clip.trim', select: 'parent/clip:a', resolved: ['parent/clip:a'],
      args: { out_s: 3, relation_choices: [{ target: 'parent/clip:b', edge: 'start', choice: 'detach' }] }, expect: { '': { state: 'present', value: {} } } }])).toBe(false);
  });
  it('no_change explicitly removes history ownership and accepted without publication cannot arm Undo', () => {
    expect(clipPlacementInverse([move()], { ...receipt(), status: 'no_change' })).toBeNull();
    expect(clipPlacementInverse([move()], { ...receipt(), accepted_publication_id: null })).toBeUndefined();
  });
  it('preserves tagged absent/null inputs while refusing relation-choice batches with another owner', () => {
    for (const value of [{ state: 'absent' }, { state: 'present', value: null }]) {
      const call = move(); call.expect!['app.astrid'] = value;
      expect(isClipPlacementBatch([call])).toBe(true);
    }
    const call = move(); call.args.relation_choices = [{ target: call.select, choice: 'detach' }];
    expect(isClipPlacementBatch([call])).toBe(false);
  });
});
