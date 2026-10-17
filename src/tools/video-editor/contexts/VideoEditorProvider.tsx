import { useEffects } from '@/tools/video-editor/hooks/useEffects.ts';
/**
 * Internal host-only provider wiring for the Reigh app shell.
 * Not part of the supported public SDK surface.
 *
 * Runtime assembly (registries, extension lifecycle, proposal runtime,
 * process manager, diagnostics) is shared with EditorRuntimeProvider via
 * contexts/editorRuntimeAssembly.tsx; this file owns only the app-shell
 * specifics: real host ports (shots, media lightbox, agent chat, toasts),
 * the staged add-to-editor drain, the lightbox overlay, and the editor-ops
 * store sync.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from '@/shared/components/ui/runtime/sonner.tsx';
import { MediaLightbox, type MediaLightboxProps } from '@/domains/media-lightbox/MediaLightbox.tsx';
import type {
  LightboxFeatureFlags,
  LightboxNavigationProps,
} from '@/domains/media-lightbox/types.ts';
import type { GenerationRow } from '@/domains/generation/types/index.ts';
import { VideoEditorLightboxOverlay } from '@/tools/video-editor/components/VideoEditorLightboxOverlay.tsx';
import { useReighShotsHost } from '@/tools/video-editor/adapters/reigh/useReighShotsHost.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import {
  VideoEditorRuntimeProvider,
  useVideoEditorRuntime,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import {
  EditorRuntimeScaffold,
  useEditorRuntimeAssembly,
  useEditorRuntimeSync,
  type EditorRuntimeAssembly,
} from '@/tools/video-editor/contexts/editorRuntimeAssembly.tsx';
import type { DiagnosticCollection, ReighExtension } from '@reigh/editor-sdk';
import { useAgentChatRegistry, type AgentChatEditorContext } from '@/shared/contexts/AgentChatContext.tsx';
import { setTimelineClipData, useTimelineClipDataActive } from '@/shared/state/selectionStore.ts';
import { type VideoEditorEffectCatalog } from '@/tools/video-editor/hooks/useEffectResources.ts';
import { type VideoEditorSequenceComponentCatalog } from '@/tools/video-editor/hooks/useSequenceResources.ts';
import { INSTALLED_TIMELINE_SERVICE_HOOKS } from '@/tools/video-editor/runtime/installedTimelineHostServiceHooks.ts';
import { useTimelineClipsForAttachments } from '@/tools/video-editor/hooks/useTimelineClipsForAttachments.ts';
import type {
  TimelineActionResizeStart,
  TimelineClipEdgeResizeEnd,
  TimelineEditorOpsContextValue,
} from '@/tools/video-editor/hooks/useTimelineState.types.ts';
import { useVideoEditorLightboxNavigation } from '@/tools/video-editor/hooks/useVideoEditorLightboxNavigation.ts';
import { isOpenableAssetType } from '@/tools/video-editor/lib/editor-utils.ts';
import { getAssetDisplayReference, getAssetResolvedSource } from '@/tools/video-editor/lib/asset-registry.ts';
import { loadGenerationForLightbox } from '@/tools/video-editor/lib/generation-utils.ts';
import { getClipTimelineDuration } from '@/tools/video-editor/lib/config-utils.ts';
import { useTimelineConfigVersion, useTimelineEditorData } from '@/tools/video-editor/hooks/timelineStore.ts';
import { useEffectResources } from '@/tools/video-editor/hooks/useEffectResources.ts';
import { useSequenceResources } from '@/tools/video-editor/hooks/useSequenceResources.ts';
import { buildReighAgentElementContext } from '@/tools/video-editor/runtime/element-contract.ts';
import {
  AstridElementOperationAdapter,
  createElementTimelineRoutes,
} from '@/tools/video-editor/runtime/element-adapter.ts';
import {
  ASTRID_ANIMATION_CATALOG,
  ASTRID_EFFECT_CATALOG,
  ASTRID_TRANSITION_CATALOG,
} from '@/tools/video-editor/runtime/astrid-element-catalog.ts';
import { INSTALLED_ASTRID_ELEMENT_HOST } from '@/tools/video-editor/runtime/astrid-element-components.tsx';
import {
  ADD_GENERATION_QUERY_PARAM,
  ADD_GENERATION_PROJECT_PARAM,
  ADD_GENERATION_TIMELINE_PARAM,
  readPendingAdds,
  writePendingAdds,
} from '@/domains/media-lightbox/hooks/addToVideoEditorConstants.ts';
import {
  getPlayableAssetKind,
  planGenerationAssetRegistration,
} from '@/tools/video-editor/lib/timeline-asset-plans.ts';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics.ts';
import { createProposalPersistenceBridge, type ProposalPersistenceProvider } from '@/tools/video-editor/lib/proposal-runtime.ts';
import type { ProcessManager } from '@/tools/video-editor/runtime/processes/ProcessManager.ts';
import type { SaveStatus } from '@/tools/video-editor/hooks/useTimelinePersistence.ts';
import type { ResolvedAssetRegistryEntry } from '@/tools/video-editor/types/index.ts';
import { publishLocalTestExtensionDiagnostics } from '@/app/localTestRuntime.ts';
import {
  withCanonicalShotDraftLock,
  type TimelineEditability,
} from '@/tools/video-editor/lib/timeline-editability.ts';
import {
  buildExtensionLifecycleOperationalEvents,
  createHostOwnedExtensionOperationalEmitter,
  createPrivacySafeExtensionTelemetryHost,
  dispatchExtensionOperationalEvent,
  operationalCountBucket,
  type ExtensionLifecycleObservation,
  type HostOwnedExtensionOperationalEmitter,
  type ExtensionOperationalEventSink,
} from '@/tools/video-editor/runtime/extensionReleaseControls.ts';

const log = import.meta.env.DEV ? (...args: Parameters<typeof console.log>) => console.log(...args) : () => {};

type VideoEditorMediaLightboxProps = Pick<
  MediaLightboxProps,
  'features' | 'initialVariantId' | 'media' | 'navigation' | 'onClose'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOptionalFieldsOfType(
  value: Record<string, unknown>,
  fields: readonly string[],
  expectedType: 'boolean' | 'function',
): boolean {
  return fields.every((field) => value[field] === undefined || typeof value[field] === expectedType);
}

function isLightboxNavigation(value: unknown): value is LightboxNavigationProps {
  return isRecord(value) && hasOptionalFieldsOfType(
    value,
    ['onNext', 'onPrevious'],
    'function',
  ) && hasOptionalFieldsOfType(
    value,
    ['showNavigation', 'hasNext', 'hasPrevious'],
    'boolean',
  );
}

function isLightboxFeatures(value: unknown): value is LightboxFeatureFlags {
  return isRecord(value) && hasOptionalFieldsOfType(
    value,
    [
      'showImageEditTools',
      'showDownload',
      'showMagicEdit',
      'initialEditActive',
      'showTaskDetails',
    ],
    'boolean',
  );
}

function isGenerationRow(value: unknown): value is GenerationRow {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  const nullableStrings = [
    'variant_fetch_generation_id',
    'location',
    'type',
    'name',
    'based_on',
    'parent_generation_id',
    'pair_shot_generation_id',
    'primary_variant_id',
    'source_task_id',
  ];
  const strings = ['generation_id', 'createdAt', 'imageUrl', 'thumbUrl', 'contentType'];
  const nullableNumbers = ['timeline_frame', 'child_order'];
  const numbers = ['derivedCount', 'unviewedVariantCount'];
  const booleans = ['starred', 'is_child', 'hasUnviewedVariants'];
  return nullableStrings.every((field) => (
    value[field] === undefined || value[field] === null || typeof value[field] === 'string'
  )) && strings.every((field) => (
    value[field] === undefined || typeof value[field] === 'string'
  )) && nullableNumbers.every((field) => (
    value[field] === undefined || value[field] === null || typeof value[field] === 'number'
  )) && numbers.every((field) => (
    value[field] === undefined || typeof value[field] === 'number'
  )) && booleans.every((field) => (
    value[field] === undefined || typeof value[field] === 'boolean'
  )) && (
    value.metadata === undefined || value.metadata === null || isRecord(value.metadata)
  ) && (
    value.params === undefined || isRecord(value.params)
  );
}

function isVideoEditorMediaLightboxProps(
  value: Record<string, unknown>,
): value is Record<string, unknown> & VideoEditorMediaLightboxProps {
  return typeof value.onClose === 'function'
    && (value.media === undefined || isGenerationRow(value.media))
    && (value.initialVariantId === undefined || typeof value.initialVariantId === 'string')
    && (value.navigation === undefined || isLightboxNavigation(value.navigation))
    && (value.features === undefined || isLightboxFeatures(value.features));
}

/** Checked adapter from the deliberately generic host port to Reigh's lightbox. */
function VideoEditorMediaLightbox(props: Record<string, unknown>) {
  if (!isVideoEditorMediaLightboxProps(props)) {
    log('[video-editor] Invalid media lightbox host props');
    return null;
  }
  return (
    <MediaLightbox
      media={props.media}
      navigation={props.navigation}
      initialVariantId={props.initialVariantId}
      onClose={props.onClose}
      features={props.features}
    />
  );
}

