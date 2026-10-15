import {test} from 'node:test';
import assert from 'node:assert/strict';
import {declareClipTransition, prepareTransitionTrackForAuthoring} from '../src/tools/video-editor/transitions/declaration.ts';

const clips = [{id: 'a', track: 'v1', start: 0, duration: 30,
  transition: {type: 'crossfade', duration: 0.35, params: {easing: 'linear', amount: 7}}},
  {id: 'b', track: 'v1', start: 30, duration: 30}];
const host = 'timeline-composition';
const prepare = (input = clips, selectedHost = host) => prepareTransitionTrackForAuthoring('v1', input, 30, selectedHost);

test('App authoring imports the public shared converter and declares its outgoing owner', () => {
  const before = structuredClone(clips);
  const {declarations, prepared} = prepare();
  assert.deepEqual(declarations[0], {owner: {trackId: 'v1', clipId: 'a'},
    implementation: {host, id: 'cross-fade'}, spec: {T: 11, kind: 'dissolve', align: 'end'},
    params: clips[0].transition!.params});
  assert.equal(prepared.plans[1].drawStart, 19);
  assert.deepEqual(clips, before);
});

test('App authoring preserves gaps and does not move clips', () => {
  const gap = [clips[0], {...clips[1], start: 45}];
  const before = structuredClone(gap);
  const {prepared} = prepare(gap);
  assert.equal(prepared.plans[1].drawStart, 45);
  assert.equal(prepared.plans[1].fadeIn, null);
  assert.deepEqual(gap, before);
});

test('App authoring refuses overlaps with the shared nextStep and leaves inputs intact', () => {
  const overlap = [clips[0], {...clips[1], start: 29}];
  const before = structuredClone(overlap);
  assert.throws(() => prepare(overlap), e => e.code === 'transition/same-track-overlap'
    && e.nextStep.includes('Move or trim'));
  assert.deepEqual(overlap, before);
});

test('App refuses unsupported hosts for transitions and for empty tracks', () => {
  for (const input of [clips, []]) {
    assert.throws(() => prepare(input, 'worker-export'), e => e.code === 'transition/unsupported-host'
      && e.nextStep.length > 0);
  }
});

test('a foreign-track owner and a last-clip transition are refused', () => {
  assert.throws(() => prepare([{...clips[0], track: 'v2'}]), e => e.code === 'transition/invalid-owner');
  assert.throws(() => prepare([clips[0]]), e => e.code === 'transition/invalid-owner');
});

test('unsupported implementations are refused; absent transition produces no declaration', () => {
  assert.throws(() => declareClipTransition({...clips[0], transition: {type: 'wipe', duration: 0.3}}, 30, host),
    e => e.code === 'transition/unsupported-implementation');
  assert.equal(declareClipTransition(clips[1], 30, host), null);
});
