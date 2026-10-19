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
import { buildPinnedShotGroupsOverride } from '@/tools/video-editor/lib/shot-group-commands.ts';
import type {
  TimelineApplyEdit,
  TimelineInvalidateAssetRegistry,
  TimelinePatchRegistry,
} from '@/tools/video-editor/hooks/timeline-state-types.ts';
import type { TimelineStoreApi } from '@/tools/video-editor/hooks/timelineStore.ts';
import type { SelectedProjectMediaIdentity } from '@/shared/contracts/selectedProjectMedia.ts';

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
    options?: { pinnedShotGroup?: { shotId: string; mode: 'video' } },
  ) => boolean;
}

type GenerationDropSelectionProvider = {
  getProjectMediaSelection?: (request: {
    projectId: string;
    asset: string;
    generationId: string;
    variantId: string;
  }) => Promise<SelectedProjectMediaIdentity>;
  getProjectMediaSelectionForOutput?: (request: {
    projectId: string;
    association_id: string;
    object_id: string;
    version: number;
  }) => Promise<SelectedProjectMediaIdentity>;
};

export type ManagedOutputDropBinding = {
  project_id: string | null;
  association_id: string;
  object_id: string;
  version: number;
};

const selectedMediaIdentityFields = [
  'asset',
  'generation_id',
  'variant_id',
  'object_id',
  'catalog_digest',
] as const;

function sameSelectedMediaIdentity(left: unknown, right: unknown): boolean {
  const leftIdentity = readSelectedProjectMediaIdentity(left);
  const rightIdentity = readSelectedProjectMediaIdentity(right);
  return Boolean(leftIdentity && rightIdentity && selectedMediaIdentityFields.every((field) => (
    leftIdentity[field] === rightIdentity[field]
  )));
}

function findRegisteredGenerationSource(
  currentData: TimelineData | null,
  generationData: UploadedGenerationData,
): { assetId: string; variantId: string; mediaId?: string }[] {
  return Object.entries(currentData?.registry.assets ?? {})
    .filter(([, entry]) => entry.generationId === generationData.generationId
      && (!generationData.variantId || entry.variantId === generationData.variantId)
      && (!generationData.mediaId || entry.media_id === generationData.mediaId))
    .flatMap(([assetId, entry]) => typeof entry.variantId === 'string' && entry.variantId.length > 0
      ? [{ assetId, variantId: entry.variantId, ...(typeof entry.media_id === 'string' ? { mediaId: entry.media_id } : {}) }]
      : []);
}

/**
 * Resolve a drop's existing Runtime selection before it becomes a prepared
 * asset. `undefined` means this caller has no bound selector capability and
 * may keep its legacy placement; `null` means a bound request was refused.
 */