function LocalTestDiagnosticsBridge({ collection }: { collection?: DiagnosticCollection }) {
  useEffect(() => {
    if (!collection) {
      publishLocalTestExtensionDiagnostics('runtime', []);
      return;
    }
    const publish = () => publishLocalTestExtensionDiagnostics('runtime', collection.getSnapshot());
    publish();
    const subscription = collection.subscribe(publish);
    return () => subscription.dispose();
  }, [collection]);

  return null;
}

export function buildVideoEditorLightboxMedia(
  assetKey: string | null,
  asset: ResolvedAssetRegistryEntry | undefined,
): GenerationRow | null {
  if (!assetKey || !asset) {
    return null;
  }

  const src = getAssetResolvedSource(asset);
  if (!src || !isOpenableAssetType(asset.type, src)) {
    return null;
  }

  const isVideo = asset.type?.startsWith('video/')
    || /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(src);

  return {
    id: assetKey,
    generation_id: asset.generationId || assetKey,
    location: src,
    imageUrl: src,
    thumbUrl: asset.thumbnailUrl || src,
    type: isVideo ? 'video' : 'image',
    primary_variant_id: asset.variantId || null,
    name: getAssetDisplayReference(asset, assetKey),
  };
}

/** Registers video-editor state into the app-level AgentChatContext and keeps
 *  timeline attachment metadata synchronized in the selection store. */
