import { describe, expect, it } from 'vitest';
import type { EditCommand } from '@/integrations/runtime/generated.ts';
import { clipStructureInverse, isClipStructureBatch, isClipStructureInverse } from './clipStructureHistory.ts';

const source = { id: 'a', at: 1, from: 2, to: 6 };
const split: EditCommand = { op: 'timeline.split', select: 'parent/clip:a', args: { at: 2 }, created: ['parent/clip:b'], expect: { 'parent/clip:a::': { state: 'present', value: source } } };
const root = { id: 'parent/clip:b', path: '', before: { state: 'absent' }, after: { state: 'present', value: { ...source, id: 'b', at: 2, from: 4 } } };
const edge = { id: 'parent/clip:a', path: 'to', before: { state: 'present', value: 6 }, after: { state: 'present', value: 4 } };
const receipt = (writes: unknown[] = [edge, root]) => ({ status: 'accepted', accepted_publication_id: 'actual-publication', change: { direct_writes: writes } });

describe('bounded structural publication inverse', () => {
  it('uses only the split source edge and allocated child root', () => {
    const inverse = clipStructureInverse([split], receipt())!;
    expect(isClipStructureBatch([split])).toBe(true); expect(isClipStructureInverse(inverse)).toBe(true);
    expect(inverse.args).toEqual({ publication: 'actual-publication', writes: [edge, root].map(write => ({ ...write, before: write.after, after: write.before })) });
    expect(clipStructureInverse([inverse], receipt())).toBeDefined();
  });
  it.each(['foreign root', 'aggregate array', 'foreign property', 'duplicate write', 'identity mismatch', 'unrecorded metadata'])('rejects %s', (kind) => {
    const writes = kind === 'foreign root' ? [{ ...root, id: 'parent/clip:other' }]
      : kind === 'aggregate array' ? [{ ...root, id: 'parent', path: 'clips' }]
      : kind === 'foreign property' ? [{ ...edge, path: 'params.secret' }, root]
      : kind === 'duplicate write' ? [root, root]
      : kind === 'identity mismatch' ? [{ ...root, after: { state: 'present', value: source } }]
      : [{ ...root, source: {} }];
    expect(clipStructureInverse([split], receipt(writes))).toBeUndefined();
  });
  it('captures exact track order from command expectations and retains it for Redo', () => {
    const order = ['parent/track:V1', 'parent/track:middle', 'parent/track:V2'];
    const row = { id: 'middle', kind: 'visual', opaque: null };
    const remove: EditCommand = { op: 'timeline.remove', select: 'parent/track:middle', args: {}, expect: {
      '': { state: 'present', value: row }, track_order: { state: 'present', value: order },
    } };
    const write = { id: remove.select, path: '', before: { state: 'present', value: row }, after: { state: 'absent' } };
    const inverse = clipStructureInverse([remove], receipt([write]))!;
    expect(inverse.args.writes[0].order).toEqual(order);
    expect(clipStructureInverse([inverse], receipt([{ ...write, before: write.after, after: write.before }]))!.args.writes[0].order).toEqual(order);
    delete remove.expect!.track_order;
    expect(isClipStructureBatch([remove])).toBe(false);
  });
  it('requires stable distinct allocation and forbids mixed structural families', () => {
    expect(isClipStructureBatch([{ ...split, created: ['parent/clip:a'] }])).toBe(false);
    expect(isClipStructureBatch([split, split])).toBe(false);
    expect(isClipStructureBatch([{ ...split, args: { at: 2, relation_choices: [] } }])).toBe(false);
    expect(isClipStructureBatch([{ ...split, created: ['occurrence:A/clip:b'] }])).toBe(false);
  });
  it.each(['refused', 'conflict', 'error'])('%s cannot arm history', status => {
    expect(clipStructureInverse([split], { ...receipt(), status })).toBeUndefined();
  });
  it('no_change removes only this owner; missing accepted publication cannot arm Undo', () => {
    expect(clipStructureInverse([split], { ...receipt(), status: 'no_change' })).toBeNull();
    expect(clipStructureInverse([split], { ...receipt(), accepted_publication_id: null })).toBeUndefined();
  });
});

