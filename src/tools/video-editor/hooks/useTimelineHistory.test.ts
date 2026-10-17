// @vitest-environment jsdom
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTimelineCommandRunner,
  MEDIA_COMMAND_DESCRIPTORS,
} from '@/tools/video-editor/commands';
import { VideoEditorRuntimeProvider } from '../contexts/VideoEditorRuntimeContext';
import type { DataProvider } from '../data/DataProvider';
import { getConfigSignature, getStableConfigSignature } from '../lib/config-utils';
import { createDefaultTimelineConfig } from '../lib/defaults';
import { createInteractionState } from '../lib/interaction-state';
import { configToRows, type TimelineData } from '../lib/timeline-data';
import { useTimelineHistory } from './useTimelineHistory';
import { TimelineEventBus } from './useTimelineEventBus';
import type { Checkpoint } from '../types/history';
import type { TimelineEditability } from '../lib/timeline-editability';

type CommitCall = {
  nextData: TimelineData;
  options?: {
    save?: boolean;
    selectedClipId?: string | null;
    selectedTrackId?: string | null;
    updateLastSavedSignature?: boolean;
    transactionId?: string;
    semantic?: boolean;
    skipHistory?: boolean;
    commandHistory?: unknown;
  };
};

const SESSION_IDLE_MS = 5 * 60 * 1000;
const historyCommandRunner = createTimelineCommandRunner([...MEDIA_COMMAND_DESCRIPTORS]);

function makeConfig(step: number) {
  const base = createDefaultTimelineConfig();
  return {
    ...base,
    output: {
      ...base.output,
      file: `output-${step}.mp4`,
    },
    theme: '2rp',
    theme_overrides: { visual: { canvas: { fps: 24 } } },
    generation_defaults: { model: 'sequence-v1' },
    tracks: (base.tracks ?? []).map((track) => ({ ...track })),
    clips: step === 0
      ? []
      : [{
          id: `clip-${step}`,
          at: step,
          track: 'V1',
          clipType: 'hold' as const,
          hold: 1,
        }],
  };
}

function makeTimelineData(step: number): TimelineData {
  const config = makeConfig(step);
  const rowData = configToRows(config);
  const resolvedConfig = {
    output: { ...config.output },
    tracks: (config.tracks ?? []).map((track) => ({ ...track })),
    clips: config.clips.map((clip) => ({
      ...clip,
      assetEntry: undefined,
    })),
    registry: {},
    theme: config.theme,
    theme_overrides: config.theme_overrides,
    generation_defaults: config.generation_defaults,
  };

  return {
    config,
    configVersion: 1,
    registry: { assets: {} },
    resolvedConfig,
    rows: rowData.rows,
    meta: rowData.meta,
    effects: rowData.effects,
    assetMap: {},
    output: { ...config.output },
    tracks: (config.tracks ?? []).map((track) => ({ ...track })),
    clipOrder: rowData.clipOrder,
    signature: getConfigSignature(resolvedConfig),
    stableSignature: getStableConfigSignature(config, { assets: {} }),
  };
}

