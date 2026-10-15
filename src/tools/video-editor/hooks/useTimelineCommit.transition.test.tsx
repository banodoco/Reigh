// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {useTimelineCommit} from './useTimelineCommit.ts';
import {TimelineEventBus} from './useTimelineEventBus.ts';
import {buildTimelineData} from '../lib/timeline-data.ts';
import type {TimelineConfig} from '../types/index.ts';

const errors = vi.hoisted(() => vi.fn());
vi.mock('@/shared/components/ui/runtime/sonner.tsx', () => ({toast: {error: errors}}));

async function initial(start: number) {
  const config: TimelineConfig = {output: {resolution: '640x360', fps: 30, file: 'out.mp4'},
    tracks: [{id: 'v1', kind: 'visual', label: 'Visual'}], clips: [
      {id: 'a', track: 'v1', at: 0, hold: 1, clipType: 'hold'},
      {id: 'b', track: 'v1', at: start, hold: 1, clipType: 'hold'},
    ]};
  return buildTimelineData(config, {assets: {}}, async () => '');
}

describe('inspector rows reach transition admission at the actual commit hook', () => {
  it('refuses before history/save and shows the next step', async () => {
    const data = await initial(0.9), bus = new TimelineEventBus(), beforeCommit = vi.fn(), save = vi.fn();
    bus.on('beforeCommit', beforeCommit);
    bus.on('scheduleSave', save);
    const {result} = renderHook(() => useTimelineCommit({eventBus: bus,
      lastSavedSignatureRef: {current: ''}, initialData: data}));
    act(() => result.current.applyEdit({type: 'rows', rows: data.rows,
      metaUpdates: {a: {transition: {type: 'crossfade', duration: 0.3}}}}));
    expect(result.current.dataRef.current).toBe(data);
    expect(beforeCommit).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(errors).toHaveBeenLastCalledWith(expect.stringMatching(/Move or trim/));
  });
  for (const start of [1, 1.5]) {
    it(`accepts a touching/gapped row edit at ${start}`, async () => {
      const data = await initial(start), bus = new TimelineEventBus();
      const {result} = renderHook(() => useTimelineCommit({eventBus: bus,
        lastSavedSignatureRef: {current: ''}, initialData: data}));
      act(() => result.current.applyEdit({type: 'rows', rows: data.rows,
        metaUpdates: {a: {transition: {type: 'crossfade', duration: 0.3}}}}));
      expect(result.current.dataRef.current).not.toBe(data);
      expect(result.current.dataRef.current!.resolvedConfig.clips.find(c => c.id === 'b')!.at).toBe(start);
    });
  }
});