function AgentChatBridgeRegistration({ operationsEnabled = true }: { operationsEnabled?: boolean }) {
  const { timelineId, timelineName, project, provider, agentChat, liveSceneOperationPort, agentSelectionOwner, astridElementHost, timelineEditability } = useVideoEditorRuntime();
  const { registerTimeline, unregisterTimeline } = agentChat;
  const operationAuthority = useRef({ active: true, operationsEnabled, timelineEditability });
  operationAuthority.current.operationsEnabled = operationsEnabled;
  operationAuthority.current.timelineEditability = timelineEditability;
  useEffect(() => {
    operationAuthority.current.active = true;
    return () => { operationAuthority.current.active = false; };
  }, []);
  const timelineWritable = timelineEditability?.checkTimeline?.().allowed !== false;
  const allClips = useTimelineClipsForAttachments();
  const { data, resolvedConfig, selectedClipIds } = useTimelineEditorData();
  const effectCatalog = useEffectResources();
  const sequenceCatalog = useSequenceResources();
  const configVersion = useTimelineConfigVersion();
  const timelineSummary = useMemo(() => {
    if (!resolvedConfig) return undefined;
    const clips = resolvedConfig.clips ?? [];
    const tracks = resolvedConfig.tracks ?? [];
    const registry = resolvedConfig.registry ?? {};
    const duration = clips.reduce(
      (maxDuration, clip) => Math.max(maxDuration, clip.at + getClipTimelineDuration(clip)),
      0,
    );
    return {
      configVersion,
      trackCount: tracks.length,
      clipCount: clips.length,
      assetCount: Object.keys(registry).length,
      duration,
    };
  }, [configVersion, resolvedConfig]);
  const resolvedClips = resolvedConfig?.clips ?? EMPTY_RESOLVED_CLIPS;
  const elementContext = useMemo(() => buildReighAgentElementContext({
    effects: effectCatalog.effects,
    astridEffects: astridElementHost === INSTALLED_ASTRID_ELEMENT_HOST ? ASTRID_EFFECT_CATALOG : [],
    astridAnimations: astridElementHost === INSTALLED_ASTRID_ELEMENT_HOST ? ASTRID_ANIMATION_CATALOG : [],
    sequences: sequenceCatalog.components,
    // This is the generated, checked-in projection of Astrid's rendering-pack
    // manifests. The runtime remains authoritative for validation/export;
    // the projection keeps agent and editor vocabulary aligned for effects,
    // animations, and transitions.
    astridTransitions: astridElementHost === INSTALLED_ASTRID_ELEMENT_HOST ? ASTRID_TRANSITION_CATALOG : [],
    clips: [...selectedClipIds]
      .map((clipId) => resolvedClips.find((clip) => clip.id === clipId))
      .filter((clip): clip is NonNullable<typeof clip> => Boolean(clip))
      .map((clip) => ({
        id: clip.id,
        trackId: clip.track,
        at: clip.at,
        duration: getClipTimelineDuration(clip),
        ...(clip.clipType ? { clipType: clip.clipType } : {}),
        scope: typeof clip.params?.timeline_document_id === 'string'
          ? 'child-shot' as const
          : 'parent-timeline' as const,
      })),
  }), [astridElementHost, effectCatalog.effects, selectedClipIds, sequenceCatalog.components, resolvedClips]);
  const elementOperationAdapter = useMemo(() => {
    if (!operationsEnabled || !timelineWritable || !project.projectSlug || !timelineId) return undefined;
    return new AstridElementOperationAdapter(
      elementContext,
      createElementTimelineRoutes(provider, () => {
        const authority = operationAuthority.current;
        if (!authority.active || !authority.operationsEnabled || authority.timelineEditability?.checkTimeline?.().allowed === false) {
          throw new Error('The captured editor no longer admits element mutations.');
        }
      }),
      project.projectSlug,
      astridElementHost,
    );
  }, [astridElementHost, elementContext, operationsEnabled, timelineWritable, project.projectSlug, provider, timelineId]);

  const clipRegistration = useRef<(() => void) | null>(null);
  const chatRegistration = useRef<{
    register: typeof registerTimeline; unregister: typeof unregisterTimeline; release: () => void;
  } | null>(null);

  useEffect(() => {
    clipRegistration.current = setTimelineClipData(allClips, agentSelectionOwner);
  }, [allClips, agentSelectionOwner]);

  useEffect(() => () => {
    clipRegistration.current?.();
    clipRegistration.current = null;
    chatRegistration.current?.release();
    chatRegistration.current = null;
  }, []);

  useEffect(() => {
    const previous = chatRegistration.current;
    if (previous && (previous.register !== registerTimeline || previous.unregister !== unregisterTimeline)) {
      previous.release();
    }
    const release = registerTimeline({
      timelineId,
      projectId: project.projectId,
      projectSlug: project.projectSlug,
      timelineName,
      timelineSummary,
      elementContext,
      elementOperationAdapter,
      liveSceneOperationPort: operationsEnabled && timelineWritable ? liveSceneOperationPort : undefined,
    });
    chatRegistration.current = {
      register: registerTimeline, unregister: unregisterTimeline,
      release: typeof release === 'function' ? release : unregisterTimeline,
    };
  }, [elementContext, elementOperationAdapter, liveSceneOperationPort, operationsEnabled, timelineWritable, project.projectId, project.projectSlug, registerTimeline, timelineId, timelineName, timelineSummary, unregisterTimeline]);

  return null;
}

const EMPTY_RESOLVED_CLIPS: never[] = [];

function InnerProvider({
  children,
  effectCatalog,
  sequenceComponentCatalog,
  onSaveStatusChange,
  operationalEmitter,
  assembly,
  initialTimelineData,
}: {
  children: React.ReactNode;
  effectCatalog?: VideoEditorEffectCatalog | null;
  sequenceComponentCatalog?: VideoEditorSequenceComponentCatalog | null;
  onSaveStatusChange?: (status: SaveStatus) => void;
  operationalEmitter?: HostOwnedExtensionOperationalEmitter;
  assembly: EditorRuntimeAssembly;
  initialTimelineData?: TimelineData;
}) {
  useRenderDiagnostic('VideoEditorProvider');
  const runtime = useVideoEditorRuntime();

  // ── M3: Provider-backed proposal persistence bridge ─────────────────────
  // App-shell strategy: resolved synchronously on first render, without the
  // embed host's async initialize() gate.
  const proposalPersistenceRef = useRef<ProposalPersistenceProvider | null | undefined>(undefined);
  if (proposalPersistenceRef.current === undefined) {
    const svc = runtime.auth.userId
      ? runtime.provider.createExtensionPersistenceService?.({
          userId: runtime.auth.userId,
          timelineId: runtime.timelineId,
        }, [])
      : undefined;
    proposalPersistenceRef.current = svc?.capabilities.proposals
      ? createProposalPersistenceBridge(svc)
      : null;
  }

  const effectsQuery = useEffects(runtime.auth.userId, { enabled: !effectCatalog && Boolean(runtime.auth.userId) });
  const sync = useEditorRuntimeSync({
    timelineServices: INSTALLED_TIMELINE_SERVICE_HOOKS,
    effectsQueryData: effectsQuery.data,
    assembly,
    timelineServices: INSTALLED_TIMELINE_SERVICE_HOOKS,
    projectId: runtime.project.projectId,
    timelineId: runtime.timelineId,
    projectObjects: runtime.provider.projectObjects,
    projectTranscripts: runtime.provider.projectTranscripts,
    catalogUserId: runtime.auth.userId,
    effectsQueryEnabled: !effectCatalog && Boolean(runtime.auth.userId),
    effectCatalog,
    sequenceComponentCatalog,
    proposalPersistenceProvider: proposalPersistenceRef.current,
    eagerProposalRetry: true,
    initialTimelineData,
  });
  return (
    <VideoEditorRuntimeContent assembly={assembly} sync={sync}
      onSaveStatusChange={onSaveStatusChange} operationalEmitter={operationalEmitter}>
      {children}
    </VideoEditorRuntimeContent>
  );
}

