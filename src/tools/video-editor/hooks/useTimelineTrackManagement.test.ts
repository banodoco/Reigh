import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data';
import { serializeForDisk } from '@/tools/video-editor/lib/serialize';
import {
  useTimelineTrackManagement,
  moveTrackWithinKind,
  reorderTracksByDirection,
} from '@/tools/video-editor/hooks/useTimelineTrackManagement';
import type {
  ResolvedTimelineConfig,
  TrackDefinition,
  TrackKind,
} from '@/tools/video-editor/types';
import { createTimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';

const makePinnedGroup = (args: {
  shotId: string;
  trackId: string;
  clipIds: string[];
  mode: 'images' | 'video';
}) => ({ ...args });

function makeTrack(id: string, kind: TrackKind): TrackDefinition {
  return {
    id,
    kind,
    label: id,
  };
}

function getTrackOrder(tracks: TrackDefinition[]): string[] {
  return tracks.map((track) => track.id);
}

function makeResolvedConfig(tracks: TrackDefinition[]): ResolvedTimelineConfig {
  return {
    output: {
      resolution: '1280x720',
      fps: 30,
      file: 'out.mp4',
    },
    tracks,
    clips: tracks.map((track, index) => ({
      id: `clip-${track.id}`,
      at: index,
      track: track.id,
      clipType: 'hold',
      hold: 1,
    })),
    registry: {},
  };
}

describe('reorderTracksByDirection', () => {
  it('handles mixed-kind boundaries without crossing kinds', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('A1', 'audio'),
      makeTrack('A2', 'audio'),
    ];

    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V2', 1))).toEqual(['V1', 'V2', 'A1', 'A2']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'A1', -1))).toEqual(['V1', 'V2', 'A1', 'A2']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'A1', 1))).toEqual(['V1', 'V2', 'A2', 'A1']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V1', 1))).toEqual(['V2', 'V1', 'A1', 'A2']);
  });

  it('no-ops when each kind has only one track', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('A1', 'audio'),
    ];

    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V1', -1))).toEqual(['V1', 'A1']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V1', 1))).toEqual(['V1', 'A1']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'A1', -1))).toEqual(['V1', 'A1']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'A1', 1))).toEqual(['V1', 'A1']);
  });

  it('reorders normally when all tracks share the same kind', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('V3', 'visual'),
    ];

    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V1', 1))).toEqual(['V2', 'V1', 'V3']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V2', 1))).toEqual(['V1', 'V3', 'V2']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V3', -1))).toEqual(['V1', 'V3', 'V2']);
  });
});

describe('runtime editability at commit', () => {
  it('rechecks a lock after the drag plan was produced', () => {
    const tracks = [makeTrack('V1', 'visual'), makeTrack('V2', 'visual')];
    const dataRef = { current: {
      rows: [
        { id: 'V1', actions: [{ id: 'clip-1', start: 0, end: 10, effectId: 'effect-clip-1' }] },
        { id: 'V2', actions: [] },
      ],
      tracks,
      meta: { 'clip-1': { track: 'V1', clipType: 'hold', hold: 10 } },
      clipOrder: { V1: ['clip-1'], V2: [] },
      config: { output: { resolution: '1280x720', fps: 30, file: 'out.mp4' }, tracks, clips: [{ id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 10 }] },
      resolvedConfig: makeResolvedConfig(tracks),
    } } as any;
    const applyEdit = vi.fn();
    const { result } = renderHook(() => useTimelineTrackManagement({
      dataRef,
      resolvedConfig: dataRef.current.resolvedConfig,
      selectedClipId: null,
      setSelectedTrackId: vi.fn(),
      applyEdit,
      editability: createTimelineEditability({ lockedClipIds: ['clip-1'] }),
    }));

    act(() => result.current.applyResolvedClipMove('clip-1', 'V2', 'V2', 20, false, 'txn-stale-lock'));
    expect(applyEdit).not.toHaveBeenCalled();
  });
});

