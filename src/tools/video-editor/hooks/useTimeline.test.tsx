// @vitest-environment jsdom
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useTimeline } from '@/tools/video-editor/hooks/useTimeline.ts';
import type { DataProvider, TimelineSaveReceipt } from '@/tools/video-editor/data/DataProvider.ts';
import type { AudioLanePresentation } from '@/tools/video-editor/data/audioLanePresentation.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useTimeline', () => {
  it('drops the old projection during an optimistic edit and adopts the matching revision after reload', async () => {
    const config = createDefaultTimelineConfig();
    const firstHead = { projectId: 'project-1', timelineId: 'timeline-1', headRevisionId: 'revision-1' };
    const secondHead = { ...firstHead, headRevisionId: 'revision-2' };
    const firstProjection: AudioLanePresentation = {
      status: 'no-bed',
      binding: {
        projectId: 'project-1', timelineId: 'timeline-1',
        revisionId: 'revision-1', snapshotDigest: 'snapshot-1',
      },
      lane: null,
    };
    const secondProjection: AudioLanePresentation = {
      ...firstProjection,
      binding: { ...firstProjection.binding, revisionId: 'revision-2', snapshotDigest: 'snapshot-2' },
    };
    let resolveSave!: (receipt: TimelineSaveReceipt) => void;
    const savePending = new Promise<TimelineSaveReceipt>((resolve) => { resolveSave = resolve; });
    let loadCount = 0;
    const provider: DataProvider = {
      persistenceEnabled: true,
      loadTimeline: vi.fn(async () => {
        loadCount += 1;
        return {
          config,
          configVersion: loadCount,
          head: loadCount === 1 ? firstHead : secondHead,
          audioLanePresentation: loadCount === 1 ? firstProjection : secondProjection,
        };
      }),
      saveTimeline: vi.fn(async () => 2),
      saveTimelineAtHead: vi.fn(async () => savePending),
      loadAssetRegistry: vi.fn(async () => ({ assets: {} })),
      resolveAssetUrl: vi.fn(async (file: string) => file),
    };
    const hook = renderHook(() => useTimeline(provider, 'timeline-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(hook.result.current.audioLanePresentation).toEqual(firstProjection));

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = hook.result.current.saveTimeline.mutateAsync({
        ...config,
        output: { ...config.output, file: 'edited.mp4' },
      });
    });
    await waitFor(() => expect(hook.result.current.audioLanePresentation).toBeUndefined());

    await act(async () => {
      resolveSave({ configVersion: 2, head: secondHead });
      await mutation;
    });
    await waitFor(() => expect(hook.result.current.audioLanePresentation).toEqual(secondProjection));
  });

  it('suppresses direct saveTimeline mutations when provider persistence is disabled', async () => {
    const config = createDefaultTimelineConfig();
    const provider: DataProvider = {
      persistenceEnabled: false,
      loadTimeline: vi.fn(async () => ({ config, configVersion: 7 })),
      saveTimeline: vi.fn(async () => 8),
      loadAssetRegistry: vi.fn(async () => ({ assets: {} })),
      resolveAssetUrl: vi.fn(async (file: string) => file),
    };

    const hook = renderHook(
      () => useTimeline(provider, 'timeline-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(hook.result.current.data).toEqual(config));

    await act(async () => {
      await hook.result.current.saveTimeline.mutateAsync({
        ...config,
        output: { ...config.output, file: 'read-only.mp4' },
      });
    });

    expect(provider.saveTimeline).not.toHaveBeenCalled();
  });
});
