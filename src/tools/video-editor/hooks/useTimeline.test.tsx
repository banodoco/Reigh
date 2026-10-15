// @vitest-environment jsdom
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useTimeline } from '@/tools/video-editor/hooks/useTimeline.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
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

describe('standalone snapshot writer explicit fallback', () => {
  it('passes its captured head without inventing command intent from a replacement config', async () => {
    const config = createDefaultTimelineConfig();
    const head = { projectId: 'project', timelineId: 'timeline-1', headRevisionId: 'r1' };
    const saveTimelineAtHead = vi.fn(async () => ({ configVersion: 8, head: { ...head, headRevisionId: 'r2' } }));
    const saveTimeline = vi.fn();
    const provider: DataProvider = {
      loadTimeline: vi.fn(async () => ({ config, configVersion: 7, head })),
      loadAssetRegistry: vi.fn(async () => ({ assets: {} })), resolveAssetUrl: vi.fn(async (file) => file),
      saveTimeline, saveTimelineAtHead,
    };
    const h = renderHook(() => useTimeline(provider, 'timeline-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(h.result.current.data).toEqual(config));
    const next = { ...config, app: { customMetadata: 'fallback' } };
    await act(async () => { await h.result.current.saveTimeline.mutateAsync(next); });
    expect(saveTimelineAtHead).toHaveBeenCalledOnce();
    expect(saveTimelineAtHead).toHaveBeenCalledWith('timeline-1', next, head);
    expect(saveTimeline).not.toHaveBeenCalled();
    h.unmount();
  });
});
