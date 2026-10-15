import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { preparePlayerCut, queryPlayerCutFrame } from './player-cut-evaluation.ts';

test('cut plans preserve the App-resolved mounting span with no transition windows', () => {
  for (const [start, duration] of [[0, 1], [0, 90], [1, 1], [24, 48], [300, 7]]) {
    assert.deepEqual(preparePlayerCut(start, duration), {
      drawStart: start,
      drawDuration: duration,
      ownOffset: 0,
      ownDuration: duration,
      fadeIn: null,
      fadeOut: null,
    });
  }
});

test('composition frame clamp matches the prior host formula before, within, and after cuts', () => {
  for (const start of [0, 1, 23, 120, 10000]) {
    for (const duration of [1, 2, 3, 24, 90]) {
      const plan = preparePlayerCut(start, duration);
      for (let frame = start - 3; frame <= start + duration + 3; frame += 1) {
        const before = Math.min(Math.max(frame, start), start + Math.max(0, duration - 1));
        assert.equal(queryPlayerCutFrame(plan, frame), before);
      }
    }
  }
});

test('the first and last own frames remain absolute for a nonzero clip origin', () => {
  const plan = preparePlayerCut(75, 30);
  assert.equal(queryPlayerCutFrame(plan, -1), 75);
  assert.equal(queryPlayerCutFrame(plan, 75), 75);
  assert.equal(queryPlayerCutFrame(plan, 90), 90);
  assert.equal(queryPlayerCutFrame(plan, 104), 104);
  assert.equal(queryPlayerCutFrame(plan, 105), 104);
});

test('one-frame clips keep one constant parameter evaluation time', () => {
  const plan = preparePlayerCut(31, 1);
  for (const frame of [-100, 0, 30, 31, 32, 1000]) {
    assert.equal(queryPlayerCutFrame(plan, frame), 31);
  }
});

test('queries leave the prepared cut unchanged and do not share mutable plans', () => {
  const plan = preparePlayerCut(10, 20);
  const before = structuredClone(plan);
  for (const frame of [0, 10, 20, 30]) queryPlayerCutFrame(plan, frame);
  assert.deepEqual(plan, before);
  assert.notEqual(preparePlayerCut(10, 20), plan);
});

test('ExtensionClipSequence consumes the cut interval and queried frame at its existing host seam', () => {
  const source = readFileSync(new URL('./TimelineRenderer.tsx', import.meta.url), 'utf8');
  const extension = source.split('const ExtensionClipSequence:')[1].split('interface VisualTrackProps')[0];
  assert.match(extension, /preparePlayerCut\(from, durationInFrames\)/);
  assert.match(extension, /const clampedFrame = queryPlayerCutFrame\(drawPlan, frame\)/);
  assert.match(extension, /from=\{drawPlan.drawStart\} durationInFrames=\{drawPlan.drawDuration\}/);
  assert.match(extension, /sourceTime: clipSourceTime\(clip, timeSeconds\)/);
  assert.match(extension, /<Renderer \{\.\.\.rendererProps\} \/>/);
});
