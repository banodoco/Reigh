import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transitionDeclarationInput} from '../src/tools/video-editor/transitions/declaration-input.ts';

test('App input preserves seconds, type spelling and nested params for the shared converter', () => {
  const clip = {id: 'a', track: 'v1', transition: {type: 'crossfade', duration: 0.35,
    params: {nested: {amount: 7}, easing: 'linear'}}};
  const before = structuredClone(clip);
  const request = transitionDeclarationInput(clip)!;
  assert.deepEqual(request, {trackId: 'v1', clipId: 'a', transition: clip.transition});
  (request.transition.params!.nested as {amount: number}).amount = 8;
  assert.deepEqual(clip, before);
});

test('absent transition produces no declaration input', () => {
  assert.equal(transitionDeclarationInput({id: 'a', track: 'v1'}), null);
});

test('missing track or clip owner is refused with a next step', () => {
  for (const owner of [{id: '', track: 'v1'}, {id: 'a', track: ''}]) {
    assert.throws(() => transitionDeclarationInput({...owner,
      transition: {type: 'crossfade', duration: 0.2}}), /Next step: supply the clip and track IDs/);
  }
});
