import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { GenerationDropData } from '@/shared/lib/dnd/dragDrop.ts';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError.ts';
import { getMediaUrl, getThumbnailUrl } from '@/shared/lib/media/mediaTypeHelpers.ts';
import { uploadBlobToStorage, uploadImageToStorage } from '@/shared/lib/media/imageUploader.ts';
import { extractVideoMetadata } from '@/shared/lib/media/videoMetadata.ts';
import { extractVideoPosterFrame } from '@/shared/lib/media/videoPosterExtractor.ts';
import { generateClientThumbnail, uploadImageWithThumbnail } from '@/shared/media/clientThumbnailGenerator.ts';
import type { SelectClipOptions } from '@/shared/state/selectionStore.ts';
import { createExternalUploadGeneration } from '@/integrations/supabase/repositories/generationMutationsRepository.ts';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import {
  previewPreparedMediaCommand,
  type PlacePreparedMediaCommand,
} from '@/tools/video-editor/commands/media.ts';
import { buildSelectedProjectMediaAddCommand, readSelectedProjectMediaIdentity } from '@/tools/video-editor/commands/selectedProjectMedia.ts';
import {
  assertRuntimeMediaImportSize,
  type PreparedMediaImport,
} from '@/tools/video-editor/data/AssetResolver.ts';
import type { TimelineProvisionedAsset } from '@/tools/video-editor/commands/provisioning.ts';
import {
  type TimelineData,
} from '@/tools/video-editor/lib/timeline-data.ts';
import {
  buildAssetDropEdit,
  estimateAssetDuration,
  getPlayableAssetKind,
  planAssetDropTarget,
  planGenerationAssetRegistration,
} from '@/tools/video-editor/lib/timeline-asset-plans.ts';
import type {
  TimelineApplyEdit,
  TimelineInvalidateAssetRegistry,
  TimelinePatchRegistry,
} from '@/tools/video-editor/hooks/timeline-state-types.ts';
import type { TimelineStoreApi } from '@/tools/video-editor/hooks/timelineStore.ts';

type UploadedGenerationData = GenerationDropData & {
  assetId?: string;
  durationSeconds?: number;
  mediaImport?: PreparedMediaImport;
};

type UploadedGenerationResult = {
  generationId: string;
  variantId?: string;
  variantType: 'image' | 'video';
  assetId?: string;
  imageUrl: string;
  thumbUrl?: string;
  durationSeconds?: number;
  metadata: {
    content_type: string;
    original_filename: string;
  };
  mediaImport?: PreparedMediaImport;
};

export interface UseAssetManagementArgs {
  store?: TimelineStoreApi;
  dataRef: MutableRefObject<TimelineData | null>;
  selectedTrackId: string | null;
  selectedProjectId: string | null;
  selectClip: (clipId: string, opts?: SelectClipOptions) => void;
  setSelectedTrackId: Dispatch<SetStateAction<string | null>>;
  applyEdit: TimelineApplyEdit;
  patchRegistry: TimelinePatchRegistry;
  invalidateAssetRegistry: TimelineInvalidateAssetRegistry;
  resolveAssetUrl: (file: string) => Promise<string>;
}

export interface UseAssetManagementResult {
  prepareGenerationAsset: (data: UploadedGenerationData | null) => TimelineProvisionedAsset | null;
  registerGenerationAsset: (data: UploadedGenerationData | null) => string | null;
  uploadImageGeneration: (file: File) => Promise<UploadedGenerationResult>;
  uploadVideoGeneration: (file: File) => Promise<UploadedGenerationResult>;
  handleAssetDrop: (
    assetKey: string,
    trackId: string | undefined,
    time: number,
    forceNewTrack?: boolean,
    insertAtTop?: boolean,
    preparedAsset?: TimelineProvisionedAsset,
    removeClipId?: string,
  ) => boolean;
}

export interface AssetDropTargetResolution {
  current: TimelineData;
  trackId: string;
  snappedTime?: number;
}