describe('moveTrackWithinKind', () => {
  it('moves a track to a new position within its kind group', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('V3', 'visual'),
      makeTrack('A1', 'audio'),
      makeTrack('A2', 'audio'),
    ];

    expect(getTrackOrder(moveTrackWithinKind(tracks, 'V1', 'V3'))).toEqual(['V2', 'V3', 'V1', 'A1', 'A2']);
  });

  it('allows drag moves between different kinds', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('A1', 'audio'),
      makeTrack('A2', 'audio'),
    ];

    expect(getTrackOrder(moveTrackWithinKind(tracks, 'V2', 'A1'))).toEqual(['V1', 'A1', 'V2', 'A2']);
  });

  it('preserves within-kind order across serialize and buildTimelineData round-trips', async () => {
    const reorderedTracks = moveTrackWithinKind([
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('A1', 'audio'),
      makeTrack('A2', 'audio'),
    ], 'V1', 'V2');

    const serialized = serializeForDisk(makeResolvedConfig(reorderedTracks));
    const rebuilt = await buildTimelineData(serialized, { assets: {} });

    expect(getTrackOrder(rebuilt.tracks)).toEqual(['V2', 'V1', 'A1', 'A2']);
  });
});

describe('useTimelineTrackManagement', () => {
  it('keeps a canonical-shot track during direct removal and clear-unused operations', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('picture', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('A1', 'audio'),
    ];
    const resolvedConfig = { ...makeResolvedConfig(tracks), clips: [] };
    const dataRef = { current: {
      rows: tracks.map((track) => ({ id: track.id, actions: [] })),
      tracks,
      meta: {},
      clipOrder: Object.fromEntries(tracks.map((track) => [track.id, []])),
      config: resolvedConfig,
      resolvedConfig,
    } } as any;
    const applyEdit = vi.fn();
    const { result } = renderHook(() => useTimelineTrackManagement({
      dataRef,
      resolvedConfig,
      selectedClipId: null,
      setSelectedTrackId: vi.fn(),
      applyEdit,
      protectedTrackIds: new Set(['picture']),
    }));

    expect(result.current.unusedTrackCount).toBe(1);
    act(() => result.current.handleRemoveTrack('picture'));
    expect(applyEdit).not.toHaveBeenCalled();

    act(() => result.current.handleClearUnusedTracks());
    const [mutation] = applyEdit.mock.calls[0];
    expect(mutation.resolvedConfig.tracks.map((track: TrackDefinition) => track.id)).toContain('picture');
    expect(mutation.resolvedConfig.tracks.map((track: TrackDefinition) => track.id)).not.toContain('V2');
  });

  it('reroutes moveClipToRow through a group move when the clip belongs to a pinned group', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
    ];
    const dataRef = {
      current: {
        rows: [
          { id: 'V1', actions: [{ id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' }] },
          { id: 'V2', actions: [] },
        ],
        tracks,
        meta: {
          'clip-1': { track: 'V1', clipType: 'hold', hold: 2 },
        },
        clipOrder: { V1: ['clip-1'], V2: [] },
        config: {
          output: {
            resolution: '1280x720',
            fps: 30,
            file: 'out.mp4',
          },
          tracks,
          clips: [{ id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 }],
          pinnedShotGroups: [makePinnedGroup({ shotId: 'shot-1', trackId: 'V1', clipIds: ['clip-1'], mode: 'images' })],
        },
        resolvedConfig: makeResolvedConfig(tracks),
      },
    } as any;
    const applyEdit = vi.fn();

    const { result } = renderHook(() => useTimelineTrackManagement({
      dataRef,
      resolvedConfig: dataRef.current.resolvedConfig,
      selectedClipId: null,
      setSelectedTrackId: vi.fn(),
      applyEdit,
    }));

    act(() => {
      result.current.moveClipToRow('clip-1', 'V2', 3, 'txn-1');
    });

    expect(applyEdit).toHaveBeenCalledTimes(1);
    const [mutation, options] = applyEdit.mock.calls[0];
    expect(mutation).toEqual({
      type: 'rows',
      rows: [
        { id: 'V1', actions: [] },
        { id: 'V2', actions: [{ id: 'clip-1', start: 3, end: 5, effectId: 'effect-clip-1' }] },
      ],
      metaUpdates: { 'clip-1': { track: 'V2' } },
      clipOrderOverride: { V1: [], V2: ['clip-1'] },
      pinnedShotGroupsOverride: [makePinnedGroup({
        shotId: 'shot-1',
        trackId: 'V2',
        clipIds: ['clip-1'],
        mode: 'images',
      })],
    });
    expect(options).toEqual({ transactionId: 'txn-1' });
  });

  it('reroutes createTrackAndMoveClip through a group move when the clip belongs to a pinned group', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
    ];
    const applyEdit = vi.fn();
    const dataRef = {
      current: {
        rows: [
          { id: 'V1', actions: [{ id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' }] },
          { id: 'V2', actions: [] },
        ],
        tracks,
        meta: {
          'clip-1': { track: 'V1', clipType: 'hold', hold: 2 },
        },
        clipOrder: { V1: ['clip-1'], V2: [] },
        config: {
          output: {
            resolution: '1280x720',
            fps: 30,
            file: 'out.mp4',
          },
          tracks,
          clips: [{ id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 }],
          pinnedShotGroups: [makePinnedGroup({ shotId: 'shot-1', trackId: 'V1', clipIds: ['clip-1'], mode: 'images' })],
        },
        resolvedConfig: {
          output: {
            resolution: '1280x720',
            fps: 30,
            file: 'out.mp4',
          },
          tracks,
          clips: [{ id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 }],
          registry: {},
        },
      },
    } as any;

    const { result } = renderHook(() => useTimelineTrackManagement({
      dataRef,
      resolvedConfig: dataRef.current.resolvedConfig,
      selectedClipId: 'clip-1',
      setSelectedTrackId: vi.fn(),
      applyEdit,
    }));

    act(() => {
      result.current.createTrackAndMoveClip('clip-1', 'visual', 4);
    });

    expect(applyEdit).toHaveBeenCalledTimes(1);
    const [mutation, options] = applyEdit.mock.calls[0];
    expect(mutation.type).toBe('config');
    expect(mutation.resolvedConfig.tracks.map((track: TrackDefinition) => track.id)).toEqual(['V1', 'V2', 'V3']);
    expect(mutation.resolvedConfig.clips).toEqual([
      { id: 'clip-1', at: 4, track: 'V3', clipType: 'hold', hold: 2 },
    ]);
    expect(mutation.pinnedShotGroupsOverride).toEqual([makePinnedGroup({
      shotId: 'shot-1',
      trackId: 'V3',
      clipIds: ['clip-1'],
      mode: 'images',
    })]);
    expect(options).toEqual({ selectedClipId: 'clip-1', selectedTrackId: 'V3' });
  });

  it('reroutes grouped ArrowUp and ArrowDown moves through one atomic rows edit', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('txn-group');
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
    ];
    const setSelectedTrackId = vi.fn();
    const applyEdit = vi.fn();
    const dataRef = {
      current: {
        rows: [
          {
            id: 'V1',
            actions: [
              { id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' },
              { id: 'clip-2', start: 2, end: 4, effectId: 'effect-clip-2' },
            ],
          },
          { id: 'V2', actions: [] },
        ],
        tracks,
        meta: {
          'clip-1': { track: 'V1', clipType: 'hold', hold: 2 },
          'clip-2': { track: 'V1', clipType: 'hold', hold: 2 },
        },
        clipOrder: { V1: ['clip-1', 'clip-2'], V2: [] },
        config: {
          output: {
            resolution: '1280x720',
            fps: 30,
            file: 'out.mp4',
          },
          tracks,
          clips: [
            { id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 },
            { id: 'clip-2', at: 2, track: 'V1', clipType: 'hold', hold: 2 },
          ],
          pinnedShotGroups: [makePinnedGroup({
            shotId: 'shot-1',
            trackId: 'V1',
            clipIds: ['clip-1', 'clip-2'],
            mode: 'images',
          })],
        },
        resolvedConfig: makeResolvedConfig(tracks),
      },
    } as any;

    const { result } = renderHook(() => useTimelineTrackManagement({
      dataRef,
      resolvedConfig: dataRef.current.resolvedConfig,
      selectedClipId: 'clip-1',
      setSelectedTrackId,
      applyEdit,
    }));

    act(() => {
      result.current.moveSelectedClipsToTrack('down', new Set(['clip-1']));
    });

    expect(applyEdit).toHaveBeenCalledTimes(1);
    expect(applyEdit).toHaveBeenCalledWith({
      type: 'rows',
      rows: [
        { id: 'V1', actions: [] },
        {
          id: 'V2',
          actions: [
            { id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' },
            { id: 'clip-2', start: 2, end: 4, effectId: 'effect-clip-2' },
          ],
        },
      ],
      metaUpdates: {
        'clip-1': { track: 'V2' },
        'clip-2': { track: 'V2' },
      },
      clipOrderOverride: { V1: [], V2: ['clip-1', 'clip-2'] },
      pinnedShotGroupsOverride: [makePinnedGroup({
        shotId: 'shot-1',
        trackId: 'V2',
        clipIds: ['clip-1', 'clip-2'],
        mode: 'images',
      })],
    }, { transactionId: 'txn-group' });
    expect(setSelectedTrackId).toHaveBeenCalledWith('V2');
  });

  it('reroutes grouped upward moves through one atomic rows edit', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('txn-group-up');
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
    ];
    const setSelectedTrackId = vi.fn();
    const applyEdit = vi.fn();
    const dataRef = {
      current: {
        rows: [
          { id: 'V1', actions: [] },
          {
            id: 'V2',
            actions: [
              { id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' },
              { id: 'clip-2', start: 2, end: 4, effectId: 'effect-clip-2' },
            ],
          },
        ],
        tracks,
        meta: {
          'clip-1': { track: 'V2', clipType: 'hold', hold: 2 },
          'clip-2': { track: 'V2', clipType: 'hold', hold: 2 },
        },
        clipOrder: { V1: [], V2: ['clip-1', 'clip-2'] },
        config: {
          output: {
            resolution: '1280x720',
            fps: 30,
            file: 'out.mp4',
          },
          tracks,
          clips: [
            { id: 'clip-1', at: 0, track: 'V2', clipType: 'hold', hold: 2 },
            { id: 'clip-2', at: 2, track: 'V2', clipType: 'hold', hold: 2 },
          ],
          pinnedShotGroups: [makePinnedGroup({
            shotId: 'shot-1',
            trackId: 'V2',
            clipIds: ['clip-1', 'clip-2'],
            mode: 'images',
          })],
        },
        resolvedConfig: makeResolvedConfig(tracks),
      },
    } as any;

    const { result } = renderHook(() => useTimelineTrackManagement({
      dataRef,
      resolvedConfig: dataRef.current.resolvedConfig,
      selectedClipId: 'clip-1',
      setSelectedTrackId,
      applyEdit,
    }));

    act(() => {
      result.current.moveSelectedClipsToTrack('up', new Set(['clip-1']));
    });

    expect(applyEdit).toHaveBeenCalledTimes(1);
    expect(applyEdit).toHaveBeenCalledWith({
      type: 'rows',
      rows: [
        {
          id: 'V1',
          actions: [
            { id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' },
            { id: 'clip-2', start: 2, end: 4, effectId: 'effect-clip-2' },
          ],
        },
        { id: 'V2', actions: [] },
      ],
      metaUpdates: {
        'clip-1': { track: 'V1' },
        'clip-2': { track: 'V1' },
      },
      clipOrderOverride: { V1: ['clip-1', 'clip-2'], V2: [] },
      pinnedShotGroupsOverride: [makePinnedGroup({
        shotId: 'shot-1',
        trackId: 'V1',
        clipIds: ['clip-1', 'clip-2'],
        mode: 'images',
      })],
    }, { transactionId: 'txn-group-up' });
    expect(setSelectedTrackId).toHaveBeenCalledWith('V1');
  });
});


describe('source track editing', async () => {
  async function setup() {
    const config = makeResolvedConfig([{ ...makeTrack('V1', 'visual'), role: 'source' }, makeTrack('V2', 'visual')]);
    const dataRef = { current: await buildTimelineData(serializeForDisk(config), { assets: {} }) };
    const applyEdit = vi.fn();
    const { result } = renderHook(() => useTimelineTrackManagement({
      dataRef, resolvedConfig: config, selectedClipId: 'clip-V1', setSelectedTrackId: vi.fn(), applyEdit,
    }));
    return { config, dataRef, applyEdit, result };
  }

  it('changes role as an ordinary config edit while preserving clips and other settings', async () => {
    const { config, dataRef, applyEdit, result } = await setup();
    act(() => result.current.handleTrackPopoverChange('V1', { role: 'output' }));
    const mutation = applyEdit.mock.calls[0][0];
    expect(mutation.type).toBe('tracks');
    expect(mutation.tracks[0]).toEqual({ ...dataRef.current.config.tracks![0], role: 'output' });
    expect(applyEdit.mock.calls[0][1].editCommands[0].op).toBe('timeline.set');
    expect(config.tracks[0].role).toBe('source');
  });

  it('inherits Source when moving to a newly created lane, with one ordinary edit', async () => {
    const { config, applyEdit, result } = await setup();
    act(() => result.current.createTrackAndMoveClip('clip-V1', 'visual', 5));
    expect(applyEdit).toHaveBeenCalledTimes(1);
    const mutation = applyEdit.mock.calls[0][0];
    expect(mutation.resolvedConfig.tracks.at(-1).role).toBe('source');
    expect(mutation.resolvedConfig.clips.find((clip: { id: string }) => clip.id === 'clip-V1')).toMatchObject({ at: 5, track: 'V3' });
    expect(config.tracks).toHaveLength(2);
  });

  it('inherits Source in the resolved drag path and preserves its undo transaction', async () => {
    const { dataRef, applyEdit, result } = await setup();
    const before = dataRef.current;
    act(() => result.current.applyResolvedClipMove('clip-V1', 'new', null, 4, true, 'drag-role'));
    expect(dataRef.current).toBe(before);
    expect(applyEdit).toHaveBeenCalledTimes(1);
    expect(applyEdit.mock.calls[0][0].resolvedConfig.tracks.at(-1)).toEqual({ id: 'V3', kind: 'visual', label: 'V3', role: 'source' });
    expect(applyEdit.mock.calls[0][1]).toMatchObject({ transactionId: 'drag-role', editCommands: [
      { op: 'timeline.add' }, { op: 'clip.nudge', args: { frames: 120 } }, { op: 'clip.set-track', args: { track: 'V3' } },
    ] });
  });

  it('leaves no preallocated lane when the shared apply boundary refuses or throws', async () => {
    const { dataRef, applyEdit, result } = await setup();
    const before = dataRef.current;
    act(() => result.current.applyResolvedClipMove('clip-V1', 'new', null, 4, true, 'refused-drag'));
    expect(dataRef.current).toBe(before);
    applyEdit.mockImplementation(() => { throw new Error('validation refused'); });
    expect(() => result.current.applyResolvedClipMove('clip-V1', 'new', null, 4, true)).toThrow('validation refused');
    expect(dataRef.current).toBe(before);
    expect(dataRef.current.tracks.map((track) => track.id)).toEqual(['V1', 'V2']);
  });

  it('keeps explicit Add track on the legacy Output default', async () => {
    const { applyEdit, result } = await setup();
    act(() => result.current.handleAddTrack('visual'));
    expect(applyEdit.mock.calls[0][0].tracks.at(-1).role ?? 'output').toBe('output');
  });
});

describe('selected free track moves', () => {
  async function setup(options: { tied?: boolean; grouped?: boolean; locked?: boolean; obstacle?: 'snap' | 'reroute' } = {}) {
    const tracks = [makeTrack('V1', 'visual'), makeTrack('A1', 'audio'), makeTrack('V2', 'visual'), makeTrack('V3', 'visual')];
    const data = await buildTimelineData({
      output: { resolution: '1280x720', fps: 30, file: 'out.mp4' },
      tracks,
      clips: [
        { id: 'clip-1', at: 1, hold: 2, clipType: 'hold', track: 'V1' },
        { id: 'clip-2', at: 5, hold: 1, clipType: 'hold', track: 'V2', ...(options.tied ? { app: { astrid: { until: 'tail' } } } : {}) },
        { id: 'unrelated', at: 9, hold: 1, clipType: 'hold', track: 'V3', opacity: 0.7 },
        ...(options.obstacle ? [{ id: 'obstacle', at: options.obstacle === 'snap' ? 2.9 : 0, hold: options.obstacle === 'snap' ? 1 : 4, clipType: 'hold' as const, track: 'V2' }] : []),
      ],
      ...(options.grouped ? { pinnedShotGroups: [makePinnedGroup({ shotId: 'shot-1', trackId: 'V1', clipIds: ['clip-1'], mode: 'images' })] } : {}),
    }, { assets: {} });
    const dataRef = { current: data };
    const applyEdit = vi.fn();
    const setSelectedTrackId = vi.fn();
    const hook = renderHook(() => useTimelineTrackManagement({
      dataRef, resolvedConfig: data.resolvedConfig, selectedClipId: 'clip-1', setSelectedTrackId, applyEdit,
      ...(options.locked ? { editability: createTimelineEditability({ lockedClipIds: ['clip-2'] }) } : {}),
    }));
    return { ...hook, dataRef, data, applyEdit, setSelectedTrackId };
  }

  it('applies one atomic edit across existing same-kind lanes with original-track expectations', async () => {
    const h = await setup();
    const original = structuredClone(h.data);
    act(() => h.result.current.moveSelectedClipsToTrack('down', new Set(['clip-1', 'clip-2'])));
    expect(h.applyEdit).toHaveBeenCalledTimes(1);
    const [mutation, options] = h.applyEdit.mock.calls[0];
    expect(mutation).toEqual({
      type: 'rows',
      rows: [
        { ...h.data.rows[0], actions: [] },
        h.data.rows[1],
        { ...h.data.rows[2], actions: h.data.rows[0].actions },
        { ...h.data.rows[3], actions: [...h.data.rows[3].actions, ...h.data.rows[2].actions] },
      ],
      metaUpdates: { 'clip-1': { track: 'V2' }, 'clip-2': { track: 'V3' } },
      clipOrderOverride: { V1: [], A1: [], V2: ['clip-1'], V3: ['unrelated', 'clip-2'] },
    });
    expect(options.editCommands).toEqual([
      { op: 'clip.set-track', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { track: 'V2' }, expect: { track: { state: 'present', value: 'V1' } } },
      { op: 'clip.set-track', select: 'parent/clip:clip-2', resolved: ['parent/clip:clip-2'], args: { track: 'V3' }, expect: { track: { state: 'present', value: 'V2' } } },
    ]);
    expect(options.transactionId).toEqual(expect.any(String));
    expect(h.setSelectedTrackId).toHaveBeenCalledWith('V2');
    expect(h.dataRef.current).toBe(h.data);
    expect(h.data).toEqual(original);
  });

  it.each(['up', 'down'] as const)('keeps all same-kind units blocked when one selected lane has no %s destination', async (direction) => {
    const h = await setup();
    act(() => h.result.current.moveSelectedClipsToTrack(direction, new Set(['clip-1', 'unrelated'])));
    expect(h.applyEdit).not.toHaveBeenCalled();
    expect(h.setSelectedTrackId).not.toHaveBeenCalled();
  });

  it('keeps an edge snap on the existing per-clip path instead of claiming a pure retrack', async () => {
    const h = await setup({ obstacle: 'snap' });
    act(() => h.result.current.moveSelectedClipsToTrack('down', new Set(['clip-1', 'clip-2'])));
    expect(h.applyEdit).toHaveBeenCalledTimes(2);
    expect(h.applyEdit.mock.calls[0][1].editCommands.map((command: { op: string }) => command.op))
      .toEqual(['clip.nudge', 'clip.set-track']);
    expect(h.applyEdit.mock.calls[0][0].rows.find((row: { id: string }) => row.id === 'V2').actions.find((action: { id: string }) => action.id === 'clip-1').start).toBeCloseTo(0.9);
  });

  it('keeps collision rerouting on the existing per-clip path', async () => {
    const h = await setup({ obstacle: 'reroute' });
    act(() => h.result.current.moveSelectedClipsToTrack('down', new Set(['clip-1', 'clip-2'])));
    expect(h.applyEdit).toHaveBeenCalledTimes(2);
    expect(h.applyEdit.mock.calls[0][0].metaUpdates).toEqual({ 'clip-1': { track: 'V3' } });
  });

  it('keeps a tied-end semantic mismatch on the existing per-clip path', async () => {
    const h = await setup({ tied: true });
    act(() => h.result.current.moveSelectedClipsToTrack('down', new Set(['clip-1', 'clip-2'])));
    expect(h.applyEdit).toHaveBeenCalledTimes(2);
    expect(h.applyEdit.mock.calls[0][1].editCommands).toHaveLength(1);
    expect(h.applyEdit.mock.calls[1][1].editCommands).toBeUndefined();
    expect(h.applyEdit.mock.calls[0][1].transactionId).toBe(h.applyEdit.mock.calls[1][1].transactionId);
  });

  it('keeps a mixed group and free selection on the existing group and per-clip paths', async () => {
    const h = await setup({ grouped: true });
    act(() => h.result.current.moveSelectedClipsToTrack('down', new Set(['clip-1', 'clip-2'])));
    expect(h.applyEdit).toHaveBeenCalledTimes(2);
    expect(h.applyEdit.mock.calls[0][0].pinnedShotGroupsOverride).toEqual([makePinnedGroup({ shotId: 'shot-1', trackId: 'V2', clipIds: ['clip-1'], mode: 'images' })]);
    expect(h.applyEdit.mock.calls[0][1].editCommands).toBeUndefined();
    expect(h.applyEdit.mock.calls[1][1].editCommands).toHaveLength(1);
  });

  it('preserves the existing per-clip refusal when one selected clip is locked', async () => {
    const h = await setup({ locked: true });
    act(() => h.result.current.moveSelectedClipsToTrack('down', new Set(['clip-1', 'clip-2'])));
    expect(h.applyEdit).toHaveBeenCalledTimes(1);
    expect(h.applyEdit.mock.calls[0][0].metaUpdates).toEqual({ 'clip-1': { track: 'V2' } });
  });
});