function makeMediaTimelineData(currentAsset: 'asset-old' | 'asset-new' = 'asset-old'): TimelineData {
  const base = createDefaultTimelineConfig();
  const config = {
    ...base,
    output: {
      ...base.output,
      file: `media-${currentAsset}.mp4`,
    },
    tracks: (base.tracks ?? []).map((track) => ({ ...track })),
    clips: [{
      id: 'clip-1',
      at: 0,
      track: 'V1',
      asset: currentAsset,
      clipType: 'hold' as const,
      hold: 1,
    }],
  };
  const registry = {
    assets: {
      'asset-old': { file: 'https://example.com/old.png', type: 'image/png' },
      'asset-new': { file: 'https://example.com/new.png', type: 'image/png' },
    },
  };
  const rowData = configToRows(config);
  const resolvedRegistry = Object.fromEntries(
    Object.entries(registry.assets).map(([assetId, entry]) => [
      assetId,
      {
        ...entry,
        src: entry.file,
      },
    ]),
  );
  const resolvedConfig = {
    output: { ...config.output },
    tracks: (config.tracks ?? []).map((track) => ({ ...track })),
    clips: config.clips.map((clip) => ({
      ...clip,
      assetEntry: clip.asset ? resolvedRegistry[clip.asset] : undefined,
    })),
    registry: resolvedRegistry,
    theme: config.theme,
    theme_overrides: config.theme_overrides,
    generation_defaults: config.generation_defaults,
  };

  return {
    config,
    configVersion: 1,
    registry,
    resolvedConfig,
    rows: rowData.rows,
    meta: rowData.meta,
    effects: rowData.effects,
    assetMap: {
      'asset-old': 'https://example.com/old.png',
      'asset-new': 'https://example.com/new.png',
    },
    output: { ...config.output },
    tracks: (config.tracks ?? []).map((track) => ({ ...track })),
    clipOrder: rowData.clipOrder,
    signature: getConfigSignature(resolvedConfig),
    stableSignature: getStableConfigSignature(config, registry),
  };
}

function makeProvider(overrides: Partial<DataProvider> = {}): DataProvider {
  return {
    loadTimeline: vi.fn(async () => ({ config: makeConfig(0), configVersion: 1 })),
    saveTimeline: vi.fn(async () => 1),
    loadAssetRegistry: vi.fn(async () => ({ assets: {} })),
    resolveAssetUrl: vi.fn(async (file: string) => file),
    ...overrides,
  };
}