/** Shared routed/editor content; the caller owns the one runtime assembly and store. */
export function VideoEditorRuntimeContent({
  children, assembly, sync, onSaveStatusChange, operationalEmitter, operationsEnabled = true,
}: {
  children: React.ReactNode;
  assembly: EditorRuntimeAssembly;
  sync: ReturnType<typeof useEditorRuntimeSync>;
  onSaveStatusChange?: (status: SaveStatus) => void;
  operationalEmitter?: HostOwnedExtensionOperationalEmitter;
  operationsEnabled?: boolean;
}) {
  const runtime = useVideoEditorRuntime();
  const { store, editor, chrome } = sync;

  useEffect(() => {
    onSaveStatusChange?.(chrome.saveStatus);
  }, [chrome.saveStatus, onSaveStatusChange]);

  const conflictPreviouslyExhaustedRef = useRef(false);
  useEffect(() => {
    if (chrome.isConflictExhausted && !conflictPreviouslyExhaustedRef.current) {
      operationalEmitter?.emit({
        event: 'persistence.conflict',
        outcome: 'failure',
        errorClass: 'persistence.version_conflict',
      });
    }
    conflictPreviouslyExhaustedRef.current = chrome.isConflictExhausted;
  }, [chrome.isConflictExhausted, operationalEmitter]);

  const renderStartedAtRef = useRef<number>();
  const previousRenderStatusRef = useRef(chrome.renderStatus);
  useEffect(() => {
    const previous = previousRenderStatusRef.current;
    if (chrome.renderStatus === 'rendering' && previous !== 'rendering') {
      renderStartedAtRef.current = performance.now();
    }
    if (
      previous === 'rendering'
      && (chrome.renderStatus === 'done' || chrome.renderStatus === 'error')
    ) {
      const startedAt = renderStartedAtRef.current;
      operationalEmitter?.emit({
        event: 'render.outcome',
        outcome: chrome.renderStatus === 'done' ? 'success' : 'failure',
        ...(chrome.renderStatus === 'error' ? { errorClass: 'render.client_error' } : {}),
        ...(startedAt === undefined ? {} : { durationMs: Math.max(0, performance.now() - startedAt) }),
      });
      renderStartedAtRef.current = undefined;
    }
    previousRenderStatusRef.current = chrome.renderStatus;
  }, [chrome.renderStatus, operationalEmitter]);

  const laneItemCount = editor.data?.dataLanes.reduce(
    (count, lane) => count + lane.items.length,
    0,
  ) ?? 0;
  const laneCountBucket = operationalCountBucket(laneItemCount);
  const previousLaneCountBucketRef = useRef<string>();
  useEffect(() => {
    if (previousLaneCountBucketRef.current !== laneCountBucket) {
      operationalEmitter?.emit({
        event: 'lane.density',
        outcome: 'success',
        countBucket: laneCountBucket,
      });
      previousLaneCountBucketRef.current = laneCountBucket;
    }
  }, [laneCountBucket, operationalEmitter]);

  const [searchParams, setSearchParams] = useSearchParams();
  const pendingAddGenerationId = searchParams.get(ADD_GENERATION_QUERY_PARAM);
  const isActiveInstance = useTimelineClipDataActive(runtime.agentSelectionOwner);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const consumedAddGenerationRef = useRef<string | null>(null);

  const drainedStagedRef = useRef(false);
  const drainInFlightRef = useRef(false);
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    if (editor.isLoading) return;
    const targetProject = searchParams.get(ADD_GENERATION_PROJECT_PARAM);
    const targetTimeline = searchParams.get(ADD_GENERATION_TIMELINE_PARAM);
    const hasScopedIntent = Boolean(targetProject && targetTimeline);
    // Explicit Gallery admission belongs to this editor even if focus changes
    // before the effect or media request completes. Legacy intents still use
    // active-owner + route-timeline fallback.
    if (hasScopedIntent) {
      if (targetProject !== runtime.project.projectId || targetTimeline !== runtime.timelineId) return;
    } else {
      if (!isActiveInstance) return;
      const requestedTimeline = searchParams.get('timeline');
      if (requestedTimeline && requestedTimeline !== runtime.timelineId) return;
    }
    if (drainInFlightRef.current) return;

    const queue: string[] = [];
    if (pendingAddGenerationId && consumedAddGenerationRef.current !== pendingAddGenerationId) {
      consumedAddGenerationRef.current = pendingAddGenerationId;
      queue.push(pendingAddGenerationId);
    }
    if (isActiveInstance && !drainedStagedRef.current) {
      drainedStagedRef.current = true;
      for (const id of readPendingAdds()) {
        if (!queue.includes(id)) queue.push(id);
      }
    }
    if (queue.length === 0) return;

    drainInFlightRef.current = true;

    void (async () => {
      const processed: string[] = [];
      try {
        for (const generationId of queue) {
          if (!mountedRef.current) break;
          const generation = await runtime.mediaLightbox.loadGenerationForLightbox(generationId);
          if (!mountedRef.current) break;
          if (!generation) {
            runtime.toast.error('Could not load asset');
            processed.push(generationId);
            continue;
          }
          const registrationPlan = planGenerationAssetRegistration({
            generationId: generation.id,
            mediaId: generation.media_id,
            variantType: generation.type === 'video' ? 'video' : 'image',
            imageUrl: generation.location ?? generation.imageUrl ?? '',
            thumbUrl: generation.thumbUrl ?? generation.imageUrl ?? generation.location ?? '',
          });
          if (!registrationPlan.ok) {
            runtime.toast.error('Could not register asset');
            processed.push(generationId);
            continue;
          }
          const editorForDrop = editorRef.current;
          const mediaType = getPlayableAssetKind(registrationPlan.assetEntry);
          if (!mediaType) {
            runtime.toast.error('Could not determine the asset media type');
            processed.push(generationId);
            continue;
          }
          const clips = editorForDrop.resolvedConfig?.clips ?? [];
          const timelineEnd = clips.reduce(
            (max, clip) => Math.max(max, clip.at + getClipTimelineDuration(clip)),
            0,
          );
          const preparedCommand = {
            type: 'place-prepared-media',
            payload: {
              asset: {
                assetKey: registrationPlan.assetId,
                mediaType,
                durationSeconds: registrationPlan.assetEntry.duration ?? null,
                entry: registrationPlan.assetEntry,
                source: 'registered',
              },
              at: timelineEnd,
              selectedTrackId: editorForDrop.selectedTrackId,
            },
          } as const;
          const preview = editorForDrop.commands.dryRun(preparedCommand);
          if (preview.status === 'rejected') {
            console.error('[video-editor] Staged generation asset could not be planned', { assetKey: registrationPlan.assetId });
            runtime.toast.error(preview.errors[0]?.message ?? 'Could not place asset');
            processed.push(generationId);
            continue;
          }
          const detail = preview.commandResults[0]?.detail;
          const placed = editorForDrop.commands.apply(preparedCommand, {
            semantic: true,
            selectedClipId: typeof detail?.clipId === 'string' ? detail.clipId : undefined,
            selectedTrackId: typeof detail?.trackId === 'string' ? detail.trackId : editorForDrop.selectedTrackId,
          });
          if (placed.status === 'rejected') {
            console.error('[video-editor] Staged generation asset could not be placed', { assetKey: registrationPlan.assetId });
            runtime.toast.error(placed.errors[0]?.message ?? 'Could not place asset');
          }
          processed.push(generationId);
          // Allow React to commit the clip before the next iteration reads clips.
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
        }
      } finally {
        const remaining = readPendingAdds().filter((id) => !processed.includes(id));
        writePendingAdds(remaining);
        if (mountedRef.current && pendingAddGenerationId && processed.includes(pendingAddGenerationId)) {
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            // A newer Gallery click must retain its own captured intent.
            if (next.get(ADD_GENERATION_QUERY_PARAM) !== pendingAddGenerationId
              || next.get(ADD_GENERATION_PROJECT_PARAM) !== targetProject
              || next.get(ADD_GENERATION_TIMELINE_PARAM) !== targetTimeline) return next;
            next.delete(ADD_GENERATION_QUERY_PARAM);
            next.delete(ADD_GENERATION_PROJECT_PARAM);
            next.delete(ADD_GENERATION_TIMELINE_PARAM);
            return next;
          }, { replace: true });
        }
        drainInFlightRef.current = false;
      }
    })();
  }, [editor.isLoading, isActiveInstance, pendingAddGenerationId, runtime.mediaLightbox, runtime.toast, runtime.timelineId, runtime.project.projectId, searchParams, setSearchParams, store]);

  const [lightboxAssetKey, setLightboxAssetKey] = useState<string | null>(null);
  const [lightboxClipId, setLightboxClipId] = useState<string | null>(null);
  const lightboxAsset = lightboxAssetKey ? editor.resolvedConfig?.registry[lightboxAssetKey] : undefined;
  const lightboxFallbackMedia = useMemo(
    () => buildVideoEditorLightboxMedia(lightboxAssetKey, lightboxAsset),
    [lightboxAsset, lightboxAssetKey],
  );
  const lightboxGenerationId = lightboxAsset?.generationId ?? null;
  const lightboxQuery = useQuery({
    queryKey: ['video-editor', 'lightbox', lightboxGenerationId],
    queryFn: () => runtime.mediaLightbox.loadGenerationForLightbox(lightboxGenerationId as string),
    enabled: Boolean(lightboxGenerationId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (
      !lightboxAssetKey
      || !lightboxGenerationId
      || lightboxQuery.isLoading
      || lightboxQuery.data
      || lightboxFallbackMedia
    ) {
      return;
    }

    log('[video-editor] lightbox query returned no data; clearing asset key', {
      assetKey: lightboxAssetKey,
      clipId: lightboxClipId,
      generationId: lightboxGenerationId,
    });
    setLightboxAssetKey(null);
    setLightboxClipId(null);
  }, [lightboxAssetKey, lightboxClipId, lightboxFallbackMedia, lightboxGenerationId, lightboxQuery.data, lightboxQuery.isLoading]);

  const navResult = useVideoEditorLightboxNavigation({
    lightboxAssetKey,
    lightboxClipId,
    data: editor.data,
    shots: runtime.shots.shots,
    setLightboxAssetKey,
    setLightboxClipId,
  });

  const onDoubleClickAsset = useCallback((assetKey: string, clipId?: string) => {
    const asset = editor.resolvedConfig?.registry[assetKey];
    log('[video-editor] onDoubleClickAsset', {
      assetKey,
      clipId: clipId ?? null,
      hasAsset: Boolean(asset),
      generationId: asset?.generationId ?? null,
      file: asset?.file ?? null,
      type: asset?.type ?? null,
    });
    if (!buildVideoEditorLightboxMedia(assetKey, asset)) {
      return;
    }

    setLightboxClipId(clipId ?? null);
    setLightboxAssetKey(assetKey);
  }, [editor.resolvedConfig]);

  useEffect(() => {
    if (!lightboxAssetKey) {
      return;
    }

    log('[video-editor] lightbox state', {
      assetKey: lightboxAssetKey,
      clipId: lightboxClipId,
      generationId: lightboxGenerationId,
      isLoading: lightboxQuery.isLoading,
      hasData: Boolean(lightboxQuery.data),
      hasFallbackMedia: Boolean(lightboxFallbackMedia),
      mediaId: lightboxQuery.data?.id ?? null,
      mediaType: lightboxQuery.data?.type ?? null,
      mediaLocation: lightboxQuery.data?.location ?? null,
    });
  }, [lightboxAssetKey, lightboxClipId, lightboxFallbackMedia, lightboxGenerationId, lightboxQuery.data, lightboxQuery.isLoading]);

  const onActionResizeStart: TimelineActionResizeStart = editor.onActionResizeStart;
  const onClipEdgeResizeEnd: TimelineClipEdgeResizeEnd = editor.onClipEdgeResizeEnd;

  const editorOps = useMemo<TimelineEditorOpsContextValue>(() => ({
    setInputModality: editor.setInputModality,
    setInputModalityFromPointerType: editor.setInputModalityFromPointerType,
    setInteractionMode: editor.setInteractionMode,
    setGestureOwner: editor.setGestureOwner,
    setPrecisionEnabled: editor.setPrecisionEnabled,
    setContextTarget: editor.setContextTarget,
    setInspectorTarget: editor.setInspectorTarget,
    isClipSelected: editor.isClipSelected,
    selectClip: editor.selectClip,
    selectClips: editor.selectClips,
    addToSelection: editor.addToSelection,
    clearSelection: editor.clearSelection,
    setSelectedTrackId: editor.setSelectedTrackId,
    setActiveClipTab: editor.setActiveClipTab,
    setAssetPanelState: editor.setAssetPanelState,
    prepareGenerationAsset: editor.prepareGenerationAsset,
    registerGenerationAsset: editor.registerGenerationAsset,
    onCursorDrag: editor.onCursorDrag,
    onClickTimeArea: editor.onClickTimeArea,
    onActionResizeStart,
    onClipEdgeResizeEnd,
    onOverlayChange: editor.onOverlayChange,
    onTimelineDragOver: editor.onTimelineDragOver,
    onTimelineDragLeave: editor.onTimelineDragLeave,
    onTimelineDrop: editor.onTimelineDrop,
    handleAssetDrop: editor.handleAssetDrop,
    handleUpdateClips: editor.handleUpdateClips,
    handleUpdateClipsDeep: editor.handleUpdateClipsDeep,
    handleDeleteClips: editor.handleDeleteClips,
    handleDeleteClip: editor.handleDeleteClip,
    handleSelectedClipChange: editor.handleSelectedClipChange,
    handleResetClipPosition: editor.handleResetClipPosition,
    handleResetClipsPosition: editor.handleResetClipsPosition,
    handleSplitSelectedClip: editor.handleSplitSelectedClip,
    handleSplitClipAtTime: editor.handleSplitClipAtTime,
    handleSplitClipsAtPlayhead: editor.handleSplitClipsAtPlayhead,
    handleToggleMuteClips: editor.handleToggleMuteClips,
    handleToggleMute: editor.handleToggleMute,
    handleDetachAudioClip: editor.handleDetachAudioClip,
    handleTrackPopoverChange: editor.handleTrackPopoverChange,
    handleMoveTrack: editor.handleMoveTrack,
    handleRemoveTrack: editor.handleRemoveTrack,
    moveSelectedClipToTrack: editor.moveSelectedClipToTrack,
    moveSelectedClipsToTrack: editor.moveSelectedClipsToTrack,
    moveClipToRow: editor.moveClipToRow,
    applyResolvedClipMove: editor.applyResolvedClipMove,
    createTrackAndMoveClip: editor.createTrackAndMoveClip,
    uploadFiles: editor.uploadFiles,
    applyEdit: editor.applyEdit,
    commands: editor.commands,
    patchRegistry: editor.patchRegistry,
    unpatchRegistry: editor.unpatchRegistry,
    registerAsset: editor.registerAsset,
    onDoubleClickAsset,
    setLightboxAssetKey,
  }), [editor, onActionResizeStart, onClipEdgeResizeEnd, onDoubleClickAsset, setLightboxAssetKey]);

  useLayoutEffect(() => {
    store.getState().syncOpsSlice(editorOps);
  }, [editorOps, store]);

  const resolvedLightboxMedia = lightboxQuery.data ?? lightboxFallbackMedia;
  const lightboxOnClose = useCallback(() => {
    setLightboxAssetKey(null);
    setLightboxClipId(null);
  }, []);
  const lightboxInitialVariantId =
    lightboxAsset?.variantId ?? resolvedLightboxMedia?.primary_variant_id ?? undefined;
  const lightboxFeatures = useMemo(
    () => ({ showDownload: true, showTaskDetails: true }),
    [],
  );

  return (
    <EditorRuntimeScaffold assembly={assembly} sync={sync}>
      <AgentChatBridgeRegistration operationsEnabled={operationsEnabled} />
      {children}
      {lightboxAssetKey && resolvedLightboxMedia && (
        <>
          <runtime.mediaLightbox.Lightbox
            media={resolvedLightboxMedia}
            navigation={navResult.navigation}
            initialVariantId={lightboxInitialVariantId}
            onClose={lightboxOnClose}
            features={lightboxFeatures}
          />
          {navResult.indicator ? <VideoEditorLightboxOverlay indicator={navResult.indicator} /> : null}
        </>
      )}
    </EditorRuntimeScaffold>
  );
}

