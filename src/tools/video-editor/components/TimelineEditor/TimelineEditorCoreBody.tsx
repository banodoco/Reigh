import { trimClipToMediaEnd } from '../../lib/trim-to-media-end.ts';
// Layer map & invariants: docs/structure_detail/tool_video_editor.md
import { expandTinyClip } from '../../lib/expand-tiny-clip.ts';
import { memo, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { shallow } from 'zustand/shallow';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Shot } from '@/domains/generation/types/index.ts';
import { userSelectTimelineClip } from '@/shared/state/selectionStore.ts';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import '@/tools/video-editor/components/TimelineEditor/timeline-overrides.css';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics.ts';
import { ClipAction } from '@/tools/video-editor/components/TimelineEditor/ClipAction.tsx';
import { DropIndicator } from '@/tools/video-editor/components/TimelineEditor/DropIndicator.tsx';
import { TimelineCanvas } from '@/tools/video-editor/components/TimelineEditor/TimelineCanvas.tsx';
import { ROW_HEIGHT, TIMELINE_START_LEFT } from '@/tools/video-editor/lib/coordinate-utils.ts';
import { EDIT_AREA_SELECTOR } from '@/tools/video-editor/lib/timeline-dom.ts';
import { computeTimelineExtent, maxClipEndSeconds } from '@/tools/video-editor/lib/timeline-scale.ts';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data.ts';
import {
  useTimelineChromeSelector,
  useTimelineDataSelector,
  useTimelineOpsSelector,
} from '@/tools/video-editor/hooks/timelineStore.ts';
import { useClipDrag } from '@/tools/video-editor/hooks/useClipDrag.ts';
import { useMarqueeSelect } from '@/tools/video-editor/hooks/useMarqueeSelect.ts';
import { maxShotGroupEndSeconds, projectCanonicalShotRows, type ShotGroup } from '@/tools/video-editor/hooks/useShotGroups.ts';
import type { CanonicalShotOccurrence } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { EditorVariantPicker, TimelineCoreHostObservations } from '@/tools/video-editor/runtime/editorHostObservations.ts';
import { useTimelineScale } from '@/tools/video-editor/hooks/useTimelineScale.ts';
import {
  convertOverhangToHold,
  detectClipOverhang,
} from '@/tools/video-editor/lib/overhang.ts';
import { insertEffectLayerAt } from '@/tools/video-editor/lib/external-drop-utils.ts';
import { getTimelinePostprocessShader } from '@/tools/video-editor/lib/timeline-domain.ts';
import { getAssetFileLocator } from '@/tools/video-editor/lib/asset-registry.ts';
import type { TimelineActionResizeStart, TimelineClipEdgeResizeEnd } from '@/tools/video-editor/hooks/useTimelineState.types.ts';
import type { ResolvedTimelineClip, TimelinePostprocessShaderMetadata, TrackDefinition } from '@/tools/video-editor/types/index.ts';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas.ts';
import { useOptionalVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { AudioLaneOwnerGainEdit } from '@/tools/video-editor/components/TimelineEditor/AudioLanePresentationList.tsx';

const EMPTY_CLIP_IDS = new Set<string>();
const EMPTY_SHOT_GROUPS: ShotGroup[] = [];
const EMPTY_FINAL_VIDEO_MAP = new Map<string, DoubleClickFinalVideo>();
const EMPTY_SHOTS: Shot[] = [];
const EMPTY_ROWS: TimelineRow[] = [];

interface DoubleClickPinnedGroup {
  shotId: string;
  clipIds: string[];
}

interface DoubleClickFinalVideo {
  id: string;
  location?: string | null;
}

type VideoClipDoubleClickResolution =
  | { type: 'lightbox'; assetKey: string; generationId?: string }
  | { type: 'video-modal'; shotId: string; reason: 'pinned-group' | 'final-video-file' }
  | { type: 'none' };

export function resolveVideoClipDoubleClickResolution({
  clipId,
  assetKey,
  generationId,
  fileUrl,
  pinnedShotGroups,
  finalVideoMap,
}: {
  clipId: string;
  assetKey?: string;
  generationId?: string;
  fileUrl?: string;
  pinnedShotGroups: DoubleClickPinnedGroup[];
  finalVideoMap: Map<string, DoubleClickFinalVideo>;
}): VideoClipDoubleClickResolution {
  if (assetKey) {
    return { type: 'lightbox', assetKey, generationId };
  }

  const pinnedGroup = pinnedShotGroups.find((group) => group.clipIds.includes(clipId));
  if (pinnedGroup) {
    return { type: 'video-modal', shotId: pinnedGroup.shotId, reason: 'pinned-group' };
  }

  if (fileUrl) {
    for (const [shotId, finalVideo] of finalVideoMap.entries()) {
      if (finalVideo.location === fileUrl) {
        return { type: 'video-modal', shotId, reason: 'final-video-file' };
      }
    }
  }

  return { type: 'none' };
}

function hasResolvableCanonicalTimeline(occurrence: CanonicalShotOccurrence): boolean {
  const internal = occurrence.revision.internal_timeline_revision;
  if (!internal || typeof internal !== 'object' || Array.isArray(internal)) return false;
  const timeline = (internal as Record<string, unknown>).timeline;
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) return false;
  const clips = (timeline as Record<string, unknown>).clips;
  return Array.isArray(clips) && clips.some((clip) => (
    clip !== null && typeof clip === 'object' && !Array.isArray(clip)
  ));
}