function setup(options: {
  initialStep?: number;
  initialData?: TimelineData;
  providerOverrides?: Partial<DataProvider>;
  editability?: TimelineEditability;
} = {}) {
  const provider = makeProvider(options.providerOverrides);
  const eventBus = new TimelineEventBus();
  const dataRef = { current: options.initialData ?? makeTimelineData(options.initialStep ?? 0) };
  const interactionStateRef = { current: createInteractionState() };
  const pendingOpsRef = { current: 0 };
  const commitCalls: CommitCall[] = [];
  const toast = {
    error: vi.fn(() => 'toast-error'),
    success: vi.fn(() => 'toast-success'),
    warning: vi.fn(() => 'toast-warning'),
    info: vi.fn(() => 'toast-info'),
  };
  const commitData = vi.fn((nextData: TimelineData, commitOptions?: CommitCall['options']) => {
    dataRef.current = nextData;
    commitCalls.push({ nextData, options: commitOptions });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(
    VideoEditorRuntimeProvider,
    {
      value: {
        provider,
        project: { projectId: 'project-1' },
        toast,
        timelineId: 'timeline-1',
        userId: 'user-1',
        timelineName: 'Timeline 1',
      },
    },
    children,
  );

  const hook = renderHook(
    () => useTimelineHistory({ eventBus, dataRef, commitData, interactionStateRef, pendingOpsRef, editability: options.editability }),
    { wrapper },
  );

  const applyEdit = (step: number, options: { transactionId?: string; semantic?: boolean } = {}) => {
    act(() => {
      hook.result.current.onBeforeCommit(dataRef.current, options);
      dataRef.current = makeTimelineData(step);
    });
  };

  return {
    provider, eventBus,
    dataRef,
    pendingOpsRef,
    commitCalls,
    commitData,
    toast,
    ...hook,
    applyEdit,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTimelineHistory', () => {
  it('loads canonical history and reports a failed full-closure restore', async () => {
    const listHistory = vi.fn(async () => [{
      revisionId: 'parent-revision-1',
      projectId: 'project-1',
      parentDocumentId: 'timeline-1',
      contentDigest: 'sha256:' + 'a'.repeat(64),
      createdAt: '2026-10-05T12:00:00Z',
      isCurrentHead: false,
    }]);
    const restoreHistory = vi.fn(async () => {
      throw new Error('historical internal timeline revision failed immutable verification');
    });
    const shotComposition = {
      load: vi.fn(),
      listHistory,
      restoreHistory,
    };
    const { result, toast } = setup({
      providerOverrides: { shotComposition } as unknown as Partial<DataProvider>,
    });

    await waitFor(() => expect(result.current.canonicalHistory).toHaveLength(1));
    expect(result.current.canonicalHistorySupported).toBe(true);

    await act(async () => {
      await result.current.restoreCanonicalRevision('parent-revision-1');
    });

    expect(restoreHistory).toHaveBeenCalledWith({
      projectId: 'project-1',
      parentDocumentId: 'timeline-1',
      revisionId: 'parent-revision-1',
    });
    expect(result.current.canonicalHistoryError).toContain('failed immutable verification');
    expect(toast.error).toHaveBeenCalledWith('Could not restore timeline history', {
      description: 'historical internal timeline revision failed immutable verification',
    });
  });

  it('refreshes canonical history on demand after a new revision is published', async () => {
    const first = {
      revisionId: 'parent-revision-1', projectId: 'project-1', parentDocumentId: 'timeline-1',
      contentDigest: 'sha256:' + 'a'.repeat(64), createdAt: '2026-10-05T12:00:00Z', isCurrentHead: true,
    };
    const second = {
      ...first, revisionId: 'parent-revision-2', isCurrentHead: true,
    };
    const listHistory = vi.fn()
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([second, first]);
    const { result } = setup({
      providerOverrides: {
        shotComposition: {
          load: vi.fn(),
          listHistory,
          restoreHistory: vi.fn(),
        } as unknown as DataProvider['shotComposition'],
      },
    });

    await waitFor(() => expect(result.current.canonicalHistory).toHaveLength(1));
    await act(async () => {
      await result.current.refreshCanonicalHistory();
    });

    expect(listHistory).toHaveBeenCalledTimes(2);
    expect(result.current.canonicalHistory.map((entry) => entry.revisionId)).toEqual([
      'parent-revision-2', 'parent-revision-1',
    ]);
  });

  it('supports a basic undo/redo cycle', () => {
    const { result, dataRef, commitCalls, applyEdit } = setup();

    applyEdit(1, { transactionId: 'basic-1' });
    applyEdit(2, { transactionId: 'basic-2' });
    applyEdit(3, { transactionId: 'basic-3' });

    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
      result.current.undo();
      result.current.undo();
    });

    expect(dataRef.current.config.output.file).toBe('output-0.mp4');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(commitCalls.at(-1)?.options).toMatchObject({ save: true, skipHistory: true });

    act(() => {
      result.current.redo();
    });

    expect(dataRef.current.config.output.file).toBe('output-1.mp4');
    expect(dataRef.current.config).toMatchObject({
      theme: '2rp',
      theme_overrides: { visual: { canvas: { fps: 24 } } },
      generation_defaults: { model: 'sequence-v1' },
    });
    expect(dataRef.current.resolvedConfig).toMatchObject({
      theme: '2rp',
      theme_overrides: { visual: { canvas: { fps: 24 } } },
      generation_defaults: { model: 'sequence-v1' },
    });
    expect(result.current.canUndo).toBe(true);
  });

  it('uses inverse command history to undo and redo migrated edits', () => {
    const initialData = makeMediaTimelineData('asset-old');
    const { result, dataRef, commitCalls } = setup({ initialData });
    const applied = historyCommandRunner.apply(initialData, {
      transactionId: 'swap-history',
      commands: [{
        type: 'swap',
        payload: {
          clipId: 'clip-1',
          asset: {
            assetKey: 'asset-new',
            mediaType: 'image',
            durationSeconds: null,
            entry: { file: 'https://example.com/new.png', type: 'image/png' },
            source: 'registered',
          },
        },
      }],
    });

    expect(applied.status).toBe('ok');

    act(() => {
      result.current.onBeforeCommit(initialData, {
        transactionId: applied.transaction.transactionId,
        commandHistory: {
          transaction: applied.transaction,
          history: applied.history,
        },
      });
      dataRef.current = applied.nextData;
    });

    expect(dataRef.current.config.clips[0]?.asset).toBe('asset-new');

    act(() => {
      result.current.undo();
    });

    expect(dataRef.current.config.clips[0]?.asset).toBe('asset-old');

    act(() => {
      result.current.redo();
    });

    expect(dataRef.current.config.clips[0]?.asset).toBe('asset-new');
    expect(commitCalls.at(-1)?.options).toMatchObject({ save: true, skipHistory: true });
  });

  it('falls back to snapshot history when command metadata cannot invert', () => {
    const initialData = makeMediaTimelineData('asset-old');
    const { result, dataRef } = setup({ initialData });
    const applied = historyCommandRunner.apply(initialData, {
      transactionId: 'swap-fallback',
      commands: [{
        type: 'swap',
        payload: {
          clipId: 'clip-1',
          asset: {
            assetKey: 'asset-new',
            mediaType: 'image',
            durationSeconds: null,
            entry: { file: 'https://example.com/new.png', type: 'image/png' },
            source: 'registered',
          },
        },
      }],
    });

    expect(applied.status).toBe('ok');

    act(() => {
      result.current.onBeforeCommit(initialData, {
        transactionId: applied.transaction.transactionId,
        commandHistory: {
          transaction: applied.transaction,
          history: {
            ...applied.history,
            strategy: 'snapshot_fallback',
            inverseTransaction: null,
          },
        },
      });
      dataRef.current = applied.nextData;
    });

    act(() => {
      result.current.undo();
    });

    expect(dataRef.current.config.clips[0]?.asset).toBe('asset-old');

    act(() => {
      result.current.redo();
    });

    expect(dataRef.current.config.clips[0]?.asset).toBe('asset-new');
  });

  it('invalidates redo after a new edit following undo', () => {
    const { result, dataRef, applyEdit } = setup();

    applyEdit(1, { transactionId: 'redo-1' });
    applyEdit(2, { transactionId: 'redo-2' });

    act(() => {
      result.current.undo();
    });

    expect(result.current.canRedo).toBe(true);
    expect(dataRef.current.config.output.file).toBe('output-1.mp4');

    applyEdit(3, { transactionId: 'redo-3' });

    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.redo();
    });

    expect(dataRef.current.config.output.file).toBe('output-3.mp4');
  });

  it('collapses five edits with the same transaction id into one undo entry', () => {
    const { result, dataRef, applyEdit } = setup();

    for (let step = 1; step <= 5; step += 1) {
      applyEdit(step, { transactionId: 'txn-1' });
    }

    act(() => {
      result.current.undo();
    });

    expect(dataRef.current.config.output.file).toBe('output-0.mp4');
    expect(result.current.canUndo).toBe(false);
  });

  it('collapses rapid untransacted edits within the 300ms debounce window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T10:00:00.000Z'));

    const { result, dataRef, applyEdit } = setup();

    applyEdit(1);
    vi.advanceTimersByTime(100);
    applyEdit(2);
    vi.advanceTimersByTime(100);
    applyEdit(3);
    vi.advanceTimersByTime(400);
    applyEdit(4);

    act(() => {
      result.current.undo();
    });

    expect(dataRef.current.config.output.file).toBe('output-3.mp4');

    act(() => {
      result.current.undo();
    });

    expect(dataRef.current.config.output.file).toBe('output-0.mp4');
  });

  it('caps the undo stack at 100 entries', () => {
    const { result, dataRef, applyEdit } = setup();

    for (let step = 1; step <= 105; step += 1) {
      applyEdit(step, { transactionId: `txn-${step}` });
    }

    act(() => {
      for (let count = 0; count < 100; count += 1) {
        result.current.undo();
      }
    });

    expect(dataRef.current.config.output.file).toBe('output-5.mp4');
    expect(result.current.canUndo).toBe(false);
  });

  it('creates checkpoints for session boundaries, edit distance, and semantic edits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T12:00:00.000Z'));

    const saveCheckpoint = vi.fn(async (_timelineId: string, checkpoint: Omit<Checkpoint, 'id'>) => {
      return `checkpoint-${checkpoint.triggerType}`;
    });

    const sessionCase = setup({ providerOverrides: { saveCheckpoint } });
    sessionCase.applyEdit(1, { transactionId: 'session-1' });
    vi.advanceTimersByTime(SESSION_IDLE_MS + 1);
    sessionCase.applyEdit(2, { transactionId: 'session-2' });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveCheckpoint).toHaveBeenCalledWith(
      'timeline-1',
      expect.objectContaining({ triggerType: 'session_boundary' }),
    );

    saveCheckpoint.mockClear();

    const distanceCase = setup({ providerOverrides: { saveCheckpoint } });
    for (let step = 1; step <= 31; step += 1) {
      distanceCase.applyEdit(step, { transactionId: `distance-${step}` });
    }

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveCheckpoint).toHaveBeenCalledWith(
      'timeline-1',
      expect.objectContaining({ triggerType: 'edit_distance' }),
    );

    saveCheckpoint.mockClear();

    const semanticCase = setup({ providerOverrides: { saveCheckpoint } });
    semanticCase.applyEdit(1, { semantic: true, transactionId: 'semantic-1' });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveCheckpoint).toHaveBeenCalledWith(
      'timeline-1',
      expect.objectContaining({ triggerType: 'semantic' }),
    );
  });

  it('skips checkpoint persistence when provider persistence is disabled', async () => {
    const saveCheckpoint = vi.fn(async () => 'checkpoint-read-only');
    const testCase = setup({
      providerOverrides: {
        persistenceEnabled: false,
        saveCheckpoint,
      },
    });

    await act(async () => {
      await testCase.result.current.createManualCheckpoint('Read only');
    });

    expect(saveCheckpoint).not.toHaveBeenCalled();
  });

  it('blocks manual checkpoint persistence when whole-timeline editability is denied', async () => {
    const saveCheckpoint = vi.fn(async () => 'checkpoint-read-only');
    const testCase = setup({
      editability: {
        check: () => ({ allowed: false, reason: 'timeline_read_only' }),
        checkTimeline: () => ({ allowed: false, reason: 'timeline_read_only' }),
      },
      providerOverrides: {
        persistenceEnabled: true,
        saveCheckpoint,
      },
    });

    await act(async () => {
      await testCase.result.current.createManualCheckpoint('Read only');
    });

    expect(saveCheckpoint).not.toHaveBeenCalled();
    expect(testCase.result.current.checkpoints).toHaveLength(0);
  });

  it('jumpToCheckpoint restores the checkpoint config and clears both stacks', async () => {
    const checkpointConfig = makeConfig(7);
    const checkpoint: Checkpoint = {
      id: 'checkpoint-7',
      timelineId: 'timeline-1',
      config: checkpointConfig,
      createdAt: new Date('2026-03-26T12:00:00.000Z').toISOString(),
      triggerType: 'manual',
      label: 'Checkpoint 7',
      editsSinceLastCheckpoint: 0,
    };

    const { result, dataRef, commitCalls, applyEdit } = setup({
      providerOverrides: {
        loadCheckpoints: vi.fn(async () => [checkpoint]),
      },
    });

    await waitFor(() => {
      expect(result.current.checkpoints).toHaveLength(1);
    });

    applyEdit(1);

    act(() => {
      result.current.jumpToCheckpoint('checkpoint-7');
    });

    expect(dataRef.current.config.output.file).toBe('output-7.mp4');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(commitCalls.at(-1)?.options).toMatchObject({ save: true, skipHistory: true });
  });

  it('blocks undo, redo, and checkpoint jumps while whole-timeline editability is denied', async () => {
    let allowed = true;
    const checkpoint: Checkpoint = {
      id: 'checkpoint-7',
      timelineId: 'timeline-1',
      config: makeConfig(7),
      createdAt: new Date('2026-03-26T12:00:00.000Z').toISOString(),
      triggerType: 'manual',
      label: 'Checkpoint 7',
      editsSinceLastCheckpoint: 0,
    };
    const testCase = setup({
      editability: { checkTimeline: () => ({ allowed }) },
      providerOverrides: { loadCheckpoints: vi.fn(async () => [checkpoint]) },
    });
    await waitFor(() => expect(testCase.result.current.checkpoints).toHaveLength(1));
    testCase.applyEdit(1);

    allowed = false;
    act(() => testCase.result.current.undo());
    expect(testCase.dataRef.current.config.output.file).toBe('output-1.mp4');
    expect(testCase.result.current.canUndo).toBe(true);

    allowed = true;
    act(() => testCase.result.current.undo());
    expect(testCase.result.current.canRedo).toBe(true);
    const dataAfterUndo = testCase.dataRef.current;
    const commitsAfterUndo = testCase.commitCalls.length;

    allowed = false;
    act(() => {
      testCase.result.current.redo();
      testCase.result.current.jumpToCheckpoint('checkpoint-7');
    });
    expect(testCase.dataRef.current).toBe(dataAfterUndo);
    expect(testCase.commitCalls).toHaveLength(commitsAfterUndo);
    expect(testCase.result.current.canRedo).toBe(true);
  });

  it('does not accumulate history when state changes bypass onBeforeCommit', () => {
    const { result, dataRef } = setup();

    act(() => {
      dataRef.current = makeTimelineData(1);
    });

    expect(result.current.canUndo).toBe(false);

    act(() => {
      result.current.undo();
    });

    expect(dataRef.current.config.output.file).toBe('output-1.mp4');
    expect(result.current.canRedo).toBe(false);
  });
});