export interface VideoEditorProviderProps {
  dataProvider: DataProvider;
  projectId: string | null;
  projectSlug?: string | null;
  timelineId: string;
  timelineName?: string | null;
  /** Local mode (DEV, no session) mounts with `null`; auth-gated queries disable. */
  userId: string | null;
  effectCatalog?: VideoEditorEffectCatalog | null;
  sequenceComponentCatalog?: VideoEditorSequenceComponentCatalog | null;
  onSaveStatusChange?: (status: SaveStatus) => void;
  extensions?: readonly ReighExtension[];
  /** Package-state inventory entries propagated from the loader (M5). */
  packageStateEntries?: readonly import('@/tools/video-editor/runtime/extensionSurface').PackageStateInventoryEntry[];
  /** M6b: Host-provided process manager override. When absent, a default
   *  ProcessManager is created from the extension runtime's declared process
   *  specs. */
  processManager?: ProcessManager;
  /** T22: Provider-owned timeline-overlay feature flag. Explicitly defaults
   *  to false; hosts opt in by supplying `true`. */
  timelineOverlaysEnabled?: boolean;
  timelineEditability?: TimelineEditability;
  /** Optional synchronous data seed for hosts with an already-resolved projection. */
  initialTimelineData?: TimelineData;
  /** True only when the deployment-owned parent rollout switch is effective. */
  extensionHostEnabled?: boolean;
  /** Deployment-owned revision attached to privacy-safe operational events. */
  extensionReleaseRevision?: string;
  /** Optional app analytics adapter; defaults to a sanitized browser event. */
  extensionOperationalEventSink?: ExtensionOperationalEventSink;
  children: React.ReactNode;
}

