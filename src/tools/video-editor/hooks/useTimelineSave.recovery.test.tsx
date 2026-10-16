// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import { getStableConfigSignature } from '@/tools/video-editor/lib/config-utils.ts';
import { clearTimelineDraft, loadTimelineDraft, saveTimelineDraft } from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { TimelineConfig } from '@/tools/video-editor/types/index.ts';

const recovery = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  commitData: vi.fn(),
  persistence: null as Record<string, unknown> | null,
}));

vi.stubGlobal('indexedDB', createFakeIndexedDB());
vi.mock('@/tools/video-editor/hooks/useTimelineCommit.ts', () => ({
  useTimelineCommit: () => recovery.data,
}));
vi.mock('@/tools/video-editor/hooks/useTimelinePersistence.ts', () => ({
  useTimelinePersistence: () => recovery.persistence,
}));
vi.mock('@/tools/video-editor/hooks/usePollSync.ts', () => ({ usePollSync: vi.fn() }));
vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useVideoEditorRuntime: () => ({ timelineId: 'session-new', assetResolver: undefined, shots: {} }),
}));

import { useTimelineSave } from './useTimelineSave.ts';
import { createTimelineStore } from './timelineStore.ts';
import { createInteractionState } from '@/tools/video-editor/lib/interaction-state.ts';

describe('useTimelineSave stable occurrence recovery', () => {
  const recoveryKey = 'parent:shot:occurrence';
  const config: TimelineConfig = {
    ...createDefaultTimelineConfig(),
    clips: [{ id: 'recovered-clip', track: 'V1', clipType: 'hold', at: 0, hold: 2 }],
  };
  const registry = { assets: {} };

  beforeEach(async () => {
    resetFakeIndexedDB();
    recovery.commitData.mockReset();
    recovery.data = null;
    recovery.persistence = null;
    await clearTimelineDraft(recoveryKey);
  });

  it('shows a hydrated draft as dirty/retryable and retries it without another edit', async () => {
    const stableSignature = getStableConfigSignature(config, registry);
    recovery.data = {
      data: {
        config,
        registry,
        stableSignature,
        dataRef: { current: { config, registry, stableSignature } },
      },
      dataRef: { current: { config, registry, stableSignature } },
      selectedClipId: null,
      selectedTrackId: null,
      setSelectedTrackId: vi.fn(),
      applyEdit: vi.fn(),
      patchRegistry: vi.fn(),
      unpatchRegistry: vi.fn(),
      commitData: recovery.commitData,
      editSeqRef: { current: 0 },
      pendingOpsRef: { current: 0 },
      selectedClipIdRef: { current: null },
      selectedTrackIdRef: { current: null },
    };
    const reloadFromServer = vi.fn(async () => { await clearTimelineDraft(recoveryKey); });
    reloadFromServer.mockRejectedValueOnce(new Error('canonical reload failed'));
    recovery.persistence = {
      scheduleSave: vi.fn(),
      resumeDeferredRecoverySave: vi.fn(),
      clearDeferredRecoverySave: vi.fn(),
      flushPendingSave: vi.fn(async () => 1),
      saveStatus: 'saved',
      isConflictExhausted: false,
      schemaIncompatible: null,
      isSavingRef: { current: false },
      reloadFromServer,
      retrySaveAfterConflict: vi.fn(),
      watchdogTripped: false,
      watchdogReason: null,
      retryWatchdog: vi.fn(),
      loadedBundleRef: { current: null },
    };
    const provider = {
      getTimelineDraftRecoveryMetadata: vi.fn(() => ({ recoveryKey })),
      resolveAssetUrl: async (file: string) => file,
    } as unknown as DataProvider;
    await saveTimelineDraft('old-session', { config, registry }, 7, {
      recoveryKey,
      draftIdentity: 'pending-publication',
    });
    const store = createTimelineStore();
    const queries = { timelineQuery: { isLoading: false } } as never;
    const hook = renderHook(() => useTimelineSave(queries, provider, {
      current: createInteractionState(),
    }, store));

    await waitFor(() => expect(hook.result.current.recoveryDraft).toMatchObject({ baseVersion: 7 }));
    expect(provider.getTimelineDraftRecoveryMetadata).toHaveBeenCalledWith('session-new');
    expect(hook.result.current.saveStatus).toBe('dirty');
    expect(await loadTimelineDraft(recoveryKey)).not.toBeNull();

    await act(async () => { await hook.result.current.retryRecoveredDraft(); });
    expect(recovery.commitData).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ clips: config.clips }) }),
      { save: true },
    );
    // Recovery stays visible until the save-success acknowledgement.
    expect(hook.result.current.recoveryDraft).toMatchObject({ baseVersion: 7 });
    expect(await loadTimelineDraft(recoveryKey)).not.toBeNull();

    await act(async () => {
      await expect(hook.result.current.reloadFromServer()).rejects.toThrow('canonical reload failed');
    });
    expect(hook.result.current.recoveryDraft).toMatchObject({ baseVersion: 7 });
    expect(hook.result.current.saveStatus).toBe('dirty');
    expect(await loadTimelineDraft(recoveryKey)).not.toBeNull();

    await act(async () => { await hook.result.current.discardRecoveredDraft(); });
    expect(reloadFromServer).toHaveBeenLastCalledWith({ clearDraft: true });
    expect(hook.result.current.recoveryDraft).toBeNull();
    expect(hook.result.current.saveStatus).toBe('saved');
    expect(await loadTimelineDraft(recoveryKey)).toBeNull();
  });
});