describe('useTimelineHistory — upload pause gate', () => {
  it('pauses undo/redo while pendingOps > 0 and releases when it returns to 0', () => {
    const { result, rerender, pendingOpsRef, commitCalls, applyEdit } = setup();

    // Distinct transactions so the untransacted collapse window cannot merge
    // them into one undo entry.
    applyEdit(1, { transactionId: 'gate-1' });
    applyEdit(2, { transactionId: 'gate-2' });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.historyPausedForUploads).toBe(false);

    // An upload starts: the registry-stranding window opens.
    pendingOpsRef.current = 1;
    rerender();
    expect(result.current.historyPausedForUploads).toBe(true);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    // undo()/redo() are no-ops during the pause: no restore is committed and
    // the stacks are untouched.
    const commitsBefore = commitCalls.length;
    act(() => {
      result.current.undo();
      result.current.redo();
    });
    expect(commitCalls.length).toBe(commitsBefore);

    // Upload finishes: the gate releases with the stacks intact.
    pendingOpsRef.current = 0;
    rerender();
    expect(result.current.historyPausedForUploads).toBe(false);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(commitCalls.length).toBe(commitsBefore + 1);
  });
});

it('W09 native registration undo/redo waits for its exact acknowledged owner and never saves a snapshot fallback', () => {
  const { result, dataRef, commitCalls, eventBus } = setup();
  const owner = makeTimelineData(1);
  const inverse = { op: 'timeline.inverse', select: null, args: { publication: 'pub-register', writes: [{ id: 'parent', path: 'registry.assets', before: { state: 'present', value: { registered: null } }, after: { state: 'absent' } }] } };
  act(() => { result.current.onBeforeCommit(dataRef.current, { semantic: true, nativeRegistrationOwner: owner }); dataRef.current = owner; });
  expect(result.current.canUndo).toBe(false);
  act(() => { result.current.undo(); eventBus.emit('nativeRegistrationAccepted', makeTimelineData(1), inverse); });
  expect(commitCalls).toHaveLength(0); expect(result.current.canUndo).toBe(false);
  act(() => eventBus.emit('nativeRegistrationAccepted', owner, inverse));
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(commitCalls).toHaveLength(1); expect(commitCalls[0].options).toMatchObject({ save: true, skipHistory: true, editCommands: [inverse] });
  expect(result.current.canRedo).toBe(false);
  act(() => result.current.redo()); expect(commitCalls).toHaveLength(1);
  const redo = structuredClone(inverse); redo.args.publication = 'pub-undo';
  act(() => eventBus.emit('nativeRegistrationAccepted', commitCalls[0].nextData, redo));
  expect(result.current.canRedo).toBe(true);
  act(() => result.current.redo()); expect(commitCalls).toHaveLength(2); expect(commitCalls[1].options).toMatchObject({ editCommands: [redo] });
});