export function VideoEditorProvider(props: VideoEditorProviderProps) {
  const authority = useRef({ dataProvider: props.dataProvider, generation: 0 });
  if (authority.current.dataProvider !== props.dataProvider) {
    authority.current = { dataProvider: props.dataProvider, generation: authority.current.generation + 1 };
  }
  return <VideoEditorProviderInstance key={JSON.stringify([props.projectId, props.projectSlug, props.timelineId, props.userId, authority.current.generation])} {...props} />;
}

function VideoEditorProviderInstance({
  dataProvider,
  projectId,
  projectSlug,
  timelineId,
  timelineName,
  userId,
  effectCatalog,
  sequenceComponentCatalog,
  onSaveStatusChange,
  extensions,
  packageStateEntries,
  processManager: hostProcessManager,
  timelineOverlaysEnabled = false,
  timelineEditability,
  initialTimelineData,
  extensionHostEnabled = false,
  extensionReleaseRevision = 'unset',
  extensionOperationalEventSink = dispatchExtensionOperationalEvent,
  children,
}: VideoEditorProviderProps) {
  const shotsHost = useReighShotsHost(projectId, timelineId, dataProvider.shotComposition);
  const effectiveTimelineEditability = useMemo(
    () => withCanonicalShotDraftLock(timelineEditability, Boolean(shotsHost.canonicalDraft)),
    [shotsHost.canonicalDraft, timelineEditability],
  );
  const agentChatRegistry = useAgentChatRegistry();
  const telemetryHost = useMemo(() => createPrivacySafeExtensionTelemetryHost(), []);
  const knownExtensionVersionsRef = useRef(new Map<string, Set<string>>());
  const extensionVersions = useMemo(
    () => {
      const currentVersions = new Map<string, string>();
      for (const extension of extensions ?? []) {
        const extensionId = extension.manifest.id as string;
        currentVersions.set(extensionId, extension.manifest.version);
        const knownVersions = knownExtensionVersionsRef.current.get(extensionId) ?? new Set<string>();
        knownVersions.add(extension.manifest.version);
        knownExtensionVersionsRef.current.set(extensionId, knownVersions);
      }
      return currentVersions;
    },
    [extensions],
  );
  const operationalEmitter = useMemo(
    () => createHostOwnedExtensionOperationalEmitter({
      releaseRevision: extensionReleaseRevision,
      extensionVersions: new Map(
        [...knownExtensionVersionsRef.current].map(([id, versions]) => [id, new Set(versions)]),
      ),
    }, extensionOperationalEventSink),
    [extensionOperationalEventSink, extensionReleaseRevision, extensionVersions],
  );
  const lifecycleObservationsRef = useRef<readonly ExtensionLifecycleObservation[]>([]);
  const operationalEmitterRef = useRef(operationalEmitter);
  operationalEmitterRef.current = operationalEmitter;
  const hostActivationObservedRef = useRef(false);

  useEffect(() => () => {
    for (const event of buildExtensionLifecycleOperationalEvents(
      lifecycleObservationsRef.current,
      [],
      extensionReleaseRevision,
    )) {
      operationalEmitterRef.current.emit(event);
    }
    lifecycleObservationsRef.current = [];
  }, [extensionReleaseRevision]);

  useEffect(() => {
    if (extensionHostEnabled && !hostActivationObservedRef.current) {
      operationalEmitter.emit({
        event: 'host.activation',
        outcome: 'success',
      });
      hostActivationObservedRef.current = true;
    } else if (!extensionHostEnabled) {
      hostActivationObservedRef.current = false;
    }
  }, [extensionHostEnabled, operationalEmitter]);

  const assembly = useEditorRuntimeAssembly({
    extensions,
    packageStateEntries,
    hostProcessManager,
    // App-shell feedback channel: registry violations surface as toasts.
    commandRegistryCallbacks: {
      onCommandOutcome: (_commandId, extensionId, outcome, durationMs) => {
        if (!extensionHostEnabled) return;
        operationalEmitter.emit({
          event: 'extension.command',
          outcome,
          extensionId,
          extensionVersion: extensionVersions.get(extensionId),
          durationMs,
          ...(outcome === 'failure' ? { errorClass: 'command.handler_error' } : {}),
        });
      },
      onCommandFailure: (commandId, error, extensionId) => {
        const msg = `Command "${commandId}" failed (${extensionId}): ${error.message}`;
        toast.error(msg);
      },
      onReservedCommand: (commandId, extensionId) => {
        toast.warning(`Reserved command "${commandId}" rejected for extension "${extensionId}".`);
      },
      onReservedKeybinding: (key, extensionId, commandId) => {
        toast.warning(`Reserved keybinding "${key}" for "${commandId}" rejected for extension "${extensionId}".`);
      },
      onDuplicateCommand: (commandId, originalExtension, conflictingExtension) => {
        toast.warning(`Command "${commandId}" already registered by "${originalExtension}". Extension "${conflictingExtension}" cannot override it.`);
      },
      onKeybindingConflict: (key, originalExtension, conflictingExtension) => {
        toast.warning(`Keybinding "${key}" already bound by "${originalExtension}". Extension "${conflictingExtension}" cannot override it.`);
      },
      onContextMenuStaleTarget: (commandId, extensionId, reason) => {
        toast.warning(`Command "${commandId}" was not run for extension "${extensionId}".`, { description: reason });
      },
    },
  });

  const registerAgentChatTimeline = useCallback((value: {
    timelineId: string | null;
    projectId: string | null;
    projectSlug?: string | null;
    timelineName?: string | null;
    timelineSummary?: {
      configVersion: number;
      trackCount: number;
      clipCount: number;
      assetCount: number;
      duration: number;
    };
    elementContext?: AgentChatEditorContext['elementContext'];
    elementOperationAdapter?: AgentChatEditorContext['elementOperationAdapter'];
    liveSceneOperationPort?: AgentChatEditorContext['liveSceneOperationPort'];
  }) => {
    return agentChatRegistry.register({
      timelineId: value.timelineId,
      editorContext: value.projectId
        ? {
            tool: 'video-editor',
            projectId: value.projectId,
            projectSlug: value.projectSlug ?? null,
            timelineId: value.timelineId,
            timelineName: value.timelineName ?? null,
            ...(value.timelineId ? {
              timelineSummary: value.timelineSummary,
              elementContext: value.elementContext,
              elementOperationAdapter: value.elementOperationAdapter,
              ...(value.liveSceneOperationPort ? { liveSceneOperationPort: value.liveSceneOperationPort } : {}),
            } : {}),
            deepLink: typeof globalThis.location?.href === 'string' ? globalThis.location.href : null,
          }
        : null,
    }, assembly.agentSelectionOwner);
  }, [agentChatRegistry.register, assembly.agentSelectionOwner]);
  const agentChatHost = useMemo(() => ({
    registerTimeline: registerAgentChatTimeline,
    unregisterTimeline: () => agentChatRegistry.unregister(assembly.agentSelectionOwner),
    activateTimeline: () => agentChatRegistry.activate(assembly.agentSelectionOwner),
  }), [registerAgentChatTimeline, agentChatRegistry.unregister, agentChatRegistry.activate, assembly.agentSelectionOwner]);

  useEffect(() => {
    const lifecycleHost = assembly.lifecycleHostRef.current;
    const current = (extensionHostEnabled ? assembly.extensionRuntime.extensions : []).map((extension) => {
      const extensionId = extension.manifest.id as string;
      const lifecycle = lifecycleHost?.lifecycles.get(extensionId);
      return {
        extensionId,
        extensionVersion: extension.manifest.version,
        activationKey: assembly.getRecoveryKey(extensionId),
        state: lifecycle?.state === 'active'
          ? 'active' as const
          : lifecycle?.state === 'inactive' || lifecycle?.state === 'activating'
            ? 'inactive' as const
            : 'failed' as const,
      };
    });
    for (const event of buildExtensionLifecycleOperationalEvents(
      lifecycleObservationsRef.current,
      current,
      extensionReleaseRevision,
    )) {
      operationalEmitter.emit(event);
    }
    lifecycleObservationsRef.current = current;
  }, [
    assembly.extensionRuntime,
    assembly.lifecycleHostRef,
    extensionHostEnabled,
    extensionReleaseRevision,
    operationalEmitter,
  ]);

  const runtimeValue = useMemo(() => ({
    shellRootRef: assembly.shellRootRef,
    agentSelectionOwner: assembly.agentSelectionOwner,
    astridElementHost: INSTALLED_ASTRID_ELEMENT_HOST,
    getTransitionRegistrySnapshot: () => assembly.transitionRegistryRef.current?.getSnapshot(),
    provider: dataProvider,
    assetResolver: {
      resolveAssetUrl: dataProvider.resolveAssetUrl.bind(dataProvider),
      // dataKind V1 golden path: the lane plane's default transcript loader
      // reads the profile surface (`loadTranscript` → loadAssetProfile).
      ...(dataProvider.loadAssetProfile
        ? { loadAssetProfile: dataProvider.loadAssetProfile.bind(dataProvider) }
        : {}),
    },
    auth: {
      userId,
    },
    project: {
      projectId,
      projectSlug,
    },
    shots: shotsHost,
    mediaLightbox: {
      Lightbox: VideoEditorMediaLightbox,
      loadGenerationForLightbox: dataProvider.loadGenerationForLightbox
        ? dataProvider.loadGenerationForLightbox.bind(dataProvider)
        : loadGenerationForLightbox,
    },
    agentChat: agentChatHost,
    toast: {
      error: toast.error,
      success: toast.success,
      warning: toast.warning,
      info: toast.info,
    },
    telemetry: telemetryHost,
    ...(extensionHostEnabled ? { operationalEmitter } : {}),
    timelineId,
    timelineName,
    userId,
    extensions: assembly.resolvedExtensionsConfig,
    extensionRuntime: assembly.extensionRuntime,
    commandRegistry: assembly.commandRegistryRef.current ?? undefined,
    agentToolRegistry: assembly.agentToolRegistryRef.current ?? undefined,
    liveSceneOperationPort: assembly.liveSceneOperationPort,
    diagnosticCollection: assembly.diagnosticCollectionRef.current ?? undefined,
    getRecoveryKey: assembly.getRecoveryKey,
    incrementRecoveryKey: assembly.incrementRecoveryKey,
    processManager: assembly.processManagerRef.current ?? undefined,
    processStatuses: assembly.processStatuses,
    processResultAttachRecords: assembly.processResultAttachRecords.length > 0
      ? assembly.processResultAttachRecords
      : undefined,
    recordProcessResultAttach: assembly.recordProcessResultAttach,
    timelineOverlaysEnabled,
    timelineViewStore: assembly.timelineViewStoreRef.current ?? undefined,
    timelineEditability: effectiveTimelineEditability,
  }), [agentChatHost, assembly.agentSelectionOwner, assembly.shellRootRef, dataProvider, effectiveTimelineEditability, extensionHostEnabled, operationalEmitter, projectId, projectSlug, registerAgentChatTimeline, shotsHost, telemetryHost, timelineId, timelineName, userId, assembly.resolvedExtensionsConfig, assembly.extensionRuntime, assembly.processResultAttachRecords, assembly.processStatuses, assembly.recordProcessResultAttach, assembly.getRecoveryKey, assembly.incrementRecoveryKey, timelineOverlaysEnabled]);

  return (
    <VideoEditorRuntimeProvider value={runtimeValue}>
      <LocalTestDiagnosticsBridge collection={runtimeValue.diagnosticCollection} />
      <InnerProvider
        effectCatalog={effectCatalog}
        sequenceComponentCatalog={sequenceComponentCatalog}
        onSaveStatusChange={onSaveStatusChange}
        operationalEmitter={extensionHostEnabled ? operationalEmitter : undefined}
        assembly={assembly}
        initialTimelineData={initialTimelineData}
      >
        {children}
      </InnerProvider>
    </VideoEditorRuntimeProvider>
  );
}