describe('bounded literal deletion ownership', () => {
  const remove = (id = 'parent/clip:a', order = ['parent/clip:before', 'parent/clip:a', 'parent/clip:b']): EditCommand => ({
    op: 'clip.remove', select: id, resolved: [id], args: {}, expect: { '': { state: 'present', value: { ...source, id: id.split(':')[1] } },
      clip_order: { state: 'present', value: order }, 'parent::config.pinnedShotGroups': { state: 'absent' } },
  });
  it('retains exact middle-clip order from the original command through inverse and Redo', () => {
    const write = { id: 'parent/clip:a', path: '', before: { state: 'present', value: source }, after: { state: 'absent' } };
    const undo = clipStructureInverse([remove()], receipt([write]))!;
    expect(isClipStructureInverse(undo)).toBe(true); expect(undo.args.writes[0].order).toEqual(remove().expect!.clip_order.value);
    expect(clipStructureInverse([undo], receipt([{ ...write, before: write.after, after: write.before }]))!.args.writes[0].order).toEqual(undo.args.writes[0].order);
  });
  it('multi-delete captures the actual order preceding each explicit removal', () => {
    expect(isClipStructureBatch([remove(), remove('parent/clip:b', ['parent/clip:before', 'parent/clip:b'])])).toBe(true);
    expect(isClipStructureBatch([remove(), remove('parent/clip:b')])).toBe(false);
  });
  it.each(['tied', 'grouped', 'occurrence', 'missing order'])('keeps %s outside this native owner', kind => {
    const call = remove();
    if (kind === 'missing order') delete call.expect!.clip_order;
    else if (kind === 'grouped') call.expect!['parent::config.pinnedShotGroups'] = { state: 'present', value: [{ clipIds: ['a'] }] };
    else call.expect![''] = { state: 'present', value: { ...source, app: kind === 'tied' ? { astrid: { on: '"hello"' } } : { canonical: { occurrenceId: 'A' } } } };
    expect(isClipStructureBatch([call])).toBe(false);
  });
});


describe('bounded selected project media creation ownership', () => {
  const media = { asset: 'selected', generation_id: 'g', variant_id: 'v', object_id: `sha256:${'a'.repeat(64)}`, catalog_digest: `sha256:${'b'.repeat(64)}` };
  const add: EditCommand = { op: 'timeline.add', select: 'parent/track:V1', args: { media, clip_id: 'b', at: 10, duration: 5 },
    created: ['parent/clip:b'], expect: { 'parent/clip:b::': { state: 'absent' },
      'parent::registry.assets.selected': { state: 'present', value: { media_id: media.object_id } } } };
  it('uses only the received allocated child root; registry cleanup remains compiler-owned', () => {
    expect(isClipStructureBatch([add])).toBe(true);
    expect(isClipStructureInverse(clipStructureInverse([add], receipt([root]))!)).toBe(true);
    expect(clipStructureInverse([add], receipt([root, { ...root, id: 'parent', path: 'registry.assets.selected' }]))).toBeUndefined();
  });
  it.each(['missing selection', 'mismatched child', 'missing absence', 'extra intent', 'occurrence track', 'mixed batch', 'wrong registry'])('refuses %s', kind => {
    const call = structuredClone(add);
    if (kind === 'wrong registry') call.expect!['parent::registry.assets.selected'] = { state: 'present', value: { media_id: 'other' } };
    if (kind === 'missing selection') delete call.args.media;
    if (kind === 'mismatched child') call.args.clip_id = 'other';
    if (kind === 'missing absence') delete call.expect;
    if (kind === 'extra intent') call.args.ripple = true;
    if (kind === 'occurrence track') call.select = 'occurrence:A/track:V1';
    expect(isClipStructureBatch(kind === 'mixed batch' ? [call, split] : [call])).toBe(false);
  });
});


describe('bounded source-clone literal ripple ownership', () => {
  const clone: EditCommand = { op: 'timeline.add', select: null, args: { from: 'parent/clip:a', at: 3 }, created: ['parent/clip:new'],
    expect: { 'parent/clip:a::': { state: 'present', value: source }, 'parent/clip:a::clip_order': { state: 'present', value: ['parent/clip:a', 'parent/clip:b'] } } };
  const nudge: EditCommand = { op: 'clip.nudge', select: 'parent/clip:b', resolved: ['parent/clip:b'], args: { frames: 30 },
    expect: { at: { state: 'present', value: 3 }, 'app.astrid.on': { state: 'absent' }, 'app.astrid.until': { state: 'absent' } } };
  it('owns only the allocated root and each explicitly captured follower at write', () => {
    const created = { ...root, id: 'parent/clip:new', after: { state: 'present', value: { id: 'new', hold: 1 } } };
    const move = { ...edge, id: 'parent/clip:b', path: 'at' };
    expect(isClipStructureBatch([clone, nudge])).toBe(true);
    const inverse = clipStructureInverse([clone, nudge], receipt([created, move]))!;
    expect(isClipStructureInverse(inverse)).toBe(true); expect(inverse.args.writes).toHaveLength(2);
    expect(clipStructureInverse([clone, nudge], receipt([created, { ...move, path: 'intent.on' }]))).toBeUndefined();
  });
  it.each(['missing order', 'missing follower', 'created collision', 'tied follower', 'reverse movement', 'mixed operation'])('rejects %s', kind => {
    const first = structuredClone(clone); const next = structuredClone(nudge);
    if (kind === 'missing order') delete first.expect!['parent/clip:a::clip_order'];
    if (kind === 'missing follower') first.expect!['parent/clip:a::clip_order'].value = ['parent/clip:a'];
    if (kind === 'created collision') next.select = next.resolved![0] = 'parent/clip:new';
    if (kind === 'tied follower') next.expect!['app.astrid.on'] = { state: 'present', value: 'beat 2' };
    if (kind === 'reverse movement') next.args.frames = -30;
    if (kind === 'mixed operation') next.op = 'clip.set-track';
    expect(isClipStructureBatch([first, next])).toBe(false);
  });
});