it('W09 no-change receipt removes only its native owner without blocking prior history', () => {
  const { result, dataRef, eventBus } = setup();
  act(() => { result.current.onBeforeCommit(dataRef.current, { semantic: true }); dataRef.current = makeTimelineData(1); });
  const owner = makeTimelineData(1);
  act(() => { result.current.onBeforeCommit(dataRef.current, { semantic: true, nativeRegistrationOwner: owner }); dataRef.current = owner; });
  expect(result.current.canUndo).toBe(false);
  act(() => eventBus.emit('nativeRegistrationAccepted', makeTimelineData(1), null));
  expect(result.current.canUndo).toBe(false);
  act(() => eventBus.emit('nativeRegistrationAccepted', owner, null));
  expect(result.current.canUndo).toBe(true);
});

it('retains a caption transaction across canonical refresh and undoes only its accepted writes', () => {
  const { result, dataRef, commitCalls, eventBus } = setup();
  const owner = makeTimelineData(1);
  const inverse = { op: 'timeline.inverse', select: null, args: { publication: 'caption-publication', writes: [
    { id: 'parent/clip:media', path: 'app', before: { state: 'present', value: { transcript: { v: 1, binding: { occurrence_id: null } } } }, after: { state: 'absent' } },
    { id: 'parent/clip:caption-request-0', path: '', before: { state: 'present', value: { id: 'caption-request-0', element: 'am-type' } }, after: { state: 'absent' } },
  ] } };
  act(() => { result.current.onBeforeCommit(dataRef.current, { semantic: true, nativeRegistrationOwner: owner }); dataRef.current = owner; });
  expect(result.current.canUndo).toBe(false);
  act(() => eventBus.emit('nativeRegistrationAccepted', owner, inverse));
  expect(result.current.canUndo).toBe(true);
  // A canonical refresh must retain publication-bound history, including other authored fields.
  const refreshed = makeTimelineData(2);
  act(() => { result.current.onRemoteData(owner, refreshed); dataRef.current = refreshed; });
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(commitCalls).toHaveLength(1);
  expect(commitCalls[0].nextData.config).toEqual(refreshed.config);
  expect(commitCalls[0].options).toMatchObject({ save: true, skipHistory: true, editCommands: [inverse] });
  expect(result.current.canRedo).toBe(false);
  const redo = structuredClone(inverse); redo.args.publication = 'caption-undo-publication';
  act(() => eventBus.emit('nativeRegistrationAccepted', commitCalls[0].nextData, redo));
  expect(result.current.canRedo).toBe(true);
  act(() => result.current.redo());
  expect(commitCalls[1].options).toMatchObject({ editCommands: [redo] });
});

it('drops ordinary snapshot history on canonical refresh without treating it as caption receipt history', () => {
  const { result, dataRef, applyEdit } = setup();
  applyEdit(1, { transactionId: 'ordinary' });
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.onRemoteData(dataRef.current, makeTimelineData(2)));
  expect(result.current.canUndo).toBe(false);
});
