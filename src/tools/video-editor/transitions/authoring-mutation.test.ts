import {describe, it, expect} from 'vitest';
import {admitTransitionMutation} from './authoring-mutation.ts';
import {createTimelineCommands} from '../hooks/useTimelineCommandsService.ts';
import type {ResolvedTimelineConfig} from '../types/index.ts';

const config = (start = 1): ResolvedTimelineConfig => ({
  output: {fps: 30, resolution: '640x360', file: 'out.mp4'}, registry: {},
  tracks: [{id: 'v1', kind: 'visual', label: 'Visual'}],
  clips: [{id: 'a', track: 'v1', at: 0, hold: 1, clipType: 'hold'},
    {id: 'b', track: 'v1', at: start, hold: 1, clipType: 'hold'}],
});
const transition = {type: 'crossfade', duration: 0.3, params: {easing: 'linear'}};

describe('normal transition authoring admission', () => {
  for (const start of [1, 1.5]) {
    it(`admits touching/gaps at ${start} without changing inputs`, () => {
      const before = config(start), after = structuredClone(before);
      after.clips[0].transition = transition;
      const snapshot = structuredClone(after);
      expect(() => admitTransitionMutation(before, after)).not.toThrow();
      expect(after).toEqual(snapshot);
    });
  }
  it('refuses an overlap with a usable next step', () => {
    const before = config(0.9), after = structuredClone(before);
    after.clips[0].transition = transition;
    expect(() => admitTransitionMutation(before, after)).toThrow(/Move or trim/);
  });
  it('refuses unsupported hosts explicitly', () => {
    const before = config(), after = structuredClone(before);
    after.clips[0].transition = transition;
    expect(() => admitTransitionMutation(before, after, 'worker-export')).toThrow(/unsupported.*Next step/);
  });
  it('does not reinterpret legacy transitions on unrelated edits or key reordering', () => {
    const before = config(0.9), after = structuredClone(before);
    before.clips[0].transition = {type: 'wipe', duration: 0.3};
    after.clips[0].transition = {duration: 0.3, type: 'wipe'};
    after.clips[0].opacity = 0.5;
    expect(() => admitTransitionMutation(before, after)).not.toThrow();
  });
  it('normal updateClip reaches admission before applying its edit', () => {
    const cfg = config(0.9), applyEdit = {calls: 0};
    const state = {availability: {mounted: true}, data: {dataRef: {current: {
      config: cfg, resolvedConfig: cfg, registry: {assets: {}}, rows: [], meta: {}, clipOrder: {},
      output: cfg.output, tracks: cfg.tracks,
    }}}, ops: {applyEdit: () => { applyEdit.calls += 1; }}};
    const commands = createTimelineCommands({getState: () => state} as never);
    const result = commands.updateClip({clipId: 'a', patch: {transition}});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Move or trim/);
    expect(applyEdit.calls).toBe(0);
    expect(cfg.clips[0].transition).toBeUndefined();
  });
});
