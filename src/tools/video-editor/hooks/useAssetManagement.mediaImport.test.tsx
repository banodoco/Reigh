// @vitest-environment jsdom

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  VideoEditorRuntimeProvider,
  type VideoEditorRuntimeContextValue,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { useAssetManagement } from './useAssetManagement';
import { RUNTIME_MEDIA_IMPORT_MAX_BYTES } from '@/tools/video-editor/data/AssetResolver.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';

const extractVideoMetadataMock = vi.fn();

vi.mock('@/shared/lib/media/videoMetadata.ts', () => ({
  extractVideoMetadata: (...args: unknown[]) => extractVideoMetadataMock(...args),
}));

function buildRuntimeValue(provider: Record<string, unknown>): VideoEditorRuntimeContextValue {
  return {
    provider: provider as VideoEditorRuntimeContextValue['provider'],
    assetResolver: { resolveAssetUrl: vi.fn() },
    auth: {} as VideoEditorRuntimeContextValue['auth'],
    project: {} as VideoEditorRuntimeContextValue['project'],
    shots: {} as VideoEditorRuntimeContextValue['shots'],
    mediaLightbox: {} as VideoEditorRuntimeContextValue['mediaLightbox'],
    agentChat: {} as VideoEditorRuntimeContextValue['agentChat'],
    toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
    telemetry: {} as VideoEditorRuntimeContextValue['telemetry'],
    timelineId: 'timeline-1',
    userId: null,
    extensions: {} as VideoEditorRuntimeContextValue['extensions'],
  };
}

function buildTimelineData(): TimelineData {
  const entry = { src: 'https://example.com/asset.mp4', file: 'https://example.com/asset.mp4', type: 'video/mp4', duration: 4 };
  return {
    config: {
      output: { width: 1280, height: 720, fps: 30 },
      tracks: [{ id: 'V1', kind: 'visual' }],
      clips: [],
      registry: { assets: { asset1: entry } },
    },
    configVersion: 1,
    registry: { assets: { asset1: entry } },
    resolvedConfig: {
      output: { width: 1280, height: 720, fps: 30 },
      tracks: [{ id: 'V1', kind: 'visual' }],
      clips: [],
      registry: { asset1: entry },
    },
    rows: [{ id: 'V1', actions: [] }],
    meta: {},
    effects: {},
    assetMap: {},
    output: { width: 1280, height: 720, fps: 30 },
    tracks: [{ id: 'V1', kind: 'visual' }],
    clipOrder: { V1: [] },
    signature: 'sig',
    stableSignature: 'stable',
  } as unknown as TimelineData;
}

function buildArgs(data: TimelineData | null = null, applyEdit = vi.fn()) {
  return {
    dataRef: { current: data },
    selectedTrackId: null,
    selectedProjectId: 'runtime-project-id',
    selectClip: vi.fn(),
    setSelectedTrackId: vi.fn(),
    applyEdit,
    patchRegistry: vi.fn(),
    uploadAsset: vi.fn(),
    invalidateAssetRegistry: vi.fn(),
    resolveAssetUrl: vi.fn(async (file: string) => file),
  };
}

function renderAssetManagement(provider: Record<string, unknown>, args = buildArgs()) {
  return renderHook(() => useAssetManagement(args), {
    wrapper: ({ children }) => (
      <VideoEditorRuntimeProvider value={buildRuntimeValue(provider)}>
        {children}
      </VideoEditorRuntimeProvider>
    ),
  });
}