export function buildPlacePreparedMediaCommand({
  prepared,
  trackId,
  selectedTrackId,
  time,
  forceNewTrack,
  insertAtTop,
  removeClipId,
}: {
  prepared: TimelineProvisionedAsset;
  trackId?: string;
  selectedTrackId?: string | null;
  time: number;
  forceNewTrack: boolean;
  insertAtTop: boolean;
  removeClipId?: string;
}): PlacePreparedMediaCommand {
  return {
    type: 'place-prepared-media',
    payload: {
      asset: prepared,
      ...(trackId !== undefined ? { trackId } : {}),
      ...(selectedTrackId !== undefined ? { selectedTrackId } : {}),
      at: time,
      forceNewTrack,
      insertAtTop,
      ...(removeClipId !== undefined ? { removeClipId } : {}),
    },
  };
}

export { buildAssetDropEdit };
export type { BuildAssetDropEditResult } from '@/tools/video-editor/lib/timeline-asset-plans.ts';

export function resolveAssetDropTarget({
  dataRef,
  assetKind,
  trackId,
  selectedTrackId,
  forceNewTrack = false,
  insertAtTop = false,
  time,
  duration,
}: {
  dataRef: MutableRefObject<TimelineData | null>;
  assetKind: 'audio' | 'visual';
  trackId: string | undefined;
  selectedTrackId: string | null;
  forceNewTrack?: boolean;
  insertAtTop?: boolean;
  time?: number;
  duration?: number;
}): AssetDropTargetResolution | null {
  const plan = planAssetDropTarget({
    current: dataRef.current,
    assetKind,
    trackId,
    selectedTrackId,
    forceNewTrack,
    insertAtTop,
    time,
    duration,
  });
  if (!plan.ok) {
    return null;
  }

  dataRef.current = plan.preparedCurrent;
  return {
    current: plan.preparedCurrent,
    trackId: plan.trackId,
    ...(plan.snappedTime !== undefined ? { snappedTime: plan.snappedTime } : {}),
  };
}

