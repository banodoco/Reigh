// @vitest-environment jsdom

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  VideoEditorRuntimeProvider,
  type VideoEditorRuntimeContextValue,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { useAssetManagement } from './useAssetManagement';
import { handleFileDrop } from '@/tools/video-editor/lib/external-drop-utils.ts';
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
      'parent::registry.assets.asset-selected': { state: 'absent' },
    });
  });

  const selection = {
    asset: 'asset-selected', generation_id: 'generation-selected', variant_id: 'variant-selected',
    object_id: `sha256:${'a'.repeat(64)}`, catalog_digest: `sha256:${'b'.repeat(64)}`,
  };
  const imported = {
    provider: 'runtime', project: 'runtime-project-id', importOperationId: 'operation-selected',
    generationId: selection.generation_id, variantId: selection.variant_id, assetId: selection.asset,
    entry: { file: 'https://runtime.test/selected.mp4', type: 'video/mp4', duration: 2.5 },
  };

  it.each(['image', 'video'] as const)('reads one exact selection for a real %s file-drop placement', async (kind) => {
    extractVideoMetadataMock.mockResolvedValue({ duration_seconds: 2.5 });
    const getProjectMediaSelection = vi.fn().mockResolvedValue(selection);
    const prepareMediaImport = vi.fn().mockResolvedValue({ ...imported, entry: { file: `https://runtime.test/selected.${kind === 'image' ? 'png' : 'mp4'}`, type: `${kind}/${kind === 'image' ? 'png' : 'mp4'}`, ...(kind === 'video' ? { duration: 2.5 } : {}) } });
    const applyEdit = vi.fn();
    const args = buildArgs(buildTimelineData(), applyEdit);
    const { result } = renderAssetManagement({ prepareMediaImport, getProjectMediaSelection }, args);
    // Model the existing local uploading-row mutation before async placement.
    applyEdit.mockImplementation((mutation) => {
      if (mutation.type === 'rows' && args.dataRef.current) {
        args.dataRef.current = { ...args.dataRef.current, rows: mutation.rows,
          meta: { ...args.dataRef.current.meta, ...mutation.metaUpdates } };
      }
    });
    const pendingOpsRef = { current: 0 };
    const onAssetDropError = vi.fn();
    await act(async () => {
      await handleFileDrop({
        files: [new File(['bytes'], kind === 'image' ? 'frame.png' : 'clip.mp4', { type: kind === 'image' ? 'image/png' : 'video/mp4' })],
        dataRef: args.dataRef, pendingOpsRef,
        dropPosition: { trackId: 'V1', time: 1.5, isNewTrack: false },
        insertAtTop: false, selectedTrackId: 'V1', applyEdit,
        invalidateAssetRegistry: vi.fn(), resolveAssetUrl: args.resolveAssetUrl,
        registerGenerationAsset: result.current.registerGenerationAsset,
        prepareGenerationAsset: result.current.prepareGenerationAsset,
        uploadImageGeneration: result.current.uploadImageGeneration,
        uploadVideoGeneration: result.current.uploadVideoGeneration,
        dropAsset: result.current.handleAssetDrop,
        directAssetUploadAllFiles: true, mediaImportForImageVideo: true, onAssetDropError,
      });
    });
    await waitFor(() => expect(pendingOpsRef.current).toBe(0));
    expect(onAssetDropError).not.toHaveBeenCalled();
    expect(prepareMediaImport).toHaveBeenCalledTimes(1);
    expect(getProjectMediaSelection).toHaveBeenCalledExactlyOnceWith({
      projectId: imported.project, asset: imported.assetId,
      generationId: imported.generationId, variantId: imported.variantId,
    });
    const placements = applyEdit.mock.calls.filter(([mutation]) => mutation.type === 'prepared-media');
    expect(placements).toHaveLength(1);
    expect(placements[0][0].command.payload.asset.selectedMedia).toBe(selection);
    const commands = applyEdit.mock.calls.flatMap(([, options]) => options?.editCommands ?? []);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ op: 'timeline.add', args: { media: selection, at: 1.5 } });
    expect(commands[0].args.media).toBe(selection);
  });

  it.each([
    ['unavailable', undefined],
    ['refused', new Error('Runtime refused selection')],
    ['wrong asset', { ...selection, asset: 'other' }],
    ['wrong generation', { ...selection, generation_id: 'other' }],
    ['wrong variant', { ...selection, variant_id: 'other' }],
    ['invalid object', { ...selection, object_id: 'guessed' }],
    ['invalid digest', { ...selection, catalog_digest: 'guessed' }],
  ])('preserves compatibility placement with no fabricated OpCall when selection is %s', async (_label, response) => {
    const getProjectMediaSelection = response instanceof Error
      ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);
    const applyEdit = vi.fn();
    const { result } = renderAssetManagement({
      prepareMediaImport: vi.fn().mockResolvedValue(imported),
      ...(response !== undefined ? { getProjectMediaSelection } : {}),
    }, buildArgs(buildTimelineData(), applyEdit));
    const uploaded = await result.current.uploadVideoGeneration(new File(['video'], 'clip.mp4', { type: 'video/mp4' }));
    const prepared = result.current.prepareGenerationAsset(uploaded)!;
    expect(prepared.selectedMedia).toBeUndefined();
    expect(prepared.entry.file).toBe(imported.entry.file);
    expect(result.current.handleAssetDrop(prepared.assetKey, 'V1', 0, false, false, prepared)).toBe(true);
    expect(applyEdit).toHaveBeenCalledTimes(1);
    expect(applyEdit.mock.calls[0][1].editCommands).toBeUndefined();
    expect(getProjectMediaSelection).toHaveBeenCalledTimes(response === undefined ? 0 : 1);
  });

  it.each([selection, { ...selection, variant_id: 'other' }])('does not reread an attached matched or mismatched selection', async (attached) => {
    const getProjectMediaSelection = vi.fn();
    const { result } = renderAssetManagement({
      prepareMediaImport: vi.fn().mockResolvedValue({ ...imported, selectedMedia: attached }), getProjectMediaSelection,
    });
    const uploaded = await result.current.uploadImageGeneration(new File(['image'], 'frame.png', { type: 'image/png' }));
    expect(getProjectMediaSelection).not.toHaveBeenCalled();
    expect(result.current.prepareGenerationAsset(uploaded)?.selectedMedia).toBe(attached === selection ? selection : undefined);
  });

  it('does not query missing import selectors or gallery locators for authority', async () => {
    const getProjectMediaSelection = vi.fn();
    const { result } = renderAssetManagement({
      prepareMediaImport: vi.fn().mockResolvedValue({ ...imported, variantId: '' }), getProjectMediaSelection,
    });
    await result.current.uploadImageGeneration(new File(['image'], 'frame.png', { type: 'image/png' }));
    const prepared = result.current.prepareGenerationAsset({ generationId: 'gallery-gen', variantId: 'gallery-variant', mediaId: selection.object_id, imageUrl: 'https://runtime.test/gallery.png' });
    expect(prepared?.selectedMedia).toBeUndefined();
    expect(getProjectMediaSelection).not.toHaveBeenCalled();
  });

  it('rejects a different import project before selection IO', async () => {
    const getProjectMediaSelection = vi.fn();
    const { result } = renderAssetManagement({
      prepareMediaImport: vi.fn().mockResolvedValue({ ...imported, project: 'other-project' }), getProjectMediaSelection,
    });
    await expect(result.current.uploadImageGeneration(new File(['image'], 'frame.png', { type: 'image/png' }))).rejects.toThrow('different project');
    expect(getProjectMediaSelection).not.toHaveBeenCalled();
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