describe('useAssetManagement Runtime media imports', () => {
  it('uses one Runtime import identity for image and video drops', async () => {
    extractVideoMetadataMock.mockResolvedValue({ duration_seconds: 2.5 });
    const prepareMediaImport = vi.fn()
      .mockResolvedValueOnce({
        provider: 'runtime',
        project: 'runtime-project-id',
        importOperationId: 'operation-image',
        generationId: 'generation-image',
        variantId: 'variant-image',
        assetId: 'sha256:image',
        entry: { file: 'https://runtime.test/image', type: 'image/png' },
      })
      .mockResolvedValueOnce({
        provider: 'runtime',
        project: 'runtime-project-id',
        importOperationId: 'operation-video',
        generationId: 'generation-video',
        variantId: 'variant-video',
        assetId: 'sha256:video',
        entry: { file: 'https://runtime.test/video', type: 'video/mp4', duration: 2.5 },
      });
    const { result } = renderAssetManagement({
      supportsDirectAssetUpload: true,
      prepareMediaImport,
      resolveAssetUrl: vi.fn(),
    });

    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    await act(async () => {
      await result.current.uploadImageGeneration(image);
      await result.current.uploadVideoGeneration(video);
    });

    expect(prepareMediaImport).toHaveBeenNthCalledWith(1, image, {
      filename: 'frame.png',
      mediaType: 'image/png',
    });
    expect(prepareMediaImport).toHaveBeenNthCalledWith(2, video, {
      filename: 'clip.mp4',
      mediaType: 'video/mp4',
      durationSeconds: 2.5,
    });
  });

  it('rejects an oversized Runtime import before invoking the provider', async () => {
    const prepareMediaImport = vi.fn();
    const { result } = renderAssetManagement({
      supportsDirectAssetUpload: true,
      prepareMediaImport,
      resolveAssetUrl: vi.fn(),
    });
    const oversizedImage = new File(['image'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(oversizedImage, 'size', { value: RUNTIME_MEDIA_IMPORT_MAX_BYTES + 1 });

    await expect(result.current.uploadImageGeneration(oversizedImage)).rejects.toThrow(
      'huge.png exceeds the Workspace Runtime media limit of 5 GiB',
    );
    expect(prepareMediaImport).not.toHaveBeenCalled();
  });

  it('carries the exact Runtime selection from media import through a timeline drop OpCall', async () => {
    extractVideoMetadataMock.mockResolvedValue({ duration_seconds: 2.5 });
    const selection = {
      asset: 'asset-selected',
      generation_id: 'generation-selected',
      variant_id: 'variant-selected',
      object_id: `sha256:${'a'.repeat(64)}`,
      catalog_digest: `sha256:${'b'.repeat(64)}`,
    };
    const mediaImport = {
      provider: 'runtime',
      project: 'runtime-project-id',
      importOperationId: 'operation-selected',
      generationId: 'generation-selected',
      variantId: 'variant-selected',
      assetId: 'asset-selected',
      entry: { file: 'https://runtime.test/selected.mp4', type: 'video/mp4', duration: 2.5 },
      selectedMedia: selection,
    };
    const applyEdit = vi.fn();
    const prepareMediaImport = vi.fn().mockResolvedValue(mediaImport);
    const { result } = renderAssetManagement({
      supportsDirectAssetUpload: true,
      prepareMediaImport,
      resolveAssetUrl: vi.fn(),
    }, buildArgs(buildTimelineData(), applyEdit));

    const uploaded = await result.current.uploadVideoGeneration(new File(['video'], 'selected.mp4', { type: 'video/mp4' }));
    const prepared = result.current.prepareGenerationAsset(uploaded);
    expect(prepared?.selectedMedia).toBe(selection);
    expect(prepared?.assetKey).toBe(selection.asset);

    expect(result.current.handleAssetDrop(prepared!.assetKey, 'V1', 1.5, false, false, prepared!)).toBe(true);
    expect(applyEdit).toHaveBeenCalledTimes(1);
    const [mutation, options] = applyEdit.mock.calls[0];
    expect(mutation.type).toBe('prepared-media');
    expect(options.editCommands).toHaveLength(1);
    const [editCommand] = options.editCommands;
    expect(editCommand).toMatchObject({
      op: 'timeline.add',
      select: 'parent/track:V1',
      args: { media: selection, at: 1.5, duration: 2.5 },
      created: [expect.stringMatching(/^parent\/clip:/)],
    });
    expect(editCommand.expect).toEqual({
      [`${editCommand.created[0]}::`]: { state: 'absent' },
    });
  });

  it('fails closed for a direct Bridge provider instead of using the legacy generation writer', async () => {
    const { result } = renderAssetManagement({
      supportsDirectAssetUpload: true,
      resolveAssetUrl: vi.fn(),
    });
    const image = new File(['image'], 'frame.png', { type: 'image/png' });

    await expect(result.current.uploadImageGeneration(image)).rejects.toThrow(
      'This editor backend does not support Runtime image/video imports',
    );
  });
});