export function resolveSelectedGenerationIdsForShotCreation({
  rows,
  meta,
  assetGenerationMap,
  selectedClipIds,
}: {
  rows: TimelineRow[];
  meta: Record<string, ClipMeta>;
  assetGenerationMap: Record<string, string>;
  selectedClipIds: Iterable<string>;
}) {
  const selectedSet = new Set(selectedClipIds);
  if (selectedSet.size === 0) {
    return {
      canCreateShot: false,
      generationIds: [] as string[],
      orderedClipIds: [] as string[],
      trackId: undefined as string | undefined,
    };
  }

  const orderedSelections = rows
    .flatMap((row, trackIndex) => row.actions
      .filter((action) => selectedSet.has(action.id))
      .map((action) => {
        const assetKey = meta[action.id]?.asset;
        const generationId = assetKey ? assetGenerationMap[assetKey] : undefined;

        return {
          clipId: action.id,
          trackId: row.id,
          trackIndex,
          start: action.start,
          generationId,
        };
      }))
    .sort((left, right) => left.trackIndex - right.trackIndex || left.start - right.start);

  const generationIds = orderedSelections
    .map((selection) => selection.generationId)
    .filter((generationId): generationId is string => typeof generationId === 'string' && generationId.length > 0);

  return {
    // Non-generation clips (text/import/effect clips) are still valid shot
    // selection members; the shot simply starts with the generations present.
    canCreateShot: orderedSelections.length > 0,
    generationIds,
    orderedClipIds: orderedSelections.map((selection) => selection.clipId),
    trackId: orderedSelections[0]?.trackId,
  };
}

export function resolveWaveformAudioSrc(
  clip: ResolvedTimelineClip | undefined,
  track: TrackDefinition | undefined,
): string | undefined {
  if (!clip || !track || !clip.assetEntry?.src) {
    return undefined;
  }

  if (clip.clipType === 'text' || clip.clipType === 'effect-layer') {
    return undefined;
  }

  if (track.kind === 'audio') {
    return clip.volume === 0 ? undefined : clip.assetEntry.src;
  }

  if (
    track.kind === 'visual'
    && clip.assetEntry.type?.startsWith('video/')
    && (clip.volume ?? 1) > 0
  ) {
    return clip.assetEntry.src;
  }

  return undefined;
}

/** Installed hosts keep existing audio behavior; a public host may skip only hash-verified silent visual clips. */
export function resolveHostWaveformAudioSrc(
  clip: ResolvedTimelineClip | undefined,
  track: TrackDefinition | undefined,
  silentVideoAssetHashes?: Readonly<Record<string, string>>,
): string | undefined {
  const silentHash = clip?.asset ? silentVideoAssetHashes?.[clip.asset] : undefined;
  if (
    track?.kind === 'visual'
    && clip?.assetEntry?.type?.startsWith('video/')
    && silentHash
    && clip.assetEntry.content_sha256 === silentHash
  ) {
    return undefined;
  }
  return resolveWaveformAudioSrc(clip, track);
}

export interface TimelineEditorCoreProps {
  /** Optional host presentation override; app timelines keep the 36px default. */
  rowHeight?: number;
  onOpenSequenceCreator?: () => void;
  onOpenElementCreationPrompt?: (prompt: string) => void;
  finalVideoMap?: Map<string, DoubleClickFinalVideo>;
  shotGroups?: ShotGroup[];
  canonicalOccurrences?: readonly CanonicalShotOccurrence[];
  staleShotGroupIds?: Set<string>;
  activeTaskClipIds?: Set<string>;
  shotGroupClipIds?: Set<string>;
  onShotGroupNavigate?: (shotId: string) => void;
  onShotGroupOpen?: (occurrence: CanonicalShotOccurrence) => void;
  onShotGroupGenerateVideo?: (shotId: string) => void;
  onShotGroupSwitchToFinalVideo?: (group: { shotId: string; clipIds: string[]; rowId: string; canonicalIdentity?: CanonicalShotOccurrence }) => void;
  onShotGroupExportManagedOutput?: (group: { shotId: string; clipIds: string[]; rowId: string; canonicalIdentity?: CanonicalShotOccurrence }) => void | Promise<void>;
  onShotGroupSwitchToImages?: (group: { shotId: string; rowId: string }) => void;
  onShotGroupUpdateToLatestVideo?: (group: { shotId: string; rowId: string; canonicalIdentity?: CanonicalShotOccurrence }) => void;
  onShotGroupUnpin?: (group: { shotId: string; trackId: string }) => void;
  onShotGroupDelete?: (group: { shotId: string; trackId: string; clipIds: string[] }) => void;
  onShotGroupDuplicate?: (group: { shotId: string; trackId: string; canonicalIdentity?: CanonicalShotOccurrence }) => void;
  onShotGroupPromotePrimary?: (group: { shotId: string; trackId: string }) => void;
  canCreateShotFromSelection?: boolean;
  existingShots?: Shot[];
  onCreateShotFromSelection?: () => Promise<Shot | null>;
  onGenerateVideoFromSelection?: () => void | Promise<void>;
  onNavigateToShot?: (shot: Shot) => void;
  onOpenGenerateVideo?: (shot: Shot) => void;
  isCreatingShot?: boolean;
  /** Creates a new empty shot anchored at an empty timeline position. */
  onCreateEmptyShotAt?: (anchor: { time: number; trackId?: string }) => void | Promise<void>;
  duplicatingClipId?: string | null;
  onDuplicateGenerationClip?: (clipId: string) => void | Promise<void>;
  onOpenShotVideoModal?: (shotId: string, reason: 'pinned-group' | 'final-video-file') => void;
  /** Fixed output duration for an embedded shot timeline, in seconds. */
  durationLimitSeconds?: number;
  /** Start of the next shot relative to this shot, in seconds. */
  hardDurationSeconds?: number;
}