export function useAssetManagement({
  store,
  dataRef,
  selectedTrackId,
  selectedProjectId,
  selectClip,
  setSelectedTrackId,
  applyEdit,
  patchRegistry,
}: UseAssetManagementArgs): UseAssetManagementResult {
  const runtime = useVideoEditorRuntime();
  const getDataRef = useCallback(() => {
    const storeDataRef = store?.getState().data.dataRef;
    return storeDataRef && storeDataRef.current !== null ? storeDataRef : dataRef;
  }, [dataRef, store]);
  const getSelectedTrackId = useCallback(() => {
    return store?.getState().data.selectedTrackId ?? selectedTrackId;
  }, [selectedTrackId, store]);
  const getPatchRegistry = useCallback(() => {
    return store?.getState().ops.patchRegistry ?? patchRegistry;
  }, [patchRegistry, store]);
  const getApplyEdit = useCallback(() => {
    return store?.getState().ops.applyEdit ?? applyEdit;
  }, [applyEdit, store]);
  const getSelectClip = useCallback(() => {
    return store?.getState().ops.selectClip ?? selectClip;
  }, [selectClip, store]);
  const getSetSelectedTrackId = useCallback(() => {
    return store?.getState().ops.setSelectedTrackId ?? setSelectedTrackId;
  }, [setSelectedTrackId, store]);

  const prepareGenerationAsset = useCallback((generationData: UploadedGenerationData | null): TimelineProvisionedAsset | null => {
    if (!generationData) {
      return null;
    }

    const imageUrl = getMediaUrl(generationData) ?? generationData.mediaImport?.entry.file;
    if (!imageUrl) {
      return null;
    }
    const candidateSelection = readSelectedProjectMediaIdentity(
      generationData.mediaImport?.selectedMedia ?? generationData.selectedMedia,
    );
    const declaredAssetId = generationData.assetId ?? generationData.mediaImport?.assetId;
    const declaredVariantId = generationData.variantId ?? generationData.mediaImport?.variantId;
    const selectedMedia = candidateSelection
      && candidateSelection.generation_id === generationData.generationId
      && (!declaredVariantId || candidateSelection.variant_id === declaredVariantId)
      && (!declaredAssetId || candidateSelection.asset === declaredAssetId)
      && (!generationData.mediaId || candidateSelection.object_id === generationData.mediaId)
      && (!generationData.mediaImport || (
        generationData.mediaImport.project === selectedProjectId
        && candidateSelection.asset === generationData.mediaImport.assetId
        && candidateSelection.generation_id === generationData.mediaImport.generationId
        && candidateSelection.variant_id === generationData.mediaImport.variantId
      ))
      ? candidateSelection
      : undefined;
    const plan = planGenerationAssetRegistration({
      generationId: generationData.generationId,
      assetId: generationData.assetId ?? generationData.mediaImport?.assetId ?? selectedMedia?.asset,
      variantId: generationData.variantId ?? selectedMedia?.variant_id,
      variantType: generationData.variantType,
      mediaId: generationData.mediaId ?? generationData.mediaImport?.assetId ?? selectedMedia?.object_id,
      imageUrl,
      thumbUrl: getThumbnailUrl(generationData),
      assetDurationSeconds: generationData.durationSeconds,
      metadata: generationData.metadata,
    });
    if (!plan.ok) {
      console.warn('[video-editor] Skipping generation asset registration because media URL is empty', {
        generationId: generationData.generationId,
        variantId: generationData.variantId,
        variantType: generationData.variantType,
      });
      return null;
    }

    const assetEntry = generationData.mediaImport
      ? {
          ...generationData.mediaImport.entry,
          generationId: generationData.mediaImport.generationId,
          variantId: generationData.mediaImport.variantId,
        }
      : plan.assetEntry;
    const playableKind = getPlayableAssetKind(assetEntry);
    if (!playableKind) {
      return null;
    }

    return {
      assetKey: plan.assetId,
      mediaType: playableKind,
      durationSeconds: assetEntry.duration ?? null,
      entry: assetEntry,
      source: 'registered',
      ...(selectedMedia ? { selectedMedia } : {}),
    };
  }, [selectedProjectId]);

  const registerGenerationAsset = useCallback((generationData: UploadedGenerationData | null) => {
    const prepared = prepareGenerationAsset(generationData);
    if (!prepared) {
      return null;
    }

    const assetKey = prepared.assetKey;
    // Registry-only generation enrichment is still an editor mutation. The
    // commit layer owns the queued CAS save; do not start a competing provider
    // registration that can race the following clip mutation.
    getPatchRegistry()(assetKey, prepared.entry, prepared.entry.file);

    return assetKey;
  }, [getPatchRegistry, prepareGenerationAsset]);

  const placePreparedAsset = useCallback((
    prepared: TimelineProvisionedAsset,
    trackId: string | undefined,
    time: number,
    forceNewTrack: boolean,
    insertAtTop: boolean,
    removeClipId?: string,
  ) => {
    const latestDataRef = getDataRef();
    const current = latestDataRef.current;
    if (!current) {
      return false;
    }

    const command = buildPlacePreparedMediaCommand({
      prepared,
      trackId,
      selectedTrackId: getSelectedTrackId(),
      time,
      forceNewTrack,
      insertAtTop,
      removeClipId,
    });
    const preview = previewPreparedMediaCommand(current, command);
    if (!preview?.commandResult?.detail) {
      return false;
    }
    const clipId = typeof preview.commandResult.detail.clipId === 'string'
      ? preview.commandResult.detail.clipId
      : null;
    const resolvedTrackId = typeof preview.commandResult.detail.trackId === 'string'
      ? preview.commandResult.detail.trackId
      : trackId ?? null;
    if (!clipId || !resolvedTrackId) {
      return false;
    }

    const insertedClip = preview.nextData.config.clips.find((clip) => clip.id === clipId);
    const track = current.config.tracks?.find((candidate) => candidate.id === resolvedTrackId);
    const insertedDuration = insertedClip && typeof insertedClip.hold === 'number'
      ? insertedClip.hold
      : insertedClip && typeof insertedClip.from === 'number' && typeof insertedClip.to === 'number'
        ? insertedClip.to - insertedClip.from
        : null;
    const editCommand = prepared.selectedMedia && insertedClip && track
      && typeof insertedClip.at === 'number' && insertedDuration !== null
      ? buildSelectedProjectMediaAddCommand({
          selection: prepared.selectedMedia,
          assetKey: prepared.assetKey,
          mediaType: prepared.mediaType,
          trackId: resolvedTrackId,
          trackKind: track.kind,
          clipId,
          at: insertedClip.at,
          durationSeconds: insertedDuration,
          intrinsicDurationSeconds: prepared.durationSeconds,
          existingTrackIds: current.config.tracks?.map((candidate) => candidate.id) ?? [],
          existingClipIds: current.config.clips.map((clip) => clip.id),
        })
      : undefined;

    getApplyEdit()({ type: 'prepared-media', command }, {
      selectedClipId: clipId,
      selectedTrackId: resolvedTrackId,
      semantic: true,
      ...(editCommand ? { editCommands: [editCommand] } : {}),
    });
    return true;
  }, [getApplyEdit, getDataRef, getSelectedTrackId]);

  const handleAssetDrop = useCallback((assetKey: string, trackId: string | undefined, time: number, forceNewTrack = false, insertAtTop = false, preparedAsset?: TimelineProvisionedAsset, removeClipId?: string) => {
    if (preparedAsset) {
      return placePreparedAsset(preparedAsset, trackId, time, forceNewTrack, insertAtTop, removeClipId);
    }

    const latestDataRef = getDataRef();
    const current = latestDataRef.current;
    const assetEntry = current?.registry.assets[assetKey];
    const playableKind = getPlayableAssetKind(assetEntry);
    if (!assetEntry || !playableKind) {
      runtime.toast.error('Only image, video, and audio assets can be added to the timeline');
      return false;
    }
    const assetKind = playableKind === 'audio' ? 'audio' : 'visual';
    const duration = estimateAssetDuration(assetEntry, assetKind);
    const targetPlan = planAssetDropTarget({
      current,
      assetKind,
      trackId,
      selectedTrackId: getSelectedTrackId(),
      forceNewTrack,
      insertAtTop,
      time,
      duration,
    });
    if (!targetPlan.ok) {
      return false;
    }
    const resolvedTarget = {
      current: targetPlan.preparedCurrent,
      trackId: targetPlan.trackId,
      snappedTime: targetPlan.snappedTime,
    };
    const nextEdit = buildAssetDropEdit({
      current: resolvedTarget.current,
      assetKey,
      trackId: resolvedTarget.trackId,
      time: resolvedTarget.snappedTime ?? time,
    });
    if (!nextEdit) {
      return false;
    }
    latestDataRef.current = resolvedTarget.current;
    getApplyEdit()({
      type: 'rows',
      rows: nextEdit.rows,
      metaUpdates: nextEdit.metaUpdates,
      clipOrderOverride: nextEdit.clipOrderOverride,
    });
    getSelectClip()(nextEdit.clipId);
    getSetSelectedTrackId()(resolvedTarget.trackId);
    return true;
  }, [getApplyEdit, getDataRef, getSelectedTrackId, getSelectClip, getSetSelectedTrackId, placePreparedAsset, runtime.toast]);

  const uploadImageGeneration = useCallback(async (file: File) => {
    if (!selectedProjectId) {
      throw new Error('External image drop requires a selected project');
    }

    const runtimeMediaImport = runtime.provider.prepareMediaImport;
    if (runtimeMediaImport) {
      assertRuntimeMediaImportSize(file);
      const mediaImport = await runtimeMediaImport.call(runtime.provider, file, {
        filename: file.name,
        mediaType: file.type || 'image/png',
      });
      if (mediaImport.provider !== 'runtime') {
        throw new Error('The media import provider returned a non-Runtime descriptor');
      }
      if (selectedProjectId && mediaImport.project !== selectedProjectId) {
        throw new Error('Runtime media import belongs to a different project');
      }
      const imageUrl = mediaImport.entry.file ?? await runtime.provider.resolveAssetUrl(mediaImport.assetId);
      return {
        generationId: mediaImport.generationId,
        variantId: mediaImport.variantId,
        variantType: 'image' as const,
        assetId: mediaImport.assetId,
        imageUrl,
        metadata: {
          content_type: file.type || 'image/png',
          original_filename: file.name,
        },
        mediaImport,
      };
    }

    if (runtime.provider.supportsDirectAssetUpload === true) {
      throw new Error('This editor backend does not support Runtime image/video imports');
    }

    let imageUrl = '';
    let thumbnailUrl = '';

    try {
      const thumbnailResult = await generateClientThumbnail(file, 300, 0.8);
      const uploadResult = await uploadImageWithThumbnail(file, thumbnailResult.thumbnailBlob);
      imageUrl = uploadResult.imageUrl;
      thumbnailUrl = uploadResult.thumbnailUrl;
    } catch (error) {
      normalizeAndPresentError(error, { context: `video-editor:external-drop:${file.name}`, showToast: false });
      imageUrl = await uploadImageToStorage(file, 3);
      thumbnailUrl = imageUrl;
    }

    const generation = await createExternalUploadGeneration({
      imageUrl,
      thumbnailUrl,
      fileType: 'image',
      projectId: selectedProjectId,
      generationParams: {
        prompt: `Uploaded ${file.name}`,
        extra: {
          source: 'external_upload',
          original_filename: file.name,
          file_type: file.type || 'image',
          file_size: file.size,
        },
      },
    });

    return {
      generationId: generation.id,
      variantType: 'image' as const,
      imageUrl,
      thumbUrl: thumbnailUrl,
      metadata: {
        content_type: file.type || 'image',
        original_filename: file.name,
      },
    };
  }, [runtime.provider, selectedProjectId]);

  const uploadVideoGeneration = useCallback(async (file: File) => {
    if (!selectedProjectId) {
      throw new Error('No project selected');
    }

    let durationSeconds: number | undefined;
    try {
      const metadata = await extractVideoMetadata(file);
      durationSeconds = metadata.duration_seconds;
    } catch (error) {
      normalizeAndPresentError(error, { context: `video-editor:external-video-metadata:${file.name}`, showToast: false });
    }

    const runtimeMediaImport = runtime.provider.prepareMediaImport;
    if (runtimeMediaImport) {
      assertRuntimeMediaImportSize(file);
      const mediaImport = await runtimeMediaImport.call(runtime.provider, file, {
        filename: file.name,
        mediaType: file.type || 'video/mp4',
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      });
      if (mediaImport.provider !== 'runtime') {
        throw new Error('The media import provider returned a non-Runtime descriptor');
      }
      if (selectedProjectId && mediaImport.project !== selectedProjectId) {
        throw new Error('Runtime media import belongs to a different project');
      }
      const videoUrl = mediaImport.entry.file ?? await runtime.provider.resolveAssetUrl(mediaImport.assetId);
      return {
        generationId: mediaImport.generationId,
        variantId: mediaImport.variantId,
        variantType: 'video' as const,
        assetId: mediaImport.assetId,
        imageUrl: videoUrl,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        metadata: {
          content_type: file.type || 'video/mp4',
          original_filename: file.name,
        },
        mediaImport,
      };
    }

    if (runtime.provider.supportsDirectAssetUpload === true) {
      throw new Error('This editor backend does not support Runtime image/video imports');
    }

    const videoUrl = await uploadImageToStorage(file);

    let thumbnailUrl = videoUrl;
    try {
      const thumbnailBlob = await extractVideoPosterFrame(file);
      thumbnailUrl = await uploadBlobToStorage(thumbnailBlob, 'thumbnail.jpg', 'image/jpeg');
    } catch (error) {
      normalizeAndPresentError(error, { context: `video-editor:external-video-thumbnail:${file.name}`, showToast: false });
    }

    const generation = await createExternalUploadGeneration({
      imageUrl: videoUrl,
      thumbnailUrl,
      fileType: 'video',
      projectId: selectedProjectId,
      generationParams: {
        prompt: file.name.replace(/\.[^.]+$/, ''),
        extra: {
          source: 'external_upload',
          original_filename: file.name,
          file_type: file.type || 'video/mp4',
          file_size: file.size,
        },
      },
    });

    return {
      generationId: generation.id,
      variantType: 'video' as const,
      imageUrl: videoUrl,
      thumbUrl: thumbnailUrl,
      durationSeconds,
      metadata: {
        content_type: file.type || 'video/mp4',
        original_filename: file.name,
      },
    };
  }, [runtime.provider, selectedProjectId]);

  return {
    prepareGenerationAsset,
    registerGenerationAsset,
    uploadImageGeneration,
    uploadVideoGeneration,
    handleAssetDrop,
  };
}