export async function prepareGenerationAssetForDrop({
  generationData,
  currentData,
  projectId,
  provider,
  prepareGenerationAsset,
  managedOutput,
  expectedGenerationId,
  expectedVariantId,
}: {
  generationData: UploadedGenerationData;
  currentData: TimelineData | null;
  projectId: string | null;
  provider: GenerationDropSelectionProvider;
  prepareGenerationAsset: (data: UploadedGenerationData | null) => TimelineProvisionedAsset | null;
  managedOutput?: ManagedOutputDropBinding;
  expectedGenerationId?: string | null;
  expectedVariantId?: string | null;
}): Promise<TimelineProvisionedAsset | null | undefined> {
  const attachedValue = generationData.selectedMedia;
  const attachedSelection = attachedValue === undefined
    ? null
    : readSelectedProjectMediaIdentity(attachedValue);
  if (attachedValue !== undefined && !attachedSelection) {
    return null;
  }
  if (projectId && currentData?.head?.projectId && currentData.head.projectId !== projectId) {
    return null;
  }

  if (managedOutput) {
    if (!projectId || managedOutput.project_id !== projectId
      || !managedOutput.association_id
      || managedOutput.object_id !== generationData.mediaId
      || !Number.isSafeInteger(managedOutput.version) || managedOutput.version < 1
      || (expectedGenerationId && attachedSelection
        && attachedSelection.generation_id !== expectedGenerationId)
      || (expectedVariantId && attachedSelection
        && attachedSelection.variant_id !== expectedVariantId)) {
      return null;
    }

    const selectOutput = provider.getProjectMediaSelectionForOutput;
    if (!selectOutput) {
      return null;
    }

    let selectedMedia: SelectedProjectMediaIdentity;
    try {
      selectedMedia = await selectOutput.call(provider, {
        projectId,
        association_id: managedOutput.association_id,
        object_id: managedOutput.object_id,
        version: managedOutput.version,
      });
    } catch {
      return null;
    }

    const identity = readSelectedProjectMediaIdentity(selectedMedia);
    if (!identity || identity.object_id !== managedOutput.object_id
      || (expectedGenerationId && identity.generation_id !== expectedGenerationId)
      || (expectedVariantId && identity.variant_id !== expectedVariantId)
      || (generationData.assetId && identity.asset !== generationData.assetId)
      || (attachedSelection && !sameSelectedMediaIdentity(attachedSelection, selectedMedia))) {
      return null;
    }

    const prepared = prepareGenerationAsset({
      ...generationData,
      assetId: identity.asset,
      generationId: identity.generation_id,
      variantId: identity.variant_id,
      mediaId: identity.object_id,
      selectedMedia,
    });
    return prepared?.selectedMedia === selectedMedia && prepared.assetKey === identity.asset
      ? prepared
      : null;
  }

  const registeredSources = findRegisteredGenerationSource(currentData, {
    ...generationData,
    variantId: generationData.variantId ?? attachedSelection?.variant_id,
    mediaId: generationData.mediaId ?? attachedSelection?.object_id,
  });
  if (registeredSources.length > 1) {
    return null;
  }
  const registeredSource = registeredSources[0];
  if (registeredSource && (
    (generationData.assetId && generationData.assetId !== registeredSource.assetId)
    || (attachedSelection && (
      attachedSelection.asset !== registeredSource.assetId
      || attachedSelection.generation_id !== generationData.generationId
      || attachedSelection.variant_id !== registeredSource.variantId
      || (registeredSource.mediaId && attachedSelection.object_id !== registeredSource.mediaId)
    ))
  )) {
    return null;
  }

  const requestedAsset = registeredSource?.assetId ?? generationData.assetId ?? attachedSelection?.asset;
  const requestedGeneration = generationData.generationId;
  const requestedVariant = generationData.variantId ?? attachedSelection?.variant_id ?? registeredSource?.variantId;
  const requestedObject = generationData.mediaId ?? attachedSelection?.object_id ?? registeredSource?.mediaId;
  const claimsBinding = attachedValue !== undefined || Boolean(generationData.assetId || generationData.mediaId);

  if (!provider.getProjectMediaSelection) {
    return claimsBinding ? null : undefined;
  }

  if (!requestedAsset || (!registeredSource && !attachedSelection)
    || !projectId || !requestedGeneration || !requestedVariant) {
    return null;
  }

  let selectedMedia: SelectedProjectMediaIdentity;
  try {
    selectedMedia = await provider.getProjectMediaSelection({
      projectId,
      asset: requestedAsset,
      generationId: requestedGeneration,
      variantId: requestedVariant,
    });
  } catch {
    return null;
  }

  const identity = readSelectedProjectMediaIdentity(selectedMedia);
  if (!identity || identity.asset !== requestedAsset
    || identity.generation_id !== requestedGeneration
    || identity.variant_id !== requestedVariant
    || (requestedObject && identity.object_id !== requestedObject)
    || (attachedSelection && !sameSelectedMediaIdentity(attachedSelection, selectedMedia))) {
    return null;
  }

  const prepared = prepareGenerationAsset({
    ...generationData,
    assetId: requestedAsset,
    variantId: requestedVariant,
    mediaId: requestedObject ?? identity.object_id,
    selectedMedia,
  });
  return prepared?.selectedMedia === selectedMedia && prepared.assetKey === identity.asset
    ? prepared
    : null;
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
  clipId,
  pinnedShotGroupsOverride,
}: {
  prepared: TimelineProvisionedAsset;
  trackId?: string;
  selectedTrackId?: string | null;
  time: number;
  forceNewTrack: boolean;
  insertAtTop: boolean;
  removeClipId?: string;
  clipId?: string;
  pinnedShotGroupsOverride?: NonNullable<TimelineData['config']['pinnedShotGroups']>;
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
      ...(clipId !== undefined ? { clipId } : {}),
      ...(pinnedShotGroupsOverride ? { pinnedShotGroupsOverride } : {}),
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
    options?: { pinnedShotGroup?: { shotId: string; mode: 'video' } },
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

    const pinnedShotGroupsOverride = options?.pinnedShotGroup
      ? buildPinnedShotGroupsOverride(preview.nextData, {
          shotId: options.pinnedShotGroup.shotId,
          trackId: resolvedTrackId,
          clipIds: [clipId],
          mode: options.pinnedShotGroup.mode,
          ...(options.pinnedShotGroup.mode === 'video' ? { videoAssetKey: prepared.assetKey } : {}),
        })
      : undefined;
    const preparedMediaCommand = pinnedShotGroupsOverride
      ? buildPlacePreparedMediaCommand({
          prepared,
          trackId,
          selectedTrackId: getSelectedTrackId(),
          time,
          forceNewTrack,
          insertAtTop,
          removeClipId,
          clipId,
          pinnedShotGroupsOverride,
        })
      : command;
    const preparedMediaPreview = preparedMediaCommand === command
      ? preview
      : previewPreparedMediaCommand(current, preparedMediaCommand);
    if (!preparedMediaPreview?.commandResult?.detail
      || preparedMediaPreview.commandResult.detail.clipId !== clipId
      || preparedMediaPreview.commandResult.detail.trackId !== resolvedTrackId) {
      return false;
    }

    const insertedClip = preparedMediaPreview.nextData.config.clips.find((clip) => clip.id === clipId);
    const track = preparedMediaPreview.nextData.config.tracks?.find((candidate) => candidate.id === resolvedTrackId);
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
          existingRegistryEntry: current.registry.assets[prepared.assetKey],
        })
      : undefined;

    if (prepared.selectedMedia && !editCommand) {
      return false;
    }

    getApplyEdit()({ type: 'prepared-media', command: preparedMediaCommand }, {
      selectedClipId: clipId,
      selectedTrackId: resolvedTrackId,
      semantic: true,
      ...(editCommand ? { editCommands: [editCommand] } : {}),
    });
    return true;
  }, [getApplyEdit, getDataRef, getSelectedTrackId]);

  const handleAssetDrop = useCallback((assetKey: string, trackId: string | undefined, time: number, forceNewTrack = false, insertAtTop = false, preparedAsset?: TimelineProvisionedAsset, removeClipId?: string, options?: { pinnedShotGroup?: { shotId: string; mode: 'video' } }) => {
    if (preparedAsset) {
      return placePreparedAsset(preparedAsset, trackId, time, forceNewTrack, insertAtTop, removeClipId, options);
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

  const selectImportedMedia = useCallback(async (mediaImport: PreparedMediaImport): Promise<PreparedMediaImport> => {
    // A supplied tuple still goes through prepareGenerationAsset's existing exact
    // validation. Never replace a refused tuple with a second authority read.
    if (mediaImport.selectedMedia !== undefined || !runtime.provider.getProjectMediaSelection
      || mediaImport.project !== selectedProjectId
      || ![mediaImport.project, mediaImport.assetId, mediaImport.generationId, mediaImport.variantId]
        .every((value) => typeof value === 'string' && value.length > 0)) {
      return mediaImport;
    }
    try {
      const selectedMedia = await runtime.provider.getProjectMediaSelection({
        projectId: mediaImport.project,
        asset: mediaImport.assetId,
        generationId: mediaImport.generationId,
        variantId: mediaImport.variantId,
      });
      // Preserve the Runtime record itself. The existing consumer validates its
      // fields against this import before attaching a semantic command.
      return { ...mediaImport, selectedMedia };
    } catch (error) {
      normalizeAndPresentError(error, { context: 'video-editor:project-media-selection', showToast: false });
      return mediaImport;
    }
  }, [runtime.provider, selectedProjectId]);

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
        mediaImport: await selectImportedMedia(mediaImport),
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
  }, [runtime.provider, selectImportedMedia, selectedProjectId]);

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
        mediaImport: await selectImportedMedia(mediaImport),
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
  }, [runtime.provider, selectImportedMedia, selectedProjectId]);

  return {
    prepareGenerationAsset,
    registerGenerationAsset,
    uploadImageGeneration,
    uploadVideoGeneration,
    handleAssetDrop,
  };
}