export interface TimelineEditorCoreBodyProps extends TimelineEditorCoreProps {
  hostObservations: TimelineCoreHostObservations;
  VariantPicker?: EditorVariantPicker;
}

function TimelineEditorCoreComponent({
  hostObservations,
  VariantPicker,
  onOpenSequenceCreator,
  onOpenElementCreationPrompt,
  finalVideoMap = EMPTY_FINAL_VIDEO_MAP,
  shotGroups = EMPTY_SHOT_GROUPS,
  canonicalOccurrences = [],
  staleShotGroupIds,
  activeTaskClipIds,
  shotGroupClipIds = EMPTY_CLIP_IDS,
  onShotGroupNavigate,
  onShotGroupOpen,
  onShotGroupGenerateVideo,
  onShotGroupSwitchToFinalVideo,
  onShotGroupExportManagedOutput,
  onShotGroupSwitchToImages,
  onShotGroupUpdateToLatestVideo,
  onShotGroupUnpin,
  onShotGroupDelete,
  onShotGroupDuplicate,
  onShotGroupPromotePrimary,
  canCreateShotFromSelection = false,
  existingShots = EMPTY_SHOTS,
  onCreateShotFromSelection,
  onGenerateVideoFromSelection,
  onNavigateToShot,
  onOpenGenerateVideo,
  isCreatingShot = false,
  onCreateEmptyShotAt,
  duplicatingClipId = null,
  onDuplicateGenerationClip,
  onOpenShotVideoModal,
  durationLimitSeconds,
  hardDurationSeconds,
  rowHeight = ROW_HEIGHT,
}: TimelineEditorCoreBodyProps) {
  useRenderDiagnostic('TimelineEditorCore');
  const videoEditorRuntime = useOptionalVideoEditorRuntime();
  const readOnly = videoEditorRuntime?.timelineEditability?.checkTimeline?.().allowed === false;
  const [newTrackDropLabel, setNewTrackDropLabel] = useState<string | null>(null);
  const {
    data,
    resolvedConfig,
    timelineRef,
    timelineWrapperRef,
    dataRef,
    deviceClass,
    inputModality,
    interactionMode,
    gestureOwner,
    primaryClipId,
    selectedClipIds,
    scale,
    scaleWidth,
    indicatorRef,
    editAreaRef,
    selectedTrackId,
    interactionStateRef,
  } = useTimelineDataSelector((timeline) => ({
    data: timeline.data,
    resolvedConfig: timeline.resolvedConfig,
    timelineRef: timeline.timelineRef,
    timelineWrapperRef: timeline.timelineWrapperRef,
    dataRef: timeline.dataRef,
    deviceClass: timeline.deviceClass,
    inputModality: timeline.inputModality,
    interactionMode: timeline.interactionMode,
    gestureOwner: timeline.gestureOwner,
    primaryClipId: timeline.primaryClipId,
    selectedClipIds: timeline.selectedClipIds,
    scale: timeline.scale,
    scaleWidth: timeline.scaleWidth,
    indicatorRef: timeline.indicatorRef,
    editAreaRef: timeline.editAreaRef,
    selectedTrackId: timeline.selectedTrackId,
    interactionStateRef: timeline.interactionStateRef,
  }), shallow);
  const renderRows = useMemo(
    () => projectCanonicalShotRows(
      data?.rows ?? EMPTY_ROWS,
      shotGroups,
      new Set(Object.entries(data?.meta ?? {})
        .filter(([, clip]) => clip.clipType === 'shot')
        .map(([clipId]) => clipId)),
    ),
    [data?.meta, data?.rows, shotGroups],
  );
  const {
    applyEdit,
    selectClips,
    clearSelection,
    isClipSelected,
    setSelectedTrackId,
    handleTrackPopoverChange,
    handleMoveTrack,
    handleRemoveTrack,
    handleSplitClipAtTime,
    handleSplitClipsAtPlayhead,
    handleDeleteClips,
    handleDeleteClip,
    handleToggleMuteClips,
    onCursorDrag,
    onClickTimeArea,
    setGestureOwner,
    setInputModalityFromPointerType,
    setContextTarget,
    setInspectorTarget,
    onActionResizeStart,
    onClipEdgeResizeEnd,
    onTimelineDragOver,
    onTimelineDragLeave,
    onTimelineDrop,
    onDoubleClickAsset,
  } = useTimelineOpsSelector((ops) => ({
    applyEdit: ops.applyEdit,
    selectClips: ops.selectClips,
    clearSelection: ops.clearSelection,
    isClipSelected: ops.isClipSelected,
    setSelectedTrackId: ops.setSelectedTrackId,
    handleTrackPopoverChange: ops.handleTrackPopoverChange,
    handleMoveTrack: ops.handleMoveTrack,
    handleRemoveTrack: ops.handleRemoveTrack,
    handleSplitClipAtTime: ops.handleSplitClipAtTime,
    handleSplitClipsAtPlayhead: ops.handleSplitClipsAtPlayhead,
    handleDeleteClips: ops.handleDeleteClips,
    handleDeleteClip: ops.handleDeleteClip,
    handleToggleMuteClips: ops.handleToggleMuteClips,
    onCursorDrag: ops.onCursorDrag,
    onClickTimeArea: ops.onClickTimeArea,
    setGestureOwner: ops.setGestureOwner,
    setInputModalityFromPointerType: ops.setInputModalityFromPointerType,
    setContextTarget: ops.setContextTarget,
    setInspectorTarget: ops.setInspectorTarget,
    onActionResizeStart: ops.onActionResizeStart,
    onClipEdgeResizeEnd: ops.onClipEdgeResizeEnd,
    onTimelineDragOver: ops.onTimelineDragOver,
    onTimelineDragLeave: ops.onTimelineDragLeave,
    onTimelineDrop: ops.onTimelineDrop,
    onDoubleClickAsset: ops.onDoubleClickAsset,
  }), shallow);

  const audioLaneOwnerEditAvailable = !readOnly
    && (videoEditorRuntime?.provider as { semanticCommandSaving?: boolean } | undefined)
      ?.semanticCommandSaving === true;
  const handleAudioLaneOwnerGainEdit = useCallback((edit: AudioLaneOwnerGainEdit) => {
    const current = dataRef.current;
    if (!audioLaneOwnerEditAvailable || !current || !Number.isFinite(edit.value)
      || edit.operation.op !== 'clip.set-look'
      || !edit.operation.select
      || typeof edit.operation.args.volume !== 'number') return;

    // The projection supplies the authored owner and operation. Only the
    // user's selected value is substituted; the CLI string is never used.
    applyEdit({ type: 'config', resolvedConfig: current.resolvedConfig }, {
      editCommands: [{
        op: edit.operation.op,
        select: edit.operation.select,
        args: { ...edit.operation.args, volume: edit.value },
      }],
      semantic: true,
    });
  }, [applyEdit, audioLaneOwnerEditAvailable, dataRef]);
  const {
    handleAddTrack,
    handleAddTextAt,
    handleClearUnusedTracks,
    setScaleWidth,
    unusedTrackCount,
  } = useTimelineChromeSelector((chrome) => ({
    handleAddTrack: chrome.handleAddTrack,
    handleAddTextAt: chrome.handleAddTextAt,
    handleClearUnusedTracks: chrome.handleClearUnusedTracks,
    setScaleWidth: chrome.setScaleWidth,
    unusedTrackCount: chrome.unusedTrackCount,
  }), shallow);
  const handleAddEffectLayerAt = useCallback((trackId: string, time: number) => {
    insertEffectLayerAt({ dataRef, trackId, time, selectedTrackId, applyEdit });
  }, [applyEdit, dataRef, selectedTrackId]);
  const trackSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const resizeStartHandler: TimelineActionResizeStart = onActionResizeStart;
  const clipEdgeResizeEndHandler: TimelineClipEdgeResizeEnd = onClipEdgeResizeEnd;

  const { dragSessionRef, isDragging, dragPreview } = useClipDrag();

  const { marqueeRect, onPointerDown: onMarqueePointerDown } = useMarqueeSelect({
    editAreaRef,
    deviceClass,
    interactionMode,
    gestureOwner,
    setGestureOwner,
    setInputModalityFromPointerType,
  });

  const {
    staleAssetKeys,
    dismissedAssetKeys,
    generationAssetKeys,
    dismissAsset,
    updateAssetToCurrentVariant,
    applyVariantToAsset,
    addVariantAsGenerationAfterClip,
    isAddingVariantAsGenerationPending,
    activeTaskAssetKeys,
    silentVideoWaveformAssetHashes,
  } = hostObservations;

  useLayoutEffect(() => {
    const wrapper = timelineWrapperRef.current;
    const nextEditArea = wrapper?.querySelector<HTMLElement>(EDIT_AREA_SELECTOR) ?? null;
    editAreaRef.current = nextEditArea;

    return () => {
      if (editAreaRef.current === nextEditArea) {
        editAreaRef.current = null;
      }
    };
  }, [data, editAreaRef, timelineWrapperRef]);

  // One geometry owner: the canvas (ruler, grid, scroll content) and the overlay
  // host below both size themselves from this.
  const timelineExtent = useMemo(() => computeTimelineExtent({
    maxEndSeconds: Math.max(
      maxClipEndSeconds(renderRows),
      maxShotGroupEndSeconds(shotGroups),
      durationLimitSeconds ?? 0,
      hardDurationSeconds ?? 0,
    ),
    scale,
    scaleWidth,
    startLeft: TIMELINE_START_LEFT,
  }), [durationLimitSeconds, hardDurationSeconds, renderRows, scale, scaleWidth, shotGroups]);

  const thumbnailMap = useMemo<Record<string, string>>(() => {
    if (!resolvedConfig) {
      return {};
    }

    return resolvedConfig.clips.reduce<Record<string, string>>((acc, clip) => {
      if (clip.clipType === 'text' || !clip.assetEntry) {
        return acc;
      }

      if (clip.assetEntry.type?.startsWith('image')) {
        acc[clip.id] = clip.assetEntry.src;
      } else if (clip.assetEntry.type?.startsWith('video') && clip.assetEntry.thumbnailUrl) {
        acc[clip.id] = clip.assetEntry.thumbnailUrl;
      }

      return acc;
    }, {});
  }, [resolvedConfig]);

  const handleClipSelect = useCallback((clipId: string, trackId: string) => {
    userSelectTimelineClip(clipId, { additive: false });
    setSelectedTrackId(trackId);
  }, [setSelectedTrackId]);
  const postprocessShader = resolvedConfig
    ? getTimelinePostprocessShader(resolvedConfig)
    : undefined;
  const handlePostprocessShaderSelect = useCallback((shader: TimelinePostprocessShaderMetadata) => {
    clearSelection();
    setSelectedTrackId(null);
    const target = {
      kind: 'shader' as const,
      shaderScope: 'postprocess' as const,
      shaderId: shader.shaderId,
      extensionId: shader.extensionId,
      contributionId: shader.contributionId,
    };
    setContextTarget(target);
    setInspectorTarget(target);
  }, [clearSelection, setContextTarget, setInspectorTarget, setSelectedTrackId]);

  const { pixelToTime } = useTimelineScale({
    scale,
    scaleWidth,
    startLeft: TIMELINE_START_LEFT,
  });

  const resolvedClipMap = useMemo(() => {
    if (!resolvedConfig) {
      return new Map<string, ResolvedTimelineClip>();
    }

    return new Map(resolvedConfig.clips.map((clip) => [clip.id, clip]));
  }, [resolvedConfig]);
  const trackMap = useMemo(() => {
    if (!resolvedConfig) {
      return new Map<string, TrackDefinition>();
    }

    return new Map(resolvedConfig.tracks.map((track) => [track.id, track]));
  }, [resolvedConfig]);
  const shotNameByClipId = useMemo(() => {
    const names = new Map<string, string>();
    for (const group of shotGroups) {
      if (!group.shotName) continue;
      for (const clipId of group.clipIds) {
        names.set(clipId, group.shotName);
      }
    }
    return names;
  }, [shotGroups]);

  const nestedAudioTrackIds = useMemo(() => {
    if (!data) return new Set<string>();
    const hasNestedShots = Object.values(data.meta).some((clip) => clip.clipType === 'shot');
    if (!hasNestedShots) return new Set<string>();
    const emptyAudioTracks = new Set(
      data.rows
        .filter((row) => row.actions.length === 0)
        .map((row) => row.id),
    );
    return new Set(
      data.tracks
        .filter((track) => (
          track.kind === 'audio'
          && emptyAudioTracks.has(track.id)
          && /^(vo|voiceover)$/i.test(track.id)
        ))
        .map((track) => track.id),
    );
  }, [data]);

  const clientXToTime = useCallback((clientX: number): number => {
    const wrapper = timelineWrapperRef.current;
    if (!wrapper) return 0;
    const editArea = wrapper.querySelector<HTMLElement>(EDIT_AREA_SELECTOR);
    const grid = editArea;
    const rect = (editArea ?? wrapper).getBoundingClientRect();
    const scrollLeft = grid?.scrollLeft ?? 0;
    return Math.max(0, pixelToTime(clientX - rect.left + scrollLeft));
  }, [pixelToTime, timelineWrapperRef]);

  const handleDoubleClickVideoClip = useCallback((clipId: string) => {
    const canonicalGroup = shotGroups.find((group) => (
      group.canonicalIdentity && group.clipIds.includes(clipId)
    ));
    const canonicalOccurrence = canonicalGroup?.canonicalIdentity
      ?? canonicalOccurrences.find((occurrence) => (
        clipId === occurrence.occurrenceId
        || clipId.startsWith(`${occurrence.occurrenceId}:`)
      ));
    if (
      canonicalOccurrence
      && hasResolvableCanonicalTimeline(canonicalOccurrence)
      && onShotGroupOpen
    ) {
      onShotGroupOpen(canonicalOccurrence);
      return;
    }
    const assetKey = data?.meta[clipId]?.asset;
    const generationId = assetKey ? data?.registry?.assets[assetKey]?.generationId : undefined;
    const fileUrl = assetKey ? getAssetFileLocator(data?.registry?.assets[assetKey]) : undefined;
    const resolution = resolveVideoClipDoubleClickResolution({
      clipId,
      assetKey,
      generationId,
      fileUrl,
      pinnedShotGroups: dataRef.current?.config.pinnedShotGroups ?? [],
      finalVideoMap,
    });

    if (resolution.type === 'lightbox') {
      onDoubleClickAsset?.(resolution.assetKey, clipId);
      return;
    }

    if (resolution.type === 'video-modal') {
      onOpenShotVideoModal?.(resolution.shotId, resolution.reason);
    }
  }, [canonicalOccurrences, data?.meta, data?.registry?.assets, dataRef, finalVideoMap, onDoubleClickAsset, onOpenShotVideoModal, onShotGroupOpen, shotGroups]);

  const handleSplitClipHere = useCallback((clipId: string, clientX: number) => {
    const time = clientXToTime(clientX);
    handleSplitClipAtTime(clipId, time);
  }, [clientXToTime, handleSplitClipAtTime]);

  const handleExpandTinyClip = useCallback((clipId: string) => {
    expandTinyClip(dataRef, applyEdit, clipId);
  }, [applyEdit, dataRef]);

  const handleTrimClipToMediaEnd = useCallback((clipId: string) => {
    trimClipToMediaEnd(dataRef, applyEdit, clipId);
  }, [applyEdit, dataRef]);

  const handleConvertClipOverhangToHold = useCallback((clipId: string) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const clipMeta = current.meta[clipId];
    const assetKey = clipMeta?.asset;
    const assetEntry = assetKey ? current.registry.assets[assetKey] : undefined;
    if (!clipMeta || !assetEntry?.type?.startsWith('video') || typeof assetEntry.duration !== 'number') {
      return;
    }

    const conversion = convertOverhangToHold({
      current,
      clipId,
      sourceDurationSeconds: assetEntry.duration,
      frameRate: assetEntry.fps,
    });
    if (!conversion) {
      return;
    }

    applyEdit({
      type: 'rows',
      rows: conversion.rows,
      metaUpdates: conversion.metaUpdates,
      clipOrderOverride: conversion.clipOrderOverride,
    }, {
      selectedClipId: conversion.holdClipId,
      selectedTrackId: conversion.trackId,
      semantic: true,
    });
  }, [applyEdit, dataRef]);

  const shouldStackOverlappingActions = useCallback((action: TimelineAction) => {
    // Text clips are duration-driven labels and are commonly generated in
    // short overlapping bursts (for example transcript captions). Their
    // minimum visual width can otherwise make one full-row hit target cover
    // the previous one. Keep video/audio/effect clips on the legacy geometry.
    return data?.meta[action.id]?.clipType === 'text';
  }, [data?.meta]);

  const getActionRender = useCallback((action: TimelineAction, _row: TimelineRow, clipWidth: number) => {
    const clipMeta = data?.meta[action.id];
    if (!clipMeta) {
      return null;
    }

    const resolvedClip = resolvedClipMap.get(action.id);
    const track = resolvedClip ? trackMap.get(resolvedClip.track) : undefined;
    const clipWidthPx = clipWidth;
    const thumbnailSrc = clipWidthPx >= 40 ? thumbnailMap[action.id] : undefined;
    const assetKey = clipMeta.asset;
    const audioSrc = resolveHostWaveformAudioSrc(resolvedClip, track, silentVideoWaveformAssetHashes);
    const isStale = assetKey ? staleAssetKeys.has(assetKey) : false;
    const isDismissed = assetKey ? dismissedAssetKeys.has(assetKey) : false;
    const isGenAsset = assetKey ? generationAssetKeys.has(assetKey) : false;
    const isTaskActive = assetKey && !shotGroupClipIds.has(action.id) ? activeTaskAssetKeys.has(assetKey) : false;
    const assetEntry = assetKey ? data?.registry?.assets[assetKey] : undefined;
    const assetType = assetEntry?.type;
    const isVideoClip = typeof assetType === 'string' && assetType.startsWith('video');
    const clipOverhang = isVideoClip
      ? detectClipOverhang({
          clipMeta,
          timelineDurationSeconds: action.end - action.start,
          sourceDurationSeconds: assetEntry?.duration,
        })
      : null;

    return (
      <ClipAction
        VariantPicker={VariantPicker}
        action={action}
        clipMeta={clipMeta}
        shotName={shotNameByClipId.get(action.id)}
        isVideoClip={isVideoClip}
        isInPinnedShotGroup={shotGroupClipIds.has(action.id)}
        isSelected={isClipSelected(action.id)}
        isPrimary={primaryClipId === action.id}
        showOverflowMenu={!readOnly && deviceClass !== 'desktop'}
        selectedClipIds={[...selectedClipIds]}
        thumbnailSrc={thumbnailSrc}
        audioSrc={audioSrc}
        clipWidth={clipWidthPx}
        onSelect={handleClipSelect}
        onDoubleClickAsset={onDoubleClickAsset}
        onDoubleClickVideoClip={handleDoubleClickVideoClip}
        onExpandTinyClip={readOnly ? undefined : handleExpandTinyClip}
        onSplitHere={readOnly ? undefined : handleSplitClipHere}
        onSplitClipsAtPlayhead={readOnly ? undefined : handleSplitClipsAtPlayhead}
        onTrimToMediaEnd={!readOnly && clipOverhang ? handleTrimClipToMediaEnd : undefined}
        onConvertOverhangToHold={!readOnly && clipOverhang ? handleConvertClipOverhangToHold : undefined}
        onDeleteClips={readOnly ? undefined : handleDeleteClips}
        onDeleteClip={readOnly ? undefined : handleDeleteClip}
        onToggleMuteClips={readOnly ? undefined : handleToggleMuteClips}
        onOpenSequenceCreator={readOnly ? undefined : onOpenSequenceCreator}
        isTaskActive={isTaskActive}
        isVariantStale={isStale && !isDismissed}
        isGenerationAsset={isGenAsset}
        isDuplicatingGeneration={duplicatingClipId === action.id}
        onDuplicateGeneration={!readOnly && isGenAsset ? onDuplicateGenerationClip : undefined}
        onUpdateVariant={!readOnly && isGenAsset && assetKey ? () => void updateAssetToCurrentVariant(assetKey) : undefined}
        onDismissStale={!readOnly && isStale && assetKey ? () => dismissAsset(assetKey) : undefined}
        variantPickerGenerationId={readOnly ? undefined : assetEntry?.generationId}
        variantPickerCurrentVariantId={assetEntry?.variantId ?? null}
        onApplyVariant={!readOnly && isGenAsset && assetKey ? (variant) => applyVariantToAsset(assetKey, variant) : undefined}
        onAddVariantAsGeneration={!readOnly && isGenAsset ? (variant) => addVariantAsGenerationAfterClip(action.id, variant) : undefined}
        isAddingVariantAsGeneration={(variantId) => isAddingVariantAsGenerationPending(action.id, variantId)}
        canCreateShotFromSelection={!readOnly && canCreateShotFromSelection}
        existingShots={existingShots}
        onCreateShotFromSelection={readOnly ? undefined : onCreateShotFromSelection}
        onGenerateVideoFromSelection={readOnly ? undefined : onGenerateVideoFromSelection}
        onNavigateToShot={onNavigateToShot}
        onOpenGenerateVideo={readOnly ? undefined : onOpenGenerateVideo}
        isCreatingShot={isCreatingShot}
        overhangDurationSeconds={clipOverhang?.overhangTimelineDurationSeconds}
        overhangEndFraction={clipOverhang?.mediaEndFraction}
      />
    );
  }, [
    activeTaskAssetKeys,
    VariantPicker,
    addVariantAsGenerationAfterClip,
    applyVariantToAsset,
    canCreateShotFromSelection,
    data,
    deviceClass,
    dismissAsset,
    dismissedAssetKeys,
    duplicatingClipId,
    existingShots,
    generationAssetKeys,
    handleClipSelect,
    handleConvertClipOverhangToHold,
    handleDeleteClip,
    handleDeleteClips,
    handleDoubleClickVideoClip,
    handleExpandTinyClip,
    handleSplitClipHere,
    handleSplitClipsAtPlayhead,
    handleToggleMuteClips,
    handleTrimClipToMediaEnd,
    isAddingVariantAsGenerationPending,
    isClipSelected,
    isCreatingShot,
    onCreateShotFromSelection,
    onDoubleClickAsset,
    onDuplicateGenerationClip,
    onGenerateVideoFromSelection,
    onNavigateToShot,
    onOpenGenerateVideo,
    onOpenSequenceCreator,
    primaryClipId,
    readOnly,
    resolvedClipMap,
    selectedClipIds,
    shotNameByClipId,
    shotGroupClipIds,
    silentVideoWaveformAssetHashes,
    staleAssetKeys,
    thumbnailMap,
    trackMap,
    updateAssetToCurrentVariant,
  ]);

  const handleTrackDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    if (!over) {
      return;
    }

    const activeSortableId = String(active.id);
    const overSortableId = String(over.id);
    if (
      activeSortableId === overSortableId ||
      !activeSortableId.startsWith('track-') ||
      !overSortableId.startsWith('track-')
    ) {
      return;
    }

    const activeTrackId = activeSortableId.slice('track-'.length);
    const overTrackId = overSortableId.slice('track-'.length);
    handleMoveTrack(activeTrackId, overTrackId);
  }, [handleMoveTrack]);

  if (!data) {
    return null;
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-border bg-card/80">
      <div
        ref={timelineWrapperRef as React.RefObject<HTMLDivElement>}
        className="timeline-wrapper relative min-w-0 flex-1 overflow-hidden"
        onDragOver={readOnly ? undefined : onTimelineDragOver}
        onDragLeave={readOnly ? undefined : onTimelineDragLeave}
        onDrop={readOnly ? undefined : onTimelineDrop}
      >
        <TimelineCanvas
          ref={timelineRef as React.RefObject<import('@/tools/video-editor/types/timeline-canvas').TimelineCanvasHandle>}
          rows={renderRows}
          tracks={data.tracks}
          nestedAudioTrackIds={nestedAudioTrackIds}
          onAudioLaneOwnerGainEdit={audioLaneOwnerEditAvailable ? handleAudioLaneOwnerGainEdit : undefined}
          deviceClass={deviceClass}
          inputModality={inputModality}
          interactionMode={interactionMode}
          gestureOwner={gestureOwner}
          scale={scale}
          scaleWidth={scaleWidth}
          scaleSplitCount={5}
          startLeft={TIMELINE_START_LEFT}
          rowHeight={rowHeight}
          minScaleCount={timelineExtent.scaleCount}
          maxScaleCount={timelineExtent.scaleCount}
          selectedTrackId={selectedTrackId}
          readOnly={readOnly}
          getActionRender={getActionRender}
          shouldStackOverlappingActions={shouldStackOverlappingActions}
          onSelectTrack={setSelectedTrackId}
          onTrackChange={readOnly ? () => {} : handleTrackPopoverChange}
          onRemoveTrack={readOnly ? () => {} : handleRemoveTrack}
          onTrackDragEnd={readOnly ? () => {} : handleTrackDragEnd}
          trackSensors={trackSensors}
          onCursorDrag={onCursorDrag}
          onClickTimeArea={onClickTimeArea}
          setInputModalityFromPointerType={setInputModalityFromPointerType}
          setGestureOwner={setGestureOwner}
          onActionResizeStart={readOnly ? undefined : resizeStartHandler}
          onClipEdgeResizeEnd={readOnly ? undefined : clipEdgeResizeEndHandler}
          shotGroups={shotGroups}
          finalVideoMap={finalVideoMap}
          staleShotGroupIds={staleShotGroupIds}
          activeTaskClipIds={activeTaskClipIds}
          onShotGroupNavigate={onShotGroupNavigate}
          onShotGroupOpen={onShotGroupOpen}
          onShotGroupGenerateVideo={readOnly ? undefined : onShotGroupGenerateVideo}
          onShotGroupExportManagedOutput={readOnly ? undefined : onShotGroupExportManagedOutput}
          onShotGroupUnpin={readOnly ? undefined : onShotGroupUnpin}
          onShotGroupDelete={readOnly ? undefined : onShotGroupDelete}
          onShotGroupDuplicate={readOnly ? undefined : onShotGroupDuplicate}
          onShotGroupPromotePrimary={readOnly ? undefined : onShotGroupPromotePrimary}
          onShotGroupSwitchToFinalVideo={readOnly ? undefined : onShotGroupSwitchToFinalVideo}
          onShotGroupSwitchToImages={readOnly ? undefined : onShotGroupSwitchToImages}
          onShotGroupUpdateToLatestVideo={readOnly ? undefined : onShotGroupUpdateToLatestVideo}
          onSelectClips={selectClips}
          dragSessionRef={dragSessionRef}
          interactionStateRef={interactionStateRef}
          marqueeRect={marqueeRect}
          onEditAreaPointerDown={onMarqueePointerDown}
          onAddTrack={readOnly ? undefined : handleAddTrack}
          onAddTextAt={readOnly ? undefined : handleAddTextAt}
          onAddEffectLayerAt={readOnly ? undefined : handleAddEffectLayerAt}
          onOpenSequenceCreator={readOnly ? undefined : onOpenSequenceCreator}
          onOpenElementCreationPrompt={readOnly ? undefined : onOpenElementCreationPrompt}
          onScaleWidthChange={setScaleWidth}
          unusedTrackCount={unusedTrackCount}
          onClearUnusedTracks={readOnly ? undefined : handleClearUnusedTracks}
          newTrackDropLabel={newTrackDropLabel}
          postprocessShader={postprocessShader}
          onSelectPostprocessShader={handlePostprocessShaderSelect}
          onCreateEmptyShotAt={readOnly ? undefined : onCreateEmptyShotAt}
          onCreateShotFromSelection={readOnly ? undefined : onCreateShotFromSelection}
          canCreateShotFromSelection={!readOnly && canCreateShotFromSelection}
          isCreatingShot={isCreatingShot}
          selectedClipCount={selectedClipIds.size}
          isDragging={isDragging}
          dragPreview={dragPreview}
          durationLimitSeconds={durationLimitSeconds}
          hardDurationSeconds={hardDurationSeconds}
        />
        <DropIndicator ref={indicatorRef} editAreaRef={editAreaRef} onNewTrackLabel={setNewTrackDropLabel} />
      </div>
    </div>
  );
}

export const TimelineEditorCoreBody = memo(TimelineEditorCoreComponent);
