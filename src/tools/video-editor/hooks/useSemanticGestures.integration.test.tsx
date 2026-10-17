import { ClipContinuousEffectField } from '../components/PropertiesPanel/ClipContinuousEffectField.tsx';
import { ClipEffectsTab } from '../components/PropertiesPanel/ClipEffectsTab.tsx';
import { BulkClipPanelBody } from '../components/PropertiesPanel/BulkClipPanelBody.tsx';
import { continuousParameterPatch } from '../commands/continuousHistory.ts';
vi.mock('@/tools/video-editor/components/EffectCreatorPanel.tsx', () => ({
  EffectCreatorPanel: ({ onSaved }: { onSaved: (id: string, category: string, params: Record<string, unknown>) => void }) =>
    <button onClick={() => onSaved('orbit', 'continuous', { enabled: true })}>Save W27 effect</button>,
}));
import { reorderTrackGestureCommands } from '../commands/trackGestures.ts';
import { isTransitionAssignmentBatch, transitionAssignmentInverse } from '../commands/transitionAssignmentHistory.ts';
import { trimClipToMediaEnd } from '../lib/trim-to-media-end.ts';
// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from '../data/typed/timelineBundle.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
vi.mock('@/tools/video-editor/compositions/TimelineRenderer.tsx', () => ({ invalidateReferencedTimelineCache: vi.fn() }));
import * as draftStorage from '../data/timelineDraftIndexedDb.ts';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider.ts';
import { RUNTIME_CLIENT_SCOPES } from '@/integrations/runtime/client.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from '@/integrations/runtime/contract-metadata.ts';
import type { CommitRequest, CommitResult, Transport } from '@/integrations/runtime/generated.ts';
import { validateEditCommand } from '@/integrations/runtime/generated.ts';
import { buildTimelineData, type TimelineData } from '../lib/timeline-data.ts';
import type { AstridElementHost } from '../runtime/astrid-element-host.ts';
import type { TimelineEditability } from '../lib/timeline-editability.ts';
import { commitDraggingSession, type InternalDragSession } from './useClipDrag.helpers.ts';
import { createInteractionState, notifyInteractionEndIfIdle } from '../lib/interaction-state.ts';
import { editorReplaceTimelineSelection, __getSelectionStateForTests, __resetSelectionStoreForTests } from '@/shared/state/selectionStore.ts';
import { __resetOverlayStackForTests } from '@/shared/state/overlayStack.ts';
import { TimelineEventBus } from './useTimelineEventBus.ts';
import { useTimelineCommit } from './useTimelineCommit.ts';
import { usePinnedShotGroups } from './usePinnedShotGroups.ts';
import { useShotGroupHandlers } from './useShotGroupHandlers.ts';
import { useSwitchToFinalVideo } from './useSwitchToFinalVideo.ts';
import type { ShotFinalVideo } from '@/tools/video-editor/hooks/useFinalVideoAvailable.ts';
import { useAssetManagement } from './useAssetManagement.ts';
import { VideoEditorRuntimeProvider, type VideoEditorRuntimeContextValue } from '../contexts/VideoEditorRuntimeContext.tsx';
import { useTimelinePersistence } from './useTimelinePersistence.ts';
import { useTimelineHistory } from './useTimelineHistory.ts';
import { useClipResize } from './useClipResize.ts';
import { usePollSync } from './usePollSync.ts';
import { useClipEditing } from './useClipEditing.ts';
import { useTimelineTrackManagement } from './useTimelineTrackManagement.ts';
import { buildKeyboardTimeNudgeEdit } from '../lib/keyboard-nudge.ts';
import { expandTinyClip } from '../lib/expand-tiny-clip.ts';
import { gestureCommandsFor, tiedStartDragGesture } from '../commands/semanticGestures.ts';
import { buildDuplicateClipEdit } from '../lib/duplicate-clip.ts';
import { createTimelineCommands } from './useTimelineCommandsService.ts';
import type { TimelineStoreApi } from './timelineStore.ts';
import { useTimelineOps } from './useTimelineOps.ts';
import { createProposalRuntime, createProposalPersistenceBridge, type ProposalServiceBridge } from '../lib/proposal-runtime.ts';
import { ProposalPanel } from '../components/ProposalPanel/ProposalPanel.tsx';
import { createAgentToolRegistry } from '../runtime/agentToolRegistry.ts';
import { createAgentToolInvocationService } from '../runtime/agentToolInvocationService.ts';
import type { ProposalTimelineOps } from '../lib/proposal-command-binding.ts';
import type { TimelinePatch, TimelineProposal } from '@/sdk/index';
import { createTimelineReader } from '../lib/timeline-reader.ts';
import { compileTimelinePatch, validateTimelinePatch } from '../lib/timeline-patch.ts';
import { AstridElementOperationAdapter, createElementTimelineRoutes } from '../runtime/element-adapter.ts';
import { buildReighAgentElementContext } from '../runtime/element-contract.ts';
import { readAudioLanePresentation } from '../data/audioLanePresentation.ts';
import type { CanonicalClipIdentity } from '../data/shotCompositionProjection.ts';
import { planClipDrag } from '../lib/clip-drag-planner.ts';
import { createTimelineEditability } from '../lib/timeline-editability.ts';
import { ClipEntranceEffectField } from '@/tools/video-editor/components/PropertiesPanel/ClipEntranceEffectField.tsx';
import { createVideoEditorEffectCatalog } from '@/tools/video-editor/lib/effect-catalog.ts';
import { ClipTransitionSection } from '@/tools/video-editor/components/PropertiesPanel/ClipTransitionSection.tsx';

// This transport is a wire recorder, not an Astrid operation executor. Successful
// fixture acknowledgements establish App adaptation only, never Runtime acceptance.
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
type FixtureReply = (request: CommitRequest, call: number) => Promise<void | 'unavailable' | 'failed' | 'rejected' | 'refused' | 'stale' | 'no_change' | { acceptedResult?: CommitResult; directWrites?: CommitResult['change']['direct_writes']; previewCommands?: import('@/integrations/runtime/generated.ts').EditCommand[]; loseSuccess?: boolean; readbackConfig?: TimelineData['config'] }>;
const catalogFadeFallback = 'W13: legacy effects array has no clip.set-fade producer; retain the whole catalog operation';
function wireFixture(initial: TimelineData, reply?: FixtureReply, fallback?: typeof catalogFadeFallback) {
  const requests: Array<{ request: CommitRequest; bytes: string; headers: Record<string, string> }> = [];
  const compatibilityRequests: string[] = [];
  const readbackHeads: string[] = [];
  const currentConfig = structuredClone(initial.config);
  let currentHead = initial.head!.headRevisionId!;
  let acceptanceSequence = 1;
  const acceptedHeads = new Map<string, string>();
  // Keep J's durable COMMIT allocator live in this isolated synthetic provider.
  // Browser navigation/session identity is deliberately not inferred in jsdom.
  const commitSessionValues = new Map<string, string>();
  const commitSessionStorage = {
    getItem(key: string) { return commitSessionValues.get(key) ?? null; },
    setItem(key: string, value: string) { commitSessionValues.set(key, String(value)); },
  };
  const transport: Transport = async (method, path, headers, body) => {
    const posted = method === 'POST' && body ? JSON.parse(new TextDecoder().decode(body as Uint8Array)) : undefined;
    if (method === 'POST' && (/\/(?:publish-document|publish|composition-revisions)(?:$|\?)/.test(path)
      || posted?.change?.adapter === 'app-save')) {
      compatibilityRequests.push(path);
      if (fallback) throw new Error(`Marked census fallback ${fallback}`);
      throw new Error(`Unmarked census writer used compatibility publication: ${path}`);
    }
    if (path === '/v1/health') return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 }) };
    if (path === '/v1/handshake') return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 'fixture', actor_id: 'reigh-product-connector', realm_id: 'fixture', scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }) };
    if (path === '/v1/realm') return { status: 200, headers: {}, body: json({ realm_id: 'fixture' }) };
    if (method === 'POST' && path === '/v1/projects/gesture-project/timelines/gesture-timeline/inspect') {
      return { status: 200, headers: {}, body: json({
        schema: 'runtime.timeline.declared_inputs/v1', evidence_kind: 'declared_inputs', render_requested: false,
        representation: 'canonical_head', authority: 'runtime_parent_composition', project_id: 'gesture-project',
        timeline_id: 'gesture-timeline', revision_id: currentHead, head_revision_id: currentHead, is_current_head: true,
        parent_content_digest: 'sha256:fixture-parent', head_content_digest: 'sha256:fixture-parent', snapshot_digest: 'sha256:fixture-snapshot',
        selectors: {}, selection_status: 'selected', target_count: 0, occurrence_count: 0, parent_clip_count: currentConfig.clips.length,
        parent_clip_target_count: 0, selected_clip_count: 0, selected: [], selected_parent_clips: [], next_cursor: null,
      }) };
    }
    if (method === 'POST' && path.endsWith('/commit')) {
      const bytes = new TextDecoder().decode(body as Uint8Array);
      const request = JSON.parse(bytes) as CommitRequest;
      requests.push({ request, bytes, headers: { ...headers } });
      const outcome = await reply?.(request, requests.length);
      if (outcome && typeof outcome === 'object' && outcome.acceptedResult) {
        const result = outcome.acceptedResult;
        if (outcome.readbackConfig) Object.assign(currentConfig, structuredClone(outcome.readbackConfig));
        currentHead = result.accepted_revision_id ?? currentHead;
        // This synthetic SDK result carries the actual immutable parent readback.
        const canonical = result.canonical_document as unknown as { parent?: { config: TimelineData['config']; clips: TimelineData['config']['clips']; tracks?: TimelineData['config']['tracks'] } } | null;
        if (canonical?.parent) {
          for (const key of Object.keys(currentConfig)) delete (currentConfig as unknown as Record<string, unknown>)[key];
          Object.assign(currentConfig, structuredClone(canonical.parent.config), { clips: structuredClone(canonical.parent.clips), ...(canonical.parent.tracks ? { tracks: structuredClone(canonical.parent.tracks) } : {}) });
        }
        // Acceptance completed, but no response bytes reach the caller.
        if (outcome.loseSuccess) throw new TypeError('Connection closed after durable acceptance');
        return { status: 200, headers: {}, body: json(result) };
      }
      let unavailable = outcome === 'unavailable';
      const failed = outcome === 'failed';
      const rejected = outcome === 'rejected';
      const refused = outcome === 'refused';
      const stale = outcome === 'stale';
      const noChange = outcome === 'no_change';
      const nativeWrites = outcome && typeof outcome === 'object' ? outcome.directWrites : undefined;
      if (!unavailable && !failed && !rejected && !refused && !stale && !noChange && !request.dry_run && !acceptedHeads.has(request.request_id)) {
        currentHead = `parent-r${++acceptanceSequence}`;
        acceptedHeads.set(request.request_id, currentHead);
        if ('commands' in request.change) {
          for (const command of request.change.commands) {
            if (command.op !== 'shot-group.set' && command.op !== 'shot-group.remove') continue;
            const args = command.args as Record<string, unknown>;
            const group = args.group as { shotId: string; trackId: string };
            const rows = currentConfig.pinnedShotGroups ?? [];
            const index = rows.findIndex((row) => row.shotId === group.shotId && row.trackId === group.trackId);
            if (command.op === 'shot-group.remove') {
              const removed = new Set((args.remove_clip_ids as string[]).map((id) => id.split('/clip:')[1]));
              currentConfig.clips = currentConfig.clips.filter((clip) => !removed.has(clip.id));
              currentConfig.pinnedShotGroups = rows.filter((row) => row.shotId !== group.shotId || row.trackId !== group.trackId);
              continue;
            }
            const intent = args.intent;
            const prior = index >= 0 ? rows[index] : { shotId: group.shotId, trackId: group.trackId, clipIds: [] };
            let next = { ...prior } as NonNullable<typeof prior>;
            if (intent === 'pin') {
              const members = args.members as string[];
              next = { ...next, clipIds: members.map((id) => id.split('/clip:')[1]!), mode: 'images' };
              if (typeof args.name === 'string') next.name = args.name;
            } else if (intent === 'video') {
              const media = args.media as { asset: string };
              const clipId = (args.identities as { clip_id: string }).clip_id;
              next = { ...next, clipIds: [clipId], mode: 'video', videoAssetKey: media.asset };
            } else if (intent === 'replace-video') {
              next = { ...next, videoAssetKey: (args.media as { asset: string }).asset };
            } else if (intent === 'images') {
              next = { ...next, mode: 'images' };
            }
            currentConfig.pinnedShotGroups = index >= 0
              ? rows.map((row, rowIndex) => rowIndex === index ? next : row)
              : [...rows, next];
          }
        }
      }
      if (outcome && typeof outcome === 'object' && outcome.loseSuccess) unavailable = true;
      const response: CommitResult = {
        status: noChange ? 'no_change' : stale ? 'conflict' : unavailable || failed || rejected ? 'error' : refused ? 'refused' : request.dry_run ? 'preview' : 'accepted', request_id: request.request_id, request_hash: 'fixture',
        base_revision_id: request.base_revision_id, accepted_revision_id: unavailable || failed || rejected || refused || stale || noChange || request.dry_run ? null : acceptedHeads.get(request.request_id)!,
        accepted_publication_id: nativeWrites ? `pub-${currentHead}` : null, previous_revision_id: request.base_revision_id, rebased_onto: request.dry_run ? currentHead : null,
        canonical_document: null, projection_version: 1, document_digest: null, id_map: {},
        change: { changes: [], commands: request.dry_run && 'commands' in request.change
          ? (outcome && typeof outcome === 'object' && outcome.previewCommands) || structuredClone(request.change.commands) : [], direct_writes: nativeWrites ?? [], consequences: [], affected: [] },
        conflicts: stale ? [{ id: 'parent/clip:clip-2', path: 'intent.on', kind: 'dependent', base: 'captured relation', theirs: 'changed relation', ours: null }] : [], choices: [], provenance: null, evidence: null, schema_report: null, runtime_receipt: null, error: unavailable ? { code: 'runtime_unavailable', message: 'fixture unavailable', hint: 'retry', next_action: 'retry' } : failed ? { code: 'validation_error', message: 'fixture refused batch', hint: 'invalid batch', next_action: 'fix' } : rejected ? { code: 'invalid_command', message: 'fixture rejected acceptance', hint: 'fix the command', next_action: 'fix' } : refused ? { code: 'bad_request', message: 'fixture refusal', hint: 'inspect the refused command', next_action: 'inspect' } : null,
      };
      return { status: unavailable ? 503 : 200, headers: {}, body: json(response) };
    }
    const revision = /\/composition-revisions\/([^/]+)$/.exec(path);
    if (method === 'GET' && revision) {
      readbackHeads.push(revision[1]);
      return { status: 200, headers: {}, body: json({ project_id: 'gesture-project', timeline_id: 'gesture-timeline', revision_id: revision[1], payload: { config: currentConfig, clips: currentConfig.clips, registry: initial.registry, occurrences: [] } }) };
    }
    throw new Error(`Unexpected fixture call ${method} ${path}`);
  };
  return {
    requests,
    compatibilityRequests,
    readbackHeads,
    acceptedCount: () => acceptedHeads.size,
    getCurrentConfig: () => structuredClone(currentConfig),
    getCurrentHead: () => currentHead,
    transport,
    provider: new RuntimeDataProvider({ projectId: 'gesture-project', baseUrl: 'http://runtime.fixture', token: 'fixture-only', transport, commitRouting: { enabled: true }, commitSessionStorage }),
  };
}
async function initialData(media = false, crops: { cropTop?: number; cropBottom?: number; cropLeft?: number; cropRight?: number } = {}) {
  const data = await buildTimelineData({
    output: { resolution: '1920x1080', fps: 30, file: 'fixture.mp4' },
    app: { customConfig: { keep: true } },
    tracks: [{ id: 'V1', kind: 'visual', label: 'V1', app: { trackSentinel: true } }, { id: 'V2', kind: 'visual', label: 'V2' }],
    clips: [{ id: 'clip-1', at: 1, ...(media ? { clipType: 'media' as const, from: 2, to: 6, speed: 2 } : { hold: 2, clipType: 'hold' as const }), track: 'V1', opacity: 0.9, volume: 1, params: { data: null }, app: { clipSentinel: true, astrid: { on: '"hello" +2f' } }, ...crops }, { id: 'clip-2', at: 5, hold: 1, clipType: 'hold', track: 'V1' }],
  }, { assets: {} });
  data.head = { projectId: 'gesture-project', timelineId: 'gesture-timeline', headRevisionId: 'parent-r1' };
  return data;
}

async function shotGroupData(mode: 'images' | 'video' = 'images') {
  const base = await initialData(true);
  const pinnedShotGroups = [{
    shotId: 'shot-1',
    trackId: 'V1',
    clipIds: mode === 'video' ? ['clip-1'] : ['clip-1', 'clip-2'],
    mode,
    ...(mode === 'video' ? {
      videoAssetKey: 'video-previous',
      imageClipSnapshot: [{
        clipId: 'image-original', assetKey: 'image-original-asset', start: 1, end: 3,
        meta: { clipType: 'media', track: 'V1', from: 0, to: 2 },
      }],
    } : {}),
  }];
  return buildTimelineData({ ...base.config, pinnedShotGroups }, base.registry, undefined, 1, undefined, base.head);
}

function transitionHost(): AstridElementHost {
  const descriptor = {
    id: 'crossfade', kind: 'transition' as const, revision: 'sha256:crossfade-r1',
    packId: 'rendering', componentPath: 'transitions/crossfade',
  };
  const component = () => null;
  return {
    descriptors: [descriptor], sequenceRegistry: {},
    resolveComponent: (id, kind, packId) => id === descriptor.id && kind === descriptor.kind && packId === descriptor.packId
      ? component : undefined,
    resolveSequenceClipEntry: () => undefined,
    describeClipCapability: () => undefined,
  };
}

async function adjacentTransitionData(overrides: Record<string, unknown> = {}) {
  const base = await initialData();
  return buildTimelineData({
    ...base.config,
    clips: [
      { id: 'before', at: 0, hold: 2, clipType: 'hold', track: 'V1', app: { predecessorSentinel: true } },
      { id: 'after', at: 2, hold: 2, clipType: 'hold', track: 'V1', params: { preserved: { nested: true } }, ...overrides },
    ],
  }, base.registry, undefined, 1, undefined, base.head);
}

async function occurrenceTransitionData() {
  const base = await initialData();
  const makeOccurrence = (source: Record<string, unknown>, projectedId: string) => ({
    ...source,
    id: projectedId,
    app: {
      canonical: {
        projectId: 'gesture-project', parentDocumentId: 'gesture-timeline', headRevisionId: 'parent-r1',
        occurrenceId: 'occ-A', shotId: 'shot-A', revisionId: 'shot-r1',
        internalTimelineRevisionId: 'internal-r1', sourceClipId: source.id,
        outputIdentity: 'output-A', sourceClip: source,
      },
    },
  });
  return buildTimelineData({
    ...base.config,
    clips: [
      makeOccurrence({ id: 'source-before', at: 0, hold: 2, clipType: 'hold', track: 'V1' }, 'occ-before'),
      makeOccurrence({ id: 'source-after', at: 2, hold: 2, clipType: 'hold', track: 'V1' }, 'occ-after'),
    ] as never,
  }, base.registry, undefined, 1, undefined, base.head);
}

async function setup(reply?: FixtureReply, media = false, providedInitial?: TimelineData, currentTime = 1, editability?: TimelineEditability, elementHost?: AstridElementHost, selectedClipId = 'clip-1', finalVideoMap: Map<string, ShotFinalVideo> = new Map(), outputSelector?: Parameters<typeof useSwitchToFinalVideo>[0]['getProjectMediaSelectionForOutput'], proposalCommands = false, fallback?: typeof catalogFadeFallback) {
  const initial = providedInitial ?? await initialData(media);
  const fixture = wireFixture(initial, reply, fallback);
  const eventBus = new TimelineEventBus();
  const lastSavedSignatureRef = { current: initial.stableSignature };
  const headRevisionRef = { current: initial.head };
  const savedSeqRef = { current: 0 };
  const configVersionRef = { current: 1 };
  const interactionStateRef = { current: createInteractionState() };
  const query = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const queryChildren = React.createElement(QueryClientProvider, { client: query }, children);
    return React.createElement(VideoEditorRuntimeProvider, {
      value: { provider: fixture.provider, timelineId: 'gesture-timeline', ...(elementHost ? { astridElementHost: elementHost } : {}) } as VideoEditorRuntimeContextValue,
      children: queryChildren,
    });
  };
  const selectClip = vi.fn();
  const hook = renderHook(() => {
    const commit = useTimelineCommit({ eventBus, lastSavedSignatureRef, initialData: initial, editability });
    const persistence = useTimelinePersistence({ provider: fixture.provider, assetResolver: fixture.provider, timelineId: 'gesture-timeline', eventBus, ...commit, savedSeqRef, configVersionRef, headRevisionRef, lastSavedSignatureRef, interactionStateRef });
    useEffect(() => eventBus.on('scheduleSave', persistence.scheduleSave), [persistence.scheduleSave]);
    const editing = useClipEditing({ ...commit, selectedClipId, selectedTrack: initial.tracks[0], currentTime, selectClip, resolvedConfig: commit.data?.resolvedConfig ?? null });
    const tracks = useTimelineTrackManagement({ ...commit, resolvedConfig: commit.data?.resolvedConfig ?? null, eventBus, editability });
    const resize = useClipResize({ ...commit, semanticCommandSaving: fixture.provider.semanticCommandSaving });
    const ops = useTimelineOps({ ...commit, ...(proposalCommands ? { semanticCommandSaving: fixture.provider.semanticCommandSaving, getConfigVersion: () => configVersionRef.current, captureSaveTarget: persistence.captureSaveTarget, flushSaveTarget: persistence.flushSaveTarget } : {}), createManualCheckpoint: vi.fn(), jumpToCheckpoint: vi.fn(), checkpoints: [], editability });
    const groupPins = usePinnedShotGroups({ dataRef: commit.dataRef, applyEdit: commit.applyEdit, enabled: true, semanticCommands: true });
    const groupSwitches = useSwitchToFinalVideo({ applyEdit: commit.applyEdit, dataRef: commit.dataRef, finalVideoMap, semanticCommands: true, projectId: initial.head?.projectId, getProjectMediaSelectionForOutput: outputSelector });
    const groupHandlers = useShotGroupHandlers({
      shots: undefined,
      shotGroups: [],
      data: commit.data,
      resolvedRegistry: commit.data?.resolvedConfig.registry,
      activeTaskAssetKeys: new Set(),
      finalVideoMap,
      applyEdit: commit.applyEdit,
      dataRef: commit.dataRef,
      dismissFinalVideo: vi.fn(),
      switchToFinalVideo: groupSwitches.switchToFinalVideo,
      switchToImages: groupSwitches.switchToImages,
      updateToLatestVideo: groupSwitches.updateToLatestVideo,
      unpinGroup: groupPins.unpinGroup,
      setVideoModalShot: vi.fn(),
      setVideoModalShowImages: vi.fn(),
      semanticCommands: true,
    });
    return { ...commit, editing, tracks, resize, persistence, ops, groupPins, groupHandlers, groupSwitches };
  }, { wrapper });
  return { ...hook, ...fixture, initial, savedSeqRef, interactionStateRef, eventBus, selectClip, configVersionRef, headRevisionRef, lastSavedSignatureRef };
}
beforeEach(() => { vi.stubGlobal('indexedDB', createFakeIndexedDB()); __resetSelectionStoreForTests(); __resetOverlayStackForTests(); });
afterEach(() => { resetFakeIndexedDB(); vi.restoreAllMocks(); });

const cases = [
  ['property opacity', 'handleSelectedClipChange', { opacity: 0.4 }, 'clip.set-look', { opacity: 0.4 }],
  ['entrance fade', 'handleSelectedClipChange', { entrance: { type: 'fade', duration: 0.4 } }, 'clip.set-fade', { fade_in: 0.4 }],
  ['exit fade', 'handleSelectedClipChange', { exit: { type: 'fade-out', duration: 0.4 } }, 'clip.set-fade', { fade_out: 0.4 }],
  ['explicit param clear', 'handleSelectedClipChange', { params: { data: undefined } }, 'clip.clear', { keys: ['data'] }],
  ['explicit clear', 'handleSelectedClipChange', { opacity: undefined }, 'clip.clear', { keys: ['opacity'] }],
  ['ordinary object property', 'handleSelectedClipChange', { params: { data: { op: 'clear' } } }, 'clip.set-param', { path: 'data', value: { op: 'clear' } }],
  ['absent-like object property', 'handleSelectedClipChange', { params: { data: { $absent: true } } }, 'clip.set-param', { path: 'data', value: { $absent: true } }],
  ['present null property', 'handleSelectedClipChange', { params: { data: null } }, 'clip.set-param', { path: 'data', value: null }],
] as const;
describe('main-editor semantic gesture wire adaptation', () => {
  it('keeps audio-lane presentation outside authored writes while a gain gesture uses the existing commit route', async () => {
    const initial = await initialData();
    const signature = initial.stableSignature;
    const lane = JSON.parse(readFileSync(path.resolve(process.cwd(), 'tests/fixtures/audio-lane-from-0a797.json'), 'utf8'));
    initial.audioLanePresentation = readAudioLanePresentation({
      project_id: 'gesture-project', timeline_id: 'gesture-timeline',
      revision_id: 'parent-r1', snapshot_digest: 'fixture-snapshot-r1',
      presentation: { audio_lane: lane },
    }, { projectId: 'gesture-project', timelineId: 'gesture-timeline', revisionId: 'parent-r1' });
    expect(initial.audioLanePresentation.status).toBe('available');
    expect(initial.stableSignature).toBe(signature);
    const h = await setup(undefined, false, initial);
    expect(h.result.current.data!.audioLanePresentation).toBe(initial.audioLanePresentation);

    act(() => h.result.current.editing.handleSelectedClipChange({ volume: 0.35 }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { volume: 0.35 }, expect: { volume: { state: 'present', value: 1 } },
    }] });
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.result.current.data!.audioLanePresentation).toBeUndefined();
    expect(h.result.current.data!.config.clips.map(({ id }) => id)).toEqual(['clip-1', 'clip-2']);
    for (const value of [h.requests[0].bytes, JSON.stringify(h.result.current.data!.config)]) {
      expect(value).not.toContain('audioLanePresentation');
      expect(value).not.toContain('astrid.audio-lane.v1');
      expect(value).not.toContain('a-music');
      expect(value).not.toContain('python3 -m astrid');
    }
    h.unmount();
  });
  it.each(cases)('%s emits one commit with its explicit generated command', async (_name, _handler, patch, op, args) => {
    const h = await setup();
    act(() => h.result.current.editing.handleSelectedClipChange(patch));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({ op, args, select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'] })] });
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    expect(h.requests[0].headers['Idempotency-Key']).toBe(h.requests[0].request.request_id);
    expect(h.requests[0].headers['X-Astrid-Session']).toBe(h.requests[0].request.session_id);
    expect(h.result.current.data!.config.app).toEqual(h.initial.config.app);
    expect(h.result.current.data!.config.tracks![0].app).toEqual(h.initial.config.tracks![0].app);
    expect(h.result.current.data!.config.clips[0].app?.clipSentinel).toBe(true);
    h.unmount();
  });
  it('fade retry replays the same captured request bytes and identity', async () => {
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined);
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: { type: 'fade', duration: 0.37 } }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 3000 });

    expect(h.requests).toHaveLength(2);
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect(h.requests[0].request.request_id).toBe(h.requests[1].request.request_id);
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.requests[1].request.base_revision_id).toBe('parent-r1');
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    h.unmount();
  });
  it('sequential fade side edits each use one command and the acknowledged captured head', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: { type: 'fade', duration: 0.37 } }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    act(() => h.result.current.editing.handleSelectedClipChange({ exit: { type: 'fade-out', duration: 0.23 } }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));

    expect(h.requests).toHaveLength(2);
    expect(h.requests.map(({ request }) => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2']);
    expect(h.requests.map(({ request }) => (request.change as { commands: Array<{ op: string; args: unknown }> }).commands))
      .toEqual([[expect.objectContaining({ op: 'clip.set-fade', args: { fade_in: 0.37 } })],
        [expect.objectContaining({ op: 'clip.set-fade', args: { fade_out: 0.23 } })]]);
    expect(h.requests.every(({ request }) => request.source.via === 'app')).toBe(true);
    expect(h.result.current.editSeqRef.current).toBe(2);
    h.unmount();
  });
  it('mounted entrance fade control sends one exact seconds command and one App commit', async () => {
    const user = userEvent.setup();
    const h = await setup();
    const clip = h.result.current.data!.config.clips.find((candidate) => candidate.id === 'clip-1')!;
    render(<ClipEntranceEffectField
      clip={clip as never}
      onChange={(patch) => h.result.current.editing.handleSelectedClipChange(patch)}
      effectResources={{ effects: [], entrance: [], exit: [], continuous: [], canCreateEffect: false, canUpdateEffect: false } as never}
      canEditEffects={false}
      setEditingEffect={vi.fn()}
      setCreatorOpen={vi.fn()}
    />);

    await user.click(screen.getByRole('combobox'));
    const fadeOption = screen.getByRole('option', { name: 'fade' });
    await user.click(fadeOption);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request).toMatchObject({
      base_revision_id: 'parent-r1', source: { via: 'app' }, dry_run: false,
      change: { commands: [{
        op: 'clip.set-fade', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
        args: { fade_in: 0.4 },
        expect: {
          entrance: { state: 'absent' }, effects: { state: 'absent' }, exit: { state: 'absent' },
        },
      }] },
    });
    expect(h.result.current.data!.config.clips[0].effects).toEqual({ fade_in: 0.4 });
    expect(h.result.current.data!.config.clips[0].entrance).toEqual({ type: 'fade', duration: 0.4 });
    expect(h.requests[0].request.change).toEqual({ commands: [expect.any(Object)] });
    h.unmount();
  });
  it('present-null fade input emits present-null through the same one-command App commit', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: null }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-fade', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { fade_in: null },
      expect: { entrance: { state: 'absent' }, effects: { state: 'absent' }, exit: { state: 'absent' } },
    }] });
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    expect(h.result.current.data!.config.clips[0].entrance).toBeNull();
    h.unmount();
  });
  it('fade clear removes only its coupled side while retaining effect siblings', async () => {
    const base = await initialData();
    const initial = await buildTimelineData({
      ...base.config,
      clips: base.config.clips.map((clip) => clip.id === 'clip-1' ? {
        ...clip, entrance: { type: 'fade', duration: 0.4 },
        effects: { fade_in: 0.4, retained: 9 }, exit: { type: 'fade-out', duration: 0.2 },
      } : clip),
    }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: undefined }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-fade', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { clear: ['fade_in'] },
      expect: {
        entrance: { state: 'present', value: { type: 'fade', duration: 0.4 } },
        effects: { state: 'present', value: { fade_in: 0.4, retained: 9 } },
        exit: { state: 'present', value: { type: 'fade-out', duration: 0.2 } },
      },
    }] });
    expect(h.result.current.data!.config.clips[0].effects).toEqual({ retained: 9 });
    expect(h.result.current.data!.config.clips[0].exit).toEqual({ type: 'fade-out', duration: 0.2 });
    h.unmount();
  });
  it('mounted transition picker sends the exact revisioned reference and adjacent predecessor', async () => {
    const user = userEvent.setup();
    const host = transitionHost();
    const initial = await adjacentTransitionData();
    const h = await setup(undefined, false, initial, 1, undefined, host, 'after');
    const clip = h.result.current.data!.config.clips.find((candidate) => candidate.id === 'after')!;
    render(<VideoEditorRuntimeProvider value={{ astridElementHost: host } as VideoEditorRuntimeContextValue}>
      <ClipTransitionSection
        clip={clip as never}
        onChange={(patch) => h.result.current.editing.handleSelectedClipChange(patch)}
      />
    </VideoEditorRuntimeProvider>);

    await user.click(screen.getByRole('combobox'));
    const transitionOption = screen.getAllByRole('option').find((option) => option.textContent?.includes('crossfade'))!;
    await user.click(transitionOption);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request).toMatchObject({
      base_revision_id: 'parent-r1', source: { via: 'app' },
      change: { commands: [{
        op: 'clip.set-transition', select: 'parent/clip:after', resolved: ['parent/clip:after'],
        args: {
          from_clip: 'parent/clip:before',
          elementRef: { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition', packId: 'rendering' },
          transition: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 },
        },
        expect: expect.objectContaining({
          transition: { state: 'absent' }, elementRef: { state: 'absent' },
          'parent/clip:before::track': { state: 'present', value: 'V1' },
          'parent/track:V1::kind': { state: 'present', value: 'visual' },
        }),
      }] },
    });
    expect(h.requests[0].request.change).toEqual({ commands: [expect.any(Object)] });
    expect(h.result.current.data!.config.clips.find((candidate) => candidate.id === 'after')?.params)
      .toEqual({ preserved: { nested: true } });
    h.unmount();
  });
  it('mounted transition picker captures occurrence selector and all source pins', async () => {
    const user = userEvent.setup();
    const host = transitionHost();
    const initial = await occurrenceTransitionData();
    const h = await setup(undefined, false, initial, 1, undefined, host, 'occ-after');
    const clip = h.result.current.data!.config.clips.find((candidate) => candidate.id === 'occ-after')!;
    render(<VideoEditorRuntimeProvider value={{ astridElementHost: host } as VideoEditorRuntimeContextValue}>
      <ClipTransitionSection
        clip={clip as never}
        onChange={(patch) => h.result.current.editing.handleSelectedClipChange(patch)}
      />
    </VideoEditorRuntimeProvider>);

    await user.click(screen.getByRole('combobox'));
    const transitionOption = screen.getAllByRole('option').find((option) => option.textContent?.includes('crossfade'))!;
    await user.click(transitionOption);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request).toMatchObject({
      project_id: 'gesture-project', timeline_id: 'gesture-timeline', base_revision_id: 'parent-r1',
      source: { via: 'app' },
      scope: {
        target: 'occurrence:occ-A', content: 'this-occurrence', shot_id: 'shot-A',
        shot_revision_id: 'shot-r1', internal_revision_id: 'internal-r1',
      },
      change: { commands: [{
        op: 'clip.set-transition',
        select: 'occurrence:occ-A/clip:source-after',
        resolved: ['occurrence:occ-A/clip:source-after'],
        args: {
          from_clip: 'occurrence:occ-A/clip:source-before',
          elementRef: { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition', packId: 'rendering' },
          transition: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 },
        },
      }] },
    });
    h.unmount();
  });
  it('mounted transition duration edit retains the captured revision, params, reference and siblings', async () => {
    const host = transitionHost();
    const reference = {
      id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition' as const,
      packId: 'rendering', opaqueReference: { keep: null },
    };
    const capturedTransition = {
      type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5,
      params: null, opaqueTransition: { keep: true },
    };
    const initial = await adjacentTransitionData({ transition: capturedTransition, elementRef: reference });
    const h = await setup(undefined, false, initial, 1, undefined, host, 'after');
    const clip = h.result.current.data!.config.clips.find((candidate) => candidate.id === 'after')!;
    render(<VideoEditorRuntimeProvider value={{ astridElementHost: host } as VideoEditorRuntimeContextValue}>
      <ClipTransitionSection
        clip={clip as never}
        onChange={(patch) => h.result.current.editing.handleSelectedClipChange(patch)}
      />
    </VideoEditorRuntimeProvider>);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '0.731' } });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-transition', select: 'parent/clip:after', resolved: ['parent/clip:after'],
      args: {
        transition: { ...capturedTransition, duration: 0.731 }, elementRef: reference,
      },
      expect: {
        track: { state: 'present', value: 'V1' }, at: { state: 'present', value: 2 },
        hold: { state: 'present', value: 2 }, from: { state: 'absent' }, to: { state: 'absent' },
        speed: { state: 'absent' }, clipType: { state: 'present', value: 'hold' },
        'app.astrid.on': { state: 'absent' }, 'app.astrid.until': { state: 'absent' },
        'app.astrid.for': { state: 'absent' },
        transition: { state: 'present', value: capturedTransition },
        elementRef: { state: 'present', value: reference },
        'parent/track:V1::kind': { state: 'present', value: 'visual' },
      },
    }] });
    expect(h.result.current.data!.config.clips.find((candidate) => candidate.id === 'after')?.params)
      .toEqual({ preserved: { nested: true } });
    h.unmount();
  });
  it('mounted transition Remove sends atomic clear with the captured reference', async () => {
    const host = transitionHost();
    const reference = { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition' as const, packId: 'rendering' };
    const initial = await adjacentTransitionData({
      transition: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 }, elementRef: reference,
    });
    const h = await setup(undefined, false, initial, 1, undefined, host, 'after');
    const clip = h.result.current.data!.config.clips.find((candidate) => candidate.id === 'after')!;
    render(<VideoEditorRuntimeProvider value={{ astridElementHost: host } as VideoEditorRuntimeContextValue}>
      <ClipTransitionSection
        clip={clip as never}
        onChange={(patch) => h.result.current.editing.handleSelectedClipChange(patch)}
      />
    </VideoEditorRuntimeProvider>);
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-transition', select: 'parent/clip:after', resolved: ['parent/clip:after'],
      args: { clear: true },
      expect: expect.objectContaining({
        transition: { state: 'present', value: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 } },
        elementRef: { state: 'present', value: reference },
      }),
    }] });
    expect(h.result.current.data!.config.clips.find((candidate) => candidate.id === 'after'))
      .not.toHaveProperty('elementRef');
    h.unmount();
  });
  it('explicit transition present-null stays distinct through the App commit boundary', async () => {
    const host = transitionHost();
    const reference = { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition' as const, packId: 'rendering' };
    const initial = await adjacentTransitionData({
      transition: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 }, elementRef: reference,
    });
    const h = await setup(undefined, false, initial, 1, undefined, host, 'after');
    act(() => h.result.current.editing.handleSelectedClipChange({ transition: null }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-transition', select: 'parent/clip:after', resolved: ['parent/clip:after'],
      args: { transition: null },
      expect: expect.objectContaining({
        transition: { state: 'present', value: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 } },
        elementRef: { state: 'present', value: reference },
      }),
    }] });
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    h.unmount();
  });
  it('cropTop control emits one look commit with its captured original value', async () => {
    const initial = await initialData(false, { cropTop: 0.1 });
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.editing.handleSelectedClipChange({ cropTop: 0.15 }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { crop_top: 0.15 }, expect: { cropTop: { state: 'present', value: 0.1 } },
    }] });
    expect(h.result.current.data!.config.clips[0].cropTop).toBe(0.15);
    h.unmount();
  });
  it('cropBottom control emits one look commit with its captured original value', async () => {
    const initial = await initialData(false, { cropBottom: 0.2 });
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.editing.handleSelectedClipChange({ cropBottom: 0.25 }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { crop_bottom: 0.25 }, expect: { cropBottom: { state: 'present', value: 0.2 } },
    }] });
    expect(h.result.current.data!.config.clips[0].cropBottom).toBe(0.25);
    h.unmount();
  });
  it('cropLeft control emits one look commit with its captured original value', async () => {
    const initial = await initialData(false, { cropLeft: 0.3 });
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.editing.handleSelectedClipChange({ cropLeft: 0.35 }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { crop_left: 0.35 }, expect: { cropLeft: { state: 'present', value: 0.3 } },
    }] });
    expect(h.result.current.data!.config.clips[0].cropLeft).toBe(0.35);
    h.unmount();
  });
  it('cropRight control emits one look commit with its captured original value', async () => {
    const initial = await initialData(false, { cropRight: 0.4 });
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.editing.handleSelectedClipChange({ cropRight: 0.45 }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { crop_right: 0.45 }, expect: { cropRight: { state: 'present', value: 0.4 } },
    }] });
    expect(h.result.current.data!.config.clips[0].cropRight).toBe(0.45);
    h.unmount();
  });
  it('9-frame movement emits a frame nudge from the actual position handler', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleSelectedClipChange({ at: 1.3 }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.nudge', args: { frames: 9 }, expect: { at: { state: 'present', value: 1 }, 'app.astrid.on': { state: 'present', value: '"hello" +2f' }, 'app.astrid.until': { state: 'absent' } } })] });
    h.unmount();
  });
  it('right resize emits one duration command from the actual resize handler', async () => {
    const h = await setup();
    const row = h.result.current.data!.rows[0];
    const action = row.actions[0];
    act(() => h.result.current.resize.onActionResizeStart({ action, row, dir: 'right' }));
    act(() => h.result.current.resize.onClipEdgeResizeEnd({
      session: { pointerId: 1, rowId: 'V1', clipId: 'clip-1', edge: 'right', cursorOffsetPx: 0, initialBoundaryTime: 3, context: { kind: 'free', clipId: 'clip-1', initialStart: 1, initialEnd: 3 }, siblingTimes: [] },
      updates: [{ clipId: 'clip-1', start: 1, end: 3.5 }], cancelled: false,
    }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.set-duration', args: { seconds: 2.5 } })] });
    expect(h.result.current.data!.config.clips[0].hold).toBe(2.5);
    h.unmount();
  });
  it('right visual resize preserves the source edges and emits the requested speed change', async () => {
    const h = await setup(undefined, true);
    const row = h.result.current.data!.rows[0];
    act(() => h.result.current.resize.onActionResizeStart({ action: row.actions[0], row, dir: 'right' }));
    act(() => h.result.current.resize.onClipEdgeResizeEnd({
      session: { pointerId: 1, rowId: 'V1', clipId: 'clip-1', edge: 'right', cursorOffsetPx: 0, initialBoundaryTime: 3, context: { kind: 'free', clipId: 'clip-1', initialStart: 1, initialEnd: 3 }, siblingTimes: [] },
      updates: [{ clipId: 'clip-1', start: 1, end: 3.5 }], cancelled: false,
    }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.set-look', args: { speed: 1.6 } })] });
    expect(h.result.current.data!.config.clips[0]).toMatchObject({ from: 2, to: 6, speed: 1.6 });
    h.unmount();
  });
  it('bulk property editing emits one commit with one command per explicitly selected clip', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleUpdateClips(['clip-1', 'clip-2'], { opacity: 0.4 }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: ['clip-1', 'clip-2'].map((id) => expect.objectContaining({ op: 'clip.set-look', select: `parent/clip:${id}`, args: { opacity: 0.4 } })) });
    h.unmount();
  });
  it('delete leaves a gap and emits one remove commit for the interacted clip', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleDeleteClip('clip-1'));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.remove', args: {}, select: 'parent/clip:clip-1' })] });
    expect(h.result.current.data!.config.clips.map((clip) => [clip.id, clip.at])).toEqual([['clip-2', 5]]);
    h.unmount();
  });
  it('mute clip emits one volume command from the mute handler', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleToggleMute());
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.set-look', args: { volume: 0 } })] });
    h.unmount();
  });
  it('move to an existing track emits one retrack commit', async () => {
    const h = await setup();
    act(() => h.result.current.tracks.applyResolvedClipMove('clip-1', 'V2', 'V2', 1, false));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.set-track', args: { track: 'V2' } })] });
    h.unmount();
  });
  it('selected free track moves apply and save once with one original-track command per clip', async () => {
    const initial = await initialData();
    initial.config.clips.push({ id: 'unrelated', at: 9, hold: 1, clipType: 'hold', track: 'V2', opacity: 0.7 });
    const rebuilt = await buildTimelineData(initial.config, initial.registry);
    rebuilt.head = initial.head;
    const h = await setup(undefined, false, rebuilt);
    const save = vi.fn();
    const off = h.eventBus.on('scheduleSave', save);
    const originalClips = structuredClone(h.initial.config.clips);
    const originalActions = h.initial.rows.flatMap((row) => row.actions);
    act(() => h.result.current.tracks.moveSelectedClipsToTrack('down', new Set(['clip-1', 'clip-2'])));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: ['clip-1', 'clip-2'].map((id) => ({
      op: 'clip.set-track', select: `parent/clip:${id}`, resolved: [`parent/clip:${id}`],
      args: { track: 'V2' }, expect: { track: { state: 'present', value: 'V1' } },
    })) });
    expect(Object.fromEntries(h.result.current.data!.config.clips.map((clip) => [clip.id, clip])))
      .toEqual(Object.fromEntries(originalClips.map((clip) =>
        [clip.id, clip.id === 'unrelated' ? clip : { ...clip, track: 'V2' }])));
    expect(h.result.current.data!.rows.flatMap((row) => row.actions)).toHaveLength(originalActions.length);
    expect(h.result.current.data!.rows.flatMap((row) => row.actions)).toEqual(expect.arrayContaining(originalActions));
    expect(h.result.current.editSeqRef.current).toBe(1);
    off();
    h.unmount();
  });
  it('retains three independent gestures behind one flight and previews each captured authored base', async () => {
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const h = await setup(async (_request, call) => { if (call === 1) await paused; });
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.1 }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.2 }));
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.3 }));
    expect(h.requests).toHaveLength(1);
    release();
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests).toHaveLength(5);
    expect(h.requests.map(({ request }) => request.dry_run)).toEqual([false, true, false, true, false]);
    expect(h.requests.map(({ request }) => request.base_revision_id)).toEqual(['parent-r1', 'parent-r1', 'parent-r2', 'parent-r1', 'parent-r3']);
    expect(h.requests.filter(({ request }) => !request.dry_run).map(({ request }) => (request.change as { commands: unknown[] }).commands[0]))
      .toEqual([0.1, 0.2, 0.3].map((opacity) => expect.objectContaining({ args: { opacity } })));
    expect(new Set(h.requests.map(({ request }) => request.request_id)).size).toBe(5);
    h.unmount();
  });
  it('retries a real handler request with identical bytes and key before sending newer edits', async () => {
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined);
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.1 }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.2 }));
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.3 }));
    expect(h.requests).toHaveLength(1);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 2500 });
    expect(h.requests).toHaveLength(6);
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect(h.requests.map(({ request }) => request.session_sequence)).toEqual([1, 1, 2, 3, 4, 5]);
    h.unmount();
  });
  it('retains command transactions while an interaction defers saves', async () => {
    const h = await setup();
    h.interactionStateRef.current.isDragging = true;
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.1 }));
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.2 }));
    expect(h.requests).toHaveLength(0);
    act(() => {
      h.interactionStateRef.current.isDragging = false;
      notifyInteractionEndIfIdle(h.interactionStateRef);
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    expect(h.requests).toHaveLength(3);
    expect(h.requests.map(({ request }) => request.dry_run)).toEqual([false, true, false]);
    expect(h.requests.map(({ request }) => request.session_sequence)).toEqual([1, 2, 3]);
    h.unmount();
  });
  it('multi-move emits one commit containing the selected clips explicit frame nudges', async () => {
    const h = await setup();
    const data = h.result.current.data!;
    const session = {
      clipId: 'clip-1', draggedClipIds: ['clip-1', 'clip-2'], groupDragEntry: null,
      sourceRowId: 'V1', sourceKind: 'visual', transactionId: 'multi-drag-fixture',
      clipOffsets: data.rows[0].actions.map((action) => ({ clipId: action.id, rowId: 'V1', deltaTime: action.start - 1, initialStart: action.start, initialEnd: action.end })),
    } as InternalDragSession;
    act(() => commitDraggingSession({ session, nextStart: 1.3, dropPosition: null, crossTrackActive: false, liveData: data,
      callbacks: { ...h.result.current.tracks, applyEdit: h.result.current.applyEdit, selectClip: vi.fn(), selectClips: vi.fn() } }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: ['clip-1', 'clip-2'].map((id) => expect.objectContaining({ op: 'clip.nudge', select: `parent/clip:${id}`, args: { frames: 9 } })) });
    h.unmount();
  });
  it('an explicit clear stays absent through a later ordinary edit without resurrection', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: undefined }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.result.current.data!.config.clips[0]).not.toHaveProperty('opacity');
    act(() => h.result.current.editing.handleSelectedClipChange({ volume: 0.5 }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    expect(h.result.current.data!.config.clips[0]).not.toHaveProperty('opacity');
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.clear', args: { keys: ['opacity'] } })] });
    expect(h.requests[1].request.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.set-look', args: { volume: 0.5 } })] });
    h.unmount();
  });
  it('keeps a queued gesture ahead of a later gesture while its server preview is pending', async () => {
    let releaseNetwork!: () => void;
    let releasePreview!: () => void;
    const network = new Promise<void>((resolve) => { releaseNetwork = resolve; });
    const preview = new Promise<void>((resolve) => { releasePreview = resolve; });
    const advance = vi.spyOn(draftStorage, 'advanceTimelineDraftBaseAfterHeadAcknowledgement');
    const h = await setup(async (request, call) => {
      if (call === 1) await network;
      if (request.dry_run && call === 2) await preview;
    });
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.1 }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.2 }));
    releaseNetwork();
    await waitFor(() => expect(h.requests).toHaveLength(2));
    expect(h.requests[1].request).toMatchObject({ dry_run: true, base_revision_id: 'parent-r1' });
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.3 }));
    expect(h.requests).toHaveLength(2);
    expect(advance).not.toHaveBeenCalled();
    releasePreview();
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests.filter(({ request }) => !request.dry_run)
      .map(({ request }) => (request.change as { commands: Array<{ args: unknown }> }).commands[0].args))
      .toEqual([{ opacity: 0.1 }, { opacity: 0.2 }, { opacity: 0.3 }]);
    expect(h.requests.map(({ request }) => request.base_revision_id))
      .toEqual(['parent-r1', 'parent-r1', 'parent-r2', 'parent-r2', 'parent-r3']);
    h.unmount();
  });
  it('keyboard time nudge emits one commit from the same explicit planner used by the editor shell', async () => {
    const h = await setup();
    const edit = buildKeyboardTimeNudgeEdit(h.result.current.data, ['clip-1', 'clip-2'], 0.3)!;
    act(() => h.result.current.applyEdit(edit.mutation, edit.options));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].request.change).toEqual({ commands: ['clip-1', 'clip-2'].map((id) => expect.objectContaining({ op: 'clip.nudge', select: `parent/clip:${id}`, args: { frames: 9 } })) });
    h.unmount();
  });
  it('captures absent and present-null expectations without serializing command metadata into the document', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleSelectedClipChange({ params: { data: { op: 'clear' }, never: 3 } }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    const commands = (h.requests[0].request.change as { commands: Array<{ expect: unknown }> }).commands;
    expect(commands.map((command) => command.expect)).toEqual([{ 'params.data': { state: 'present', value: null } }, { 'params.never': { state: 'absent' } }]);
    expect(gestureCommandsFor(h.result.current.data!)).toHaveLength(2);
    expect(JSON.stringify(h.result.current.data!.config)).not.toContain('editCommands');
    h.unmount();
  });
});


const authoredRelations = [
  ['word', { on: '"hello" +2f', until: 'after "hello"' }],
  ['music', { on: 'beat 2', until: 'beat 4' }],
  ['cut', { on: 'c2', until: 'end of c2' }],
  ['exact neighbour', { on: 'c2', until: 'clip-end "parent/clip:clip-2"' }],
] as const;
async function relationData(astrid: Record<string, unknown>) {
  const base = await initialData();
  return buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => clip.id === 'clip-1'
    ? { ...clip, app: { ...clip.app, astrid } } : clip) }, base.registry, undefined, 1, undefined, base.head);
}
function resizeFirst(h: Awaited<ReturnType<typeof setup>>, end = 6) {
  const row = h.result.current.data!.rows[0];
  const action = row.actions.find((candidate) => candidate.id === 'clip-1')!;
  act(() => h.result.current.resize.onActionResizeStart({ action, row, dir: 'right' }));
  act(() => h.result.current.resize.onClipEdgeResizeEnd({
    session: { pointerId: 1, rowId: 'V1', clipId: 'clip-1', edge: 'right', cursorOffsetPx: 0,
      initialBoundaryTime: 3, context: { kind: 'free', clipId: 'clip-1', initialStart: 1, initialEnd: 3 }, siblingTimes: [] },
    updates: [{ clipId: 'clip-1', start: 1, end }], cancelled: false,
  }));
}
const endChoiceWireEvidence: Array<{ label: string; requests: unknown }> = [];
function recordEndChoiceWire(label: string, requests: unknown) {
  const evidencePath = process.env.E020_WIRE_EVIDENCE_PATH;
  if (!evidencePath) return;
  endChoiceWireEvidence.push({ label, requests });
  writeFileSync(evidencePath, JSON.stringify(endChoiceWireEvidence, null, 2) + '\n');
}

describe('authored end relation choices through the main resize handler', () => {
  for (const [relation, astrid] of authoredRelations) {
    it.each(['keep', null, 'unknown', 'cancel'])(`${relation} end choice %s sends nothing`, async (choice) => {
      const initial = await relationData(astrid);
      const prompt = vi.spyOn(window, 'prompt').mockReturnValue(choice);
      const h = await setup(undefined, false, initial);
      const history = vi.fn(); h.eventBus.on('beforeCommit', history);
      const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
      resizeFirst(h);
      expect(prompt).toHaveBeenCalledOnce();
      expect(prompt.mock.calls[0][0]).toContain(astrid.until);
      expect(h.result.current.data).toBe(initial);
      expect(h.result.current.editSeqRef.current).toBe(0);
      expect(h.requests).toHaveLength(0);
      expect(history).not.toHaveBeenCalled();
      expect(draft).not.toHaveBeenCalled();
      h.unmount();
    });
    it.each(['detach', 'adjust-offset', 're-anchor'])(`${relation} end choice %s sends one captured typed request`, async (choice) => {
      const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce(choice);
      if (choice === 're-anchor') prompt.mockReturnValueOnce('clip-end "parent/clip:clip-2"');
      if (choice !== 'detach') prompt.mockReturnValueOnce('-0.125').mockReturnValueOnce('62');
      const initial = await relationData({ ...astrid, opaque: { value: null }, fixed_start: true });
      const before = structuredClone(initial.config);
      const h = await setup(undefined, false, initial);
      const history = vi.fn(); h.eventBus.on('beforeCommit', history);
      resizeFirst(h);
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      expect(h.requests).toHaveLength(1);
      const selected = { target: 'parent/clip:clip-1', edge: 'end', choice,
        ...(choice === 're-anchor' ? { anchor: 'clip-end "parent/clip:clip-2"' } : {}),
        ...(choice !== 'detach' ? { offset_seconds: -0.125, offset_frames: 62 } : {}) };
      expect(h.requests[0].request).toMatchObject({ source: { via: 'app' }, base_revision_id: 'parent-r1',
        change: { commands: [{ op: 'clip.set-duration', select: 'parent/clip:clip-1',
          resolved: ['parent/clip:clip-1'], args: { seconds: 4, relation_choices: [selected] },
          expect: { '': { state: 'present', value: before.clips[0] }, at: { state: 'present', value: 1 },
            hold: { state: 'present', value: 2 }, 'app.astrid.on': { state: 'present', value: astrid.on },
            'app.astrid.until': { state: 'present', value: astrid.until }, 'app.astrid.for': { state: 'absent' },
            'app.astrid.fixed_start': { state: 'present', value: true } } }] } });
      // This fixture records the wire, not Astrid resolution. In particular the
      // App does not guess the new end from a Moment or apply pointer delta twice.
      expect(h.result.current.data!.config).toEqual(before);
      expect(h.result.current.data!.registry).toBe(initial.registry);
      expect(history).toHaveBeenCalledTimes(1);
      expect(history.mock.calls[0]).toEqual([initial, expect.objectContaining({ semantic: true, transactionId: expect.any(String) })]);
      expect(h.result.current.editSeqRef.current).toBe(1);
      expect(h.compatibilityRequests).toEqual([]);
      recordEndChoiceWire(`${relation}/${choice}`, h.requests);
      h.unmount();
    });
  }
  it('an unchanged tied end sends nothing without prompting', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    const initial = await relationData({ on: 'beat 2', until: 'beat 4' });
    const h = await setup(undefined, false, initial);
    resizeFirst(h, 3);
    expect(prompt).not.toHaveBeenCalled();
    expect(h.result.current.data).toBe(initial);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('captures present-null separately from absent and preserves opaque siblings', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    const initial = await relationData({ on: null, until: 'beat 4', for: null, opaque: { keep: true } });
    const h = await setup(undefined, false, initial);
    resizeFirst(h, 3.5);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({
      args: { seconds: 2.5, relation_choices: [{ target: 'parent/clip:clip-1', edge: 'end', choice: 'detach' }] },
      expect: expect.objectContaining({ 'app.astrid.on': { state: 'present', value: null },
        'app.astrid.for': { state: 'present', value: null }, 'app.astrid.fixed_start': { state: 'absent' } }),
    })] });
    expect(h.result.current.data!.config).toEqual(initial.config);
    h.unmount();
  });
  it.each([
    ['re-anchor', null], ['re-anchor', ''], ['adjust-offset', null],
    ['adjust-offset', ''], ['adjust-offset', 'Infinity'], ['adjust-offset', '0', null],
    ['adjust-offset', '0', '0.5'], ['adjust-offset', '0', 'NaN'],
  ])('cancel or invalid typed input %j writes nothing', async (...answers) => {
    const prompt = vi.spyOn(window, 'prompt');
    for (const answer of answers) prompt.mockReturnValueOnce(answer);
    const initial = await relationData({ until: 'beat 4 +2f -0.1s' });
    const h = await setup(undefined, false, initial);
    const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    resizeFirst(h);
    expect(h.result.current.data).toBe(initial);
    expect(h.requests).toHaveLength(0);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(draft).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled();
    h.unmount();
  });
  it('keeps mixed authored units and sends absolute components without rounding or delta addition', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('adjust-offset').mockReturnValueOnce('-0.1').mockReturnValueOnce('11');
    const initial = await relationData({ until: 'beat 4 +2f -0.1s' });
    const h = await setup(undefined, false, initial);
    resizeFirst(h, 3.5);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({
      args: { seconds: 2.5, relation_choices: [{ target: 'parent/clip:clip-1', edge: 'end',
        choice: 'adjust-offset', offset_seconds: -0.1, offset_frames: 11 }] },
      expect: expect.objectContaining({ 'app.astrid.until': { state: 'present', value: 'beat 4 +2f -0.1s' } }),
    })] });
    expect((initial.config.clips[0].app?.astrid as Record<string, unknown>)?.until).toBe('beat 4 +2f -0.1s');
    h.unmount();
  });
  it.each(['rejected', 'refused'] as const)('late %s leaves the whole local authored graph unchanged', async (outcome) => {
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    const initial = await relationData({ on: 'beat 2', until: 'beat 4', opaque: { keep: null } });
    const before = structuredClone(initial.config);
    const h = await setup(async () => outcome, false, initial);
    resizeFirst(h);
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.requests).toHaveLength(1);
    expect(h.savedSeqRef.current).toBe(0);
    expect(h.result.current.data!.config).toEqual(before);
    expect(initial.config).toEqual(before);
    h.unmount();
  });
  it('retries a lost end-choice response with identical key, base, command and offsets', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('adjust-offset').mockReturnValueOnce('-0.1').mockReturnValueOnce('11');
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined, false,
      await relationData({ until: 'beat 4 +2f -0.1s' }));
    resizeFirst(h, 3.5);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 5000 });
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].bytes).toBe(h.requests[0].bytes);
    expect(h.requests[1].request.request_id).toBe(h.requests[0].request.request_id);
    expect(h.result.current.editSeqRef.current).toBe(1);
    h.unmount();
  });
  it('rebases a queued end choice from its captured base using only the returned preview commands', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const h = await setup(async (_request, call) => { if (call === 1) await held; }, false,
      await relationData({ until: 'beat 4', opaque: { keep: null } }));
    act(() => h.result.current.editing.handleSelectedClipChange({ opacity: 0.4 }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    const captured = structuredClone(h.result.current.data!.config);
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    resizeFirst(h, 3.5);
    expect(h.requests).toHaveLength(1);
    release();
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    expect(h.requests).toHaveLength(3);
    const [, preview, accepted] = h.requests.map((entry) => entry.request);
    expect(preview).toMatchObject({ dry_run: true, base_revision_id: 'parent-r1', source: { via: 'app' } });
    expect(accepted).toMatchObject({ dry_run: false, base_revision_id: 'parent-r2', source: { via: 'app' } });
    expect(accepted.request_id).not.toBe(preview.request_id);
    expect(accepted.change).toEqual(preview.change);
    expect(preview.change).toEqual({ commands: [expect.objectContaining({ op: 'clip.set-duration',
      args: { seconds: 2.5, relation_choices: [{ target: 'parent/clip:clip-1', edge: 'end', choice: 'detach' }] },
      expect: expect.objectContaining({ '': { state: 'present', value: captured.clips[0] } }),
    })] });
    expect(h.result.current.data!.config).toEqual(captured);
    recordEndChoiceWire('queued-end-choice-preview-rebase', h.requests);
    h.unmount();
  });
  it('adopts a canonical choice document through the existing poll seam without a second save', async () => {
    const initial = await relationData({ until: 'beat 4', opaque: { keep: null } });
    const h = await setup(undefined, false, initial);
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    resizeFirst(h, 3.5);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.result.current.data!.config).toEqual(initial.config);
    // Synthetic canonical document input to the App poll seam, not an executed
    // Astrid result. A owns proof that Runtime materializes this actual choice.
    const canonical = await buildTimelineData({ ...initial.config, clips: initial.config.clips.map((clip) => {
      if (clip.id !== 'clip-1') return clip;
      const { until: _until, ...astrid } = clip.app!.astrid as Record<string, unknown>;
      return { ...clip, hold: 2.5, app: { ...clip.app, astrid: { ...astrid, for: 2.5 } } };
    }) }, initial.registry, undefined, h.configVersionRef.current, undefined, h.headRevisionRef.current);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    const poll = renderHook(() => usePollSync({ provider: h.provider,
      queries: { timelineQuery: { data: canonical, isLoading: false }, assetRegistryQuery: { data: initial.registry } },
      ...h.result.current, savedSeqRef: h.savedSeqRef, configVersionRef: h.configVersionRef, headRevisionRef: h.headRevisionRef,
      lastSavedSignatureRef: h.lastSavedSignatureRef, interactionStateRef: h.interactionStateRef,
      isSavingRef: h.result.current.persistence.isSavingRef, pendingOpsRef: { current: 0 },
    }));
    await waitFor(() => expect(h.result.current.data!.config).toEqual(canonical.config));
    expect(h.requests).toHaveLength(1);
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(history).not.toHaveBeenCalled();
    expect((h.result.current.data!.config.clips[0].app?.astrid as Record<string, unknown>).opaque).toEqual({ keep: null });
    poll.unmount(); h.unmount();
  });
  it('pointer cancellation emits no choice, draft, history or request', async () => {
    const initial = await relationData({ until: 'beat 4' });
    const h = await setup(undefined, false, initial);
    const row = initial.rows[0]; const action = row.actions[0];
    const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    const prompt = vi.spyOn(window, 'prompt');
    act(() => h.result.current.resize.onActionResizeStart({ action, row, dir: 'right' }));
    act(() => h.result.current.resize.onClipEdgeResizeEnd({ session: { pointerId: 1, rowId: 'V1', clipId: 'clip-1', edge: 'right', cursorOffsetPx: 0,
      initialBoundaryTime: 3, context: { kind: 'free', clipId: 'clip-1', initialStart: 1, initialEnd: 3 }, siblingTimes: [] },
      updates: [{ clipId: 'clip-1', start: 1, end: 4 }], cancelled: true }));
    expect(h.result.current.data).toBe(initial);
    expect(prompt).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0); expect(h.result.current.editSeqRef.current).toBe(0);
    h.unmount();
  });
  it.each(['sequence', 'bed', 'missing occurrence pins'] as const)('keeps %s end resize on its characterized fallback', async (kind) => {
    const base = await relationData({ until: 'beat 4', ...(kind === 'sequence' ? { sequence: { id: 'steps', index: 1 } } : {}) });
    const initial = await buildTimelineData({ ...base.config,
      ...(kind === 'bed' ? { app: { astrid: { v: 2, music_beds: { 'parent/clip:clip-1': { source: base.config.clips[0] } } } } } : {}),
      clips: base.config.clips.map((clip) => kind === 'missing occurrence pins' && clip.id === 'clip-1'
        ? { ...clip, app: { ...clip.app, canonical: { occurrenceId: 'occ-A' } } } : clip),
    }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    const prompt = vi.spyOn(window, 'prompt');
    resizeFirst(h, 3.5);
    expect(prompt).not.toHaveBeenCalled();
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('overlap alone never opens the authored relation prompt', async () => {
    const base = await initialData();
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => ({ ...clip, app: {} })) }, base.registry,
      undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    const prompt = vi.spyOn(window, 'prompt');
    resizeFirst(h);
    expect(prompt).not.toHaveBeenCalled();
    h.unmount();
  });
  it('a changed captured source refuses before prompting or scheduling the end choice', async () => {
    const initial = await relationData({ until: 'beat 4' });
    const h = await setup(undefined, false, initial);
    const row = initial.rows[0]; const action = row.actions[0];
    act(() => h.result.current.resize.onActionResizeStart({ action, row, dir: 'right' }));
    h.result.current.dataRef.current = { ...initial, head: { ...initial.head!, headRevisionId: 'parent-r2' } };
    const prompt = vi.spyOn(window, 'prompt');
    act(() => h.result.current.resize.onClipEdgeResizeEnd({ session: { pointerId: 1, rowId: 'V1', clipId: 'clip-1', edge: 'right', cursorOffsetPx: 0,
      initialBoundaryTime: 3, context: { kind: 'free', clipId: 'clip-1', initialStart: 1, initialEnd: 3 }, siblingTimes: [] },
      updates: [{ clipId: 'clip-1', start: 1, end: 4 }], cancelled: false }));
    expect(prompt).not.toHaveBeenCalled(); expect(h.requests).toHaveLength(0);
    expect(h.result.current.editSeqRef.current).toBe(0);
    h.unmount();
  });
  it('uses real occurrence source identity and captured closure pins, never the display id', async () => {
    const base = await relationData({ on: 'beat 2', until: 'beat 4' });
    const raw = structuredClone(base.config.clips[0]);
    const initial = await buildTimelineData({ ...base.config, clips: [{ ...raw, app: { ...raw.app, canonical: {
      projectId: 'gesture-project', parentDocumentId: 'gesture-timeline', headRevisionId: 'parent-r1', occurrenceId: 'occ-A',
      shotId: 'shot-A', revisionId: 'shot-r1', internalTimelineRevisionId: 'internal-r1', outputIdentity: 'out-A',
      sourceClipId: 'source-hold', sourceClip: { ...raw, id: 'source-hold' },
    } } }, base.config.clips[1]] }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    resizeFirst(h, 3.5);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' },
      scope: { target: 'occurrence:occ-A', content: 'this-occurrence', shot_id: 'shot-A', shot_revision_id: 'shot-r1',
        internal_revision_id: 'internal-r1', complete: ['clips', 'tracks'], projection_version: 1 },
      change: { commands: [{ select: 'occurrence:occ-A/clip:source-hold', resolved: ['occurrence:occ-A/clip:source-hold'],
        args: { seconds: 2.5, relation_choices: [{ target: 'occurrence:occ-A/clip:source-hold', edge: 'end', choice: 'detach' }] } }] } });
    expect(h.result.current.data!.config).toEqual(initial.config);
    recordEndChoiceWire('occurrence-source-pins', h.requests);
    h.unmount();
  });
});
async function videoData(audioTrack: boolean) {
  const base = await initialData(true);
  return buildTimelineData({ ...base.config,
    tracks: [...base.config.tracks!, ...(audioTrack ? [{ id: 'A1', kind: 'audio' as const, label: 'Audio' }] : [])],
    clips: base.config.clips.map((clip) => clip.id === 'clip-1' ? { ...clip, asset: 'video', volume: 0.7,
      app: { ...clip.app, astrid: { on: '"hello" +2f', cut: 'c2', layer: 'picture', sequence: { id: 'steps', index: 0 } } },
    } : clip),
  }, { assets: { video: { file: 'https://fixture.test/video.mp4', type: 'video/mp4', duration: 10 } } }, undefined, 1, undefined, base.head);
}
describe('supported detach and explicit unconverted structural seams', () => {
  it('audio detach into an existing track emits one command with the exact allocated child and captured source', async () => {
    const initial = await videoData(true);
    const h = await setup(undefined, true, initial);
    act(() => h.result.current.editing.handleDetachAudioClip('clip-1'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    const child = h.result.current.data!.config.clips.find((clip) => !initial.config.clips.some((before) => before.id === clip.id))!;
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.detach-audio', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { track: 'A1' }, created: [`parent/clip:${child.id}`],
      expect: { '': { state: 'present', value: initial.config.clips.find((clip) => clip.id === 'clip-1') } },
    }] });
    expect(child).toMatchObject({ asset: 'video', from: 2, to: 6, speed: 2, volume: 0.7, track: 'A1',
      app: { clipSentinel: true, astrid: { on: '"hello" +2f' } } });
    expect(child).toEqual({ ...initial.config.clips.find((clip) => clip.id === 'clip-1'),
      id: child.id, track: 'A1', app: { clipSentinel: true, astrid: { on: '"hello" +2f' } },
    });
    for (const key of ['cut', 'layer', 'sequence', 'sequence_index']) expect(child.app?.astrid).not.toHaveProperty(key);
    expect(h.result.current.data!.config.clips.find((clip) => clip.id === 'clip-1')?.volume).toBe(0);
    h.unmount();
  });
  it.each([false, true])('new-track audio detach is one ordered batch (unavailable retry: %s)', async (retry) => {
    const initial = await videoData(false);
    const source = initial.config.clips.find((clip) => clip.id === 'clip-1')!;
    source.params = { data: { op: 'clear' }, opaque: null };
    source.app = { ...source.app, opaque: { nested: null }, astrid: {
      ...source.app?.astrid, sequence_index: 0, custom: { keep: true },
    } };
    // Exercise the existing allocator's collision suffix as well as retry stability.
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    const collision = { ...source, id: 'clip-1-123456789', track: 'V2' };
    const rebuilt = await buildTimelineData({ ...initial.config, clips: [...initial.config.clips, collision] }, initial.registry);
    rebuilt.head = initial.head;
    const before = structuredClone(rebuilt.config);
    const h = await setup(async (_request, call) => retry && call === 1 ? 'unavailable' : undefined, true, rebuilt);
    const save = vi.fn();
    const off = h.eventBus.on('scheduleSave', save);
    act(() => h.result.current.editing.handleDetachAudioClip('clip-1'));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    const childId = 'clip-1-123456789-1';
    const track = { id: 'A1', kind: 'audio', label: 'A1', scale: 1, fit: 'contain', opacity: 1, blendMode: 'normal' };
    const commands = [{
      op: 'timeline.add', select: 'parent/track:A1', args: { track }, created: ['parent/track:A1'],
      expect: { 'parent/track:A1::': { state: 'absent' } },
    }, {
      op: 'clip.detach-audio', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { track: 'A1' }, created: [`parent/clip:${childId}`],
      expect: { '': { state: 'present', value: before.clips.find((clip) => clip.id === 'clip-1') } },
    }];
    expect(h.requests[0].request.change).toEqual({ commands });
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    expect(gestureCommandsFor(h.result.current.data!)).toEqual(commands);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 2500 });
    expect(h.requests).toHaveLength(retry ? 2 : 1);
    if (retry) {
      expect(h.requests[1].bytes).toBe(h.requests[0].bytes);
      expect(h.requests[1].headers).toEqual(h.requests[0].headers);
    }
    const { cut: _cut, layer: _layer, sequence: _sequence, sequence_index: _index, ...astrid } = source.app!.astrid!;
    expect(h.result.current.data!.config.clips).toEqual([
      ...before.clips.map((clip) => clip.id === source.id ? { ...clip, volume: 0 } : clip),
      { ...source, id: childId, track: 'A1', app: { ...source.app, astrid } },
    ]);
    expect(h.result.current.data!.config.tracks!.find((row) => row.id === 'A1')).toEqual({ ...track, app: { scaleAppliesToPositionedClips: true } });
    expect(h.result.current.data!.config.tracks!.filter((row) => row.id === 'A1')).toHaveLength(1);
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.selectClip).not.toHaveBeenCalled();
    expect(h.result.current.selectedClipId).toBe('clip-1');
    expect(h.compatibilityRequests).toEqual([]);
    off();
    h.unmount();
  });
  it('failed new-track detach keeps the complete optimistic batch unsaved without split track/child state', async () => {
    const initial = await videoData(false);
    const h = await setup(async () => 'failed', true, initial);
    act(() => h.result.current.editing.handleDetachAudioClip('clip-1'));
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.savedSeqRef.current).toBe(0);
    expect(h.result.current.data!.head).toEqual(initial.head);
    expect(h.result.current.editSeqRef.current).toBe(1);
    const child = h.result.current.data!.config.clips.find((clip) => !initial.config.clips.some((before) => before.id === clip.id))!;
    expect(child).toBeDefined();
    expect(h.result.current.data!.config.tracks!.filter((track) => track.id === child.track)).toHaveLength(1);
    expect(h.result.current.data!.config.clips.find((clip) => clip.id === 'clip-1')!.volume).toBe(0);
    expect((h.requests[0].request.change as { commands: unknown[] }).commands).toHaveLength(2);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it('read-only new-track detach refuses before any track or child edit', async () => {
    const initial = await videoData(false);
    const h = await setup(undefined, true, initial, 1, {
      check: () => ({ allowed: false, reason: 'timeline_read_only' }),
      checkTimeline: () => ({ allowed: false, reason: 'timeline_read_only' }),
    });
    act(() => h.result.current.editing.handleDetachAudioClip('clip-1'));
    expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toEqual([]);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it.each(['missing', 'muted', 'image', 'audio', 'missing-asset', 'invalid-source', 'ambiguous-source', 'invalid-track'] as const)('%s audio detach sends nothing', async (kind) => {
    const initial = await videoData(kind === 'audio' || kind === 'invalid-track');
    if (kind === 'muted') initial.config.clips[0].volume = 0;
    if (kind === 'image') initial.registry.assets.video.type = 'image/png';
    if (kind === 'audio') initial.config.clips[0].track = 'A1';
    if (kind === 'missing-asset') delete initial.config.clips[0].asset;
    if (kind === 'invalid-source') initial.config.clips[0].id = 'invalid/source';
    if (kind === 'invalid-track') initial.config.tracks!.find((track) => track.id === 'A1')!.id = 'invalid/track';
    const rebuilt = await buildTimelineData(initial.config, initial.registry);
    rebuilt.head = initial.head;
    const h = await setup(undefined, true, rebuilt);
    if (kind === 'ambiguous-source') h.result.current.dataRef.current!.config.clips.push({ ...rebuilt.config.clips[0] });
    const before = structuredClone(h.result.current.data!.config);
    act(() => h.result.current.editing.handleDetachAudioClip(kind === 'missing' ? 'absent' : kind === 'invalid-source' ? 'invalid/source' : 'clip-1'));
    expect(h.result.current.data!.config).toEqual(before);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toEqual([]);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it('tied split refuses without inventing clip.split or cut.split', async () => {
    const h = await setup();
    act(() => h.result.current.editing.handleSplitClipAtTime('clip-1', 2));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.result.current.data!.config.clips).toHaveLength(2);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
});

async function interleavedTrackData() {
  const base = await initialData();
  const tracks = [
    { id: 'V1', kind: 'visual' as const, label: 'Picture one' },
    { id: 'A1', kind: 'audio' as const, label: 'Sound one' },
    { id: 'V2', kind: 'visual' as const, label: 'Picture two' },
    { id: 'A2', kind: 'audio' as const, label: 'Sound two' },
  ].map((track) => ({ ...track, opaque: { sentinel: track.id, nullable: null },
    nullable: null, app: { sibling: { track: track.id }, astrid: { extension: null } } }));
  return buildTimelineData({ ...base.config, tracks }, base.registry, undefined, 1, undefined, base.head);
}

describe('D008 complete parent track reorder wire adaptation', () => {
  it.each([
    ['cross-kind forward', 'V1', 'A2', ['A1', 'V2', 'A2', 'V1']],
    ['cross-kind backward', 'A2', 'V1', ['A2', 'V1', 'A1', 'V2']],
    ['same-kind', 'V1', 'V2', ['A1', 'V2', 'V1', 'A2']],
  ] as const)('%s preserves the exact array move and sends one complete guarded permutation', async (_name, active, over, order) => {
    const initial = await interleavedTrackData();
    const before = structuredClone(initial.config);
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.tracks.handleMoveTrack(active, over));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.compatibilityRequests).toEqual([]);
    const expectedOrder = ['V1', 'A1', 'V2', 'A2'].map((id) => `parent/track:${id}`);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'timeline.reorder', select: `parent/track:${active}`, resolved: [`parent/track:${active}`],
      args: { order: order.map((id) => `parent/track:${id}`), expected_order: expectedOrder },
      expect: { [`parent/track:${active}::track_order`]: { state: 'present', value: expectedOrder } },
    }] });
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    const expectedTracks = order.map((id) => before.tracks!.find((track) => track.id === id));
    expect(h.result.current.data!.tracks).toEqual(expectedTracks);
    expect(h.result.current.data!.resolvedConfig.tracks).toEqual(expectedTracks);
    expect(h.result.current.data!.config).toEqual({ ...before, tracks: expectedTracks });
    expect(h.result.current.selectedTrackId).toBe(active);
    expect(initial.config).toEqual(before);
    h.unmount();
  });

  it.each([['V1', 'V1'], ['V1', 'missing'], ['missing', 'A1']])('drop %s onto %s is a no-op with zero commits', async (active, over) => {
    const h = await setup(undefined, false, await interleavedTrackData());
    const before = h.result.current.data;
    const selected = h.result.current.selectedTrackId;
    act(() => h.result.current.tracks.handleMoveTrack(active, over));
    expect(h.result.current.data).toBe(before);
    expect(h.result.current.selectedTrackId).toBe(selected);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });

  it('cross-kind retry retains the complete captured order, request bytes and identity', async () => {
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined, false, await interleavedTrackData());
    act(() => h.result.current.tracks.handleMoveTrack('V1', 'A2'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 2500 });
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].bytes).toBe(h.requests[0].bytes);
    expect(h.requests[1].headers).toEqual(h.requests[0].headers);
    expect(h.requests[1].request.request_id).toBe(h.requests[0].request.request_id);
    expect(h.requests[1].request.base_revision_id).toBe('parent-r1');
    expect(h.result.current.data!.config.tracks!.map((track) => track.id)).toEqual(['A1', 'V2', 'A2', 'V1']);
    h.unmount();
  });
});

describe('WRITERS census converted handlers and route intercept', () => {
  it.each(['patch', 'proposal'] as const)('%s property batch reaches one generated commit with captured expectations', async (writer) => {
    const h = await setup();
    const patch = { version: 1, operations: [
      { op: 'clip.update' as const, target: 'clip-1', payload: { opacity: 0.3, params: { data: 'caption' } } },
      { op: 'clip.update' as const, target: 'clip-2', payload: { entrance: { type: 'fade', duration: 0.2 } } },
    ] };
    act(() => {
      if (writer === 'patch') h.result.current.ops.apply(patch);
      else {
        const proposals = createProposalRuntime({ timelineOps: h.result.current.ops,
          reader: createTimelineReader({ data: () => h.result.current.data! }) });
        const proposal = proposals.create({ source: 'writer-census', baseVersion: 1, patch });
        proposals.accept(proposal.id);
      }
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.requests[0].request.change).toEqual({ commands: [
      { op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { opacity: 0.3 }, expect: { opacity: { state: 'present', value: 0.9 } } },
      { op: 'clip.set-param', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { path: 'data', value: 'caption' }, expect: { 'params.data': { state: 'present', value: null } } },
      { op: 'clip.set-look', select: 'parent/clip:clip-2', resolved: ['parent/clip:clip-2'], args: { entrance: { type: 'fade', duration: 0.2 } }, expect: { entrance: { state: 'absent' } } },
    ] });
    expect(h.result.current.data!.config.app).toEqual(h.initial.config.app);
    expect(h.result.current.data!.config.clips[0].app).toEqual(h.initial.config.clips[0].app);
    h.unmount();
  });
  it.each(['patch', 'proposal'] as const)('%s deletion uses the captured clip and leaves one transaction', async (writer) => {
    const h = await setup();
    const patch = { version: 1, operations: [
      { op: 'clip.remove' as const, target: 'clip-1' }, { op: 'clip.remove' as const, target: 'clip-2' },
    ] };
    act(() => {
      if (writer === 'patch') h.result.current.ops.apply(patch);
      else {
        const proposals = createProposalRuntime({ timelineOps: h.result.current.ops, reader: createTimelineReader({ data: h.initial }) });
        const proposal = proposals.create({ source: 'writer-delete', baseVersion: 1, patch });
        proposals.accept(proposal.id);
      }
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.requests[0].request.change).toEqual({ commands: h.initial.config.clips.map((clip) => ({
      op: 'clip.remove', select: `parent/clip:${clip.id}`, resolved: [`parent/clip:${clip.id}`], args: {}, expect: { '': { state: 'present', value: clip } },
    })) });
    h.unmount();
  });
  it('catalog parameter merge uses the captured head and only the requested keys', async () => {
    const initial = await initialData();
    initial.config.clips[0].params = { ...initial.config.clips[0].params, retained: { opaque: true } };
    const fixture = wireFixture(initial);
    const adapter = new AstridElementOperationAdapter(buildReighAgentElementContext({}), createElementTimelineRoutes({
      loadTimeline: async () => ({ config: initial.config, configVersion: 1, head: initial.head }),
      loadAssetRegistry: async () => initial.registry,
      saveTimeline: fixture.provider.saveTimeline.bind(fixture.provider),
      saveTimelineAtHead: fixture.provider.saveTimelineAtHead.bind(fixture.provider),
    }), 'gesture-project');
    const result = await adapter.execute({ name: 'timeline.update_element', project: 'gesture-project', timeline: 'gesture-timeline',
      expected_version: 1, clip_id: 'clip-1', params: { data: 'Updated', added: null } });
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.compatibilityRequests).toEqual([]);
    expect(fixture.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(fixture.requests[0].request.change).toEqual({ commands: [
      { op: 'clip.set-param', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { path: 'data', value: 'Updated' }, expect: { 'params.data': { state: 'present', value: null } } },
      { op: 'clip.set-param', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { path: 'added', value: null }, expect: { 'params.added': { state: 'absent' } } },
    ] });
    expect(result.config!.clips[0].params).toEqual({ data: 'Updated', added: null, retained: { opaque: true } });
    expect(result.config!.clips[0].app).toEqual(initial.config.clips[0].app);
  });
  it.each([
    ['mixed unsupported track batch', [{ op: 'clip.update', target: 'clip-1', payload: { opacity: 0.2 } }, { op: 'track.update', target: 'V1', payload: { app: { newMetadata: true } } }]],
    ['replacement properties', [{ op: 'clip.update', target: 'clip-1', payload: { mode: 'replace', opacity: 0.2 } }]],
    ['omitted params', [{ op: 'clip.update', target: 'clip-1', payload: { params: { added: 1 } } }]],
    ['top-level keyframes', [{ op: 'clip.update', target: 'clip-1', payload: { keyframes: {} } }]],
  ])('%s is an explicit whole-batch fallback without a partial commit', async (_row, operations) => {
    const h = await setup();
    act(() => h.result.current.ops.apply({ version: 1, operations: operations as import('@/sdk/video/timeline/patch.ts').TimelinePatchOperation[] }));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('stale proposal accept sends neither a generated commit nor compatibility publication', async () => {
    const h = await setup();
    const proposals = createProposalRuntime({ timelineOps: h.result.current.ops, reader: createTimelineReader({ data: h.initial }) });
    const proposal = proposals.create({ source: 'census-stale', baseVersion: 2, patch: { version: 2, operations: [{ op: 'clip.update', target: 'clip-1', payload: { opacity: 0.1 } }] } });
    expect(() => proposals.accept(proposal.id)).toThrow('baseVersion');
    expect(h.requests).toHaveLength(0);
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.result.current.editSeqRef.current).toBe(0);
    h.unmount();
  });
});

describe('WRITERS W13 catalog fade census', () => {
  function catalogAdapter(initial: TimelineData, fixture: ReturnType<typeof wireFixture>, authority = () => {}) {
    return new AstridElementOperationAdapter(buildReighAgentElementContext({}), createElementTimelineRoutes({
      loadTimeline: async () => ({ config: initial.config, configVersion: 1, head: initial.head }),
      loadAssetRegistry: async () => initial.registry,
      saveTimeline: fixture.provider.saveTimeline.bind(fixture.provider),
      saveTimelineAtHead: fixture.provider.saveTimelineAtHead.bind(fixture.provider),
    }, authority), 'gesture-project');
  }
  const fadeOperation = {
    name: 'timeline.set_clip_fade' as const, project: 'gesture-project', timeline: 'gesture-timeline',
    expected_version: 1, clip_id: 'clip-1',
  };
  it.each([
    { fade_in: 0 }, { fade_out: 0.4 }, { fade_in: 0.2, fade_out: 0.3 },
  ])('W13 sends one coupled command with captured base and expect: %j', async (args) => {
    const initial = await initialData();
    const clip = initial.config.clips[0];
    clip.effects = { fade_in: 0.1, opaque: { preserved: true } };
    clip.entrance = { type: 'fade', duration: 0.1 };
    clip.exit = { type: 'slide-out', duration: 0.6 };
    const before = structuredClone(initial.config);
    const fixture = wireFixture(initial);
    const result = await catalogAdapter(initial, fixture).execute({ ...fadeOperation, ...args });
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.compatibilityRequests).toEqual([]);
    expect(fixture.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(fixture.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-fade', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args,
      expect: {
        entrance: { state: 'present', value: before.clips[0].entrance },
        effects: { state: 'present', value: before.clips[0].effects },
        exit: { state: 'present', value: before.clips[0].exit },
      },
    }] });
    expect(result.config!.clips[0]).toEqual({ ...before.clips[0],
      effects: { ...before.clips[0].effects, ...args },
      ...(args.fade_in === undefined ? {} : { entrance: { type: 'fade', duration: args.fade_in } }),
      ...(args.fade_out === undefined ? {} : { exit: { type: 'fade-out', duration: args.fade_out } }),
    });
    expect(result.config!.clips[1]).toEqual(before.clips[1]);
    expect(initial.config).toEqual(before);
  });
  it.each(['absent', 'null'] as const)('W13 keeps %s effects distinct in expect', async (state) => {
    const initial = await initialData();
    if (state === 'null') Object.assign(initial.config.clips[0], { effects: null });
    const fixture = wireFixture(initial);
    await catalogAdapter(initial, fixture).execute({ ...fadeOperation, fade_in: 0.5 });
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].request.change).toMatchObject({ commands: [{ expect: {
      effects: state === 'null' ? { state: 'present', value: null } : { state: 'absent' },
      entrance: { state: 'absent' }, exit: { state: 'absent' },
    } }] });
  });
  it('W13 explicitly marks the legacy effects-array compatibility request without a partial command', async () => {
    const initial = await initialData();
    Object.assign(initial.config.clips[0], { effects: [{ type: 'legacy-effect' }] });
    const fixture = wireFixture(initial, undefined, catalogFadeFallback);
    await expect(catalogAdapter(initial, fixture).execute({ ...fadeOperation, fade_in: 0.5 }))
      .rejects.toThrow(`Marked census fallback ${catalogFadeFallback}`);
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.compatibilityRequests).toEqual(['/v1/projects/gesture-project/timelines/gesture-timeline/composition-revisions']);
  });
  it.each(['refused', 'rejected'] as const)('W13 %s never retries as a snapshot', async (outcome) => {
    const initial = await initialData();
    const fixture = wireFixture(initial, async () => outcome);
    await expect(catalogAdapter(initial, fixture).execute({ ...fadeOperation, fade_in: 0.5 })).rejects.toThrow();
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.compatibilityRequests).toEqual([]);
    expect(fixture.getCurrentHead()).toBe('parent-r1');
  });
  it.each(['read-only', 'stale-version', 'invalid-fade'] as const)('W13 %s refuses before publication', async (kind) => {
    const initial = await initialData();
    const fixture = wireFixture(initial);
    const adapter = catalogAdapter(initial, fixture, () => { if (kind === 'read-only') throw new Error('read-only'); });
    await expect(adapter.execute({ ...fadeOperation,
      expected_version: kind === 'stale-version' ? 2 : 1, fade_in: kind === 'invalid-fade' ? -1 : 0.5,
    })).rejects.toThrow();
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.compatibilityRequests).toEqual([]);
  });
  it('the unmarked-writer intercept rejects app-save even on the commit endpoint', async () => {
    const fixture = wireFixture(await initialData());
    const endpoint = '/v1/projects/gesture-project/timelines/gesture-timeline/commit';
    await expect(fixture.transport('POST', endpoint, {}, json({ change: { document: {}, adapter: 'app-save' } })))
      .rejects.toThrow('Unmarked census writer');
    expect(fixture.compatibilityRequests).toEqual([endpoint]);
    expect(fixture.requests).toHaveLength(0);
  });
});

describe('WRITERS W14 bound catalog transitions', () => {
  const reference = { id: 'crossfade', kind: 'transition' as const, revision: 'sha256:crossfade-r1', packId: 'rendering' };
  const scope = { project: 'gesture-project', timeline: 'gesture-timeline', expected_version: 1, from_clip: 'before' };
  const transition = { type: reference.id, revision: reference.revision, duration: 8 / 30, params: null,
    opaqueTransition: { retained: null } };
  async function fixtureData(bound = false) {
    return adjacentTransitionData(bound ? {
      transition, elementRef: { ...reference, opaqueReference: { retained: null } },
      app: { opaqueClip: null },
    } : { transition: null, elementRef: null, app: { opaqueClip: null } });
  }
  function catalog(initial: TimelineData, fixture: ReturnType<typeof wireFixture>, host = transitionHost(), authority = () => {}) {
    const routes = createElementTimelineRoutes({
      loadTimeline: async () => ({ config: initial.config, configVersion: 1, head: initial.head }),
      loadAssetRegistry: async () => initial.registry,
      saveTimeline: fixture.provider.saveTimeline.bind(fixture.provider),
      saveTimelineAtHead: fixture.provider.saveTimelineAtHead.bind(fixture.provider),
    }, authority);
    const save = vi.fn(routes.save);
    const context = buildReighAgentElementContext({ astridTransitions: [{
      transitionId: reference.id, packId: reference.packId, revision: reference.revision, provenance: 'astrid-catalog',
    }] });
    return { save, adapter: new AstridElementOperationAdapter(context, { ...routes, save }, 'gesture-project', host) };
  }
  function operation(action: 'apply' | 'update' | 'remove') {
    return action === 'apply'
      ? { ...scope, name: 'timeline.apply_transition', to_clip: 'after', transition: reference, duration_frames: 11, params: { value: null, ordinary: { op: 'clear' } } }
      : action === 'update'
        ? { ...scope, name: 'timeline.update_transition', to_clip: 'after', duration_frames: 13 }
        : { ...scope, name: 'timeline.remove_transition' };
  }
  function exactExpect(initial: TimelineData) {
    const before = initial.config.clips[0];
    const after = initial.config.clips[1];
    const result: Record<string, unknown> = {
      transition: { state: 'present', value: after.transition },
      elementRef: { state: 'present', value: after.elementRef },
      'parent/track:V1::kind': { state: 'present', value: 'visual' },
    };
    for (const [clip, prefix] of [[after, ''], [before, 'parent/clip:before::']] as const) {
      for (const key of ['track', 'at', 'hold', 'from', 'to', 'speed', 'clipType'] as const) {
        result[`${prefix}${key}`] = Object.hasOwn(clip, key)
          ? { state: 'present', value: clip[key] } : { state: 'absent' };
      }
      for (const key of ['on', 'until', 'for']) result[`${prefix}app.astrid.${key}`] = { state: 'absent' };
    }
    return result;
  }
  it.each(['apply', 'update', 'remove'] as const)('W14 %s sends its exact single command, captured head, pair and payload', async (action) => {
    const initial = await fixtureData(action !== 'apply');
    const before = structuredClone(initial.config);
    const fixture = wireFixture(initial);
    const { adapter, save } = catalog(initial, fixture);
    const result = await adapter.execute(operation(action));
    const next = result.config!.clips[1];
    expect(save).toHaveBeenCalledTimes(1);
    expect(fixture.requests).toHaveLength(1);
    const request = fixture.requests[0].request;
    expect(request.base_revision_id).toBe('parent-r1');
    expect(request.source).toEqual({ via: 'app' });
    expect(fixture.requests[0].headers['Idempotency-Key']).toBe(request.request_id);
    expect(request.change).toEqual({ commands: [{
      op: 'clip.set-transition', select: 'parent/clip:after', resolved: ['parent/clip:after'],
      args: action === 'remove' ? { clear: true } : {
        from_clip: 'parent/clip:before', transition: next.transition, elementRef: next.elementRef,
      },
      expect: exactExpect(initial),
    }] });
    if ('commands' in request.change) expect(validateEditCommand(request.change.commands[0])).toBe(request.change.commands[0]);
    if (action === 'apply') {
      expect(next.transition).toEqual({ type: reference.id, revision: reference.revision, duration: 11 / 30,
        params: { value: null, ordinary: { op: 'clear' } } });
      expect(next.elementRef).toEqual(reference);
    } else if (action === 'update') {
      expect(next.transition).toEqual({ ...transition, duration: 13 / 30 });
      expect(next.elementRef).toEqual(before.clips[1].elementRef);
    } else {
      expect(next).not.toHaveProperty('transition');
      expect(next).not.toHaveProperty('elementRef');
    }
    const { transition: _transition, elementRef: _reference, ...unchanged } = next;
    const { transition: _oldTransition, elementRef: _oldReference, ...original } = before.clips[1];
    expect(unchanged).toEqual(original);
    expect(result.config!.clips[0]).toEqual(before.clips[0]);
    expect(result.config!.app).toEqual(before.app);
    expect(result.registry).toEqual(initial.registry);
    expect(initial.config).toEqual(before);
    expect(fixture.compatibilityRequests).toEqual([]);
  });
  it('W14 apply captures absent transition fields without replacing them with present null', async () => {
    const initial = await fixtureData();
    delete initial.config.clips[1].transition;
    delete initial.config.clips[1].elementRef;
    const fixture = wireFixture(initial);
    await catalog(initial, fixture).adapter.execute(operation('apply'));
    expect(fixture.requests[0].request.change).toMatchObject({ commands: [{ expect: {
      transition: { state: 'absent' }, elementRef: { state: 'absent' },
    } }] });
    expect(fixture.compatibilityRequests).toEqual([]);
  });
  it('W14 unavailable acknowledgement retries the captured save with byte-identical command, base and request identity', async () => {
    const initial = await fixtureData(true);
    const fixture = wireFixture(initial, async (_request, call) => call === 1 ? 'unavailable' : undefined);
    const { adapter, save } = catalog(initial, fixture);
    await expect(adapter.execute(operation('update'))).rejects.toThrow();
    const [timeline, input] = save.mock.calls[0];
    // Recovery reuses the attempt objects owned by the existing provider. It
    // does not execute a new user action or reconstruct intent from a snapshot.
    await save(timeline, input);
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[0].bytes).toBe(fixture.requests[1].bytes);
    expect(fixture.requests[0].headers).toEqual(fixture.requests[1].headers);
    expect(fixture.requests[1].request.base_revision_id).toBe('parent-r1');
    expect(fixture.requests[1].request.change).toMatchObject({ commands: [{ op: 'clip.set-transition',
      args: { from_clip: 'parent/clip:before', transition: { duration: 13 / 30 } },
    }] });
    expect(fixture.compatibilityRequests).toEqual([]);
  });
  it.each(['apply', 'update', 'remove'] as const)('W14 refused %s keeps source and head and never falls back to publication', async (action) => {
    const initial = await fixtureData(action !== 'apply');
    const before = structuredClone(initial.config);
    const fixture = wireFixture(initial, async () => 'refused');
    await expect(catalog(initial, fixture).adapter.execute(operation(action))).rejects.toThrow();
    expect(initial.config).toEqual(before);
    expect(fixture.getCurrentHead()).toBe('parent-r1');
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.compatibilityRequests).toEqual([]);
  });
  it.each(['duplicate-id', 'duplicate-successor', 'duplicate-predecessor', 'overlap', 'occurrence', 'missing-track', 'unbound-component', 'ambiguous-declaration', 'stale-reference', 'read-only', 'stale-version'] as const)(
    'W14 %s refuses the bound action before either network write', async (kind) => {
      const initial = await fixtureData(true);
      let host = transitionHost();
      if (kind === 'duplicate-id') initial.config.clips.push(structuredClone(initial.config.clips[1]));
      if (kind === 'duplicate-successor') initial.config.clips.push({ ...initial.config.clips[1], id: 'other-after' });
      if (kind === 'duplicate-predecessor') initial.config.clips.push({ ...initial.config.clips[0], id: 'other-before' });
      if (kind === 'overlap') initial.config.clips.push({ ...initial.config.clips[0], id: 'overlap', at: 1 });
      if (kind === 'occurrence') initial.config.clips[1].app = { canonical: { occurrenceId: 'occ-A' } } as never;
      if (kind === 'missing-track') initial.config.tracks = [];
      if (kind === 'unbound-component') host = { ...host, resolveComponent: () => undefined };
      if (kind === 'ambiguous-declaration') host = { ...host, descriptors: [...host.descriptors, ...host.descriptors] };
      if (kind === 'stale-reference') initial.config.clips[1].elementRef = { ...reference, revision: 'stale' };
      const fixture = wireFixture(initial);
      const { adapter, save } = catalog(initial, fixture, host, () => { if (kind === 'read-only') throw new Error('read-only'); });
      await expect(adapter.execute({ ...operation('update'), ...(kind === 'stale-version' ? { expected_version: 2 } : {}) })).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
      expect(fixture.requests).toHaveLength(0);
      expect(fixture.compatibilityRequests).toEqual([]);
    },
  );
  it('W14 unbound declarations retain the explicit compatibility route without a partial command', async () => {
    const initial = await fixtureData();
    const fixture = wireFixture(initial);
    const { adapter, save } = catalog(initial, fixture, { ...transitionHost(), descriptors: [] });
    await expect(adapter.execute(operation('apply'))).rejects.toThrow('Unmarked census writer used compatibility publication');
    expect(save.mock.calls[0][1].editCommands).toBeUndefined();
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.compatibilityRequests).toEqual(['/v1/projects/gesture-project/timelines/gesture-timeline/composition-revisions']);
  });
  it('W14 intercept rejects publish-document and a disguised app-save commit', async () => {
    const fixture = wireFixture(await fixtureData());
    for (const endpoint of ['/publish-document', '/v1/projects/gesture-project/timelines/gesture-timeline/commit']) {
      await expect(fixture.transport('POST', endpoint, {}, json({ change: { document: {}, adapter: 'app-save' } })))
        .rejects.toThrow('Unmarked census writer');
    }
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.compatibilityRequests).toHaveLength(2);
  });
});

describe('WRITERS explicit unsupported property and track census', () => {
  it.each([
    ['top-level keyframes', { keyframes: { opacity: [{ time: 0, value: 0.3 }] }, keyframeOrigin: 0 }],
    ['continuous effect', { continuous: { type: 'glow', intensity: 0.3 } }],
    ['shader', { app: { shader: { shaderId: 'fixture' } } }],
    ['transition assignment', { transition: { type: 'cross-fade', duration: 0.2 } }],
    ['text content', { text: { content: 'Caption' } }],
  ])('%s stays on its marked fallback instead of attaching partial commands', async (_row, patch) => {
    const h = await setup();
    act(() => h.result.current.editing.handleSelectedClipChange(patch));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it.each(['/publish-document', '/v1/projects/p/timelines/t/composition-revisions'])(
    'the unmarked-writer intercept rejects the actual compatibility endpoint %s', async (path) => {
      const fixture = wireFixture(await initialData());
      await expect(fixture.transport('POST', path, {}, json({}))).rejects.toThrow('Unmarked census writer');
      expect(fixture.compatibilityRequests).toEqual([path]);
      expect(fixture.requests).toHaveLength(0);
    },
  );
});


describe('WRITERS sequential patch intent', () => {
  it('keeps repeated-target expectations sequential within one generated commit', async () => {
    const h = await setup();
    act(() => h.result.current.ops.apply({ version: 1, operations: [
      { op: 'clip.update', target: 'clip-1', payload: { opacity: 0.2 } },
      { op: 'clip.update', target: 'clip-1', payload: { opacity: 0.4 } },
    ] }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.requests[0].request.change).toEqual({ commands: [
      { op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { opacity: 0.2 }, expect: { opacity: { state: 'present', value: 0.9 } } },
      { op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { opacity: 0.4 }, expect: { opacity: { state: 'present', value: 0.2 } } },
    ] });
    expect(h.result.current.data!.config.clips[0].opacity).toBe(0.4);
    h.unmount();
  });
});


describe('WRITERS tiny-clip context-menu writer', () => {
  it('extends an ordinary hold through one duration command with captured base and expect', async () => {
    const base = await initialData();
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => clip.id === 'clip-1' ? { ...clip, hold: 0.2 } : clip) }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-duration', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { seconds: 0.5 },
      expect: { hold: { state: 'present', value: 0.2 }, 'app.astrid.until': { state: 'absent' }, 'app.astrid.for': { state: 'absent' } },
    }] });
    expect(h.result.current.data!.config.clips[0]).toEqual({ ...initial.config.clips[0], hold: 0.5 });
    h.unmount();
  });
  it('does not send a command when expansion is unnecessary', async () => {
    const h = await setup();
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('keeps a tiny hold with an unsupported end relation on its explicit fallback', async () => {
    const base = await relationData({ on: 'beat 2', until: { unsupported: true } });
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => clip.id === 'clip-1' ? { ...clip, hold: 0.2 } : clip) }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
});


describe('WRITERS mounted tool command service', () => {
  function commandsFor(h: Awaited<ReturnType<typeof setup>>) {
    return createTimelineCommands({ getState: () => ({
      data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
      ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true },
    }) } as unknown as TimelineStoreApi);
  }
  it.each(['updateClip', 'setClipParams', 'moveClip', 'deleteClip', 'combined update', 'trimClip', 'hold update'] as const)('%s reaches one generated commit from its actual public handler', async (writer) => {
    const h = await setup();
    const commands = commandsFor(h);
    act(() => {
      const result = writer === 'updateClip' ? commands.updateClip({ clipId: 'clip-1', patch: { opacity: 0.4 } })
        : writer === 'setClipParams' ? commands.setClipParams({ clipId: 'clip-1', params: { data: 'Updated' } })
        : writer === 'moveClip' ? commands.moveClip({ clipId: 'clip-1', time: 1.3, trackId: 'V2' })
        : writer === 'deleteClip' ? commands.deleteClip({ clipId: 'clip-1' })
        : writer === 'trimClip' ? commands.trimClip({ clipId: 'clip-1', endTime: 2.5 })
        : writer === 'hold update' ? commands.updateClip({ clipId: 'clip-1', patch: { hold: 1.5 } })
        : commands.updateClip({ clipId: 'clip-1', patch: { at: 1.3, track: 'V2', opacity: 0.4 } });
      expect(result.ok).toBe(true);
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    const scoped = { select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'] };
    const property = { ...scoped, op: 'clip.set-look', args: { opacity: 0.4 }, expect: { opacity: { state: 'present', value: 0.9 } } };
    const move = [
      { ...scoped, op: 'clip.nudge', args: { frames: 9 }, expect: { at: { state: 'present', value: 1 }, 'app.astrid.on': { state: 'present', value: '"hello" +2f' }, 'app.astrid.until': { state: 'absent' } } },
      { ...scoped, op: 'clip.set-track', args: { track: 'V2' }, expect: { track: { state: 'present', value: 'V1' } } },
    ];
    const expected = writer === 'updateClip' ? [property]
      : writer === 'setClipParams' ? [{ ...scoped, op: 'clip.set-param', args: { path: 'data', value: 'Updated' }, expect: { 'params.data': { state: 'present', value: null } } }]
      : writer === 'moveClip' ? move
      : writer === 'deleteClip' ? [{ ...scoped, op: 'clip.remove', args: {}, expect: { '': { state: 'present', value: h.initial.config.clips[0] },
        clip_order: { state: 'present', value: h.initial.config.clips.map(clip => `parent/clip:${clip.id}`) }, 'parent::config.pinnedShotGroups': { state: 'absent' } } }]
      : writer === 'trimClip' || writer === 'hold update' ? [{ ...scoped, op: 'clip.set-duration', args: { seconds: 1.5 }, expect: { hold: { state: 'present', value: 2 }, 'app.astrid.until': { state: 'absent' }, 'app.astrid.for': { state: 'absent' } } }]
      : [...move, property];
    expect(h.requests[0].request.change).toEqual({ commands: expected });
    h.unmount();
  });
  it('keeps unsupported tool metadata on the whole-action fallback', async () => {
    const h = await setup();
    act(() => expect(commandsFor(h).updateClip({ clipId: 'clip-1', patch: { opacity: 0.3, text: { content: 'Legacy' } } }).ok).toBe(true));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('honors the existing read-only guard before building tool commands', async () => {
    const h = await setup();
    const commands = createTimelineCommands({ getState: () => ({ availability: { mounted: true } }) } as unknown as TimelineStoreApi,
      { timelineEditability: { checkTimeline: () => ({ allowed: false, reason: 'read_only' }) } });
    act(() => expect(commands.updateClip({ clipId: 'clip-1', patch: { opacity: 0.3 } }).ok).toBe(false));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
});

describe('WRITERS tool time precision', () => {
  it('keeps a subframe tool move on its explicit fallback instead of silently rounding', async () => {
    const h = await setup();
    const commands = createTimelineCommands({ getState: () => ({
      data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
      ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true },
    }) } as unknown as TimelineStoreApi);
    act(() => expect(commands.moveClip({ clipId: 'clip-1', time: 1.31 }).ok).toBe(true));
    expect(h.result.current.data!.config.clips[0].at).toBe(1.31);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
});


describe('D source-backed structural gesture consumers', () => {
  async function literalData() {
    const base = await initialData(true);
    return buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => clip.id === 'clip-1'
      ? { ...clip, asset: 'source', opaque_clip: { nullable: null }, app: { opaque: { nullable: null } } } : clip) },
    { assets: { source: { type: 'video', file: 'fixture.mp4', duration: 8 } } }, undefined, 1, undefined, base.head);
  }
  const duplicateCommands = (h: Awaited<ReturnType<typeof setup>>) => createTimelineCommands({ getState: () => ({
    data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
    ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true },
  }) } as unknown as TimelineStoreApi);
  async function rippleData() {
    const base = await literalData();
    return buildTimelineData({ ...base.config, clips: [
      { id: 'before', at: 0, hold: 0.5, clipType: 'hold', track: 'V1' },
      ...base.config.clips.map((clip) => { const { opaque_clip: _opaque, ...supported } = clip; return supported; }),
      { id: 'clip-3', at: 8, hold: 1, clipType: 'hold', track: 'V1', app: { opaque: null } },
      { id: 'other', at: 6, hold: 1, clipType: 'hold', track: 'V2' },
    ] }, base.registry, undefined, 1, undefined, base.head);
  }
  it.each(['selected', 'at-time', 'bulk'] as const)('%s literal split sends the captured whole source and stable created identity', async (mode) => {
    const h = await setup(undefined, false, await literalData(), 2);
    act(() => {
      if (mode === 'selected') h.result.current.editing.handleSplitSelectedClip();
      else if (mode === 'bulk') h.result.current.editing.handleSplitClipsAtPlayhead(['clip-1', 'clip-1']);
      else h.result.current.editing.handleSplitClipAtTime('clip-1', 2);
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.requests[0].request.change).toEqual({ commands: [{ op: 'timeline.split', select: 'parent/clip:clip-1',
      args: { at: 2 }, created: ['parent/clip:clip-1-01'],
      expect: { 'parent/clip:clip-1::': { state: 'present', value: h.initial.config.clips[0] } } }] });
    expect(h.initial.config.clips[0]).toHaveProperty('opaque_clip', { nullable: null });
    const clips = h.result.current.data!.config.clips;
    expect(clips.find((clip) => clip.id === 'clip-1')).toMatchObject({ from: 2, to: 4, speed: 2 });
    expect(clips.find((clip) => clip.id === 'clip-1-01')).toMatchObject({ at: 2, from: 4, to: 6, speed: 2, app: { opaque: { nullable: null } } });
    h.unmount();
  });
  it.each(['tied', 'legacy tied', 'animated', 'hold-range', 'subframe', 'music carrier'] as const)('%s split refuses the whole edit', async (kind) => {
    const base = await literalData();
    const clip = base.config.clips[0];
    const next = kind === 'tied' ? { ...clip, app: { astrid: { on: 'beat 2' } } }
      : kind === 'legacy tied' ? { ...clip, app: { on: 'beat 2' } }
      : kind === 'animated' ? { ...clip, keyframes: {} }
      : kind === 'hold-range' ? { ...clip, hold: 2 } : clip;
    const initial = await buildTimelineData({ ...base.config, clips: [next, base.config.clips[1]],
      ...(kind === 'music carrier' ? { app: { astrid: { music_beds: { 'parent/clip:clip-1': { source: next } } } } } : {}) }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.editing.handleSplitClipAtTime('clip-1', kind === 'subframe' ? 2.001 : 2));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    expect(h.result.current.data!.config).toEqual(initial.config);
    h.unmount();
  });
  it('a mixed literal/tied bulk split refuses atomically', async () => {
    const base = await literalData();
    const initial = await buildTimelineData({ ...base.config, clips: [base.config.clips[0],
      { ...base.config.clips[1], at: 1, hold: 2, app: { astrid: { on: 'beat 2' } } }] }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial, 2);
    act(() => h.result.current.editing.handleSplitClipsAtPlayhead(['clip-1', 'clip-2']));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it.each(['remove', 'clear-unused'] as const)('%s empty tracks sends exact authored rows including opaque nulls', async (mode) => {
    const base = await literalData();
    const initial = await buildTimelineData({ ...base.config, tracks: [base.config.tracks![0],
      { id: 'unused', kind: 'visual', label: 'Unused', app: { opaque: null } }, ...base.config.tracks!.slice(1)] }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => mode === 'remove' ? h.result.current.tracks.handleRemoveTrack('unused') : h.result.current.tracks.handleClearUnusedTracks());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const ids = mode === 'remove' ? ['unused'] : ['unused', 'V2'];
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: ids.map((id) => ({ op: 'timeline.remove', select: `parent/track:${id}`, args: {},
      expect: { '': { state: 'present', value: initial.config.tracks!.find((track) => track.id === id) },
        track_order: { state: 'present', value: initial.config.tracks!.filter(track => !ids.slice(0, ids.indexOf(id)).includes(track.id)).map(track => `parent/track:${track.id}`) } } })) });
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it.each(['authored clip', 'zero-output carrier'] as const)('%s keeps its occupied track', async (kind) => {
    const base = await literalData();
    const initial = await buildTimelineData({ ...base.config,
      ...(kind === 'zero-output carrier' ? { app: { astrid: { music_beds: { 'parent/clip:bed': { source: { id: 'bed', track: 'V2' } } } } } } : {}) }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.tracks.handleRemoveTrack(kind === 'authored clip' ? 'V1' : 'V2'));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('split retries preserve the captured base, created identity and exact bytes', async () => {
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined, false, await literalData());
    act(() => h.result.current.editing.handleSplitClipAtTime('clip-1', 2));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 2500 });
    expect(h.requests).toHaveLength(2);
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect(h.requests[1].request.base_revision_id).toBe('parent-r1');
    expect((h.requests[1].request.change as { commands: Array<{ created: string[] }> }).commands[0].created).toEqual(['parent/clip:clip-1-01']);
    h.unmount();
  });
  it('split allocation skips an existing child deterministically', async () => {
    const base = await literalData();
    const initial = await buildTimelineData({ ...base.config, clips: [...base.config.clips,
      { id: 'clip-1-01', track: 'V2', at: 5, hold: 1 }] }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.editing.handleSplitClipAtTime('clip-1', 2));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect((h.requests[0].request.change as { commands: Array<{ created: string[] }> }).commands[0].created).toEqual(['parent/clip:clip-1-02']);
    h.unmount();
  });
  it('tied existing-source duplication refuses without a partial local edit', async () => {
    const base = await literalData();
    const initial = await buildTimelineData({ ...base.config, clips: [{ ...base.config.clips[0], app: { astrid: { on: 'beat 2' } } }] }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    const commands = createTimelineCommands({ getState: () => ({ data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
      ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true } }) } as unknown as TimelineStoreApi);
    act(() => expect(commands.addClip({ assetId: 'source', afterClipId: 'clip-1' }).ok).toBe(false));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('existing-source duplicate emits the exact ordered planner ripple in one commit and undo boundary', async () => {
    const initial = await rippleData();
    const before = structuredClone(initial.config);
    const plan = buildDuplicateClipEdit(initial, 'clip-1', 'source')!;
    const h = await setup(undefined, false, initial);
    const history = vi.fn();
    h.eventBus.on('beforeCommit', history);
    act(() => expect(duplicateCommands(h).addClip({ assetId: 'source', afterClipId: 'clip-1' })).toEqual({ ok: true, data: { clipId: plan.clipId, trackId: 'V1' } }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.result.current.data!.rows).toEqual(plan.rows);
    expect(h.result.current.data!.clipOrder).toEqual(plan.clipOrderOverride);
    expect(h.result.current.data!.config.clips.find((clip) => clip.id === 'clip-1')).toEqual(before.clips.find((clip) => clip.id === 'clip-1'));
    expect(h.result.current.data!.config.clips.find((clip) => clip.id === plan.clipId)).toEqual({ ...before.clips.find((clip) => clip.id === 'clip-1'), id: plan.clipId, at: 3 });
    for (const clip of before.clips.filter((clip) => clip.id !== 'clip-1')) {
      expect(h.result.current.data!.config.clips.find((next) => next.id === clip.id)).toEqual({ ...clip,
        at: ['clip-2', 'clip-3'].includes(clip.id) ? Number(clip.at) + 2 : clip.at });
    }
    expect(initial.config).toEqual(before);
    expect(h.result.current.data!.registry).toEqual(initial.registry);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    expect(h.requests[0].request.change).toEqual({ commands: [
      { op: 'timeline.add', select: null, args: { from: 'parent/clip:clip-1', at: 3 }, created: [`parent/clip:${plan.clipId}`],
        expect: { 'parent/clip:clip-1::': { state: 'present', value: before.clips.find((clip) => clip.id === 'clip-1') },
          'parent/clip:clip-1::clip_order': { state: 'present', value: before.clips.map(clip => `parent/clip:${clip.id}`) } } },
      ...['clip-2', 'clip-3'].map((id) => ({ op: 'clip.nudge', select: `parent/clip:${id}`, resolved: [`parent/clip:${id}`], args: { frames: 60 },
        expect: { at: { state: 'present', value: before.clips.find((clip) => clip.id === id)!.at },
          'app.astrid.on': { state: 'absent' }, 'app.astrid.until': { state: 'absent' } } })),
    ] });
    expect(history).toHaveBeenCalledTimes(1);
    expect(history.mock.calls[0]).toEqual([initial, expect.objectContaining({ semantic: true })]);
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it('existing-source ripple retries the whole batch with stable bytes and one reserved child', async () => {
    const initial = await rippleData();
    const child = buildDuplicateClipEdit(initial, 'clip-1', 'source')!.clipId;
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined, false, initial);
    const history = vi.fn();
    h.eventBus.on('beforeCommit', history);
    act(() => expect(duplicateCommands(h).addClip({ assetId: 'source', afterClipId: 'clip-1' }).ok).toBe(true));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 2500 });
    expect(h.requests).toHaveLength(2);
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect((h.requests[1].request.change as { commands: unknown[] }).commands).toHaveLength(3);
    expect(h.result.current.data!.config.clips.filter((clip) => clip.id === child)).toHaveLength(1);
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(history).toHaveBeenCalledTimes(1);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it.each((['source', 'follower'] as const).flatMap((target) =>
    ['on', 'until', 'cut', 'sequence', 'legacy tie', 'animated', 'modifiers', 'grouped', 'ambiguous', 'opaque field'].map((kind) => ({ target, kind }))))(
    'existing-source ripple retains whole fallback or refusal for $target $kind', async ({ target, kind }) => {
    const base = await rippleData();
    const id = target === 'source' ? 'clip-1' : 'clip-3';
    const patch = kind === 'legacy tie' ? { app: { on: 'beat 2' } }
      : kind === 'animated' ? { keyframes: {} }
      : kind === 'modifiers' ? { modifiers: [] }
      : kind === 'opaque field' ? { opaque_clip: { nullable: null } }
      : ['grouped', 'ambiguous'].includes(kind) ? {} : { app: { astrid: { [kind]: 'beat 2' } } };
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip),
      ...(kind === 'grouped' ? { pinnedShotGroups: [{ shotId: 'shot-1', trackId: 'V1', clipIds: [id], mode: 'images' as const }] } : {}),
    }, base.registry, undefined, 1, undefined, base.head);
    if (kind === 'ambiguous') initial.config.clips.push(structuredClone(initial.config.clips.find((clip) => clip.id === id)!));
    const h = await setup(undefined, false, initial);
    const plan = buildDuplicateClipEdit(initial, 'clip-1', 'source')!;
    const refused = target === 'source' && kind === 'grouped';
    act(() => expect(duplicateCommands(h).addClip({ assetId: 'source', afterClipId: 'clip-1' }).ok).toBe(!refused));
    expect(h.result.current.editSeqRef.current).toBe(refused ? 0 : 1);
    expect(h.result.current.data!.rows).toEqual(refused ? initial.rows : plan.rows);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it.each(['subframe source', 'non-frame delta', 'subframe follower', 'owner mismatch', 'duplicate action', 'missing authored follower'])(
    'existing-source ripple keeps %s wholly on fallback', async (kind) => {
    const base = await rippleData();
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) =>
      kind === 'subframe source' && clip.id === 'clip-1' ? { ...clip, at: 1.001 }
        : kind === 'non-frame delta' && clip.id === 'clip-1' ? { ...clip, to: 6.002 }
        : kind === 'subframe follower' && clip.id === 'clip-3' ? { ...clip, at: 8.001 } : clip),
    }, base.registry, undefined, 1, undefined, base.head);
    if (kind === 'owner mismatch') initial.config.clips.find((clip) => clip.id === 'clip-3')!.track = 'V2';
    if (kind === 'duplicate action') initial.rows.find((row) => row.id === 'V2')!.actions.push({ ...initial.rows.find((row) => row.id === 'V1')!.actions.at(-1)! });
    if (kind === 'missing authored follower') initial.config.clips = initial.config.clips.filter((clip) => clip.id !== 'clip-3');
    const h = await setup(undefined, false, initial);
    act(() => expect(duplicateCommands(h).addClip({ assetId: 'source', afterClipId: 'clip-1' }).ok).toBe(true));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('existing-source ripple missing source is a no-op with no commit or history entry', async () => {
    const h = await setup(undefined, false, await rippleData());
    const history = vi.fn();
    h.eventBus.on('beforeCommit', history);
    act(() => expect(duplicateCommands(h).addClip({ assetId: 'source', afterClipId: 'missing' })).toMatchObject({ ok: false, error: { code: 'clip_not_found' } }));
    expect(h.result.current.data).toBe(h.initial);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(history).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('existing-source ripple failed acceptance does not acknowledge or split the local transaction', async () => {
    const h = await setup(async () => 'rejected', false, await rippleData());
    const history = vi.fn();
    h.eventBus.on('beforeCommit', history);
    act(() => expect(duplicateCommands(h).addClip({ assetId: 'source', afterClipId: 'clip-1' }).ok).toBe(true));
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.savedSeqRef.current).toBe(0);
    expect(h.result.current.data!.head?.headRevisionId).toBe('parent-r1');
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(history).toHaveBeenCalledTimes(1);
    expect(h.requests).toHaveLength(1);
    expect((h.requests[0].request.change as { commands: unknown[] }).commands).toHaveLength(3);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it('mixed available and missing split selection refuses the whole batch', async () => {
    const h = await setup(undefined, false, await literalData(), 2);
    act(() => h.result.current.editing.handleSplitClipsAtPlayhead(['clip-1', 'missing']));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('ambiguous captured source refuses before changing any clip', async () => {
    const initial = await literalData();
    initial.config = { ...initial.config, clips: [...initial.config.clips, structuredClone(initial.config.clips[0])] };
    const h = await setup(undefined, false, initial);
    act(() => h.result.current.editing.handleSplitClipAtTime('clip-1', 2));
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('same-owner existing-source duplicate reaches the canonical commit without acquisition or ripple', async () => {
    const base = await literalData();
    const initial = await buildTimelineData({ ...base.config, clips: [base.config.clips[0]] }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    const commands = createTimelineCommands({ getState: () => ({ data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
      ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true } }) } as unknown as TimelineStoreApi);
    act(() => expect(commands.addClip({ assetId: 'source', afterClipId: 'clip-1' }).ok).toBe(true));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const child = h.result.current.data!.config.clips.find((clip) => clip.id !== 'clip-1')!;
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{ op: 'timeline.add', select: null,
      args: { from: 'parent/clip:clip-1', at: 3 }, created: [`parent/clip:${child.id}`],
      expect: { 'parent/clip:clip-1::': { state: 'present', value: initial.config.clips[0] } } }] });
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
});

describe('D008 source-backed track consumers', () => {
  const commands = (request: CommitRequest) => {
    if (!('commands' in request.change)) throw new Error('Expected command envelope');
    return request.change.commands;
  };
  async function trackData(audio = false) {
    const initial = await initialData();
    const data = await buildTimelineData({ ...initial.config, tracks: [
      { ...initial.config.tracks![0], app: { sentinel: null, object: { op: 'clear' }, removable: null } },
      ...(audio ? [{ id: 'A1', kind: 'audio' as const, label: 'Audio', volume: 0.7, app: { audio: null } }] : []),
      initial.config.tracks![1],
      ...(audio ? [{ id: 'A4', kind: 'audio' as const, label: 'Source audio', role: 'source' as const, muted: false }] : []),
    ] }, initial.registry, undefined, 1, undefined, initial.head);
    // Persisted name is outside the editor's display TrackDefinition surface.
    Reflect.set(data.config.tracks![0], 'name', 'persisted-track-name');
    return data;
  }
  it.each(['visual', 'audio'] as const)('add %s captures the complete default row, absence and reserved identity in one transaction', async (kind) => {
    const h = await setup(undefined, false, await trackData(true));
    const before = structuredClone(h.initial.config);
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    act(() => h.result.current.tracks.handleAddTrack(kind));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const id = kind === 'visual' ? 'V3' : 'A5';
    const row = { id, kind, label: id, scale: 1, fit: kind === 'visual' ? 'manual' : 'contain', opacity: 1, blendMode: 'normal' };
    expect(h.requests).toHaveLength(1);
    expect(commands(h.requests[0].request)).toEqual([{ op: 'timeline.add', select: `parent/track:${id}`,
      args: { track: row }, created: [`parent/track:${id}`], expect: { [`parent/track:${id}::`]: { state: 'absent' } } }]);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(h.result.current.data!.config.tracks!.slice(0, -1)).toEqual(before.tracks);
    expect(h.result.current.data!.config.tracks!.at(-1)).toEqual({ ...row, app: { scaleAppliesToPositionedClips: true } });
    expect(h.result.current.data!.config.clips).toEqual(before.clips);
    expect(h.result.current.selectedTrackId).toBe(id);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it('add retries the same identity, command, request bytes and headers after an unavailable acknowledgement', async () => {
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined, false, await trackData());
    act(() => h.result.current.tracks.handleAddTrack('visual'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 2500 });
    expect(h.requests).toHaveLength(2);
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect(commands(h.requests[1].request)[0].created).toEqual(['parent/track:V3']);
    expect(h.result.current.data!.config.tracks!.filter((track) => track.id === 'V3')).toHaveLength(1);
    expect(h.result.current.editSeqRef.current).toBe(1);
    h.unmount();
  });
  it('within-kind reorder guards every parent track including interleaved audio and preserves rows and selection', async () => {
    const h = await setup(undefined, false, await trackData(true));
    const before = structuredClone(h.initial.config);
    act(() => h.result.current.tracks.handleMoveTrack('V1', 'V2'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const expected_order = ['V1', 'A1', 'V2', 'A4'].map((id) => `parent/track:${id}`);
    expect(h.requests).toHaveLength(1);
    expect(commands(h.requests[0].request)).toEqual([{ op: 'timeline.reorder', select: 'parent/track:V1',
      resolved: ['parent/track:V1'],
      args: { order: ['A1', 'V2', 'V1', 'A4'].map((id) => `parent/track:${id}`), expected_order },
      expect: { 'parent/track:V1::track_order': { state: 'present', value: expected_order } } }]);
    expect(h.result.current.data!.config.tracks).toEqual([before.tracks![1], before.tracks![2], before.tracks![0], before.tracks![3]]);
    expect(h.result.current.data!.config.clips).toEqual(before.clips);
    expect(h.result.current.selectedTrackId).toBe('V1');
    h.unmount();
  });
  const properties = [
    ['label', 'Renamed'], ['role', 'source'], ['scale', 1.5], ['fit', 'cover'],
    ['opacity', 0.4], ['volume', 0.3], ['muted', true], ['blendMode', 'multiply'],
  ] as const;
  it.each(properties)('property %s targets only the explicit path and preserves opaque/null siblings', async (key, value) => {
    const h = await setup(undefined, false, await trackData());
    const before = structuredClone(h.initial.config.tracks![0]);
    const tagged = Object.prototype.hasOwnProperty.call(before, key)
      ? { state: 'present', value: before[key] } : { state: 'absent' };
    act(() => h.result.current.tracks.handleTrackPopoverChange('V1', { [key]: value }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(commands(h.requests[0].request)).toEqual([{ op: 'timeline.set', select: 'parent/track:V1',
      args: { values: { [key]: value }, clear: [] }, expect: { [`parent/track:V1::${key}`]: tagged } }]);
    expect(h.result.current.data!.config.tracks![0]).toEqual({ ...before, [key]: value });
    expect(h.result.current.selectedTrackId).toBe('V1');
    h.unmount();
  });
  it.each(properties.filter(([key]) => key !== 'label'))('explicit clear %s retains a captured present-null expectation', async (key) => {
    const initial = await trackData();
    Reflect.set(initial.config.tracks![0], key, null);
    const h = await setup(undefined, false, initial);
    const before = structuredClone(initial.config.tracks![0]); Reflect.deleteProperty(before, key);
    act(() => h.result.current.tracks.handleTrackPopoverChange('V1', { [key]: undefined }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(commands(h.requests[0].request)).toEqual([{ op: 'timeline.set', select: 'parent/track:V1',
      args: { values: {}, clear: [key] }, expect: { [`parent/track:V1::${key}`]: { state: 'present', value: null } } }]);
    expect(h.result.current.data!.config.tracks![0]).toEqual(before);
    expect(Object.prototype.hasOwnProperty.call(h.result.current.data!.config.tracks![0], key)).toBe(false);
    h.unmount();
  });
  it('app paths distinguish null, absence, ordinary object values and explicit clear in one command', async () => {
    const h = await setup(undefined, false, await trackData());
    const before = structuredClone(h.initial.config.tracks![0]);
    act(() => h.result.current.tracks.handleTrackPopoverChange('V1', { app: {
      sentinel: 'changed', newNull: null, object: { $absent: true }, removable: undefined,
    } }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(commands(h.requests[0].request)).toEqual([{ op: 'timeline.set', select: 'parent/track:V1', args: {
      values: { 'app.sentinel': 'changed', 'app.newNull': null, 'app.object': { $absent: true } }, clear: ['app.removable'],
    }, expect: {
      'parent/track:V1::app.sentinel': { state: 'present', value: null },
      'parent/track:V1::app.newNull': { state: 'absent' },
      'parent/track:V1::app.object': { state: 'present', value: { op: 'clear' } },
      'parent/track:V1::app.removable': { state: 'present', value: null },
    } }]);
    expect(h.result.current.data!.config.tracks![0]).toEqual({ ...before, app: { scaleAppliesToPositionedClips: true, sentinel: 'changed', newNull: null, object: { $absent: true } } });
    h.unmount();
  });
  it('clears an absent app path without synthesizing a value or changing an opaque sibling', async () => {
    const h = await setup(undefined, false, await trackData());
    act(() => h.result.current.tracks.handleTrackPopoverChange('V1', { app: { missing: undefined } }));
    expect(gestureCommandsFor(h.result.current.data!)![0]).toMatchObject({ args: { values: {}, clear: ['app.missing'] },
      expect: { 'parent/track:V1::app.missing': { state: 'absent' } } });
    expect(h.result.current.data!.config.tracks![0].app!.sentinel).toBeNull();
    h.unmount();
  });
  it.each(['same', 'missing', 'empty'] as const)('track no-op %s emits no transaction or request', async (reason) => {
    const h = await setup();
    act(() => {
      if (reason === 'empty') h.result.current.tracks.handleTrackPopoverChange('V1', {});
      else h.result.current.tracks.handleMoveTrack('V1', reason === 'same' ? 'V1' : 'missing');
    });
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toEqual([]);
    h.unmount();
  });
  it.each([{ kind: 'audio' as const }, { label: undefined }, { fit: 'invalid' }, { volume: null }, { app: { 'dotted.key': 1 } }, { app: { scaleAppliesToPositionedClips: false } }])(
    'unsupported property patch stays entirely on its fallback: %j', async (patch) => {
      const h = await setup();
      act(() => h.result.current.tracks.handleTrackPopoverChange('V1', patch as Partial<import('../types/index.ts').TrackDefinition>));
      expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
      expect(h.requests).toEqual([]);
      h.unmount();
    });
  it('cross-kind drag commits the complete guarded owner permutation', async () => {
    const h = await setup(undefined, false, await trackData(true));
    act(() => h.result.current.tracks.handleMoveTrack('V1', 'A1'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const expectedOrder = ['V1', 'A1', 'V2', 'A4'].map((id) => `parent/track:${id}`);
    expect(h.requests).toHaveLength(1);
    expect(commands(h.requests[0].request)).toEqual([{ op: 'timeline.reorder', select: 'parent/track:V1', resolved: ['parent/track:V1'],
      args: { order: ['A1', 'V1', 'V2', 'A4'].map((id) => `parent/track:${id}`), expected_order: expectedOrder },
      expect: { 'parent/track:V1::track_order': { state: 'present', value: expectedOrder } } }]);
    expect(h.result.current.data!.tracks.map((track) => track.id)).toEqual(['A1', 'V1', 'V2', 'A4']);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it.each([true, false])('mute-all %s issues one transaction and one batch for all current audio tracks only', async (muted) => {
    const initial = await trackData(true);
    if (!muted) for (const track of initial.config.tracks!) if (track.kind === 'audio') track.muted = true;
    const h = await setup(undefined, false, initial);
    const before = structuredClone(initial.config.tracks);
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    act(() => h.result.current.ops.setAllTracksMuted(muted));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(commands(h.requests[0].request)).toEqual(before!.filter((track) => track.kind === 'audio').map((track) => ({
      op: 'timeline.set', select: `parent/track:${track.id}`, args: { values: { muted }, clear: [] },
      expect: { [`parent/track:${track.id}::muted`]: Object.prototype.hasOwnProperty.call(track, 'muted')
        ? { state: 'present', value: track.muted } : { state: 'absent' } },
    })));
    expect(commits).toHaveBeenCalledTimes(1);
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(h.result.current.data!.config.tracks).toEqual(before!.map((track) => track.kind === 'audio' ? { ...track, muted } : track));
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it('mute-all with no audio tracks returns an empty diff and makes no edit', async () => {
    const h = await setup();
    let diff;
    act(() => { diff = h.result.current.ops.setAllTracksMuted(true); });
    expect(diff).toMatchObject({ entries: [], affectedObjectIds: [] });
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toEqual([]);
    h.unmount();
  });
  it.each(['add', 'reorder', 'property', 'mute-all'] as const)('%s obeys the existing whole-timeline refusal with no partial local edit', async (operation) => {
    const initial = await trackData(true);
    const before = structuredClone(initial.config);
    const editability: TimelineEditability = {
      check: () => ({ allowed: false, reason: 'timeline_read_only' }),
      checkTimeline: () => ({ allowed: false, reason: 'timeline_read_only' }),
    };
    const h = await setup(undefined, false, initial, 1, editability);
    const invoke = () => act(() => {
      if (operation === 'add') h.result.current.tracks.handleAddTrack('visual');
      if (operation === 'reorder') h.result.current.tracks.handleMoveTrack('V1', 'V2');
      if (operation === 'property') h.result.current.tracks.handleTrackPopoverChange('V1', { label: 'Changed' });
      if (operation === 'mute-all') h.result.current.ops.setAllTracksMuted(true);
    });
    if (operation === 'mute-all') expect(invoke).toThrow(); else invoke();
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.result.current.data!.config).toEqual(before);
    expect(h.requests).toEqual([]);
    h.unmount();
  });
  it.each(['add', 'property', 'mute-all'] as const)('%s retains strict invalid-row refusal before any transaction', async (operation) => {
    const initial = await trackData(true);
    Reflect.set(initial.config.tracks![0], 'future', { opaque: null });
    const before = structuredClone(initial.config);
    const h = await setup(undefined, false, initial);
    expect(() => act(() => {
      if (operation === 'mute-all') h.result.current.ops.setAllTracksMuted(true);
      if (operation === 'add') h.result.current.tracks.handleAddTrack('visual');
      if (operation === 'property') h.result.current.tracks.handleTrackPopoverChange('V1', { label: 'Changed' });
    })).toThrow(/unexpected key 'future'/);
    expect(h.result.current.data!.config).toEqual(before);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toEqual([]);
    h.unmount();
  });

  it('a mixed supported clip and track patch retains one explicit command batch', async () => {
    const h = await setup();
    act(() => h.result.current.ops.apply({ version: 1, operations: [
      { op: 'clip.update', target: 'clip-1', payload: { opacity: 0.2 } },
      { op: 'track.update', target: 'V1', payload: { label: 'Changed' } },
    ] }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(commands(h.requests[0].request)).toEqual([
      { op: 'clip.set-look', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { opacity: 0.2 }, expect: { opacity: { state: 'present', value: 0.9 } } },
      { op: 'timeline.set', select: 'parent/track:V1', args: { values: { label: 'Changed' }, clear: [] }, expect: { 'parent/track:V1::label': { state: 'present', value: 'V1' } } },
    ]);
    h.unmount();
  });

});

describe('bounded new-track clip move wire adaptation', () => {
  async function laneData(kind: 'visual' | 'audio' = 'visual', role: 'source' | 'output' = 'output', media = false) {
    const base = await initialData(media);
    const data = await buildTimelineData({ ...base.config,
      tracks: [
        { ...base.config.tracks![0], role, app: { opaque: null, object: { op: 'clear' } } },
        base.config.tracks![1],
        { id: 'A4', kind: 'audio', label: 'Audio', role, app: { audioOpaque: null } },
      ],
      clips: base.config.clips.map((clip) => clip.id === 'clip-1'
        ? { ...clip, track: kind === 'audio' ? 'A4' : 'V1', app: { clipSentinel: true, astrid: { opaque: null } } } : clip),
    }, base.registry, undefined, 1, undefined, base.head);
    Reflect.set(data.config.tracks![0], 'name', 'opaque-persisted-name');
    return data;
  }
  function drag(h: Awaited<ReturnType<typeof setup>>, start: number, planOverrides: Partial<Parameters<typeof planClipDrag>[0]> = {}) {
    const data = h.result.current.data!;
    const row = data.rows.find((candidate) => candidate.actions.some((action) => action.id === 'clip-1'))!;
    const action = row.actions.find((candidate) => candidate.id === 'clip-1')!;
    const sourceKind = data.tracks.find((track) => track.id === row.id)!.kind;
    const plan = planClipDrag({
      pointerTime: start, clipDuration: action.end - action.start, clipId: 'clip-1', sourceKind,
      rows: data.rows, tracks: data.tracks, pointerRowIndex: data.rows.length,
      pixelSnapThreshold: 8, pixelsPerSecond: 100, requestedNewTrackPlacement: 'bottom',
      ...planOverrides,
    });
    expect(plan).toMatchObject({ valid: true, needsNewTrack: true, targetTrackId: null, resolvedStart: start });
    const session = {
      clipId: 'clip-1', draggedClipIds: ['clip-1'], groupDragEntry: null,
      sourceRowId: row.id, sourceKind, transactionId: 'new-lane-drag',
      clipOffsets: [{ clipId: 'clip-1', rowId: row.id, deltaTime: 0, initialStart: action.start, initialEnd: action.end }],
    } as InternalDragSession;
    act(() => commitDraggingSession({ session, nextStart: 99, lastPlan: plan,
      dropPosition: { isNewTrack: true, isNewTrackTop: false }, crossTrackActive: true, liveData: data,
      callbacks: { ...h.result.current.tracks, applyEdit: h.result.current.applyEdit, selectClip: vi.fn(), selectClips: vi.fn() },
    }));
  }
  const variants = (['visual', 'audio'] as const).flatMap((kind) => (['source', 'output'] as const)
    .flatMap((role) => [0, 9].map((frames) => ({ kind, role, frames }))));
  it.each(variants)('$kind/$role/$frames frames uses the exact plan and ordered add/nudge/set-track in one transaction', async ({ kind, role, frames }) => {
    const h = await setup(undefined, false, await laneData(kind, role));
    const before = structuredClone(h.initial.config);
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    const start = 1 + frames / 30;
    const id = kind === 'visual' ? 'V3' : 'A5';
    const source = kind === 'visual' ? 'V1' : 'A4';
    const track = { id, kind, label: id, role };
    drag(h, start);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', dry_run: false });
    expect(h.requests[0].request.change).toEqual({ commands: [
      { op: 'timeline.add', select: `parent/track:${id}`, args: { track }, created: [`parent/track:${id}`],
        expect: { [`parent/track:${id}::`]: { state: 'absent' } } },
      ...(frames ? [{ op: 'clip.nudge', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { frames },
        expect: { at: { state: 'present', value: 1 }, 'app.astrid.on': { state: 'absent' }, 'app.astrid.until': { state: 'absent' } } }] : []),
      { op: 'clip.set-track', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { track: id },
        expect: { track: { state: 'present', value: source } } },
    ] });
    expect(commits).toHaveBeenCalledTimes(1);
    expect(commits.mock.calls[0][0]).toBe(h.initial);
    expect(commits.mock.calls[0][1]).toMatchObject({ transactionId: 'new-lane-drag' });
    const data = h.result.current.data!;
    expect(data.config.tracks!.slice(0, -1)).toEqual(before.tracks);
    expect(data.config.tracks!.at(-1)).toMatchObject(track);
    expect(data.config.clips).toEqual(before.clips.map((clip) => clip.id === 'clip-1' ? { ...clip, at: start, track: id } : clip));
    expect(data.tracks.map((row) => row.id)).toEqual([...before.tracks!.map((row) => row.id), id]);
    expect(data.rows.at(-1)).toMatchObject({ id, actions: [{ id: 'clip-1', start, end: start + 2 }] });
    expect(data.clipOrder[id]).toEqual(['clip-1']);
    expect(data.clipOrder[source]).not.toContain('clip-1');
    expect(h.result.current.selectedClipId).toBe('clip-1');
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
  it('consumes the planner timeline-start snap without re-running the legacy snapper', async () => {
    const h = await setup(undefined, false, await laneData());
    drag(h, 0, { pointerTime: 0.05 });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toMatchObject({ commands: [
      { op: 'timeline.add' }, { op: 'clip.nudge', args: { frames: -30 } }, { op: 'clip.set-track', args: { track: 'V3' } },
    ] });
    expect(h.result.current.data!.rows.at(-1)?.actions[0]).toMatchObject({ start: 0, end: 2 });
    h.unmount();
  });
  it('an occupied target plan allocates the next free lane identity without moving or trimming siblings', async () => {
    const base = await laneData();
    const initial = await buildTimelineData({ ...base.config,
      tracks: [...base.config.tracks!, { id: 'V3', kind: 'visual', label: 'Existing V3', app: { keep: null } }],
      clips: [...base.config.clips,
        { id: 'block-v2', at: 4, hold: 4, clipType: 'hold', track: 'V2' },
        { id: 'block-v3', at: 4, hold: 4, clipType: 'hold', track: 'V3' },
      ],
    }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    const before = structuredClone(initial.config);
    drag(h, 5, { pointerRowIndex: 0, requestedNewTrackPlacement: null });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toMatchObject({ commands: [
      { op: 'timeline.add', select: 'parent/track:V4', created: ['parent/track:V4'], expect: { 'parent/track:V4::': { state: 'absent' } } },
      { op: 'clip.nudge', args: { frames: 120 } }, { op: 'clip.set-track', args: { track: 'V4' } },
    ] });
    expect(h.result.current.data!.config.clips).toEqual(before.clips.map((clip) => clip.id === 'clip-1' ? { ...clip, at: 5, track: 'V4' } : clip));
    expect(h.result.current.data!.config.tracks!.slice(0, -1)).toEqual(before.tracks);
    h.unmount();
  });
  it('the no-plan append control preserves its full default track row and selection', async () => {
    const h = await setup(undefined, false, await laneData('visual', 'source', true));
    const before = structuredClone(h.initial.config);
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    act(() => h.result.current.tracks.createTrackAndMoveClip('clip-1', 'visual', 1.3));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    const change = h.requests[0].request.change;
    expect(change).toMatchObject({ commands: [
      { op: 'timeline.add', args: { track: { id: 'V3', kind: 'visual', label: 'V3', role: 'source',
        scale: 1, fit: 'manual', opacity: 1, blendMode: 'normal' } }, created: ['parent/track:V3'] },
      { op: 'clip.nudge', args: { frames: 9 } },
      { op: 'clip.set-track', args: { track: 'V3' }, expect: { track: { state: 'present', value: 'V1' } } },
    ] });
    expect(h.result.current.data!.config.clips).toEqual(before.clips.map((clip) => clip.id === 'clip-1' ? { ...clip, at: 1.3, track: 'V3' } : clip));
    expect(h.result.current.selectedClipId).toBe('clip-1');
    expect(h.result.current.selectedTrackId).toBe('V3');
    expect(commits).toHaveBeenCalledTimes(1);
    h.unmount();
  });
  it('unavailable acknowledgement keeps the complete draft and retries identical reservation, bytes and headers', async () => {
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const h = await setup(async (_request, call) => { if (call === 1) return 'unavailable'; await paused; }, false, await laneData());
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    drag(h, 1.3);
    await waitFor(() => expect(h.requests).toHaveLength(2), { timeout: 2500 });
    expect(h.savedSeqRef.current).toBe(0);
    expect(h.result.current.data!.head).toEqual(h.initial.head);
    expect(h.result.current.data!.config.tracks!.at(-1)?.id).toBe('V3');
    expect(h.result.current.data!.config.clips[0]).toMatchObject({ at: 1.3, track: 'V3' });
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect(h.requests[0].request.request_id).toBe(h.requests[1].request.request_id);
    release();
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(2);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(h.result.current.data!.config.tracks!.filter((row) => row.id === 'V3')).toHaveLength(1);
    expect(h.result.current.editSeqRef.current).toBe(1);
    h.unmount();
  });
  it('a rejected batch keeps both lane and clip in the unsaved draft and does not acknowledge a partial edit', async () => {
    const h = await setup(async () => 'refused', false, await laneData());
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    drag(h, 1.3);
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.requests).toHaveLength(1);
    expect(h.savedSeqRef.current).toBe(0);
    expect(h.result.current.data!.head).toEqual(h.initial.head);
    expect(h.result.current.data!.config.tracks!.at(-1)?.id).toBe('V3');
    expect(h.result.current.data!.config.clips[0]).toMatchObject({ at: 1.3, track: 'V3' });
    expect(gestureCommandsFor(h.result.current.data!)?.map((command) => command.op)).toEqual(['timeline.add', 'clip.nudge', 'clip.set-track']);
    expect(commits).toHaveBeenCalledTimes(1);
    h.unmount();
  });
  it.each(['track', 'clip'] as const)('an invalid authored %s key refuses before serialization can drop it', async (kind) => {
    const initial = await laneData();
    Reflect.set(kind === 'track' ? initial.config.tracks![0] : initial.config.clips[0], 'unknownField', { keep: null });
    const h = await setup(undefined, false, initial);
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    expect(() => h.result.current.tracks.applyResolvedClipMove('clip-1', 'new', null, 1.3, true)).toThrow(/unexpected key/);
    expect(h.result.current.dataRef.current).toBe(initial);
    expect(h.result.current.data).toBe(initial);
    expect(commits).not.toHaveBeenCalled();
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it.each(['missing', 'same-position', 'locked', 'read-only', 'boundary', 'late-boundary'] as const)('%s makes no request or partial lane', async (mode) => {
    const editability = mode === 'locked' ? createTimelineEditability({ lockedClipIds: ['clip-1'] })
      : mode === 'read-only' ? createTimelineEditability({ readOnly: true })
      : mode === 'boundary' ? createTimelineEditability({ hardDurationSeconds: 3 })
      : mode === 'late-boundary' ? { check: () => ({ allowed: true }), checkTimeline: () => ({ allowed: false }) }
      : undefined;
    const h = await setup(undefined, false, await laneData(), 1, editability);
    const before = h.result.current.data;
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    act(() => h.result.current.tracks.applyResolvedClipMove(mode === 'missing' ? 'missing' : 'clip-1', 'V1',
      mode === 'same-position' ? 'V1' : null, mode === 'same-position' ? 1 : 1.3, mode !== 'same-position', 'no-op'));
    expect(h.result.current.data).toBe(before);
    expect(h.result.current.dataRef.current).toBe(before);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(commits).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it.each(['on', 'until', 'cut', 'group', 'subframe', 'live-position', 'top'] as const)('%s stays on its existing fallback without invented commands', async (mode) => {
    const base = await laneData();
    const initial = await buildTimelineData({ ...base.config,
      clips: base.config.clips.map((clip) => clip.id === 'clip-1' && ['on', 'until', 'cut'].includes(mode)
        ? { ...clip, app: { ...clip.app, astrid: { [mode]: mode === 'cut' ? 'cut-1' : 'beat 2' } } } : clip),
      ...(mode === 'group' ? { pinnedShotGroups: [{ shotId: 'group', trackId: 'V1', clipIds: ['clip-1', 'clip-2'], mode: 'images' as const }] } : {}),
    }, base.registry, undefined, 1, undefined, base.head);
    if (mode === 'live-position') initial.rows[0].actions[0].start = 1.1;
    const h = await setup(undefined, false, initial);
    act(() => mode === 'top' ? h.result.current.tracks.createTrackAndMoveClip('clip-1', 'visual', 1.3, true)
      : h.result.current.tracks.applyResolvedClipMove('clip-1', 'new', null, mode === 'subframe' ? 1.31 : 1.3, true));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('multi-clip new-lane drag remains a single fallback edit without converting only one member', async () => {
    const h = await setup(undefined, false, await laneData());
    const data = h.result.current.data!;
    const session = { clipId: 'clip-1', draggedClipIds: ['clip-1', 'clip-2'], groupDragEntry: null,
      sourceRowId: 'V1', sourceKind: 'visual', transactionId: 'multi-new-lane',
      clipOffsets: data.rows[0].actions.map((action) => ({ clipId: action.id, rowId: 'V1', deltaTime: action.start - 1, initialStart: action.start, initialEnd: action.end })),
    } as InternalDragSession;
    act(() => commitDraggingSession({ session, nextStart: 1.3, dropPosition: { isNewTrack: true, isNewTrackTop: false },
      crossTrackActive: true, liveData: data,
      callbacks: { ...h.result.current.tracks, applyEdit: h.result.current.applyEdit, selectClip: vi.fn(), selectClips: vi.fn() },
    }));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
});


describe('C007 selected import through the existing semantic commit retry', () => {
  it('reads once and retries byte-identical timeline.add identity and selection after an unavailable acknowledgement', async () => {
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined);
    const selection = {
      asset: 'import-asset', generation_id: 'import-gen', variant_id: 'import-variant',
      object_id: `sha256:${'a'.repeat(64)}`, catalog_digest: `sha256:${'b'.repeat(64)}`,
    };
    vi.spyOn(h.provider, 'prepareMediaImport').mockResolvedValue({
      provider: 'runtime', project: 'gesture-project', importOperationId: 'import-op',
      assetId: selection.asset, generationId: selection.generation_id, variantId: selection.variant_id,
      entry: { file: 'https://runtime.fixture/import.png', type: 'image/png' },
    });
    const read = vi.spyOn(h.provider, 'getProjectMediaSelection').mockResolvedValue(selection);
    const runtime = { provider: h.provider, toast: { error: vi.fn() } } as unknown as VideoEditorRuntimeContextValue;
    const assets = renderHook(() => useAssetManagement({
      dataRef: h.result.current.dataRef, selectedTrackId: 'V1', selectedProjectId: 'gesture-project',
      selectClip: vi.fn(), setSelectedTrackId: vi.fn(), applyEdit: h.result.current.applyEdit,
      patchRegistry: vi.fn(), invalidateAssetRegistry: vi.fn(), resolveAssetUrl: vi.fn(),
    }), { wrapper: ({ children }) => <VideoEditorRuntimeProvider value={runtime}>{children}</VideoEditorRuntimeProvider> });
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    await act(async () => {
      const uploaded = await assets.result.current.uploadImageGeneration(new File(['image'], 'frame.png', { type: 'image/png' }));
      const prepared = assets.result.current.prepareGenerationAsset(uploaded)!;
      expect(prepared.selectedMedia).toBe(selection);
      expect(assets.result.current.handleAssetDrop(prepared.assetKey, 'V1', 10, false, false, prepared)).toBe(true);
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 2500 });
    expect(read).toHaveBeenCalledExactlyOnceWith({ projectId: 'gesture-project', asset: selection.asset, generationId: selection.generation_id, variantId: selection.variant_id });
    expect(commits).toHaveBeenCalledTimes(1);
    expect(h.requests).toHaveLength(2);
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({
      op: 'timeline.add', select: 'parent/track:V1', args: { media: selection, clip_id: expect.any(String), at: 10, duration: 5 },
      created: [expect.stringMatching(/^parent\/clip:/)],
    })] });
    expect(h.result.current.data!.config.clips.filter((clip) => clip.asset === selection.asset)).toHaveLength(1);
    expect(h.compatibilityRequests).toEqual([]);
    assets.unmount(); h.unmount();
  });
});


describe('E015 source-backed plain start-tied drag', () => {
  // D core/timeline/moments.py format_moment/format_offset and SDK Clip.nudge:
  // frames add to the existing offset; the canonical anchor itself is unchanged.
  const relations = [
    ['word', '"hello" in v20a #2 +2f', 1.3, '"hello" in v20a #2 +11f'],
    ['word', '"hello" in v20a #2 +2f', 0.7, '"hello" in v20a #2 -7f'],
    ['word', '"hello" in v20a #2 -9f', 1.3, '"hello" in v20a #2'],
    ['music', 'beat 2 after "hello" in v20a #2 +2f', 1.3, 'beat 2 after "hello" in v20a #2 +11f'],
    ['music', 'beat 2 after "hello" in v20a #2 -9f', 1.3, 'beat 2 after "hello" in v20a #2'],
    ['music', 'beat 2 after "hello" in v20a #2 +2f', 0.7, 'beat 2 after "hello" in v20a #2 -7f'],
  ] as const;
  function drag(h: Awaited<ReturnType<typeof setup>>, start: number) {
    const data = h.result.current.data!;
    const action = data.rows[0].actions.find(({ id }) => id === 'clip-1')!;
    const session = {
      clipId: 'clip-1', draggedClipIds: ['clip-1'], groupDragEntry: null,
      sourceRowId: 'V1', sourceKind: 'visual', transactionId: 'E015-plain-drag',
      clipOffsets: [{ clipId: 'clip-1', rowId: 'V1', deltaTime: 0, initialStart: action.start, initialEnd: action.end }],
    } as InternalDragSession;
    commitDraggingSession({ session, nextStart: start, dropPosition: null, crossTrackActive: false, liveData: data,
      callbacks: { ...h.result.current.tracks, applyEdit: h.result.current.applyEdit, selectClip: vi.fn(), selectClips: vi.fn() } });
  }
  it.each(relations)('%s drag from %s to %s preserves its exact offset in one commit', async (_relation, on, start, adjusted) => {
    const h = await setup(undefined, false, await relationData({ on, opaque: { value: null } }));
    const before = structuredClone(h.initial.config.clips[0]);
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    const prompt = vi.spyOn(window, 'prompt');
    act(() => drag(h, start));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.nudge', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { frames: Math.round((start - 1) * 30) },
      expect: { at: { state: 'present', value: 1 }, 'app.astrid.on': { state: 'present', value: on },
        'app.astrid.until': { state: 'absent' }, '': { state: 'present', value: before } },
    }] });
    expect(h.result.current.data!.config.clips[0]).toEqual({ ...before, at: start,
      app: { ...before.app, astrid: { on: adjusted, opaque: { value: null } } } });
    expect(commits).toHaveBeenCalledTimes(1);
    // The existing undo boundary receives the complete pre-drag authored clip.
    expect(commits.mock.calls[0][0].config.clips[0]).toEqual(before);
    expect(commits.mock.calls[0][1].transactionId).toBe('E015-plain-drag');
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    expect(h.compatibilityRequests).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
    h.unmount();
  });
  for (const adapter of ['plain', 'resolved'] as const) {
    it.each([
      { on: '"hello"  +2f' }, { on: 'beat 2' }, { on: 'parent/clip:clip-2' },
      { on: null }, { on: '' }, { on: { futureAnchor: 'clip-2' } },
    ])(`correction rejects the generic nudge for ${adapter} unsupported on %j`, async (intent) => {
      const h = await setup(undefined, false, await relationData({ ...intent, opaque: { value: null } }));
      const before = structuredClone(h.initial.config.clips[0]);
      const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
      act(() => {
        if (adapter === 'plain') drag(h, 1.3);
        else h.result.current.tracks.applyResolvedClipMove('clip-1', 'V1', 'V1', 1.3, false, 'E015-compatibility');
      });
      // Keep the pre-existing local compatibility edit, with no attached command.
      expect(h.result.current.editSeqRef.current).toBe(1);
      expect(commits).toHaveBeenCalledTimes(1);
      expect(h.result.current.data!.config.clips[0]).toEqual({ ...before, at: 1.3 });
      expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
      expect(h.requests).toEqual([]);
      h.unmount();
    });
  }
  it('correction preserves a legacy authored on through compatibility', async () => {
    const initial = await relationData({ opaque: null });
    initial.config.clips[0].app = { ...initial.config.clips[0].app, on: '"hello"  +2f' };
    initial.meta['clip-1'].app = initial.config.clips[0].app;
    const h = await setup(undefined, false, initial);
    act(() => drag(h, 1.3));
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.result.current.data!.config.clips[0].app).toEqual(initial.config.clips[0].app);
    expect(h.requests).toEqual([]);
    h.unmount();
  });
  it('correction keeps a serialized off-grid source cache on compatibility when the exact consumer declines', async () => {
    const base = await relationData({ on: '"hello" in v20a #2 +2f', opaque: null });
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => clip.id === 'clip-1'
      ? { ...clip, at: 0.966667 } : clip) }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => drag(h, 1.266667));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.result.current.data!.config.clips[0].app).toEqual(initial.config.clips[0].app);
    expect(h.requests).toEqual([]);
    h.unmount();
  });
  it('correction keeps an unsupported timed cross-track move entirely on compatibility', async () => {
    const h = await setup(undefined, false, await relationData({ on: 'c2', opaque: null }));
    act(() => h.result.current.tracks.applyResolvedClipMove('clip-1', 'V2', 'V2', 1.3, false, 'E015-unsupported-cross-track'));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.result.current.data!.config.clips.find(({ id }) => id === 'clip-1')).toMatchObject({ at: 1.3, track: 'V2',
      app: { astrid: { on: 'c2', opaque: null } } });
    expect(h.requests).toEqual([]);
    h.unmount();
  });
  it('correction preserves the existing generic nudge for a source with no on', async () => {
    const h = await setup(undefined, false, await relationData({ opaque: null }));
    act(() => drag(h, 1.3));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{ op: 'clip.nudge', select: 'parent/clip:clip-1',
      resolved: ['parent/clip:clip-1'], args: { frames: 9 }, expect: { at: { state: 'present', value: 1 },
        'app.astrid.on': { state: 'absent' }, 'app.astrid.until': { state: 'absent' } } }] });
    h.unmount();
  });
  it('correction retains the complete optimistic tied drag after an explicit failed acknowledgement', async () => {
    const h = await setup(async () => 'refused', false, await relationData({ on: '"hello" +2f', opaque: null }));
    act(() => drag(h, 1.3));
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.savedSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(1);
    expect(h.result.current.data!.head!.headRevisionId).toBe('parent-r1');
    expect(h.result.current.data!.config.clips[0]).toMatchObject({ at: 1.3,
      app: { clipSentinel: true, astrid: { on: '"hello" +11f', opaque: null } } });
    expect(gestureCommandsFor(h.result.current.data!)).toHaveLength(1);
    h.unmount();
  });
  it('retries the captured tied drag without adding the offset a second time', async () => {
    const h = await setup(async (_request, call) => call === 1 ? 'unavailable' : undefined,
      false, await relationData({ on: '"hello" +2f' }));
    const commits = vi.fn(); h.eventBus.on('beforeCommit', commits);
    act(() => drag(h, 1.3));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 2500 });
    expect(h.requests).toHaveLength(2);
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect(h.requests[1].request.base_revision_id).toBe('parent-r1');
    expect(h.result.current.data!.config.clips[0].app?.astrid).toEqual({ on: '"hello" +11f' });
    expect(commits).toHaveBeenCalledTimes(1);
    expect(h.result.current.editSeqRef.current).toBe(1);
    h.unmount();
  });
  it('the resolved same-track adapter removes an offset that sums to zero', async () => {
    const h = await setup(undefined, false, await relationData({ on: '"hello" -9f' }));
    act(() => h.result.current.tracks.applyResolvedClipMove('clip-1', 'V1', 'V1', 1.3, false, 'E015-resolved'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.result.current.data!.config.clips[0].app?.astrid).toEqual({ on: '"hello"' });
    h.unmount();
  });
  it.each([
    { on: 'beat 2' }, { on: 'c2' }, { on: 'parent/clip:clip-2' }, { on: '“hello” +2f' },
    { on: '"hello"  +2f' }, { on: '"hello" +2f +3f' }, { on: '"hello"', until: null },
    { on: '"hello"', sequence: { id: 'steps', index: 1 } }, {},
  ])('does not claim an exact offset adaptation for unsupported intent %j', async (intent) => {
    const data = await relationData(intent);
    expect(tiedStartDragGesture(data, 'clip-1', 1.3, 'V1')).toBeUndefined();
  });
  it('does not adapt subframe deltas, cross-track moves, animated or grouped sources', async () => {
    const data = await relationData({ on: '"hello" +2f' });
    expect(tiedStartDragGesture(data, 'clip-1', 1.31, 'V1')).toBeUndefined();
    expect(tiedStartDragGesture(data, 'clip-1', 1.3, 'V2')).toBeUndefined();
    Reflect.set(data.config.clips[0], 'keyframes', {});
    expect(tiedStartDragGesture(data, 'clip-1', 1.3, 'V1')).toBeUndefined();
    Reflect.deleteProperty(data.config.clips[0], 'keyframes');
    data.config.clips[0].params = { keyframes: [{ frame: 3, x: 10 }] };
    expect(tiedStartDragGesture(data, 'clip-1', 1.3, 'V1')).toBeUndefined();
    data.config.clips[0].params = {};
    data.config.pinnedShotGroups = [{ shotId: 'shot', trackId: 'V1', clipIds: ['clip-1'] }];
    expect(tiedStartDragGesture(data, 'clip-1', 1.3, 'V1')).toBeUndefined();
  });
});

const shotGroupMedia = {
  asset: 'latest-video-asset',
  generation_id: 'latest-video-generation',
  variant_id: 'latest-video-variant',
  object_id: `sha256:${'a'.repeat(64)}`,
  catalog_digest: `sha256:${'b'.repeat(64)}`,
};

function shotGroupVideoMap(media = shotGroupMedia, id = media.object_id, includeSelectedMedia = true) {
  return new Map<string, ShotFinalVideo>([['shot-1', {
    id,
    location: 'https://runtime.fixture/final.mp4',
    thumbnailUrl: null,
    variantFetchGenerationId: null,
    ...(includeSelectedMedia ? { selectedMedia: media, managedOutput: { project_id: 'gesture-project', association_id: 'final-output-association', object_id: id, version: 1 } } : {}),
  }]]);
}

describe('E-SHOT-GROUP-022 mounted callbacks through the parent commit route', () => {
  it('pins the exact selected member order and reloads the accepted exact head projection', async () => {
    const h = await setup(undefined, false, await initialData());
    act(() => h.result.current.groupPins.pinGroup('shot-1', 'V1', ['clip-2', 'clip-1'], 'Opening'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));

    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'shot-group.set', select: null,
      args: { group: { shotId: 'shot-1', trackId: 'V1' }, intent: 'pin', members: ['parent/clip:clip-2', 'parent/clip:clip-1'], name: 'Opening' },
    }] });
    expect(h.compatibilityRequests).toEqual([]);
    const acceptedHead = h.getCurrentHead();
    await act(async () => h.result.current.persistence.reloadFromServer());
    expect(h.readbackHeads.length).toBeGreaterThan(0);
    expect(h.readbackHeads.every((head) => head === acceptedHead)).toBe(true);
    expect(h.result.current.data!.head!.headRevisionId).toBe(acceptedHead);
    expect(h.result.current.data!.config.pinnedShotGroups).toEqual([expect.objectContaining({
      shotId: 'shot-1', trackId: 'V1', clipIds: ['clip-2', 'clip-1'], mode: 'images', name: 'Opening',
    })]);
    h.unmount();
  });

  it('unpins with an explicit empty delete list and leaves the clips intact', async () => {
    const h = await setup(undefined, false, await shotGroupData());
    const before = h.initial.config.clips.map((clip) => clip.id);
    act(() => h.result.current.groupHandlers.handleShotGroupUnpin({ shotId: 'shot-1', trackId: 'V1' }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'shot-group.remove', select: null,
      args: { group: { shotId: 'shot-1', trackId: 'V1' }, remove_clip_ids: [] },
    }] });
    expect(h.getCurrentConfig().clips.map((clip) => clip.id)).toEqual(before);
    h.unmount();
  });

  it('selectively deletes only verified selected group members', async () => {
    const h = await setup(undefined, false, await shotGroupData());
    act(() => h.result.current.groupHandlers.handleDeleteShotGroup({ shotId: 'shot-1', trackId: 'V1', clipIds: ['clip-2'] }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'shot-group.remove', select: null,
      args: { group: { shotId: 'shot-1', trackId: 'V1' }, remove_clip_ids: ['parent/clip:clip-2'] },
    }] });
    expect(h.getCurrentConfig().clips.map((clip) => clip.id)).toContain('clip-1');
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });

  it('switches back to retained images without sending a caller snapshot', async () => {
    const h = await setup(undefined, false, await shotGroupData('video'));
    act(() => h.result.current.groupHandlers.handleShotGroupSwitchToImages({ shotId: 'shot-1', rowId: 'V1' }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'shot-group.set', select: null,
      args: { group: { shotId: 'shot-1', trackId: 'V1' }, intent: 'images' },
    }] });
    expect(JSON.stringify(h.requests[0].request)).not.toContain('imageClipSnapshot');
    expect(JSON.stringify(h.requests[0].request)).not.toContain('snapshot');
    h.unmount();
  });

  it('switches to video with one captured media tuple and one reserved local ID', async () => {
    const h = await setup(undefined, false, await shotGroupData(), 1, undefined, undefined, 'clip-1', shotGroupVideoMap(), async (request) => {
      expect(request).toEqual({ projectId: 'gesture-project', association_id: 'final-output-association', object_id: shotGroupMedia.object_id, version: 1 });
      return shotGroupMedia;
    });
    act(() => h.result.current.groupHandlers.handleShotGroupSwitchToFinalVideo({ shotId: 'shot-1', rowId: 'V1', clipIds: ['clip-1', 'clip-2'] }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const command = (h.requests[0].request.change as { commands: Array<{ op: string; select: unknown; args: Record<string, unknown> }> }).commands[0];
    expect(command.op).toBe('shot-group.set');
    expect(command.select).toBeNull();
    expect(command.args.group).toEqual({ shotId: 'shot-1', trackId: 'V1' });
    expect(command.args.intent).toBe('video');
    expect(command.args.media).toEqual(shotGroupMedia);
    expect(Object.keys(command.args.media as object).sort()).toEqual(['asset', 'catalog_digest', 'generation_id', 'object_id', 'variant_id']);
    expect(Object.keys(command.args)).toEqual(['group', 'intent', 'media', 'identities']);
    expect((command.args.identities as { clip_id: string }).clip_id).toMatch(/^[^/]+$/);
    expect(JSON.stringify(command.args)).not.toContain('media_record');
    expect(JSON.stringify(command.args)).not.toContain('snapshot');
    h.unmount();
  });

  it('refuses to switch to video when the producer has no captured media tuple', async () => {
    const h = await setup(undefined, false, await shotGroupData(), 1, undefined, undefined, 'clip-1', shotGroupVideoMap(shotGroupMedia, shotGroupMedia.object_id, false));
    const before = h.result.current.data!.config;
    act(() => h.result.current.groupHandlers.handleShotGroupSwitchToFinalVideo({ shotId: 'shot-1', rowId: 'V1', clipIds: ['clip-1', 'clip-2'] }));
    expect(h.requests).toHaveLength(0);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.result.current.data!.config).toEqual(before);
    h.unmount();
  });

  it('updates the video with the captured tuple while retaining the group clip identity', async () => {
    const h = await setup(undefined, false, await shotGroupData('video'), 1, undefined, undefined, 'clip-1', shotGroupVideoMap(), async (request) => {
      expect(request).toEqual({ projectId: 'gesture-project', association_id: 'final-output-association', object_id: shotGroupMedia.object_id, version: 1 });
      return shotGroupMedia;
    });
    act(() => h.result.current.groupHandlers.handleUpdateToLatestVideo({ shotId: 'shot-1', rowId: 'V1' }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'shot-group.set', select: null,
      args: { group: { shotId: 'shot-1', trackId: 'V1' }, intent: 'replace-video', media: shotGroupMedia },
    }] });
    expect(JSON.stringify(h.requests[0].request)).not.toContain('media_record');
    expect(JSON.stringify(h.requests[0].request)).not.toContain('identities');
    h.unmount();
  });

  it('refuses to replace video when the producer has no captured media tuple', async () => {
    const h = await setup(undefined, false, await shotGroupData('video'), 1, undefined, undefined, 'clip-1', shotGroupVideoMap(shotGroupMedia, shotGroupMedia.object_id, false));
    const before = h.result.current.data!.config;
    act(() => h.result.current.groupHandlers.handleUpdateToLatestVideo({ shotId: 'shot-1', rowId: 'V1' }));
    expect(h.requests).toHaveLength(0);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.result.current.data!.config).toEqual(before);
    h.unmount();
  });

  it('replays a lost replace response byte-for-byte before sending a queued images suffix', async () => {
    const h = await setup(
      async (_request, call) => call === 1 ? 'unavailable' : undefined,
      false,
      await shotGroupData('video'),
      1,
      undefined,
      undefined,
      'clip-1',
      shotGroupVideoMap(),
      async (request) => {
        expect(request).toEqual({ projectId: 'gesture-project', association_id: 'final-output-association', object_id: shotGroupMedia.object_id, version: 1 });
        return shotGroupMedia;
      },
    );
    act(() => h.result.current.groupHandlers.handleUpdateToLatestVideo({ shotId: 'shot-1', rowId: 'V1' }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    act(() => h.result.current.groupHandlers.handleShotGroupSwitchToImages({ shotId: 'shot-1', rowId: 'V1' }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 3500 });
    expect(h.requests[0].bytes).toBe(h.requests[1].bytes);
    expect(h.requests[0].headers).toEqual(h.requests[1].headers);
    expect(h.requests[0].request.request_id).toBe(h.requests[1].request.request_id);
    const writes = h.requests.filter(({ request }) => !request.dry_run);
    expect(writes).toHaveLength(3);
    expect((writes[0].request.change as { commands: Array<{ op: string; args: Record<string, unknown> }> }).commands[0]).toEqual(expect.objectContaining({
      op: 'shot-group.set', args: expect.objectContaining({ intent: 'replace-video', media: shotGroupMedia }),
    }));
    expect((writes[2].request.change as { commands: Array<{ op: string; args: Record<string, unknown> }> }).commands[0]).toEqual(expect.objectContaining({
      op: 'shot-group.set', args: expect.objectContaining({ intent: 'images' }),
    }));
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });

  it('refuses an output whose captured media belongs to a different immutable object', async () => {
    const staleMap = shotGroupVideoMap(shotGroupMedia, `sha256:${'c'.repeat(64)}`);
    const h = await setup(undefined, false, await shotGroupData(), 1, undefined, undefined, 'clip-1', staleMap);
    const before = h.result.current.data!.config;
    act(() => h.result.current.groupHandlers.handleShotGroupSwitchToFinalVideo({ shotId: 'shot-1', rowId: 'V1', clipIds: ['clip-1', 'clip-2'] }));
    expect(h.requests).toHaveLength(0);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.result.current.data!.config).toEqual(before);
    h.unmount();
  });

  it('keeps a refused pin out of the in-memory canonical config', async () => {
    const h = await setup(async () => 'refused', false, await initialData());
    const before = h.result.current.data!.config;
    act(() => h.result.current.groupPins.pinGroup('shot-1', 'V1', ['clip-1', 'clip-2']));
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.requests).toHaveLength(1);
    expect(h.result.current.data!.config).toEqual(before);
    expect(h.getCurrentConfig()).toEqual(before);
    expect(h.compatibilityRequests).toEqual([]);
    h.unmount();
  });
});

async function overlapRelationData(occurrence = false) {
  const base = await initialData();
  const prefix = occurrence ? 'occurrence:occ-A' : 'parent';
  const clips = [
    { id: 'clip-1', at: 0, clipType: 'media' as const, asset: 'audio', from: 0, to: 2, speed: 1, track: 'A1',
      app: { opaque: { null: null, array: [0, false, ''], literal: { op: 'clear' } } } },
    { id: 'clip-2', at: 3, clipType: 'media' as const, asset: 'audio', from: 0, to: 1, speed: 1, track: 'A1',
      app: { opaque: { preserved: true }, astrid: { on: `clip-end "${prefix}/clip:clip-1" +1s`, opaque: { keep: null } } } },
  ];
  return buildTimelineData({ ...base.config, tracks: [{ id: 'A1', kind: 'audio', label: 'Audio' }], clips: clips.map((source) => occurrence
    ? { ...source, id: `projected-${source.id}`, app: { ...source.app, canonical: {
      projectId: 'gesture-project', parentDocumentId: 'gesture-timeline', headRevisionId: 'parent-r1',
      occurrenceId: 'occ-A', shotId: 'shot-A', revisionId: 'shot-r1', internalTimelineRevisionId: 'internal-r1',
      sourceClipId: source.id, outputIdentity: 'output-A', sourceClip: source,
    } } } : source) }, { assets: { audio: { file: 'fixture.wav', type: 'audio', duration: 10 } } }, undefined, 1, undefined, base.head);
}
function resizeOverlap(h: Awaited<ReturnType<typeof setup>>, opts: { occurrence?: boolean; cancelled?: boolean; group?: boolean; multiple?: boolean; afterStart?: () => void } = {}) {
  const row = h.result.current.data!.rows[0];
  const clipId = opts.occurrence ? 'projected-clip-1' : 'clip-1';
  const action = row.actions.find((candidate) => candidate.id === clipId)!;
  act(() => h.result.current.resize.onActionResizeStart({ action, row, dir: 'right' }));
  opts.afterStart?.();
  act(() => h.result.current.resize.onClipEdgeResizeEnd({
    session: { pointerId: 1, rowId: 'A1', clipId, edge: 'right', cursorOffsetPx: 0, initialBoundaryTime: 2,
      context: opts.group ? { kind: 'group', clipId, groupClipIds: [clipId, 'clip-2'], initialStart: 0, initialEnd: 2 } as never
        : { kind: 'free', clipId, initialStart: 0, initialEnd: 2 }, siblingTimes: [] },
    updates: [{ clipId, start: 0, end: 3.5 }, ...(opts.multiple ? [{ clipId: 'clip-2', start: 3, end: 4 }] : [])], cancelled: opts.cancelled ?? false,
  }));
}

describe('ordinary overlap relation resize', () => {
  it.each([false, true])('sends exact scoped clip.trim and adjacent relation choices (occurrence=%s)', async (occurrence) => {
    for (const choice of ['keep', 'detach', 'adjust-offset', 're-anchor']) {
      const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce(choice);
      const prefix = occurrence ? 'occurrence:occ-A' : 'parent';
      if (choice === 're-anchor') prompt.mockReturnValueOnce(`clip-start "${prefix}/clip:clip-1"`);
      if (choice === 'adjust-offset' || choice === 're-anchor') prompt.mockReturnValueOnce('-0.125').mockReturnValueOnce('9');
      const initial = await overlapRelationData(occurrence);
      const before = structuredClone(initial.config);
      const h = await setup(undefined, false, initial);
      const history = vi.fn(); h.eventBus.on('beforeCommit', history);
      resizeOverlap(h, { occurrence });
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      expect(prompt.mock.calls[0][0]).toContain(`clip-end "${prefix}/clip:clip-1" +1s`);
      expect(h.requests).toHaveLength(1);
      const relation = { target: `${prefix}/clip:clip-2`, edge: 'start', choice,
        ...(choice === 're-anchor' ? { anchor: `clip-start "${prefix}/clip:clip-1"` } : {}),
        ...(['adjust-offset', 're-anchor'].includes(choice) ? { offset_seconds: -0.125, offset_frames: 9 } : {}) };
      const source = occurrence ? (initial.config.clips[0].app!.canonical as CanonicalClipIdentity).sourceClip : before.clips[0];
      expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' }, change: {
        commands: [{ op: 'clip.trim', select: `${prefix}/clip:clip-1`, resolved: [`${prefix}/clip:clip-1`],
          args: { out_s: 3, relation_choices: [relation] }, expect: { '': { state: 'present', value: source } } }],
      } });
      const wire = h.requests[0].request.change as { commands: Array<{ args: Record<string, unknown> }> };
      expect(wire.commands).toHaveLength(1);
      expect(wire.commands[0].args).not.toHaveProperty('relation_affected');
      expect(h.result.current.data!.config).toEqual(before);
      expect(history).toHaveBeenCalledTimes(1);
      expect(history.mock.calls[0]).toEqual([initial, expect.objectContaining({ semantic: true, transactionId: expect.any(String) })]);
      expect(h.result.current.editSeqRef.current).toBe(1);
      expect(h.compatibilityRequests).toEqual([]);
      if (occurrence) expect(h.requests[0].request.scope).toMatchObject({ target: 'occurrence:occ-A' });
      const evidence = process.env.E_W40_WIRE_EVIDENCE_PATH;
      if (evidence && !occurrence && choice === 'detach') writeFileSync(evidence, JSON.stringify(h.requests[0].request, null, 2));
      h.unmount(); prompt.mockRestore();
    }
  });
  it.each(['cancel', null, 'unknown', 're-anchor', 'adjust-offset'])('cancelled/unfinished choice %s creates no draft, request or history', async (choice) => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce(choice).mockReturnValue(null);
    const initial = await overlapRelationData(); const h = await setup(undefined, false, initial);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    resizeOverlap(h);
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]);
    expect(h.result.current.data).toBe(initial); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(history).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled();
    expect(prompt).toHaveBeenCalled(); h.unmount();
  });
  it('pointer cancel does not prompt or create a partial trim', async () => {
    const prompt = vi.spyOn(window, 'prompt'); const initial = await overlapRelationData();
    const h = await setup(undefined, false, initial); resizeOverlap(h, { cancelled: true });
    expect(prompt).not.toHaveBeenCalled(); expect(h.requests).toEqual([]);
    expect(h.result.current.data).toBe(initial); expect(h.result.current.editSeqRef.current).toBe(0); h.unmount();
  });
  it.each(['before prompt', 'during prompt'])('refuses a stale captured head %s', async (when) => {
    const initial = await overlapRelationData(); const h = await setup(undefined, false, initial);
    const stale = () => { h.result.current.dataRef.current = { ...initial, head: { ...initial.head!, headRevisionId: 'new-head' } }; };
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => { stale(); return 'detach'; });
    resizeOverlap(h, { afterStart: when === 'before prompt' ? stale : undefined });
    expect(prompt).toHaveBeenCalledTimes(when === 'before prompt' ? 0 : 1);
    expect(h.requests).toEqual([]); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(initial.config.clips[0].to).toBe(2); h.unmount();
  });
  it.each(['duplicate source', 'duplicate adjacent', 'stale occurrence'])('refuses %s identity without fallback', async (kind) => {
    const initial = await overlapRelationData(kind === 'stale occurrence');
    if (kind === 'stale occurrence') initial.config.clips[1].app!.canonical = { ...(initial.config.clips[1].app!.canonical as CanonicalClipIdentity), headRevisionId: 'old' };
    else initial.config.clips.push(structuredClone(initial.config.clips[kind === 'duplicate source' ? 0 : 1]));
    const prompt = vi.spyOn(window, 'prompt'); const h = await setup(undefined, false, initial);
    resizeOverlap(h, { occurrence: kind === 'stale occurrence' });
    expect(prompt).not.toHaveBeenCalled(); expect(h.requests).toEqual([]);
    expect(h.compatibilityRequests).toEqual([]); expect(h.result.current.editSeqRef.current).toBe(0); h.unmount();
  });
  it.each(['rejected', 'refused', 'unavailable'] as const)('late %s retains the complete authored base', async (outcome) => {
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    const initial = await overlapRelationData(); const before = structuredClone(initial.config);
    const h = await setup(async () => { await held; return outcome; }, false, initial);
    resizeOverlap(h); await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.result.current.data!.config).toEqual(before); release();
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe(outcome === 'unavailable' ? 'retrying' : 'error'));
    expect(h.savedSeqRef.current).toBe(0); expect(h.result.current.data!.config).toEqual(before);
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  });
  it('an adjacent screen overlap without the authored clip relation stays on its existing path', async () => {
    const initial = await overlapRelationData(); delete initial.config.clips[1].app!.astrid;
    const h = await setup(undefined, false, initial); const prompt = vi.spyOn(window, 'prompt');
    resizeOverlap(h); expect(prompt).not.toHaveBeenCalled(); expect(h.result.current.data!.config.clips[0].to).toBe(3);
    expect(h.result.current.data!.config).not.toEqual(initial.config); h.unmount();
  });
});

async function leftOverlapRelationData() {
  const base = await overlapRelationData();
  return buildTimelineData({ ...base.config, clips: [
    { ...base.config.clips[0], at: 2, from: 2, to: 6, speed: 2 },
    { ...base.config.clips[1], at: 1, app: { ...base.config.clips[1].app,
      astrid: { on: 'clip-start "parent/clip:clip-1" -1s', opaque: { keep: null } } } },
  ] }, base.registry, undefined, 1, undefined, base.head);
}
function resizeLeftOverlap(h: Awaited<ReturnType<typeof setup>>, options: { cancelled?: boolean; group?: boolean; multiple?: boolean; afterStart?: () => void } = {}) {
  const row = h.result.current.data!.rows[0];
  const action = row.actions.find((candidate) => candidate.id === 'clip-1')!;
  act(() => h.result.current.resize.onActionResizeStart({ action, row, dir: 'left' }));
  options.afterStart?.();
  act(() => h.result.current.resize.onClipEdgeResizeEnd({
    session: { pointerId: 1, rowId: 'A1', clipId: 'clip-1', edge: 'left', cursorOffsetPx: 0, initialBoundaryTime: 2,
      context: options.group ? { kind: 'group', clipId: 'clip-1', groupClipIds: ['clip-1', 'clip-2'], initialStart: 2, initialEnd: 4 } as never
        : { kind: 'free', clipId: 'clip-1', initialStart: 2, initialEnd: 4 }, siblingTimes: [] },
    updates: [{ clipId: 'clip-1', start: 1.5, end: 4 }, ...(options.multiple ? [{ clipId: 'clip-2', start: 1, end: 2 }] : [])],
    cancelled: options.cancelled ?? false,
  }));
}

// Run the actual handler wire on the admitted SDK, including the history-emitted
// inverse. No App-side diff or fake command interpreter supplies these writes.
function overlapResizeSource(initial: TimelineData, forward: CommitRequest, inverse?: CommitRequest, redo?: CommitRequest) {
  const python = process.env.ASTRID_TEST_PYTHON;
  if (!python) throw new Error('Set ASTRID_TEST_PYTHON to the qualified SDK test interpreter');
  const output = execFileSync(python, ['-B', '-c', `
import copy,json,os,sys
from pathlib import Path
sys.path.insert(0,os.environ['ASTRID_CHECKOUT'])
from astrid.sdk.timeline.checkout import Checkout
from astrid.sdk.timeline import commands,relations
value=json.load(sys.stdin)
left=len(value['forward']['change']['commands'])==2
fixture=json.loads((Path(os.environ['ASTRID_CHECKOUT'])/'tests/fixtures/timeline_editing/tiny_publishable.json').read_text())
fixture['shots']={};fixture['placements']=[]
fixture['parent']={'config':{'output':value['config']['output'],'tracks':value['config']['tracks']},'clips':value['config']['clips'],'registry':value['registry']}
tl=Checkout(fixture);before=copy.deepcopy(tl.document())
closure=relations.affected(tl,['parent/clip:clip-1'])
expected=[dict(target='parent/clip:'+clip['id'],edge='start',relation=clip['app']['astrid']['on'])
 for clip in value['config']['clips'] if clip.get('app',{}).get('astrid',{}).get('on','').startswith(('clip-start' if left else 'clip-end')+' "parent/clip:clip-1"')]
assert closure==sorted(expected,key=lambda row:(row['target'],row['edge']))
try:
 with tl.edit('overlap resize',quiet=True) as tx:
  for call in value['forward']['change']['commands']: commands.execute(tl,call)
except commands.SemanticConflict:
 assert any(choice['choice']=='keep' for choice in value['forward']['change']['commands'][-1]['args']['relation_choices'])
 assert tl.document()==before and not tl._journal
 print(json.dumps({'writes':[],'calls':value['forward']['change']['commands'],'clips':before['parent']['clips'],'refused':True,'closure':closure,'journal':len(tl._journal)}))
 sys.exit(0)
assert [call.op for call in tx.plan.calls]==(['clip.trim','clip.nudge'] if left else ['clip.trim'])
assert tx.plan.calls[-1].args['relation_affected']==closure
assert len(tl._journal)==1
writes=tx.plan.direct_writes
after=copy.deepcopy(tl.document())
inverse_writes=None;redo_writes=None
if value.get('inverse'):
 inverse_plan=commands.run(tl,value['inverse']['change']['commands'][0])
 inverse_writes=inverse_plan.direct_writes
 assert tl.document()==before, (tl.document(),before)
 assert len(tl._journal)==2
if value.get('redo'):
 redo_plan=commands.run(tl,value['redo']['change']['commands'][0])
 redo_writes=redo_plan.direct_writes
 assert tl.document()==after, (tl.document(),after)
 assert len(tl._journal)==3
print(json.dumps({'writes':writes,'inverse_writes':inverse_writes,'redo_writes':redo_writes,'calls':[call.to_json() for call in tx.plan.calls],'clips':tl.document()['parent']['clips'],'after':after['parent']['clips'],'closure':closure,'journal':len(tl._journal)}))
`], { input: JSON.stringify({ config: initial.config, registry: initial.registry, forward, inverse, redo }), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  return JSON.parse(output) as { writes: CommitResult['change']['direct_writes']; calls: unknown[]; clips: unknown[]; after: unknown[]; closure: unknown[]; journal: number; inverse_writes: CommitResult['change']['direct_writes']; redo_writes: CommitResult['change']['direct_writes']; refused?: boolean };
}

describe('left overlap relation resize', () => {
  it.each(['keep', 'detach', 'adjust-offset', 're-anchor'])('prompts and sends the exact ordered pair for %s', async (choice) => {
    const initial = await leftOverlapRelationData(); const h = await setup(undefined, false, initial);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce(choice);
    if (choice === 're-anchor') prompt.mockReturnValueOnce('clip-start "parent/clip:clip-1"');
    if (['adjust-offset', 're-anchor'].includes(choice)) prompt.mockReturnValueOnce('-1').mockReturnValueOnce('0');
    resizeLeftOverlap(h); await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(prompt.mock.calls[0][0]).toContain('clip-start "parent/clip:clip-1" -1s');
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' }, change: { commands: [
      { op: 'clip.trim', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { in_s: 1, out_s: 6 },
        expect: { '': { state: 'present', value: initial.config.clips[0] } } },
      { op: 'clip.nudge', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
        args: { frames: -15, relation_choices: [{ target: 'parent/clip:clip-2', edge: 'start', choice,
          ...(choice === 're-anchor' ? { anchor: 'clip-start "parent/clip:clip-1"' } : {}),
          ...(['adjust-offset', 're-anchor'].includes(choice) ? { offset_seconds: -1, offset_frames: 0 } : {}) }] },
        expect: { at: { state: 'present', value: 2 }, 'parent/clip:clip-2::intent.on': { state: 'present', value: 'clip-start "parent/clip:clip-1" -1s' },
          'parent/clip:clip-2::at': { state: 'present', value: 1 }, 'parent/clip:clip-2::hold': { state: 'absent' } } },
    ] } });
    const wire = h.requests[0].request.change as { commands: unknown[] };
    expect(wire.commands).toHaveLength(2);
    const source = overlapResizeSource(initial, h.requests[0].request);
    expect(source.calls).toHaveLength(2); expect(source.refused ?? false).toBe(choice === 'keep');
    expect(history).toHaveBeenCalledTimes(1); expect(history.mock.calls[0][1]).toMatchObject({ semantic: true, transactionId: expect.any(String) });
    expect(h.result.current.editSeqRef.current).toBe(1); expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  }, 20_000);
  it.each(['cancel', null, 'unknown', 're-anchor', 'adjust-offset'])('cancelled/unfinished choice %s sends no write', async (choice) => {
    const initial = await leftOverlapRelationData(); const h = await setup(undefined, false, initial);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history); const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    vi.spyOn(window, 'prompt').mockReturnValueOnce(choice).mockReturnValue(null);
    resizeLeftOverlap(h);
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.result.current.data).toBe(initial); expect(history).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled(); h.unmount();
  });
  it.each(['geometry', 'outside closure', 'group', 'multiple selected', 'primary end tie', 'unsupported grammar', 'pointer cancel', 'stale head', 'stale during prompt', 'duplicate identity'])('refuses %s without writing', async (kind) => {
    const initial = await leftOverlapRelationData();
    if (kind === 'geometry') delete initial.config.clips[1].app!.astrid;
    if (kind === 'outside closure') initial.config.clips[1].app!.astrid!.on = 'clip-start "parent/clip:clip-3"';
    if (kind === 'unsupported grammar') initial.config.clips[1].app!.astrid!.on = 'beat 4';
    if (kind === 'duplicate identity') initial.config.clips.push(structuredClone(initial.config.clips[1]));
    if (kind === 'primary end tie') initial.config.clips[0].app!.astrid = { until: 'end' };
    const h = await setup(undefined, false, initial); const prompt = vi.spyOn(window, 'prompt');
    if (kind === 'stale during prompt') prompt.mockImplementation(() => {
      h.result.current.dataRef.current = { ...initial, head: { ...initial.head!, headRevisionId: 'new-head' } }; return 'detach';
    });
    resizeLeftOverlap(h, { group: kind === 'group', multiple: kind === 'multiple selected', cancelled: kind === 'pointer cancel',
      afterStart: kind === 'stale head' ? () => { h.result.current.dataRef.current = { ...initial, head: { ...initial.head!, headRevisionId: 'new-head' } }; } : undefined });
    expect(prompt).toHaveBeenCalledTimes(kind === 'stale during prompt' ? 1 : 0); expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]);
    expect(h.result.current.editSeqRef.current).toBe(0); expect(h.result.current.data!.config).toEqual(initial.config); h.unmount();
  });
  it('uses accepted SDK writes for one Undo/Redo and restores both authored clips exactly', async () => {
    const initial = await leftOverlapRelationData(); let forward!: CommitRequest;
    let writes!: CommitResult['change']['direct_writes']; let restored: unknown[] | undefined;
    const h = await setup(async (request, call) => {
      if (call === 1) { forward = request; writes = overlapResizeSource(initial, request).writes; return { directWrites: writes }; }
      const command = (request.change as { commands: Array<{ args: { writes: typeof writes } }> }).commands[0];
      if (call === 2) {
        const source = overlapResizeSource(initial, forward, request); restored = source.clips;
        if (process.env.E_W40_LEFT_EVIDENCE_PATH) writeFileSync(process.env.E_W40_LEFT_EVIDENCE_PATH,
          JSON.stringify({ forward, inverse: request, writes, source, original: initial.config.clips }, null, 2));
      }
      return { directWrites: command.args.writes };
    }, false, initial);
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(VideoEditorRuntimeProvider, {
      value: { provider: h.provider, timelineId: 'gesture-timeline', project: { projectId: 'gesture-project' },
        toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } } as unknown as VideoEditorRuntimeContextValue, children,
    });
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      useEffect(() => h.eventBus.on('remoteCommit', state.onRemoteData), [state.onRemoteData]);
      return state;
    }, { wrapper });
    vi.spyOn(window, 'prompt').mockReturnValue('detach'); resizeLeftOverlap(h);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1)); await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    expect(writes.map((write) => write.path).sort()).toEqual(['at', 'from', 'hold', 'intent.fixed_start', 'intent.on']);
    // A canonical adoption must preserve this one native history owner.
    const adopted = await buildTimelineData(initial.config, initial.registry, undefined, 2, undefined, h.headRevisionRef.current);
    act(() => h.result.current.commitData(adopted, { save: false, skipHistory: true, updateLastSavedSignature: true }));
    expect(history.result.current.canUndo).toBe(true);
    act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    expect(restored).toEqual(initial.config.clips);
    expect(h.requests[1].request.change).toEqual({ commands: [{ op: 'timeline.inverse', select: null, args: { publication: 'pub-parent-r2',
      writes: writes.map((write) => ({ ...write, before: write.after, after: write.before })) } }] });
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3)); expect(h.requests).toHaveLength(3);
    expect(h.requests[2].request.change).toEqual({ commands: [{ op: 'timeline.inverse', select: null, args: { publication: 'pub-parent-r3', writes } }] });
    expect(h.compatibilityRequests).toEqual([]); history.unmount(); h.unmount();
  }, 60_000);
});

async function multiLeftOverlapData(count = 2) {
  const base = await leftOverlapRelationData();
  return buildTimelineData({ ...base.config, clips: [
    ...base.config.clips,
    ...Array.from({ length: count - 1 }, (_, index) => ({
      ...structuredClone(base.config.clips[1]), id: `clip-${index + 3}`, at: 1.2 + index / 10,
      app: { opaque: { distinct: index, absent: null, values: [false, 0, ''] }, astrid: {
        on: `clip-start "parent/clip:clip-1" -0.8s +${index * 3}f`, opaque: { retain: [null] },
      } },
    })),
    { ...structuredClone(base.config.clips[0]), id: 'opaque-sibling', at: 7, from: 0, to: 1, speed: 1 },
  ] }, base.registry, undefined, 1, undefined, base.head);
}

const overlapHistoryWrapper = (h: Awaited<ReturnType<typeof setup>>) => ({ children }: { children: React.ReactNode }) => React.createElement(VideoEditorRuntimeProvider, {
  value: { provider: h.provider, timelineId: 'gesture-timeline', project: { projectId: 'gesture-project' },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } } as unknown as VideoEditorRuntimeContextValue, children,
});

describe('multiple left overlap relation resize', () => {
  it.each(['keep', 'adjust-offset'])('allows distinct sibling choices and atomically handles a later %s', async (lastChoice) => {
    const initial = await multiLeftOverlapData(); let source: ReturnType<typeof overlapResizeSource> | undefined;
    const h = await setup(async (request) => {
      source = overlapResizeSource(initial, request);
      return source.refused ? 'refused' : { directWrites: source.writes };
    }, false, initial);
    vi.spyOn(window, 'prompt').mockReturnValueOnce('detach').mockReturnValueOnce(lastChoice).mockReturnValueOnce('-0.8').mockReturnValueOnce('0');
    resizeLeftOverlap(h);
    await waitFor(() => expect(source).toBeDefined());
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe(lastChoice === 'keep' ? 'error' : 'saved'));
    const commands = (h.requests[0].request.change as { commands: Array<{ args: Record<string, unknown> }> }).commands;
    expect(commands[1].args.relation_choices).toEqual([
      { target: 'parent/clip:clip-2', edge: 'start', choice: 'detach' },
      { target: 'parent/clip:clip-3', edge: 'start', choice: lastChoice, ...(lastChoice === 'adjust-offset' ? { offset_seconds: -0.8, offset_frames: 0 } : {}) },
    ]);
    expect(source!.journal).toBe(lastChoice === 'keep' ? 0 : 1);
    if (lastChoice === 'keep') {
      expect(source!.clips).toEqual(initial.config.clips); expect(source!.writes).toEqual([]);
      expect(h.savedSeqRef.current).toBe(0); expect(h.getCurrentHead()).toBe('parent-r1');
    }
    expect(h.requests).toHaveLength(1); expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  }, 20_000);

  it.each(['keep', 'detach', 'adjust-offset', 're-anchor'])('prompts each exact sibling and runs the SDK for %s', async (choice) => {
    const initial = await multiLeftOverlapData(); let source: ReturnType<typeof overlapResizeSource> | undefined;
    const h = await setup(async (request) => {
      source = overlapResizeSource(initial, request);
      return source.refused ? 'refused' : { directWrites: source.writes };
    }, false, initial);
    const prompt = vi.spyOn(window, 'prompt');
    for (const seconds of ['-1', '-0.8']) {
      prompt.mockReturnValueOnce(choice);
      if (choice === 're-anchor') prompt.mockReturnValueOnce('clip-start "parent/clip:clip-1"');
      if (choice === 'adjust-offset' || choice === 're-anchor') prompt.mockReturnValueOnce(seconds).mockReturnValueOnce('0');
    }
    resizeLeftOverlap(h);
    await waitFor(() => expect(source).toBeDefined());
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe(choice === 'keep' ? 'error' : 'saved'));
    const prompts = prompt.mock.calls.filter(([text]) => String(text).startsWith('The start of'));
    expect(prompts.map(([text]) => text)).toEqual([
      expect.stringContaining('clip-2 is tied to clip-start "parent/clip:clip-1" -1s'),
      expect.stringContaining('clip-3 is tied to clip-start "parent/clip:clip-1" -0.8s +0f'),
    ]);
    expect(h.requests).toHaveLength(1);
    const calls = (h.requests[0].request.change as { commands: Array<{ op: string; args: Record<string, unknown>; expect: Record<string, unknown> }> }).commands;
    expect(calls.map((call) => call.op)).toEqual(['clip.trim', 'clip.nudge']);
    expect(calls[0].args).toEqual({ in_s: 1, out_s: 6 });
    expect(calls[0].expect).toEqual({ '': { state: 'present', value: initial.config.clips[0] } });
    expect(calls[1].args).toEqual({ frames: -15, relation_choices: initial.config.clips.slice(1, 3).map((clip, index) => ({
      target: `parent/clip:${clip.id}`, edge: 'start', choice,
      ...(choice === 're-anchor' ? { anchor: 'clip-start "parent/clip:clip-1"' } : {}),
      ...(['adjust-offset', 're-anchor'].includes(choice) ? { offset_seconds: index ? -0.8 : -1, offset_frames: 0 } : {}),
    })) });
    expect(calls[1].expect).toEqual({ at: { state: 'present', value: 2 }, ...Object.fromEntries(initial.config.clips.slice(1, 3).flatMap((clip) => [
      [`parent/clip:${clip.id}::intent.on`, { state: 'present', value: clip.app!.astrid!.on }],
      [`parent/clip:${clip.id}::at`, { state: 'present', value: clip.at }],
      [`parent/clip:${clip.id}::hold`, { state: 'absent' }],
    ])) });
    expect(calls[1].args).not.toHaveProperty('relation_affected');
    expect(source!.closure).toEqual(initial.config.clips.slice(1, 3).map((clip) => ({ target: `parent/clip:${clip.id}`, edge: 'start', relation: clip.app!.astrid!.on })));
    expect(source!.journal).toBe(choice === 'keep' ? 0 : 1);
    expect(h.savedSeqRef.current).toBe(choice === 'keep' ? 0 : 1);
    expect(h.getCurrentHead()).toBe(choice === 'keep' ? 'parent-r1' : 'parent-r2');
    expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  }, 20_000);

  it.each([2, 3])('restores all %i dependents through actual SDK inverse and native Undo/Redo', async (count) => {
    const initial = await multiLeftOverlapData(count);
    let forward!: CommitRequest; let inverse!: CommitRequest;
    let accepted!: ReturnType<typeof overlapResizeSource>; let restored!: ReturnType<typeof overlapResizeSource>; let redone!: ReturnType<typeof overlapResizeSource>;
    const h = await setup(async (request, call) => {
      if (call === 1) { forward = request; accepted = overlapResizeSource(initial, request); return { directWrites: accepted.writes }; }
      if (call === 2) { inverse = request; restored = overlapResizeSource(initial, forward, request); return { directWrites: restored.inverse_writes }; }
      redone = overlapResizeSource(initial, forward, inverse, request);
      if (process.env.E_W40_MULTI_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W40_MULTI_EVIDENCE_DIR, `sdk-history-${count}.json`),
        JSON.stringify({ forward, inverse, redo: request, accepted, restored, redone, original: initial.config.clips }, null, 2));
      return { directWrites: redone.redo_writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      useEffect(() => h.eventBus.on('remoteCommit', state.onRemoteData), [state.onRemoteData]);
      return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    vi.spyOn(window, 'prompt').mockReturnValue('detach'); resizeLeftOverlap(h);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1)); await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    expect(new Set(accepted.writes.map((write) => write.id))).toEqual(new Set(initial.config.clips.slice(0, count + 1).map((clip) => `parent/clip:${clip.id}`)));
    expect(accepted.writes.map((write) => write.path).sort()).toEqual(['at', 'from', 'hold', ...Array.from({ length: count }, () => ['intent.on', 'intent.fixed_start']).flat()].sort());
    const adopted = await buildTimelineData(initial.config, initial.registry, undefined, 2, undefined, h.headRevisionRef.current);
    act(() => h.result.current.commitData(adopted, { save: false, skipHistory: true, updateLastSavedSignature: true }));
    expect(history.result.current.canUndo).toBe(true);
    act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    expect(restored.clips).toEqual(initial.config.clips);
    expect(restored.inverse_writes).toEqual(accepted.writes.map((write) => ({ ...write, before: write.after, after: write.before })));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(redone.clips).toEqual(accepted.after); expect(redone.redo_writes).toEqual(accepted.writes);
    expect(redone.journal).toBe(3); expect(h.requests).toHaveLength(3);
    expect(h.requests.map(({ request }) => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(h.compatibilityRequests).toEqual([]); history.unmount(); h.unmount();
  }, 60_000);

  it.each([null, 'unknown', 're-anchor', 'adjust-offset', 'invalid seconds', 'fractional frames'])('later sibling cancellation/invalid %s is atomic', async (answer) => {
    const initial = await multiLeftOverlapData(); const h = await setup(undefined, false, initial);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history); const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('detach');
    if (answer === 'invalid seconds') prompt.mockReturnValueOnce('adjust-offset').mockReturnValueOnce('NaN').mockReturnValueOnce('0');
    else if (answer === 'fractional frames') prompt.mockReturnValueOnce('adjust-offset').mockReturnValueOnce('0').mockReturnValueOnce('0.5');
    else prompt.mockReturnValueOnce(answer).mockReturnValue(null);
    resizeLeftOverlap(h);
    expect(prompt.mock.calls[1][0]).toContain('clip-3 is tied to');
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]);
    expect(h.result.current.data).toBe(initial); expect(h.result.current.editSeqRef.current).toBe(0); expect(h.savedSeqRef.current).toBe(0);
    expect(h.getCurrentConfig()).toEqual(initial.config); expect(h.getCurrentHead()).toBe('parent-r1');
    expect(history).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled(); h.unmount();
  });

  it.each(['geometry', 'word', 'music', 'other clip', 'ambiguous grammar', 'duplicate identity', 'group', 'multiple selected', 'primary end tie', 'pointer cancel', 'stale head', 'stale config', 'stale fps', 'stale at later prompt'])('refuses multi %s without a command or fallback write', async (kind) => {
    const initial = await multiLeftOverlapData();
    if (kind === 'geometry') delete initial.config.clips[2].app!.astrid;
    if (kind === 'word') initial.config.clips[2].app!.astrid!.on = '"hello"';
    if (kind === 'music') initial.config.clips[2].app!.astrid!.on = 'beat 4';
    if (kind === 'other clip') initial.config.clips[2].app!.astrid!.on = 'clip-start "parent/clip:clip-2"';
    if (kind === 'ambiguous grammar') initial.config.clips[2].app!.astrid!.on += ' +1';
    if (kind === 'duplicate identity') initial.config.clips.push(structuredClone(initial.config.clips[2]));
    if (kind === 'primary end tie') initial.config.clips[0].app!.astrid = { until: 'end' };
    const h = await setup(undefined, false, initial); const prompt = vi.spyOn(window, 'prompt').mockReturnValue('detach');
    const stale = () => { h.result.current.dataRef.current = { ...initial, head: { ...initial.head!, headRevisionId: 'changed' } }; };
    if (kind === 'stale at later prompt') prompt.mockReturnValueOnce('detach').mockImplementationOnce(() => { stale(); return 'detach'; });
    resizeLeftOverlap(h, { group: kind === 'group', multiple: kind === 'multiple selected', cancelled: kind === 'pointer cancel', afterStart: () => {
      if (kind === 'stale head') stale();
      if (kind === 'stale config') h.result.current.dataRef.current = { ...initial, config: { ...initial.config, clips: initial.config.clips.slice(0, 3) } };
      if (kind === 'stale fps') h.result.current.dataRef.current = { ...initial, output: { ...initial.output, fps: 60 } };
    } });
    expect(prompt).toHaveBeenCalledTimes(kind === 'stale at later prompt' ? 2 : 0);
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.result.current.data!.config).toEqual(initial.config); expect(h.getCurrentHead()).toBe('parent-r1'); h.unmount();
  });

  it.each(['rejected', 'refused', 'stale'] as const)('multi late %s preserves graph/head and creates no native history entry', async (outcome) => {
    const initial = await multiLeftOverlapData(); let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    const h = await setup(async () => { await held; return outcome; }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    vi.spyOn(window, 'prompt').mockReturnValue('detach'); resizeLeftOverlap(h);
    await waitFor(() => expect(h.requests).toHaveLength(1)); expect(h.result.current.data!.config).toEqual(initial.config);
    release(); await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.savedSeqRef.current).toBe(0); expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.getCurrentHead()).toBe('parent-r1'); expect(history.result.current.canUndo).toBe(false);
    expect(h.compatibilityRequests).toEqual([]); history.unmount(); h.unmount();
  });
});

async function multiRightOverlapData(count = 2) {
  const base = await overlapRelationData();
  return buildTimelineData({ ...base.config, clips: [
    ...base.config.clips,
    ...Array.from({ length: count - 1 }, (_, index) => ({
      ...structuredClone(base.config.clips[1]), id: `clip-${index + 3}`, at: (96 + index * 3) / 30,
      app: { opaque: { distinct: index, absent: null, values: [false, 0, ''] }, astrid: {
        on: index === 0 ? 'clip-end "parent/clip:clip-1" +1.3s -3f' : `clip-end "parent/clip:clip-1" +1.2s +${index * 3}f`, opaque: { retain: [null] },
      } },
    })),
    { ...structuredClone(base.config.clips[0]), id: 'opaque-sibling', at: 7, from: 0, to: 1, speed: 1 },
  ] }, base.registry, undefined, 1, undefined, base.head);
}

describe('multiple right overlap relation resize', () => {
  it.each(['keep', 'adjust-offset'])('allows distinct sibling choices and atomically handles a later %s', async (lastChoice) => {
    const initial = await multiRightOverlapData(); let source: ReturnType<typeof overlapResizeSource> | undefined;
    const h = await setup(async (request) => {
      source = overlapResizeSource(initial, request);
      return source.refused ? 'refused' : { directWrites: source.writes };
    }, false, initial);
    vi.spyOn(window, 'prompt').mockReturnValueOnce('detach').mockReturnValueOnce(lastChoice).mockReturnValueOnce('1.2').mockReturnValueOnce('0');
    resizeOverlap(h);
    await waitFor(() => expect(source).toBeDefined());
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe(lastChoice === 'keep' ? 'error' : 'saved'));
    const commands = (h.requests[0].request.change as { commands: Array<{ args: Record<string, unknown> }> }).commands;
    expect(commands[0].args.relation_choices).toEqual([
      { target: 'parent/clip:clip-2', edge: 'start', choice: 'detach' },
      { target: 'parent/clip:clip-3', edge: 'start', choice: lastChoice, ...(lastChoice === 'adjust-offset' ? { offset_seconds: 1.2, offset_frames: 0 } : {}) },
    ]);
    expect(source!.journal).toBe(lastChoice === 'keep' ? 0 : 1);
    if (lastChoice === 'keep') {
      expect(source!.clips).toEqual(initial.config.clips); expect(source!.writes).toEqual([]);
      expect(h.savedSeqRef.current).toBe(0); expect(h.getCurrentHead()).toBe('parent-r1');
    }
    expect(h.requests).toHaveLength(1); expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  }, 20_000);

  it.each(['keep', 'detach', 'adjust-offset', 're-anchor'])('prompts each exact sibling and runs the SDK for %s', async (choice) => {
    const initial = await multiRightOverlapData(); let source: ReturnType<typeof overlapResizeSource> | undefined;
    const h = await setup(async (request) => {
      source = overlapResizeSource(initial, request);
      return source.refused ? 'refused' : { directWrites: source.writes };
    }, false, initial);
    const prompt = vi.spyOn(window, 'prompt');
    for (const seconds of ['1', '1.2']) {
      prompt.mockReturnValueOnce(choice);
      if (choice === 're-anchor') prompt.mockReturnValueOnce('clip-end "parent/clip:clip-1"');
      if (choice === 'adjust-offset' || choice === 're-anchor') prompt.mockReturnValueOnce(seconds).mockReturnValueOnce('0');
    }
    resizeOverlap(h);
    await waitFor(() => expect(source).toBeDefined());
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe(choice === 'keep' ? 'error' : 'saved'));
    const prompts = prompt.mock.calls.filter(([text]) => String(text).startsWith('The start of'));
    expect(prompts.map(([text]) => text)).toEqual([
      expect.stringContaining('clip-2 is tied to clip-end "parent/clip:clip-1" +1s'),
      expect.stringContaining('clip-3 is tied to clip-end "parent/clip:clip-1" +1.3s -3f'),
    ]);
    expect(h.requests).toHaveLength(1);
    const calls = (h.requests[0].request.change as { commands: Array<{ op: string; args: Record<string, unknown>; expect: Record<string, unknown> }> }).commands;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ op: 'clip.trim', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { out_s: 3, relation_choices: initial.config.clips.slice(1, 3).map((clip, index) => ({
        target: `parent/clip:${clip.id}`, edge: 'start', choice,
        ...(choice === 're-anchor' ? { anchor: 'clip-end "parent/clip:clip-1"' } : {}),
        ...(['adjust-offset', 're-anchor'].includes(choice) ? { offset_seconds: index ? 1.2 : 1, offset_frames: 0 } : {}),
      })) }, expect: { '': { state: 'present', value: initial.config.clips[0] }, at: { state: 'present', value: 0 },
        ...Object.fromEntries(initial.config.clips.slice(1, 3).flatMap((clip) => [
          [`parent/clip:${clip.id}::intent.on`, { state: 'present', value: clip.app!.astrid!.on }],
          [`parent/clip:${clip.id}::at`, { state: 'present', value: clip.at }],
          [`parent/clip:${clip.id}::hold`, { state: 'absent' }],
          [`parent/clip:${clip.id}::intent.fixed_start`, { state: 'absent' }],
        ])),
      } });
    expect(calls[0].args).not.toHaveProperty('relation_affected');
    expect(source!.closure).toEqual(initial.config.clips.slice(1, 3).map((clip) => ({ target: `parent/clip:${clip.id}`, edge: 'start', relation: clip.app!.astrid!.on })));
    expect(source!.journal).toBe(choice === 'keep' ? 0 : 1);
    expect(h.savedSeqRef.current).toBe(choice === 'keep' ? 0 : 1);
    expect(h.getCurrentHead()).toBe(choice === 'keep' ? 'parent-r1' : 'parent-r2');
    expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  }, 20_000);

  it.each([2, 3])('restores all %i dependents through actual SDK inverse and native Undo/Redo', async (count) => {
    const initial = await multiRightOverlapData(count);
    let forward!: CommitRequest; let inverse!: CommitRequest;
    let accepted!: ReturnType<typeof overlapResizeSource>; let restored!: ReturnType<typeof overlapResizeSource>; let redone!: ReturnType<typeof overlapResizeSource>;
    const h = await setup(async (request, call) => {
      if (call === 1) { forward = request; accepted = overlapResizeSource(initial, request); return { directWrites: accepted.writes }; }
      if (call === 2) { inverse = request; restored = overlapResizeSource(initial, forward, request); return { directWrites: restored.inverse_writes }; }
      redone = overlapResizeSource(initial, forward, inverse, request);
      if (process.env.E_W40_MULTI_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W40_MULTI_EVIDENCE_DIR, `sdk-right-history-${count}.json`),
        JSON.stringify({ forward, inverse, redo: request, accepted, restored, redone, original: initial.config.clips }, null, 2));
      return { directWrites: redone.redo_writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      useEffect(() => h.eventBus.on('remoteCommit', state.onRemoteData), [state.onRemoteData]);
      return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    vi.spyOn(window, 'prompt').mockReturnValue('detach'); resizeOverlap(h);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1)); await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    expect(new Set(accepted.writes.map((write) => write.id))).toEqual(new Set(initial.config.clips.slice(0, count + 1).map((clip) => `parent/clip:${clip.id}`)));
    expect(accepted.writes.map((write) => write.path).sort()).toEqual(['to', 'hold', ...Array.from({ length: count }, () => ['intent.on', 'intent.fixed_start']).flat()].sort());
    const adopted = await buildTimelineData(initial.config, initial.registry, undefined, 2, undefined, h.headRevisionRef.current);
    act(() => h.result.current.commitData(adopted, { save: false, skipHistory: true, updateLastSavedSignature: true }));
    expect(history.result.current.canUndo).toBe(true);
    act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    expect(restored.clips).toEqual(initial.config.clips);
    expect(restored.inverse_writes).toEqual(accepted.writes.map((write) => ({ ...write, before: write.after, after: write.before })));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(redone.clips).toEqual(accepted.after); expect(redone.redo_writes).toEqual(accepted.writes);
    expect(redone.journal).toBe(3); expect(h.requests).toHaveLength(3);
    expect(h.requests.map(({ request }) => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(h.compatibilityRequests).toEqual([]); history.unmount(); h.unmount();
  }, 60_000);

  it.each([null, 'unknown', 're-anchor', 'adjust-offset', 'invalid seconds', 'fractional frames'])('later sibling cancellation/invalid %s is atomic', async (answer) => {
    const initial = await multiRightOverlapData(); const h = await setup(undefined, false, initial);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history); const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('detach');
    if (answer === 'invalid seconds') prompt.mockReturnValueOnce('adjust-offset').mockReturnValueOnce('NaN').mockReturnValueOnce('0');
    else if (answer === 'fractional frames') prompt.mockReturnValueOnce('adjust-offset').mockReturnValueOnce('0').mockReturnValueOnce('0.5');
    else prompt.mockReturnValueOnce(answer).mockReturnValue(null);
    resizeOverlap(h);
    expect(prompt.mock.calls[1][0]).toContain('clip-3 is tied to');
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]);
    expect(h.result.current.data).toBe(initial); expect(h.result.current.editSeqRef.current).toBe(0); expect(h.savedSeqRef.current).toBe(0);
    expect(h.getCurrentConfig()).toEqual(initial.config); expect(h.getCurrentHead()).toBe('parent-r1');
    expect(history).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled(); h.unmount();
  });

  it.each(['geometry', 'word', 'music', 'other clip', 'ambiguous grammar', 'duplicate identity', 'group', 'multiple selected', 'primary end tie', 'nonoverlapping dependency', 'transitive dependency', 'hold dependent', 'occurrence', 'pointer cancel', 'stale head', 'stale config', 'stale fps', 'stale at later prompt'])('refuses multi %s without a command or fallback write', async (kind) => {
    const initial = await multiRightOverlapData();
    if (kind === 'geometry') delete initial.config.clips[2].app!.astrid;
    if (kind === 'word') initial.config.clips[2].app!.astrid!.on = '"hello"';
    if (kind === 'music') initial.config.clips[2].app!.astrid!.on = 'beat 4';
    if (kind === 'other clip') initial.config.clips[2].app!.astrid!.on = 'clip-end "parent/clip:clip-2"';
    if (kind === 'ambiguous grammar') initial.config.clips[2].app!.astrid!.on += ' +1';
    if (kind === 'duplicate identity') initial.config.clips.push(structuredClone(initial.config.clips[2]));
    if (kind === 'primary end tie') initial.config.clips[0].app!.astrid = { until: 'end' };
    if (kind === 'nonoverlapping dependency') initial.config.clips[3].app!.astrid = { on: 'clip-end "parent/clip:clip-1" +5s' };
    if (kind === 'transitive dependency') initial.config.clips[3].app!.astrid = { on: 'clip-end "parent/clip:clip-2" +3s' };
    if (kind === 'hold dependent') initial.config.clips[2].clipType = 'hold';
    if (kind === 'occurrence') initial.config.clips.forEach((clip) => {
      clip.app = { ...clip.app, canonical: { projectId: 'gesture-project', parentDocumentId: 'gesture-timeline', headRevisionId: 'parent-r1',
        occurrenceId: 'occ-A', shotId: 'shot-A', revisionId: 'shot-r1', internalTimelineRevisionId: 'internal-r1',
        sourceClipId: clip.id, outputIdentity: 'output-A', sourceClip: structuredClone(clip) } };
    });
    const h = await setup(undefined, false, initial); const prompt = vi.spyOn(window, 'prompt').mockReturnValue('detach');
    const stale = () => { h.result.current.dataRef.current = { ...initial, head: { ...initial.head!, headRevisionId: 'changed' } }; };
    if (kind === 'stale at later prompt') prompt.mockReturnValueOnce('detach').mockImplementationOnce(() => { stale(); return 'detach'; });
    resizeOverlap(h, { group: kind === 'group', multiple: kind === 'multiple selected', cancelled: kind === 'pointer cancel', afterStart: () => {
      if (kind === 'stale head') stale();
      if (kind === 'stale config') h.result.current.dataRef.current = { ...initial, config: { ...initial.config, clips: initial.config.clips.slice(0, 3) } };
      if (kind === 'stale fps') h.result.current.dataRef.current = { ...initial, output: { ...initial.output, fps: 60 } };
    } });
    expect(prompt).toHaveBeenCalledTimes(kind === 'stale at later prompt' ? 2 : 0);
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.result.current.data!.config).toEqual(initial.config); expect(h.getCurrentHead()).toBe('parent-r1'); h.unmount();
  });

  it.each(['rejected', 'refused', 'stale', 'no_change'] as const)('multi late %s preserves graph/head and creates no native history entry', async (outcome) => {
    const initial = await multiRightOverlapData(); let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    const h = await setup(async () => { await held; return outcome; }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    const native = vi.fn(); h.eventBus.on('nativeRegistrationAccepted', native);
    vi.spyOn(window, 'prompt').mockReturnValue('detach'); resizeOverlap(h);
    await waitFor(() => expect(h.requests).toHaveLength(1)); expect(h.result.current.data!.config).toEqual(initial.config);
    release(); await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe(outcome === 'no_change' ? 'saved' : 'error'));
    expect(h.savedSeqRef.current).toBe(outcome === 'no_change' ? 1 : 0); expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.getCurrentHead()).toBe('parent-r1'); expect(history.result.current.canUndo).toBe(false);
    if (outcome === 'no_change') expect(native).toHaveBeenCalledExactlyOnceWith(expect.anything(), null);
    else expect(native).not.toHaveBeenCalled();
    expect(h.compatibilityRequests).toEqual([]); history.unmount(); h.unmount();
  });
});

describe('ordinary overlap relation resize native history', () => {
  it.each([false, true])('waits for the authenticated inverse, keeps it across canonical adoption, and uses one native Undo/Redo (occurrence=%s)', async (occurrence) => {
    const initial = await overlapRelationData(occurrence);
    const prefix = occurrence ? 'occurrence:occ-A' : 'parent';
    const directWrites: CommitResult['change']['direct_writes'] = [
      { id: `${prefix}/clip:clip-1`, path: 'hold', before: { state: 'absent' }, after: { state: 'present', value: 3 } },
      { id: `${prefix}/clip:clip-1`, path: 'to', before: { state: 'present', value: 2 }, after: { state: 'present', value: 3 } },
      { id: `${prefix}/clip:clip-2`, path: 'intent.fixed_start', before: { state: 'absent' }, after: { state: 'present', value: true } },
      { id: `${prefix}/clip:clip-2`, path: 'intent.on', before: { state: 'present', value: `clip-end "${prefix}/clip:clip-1" +1s` }, after: { state: 'absent' } },
    ];
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    const h = await setup(async (request, call) => {
      if (call === 1) await held;
      const command = (request.change as { commands: Array<{ op: string; args: { writes?: typeof directWrites } }> }).commands[0];
      return { directWrites: command.op === 'timeline.inverse' ? command.args.writes! : directWrites };
    }, false, initial);
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(VideoEditorRuntimeProvider, {
      value: { provider: h.provider, timelineId: 'gesture-timeline', project: { projectId: 'gesture-project' },
        toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } } as unknown as VideoEditorRuntimeContextValue, children,
    });
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      useEffect(() => h.eventBus.on('remoteCommit', state.onRemoteData), [state.onRemoteData]);
      return state;
    }, { wrapper });
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    resizeOverlap(h, { occurrence }); await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(history.result.current.canUndo).toBe(false); act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1);
    release(); await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    const canonical = await buildTimelineData({ ...initial.config, clips: initial.config.clips.map((clip) => {
      if (clip.id.endsWith('clip-1')) return { ...clip, to: 3 };
      const { on: _on, ...astrid } = clip.app!.astrid as Record<string, unknown>;
      return { ...clip, at: 3, app: { ...clip.app, astrid: { ...astrid, fixed_start: true } } };
    }) }, initial.registry, undefined, 2, undefined, h.headRevisionRef.current);
    act(() => h.result.current.commitData(canonical, { save: false, skipHistory: true, updateLastSavedSignature: true }));
    expect(history.result.current.canUndo).toBe(true);
    act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    expect(h.requests).toHaveLength(2);
    const undo = h.requests[1].request.change as { commands: Array<{ op: string; args: unknown }> };
    expect(undo.commands).toEqual([{ op: 'timeline.inverse', select: null, args: { publication: 'pub-parent-r2',
      writes: directWrites.map((write) => ({ ...write, before: write.after, after: write.before })) } }]);
    expect(h.result.current.data!.config).toEqual(canonical.config);
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests).toHaveLength(3);
    expect(h.requests[2].request.change).toMatchObject({ commands: [{ op: 'timeline.inverse', args: { publication: 'pub-parent-r3', writes: directWrites } }] });
    expect(h.compatibilityRequests).toEqual([]); history.unmount();h.unmount();
  });
  it('stale dependent expectations produce a conflict with no optimistic trim', async () => {
    const initial = await overlapRelationData(); const h = await setup(async () => 'stale', false, initial);
    vi.spyOn(window, 'prompt').mockReturnValue('detach'); resizeOverlap(h);
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.savedSeqRef.current).toBe(0); expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  });
});

async function tinyTiedHoldData(intent: Record<string, unknown> = {}) {
  const base = await initialData();
  return buildTimelineData({ ...base.config, clips: [
    { id: 'clip-1', at: 1, hold: 0.2, clipType: 'hold', track: 'V1',
      params: { data: null, literal: { op: 'clear' }, absentLike: { $absent: true } },
      app: { opaque: { keep: [null, false, ''] }, astrid: {
        until: 'clip-start "parent/clip:clip-2"', opaque: { keep: null }, ...intent,
      } } },
    { id: 'clip-2', at: 1.2, hold: 1, clipType: 'hold', track: 'V1' },
  ] }, base.registry, undefined, 1, undefined, base.head);
}
describe('W42 tiny tied hold public expansion', () => {
  it.each(['detach', 'adjust-offset', 're-anchor'])('submits one exact parent %s duration command without a local patch', async (choice) => {
    const initial = await tinyTiedHoldData();
    const h = await setup(undefined, false, initial);
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce(choice);
    if (choice === 're-anchor') prompt.mockReturnValueOnce('clip-end "parent/clip:clip-2"');
    if (choice !== 'detach') prompt.mockReturnValueOnce('-0.125').mockReturnValueOnce('9');
    const before = structuredClone(initial.config);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const selected = { target: 'parent/clip:clip-1', edge: 'end', choice,
      ...(choice === 're-anchor' ? { anchor: 'clip-end "parent/clip:clip-2"' } : {}),
      ...(choice !== 'detach' ? { offset_seconds: -0.125, offset_frames: 9 } : {}) };
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request).toMatchObject({ source: { via: 'app' }, base_revision_id: 'parent-r1' });
    expect(h.requests[0].request.change).toEqual({ commands: [{
      op: 'clip.set-duration', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { seconds: 0.5, relation_choices: [selected] },
      expect: { '': { state: 'present', value: before.clips[0] },
        at: { state: 'present', value: 1 }, hold: { state: 'present', value: 0.2 },
        'app.astrid.on': { state: 'absent' }, 'app.astrid.until': { state: 'present', value: 'clip-start "parent/clip:clip-2"' },
        'app.astrid.for': { state: 'absent' }, 'app.astrid.fixed_start': { state: 'absent' } },
    }] });
    expect(h.result.current.data!.config).toEqual(before);
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(history).toHaveBeenCalledTimes(1);
    expect(history.mock.calls[0]).toEqual([initial, expect.objectContaining({ semantic: true, transactionId: expect.any(String) })]);
    expect(h.compatibilityRequests).toEqual([]);
    if (choice === 'detach' && process.env.E_W42_WIRE_EVIDENCE_PATH) {
      writeFileSync(process.env.E_W42_WIRE_EVIDENCE_PATH, JSON.stringify(h.requests[0].request, null, 2) + '\n');
    }
    h.unmount();
  });
  it.each([
    ['keep'], [null], ['cancel'], [''], ['unknown'], ['detach '],
    ['re-anchor', null], ['re-anchor', ' '], ['adjust-offset', null],
    ['adjust-offset', ''], ['adjust-offset', 'Infinity'], ['adjust-offset', '0', null],
    ['adjust-offset', '0', ''], ['adjust-offset', '0', '0.5'], ['adjust-offset', '0', 'NaN'],
    ['re-anchor', 'clip-end "parent/clip:clip-2"', '0', '9007199254740992'],
  ])('keep/cancel/unfinished/invalid %j makes no write', async (...answers) => {
    const initial = await tinyTiedHoldData();
    const h = await setup(undefined, false, initial);
    const prompt = vi.spyOn(window, 'prompt');
    for (const answer of answers) prompt.mockReturnValueOnce(answer);
    const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    expect(h.result.current.data).toBe(initial);
    expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toHaveLength(0); expect(h.compatibilityRequests).toEqual([]);
    expect(draft).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled();
    h.unmount();
  });
  it('preserves present-null, absence and opaque clear-shaped values in the captured source', async () => {
    const initial = await tinyTiedHoldData({ on: null, for: null, fixed_start: null });
    const h = await setup(undefined, false, initial);
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toMatchObject({ commands: [{
      expect: { 'app.astrid.on': { state: 'present', value: null },
        'app.astrid.for': { state: 'present', value: null }, 'app.astrid.fixed_start': { state: 'present', value: null },
        '': { state: 'present', value: initial.config.clips[0] } },
    }] });
    expect(h.result.current.data!.config).toEqual(initial.config);
    h.unmount();
  });
  it.each(['duplicate-source', 'duplicate-action', 'occurrence', 'malformed-occurrence', 'scoped-alias', 'occurrence-alias', 'missing-head', 'stale-prompt-head', 'stale-prompt-config'] as const)(
    'refuses %s without local writes or compatibility publication', async (kind) => {
      const initial = await tinyTiedHoldData();
      if (kind === 'duplicate-source') initial.config.clips.push(structuredClone(initial.config.clips[0]));
      if (kind === 'duplicate-action') initial.rows[0].actions.push({ ...initial.rows[0].actions[0] });
      if (kind === 'occurrence') initial.config.clips[0].app!.canonical = {
        projectId: 'gesture-project', parentDocumentId: 'gesture-timeline', headRevisionId: 'parent-r1',
        occurrenceId: 'occ-A', shotId: 'shot-A', revisionId: 'shot-r1', internalTimelineRevisionId: 'internal-r1',
        sourceClipId: 'source-1', outputIdentity: 'output-A', sourceClip: { ...initial.config.clips[0], id: 'source-1' },
      };
      if (kind === 'malformed-occurrence') initial.config.clips[0].app!.canonical = { occurrenceId: 'occ-A', headRevisionId: 'stale' };
      if (kind === 'occurrence-alias') {
        initial.config.clips[0].id = 'occurrence:unknown'; initial.rows[0].actions[0].id = 'occurrence:unknown';
      }
      if (kind === 'scoped-alias') {
        initial.config.clips[0].id = 'parent/clip:clip-1';
        initial.rows[0].actions[0].id = 'parent/clip:clip-1';
      }
      const h = await setup(undefined, false, initial);
      if (kind === 'missing-head') h.result.current.dataRef.current!.head = undefined;
      const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => {
        if (kind === 'stale-prompt-head') h.result.current.dataRef.current!.head!.headRevisionId = 'new-head';
        if (kind === 'stale-prompt-config') h.result.current.dataRef.current!.config.clips[0].hold = 0.3;
        return 'detach';
      });
      const history = vi.fn(); h.eventBus.on('beforeCommit', history);
      const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
      act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, kind === 'scoped-alias' ? 'parent/clip:clip-1' : kind === 'occurrence-alias' ? 'occurrence:unknown' : 'clip-1'));
      expect(h.requests).toHaveLength(0); expect(h.compatibilityRequests).toEqual([]);
      expect(h.result.current.editSeqRef.current).toBe(0);
      expect(history).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled();
      expect(prompt).toHaveBeenCalledTimes(kind.startsWith('stale-prompt') ? 1 : 0);
      h.unmount();
    });
  it.each(['media', 'nonunit', 'sequence', 'pinned', 'bed', 'relation-object', 'blank-relation'] as const)(
    'keeps %s on the explicit existing fallback', async (kind) => {
      const initial = await tinyTiedHoldData();
      const clip = initial.config.clips[0];
      if (kind === 'media') { clip.clipType = 'media'; clip.from = 0; clip.to = 0.2; }
      if (kind === 'nonunit') clip.speed = 2;
      if (kind === 'sequence') (clip.app!.astrid as Record<string, unknown>).sequence = { id: 'seq' };
      if (kind === 'pinned') initial.config.pinnedShotGroups = [{ shotId: 's', trackId: 'V1', clipIds: ['clip-1'], mode: 'images' }];
      if (kind === 'bed') initial.config.app!.astrid = { v: 2, music_beds: { 'parent/clip:clip-1': { source: structuredClone(clip) } } };
      if (kind === 'relation-object') (clip.app!.astrid as Record<string, unknown>).until = { anchor: 'unsupported' };
      if (kind === 'blank-relation') (clip.app!.astrid as Record<string, unknown>).until = ' ';
      const h = await setup(undefined, false, initial);
      const prompt = vi.spyOn(window, 'prompt');
      act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
      expect(h.result.current.editSeqRef.current).toBe(1);
      expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
      expect(h.requests).toHaveLength(0); expect(prompt).not.toHaveBeenCalled();
      h.unmount();
    });
  it.each(['refused', 'rejected', 'stale'] as const)('a Runtime %s preserves the whole local authored graph', async (outcome) => {
    const initial = await tinyTiedHoldData();
    const h = await setup(async () => outcome, false, initial);
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.requests).toHaveLength(1); expect(h.savedSeqRef.current).toBe(0);
    expect(h.result.current.data!.config).toEqual(initial.config);
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  });
});

describe('W42 tiny tied hold native history', () => {
  it('waits for its receipt, adopts a canonical result and uses one native Undo/Redo', async () => {
    const initial = await tinyTiedHoldData();
    // A task-owned accepted Runtime result can exercise this same public App
    // history seam. Ordinary repository runs retain the deterministic wire fixture.
    const runtimePath = process.env.E_W42_RUNTIME_RESULT_PATH;
    const acceptedRuntime = runtimePath ? JSON.parse(readFileSync(runtimePath, 'utf8')) as CommitResult : undefined;
    if (acceptedRuntime) expect(acceptedRuntime.status).toBe('accepted');
    const directWrites: CommitResult['change']['direct_writes'] = acceptedRuntime?.change.direct_writes ?? [
      { id: 'parent/clip:clip-1', path: 'intent.until', before: { state: 'present', value: 'clip-start "parent/clip:clip-2"' }, after: { state: 'absent' } },
      { id: 'parent/clip:clip-1', path: 'intent.for', before: { state: 'absent' }, after: { state: 'present', value: 0.5 } },
    ];
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    const h = await setup(async (request, call) => {
      if (call === 1) await held;
      const command = (request.change as { commands: Array<{ op: string; args: { writes?: typeof directWrites } }> }).commands[0];
      return { directWrites: command.op === 'timeline.inverse' ? command.args.writes! : directWrites };
    }, false, initial);
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(VideoEditorRuntimeProvider, {
      value: { provider: h.provider, timelineId: 'gesture-timeline', project: { projectId: 'gesture-project' },
        toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } } as unknown as VideoEditorRuntimeContextValue, children,
    });
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      useEffect(() => h.eventBus.on('remoteCommit', state.onRemoteData), [state.onRemoteData]);
      return state;
    }, { wrapper });
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(history.result.current.canUndo).toBe(false);
    act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1);
    release(); await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    const acceptedParent = (acceptedRuntime?.canonical_document as { parent?: {
      config: TimelineData['config']; clips: TimelineData['config']['clips']; registry: TimelineData['registry'];
    } } | null | undefined)?.parent;
    if (acceptedRuntime) expect(acceptedParent).toBeDefined();
    const canonical = acceptedParent
      ? await buildTimelineData({ ...acceptedParent.config, clips: acceptedParent.clips }, acceptedParent.registry,
        undefined, 2, undefined, h.headRevisionRef.current)
      : await buildTimelineData({ ...initial.config, clips: initial.config.clips.map((clip) => {
      if (clip.id !== 'clip-1') return clip;
      const { until: _until, ...astrid } = clip.app!.astrid as Record<string, unknown>;
      return { ...clip, hold: 0.5, app: { ...clip.app, astrid: { ...astrid, for: 0.5 } } };
    }) }, initial.registry, undefined, 2, undefined, h.headRevisionRef.current);
    act(() => h.eventBus.emit('remoteCommit', h.result.current.data!, canonical));
    act(() => h.result.current.commitData(canonical, { save: false, skipHistory: true, updateLastSavedSignature: true }));
    expect(h.result.current.data!.config).toEqual(canonical.config);
    if (acceptedParent) expect(h.result.current.data!.config.clips).toEqual(acceptedParent.clips);
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(history.result.current.canUndo).toBe(true);
    act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].request.change).toEqual({ commands: [{ op: 'timeline.inverse', select: null,
      args: { publication: 'pub-parent-r2', writes: directWrites.map((write) => ({ ...write, before: write.after, after: write.before })) } }] });
    expect(h.result.current.data!.config).toEqual(canonical.config);
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests).toHaveLength(3);
    expect(h.requests[2].request.change).toEqual({ commands: [{ op: 'timeline.inverse', select: null, args: { publication: 'pub-parent-r3', writes: directWrites } }] });
    expect(h.compatibilityRequests).toEqual([]); history.unmount(); h.unmount();
  });
});

describe('W42 tiny tied hold receipt boundaries', () => {
  it.each(['foreign-owner', 'consequence', 'occurrence', 'duplicate', 'malformed-state', 'empty'] as const)(
    'never enables snapshot Undo for an unsupported %s receipt', async (kind) => {
      const initial = await tinyTiedHoldData();
      const write = { id: 'parent/clip:clip-1', path: 'intent.until',
        before: { state: 'present', value: 'clip-start "parent/clip:clip-2"' }, after: { state: 'absent' } };
      let writes: unknown[] = [write];
      if (kind === 'foreign-owner') write.id = 'parent/clip:clip-2';
      if (kind === 'consequence') write.path = 'hold';
      if (kind === 'occurrence') write.id = 'occurrence:occ-A/clip:clip-1';
      if (kind === 'duplicate') writes = [write, write];
      if (kind === 'malformed-state') writes = [{ ...write, after: { state: 'absent', value: null } }];
      if (kind === 'empty') writes = [];
      const h = await setup(async () => ({ directWrites: writes as CommitResult['change']['direct_writes'] }), false, initial);
      const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(VideoEditorRuntimeProvider, {
        value: { provider: h.provider, timelineId: 'gesture-timeline', project: { projectId: 'gesture-project' },
          toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } } as unknown as VideoEditorRuntimeContextValue, children,
      });
      const history = renderHook(() => {
        const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
        useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
        return state;
      }, { wrapper });
      vi.spyOn(window, 'prompt').mockReturnValue('detach');
      act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      expect(history.result.current.canUndo).toBe(false);
      act(() => history.result.current.undo());
      expect(h.requests).toHaveLength(1); expect(h.compatibilityRequests).toEqual([]);
      history.unmount(); h.unmount();
    });
});

// UI actions call the actual production tool -> runtime -> TimelineOps adapter.
// Transport receipts below prove App/SDK adaptation, not mounted public Host acceptance.
describe('REVIEW ordered proposal commands', () => {
  const patch = (): TimelinePatch => ({ version: 1, operations: [
    { op: 'clip.update', target: 'clip-1', payload: { opacity: 0.4 } },
    { op: 'clip.update', target: 'clip-1', payload: { opacity: 0.6 } },
    { op: 'track.update', target: 'V1', payload: { label: 'Reviewed' } },
  ] });
  async function reviewSetup(reply?: FixtureReply, initial?: TimelineData) {
    const h = await setup(reply, false, initial, 1, undefined, undefined, 'clip-1', new Map(), undefined, true);
    const reader = createTimelineReader({ data: () => h.result.current.dataRef.current!, configVersion: () => h.configVersionRef.current });
    const rows: Array<Awaited<ReturnType<NonNullable<ProposalServiceBridge['queryProposals']>>>[number]> = [];
    const transitions = vi.fn();
    const service: ProposalServiceBridge = { capabilities: { proposals: true },
      async createProposal(record) { const id = 'db-' + (rows.length + 1);
        rows.push({ ...record, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); return id; },
      async updateProposalStatus(id, status) { transitions(id, status); const row = rows.find((entry) => entry.id === id); if (!row) throw new Error('Unknown persistence identity'); row.status = status; },
      async queryProposals() { return rows.filter((row) => row.status === 'pending'); },
    };
    const persistence = createProposalPersistenceBridge(service);
    const runtime = createProposalRuntime({ timelineOps: h.result.current.ops, reader, persistenceProvider: persistence });
    const registry = createAgentToolRegistry();
    async function produce(source: string, value = patch()) {
      registry.ingestAgentToolContribution('review-extension', { id: source, kind: 'agentTool', toolId: source, label: source, description: source, order: 0 });
      registry.registerTool('review-extension', source, async () => ({ family: 'mutation/proposal', patches: [value] }));
      const toolService = createAgentToolInvocationService({ registry, proposalRuntime: runtime });
      const result = await toolService.invokeTool({ toolId: source, extensionId: 'review-extension', contributionId: source });
      expect(result?.family).toBe('ui/summary');
      return runtime.list().find((proposal) => proposal.source === source)!;
    }
    const historyWrapper = ({ children }: { children: React.ReactNode }) => React.createElement(VideoEditorRuntimeProvider, {
      value: { provider: h.provider, timelineId: 'gesture-timeline', project: { projectId: 'gesture-project' }, toast: vi.fn() } as unknown as VideoEditorRuntimeContextValue, children });
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      return state;
    }, { wrapper: historyWrapper });
    const journal = vi.fn(); h.eventBus.on('beforeCommit', journal);
    const saves = vi.spyOn(h.provider, 'saveTimelineAtHead');
    return { ...h, reader, persistence, runtime, produce, rows, history, journal, saves, transitions,
      close() { history.unmount(); h.unmount(); } };
  }
  const show = (runtime: ReturnType<typeof createProposalRuntime>, source: string) => {
    const panel = render(<ProposalPanel proposalRuntime={runtime} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(source) }));
    return panel;
  };
  it.each([1, 2])('refuses a valid %i-operation no-op proposal through the production panel without scheduling any write', async (count) => {
    const h = await reviewSetup();
    const noop: TimelinePatch = { version: 1, operations: Array.from({ length: count }, () => ({
      op: 'extension.noop', target: 'com.review.ext', payload: { trace: 'review' },
    })) };
    expect(validateTimelinePatch(noop).valid).toBe(true);
    const compiled = compileTimelinePatch(noop, h.initial);
    expect(compiled.valid).toBe(true);
    expect(compiled.diff.entries).toHaveLength(count);
    expect(compiled.nextData?.config).toEqual(h.initial.config);
    expect(compiled.nextData?.registry).toEqual(h.initial.registry);
    const proposal = await h.produce('review-noop', noop);
    expect(proposal.commandBinding).toBeUndefined();
    await waitFor(() => expect(h.rows.some((row) => row.payload.source === proposal.source)).toBe(true));
    // Include the real persistence/reload route, which also has no command binding.
    const runtime = count === 2
      ? createProposalRuntime({ timelineOps: h.result.current.ops, reader: h.reader, persistenceProvider: h.persistence })
      : h.runtime;
    await waitFor(() => expect(runtime.list().some((entry) => entry.source === proposal.source)).toBe(true));
    const proposalId = runtime.list().find((entry) => entry.source === proposal.source)!.id;
    expect(runtime.get(proposalId)?.patch).toEqual(noop);
    const before = h.result.current.dataRef.current;
    const bytes = JSON.stringify(before);
    const scheduled = vi.fn(); const unsubscribe = h.eventBus.on('scheduleSave', scheduled);
    const panel = show(runtime, proposal.source);
    fireEvent.click(screen.getByRole('button', { name: 'Preview proposal from ' + proposal.source }));
    expect(runtime.get(proposalId)?.previewDiff?.entries).toHaveLength(count);
    expect(h.result.current.dataRef.current).toBe(before);
    expect(scheduled).not.toHaveBeenCalled(); expect(h.journal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + proposal.source }));
    expect(h.journal).not.toHaveBeenCalled(); expect(scheduled).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/only no-op operations/i)).toBeTruthy());
    expect(() => runtime.accept(proposalId)).toThrow(/only no-op operations/i);
    expect(runtime.get(proposalId)?.state).toBe('pending');
    expect(h.result.current.dataRef.current).toBe(before); expect(JSON.stringify(before)).toBe(bytes);
    expect(h.getCurrentHead()).toBe('parent-r1'); expect(h.headRevisionRef.current).toEqual(h.initial.head);
    expect(h.result.current.editSeqRef.current).toBe(0); expect(h.savedSeqRef.current).toBe(0);
    expect(h.history.result.current.canUndo).toBe(false); expect(h.history.result.current.canRedo).toBe(false);
    expect(scheduled).not.toHaveBeenCalled(); expect(h.journal).not.toHaveBeenCalled(); expect(h.saves).not.toHaveBeenCalled();
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(h.acceptedCount()).toBe(0);
    unsubscribe(); panel.unmount(); h.close();
  });
  it('preserves established compatibility acceptance for a real edit mixed with a no-op', async () => {
    const h = await reviewSetup();
    const proposal = await h.produce('review-compatible', { version: 1, operations: [
      { op: 'extension.noop', target: 'com.review.ext' },
      { op: 'app.update', target: 'com.review.ext', payload: { reviewed: true } },
    ] });
    expect(proposal.commandBinding).toBeUndefined();
    const panel = show(h.runtime, proposal.source);
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + proposal.source }));
    await waitFor(() => expect(h.runtime.get(proposal.id)?.state).toBe('accepted'));
    expect(h.result.current.dataRef.current?.config.app?.['com.review.ext']).toEqual({ reviewed: true });
    expect(h.journal).toHaveBeenCalledTimes(1); expect(h.result.current.editSeqRef.current).toBe(1);
    expect(h.history.result.current.canUndo).toBe(true);
    panel.unmount(); h.close();
  });
  it('preserves general TimelineOps.apply trace-only behavior outside proposal acceptance', async () => {
    const h = await reviewSetup();
    let diff;
    act(() => { diff = h.result.current.ops.apply({ version: 1, operations: [{ op: 'extension.noop', target: 'com.review.ext' }] }); });
    expect(diff!.entries).toMatchObject([{ op: 'extension.noop', after: { noop: true } }]);
    expect(h.result.current.dataRef.current?.config).toEqual(h.initial.config);
    expect(h.journal).toHaveBeenCalledTimes(1); expect(h.result.current.editSeqRef.current).toBe(1);
    expect(h.history.result.current.canUndo).toBe(true);
    h.close();
  });
  it.each([
    ['unknown operation', { op: 'extension.unknown' as never, target: 'com.review.ext' }, 'validation'],
    ['malformed no-op', { op: 'extension.noop' as const, target: 'bad id' }, 'validation'],
    ['duplicate clip', { op: 'clip.add' as const, target: 'clip-1', payload: { track: 'V1', at: 0, clipType: 'hold', hold: 1 } }, 'compilation'],
  ] as const)('keeps %s refusal on authoritative TimelineOps validation/compilation with no effect', async (_kind, operation, stage) => {
    const h = await reviewSetup();
    const proposal = await h.produce('review-invalid', { version: 1, operations: [operation] });
    expect(proposal.commandBinding).toBeUndefined();
    const before = h.result.current.dataRef.current; const bytes = JSON.stringify(before);
    const scheduled = vi.fn(); const unsubscribe = h.eventBus.on('scheduleSave', scheduled);
    const panel = show(h.runtime, proposal.source);
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + proposal.source }));
    await waitFor(() => expect(screen.getByText(new RegExp('TimelineOps.apply: patch ' + stage + ' failed'))).toBeTruthy());
    expect(h.runtime.get(proposal.id)?.state).toBe('pending');
    expect(h.result.current.dataRef.current).toBe(before); expect(JSON.stringify(before)).toBe(bytes);
    expect(h.headRevisionRef.current).toEqual(h.initial.head); expect(h.getCurrentHead()).toBe('parent-r1');
    expect(h.result.current.editSeqRef.current).toBe(0); expect(h.savedSeqRef.current).toBe(0);
    expect(h.history.result.current.canUndo).toBe(false); expect(h.history.result.current.canRedo).toBe(false);
    expect(scheduled).not.toHaveBeenCalled(); expect(h.journal).not.toHaveBeenCalled(); expect(h.saves).not.toHaveBeenCalled();
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(h.acceptedCount()).toBe(0);
    unsubscribe(); panel.unmount(); h.close();
  });
  it('rejects one production proposal without changing document/head/history/save and accepts one captured ordered batch after acknowledgement', async () => {
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    const h = await reviewSetup(async () => { await held; });
    const rejected = await h.produce('review-reject'); const before = h.result.current.data;
    const rejectedPanel = show(h.runtime, rejected.source);
    fireEvent.click(screen.getByRole('button', { name: 'Reject proposal from ' + rejected.source }));
    expect(h.runtime.get(rejected.id)?.state).toBe('rejected');
    expect(h.runtime.get(rejected.id)?.commandBinding).toEqual(rejected.commandBinding);
    expect(h.result.current.data).toBe(before); expect(h.getCurrentHead()).toBe('parent-r1');
    expect(h.journal).not.toHaveBeenCalled(); expect(h.saves).not.toHaveBeenCalled(); expect(h.requests).toHaveLength(0);
    expect(h.history.result.current.canUndo).toBe(false); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(() => h.runtime.accept(rejected.id)).toThrow('rejected'); rejectedPanel.unmount();

    const accepted = await h.produce('review-accept');
    expect(accepted.commandBinding).toMatchObject({ source: 'review-accept', proposalId: accepted.id,
      base: before!.head, baseVersion: 1, transactionId: 'proposal:' + accepted.id });
    expect(accepted.commandBinding!.commands.map((command) => command.op)).toEqual(['clip.set-look', 'clip.set-look', 'timeline.set']);
    expect(accepted.commandBinding!.commands[1].expect).toEqual({ opacity: { state: 'present', value: 0.4 } });
    const panel = show(h.runtime, accepted.source);
    const lifecycleWrites = h.transitions.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Preview proposal from ' + accepted.source }));
    await act(async () => { await Promise.resolve(); });
    expect(h.transitions).toHaveBeenCalledTimes(lifecycleWrites);
    expect(h.result.current.data).toBe(before); expect(h.requests).toHaveLength(0); expect(h.journal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + accepted.source }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.runtime.get(accepted.id)?.state).toBe('pending'); expect(h.journal).not.toHaveBeenCalled();
    expect(() => h.runtime.reject(accepted.id)).toThrow('submitted');
    expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' }, change: { commands: accepted.commandBinding!.commands } });
    release();
    await waitFor(() => expect(h.runtime.get(accepted.id)?.state).toBe('accepted'));
    expect(h.headRevisionRef.current?.headRevisionId).toBe('parent-r2'); expect(h.acceptedCount()).toBe(1);
    expect(h.journal).toHaveBeenCalledTimes(1); expect(h.journal.mock.calls[0][1]).toMatchObject({ transactionId: accepted.commandBinding!.transactionId, semantic: true });
    expect(h.runtime.get(accepted.id)?.diagnostics?.find((d) => d.code === 'timeline-patch/proposal-command-binding')?.detail).toMatchObject({ proposalId: accepted.id, source: accepted.source, base: before!.head });
    expect(h.history.result.current.canUndo).toBe(true); expect(h.saves).toHaveBeenCalledTimes(1);
    expect(h.rows.find((row) => row.payload.proposalId === accepted.id)?.payload.commandBinding).toEqual(accepted.commandBinding);
    await waitFor(() => expect(h.rows.find((row) => row.payload.proposalId === accepted.id)?.status).toBe('accepted'));
    expect(() => h.runtime.accept(accepted.id)).toThrow('accepted');
    expect(h.compatibilityRequests).toEqual([]); panel.unmount(); h.close();
  });


  it('binds an existing version-zero producer to the host exact base without giving the payload revision authority', async () => {
    const h = await reviewSetup();
    const proposal = await h.produce('review-zero', { ...patch(), version: 0 });
    expect(proposal.patch.version).toBe(0); expect(proposal.baseVersion).toBe(1);
    expect(proposal.commandBinding).toMatchObject({ base: h.initial.head, baseVersion: 1 });
    const panel = show(h.runtime, proposal.source);
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + proposal.source }));
    await waitFor(() => expect(h.runtime.get(proposal.id)?.state).toBe('accepted'));
    expect(h.requests).toHaveLength(1); expect(h.requests[0].request.base_revision_id).toBe('parent-r1');
    expect(h.compatibilityRequests).toEqual([]); panel.unmount(); h.close();
  });
  it('refuses a retained runtime after its provider session closes before any edit/save/history mutation', async () => {
    const h = await reviewSetup(); const proposal = await h.produce('review-closed');
    const before = h.result.current.dataRef.current;
    h.close();
    expect(() => h.runtime.accept(proposal.id)).toThrow('closed');
    expect(h.result.current.dataRef.current).toBe(before); expect(h.requests).toEqual([]); expect(h.journal).not.toHaveBeenCalled();
    expect(h.saves).not.toHaveBeenCalled(); expect(h.runtime.get(proposal.id)?.state).toBe('pending');
  });
  it('refuses a production tool result if the document context changes during execution', async () => {
    const h = await reviewSetup();
    const registry = createAgentToolRegistry();
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    registry.ingestAgentToolContribution('review-extension', { id: 'delayed', kind: 'agentTool', toolId: 'delayed', label: 'Delayed', description: 'Delayed', order: 0 });
    registry.registerTool('review-extension', 'delayed', async () => { await held; return { family: 'mutation/proposal', patches: [patch()] }; });
    const service = createAgentToolInvocationService({ registry, proposalRuntime: h.runtime });
    const result = service.invokeTool({ toolId: 'delayed', extensionId: 'review-extension', contributionId: 'delayed' });
    h.result.current.dataRef.current = { ...h.initial, head: { ...h.initial.head!, projectId: 'foreign-project' } };
    release();
    await expect(result).rejects.toThrow('source context changed');
    expect(h.runtime.list()).toEqual([]); expect(h.saves).not.toHaveBeenCalled(); expect(h.requests).toEqual([]); expect(h.journal).not.toHaveBeenCalled();
    h.close();
  });
  it('preserves bound pending proposal bytes on actual persistence-bridge reload and rejects changed persisted commands/source/base/context', async () => {
    const h = await reviewSetup(); const proposal = await h.produce('review-reload');
    await waitFor(() => expect(h.rows).toHaveLength(1));
    const reload = () => createProposalRuntime({ timelineOps: h.result.current.ops, reader: h.reader, persistenceProvider: h.persistence });
    const restored = reload(); await waitFor(() => expect(restored.get(proposal.id)).toBeDefined());
    expect(restored.get(proposal.id)?.commandBinding).toEqual(proposal.commandBinding);
    const original = structuredClone(h.rows[0].payload);
    for (const field of ['source', 'commands', 'base', 'context'] as const) {
      const changed = structuredClone(original);
      const binding = changed.commandBinding as unknown as Record<string, unknown>;
      if (field === 'source') changed.source = 'foreign';
      if (field === 'commands') binding.commands = [{ op: 7 }];
      if (field === 'base') binding.base = { ...proposal.commandBinding!.base, headRevisionId: 'foreign-revision' };
      if (field === 'context') binding.base = { ...proposal.commandBinding!.base, projectId: 'foreign-project' };
      h.rows[0].payload = changed;
      const refused = reload(); await act(async () => { await Promise.resolve(); });
      expect(refused.list()).toEqual([]);
    }
    expect(h.requests).toHaveLength(0); expect(h.saves).not.toHaveBeenCalled(); expect(h.journal).not.toHaveBeenCalled();
    h.close();
  });
  it.each(['version', 'head', 'project', 'timeline', 'document'] as const)('refuses a changed captured %s without a save or history owner', async (change) => {
    const h = await reviewSetup(); const proposal = await h.produce('review-changed');
    const before = h.result.current.data!;
    if (change === 'version') h.configVersionRef.current = 2;
    else if (change === 'document') h.result.current.dataRef.current = await buildTimelineData({ ...before.config, clips: before.config.clips.map((clip) => ({ ...clip, opacity: 0.1 })) }, before.registry, undefined, 1, undefined, before.head);
    else h.result.current.dataRef.current = { ...before, head: { ...before.head!, ...(change === 'head' ? { headRevisionId: 'foreign-head' } : change === 'project' ? { projectId: 'foreign-project' } : { timelineId: 'foreign-timeline' }) } };
    await act(async () => { try { await h.runtime.accept(proposal.id); } catch { /* expected */ } });
    expect(h.requests).toHaveLength(0); expect(h.saves).not.toHaveBeenCalled(); expect(h.journal).not.toHaveBeenCalled();
    expect(h.runtime.get(proposal.id)?.state).not.toBe('accepted'); expect(h.getCurrentHead()).toBe('parent-r1');
    h.close();
  });
  it.each(['refused', 'stale', 'failed'] as const)('a %s/failed expectation response restores content without head/history/fallback publication', async (outcome) => {
    const h = await reviewSetup(async () => outcome); const before = h.result.current.data;
    const proposal = await h.produce('review-refusal'); const panel = show(h.runtime, proposal.source);
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + proposal.source }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Accept failed'));
    expect(h.result.current.data).toBe(before); expect(h.getCurrentHead()).toBe('parent-r1'); expect(h.headRevisionRef.current?.headRevisionId).toBe('parent-r1');
    expect(h.journal).not.toHaveBeenCalled(); expect(h.history.result.current.canUndo).toBe(false);
    expect(h.acceptedCount()).toBe(0); expect(h.compatibilityRequests).toEqual([]); expect(h.requests).toHaveLength(1);
    panel.unmount(); h.close();
  });

  it('uses actual SDK rebase results on a moved head, preserving returned commands rather than reconstructing the optimistic diff', async () => {
    const base = await initialData();
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => ({ ...clip, app: { clipSentinel: true } })) },
      base.registry, undefined, 1, undefined, base.head);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    let authoritative!: import('@/integrations/runtime/generated.ts').EditCommand[];
    const h = await reviewSetup(async (request, call) => {
      if (call === 1) { await held; return; }
      if (request.dry_run) {
        const python = process.env.ASTRID_TEST_PYTHON!;
        const output = execFileSync(python, ['-B', '-c', [
          'import copy,json,os,sys',
          'from pathlib import Path',
          'sys.path.insert(0,os.environ["ASTRID_CHECKOUT"])',
          'from astrid.sdk.timeline.checkout import Checkout',
          'from astrid.sdk.timeline import commands',
          'from astrid.sdk.timeline.rebase import rebase',
          'v=json.load(sys.stdin)',
          'fixture=json.loads((Path(os.environ["ASTRID_CHECKOUT"])/"tests/fixtures/timeline_editing/tiny_publishable.json").read_text())',
          'fixture["parent"]={"config":{"output":v["config"]["output"],"tracks":v["config"]["tracks"]},"clips":v["config"]["clips"],"registry":v["registry"]}',
          'tl=Checkout(copy.deepcopy(fixture))',
          'with tl.edit("record proposal",quiet=True) as tx:',
          ' for call in v["calls"]: commands.execute(tl,call)',
          'recorded=[call.to_json() for call in tx.plan.calls]',
          'onto=copy.deepcopy(fixture);onto["parent"]["clips"][0]["volume"]=0.7',
          'result=rebase(recorded,onto)',
          'assert not result.conflicts, result.conflicts',
          'assert result.document["parent"]["clips"][0]["volume"]==0.7',
          'assert result.document["parent"]["clips"][0]["opacity"]==0.6',
          'assert result.document["parent"]["config"]["tracks"][0]["label"]=="Reviewed"',
          'assert onto["parent"]["clips"][0]["opacity"]==0.9',
          'bad=copy.deepcopy(onto);bad["parent"]["clips"][0]["opacity"]=0.2',
          'refused=rebase(recorded,bad)',
          'assert refused.conflicts and refused.document is None and bad["parent"]["clips"][0]["opacity"]==0.2',
          'print(json.dumps({"commands":[call.to_json() for call in result.plan.calls],"writes":result.plan.direct_writes,"document":result.document,"journal":len(tl._journal),"failed_expectations":refused.conflicts}))',
        ].join('\n')], { input: JSON.stringify({ config: initial.config, registry: initial.registry, calls: (request.change as { commands: unknown[] }).commands }), encoding: 'utf8' });
        const sdk = JSON.parse(output);
        authoritative = sdk.commands;
        expect(sdk.journal).toBe(1); expect(sdk.writes.length).toBeGreaterThan(0);
        if (process.env.E_REVIEW_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_REVIEW_EVIDENCE_DIR, 'sdk-rebase.json'), JSON.stringify({ request, ...sdk }, null, 2));
        return { previewCommands: authoritative };
      }
      expect((request.change as { commands: unknown[] }).commands).toEqual(authoritative);
    }, initial);
    act(() => h.result.current.editing.handleSelectedClipChange({ volume: 0.7 }));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    const proposal = await h.produce('review-rebase'); const panel = show(h.runtime, proposal.source);
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + proposal.source }));
    expect(proposal.commandBinding!.base.headRevisionId).toBe('parent-r1');
    release();
    await waitFor(() => expect(h.runtime.get(proposal.id)?.state).toBe('accepted'), { timeout: 10000 });
    expect(h.requests).toHaveLength(3);
    const preview = h.requests[1].request; const commit = h.requests[2].request;
    expect(preview).toMatchObject({ dry_run: true, base_revision_id: 'parent-r1', change: { commands: proposal.commandBinding!.commands } });
    expect(commit).toMatchObject({ dry_run: false, base_revision_id: 'parent-r2', change: { commands: authoritative } });
    expect(authoritative).not.toEqual(proposal.commandBinding!.commands);
    expect(commit.request_id).not.toBe(preview.request_id);
    expect(h.headRevisionRef.current?.headRevisionId).toBe('parent-r3'); expect(h.acceptedCount()).toBe(2);
    expect(h.journal).toHaveBeenCalledTimes(2); expect(h.journal.mock.calls[1][1].transactionId).toBe(proposal.commandBinding!.transactionId);
    expect(h.compatibilityRequests).toEqual([]);
    panel.unmount(); h.close();
  }, 20000);
  it('refuses malformed commands/bindings and unsupported reserved shapes without a fallback write', async () => {
    const h = await reviewSetup(); const proposal = await h.produce('review-unsupported');
    const forged = structuredClone(proposal);
    forged.id = 'forged'; forged.commandBinding!.commands[0] = { op: 7 } as never;
    expect(h.runtime.importProposal(forged)).toBe('rejected');
    const unsupported: TimelineProposal = { ...structuredClone(proposal), id: 'unsupported', source: 'reserved',
      commandBinding: undefined, patch: { version: 1, operations: [{ op: 'clip.split' as never, target: 'clip-1', payload: {} }] } };
    expect(h.runtime.importProposal(unsupported)).toBe('imported');
    expect(() => h.runtime.accept('unsupported')).toThrow();
    expect(h.requests).toHaveLength(0); expect(h.journal).not.toHaveBeenCalled(); expect(h.saves).not.toHaveBeenCalled();
    expect(h.result.current.data).toBe(h.initial); expect(h.compatibilityRequests).toEqual([]); h.close();
  });
  it('recovers a lost successful response with the same key/base/bytes and one publication/history owner', async () => {
    const h = await reviewSetup(async (_request, call) => call === 1 ? { loseSuccess: true } : undefined);
    const proposal = await h.produce('review-retry'); const panel = show(h.runtime, proposal.source);
    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + proposal.source }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 5000 });
    // The first flush reports uncertainty; retry resolves the retained save target.
    if (h.runtime.get(proposal.id)?.state === 'pending') {
      fireEvent.click(screen.getByRole('button', { name: 'Accept proposal from ' + proposal.source }));
    }
    await waitFor(() => expect(h.runtime.get(proposal.id)?.state).toBe('accepted'));
    expect(h.requests).toHaveLength(2); expect(h.requests[1].bytes).toBe(h.requests[0].bytes);
    expect(h.requests[1].headers).toEqual(h.requests[0].headers);
    expect(h.requests[0].headers['Idempotency-Key']).toBe(h.requests[0].request.request_id);
    expect(h.acceptedCount()).toBe(1); expect(h.journal).toHaveBeenCalledTimes(1);
    expect(h.result.current.editSeqRef.current).toBe(1); expect(h.history.result.current.canUndo).toBe(true);
    expect(h.compatibilityRequests).toEqual([]); panel.unmount(); h.close();
  });
});


// The ordinary/group move family uses the existing SDK and native receipt history.
function commitSelectedDrag(h: Awaited<ReturnType<typeof setup>>, grouped = false, start = 1.3) {
  const data = h.result.current.data!;
  const actions = data.rows[0].actions;
  const session = { clipId: actions[0].id, draggedClipIds: actions.map(({ id }) => id),
    sourceRowId: 'V1', sourceKind: 'visual', transactionId: 'selected-drag',
    groupDragEntry: grouped ? { groupKey: { shotId: 'shot-1', trackId: 'V1' }, originStart: actions[0].start, originTrackId: 'V1' } : null,
    clipOffsets: actions.map((action) => ({ clipId: action.id, rowId: 'V1', deltaTime: action.start - actions[0].start, initialStart: action.start, initialEnd: action.end })),
  } as InternalDragSession;
  act(() => commitDraggingSession({ session, nextStart: start, crossTrackActive: false, liveData: data,
    callbacks: { ...h.result.current.tracks, applyEdit: h.result.current.applyEdit, selectClip: vi.fn(), selectClips: vi.fn() },
  }));
}

describe('selected move command completion', () => {
  it('same-track pinned group sends all ordered commands in one captured transaction', async () => {
    const base = await shotGroupData();
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip) => ({ ...clip, app: { opaque: null } })) }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    commitSelectedDrag(h, true);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' },
      change: { commands: initial.config.clips.map((clip) => ({ op: 'clip.nudge', select: `parent/clip:${clip.id}`, args: { frames: 9 } })) } });
    expect(h.compatibilityRequests).toEqual([]);
    expect(h.result.current.data!.config.pinnedShotGroups).toEqual(initial.config.pinnedShotGroups);
    h.unmount();
  });
});


function selectedMoveSource(initial: TimelineData, requests: CommitRequest[], mediaRecord?: Record<string, unknown>) {
  const python = process.env.ASTRID_TEST_PYTHON;
  if (!python) throw new Error('Set ASTRID_TEST_PYTHON to the qualified SDK test interpreter');
  return JSON.parse(execFileSync(python, ['-B', '-c', `
import copy,json,os,sys,tempfile
from pathlib import Path
sys.path.insert(0,os.environ['ASTRID_CHECKOUT'])
from astrid.sdk.timeline.checkout import Checkout
from astrid.sdk.timeline import commands
from astrid.sdk.timeline.chapter_storage import compile_candidate as compile_authoring_candidate
value=json.load(sys.stdin)
fixture=json.loads((Path(os.environ['ASTRID_CHECKOUT'])/'tests/fixtures/timeline_editing/tiny_publishable.json').read_text())
fixture['parent']={'config':value['config'],'clips':value['config']['clips'],'registry':value['registry']}
# Display-only projection metadata is never used as authored source.
identities=[clip.get('app',{}).get('canonical') for clip in value['config']['clips']]
occurrence=any(identities)
if occurrence:
 assert all(identities)
 internal={'tracks':value['config']['tracks'],'clips':[row['sourceClip'] for row in identities],'registry':value['registry']}
 for shot in ['A','B']:
  fixture['shots'][shot].update(shot_id=shot,payload={'name':shot},base_payload={'name':shot},internal_timeline=copy.deepcopy(internal),base_internal_timeline=copy.deepcopy(internal))
 fixture['placements']=[{'shot_id':shot,'occurrence_id':'occ-'+shot,'placement':{'start_ms':offset},'duration_ms':10000} for shot,offset in [('A',0),('B',10000)]]
 fixture['parent']['clips']=[]
fixture['parent']['config']={k:v for k,v in fixture['parent']['config'].items() if k!='clips'}
# IDENTITY deliberately retains monotone cut reservations on every inverse.
# Seed the legacy fixture with the producer's own canonical reservation helper.
from astrid.sdk.timeline.identity import retain_cut_reservations
retain_cut_reservations(fixture)
tl=Checkout(fixture);tl.resolve();before=copy.deepcopy(tl.document());journal_start=len(tl._journal);plans=[];documents=[];publications=[];media_reads=[]
def read_media(selection):
 media_reads.append(selection)
 return copy.deepcopy(value['mediaRecord'])
from types import SimpleNamespace
from astrid.sdk.timeline.commit import RuntimeCommitService
for request in value['requests']:
 with tl.edit('App selected drag',quiet=True) as tx:
  calls=RuntimeCommitService._capture_media(SimpleNamespace(selected_media=read_media),request,request['change']['commands']) if value.get('mediaRecord') else request['change']['commands']
  for call in calls:commands.execute(tl,call)
 assert not tx.plan.blocking, tx.plan.blocking
 plans.append({'writes':tx.plan.direct_writes,'calls':[c.to_json() for c in tx.plan.calls]})
 documents.append(copy.deepcopy(tl.document()))
 publication=compile_authoring_candidate(copy.deepcopy(tl.document())).publication
 publications.append(publication)
 assert publication['parent_composition']
 if occurrence:
  assert tl.document()['shots']['B']==before['shots']['B']
  assert tl.document()['parent']==before['parent']
journal_count=len(tl._journal)-journal_start
with tempfile.TemporaryDirectory(dir=os.environ['TMPDIR']) as directory:
 saved=Path(directory)/'selection.json';tl.save(saved,quiet=True);reloaded=Checkout.load(saved)
 assert reloaded.document()==tl.document(), ('reload mismatch',reloaded.document(),tl.document())
if len(documents)>1:assert documents[1]==before, ('inverse mismatch',documents[1],before)
if value.get('mediaRecord'):
 Path(os.environ['E_SELECTED_MOVE_EVIDENCE_DIR'],'add-media-sdk-diagnostic.json').write_text(json.dumps({'before':before,'documents':documents,'plans':plans}))
if len(documents)>2:assert documents[2]==documents[0], 'redo document mismatch; exact documents in add-media-sdk-diagnostic.json'
print(json.dumps({'plans':plans,'before':before,'documents':documents,'publications':publications,'journal':journal_count,'reload':True,'mediaReads':media_reads}))
`], { input: JSON.stringify({ config: initial.config, registry: initial.registry, requests, mediaRecord }), encoding: 'utf8', env: process.env })) as {
    plans: Array<{ writes: CommitResult['change']['direct_writes']; calls: unknown[] }>;
    before: unknown; documents: unknown[]; publications: unknown[]; journal: number; reload: boolean; mediaReads: unknown[];
  };
}

async function selectedMoveData(grouped = false, occurrence = false) {
  const base = grouped ? await shotGroupData() : await initialData();
  const clips = base.config.clips.map((clip) => ({ ...clip, app: { opaque: { nullValue: null, object: { op: 'clear' } } } }));
  return buildTimelineData({ ...base.config, clips: occurrence ? clips.map((clip, index) => ({ ...clip,
    id: `display-${index}`, app: { canonical: { projectId: 'gesture-project', parentDocumentId: 'gesture-timeline', headRevisionId: 'parent-r1',
      occurrenceId: 'occ-A', shotId: 'A', revisionId: 'shot-r1', internalTimelineRevisionId: 'internal-r1', outputIdentity: 'out-A', sourceClipId: clip.id, sourceClip: clip } },
  })) : clips }, base.registry, undefined, 1, undefined, base.head);
}

describe('selected move native semantic history', () => {
  it.each(['ordinary selection', 'pinned group', 'occurrence selection', 'tied pinned group', 'group keyboard'] as const)('%s compiles, materializes, reloads and uses actual native Undo/Redo', async (kind) => {
    let initial = await selectedMoveData(kind.includes('pinned group') || kind === 'group keyboard', kind === 'occurrence selection');
    if (kind === 'tied pinned group') initial = await buildTimelineData({ ...initial.config, clips: initial.config.clips.map((clip, index) => index ? clip
      : { ...clip, at: 1.4, app: { ...clip.app, astrid: { on: '"viral" +3f' } } }) }, initial.registry, undefined, 1, undefined, initial.head);
    const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async (request) => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      useEffect(() => h.eventBus.on('remoteCommit', state.onRemoteData), [state.onRemoteData]);
      return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    const prompt = vi.spyOn(window, 'prompt');
    if (kind === 'group keyboard') act(() => {
      const edit = buildKeyboardTimeNudgeEdit(h.result.current.data, ['clip-1'], 0.3)!;
      h.result.current.applyEdit(edit.mutation, edit.options);
    });
    else commitSelectedDrag(h, kind.includes('pinned group'), initial.rows[0].actions[0].start + 0.3);
    expect(prompt).not.toHaveBeenCalled();
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toMatchObject({ commands: initial.config.clips.map((clip) => ({
      op: 'clip.nudge', select: kind === 'occurrence selection' ? `occurrence:occ-A/clip:${(clip.app!.canonical as CanonicalClipIdentity).sourceClipId}` : `parent/clip:${clip.id}`,
      args: { frames: 9 }, expect: { at: { state: 'present', value: clip.at }, 'app.astrid.on': kind === 'tied pinned group' && clip.id === 'clip-1' ? { state: 'present', value: '"viral" +3f' } : { state: 'absent' }, 'app.astrid.until': { state: 'absent' } },
    })) });
    const forwardWrites = source.plans[0].writes;
    expect(forwardWrites.every((write) => ['at', 'intent.on', 'intent.fixed_start'].includes(write.path))).toBe(true);
    act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests.map(({ request }) => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(source.documents[1]).toEqual(source.before);
    expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.journal).toBe(3); expect(source.reload).toBe(true);
    expect(h.requests[1].request.change).toEqual({ commands: [{ op: 'timeline.inverse', select: null,
      args: { publication: 'pub-parent-r2', writes: forwardWrites.map((write) => ({ ...write, before: write.after, after: write.before })) } }] });
    if (kind === 'occurrence selection') {
      expect(h.requests[0].request.scope).toMatchObject({ target: 'occurrence:occ-A', shot_id: 'A', shot_revision_id: 'shot-r1', internal_revision_id: 'internal-r1' });
      // The admitted publication inverse is a parent aggregate carrying exact
      // occurrence write IDs; it does not reuse stale source revision pins.
      for (const { request } of h.requests.slice(1)) expect(request.scope.target).toBe('parent');
      expect(forwardWrites.every((write) => write.id.startsWith('occurrence:occ-A/'))).toBe(true);
    }
    const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
    if (evidence) writeFileSync(path.join(evidence, `selected-${kind.replaceAll(' ', '-')}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
    expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});


function resizeSelectedPlacement(h: Awaited<ReturnType<typeof setup>>, grouped: boolean, cancelled = false) {
  const data = h.result.current.data!; const row = data.rows[0]; const action = row.actions[0];
  act(() => h.result.current.resize.onActionResizeStart({ action, row, dir: 'right' }));
  act(() => h.result.current.resize.onClipEdgeResizeEnd({
    session: { pointerId: 1, rowId: row.id, clipId: action.id, edge: 'right', started: true, startClientX: 0,
      startLocalX: 0, startTime: action.end, lastStart: action.start, lastEnd: action.end + 0.5, snapTargets: [],
      context: grouped ? { kind: 'group', clipId: action.id, groupClipIds: row.actions.map(({ id }) => id), initialStart: action.start, initialEnd: row.actions.at(-1)!.end } as never
        : { kind: 'single', initialStart: action.start, initialEnd: action.end } as never },
    updates: [{ clipId: action.id, start: action.start, end: action.end + 0.5 },
      ...(grouped ? [{ clipId: row.actions[1].id, start: action.end + 0.5, end: action.end + 1.5 }] : [])], cancelled,
  }));
}

describe('group and occurrence ordinary resize completion', () => {
  it.each(['group media', 'group hold', 'occurrence hold'] as const)('%s uses a real ordered compile, reload and native Undo/Redo', async (kind) => {
    let initial = await selectedMoveData(kind !== 'occurrence hold', kind === 'occurrence hold');
    if (kind === 'group hold') initial = await buildTimelineData({ ...initial.config, clips: initial.config.clips.map(({ from, to, speed, ...clip }) => ({ ...clip, clipType: 'hold', hold: clip.id === 'clip-1' ? 2 : 1 })) }, initial.registry, undefined, 1, undefined, initial.head);
    const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async (request) => { requests.push(request); source = selectedMoveSource(initial, requests); return { directWrites: source.plans.at(-1)!.writes }; }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    resizeSelectedPlacement(h, kind !== 'occurrence hold');
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const forward = (h.requests[0].request.change as { commands: Array<{ op: string; select: string; args: unknown }> }).commands;
    expect(forward.map((call) => call.op)).toEqual(kind === 'group media' ? ['clip.set-look', 'clip.nudge'] : kind === 'group hold' ? ['clip.set-duration', 'clip.nudge'] : ['clip.set-duration']);
    expect(forward[0]).toMatchObject(kind === 'group media' ? { select: 'parent/clip:clip-1', args: { speed: 1.6 } }
      : { select: kind === 'group hold' ? 'parent/clip:clip-1' : 'occurrence:occ-A/clip:clip-1', args: { seconds: 2.5 } });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.reload).toBe(true); expect(source.journal).toBe(3); expect(h.requests).toHaveLength(3);
    expect(h.requests.map(({ request }) => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(h.compatibilityRequests).toEqual([]);
    const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
    if (evidence) writeFileSync(path.join(evidence, `resize-${kind.replaceAll(' ', '-')}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
    history.unmount(); h.unmount();
  }, 60_000);

  it.each(['group media', 'occurrence hold'] as const)('cancelled %s creates no request, local history or draft', async (kind) => {
    const initial = await selectedMoveData(kind === 'group media', kind === 'occurrence hold'); const h = await setup(undefined, false, initial);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history); const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    resizeSelectedPlacement(h, kind === 'group media', true);
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(history).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled();
    expect(h.result.current.data).toBe(initial); expect(h.result.current.editSeqRef.current).toBe(0); h.unmount();
  });
});


describe('selected placement atomic refusal', () => {
  it.each(['mixed occurrences', 'stale head', 'read-only', 'second locked', 'no movement'])('%s writes no draft, request or history', async (kind) => {
    const initial = await selectedMoveData(false, !['read-only', 'second locked', 'no movement'].includes(kind));
    if (kind === 'mixed occurrences') (initial.config.clips[1].app!.canonical as CanonicalClipIdentity).occurrenceId = 'occ-B';
    if (kind === 'stale head') for (const clip of initial.config.clips) (clip.app!.canonical as CanonicalClipIdentity).headRevisionId = 'stale-parent';
    const h = await setup(undefined, false, initial, 1, kind === 'read-only' ? createTimelineEditability({ readOnly: true }) : kind === 'second locked' ? createTimelineEditability({ lockedClipIds: ['clip-2'] }) : undefined);
    const before = h.result.current.data; const history = vi.fn(); h.eventBus.on('beforeCommit', history); const draft = vi.spyOn(draftStorage, 'saveTimelineDraft');
    commitSelectedDrag(h, false, kind === 'no movement' ? 1 : 1.3);
    expect(h.result.current.data).toBe(before); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(history).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled();
    h.unmount();
  });
});


function resizeLiteralLeft(h: Awaited<ReturnType<typeof setup>>, cancelled = false, afterStart?: () => void) {
  const data = h.result.current.data!; const row = data.rows[0]; const action = row.actions[0];
  act(() => h.result.current.resize.onActionResizeStart({ action, row, dir: 'left' }));
  afterStart?.();
  act(() => h.result.current.resize.onClipEdgeResizeEnd({
    session: { pointerId: 1, rowId: row.id, clipId: action.id, edge: 'left', started: true, startClientX: 0, startLocalX: 0,
      startTime: action.start, lastStart: action.start + 0.5, lastEnd: action.end, snapTargets: [],
      context: { kind: 'single', initialStart: action.start, initialEnd: action.end } as never },
    updates: [{ clipId: action.id, start: action.start + 0.5, end: action.end }], cancelled,
  }));
}

async function literalLeftData(media: boolean) {
  const base = await selectedMoveData(media); const config = structuredClone(base.config); delete config.pinnedShotGroups;
  if (media) config.clips[0].asset = 'left-source';
  const registry = media ? { assets: { 'left-source': { file: 'fixture-left.mp4', type: 'video' as const, duration: 10 } } } : base.registry;
  return buildTimelineData(config, registry, undefined, 1, undefined, base.head);
}

describe('literal left placement completion', () => {
  it.each(['media', 'hold'] as const)('%s left resize uses one ordered transaction and actual native inverse/Redo', async (kind) => {
    const initial = await literalLeftData(kind === 'media'); const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async (request) => { requests.push(request); source = selectedMoveSource(initial, requests); return { directWrites: source.plans.at(-1)!.writes }; }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    resizeLiteralLeft(h); await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const calls = (h.requests[0].request.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands;
    expect(calls.map(({ op }) => op)).toEqual(kind === 'media' ? ['clip.trim', 'clip.nudge'] : ['clip.nudge', 'clip.set-duration']);
    if (kind === 'media') expect(calls[0]).toEqual({ op: 'clip.trim', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
      args: { in_s: 3, out_s: 6 }, expect: { '': { state: 'present', value: initial.config.clips[0] } } });
    expect(calls.find(({ op }) => op === 'clip.nudge')).toMatchObject({ select: 'parent/clip:clip-1', args: { frames: 15 }, expect: { at: { state: 'present', value: 1 } } });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.journal).toBe(3); expect(source.reload).toBe(true); expect(h.requests).toHaveLength(3);
    expect(h.requests.map(({ request }) => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(h.compatibilityRequests).toEqual([]);
    const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
    if (evidence) writeFileSync(path.join(evidence, `left-${kind}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
    history.unmount(); h.unmount();
  }, 60_000);

  it.each(['cancelled', 'stale head', 'stale config', 'stale fps'])('%s emits no left-edge command or history', async (kind) => {
    const initial = await literalLeftData(true); const h = await setup(undefined, false, initial); const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    resizeLiteralLeft(h, kind === 'cancelled', () => {
      if (kind === 'stale head') h.result.current.dataRef.current = { ...initial, head: { ...initial.head!, headRevisionId: 'moved-head' } };
      if (kind === 'stale config') h.result.current.dataRef.current = { ...initial, config: { ...initial.config, app: { ...initial.config.app, changed: true } } };
      if (kind === 'stale fps') h.result.current.dataRef.current = { ...initial, output: { ...initial.output, fps: 24 } };
    });
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(h.result.current.editSeqRef.current).toBe(0); expect(history).not.toHaveBeenCalled();
    h.unmount();
  });
});


async function mediaEndRepairData() {
  const base = await literalLeftData(true);
  return buildTimelineData({ ...base.config, clips: base.config.clips.map((clip, index) => index ? clip : { ...clip, to: 12 }) }, base.registry, undefined, 1, undefined, base.head);
}

describe('W43 shared production media-end repair', () => {
  it('captures one source-out trim and restores the full overhang through native Undo/Redo', async () => {
    const initial = await mediaEndRepairData(); const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async (request) => { requests.push(request); source = selectedMoveSource(initial, requests); return { directWrites: source.plans.at(-1)!.writes }; }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => trimClipToMediaEnd(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' }, change: { commands: [{
      op: 'clip.trim', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { out_s: 10 },
      expect: { '': { state: 'present', value: initial.config.clips[0] } },
    }] } });
    expect(h.result.current.data!.config.clips[0]).toMatchObject({ at: 1, from: 2, to: 10, speed: 2 });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.reload).toBe(true); expect(source.journal).toBe(3); expect(h.requests).toHaveLength(3); expect(h.compatibilityRequests).toEqual([]);
    const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
    if (evidence) writeFileSync(path.join(evidence, 'w43-media-end.json'), JSON.stringify({ requests: h.requests, source }, null, 2));
    history.unmount(); h.unmount();
  }, 60_000);

  it('no overhang is a no-write/no-history action', async () => {
    const initial = await literalLeftData(true); const h = await setup(undefined, false, initial); const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    act(() => trimClipToMediaEnd(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    expect(h.result.current.data).toBe(initial); expect(h.result.current.editSeqRef.current).toBe(0); expect(h.requests).toEqual([]); expect(history).not.toHaveBeenCalled(); h.unmount();
  });

  it('Runtime refusal accepts no revision and cannot substitute a snapshot Undo', async () => {
    const initial = await mediaEndRepairData(); const h = await setup(async () => 'refused', false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => trimClipToMediaEnd(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.getCurrentHead()).toBe('parent-r1'); expect(h.acceptedCount()).toBe(0); expect(h.savedSeqRef.current).toBe(0);
    act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1); expect(h.compatibilityRequests).toEqual([]); expect(history.result.current.canUndo).toBe(false);
    history.unmount(); h.unmount();
  });
});

// The main-editor split and empty-track callers are distinct from tool splitClip.
describe('bounded structural writer native history', () => {
  it.each(['split', 'bulk-split', 'remove-track', 'clear-unused', 'duplicate'] as const)('%s uses actual caller and publication Undo/Redo', async (kind) => {
    const base = await literalLeftData(true);
    const initial = await buildTimelineData({ ...base.config, ...(kind === 'duplicate' ? { clips: [base.config.clips[0]] } : kind === 'bulk-split' ? { clips: [base.config.clips[0], { ...base.config.clips[0], id: 'clip-2', track: 'V2' }] } : {}), tracks: [base.config.tracks![0],
      { id: 'unused', kind: 'visual', label: 'Unused', app: { opaque: null } }, ...base.config.tracks!.slice(1)] }, base.registry, undefined, 1, undefined, base.head);
    const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async (request) => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `structural-${kind}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial, 2);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => {
      if (kind === 'split') h.result.current.editing.handleSplitSelectedClip();
      else if (kind === 'bulk-split') h.result.current.editing.handleSplitClipsAtPlayhead(['clip-1', 'clip-2']);
      else if (kind === 'remove-track') h.result.current.tracks.handleRemoveTrack('unused');
      else if (kind === 'clear-unused') h.result.current.tracks.handleClearUnusedTracks();
      else {
        const commands = createTimelineCommands({ getState: () => ({ data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
          ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true } }) } as unknown as TimelineStoreApi);
        expect(commands.addClip({ assetId: 'left-source', afterClipId: 'clip-1' }).ok).toBe(true);
      }
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' } });
    const calls = 'commands' in h.requests[0].request.change ? h.requests[0].request.change.commands : [];
    if (kind === 'split' || kind === 'bulk-split') expect(calls).toEqual((kind === 'split' ? ['clip-1'] : ['clip-1', 'clip-2']).map(id => ({
      op: 'timeline.split', select: `parent/clip:${id}`, args: { at: 2 }, created: [`parent/clip:${id}-01`],
      expect: { [`parent/clip:${id}::`]: { state: 'present', value: initial.config.clips.find(clip => clip.id === id) } },
    })));
    else if (kind === 'duplicate') expect(calls[0]).toMatchObject({ op: 'timeline.add', select: null, args: { from: 'parent/clip:clip-1' },
      expect: { 'parent/clip:clip-1::': { state: 'present', value: initial.config.clips[0] } } });
    else expect(calls).toEqual((kind === 'remove-track' ? ['unused'] : ['unused', 'V2']).map((id, index, ids) => ({
      op: 'timeline.remove', select: `parent/track:${id}`, args: {}, expect: { '': { state: 'present', value: initial.config.tracks!.find(track => track.id === id) },
        track_order: { state: 'present', value: initial.config.tracks!.filter(track => !ids.slice(0, index).includes(track.id)).map(track => `parent/track:${track.id}`) } },
    })));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests).toHaveLength(3); expect('commands' in h.requests[1].request.change && h.requests[1].request.change.commands[0]).toMatchObject({ op: 'timeline.inverse', args: { publication: 'pub-parent-r2' } });
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.reload).toBe(true); expect(source.journal).toBe(3); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});

describe('bounded structural whole-batch refusal', () => {
  it.each(['grouped', 'tied', 'ambiguous', 'missing'] as const)('%s bulk split leaves all source/history/wire unchanged', async kind => {
    const base = await literalLeftData(true);
    const second = { ...base.config.clips[0], id: 'clip-2', track: 'V2', ...(kind === 'tied' ? { app: { astrid: { on: '"hello"' } } } : {}) };
    const initial = await buildTimelineData({ ...base.config, clips: [base.config.clips[0], second],
      ...(kind === 'grouped' ? { pinnedShotGroups: [{ shotId: 'structural-group', trackId: 'V2', clipIds: ['clip-2'], mode: 'images' as const }] } : {}),
    }, base.registry, undefined, 1, undefined, base.head);
    // An ambiguous authored source cannot be manufactured by the validated codec.
    if (kind === 'ambiguous') initial.config.clips.push(structuredClone(second));
    const h = await setup(undefined, false, initial, 2); const before = structuredClone(initial.config); const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    act(() => h.result.current.editing.handleSplitClipsAtPlayhead(['clip-1', kind === 'missing' ? 'missing' : 'clip-2']));
    expect(h.result.current.data!.config).toEqual(before); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]); expect(history).not.toHaveBeenCalled(); h.unmount();
  });
  it.each(['refused', 'no_change'] as const)('%s structural receipt cannot create a snapshot Undo publication', async outcome => {
    const initial = await literalLeftData(true); const h = await setup(async () => outcome, false, initial, 2);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => h.result.current.editing.handleSplitSelectedClip());
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe(outcome === 'refused' ? 'error' : 'saved'));
    expect(history.result.current.canUndo).toBe(false); act(() => history.result.current.undo());
    expect(h.requests).toHaveLength(1); expect(h.acceptedCount()).toBe(0); expect(h.getCurrentHead()).toBe('parent-r1'); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  });
});

async function nativeTrackData() {
  const base = await literalLeftData(true);
  return buildTimelineData({ ...base.config, tracks: [
    { ...base.config.tracks![0], app: { sentinel: null, object: { op: 'clear' }, removable: null } },
    { id: 'A1', kind: 'audio', label: 'Audio', volume: 0.7, app: { audio: null } }, base.config.tracks![1],
    { id: 'A4', kind: 'audio', label: 'Second audio', role: 'source', muted: false },
  ] }, base.registry, undefined, 1, undefined, base.head);
}

describe('bounded authored track native history', () => {
  it.each(['add-visual', 'add-audio', 'properties', 'mute-all'] as const)('%s uses the actual current writer and publication inverse/Redo', async kind => {
    const initial = await nativeTrackData(); const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `track-${kind}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => {
      if (kind.startsWith('add-')) h.result.current.tracks.handleAddTrack(kind === 'add-audio' ? 'audio' : 'visual');
      else if (kind === 'reorder') h.result.current.tracks.handleMoveTrack('V1', 'V2');
      else if (kind === 'properties') h.result.current.tracks.handleTrackPopoverChange('V1', { label: 'Renamed', role: 'source', scale: 1.5,
        fit: 'cover', opacity: 0.4, volume: 0.3, muted: true, blendMode: 'multiply', app: { added: { nested: null }, removable: undefined } });
      else h.result.current.ops.setAllTracksMuted(true);
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const first = h.requests[0].request; expect(first).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' } });
    const calls = 'commands' in first.change ? first.change.commands : [];
    if (kind.startsWith('add-')) expect(calls[0]).toMatchObject({ op: 'timeline.add', select: `parent/track:${kind === 'add-audio' ? 'A5' : 'V3'}`,
      created: [`parent/track:${kind === 'add-audio' ? 'A5' : 'V3'}`], expect: { [`parent/track:${kind === 'add-audio' ? 'A5' : 'V3'}::`]: { state: 'absent' } } });
    else if (kind === 'reorder') expect(calls[0]).toMatchObject({ op: 'timeline.reorder',
      args: { expected_order: initial.config.tracks!.map(track => `parent/track:${track.id}`) } });
    else if (kind === 'properties') expect(calls[0]).toMatchObject({ op: 'timeline.set', select: 'parent/track:V1',
      expect: { 'parent/track:V1::app.removable': { state: 'present', value: null }, 'parent/track:V1::app.added': { state: 'absent' } } });
    else expect(calls.map(call => call.select)).toEqual(['parent/track:A1', 'parent/track:A4']);
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests).toHaveLength(3); expect('commands' in h.requests[1].request.change && h.requests[1].request.change.commands[0])
      .toMatchObject({ op: 'timeline.inverse', args: { publication: 'pub-parent-r2' } });
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.reload).toBe(true); expect(source.journal).toBe(3); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});

describe('bounded authored history no-write receipts', () => {
  it.each(['placement', 'split', 'track-property'] as const)('%s no_change removes only its exact native owner', async kind => {
    const initial = await nativeTrackData(); const h = await setup(async () => 'no_change', false, initial, 2);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => {
      if (kind === 'split') h.result.current.editing.handleSplitSelectedClip();
      else if (kind === 'track-property') h.result.current.tracks.handleTrackPopoverChange('V1', { label: 'New label' });
      else h.result.current.tracks.moveClipToRow('clip-1', 'V1', 0.7);
    });
    await waitFor(() => expect(h.requests).toHaveLength(1));
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('saved'));
    expect(history.result.current.canUndo).toBe(false); act(() => history.result.current.undo());
    expect(h.requests).toHaveLength(1); expect(h.acceptedCount()).toBe(0); expect(h.getCurrentHead()).toBe('parent-r1'); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  });
  it('real reorder lacks a publication direct-write receipt and retains the existing history owner', async () => {
    const initial = await nativeTrackData(); let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => { source = selectedMoveSource(initial, [request]); return { directWrites: source.plans[0].writes }; }, false, initial);
    const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    act(() => h.result.current.tracks.handleMoveTrack('V1', 'V2'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(source.plans[0].writes).toEqual([]); expect(source.reload).toBe(true);
    expect(source.plans[0].calls[0]).toMatchObject({ op: 'timeline.reorder', authorship: { track_order: 'direct' } });
    expect(history).toHaveBeenCalledOnce(); expect(history.mock.calls[0][1].nativeRegistrationOwner).toBeUndefined();
    expect(h.compatibilityRequests).toEqual([]); h.unmount();
  }, 60_000);
});

describe('literal mounted split and deletion order native history', () => {
  it.each(['tool-split', 'delete-main-single', 'delete-main-bulk', 'delete-tool'] as const)('%s captures exact base, identity/order and native inverse/Redo', async kind => {
    const base = await literalLeftData(true);
    const initial = await buildTimelineData({ ...base.config, clips: [{ id: 'keep-before', at: 0, hold: 0.5, clipType: 'hold', track: 'V1', app: { opaque: null } }, ...base.config.clips] }, base.registry, undefined, 1, undefined, base.head);
    const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `${kind}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => {
      if (kind.startsWith('delete-main')) {
        if (kind === 'delete-main-bulk') h.result.current.editing.handleDeleteClips(['clip-1', 'clip-2']);
        else h.result.current.editing.handleDeleteClip('clip-1');
      } else {
        const service = createTimelineCommands({ getState: () => ({ data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
          ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true } }) } as unknown as TimelineStoreApi);
        expect(kind === 'tool-split' ? service.splitClip({ clipId: 'clip-1', time: 2 }).ok : service.deleteClip({ clipId: 'clip-1' }).ok).toBe(true);
      }
    });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const first = h.requests[0].request; expect(first).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' } });
    const calls = 'commands' in first.change ? first.change.commands : [];
    if (kind === 'tool-split') expect(calls).toEqual([{ op: 'timeline.split', select: 'parent/clip:clip-1', args: { at: 2 }, created: ['parent/clip:clip-1-01'],
      expect: { 'parent/clip:clip-1::': { state: 'present', value: initial.config.clips[1] } } }]);
    else {
      const deleted = kind === 'delete-main-bulk' ? ['clip-1', 'clip-2'] : ['clip-1'];
      expect(calls.map(call => call.select)).toEqual(deleted.map(id => `parent/clip:${id}`));
      calls.forEach((call, index) => expect(call).toMatchObject({ op: 'clip.remove', args: {}, expect: {
        '': { state: 'present', value: initial.config.clips.find(clip => call.select === `parent/clip:${clip.id}`) },
        clip_order: { state: 'present', value: initial.config.clips.filter(clip => !deleted.slice(0, index).includes(clip.id)).map(clip => `parent/clip:${clip.id}`) },
      } }));
    }
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests).toHaveLength(3); expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.reload).toBe(true); expect(source.journal).toBe(3); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});

describe('W41 W42 literal tiny expansion native history', () => {
  it.each(['hold', 'media', 'audio'] as const)('%s shared context-menu handler preserves source and exact publication Undo/Redo', async kind => {
    let base = await literalLeftData(kind !== 'hold');
    if (kind === 'audio') base = await buildTimelineData({ ...base.config, tracks: [{ id: 'A1', kind: 'audio', label: 'Audio' }, ...base.config.tracks!],
      clips: base.config.clips.map((clip, index) => index ? clip : { ...clip, track: 'A1' }) },
      { assets: { 'left-source': { file: 'fixture-left.wav', type: 'audio', duration: 10 } } }, undefined, 1, undefined, base.head);
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip, index) => index ? clip : kind === 'hold'
      ? { ...clip, hold: 0.2 } : { ...clip, to: 2.4 }) }, base.registry, undefined, 1, undefined, base.head);
    const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `tiny-${kind}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => expandTinyClip(h.result.current.dataRef, h.result.current.applyEdit, 'clip-1'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' }, change: { commands: [{
      op: kind !== 'hold' ? 'clip.trim' : 'clip.set-duration', args: kind !== 'hold' ? { out_s: 3 } : { seconds: 0.5 },
    }] } });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.journal).toBe(3); expect(source.reload).toBe(true); expect(h.requests).toHaveLength(3); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});

describe('W34 W35 actual audio detach receipt gap', () => {
  it.each(['existing-track', 'new-track'] as const)('%s materializes but lacks the created-child root in its actual receipt', async kind => {
    const base = await literalLeftData(true);
    const initial = await buildTimelineData({ ...base.config, tracks: [...base.config.tracks!, ...(kind === 'existing-track'
      ? [{ id: 'A1', kind: 'audio' as const, label: 'Audio', app: { opaque: null } }] : [])] }, { assets: { 'left-source': { file: 'https://fixture.test/detach.mp4', type: 'video/mp4', duration: 10 } } }, undefined, 1, undefined, base.head);
    const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `detach-${kind}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => h.result.current.editing.handleDetachAudioClip('clip-1'));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const first = h.requests[0].request; expect(first).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' } });
    const calls = 'commands' in first.change ? first.change.commands : [];
    expect(calls.map(call => call.op)).toEqual(kind === 'new-track' ? ['timeline.add', 'clip.detach-audio'] : ['clip.detach-audio']);
    const created = calls.at(-1)!.created![0]; expect(created).toMatch(/^parent\/clip:clip-1-\d+$/);
    const childId = created.slice('parent/clip:'.length);
    expect(calls.at(-1)).toMatchObject({ select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], created: [created],
      args: { track: 'A1' }, expect: { '': { state: 'present', value: initial.config.clips[0] } } });
    expect(h.result.current.data!.config.clips.find(clip => clip.id === childId)).toEqual({ ...initial.config.clips[0], id: childId, track: 'A1' });
    expect(source.plans[0].calls.at(-1)).toMatchObject({ created: [created], authorship: { [`${created}::`]: 'consequence' } });
    expect(source.plans[0].writes.some(write => write.id === created)).toBe(false);
    expect(source.journal).toBe(1); expect(source.reload).toBe(true); expect(h.requests).toHaveLength(1); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});

const mountedCommandsFor = (h: Awaited<ReturnType<typeof setup>>) => createTimelineCommands({ getState: () => ({
  data: { data: h.result.current.data, dataRef: h.result.current.dataRef }, ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true },
}) } as unknown as TimelineStoreApi);

describe('W69 literal mounted tool trim native history', () => {
  it.each(['media-left', 'media-right', 'media-both', 'hold-left', 'hold-both'] as const)('%s uses explicit ordered edge commands and exact native inverse/Redo', async kind => {
    const initial = await literalLeftData(kind.startsWith('media')); const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `tool-trim-${kind}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    const start = kind.endsWith('right') ? 1 : 1.5, end = kind.endsWith('left') ? 3 : 2.5;
    act(() => expect(mountedCommandsFor(h).trimClip({ clipId: 'clip-1', startTime: start, endTime: end }).ok).toBe(true));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const first = h.requests[0].request; expect(first).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' } });
    const calls = 'commands' in first.change ? first.change.commands : [];
    if (kind.startsWith('media')) {
      expect(calls.map(call => call.op)).toEqual(start === 1 ? ['clip.trim'] : ['clip.trim', 'clip.nudge']);
      expect(calls[0]).toEqual({ op: 'clip.trim', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'],
        args: { in_s: 2 + (start - 1) * 2, out_s: 2 + (end - 1) * 2 }, expect: { '': { state: 'present', value: initial.config.clips[0] } } });
    } else expect(calls.map(call => call.op)).toEqual(['clip.nudge', 'clip.set-duration']);
    if (start !== 1) expect(calls.find(call => call.op === 'clip.nudge')).toMatchObject({ args: { frames: 15 }, expect: { at: { state: 'present', value: 1 } } });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.journal).toBe(3); expect(source.reload).toBe(true); expect(h.requests).toHaveLength(3); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
  it.each([false, true])('unchanged tool trim (media=%s) creates no edit, history or wire', async media => {
    const initial = await literalLeftData(media), h = await setup(undefined, false, initial); const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    act(() => expect(mountedCommandsFor(h).trimClip({ clipId: 'clip-1', startTime: 1, endTime: 3 }).ok).toBe(true));
    expect(h.result.current.data).toBe(initial); expect(h.result.current.editSeqRef.current).toBe(0); expect(h.requests).toEqual([]); expect(history).not.toHaveBeenCalled(); h.unmount();
  });
});

describe('W69 mounted appended track native history', () => {
  it.each(['visual', 'audio'] as const)('%s exact append captures the allocated row and native inverse/Redo', async kind => {
    const initial = await literalLeftData(true); const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `tool-track-${kind}.json`), JSON.stringify({ requests: h.requests, source }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    const id = kind === 'visual' ? 'V3' : 'A1';
    act(() => expect(mountedCommandsFor(h).addTrack({ kind })).toEqual({ ok: true, data: { trackId: id } }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const first = h.requests[0].request; expect(first).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' }, change: { commands: [{
      op: 'timeline.add', select: `parent/track:${id}`, created: [`parent/track:${id}`],
      args: { track: { id, kind, label: id, scale: 1, fit: kind === 'visual' ? 'manual' : 'contain', opacity: 1, blendMode: 'normal' } },
      expect: { [`parent/track:${id}::`]: { state: 'absent' } },
    }] } });
    expect(h.result.current.data!.config.tracks!.slice(0, -1)).toEqual(initial.config.tracks);
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.journal).toBe(3); expect(source.reload).toBe(true); expect(h.requests).toHaveLength(3); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});

describe('W69 tool command refusal boundaries', () => {
  it.each(['invalid trim', 'grouped trim', 'read-only trim', 'read-only add'] as const)('%s changes no source, history or wire', async kind => {
    const base = await literalLeftData(true);
    const initial = kind === 'grouped trim' ? await buildTimelineData({ ...base.config,
      pinnedShotGroups: [{ shotId: 'tool-group', trackId: 'V1', clipIds: ['clip-1', 'clip-2'], mode: 'images' }] }, base.registry, undefined, 1, undefined, base.head) : base;
    const h = await setup(undefined, false, initial); const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    const service = kind.startsWith('read-only') ? createTimelineCommands({ getState: () => ({ availability: { mounted: true } }) } as unknown as TimelineStoreApi,
      { timelineEditability: { checkTimeline: () => ({ allowed: false, reason: 'read_only' }) } }) : mountedCommandsFor(h);
    act(() => expect(kind === 'read-only add' ? service.addTrack({ kind: 'visual' }).ok
      : service.trimClip({ clipId: 'clip-1', startTime: kind === 'invalid trim' ? 0 : 1.5, endTime: 2.5 }).ok).toBe(false));
    expect(h.result.current.editSeqRef.current).toBe(0); expect(h.result.current.data).toBe(initial); expect(h.requests).toEqual([]); expect(history).not.toHaveBeenCalled(); h.unmount();
  });
  it('indexed track insertion retains its existing whole operation pending the order receipt', async () => {
    const initial = await literalLeftData(true); const h = await setup(undefined, false, initial);
    act(() => expect(mountedCommandsFor(h).addTrack({ kind: 'visual', index: 0 }).ok).toBe(true));
    expect(h.result.current.data!.config.tracks!.map(track => track.id)).toEqual(['V3', 'V1', 'V2']);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined(); expect(h.requests).toEqual([]); h.unmount();
  });
});


describe('selected-media insertion native history', () => {
  // Detached authority fixture only: capture_media validates real selection/digest/project
  // and invokes the real compiler. This does not establish Runtime acquisition/acceptance.
  it.each((['drop', 'service'] as const).flatMap(caller => (['image', 'video', 'audio'] as const).flatMap(kind => (['registered', 'new'] as const).map(registration => [caller, kind, registration] as const))))('%s %s %s existing-track add compiles and restores exact registry/child through native Undo/Redo', async (caller, kind, registration) => {
    const base = await literalLeftData(true);
    let initial = kind === 'audio' ? await buildTimelineData({ ...base.config, tracks: [...base.config.tracks!, { id: 'A1', kind: 'audio' as const, label: 'Audio' }] }, base.registry, undefined, 1, undefined, base.head) : base;
    const duration = kind === 'image' ? 5 : 2;
    const objectId = `sha256:${'a'.repeat(64)}`;
    const detached = {
      realm_id: 'realm', project_id: 'gesture-project', asset: 'selected', generation_id: 'g', variant_id: 'v', object_id: objectId,
      generation: { type: kind, source_task_id: null, metadata: { params: {}, opaque: null } },
      variant: { variant_type: 'original', metadata: { op: 'clear' } },
      entry: { object_id: objectId, media_type: kind === 'image' ? 'image/png' : kind === 'video' ? 'video/mp4' : 'audio/wav', size: 4, filename: `selected.${kind}`, duration_seconds: duration },
    };
    const catalog_digest = `sha256:${createHash('sha256').update(canonicalJsonStringify(detached)).digest('hex')}`;
    const selection = { asset: detached.asset, generation_id: detached.generation_id, variant_id: detached.variant_id, object_id: objectId, catalog_digest };
    const registryEntry = {
      media_id: objectId, content_sha256: 'a'.repeat(64), type: detached.entry.media_type, duration,
      format: detached.entry, generationId: 'g', variantId: 'v',
      authoring_metadata: { generation: detached.generation, variant: detached.variant },
      file: 'https://runtime.fixture/selected',
    };
    if (registration === 'registered') initial = await buildTimelineData(initial.config, { assets: { ...initial.registry.assets, selected: registryEntry } }, undefined, 1, undefined, initial.head);
    const record = { ...detached, catalog_digest }; const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => {
      requests.push(request); source = selectedMoveSource(initial, requests, record);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `add-media-${caller}-${kind}-${registration}.json`), JSON.stringify({ requests: h.requests, source, detachedAuthorityFixture: record }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    const runtime = { provider: h.provider, toast: { error: vi.fn() } } as unknown as VideoEditorRuntimeContextValue;
    const trackId = kind === 'audio' ? 'A1' : 'V2';
    const assets = renderHook(() => useAssetManagement({
      dataRef: h.result.current.dataRef, selectedTrackId: trackId, selectedProjectId: 'gesture-project',
      selectClip: vi.fn(), setSelectedTrackId: vi.fn(), applyEdit: h.result.current.applyEdit,
      patchRegistry: vi.fn(), invalidateAssetRegistry: vi.fn(), resolveAssetUrl: vi.fn(),
    }), { wrapper: ({ children }) => <VideoEditorRuntimeProvider value={runtime}>{children}</VideoEditorRuntimeProvider> });
    const prepared = { assetKey: 'selected', mediaType: kind, durationSeconds: duration, source: 'external-media' as const, selectedMedia: selection, entry: registryEntry };
    act(() => expect(caller === 'drop' ? assets.result.current.handleAssetDrop('selected', trackId, 1, false, false, prepared)
      : mountedCommandsFor(h).addClip({ preparedAsset: prepared, trackId, time: 1 }).ok).toBe(true));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const forward = h.requests[0].request;
    expect(forward).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' }, change: { commands: [{
      op: 'timeline.add', select: `parent/track:${trackId}`, args: { media: selection, at: 1, duration },
    }] } });
    const child = forward.change.commands[0].created![0];
    expect(forward.change.commands[0].args.clip_id).toBe(child.split(':')[1]);
    expect(forward.change.commands[0].expect).toEqual({ [`${child}::`]: { state: 'absent' },
      'parent::registry.assets.selected': registration === 'registered' ? { state: 'present', value: registryEntry } : { state: 'absent' } });
    expect(forward.change.commands[0].args).not.toHaveProperty('media_record');
    expect(source.mediaReads).toEqual([selection]);
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(h.requests[2].request.change.commands).toEqual(forward.change.commands);
    expect(h.requests[2].request.base_revision_id).toBe('parent-r3');
    // This fixture's revision read carries no publication identity.
    expect(h.requests[2].request.base_publication_id).toBeNull();
    expect(source.mediaReads).toEqual([selection, selection]); expect(source.journal).toBe(3); expect(source.reload).toBe(true);
    expect(h.requests).toHaveLength(3); expect(h.compatibilityRequests).toEqual([]);
    assets.unmount(); history.unmount(); h.unmount();
  }, 60_000);
});


describe('selected-media actual caller no-write boundaries', () => {
  it.each(['drop invalid asset', 'drop read-only', 'service invalid asset', 'service read-only'] as const)('%s preserves source/history/wire', async kind => {
    const initial = await literalLeftData(true);
    const h = await setup(undefined, false, initial, 1, kind.endsWith('read-only') ? createTimelineEditability({ readOnly: true }) : undefined);
    const before = h.result.current.data; const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    const prepared = { assetKey: kind.endsWith('invalid asset') ? '' : 'selected', mediaType: 'video' as const, durationSeconds: 2, source: 'external-media' as const,
      entry: { type: 'video/mp4', duration: 2, file: 'fixture.mp4' },
      selectedMedia: { asset: 'selected', generation_id: 'g', variant_id: 'v', object_id: `sha256:${'a'.repeat(64)}`, catalog_digest: `sha256:${'b'.repeat(64)}` } };
    const runtime = { provider: h.provider, toast: { error: vi.fn() } } as unknown as VideoEditorRuntimeContextValue;
    const assets = renderHook(() => useAssetManagement({ dataRef: h.result.current.dataRef, selectedTrackId: 'V2', selectedProjectId: 'gesture-project',
      selectClip: vi.fn(), setSelectedTrackId: vi.fn(), applyEdit: h.result.current.applyEdit, patchRegistry: vi.fn(), invalidateAssetRegistry: vi.fn(), resolveAssetUrl: vi.fn(),
    }), { wrapper: ({ children }) => <VideoEditorRuntimeProvider value={runtime}>{children}</VideoEditorRuntimeProvider> });
    const trackId = 'V2';
    act(() => {
      if (kind.startsWith('drop')) assets.result.current.handleAssetDrop('selected', trackId, 1, false, false, prepared);
      else {
        const service = kind.endsWith('read-only') ? createTimelineCommands({ getState: () => ({ availability: { mounted: true } }) } as unknown as TimelineStoreApi,
          { timelineEditability: { checkTimeline: () => ({ allowed: false, reason: 'timeline_read_only' }) } }) : mountedCommandsFor(h);
        expect(service.addClip({ preparedAsset: prepared, trackId, time: 1 }).ok).toBe(false);
      }
    });
    const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
    if (evidence) writeFileSync(path.join(evidence, `media-guard-${kind.replaceAll(' ', '-')}.json`), JSON.stringify({ sourceChanged: h.result.current.data !== before, editSeq: h.result.current.editSeqRef.current, historyCalls: history.mock.calls.length, requests: h.requests, compatibilityRequests: h.compatibilityRequests }, null, 2));
    expect(h.result.current.data).toBe(before); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(history).not.toHaveBeenCalled(); expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]);
    assets.unmount(); h.unmount();
  });
});


describe('mounted existing-source literal ripple native history', () => {
  it('binds one allocated clone and ordered follower nudges to one receipt/inverse/Redo', async () => {
    const base = await selectedMoveData();
    const initial = await buildTimelineData({ ...base.config, clips: [
      { ...base.config.clips[0], asset: 'copy-source', hold: 1 },
      { ...base.config.clips[1], at: 3 },
      { id: 'clip-3', at: 5, hold: 1, clipType: 'hold', track: 'V1', app: { opaque: null } },
      { id: 'other-track', at: 0, hold: 0.5, clipType: 'hold', track: 'V2' },
    ] }, { assets: { 'copy-source': { file: 'copy.png', type: 'image/png', duration: 5 } } }, undefined, 1, undefined, base.head);
    const requests: CommitRequest[] = []; let source!: ReturnType<typeof selectedMoveSource>;
    const h = await setup(async request => {
      requests.push(request); source = selectedMoveSource(initial, requests);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, 'duplicate-ripple-native.json'), JSON.stringify({ requests: h.requests, source }, null, 2));
      return { directWrites: source.plans.at(-1)!.writes };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => expect(mountedCommandsFor(h).addClip({ assetId: 'copy-source', afterClipId: 'clip-1' }).ok).toBe(true));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const forward = h.requests[0].request;
    expect(forward).toMatchObject({ base_revision_id: 'parent-r1', source: { via: 'app' } });
    expect(forward.change.commands.map(call => call.op)).toEqual(['timeline.add', 'clip.nudge', 'clip.nudge']);
    expect(forward.change.commands[0]).toMatchObject({ select: null, args: { from: 'parent/clip:clip-1', at: 2 },
      expect: { 'parent/clip:clip-1::': { state: 'present', value: initial.config.clips[0] } } });
    expect(forward.change.commands[0].expect!['parent/clip:clip-1::clip_order']).toEqual({ state: 'present', value: initial.config.clips.map(clip => `parent/clip:${clip.id}`) });
    expect(forward.change.commands.slice(1)).toMatchObject(['clip-2', 'clip-3'].map(id => ({ select: `parent/clip:${id}`, args: { frames: 30 },
      expect: { at: { state: 'present', value: initial.config.clips.find(clip => clip.id === id)!.at }, 'app.astrid.on': { state: 'absent' }, 'app.astrid.until': { state: 'absent' } } })));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(source.documents[1]).toEqual(source.before); expect(source.documents[2]).toEqual(source.documents[0]);
    expect(source.journal).toBe(3); expect(source.reload).toBe(true); expect(h.requests).toHaveLength(3); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});

// Caller proof: the production drag handler, captured-base scheduler and native
// publication history run together; D supplies the accepted receipts and state.
function groupTransferSource(initial: TimelineData, requests: CommitRequest[]) {
  const python = process.env.ASTRID_TEST_PYTHON;
  if (!python) throw new Error('Set ASTRID_TEST_PYTHON to the qualified SDK test interpreter');
  return JSON.parse(execFileSync(python, ['-B', path.resolve(process.cwd(), 'src/tools/video-editor/hooks/shotGroupTransfer.fixture.py')], {
    input: JSON.stringify({ config: initial.config, registry: initial.registry, requests }), encoding: 'utf8', env: process.env,
  })) as { before: { parent: { config: Record<string, unknown> } }; results: CommitResult[]; result: CommitResult; replay: boolean[]; accept_counts: number[] };
}

async function transferGroupData(occurrence = false, video = false) {
  const base = await selectedMoveData(true, occurrence);
  const clips = (video ? base.config.clips.slice(0, 1) : base.config.clips).map(clip => {
    const identity = occurrence ? clip.app!.canonical as CanonicalClipIdentity : undefined;
    const source = { ...(identity?.sourceClip ?? clip) };
    if (!video) {
      delete source.from; delete source.to; delete source.speed;
      source.clipType = 'media'; source.hold = clip.id.endsWith('1') || clip.id === 'display-0' ? 2 : 1;
      source.asset = 'retained-image';
    }
    return { ...clip, ...(!video ? { clipType: 'media' as const, hold: source.hold as number, from: undefined, to: undefined, speed: undefined, asset: 'retained-image' } : {}),
      ...(identity ? { app: { ...clip.app, canonical: { ...identity, sourceClip: source } } } : {}) };
  });
  if (video) {
    clips[0] = { ...clips[0], asset: 'retained-video' };
    if (occurrence) {
      const identity = clips[0].app!.canonical as CanonicalClipIdentity;
      clips[0].app = { ...clips[0].app, canonical: { ...identity, sourceClip: { ...identity.sourceClip, asset: 'retained-video' } } };
    }
  }
  const scope = occurrence ? 'occurrence:occ-A' : 'parent';
  const members = clips.map(clip => `${scope}/clip:${occurrence ? (clip.app!.canonical as CanonicalClipIdentity).sourceClipId : clip.id}`);
  const group = { shotId: 'shot-1', trackId: 'V1', clipIds: clips.map(clip => clip.id),
    mode: video ? 'video' as const : 'images' as const, name: 'Retained director’s group',
    videoAssetKey: 'retained-video', memberSelectors: [...members].reverse(),
    ...(occurrence ? { ownerOccurrenceId: 'occ-A' } : {}),
    opaque: { nullValue: null, nested: [{ track: 'V1', untouched: true }] },
    imageClipSnapshot: video ? [{ clipId: 'dormant', assetKey: 'retained-image', track: 'V1', at: 1,
      meta: { clipType: 'hold' as const, hold: 1 }, opaque: { retained: null },
      authoring: { selector: `${scope}/clip:dormant`, order: ['dormant'],
        clip: { id: 'dormant', track: 'V1', at: 1, hold: 1, clipType: 'media', asset: 'retained-image' } } }] : [],
  };
  // Retain collection position and deliberately reverse stored member order;
  // the drag planner's resulting order must supply the transfer permutation.
  group.clipIds.reverse();
  return buildTimelineData({ ...base.config, clips, pinnedShotGroups: [
    { shotId: 'neighbor-before', trackId: 'V2', clipIds: [], name: 'Before' }, group,
    { shotId: 'neighbor-after', trackId: 'V2', clipIds: [], name: 'After' },
  ] }, { assets: { ...base.registry.assets, 'retained-video': { media_id: `sha256:${'d'.repeat(64)}`, type: 'video/mp4', duration: 10 }, 'retained-image': { media_id: `sha256:${'e'.repeat(64)}`, type: 'image/png' } } }, undefined, 1, undefined, base.head);
}

function transferGroupDrag(h: Awaited<ReturnType<typeof setup>>, lane: 'existing' | 'new' | 'same' = 'existing',
  applyEdit = h.result.current.applyEdit, sessionPatch: Partial<InternalDragSession> = {}) {
  const data = h.result.current.data!;
  const actions = data.rows.find(row => row.id === 'V1')!.actions;
  const session = { clipId: actions[0].id, draggedClipIds: actions.map(action => action.id), sourceRowId: 'V1', sourceKind: 'visual',
    transactionId: 'group-transfer-drag', groupDragEntry: { groupKey: { shotId: 'shot-1', trackId: 'V1' }, originStart: actions[0].start, originTrackId: 'V1' },
    clipOffsets: actions.map(action => ({ clipId: action.id, rowId: 'V1', deltaTime: action.start - actions[0].start, initialStart: action.start, initialEnd: action.end })),
  } as InternalDragSession;
  Object.assign(session, sessionPatch);
  act(() => commitDraggingSession({ session, liveData: data, nextStart: actions[0].start + 0.3, crossTrackActive: lane !== 'same',
    dropPosition: { trackId: lane === 'existing' ? 'V2' : undefined, isNewTrack: lane === 'new', isNewTrackTop: false, isReject: false } as never,
    callbacks: { ...h.result.current.tracks, applyEdit, selectClip: vi.fn(), selectClips: vi.fn() },
  }));
}

describe('pinned group transfer App caller', () => {
  it.each(['parent images', 'parent video', 'occurrence images', 'occurrence video', 'new lane', 'lost response'] as const)(
    '%s uses D accepted receipts with native Undo Redo and exact replay', async kind => {
      const initial = await transferGroupData(kind.startsWith('occurrence'), kind.endsWith('video'));
      const requests: CommitRequest[] = []; let proof!: ReturnType<typeof groupTransferSource>;
      const h = await setup(async request => {
        requests.push(request); proof = groupTransferSource(initial, requests);
        if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `group-transfer-${kind.replaceAll(' ', '-')}.json`), JSON.stringify({ requests, proof }, null, 2));
        return { acceptedResult: proof.result, loseSuccess: kind === 'lost response' && requests.length === 1 };
      }, false, initial);
      const history = renderHook(() => {
        const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
        useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
      }, { wrapper: overlapHistoryWrapper(h) });
      transferGroupDrag(h, kind === 'new lane' ? 'new' : 'existing');
      expect(gestureCommandsFor(h.result.current.data!)).toBeDefined();
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
      const scope = kind.startsWith('occurrence') ? 'occurrence:occ-A' : 'parent';
      const members = initial.config.clips.map(clip => `${scope}/clip:${scope === 'parent' ? clip.id : (clip.app!.canonical as CanonicalClipIdentity).sourceClipId}`);
      const destination = kind === 'new lane' ? 'V3' : 'V2';
      const forward = (requests[0].change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands;
      expect(forward.map(call => call.op)).toEqual([...(kind === 'new lane' ? ['timeline.add'] : []), 'shot-group.set', ...members.map(() => 'clip.nudge')]);
      expect(forward.filter(call => call.op === 'clip.nudge').map(call => call.args.frames)).toEqual(members.map(() => 9));
      expect([...__getSelectionStateForTests().timeline.selectedClipIds]).toEqual(initial.config.clips.map(clip => clip.id));
      expect(h.result.current.data!.config.clips.map(clip => clip.id)).toEqual(initial.config.clips.map(clip => clip.id));
      expect(h.result.current.data!.config.pinnedShotGroups![1]).toMatchObject({ trackId: destination,
        clipIds: initial.config.clips.map(clip => clip.id), memberSelectors: members,
        opaque: { nullValue: null, nested: [{ track: 'V1', untouched: true }] } });
      expect(forward.find(call => call.op === 'shot-group.set')).toEqual({ op: 'shot-group.set', select: null,
        args: { group: { shotId: 'shot-1', trackId: 'V1' }, intent: 'transfer', target: `${scope}/track:${destination}`, members } });
      expect(requests[0]).toMatchObject({ base_revision_id: 'parent-r1', scope: { target: 'parent' }, source: { via: 'app' } });
      expect(proof.results[0].shot_groups).toEqual([{ operation_index: kind === 'new lane' ? 1 : 0,
        group: { shotId: 'shot-1', trackId: destination }, reused: members, created: [], restored: [] }]);
      expect(proof.results[0].change.direct_writes.some(write => write.id.startsWith('parent/shot-group:'))).toBe(true);
      for (const member of members) expect(proof.results[0].id_map[member]).toBe(member);
      const moved = (proof.results[0].canonical_document as unknown as typeof proof.before).parent.config.pinnedShotGroups as Array<Record<string, unknown>>;
      const original = initial.config.pinnedShotGroups!;
      expect(moved.map(row => row.shotId)).toEqual(original.map(row => row.shotId));
      expect(moved[1]).toMatchObject({ name: original[1].name, mode: original[1].mode, videoAssetKey: original[1].videoAssetKey,
        opaque: { nullValue: null, nested: [{ track: 'V1', untouched: true }] }, trackId: destination, clipIds: members.map(id => id.split('/clip:')[1]) });
      if (kind.endsWith('video')) expect(moved[1].imageClipSnapshot).toEqual([{
        ...original[1].imageClipSnapshot![0], track: destination,
        authoring: { ...original[1].imageClipSnapshot![0].authoring,
          clip: { ...original[1].imageClipSnapshot![0].authoring!.clip, track: destination } },
      }]);
      await waitFor(() => expect(history.result.current.canUndo).toBe(true));
      act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
      await waitFor(() => expect(history.result.current.canRedo).toBe(true));
      act(() => history.result.current.redo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 60_000 });
      expect(proof.results[1].canonical_document).toEqual(proof.before);
      expect(proof.results[2].canonical_document).toEqual(proof.results[0].canonical_document);
      expect(proof.accept_counts).toEqual([1, 1, 1]);
      expect(requests.slice(kind === 'lost response' ? 2 : 1).map(request => request.base_revision_id)).toEqual(['parent-r2', 'parent-r3']);
      expect(requests.at(-2)!.change).toEqual({ commands: [{ op: 'timeline.inverse', select: null,
        args: { publication: 'pub-parent-r2', writes: proof.results[0].change.direct_writes.map(write => ({ ...write, before: write.after, after: write.before,
          ...(write.id.startsWith('parent/shot-group:') ? { order: Object.values(proof.results[0].change.commands.find(call => call.op === 'shot-group.set')!.expect!).find(state => state.state === 'present' && Array.isArray(state.value) && state.value.every(id => typeof id === 'string' && id.startsWith('parent/shot-group:')) && state.value.length === 3)!.value } : {}) })) } }] });
      if (kind === 'lost response') { expect(proof.replay).toEqual([true]); expect(h.requests[0].bytes).toBe(h.requests[1].bytes); }
      expect(h.compatibilityRequests).toEqual([]);
      const evidence = process.env.E_SELECTED_MOVE_EVIDENCE_DIR;
      if (evidence) writeFileSync(path.join(evidence, `group-transfer-${kind.replaceAll(' ', '-')}.json`), JSON.stringify({ requests: h.requests, proof }, null, 2));
      history.unmount(); h.unmount();
    }, 180_000);
});

describe('pinned group transfer guards', () => {
  it.each(['target collision', 'incomplete selection', 'mixed scope', 'stale pin', 'relation', 'sequence', 'bed', 'extra selected clip'] as const)(
    '%s retains the compatibility boundary without submitting a partial transfer', async kind => {
      const initial = await transferGroupData(['mixed scope', 'stale pin'].includes(kind));
      if (kind === 'target collision') initial.config.pinnedShotGroups!.push({ shotId: 'shot-1', trackId: 'V2', clipIds: [] });
      if (kind === 'mixed scope') (initial.config.clips[1].app!.canonical as CanonicalClipIdentity).occurrenceId = 'occ-B';
      if (kind === 'stale pin') (initial.config.clips[1].app!.canonical as CanonicalClipIdentity).revisionId = 'stale-shot';
      if (kind === 'relation' || kind === 'sequence') initial.config.clips[0].app!.astrid = kind === 'relation' ? { on: 'clip-end "parent/clip:clip-2"' } : { sequence: 'seq-1' };
      if (kind === 'bed') initial.config.app = { ...initial.config.app, astrid: { music_beds: {} } };
      const h = await setup(undefined, false, initial); const apply = vi.fn();
      const ids = initial.rows.find(row => row.id === 'V1')!.actions.map(action => action.id);
      transferGroupDrag(h, 'existing', apply, kind === 'incomplete selection' ? { draggedClipIds: ids.slice(0, 1) }
        : kind === 'extra selected clip' ? { draggedClipIds: [...ids, 'missing'] } : {});
      expect(apply).toHaveBeenCalledTimes(1); expect(apply.mock.calls[0][1].editCommands).toBeUndefined();
      expect(h.requests).toEqual([]); expect(h.result.current.editSeqRef.current).toBe(0); h.unmount();
    });
  it.each(['read-only', 'locked member', 'locked destination'] as const)('%s refuses the complete batch before save or history', async kind => {
    const initial = await transferGroupData();
    const editability = createTimelineEditability(kind === 'read-only' ? { readOnly: true }
      : kind === 'locked member' ? { lockedClipIds: ['clip-2'] } : { lockedTrackIds: ['V2'] });
    const h = await setup(undefined, false, initial, 1, editability); const history = vi.fn(); h.eventBus.on('beforeCommit', history);
    transferGroupDrag(h);
    expect(h.result.current.data).toBe(initial); expect(h.requests).toEqual([]); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(history).not.toHaveBeenCalled(); h.unmount();
  });
});


describe('W13 fade native history', () => {
  it('keeps Undo unavailable until a genuine receipt arrives', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const h = await setup(async () => { await pending; return 'no_change'; });
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    try {
      act(() => h.result.current.editing.handleSelectedClipChange({ entrance: { type: 'fade', duration: 0.4 } }));
      expect(history.result.current.canUndo).toBe(false);
      expect(history.result.current.canRedo).toBe(false);
    } finally {
      release();
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      history.unmount(); h.unmount();
    }
  });
});

describe('W29 direct transition receipt history', () => {
  it('actual inspector assignment waits for a direct receipt before native Undo', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const h = await setup(async request => {
      await held;
      const call = (request.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands[0];
      return { directWrites: ['elementRef', 'transition'].map(field => ({
        id: call.select!, path: field, before: { state: 'absent' as const }, after: { state: 'present' as const, value: call.args[field] },
      })) };
    }, false, await adjacentTransitionData(), 1, undefined, transitionHost(), 'after');
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => h.result.current.editing.handleSelectedClipChange({
      transition: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 },
      elementRef: { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition', packId: 'rendering' },
    }));
    expect(gestureCommandsFor(h.result.current.data!)?.[0].op).toBe('clip.set-transition');
    expect(history.result.current.canUndo).toBe(false);
    act(() => h.eventBus.emit('nativeRegistrationAccepted', { ...h.result.current.data! }, {
      op: 'timeline.inverse', select: null, args: { publication: 'foreign-publication', writes: [{
        id: 'parent/clip:after', path: 'transition', before: { state: 'present', value: null }, after: { state: 'absent' },
      }] },
    }));
    expect(history.result.current.canUndo).toBe(false);
    await act(async () => { release(); });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    history.unmount(); h.unmount();
  });
});

function fadeSource(initial: TimelineData, requests: CommitRequest[], variant?: 'stale' | 'refused') {
  return JSON.parse(execFileSync(process.env.ASTRID_TEST_PYTHON!, ['-B', path.resolve(process.cwd(), 'src/tools/video-editor/hooks/fadeHistory.fixture.py')], {
    input: JSON.stringify({ config: initial.config, registry: initial.registry, requests, variant }), encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  })) as ReturnType<typeof groupTransferSource>;
}

async function fadeHistoryData(occurrence: boolean, effects: 'absent' | 'null' | 'object', phaseObject = false) {
  const base = await initialData();
  const clips = base.config.clips.map(clip => {
    const source = { ...clip, app: { clipSentinel: true },
      ...(clip.id === 'clip-1' ? {
        ...(effects === 'absent' ? {} : { effects: effects === 'null' ? null : { fade_in: null, fade_out: 0.2, opaque: { nested: [null, {}] } } }),
        ...(effects === 'object' ? { entrance: phaseObject ? { type: 'fade', duration: 0.4, opaque: { keep: null } } : null, exit: { type: 'slide', duration: 0.2, opaque: [null, {}] } } : {}),
      } : {}),
    };
    if (!occurrence) return source;
    return { ...source, id: `projected-${clip.id}`, app: { ...source.app, canonical: {
      projectId: 'gesture-project', parentDocumentId: 'gesture-timeline', headRevisionId: 'parent-r1',
      occurrenceId: 'occ-A', shotId: 'A', revisionId: 'shot-r1', internalTimelineRevisionId: 'internal-r1',
      sourceClipId: clip.id, outputIdentity: 'output-A', sourceClip: source,
    } } };
  });
  return buildTimelineData({ ...base.config, clips } as never, base.registry, undefined, 1, undefined, base.head);
}

function fadeReadback(initial: TimelineData, proof: ReturnType<typeof fadeSource>): TimelineData['config'] {
  const document = proof.result.canonical_document as unknown as typeof proof.before;
  const parent = document.parent as { config: TimelineData['config']; clips: TimelineData['config']['clips'] };
  const clips = initial.config.clips.map(clip => {
    const identity = clip.app?.canonical as CanonicalClipIdentity | undefined;
    if (!identity) return parent.clips.find(row => row.id === clip.id)!;
    const source = ((document as unknown as { shots: Record<string, { internal_timeline: { clips: TimelineData['config']['clips'] } }> }).shots.A.internal_timeline.clips).find(row => row.id === identity.sourceClipId)!;
    return { ...source, id: clip.id, app: { ...source.app, canonical: { ...identity, sourceClip: source } } };
  });
  return { ...parent.config, clips };
}

function mountFadeHistory(h: Awaited<ReturnType<typeof setup>>) {
  return renderHook(() => {
    const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
    useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
  }, { wrapper: overlapHistoryWrapper(h) });
}

describe('W13 fade SDK native chain', () => {
  it.each([
    ['parent absent', false, 'absent', 'set'], ['parent null', false, 'null', 'set'],
    ['parent object clear', false, 'object', 'clear'], ['occurrence object', true, 'object', 'set'],
    ['occurrence null', true, 'null', 'set'], ['parent both', false, 'absent', 'both'],
  ] as const)('%s accepts actual App forward Undo Redo requests with exact authored readback', async (name, occurrence, effects, mode) => {
    const initial = await fadeHistoryData(occurrence, effects, mode === 'clear');
    const requests: CommitRequest[] = []; let proof!: ReturnType<typeof fadeSource>;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const h = await setup(async request => {
      requests.push(request);
      if (requests.length === 1) await pending;
      if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `fade-attempt-${name.replaceAll(' ', '-')}.json`), JSON.stringify({initial, requests}, null, 2));
      proof = fadeSource(initial, requests);
      return { acceptedResult: proof.result, readbackConfig: fadeReadback(initial, proof) };
    }, false, initial, 1, undefined, undefined, initial.config.clips[0].id);
    const history = mountFadeHistory(h);
    const patch = mode === 'clear' ? { entrance: undefined } : { entrance: { type: 'fade', duration: 0.37 },
      ...(mode === 'both' ? { exit: null } : {}) };
    act(() => h.result.current.editing.handleSelectedClipChange(patch));
    expect(history.result.current.canUndo).toBe(false);
    act(() => history.result.current.undo());
    release();
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    const select = occurrence ? 'occurrence:occ-A/clip:clip-1' : 'parent/clip:clip-1';
    expect(requests[0].change).toEqual({ commands: [{ op: 'clip.set-fade', select, resolved: [select],
      args: mode === 'clear' ? { clear: ['fade_in'] } : { fade_in: 0.37, ...(mode === 'both' ? { fade_out: null } : {}) },
      expect: gestureCommandsFor(h.result.current.data!)![0].expect,
    }] });
    expect(proof.results[0].status).toBe('accepted');
    expect(proof.results[0].change.direct_writes.every(write => write.id === select && ['effects', 'effects.fade_in', 'effects.fade_out', 'entrance', 'exit'].includes(write.path))).toBe(true);
    expect(h.getCurrentConfig()).toEqual(fadeReadback(initial, proof));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    // A poll/remote update must retain receipt-owned history, including while
    // Undo/Redo changes the owner. Runtime still checks the inverse publication.
    act(() => history.result.current.onRemoteData(initial, h.result.current.data!));
    expect(history.result.current.canUndo).toBe(true);
    act(() => history.result.current.undo());
    expect(history.result.current.canRedo).toBe(false);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    expect(proof.results[1].canonical_document).toEqual(proof.before);
    expect(h.getCurrentConfig()).toEqual(fadeReadback(initial, proof));
    act(() => history.result.current.onRemoteData(initial, h.result.current.data!));
    expect(history.result.current.canRedo).toBe(true);
    act(() => history.result.current.redo());
    expect(history.result.current.canUndo).toBe(false);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 60_000 });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    expect(proof.results[2].canonical_document).toEqual(proof.results[0].canonical_document);
    expect(h.getCurrentConfig()).toEqual(fadeReadback(initial, proof));
    for (const [index, previous] of proof.results.slice(0, 2).entries()) {
      expect(requests[index + 1].change).toEqual({ commands: [{ op: 'timeline.inverse', select: null,
        args: { publication: previous.accepted_publication_id,
          writes: previous.change.direct_writes.map(write => ({ ...write, before: write.after, after: write.before })) },
      }] });
    }
    expect(requests.map(request => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(proof.accept_counts).toEqual([1, 1, 1]);
    expect(h.readbackHeads).toEqual(['parent-r2', 'parent-r3', 'parent-r4']);
    expect(h.compatibilityRequests).toEqual([]);
    if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `fade-${name.replaceAll(' ', '-')}.json`), JSON.stringify({ requests: h.requests, proof, readback: h.getCurrentConfig() }, null, 2));
    history.unmount(); h.unmount();
  }, 180_000);
});

async function transitionSource(initial: TimelineData, requests: CommitRequest[], trackAuthority?: 'flat' | 'canonical' | 'dual') {
  const python = process.env.ASTRID_TEST_PYTHON;
  if (!python) throw new Error('Set ASTRID_TEST_PYTHON to the qualified SDK test interpreter');
  // Keep Vitest's worker responsive while the exact SDK runs; synchronous
  // commits can starve its RPC acknowledgements even when every assertion passes.
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(python, ['-B', path.resolve(process.cwd(), 'src/tools/video-editor/hooks/transitionAssignment.fixture.py')], {
      encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024,
    }, (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout));
    child.stdin!.end(JSON.stringify({ config: initial.config, registry: initial.registry, requests, track_authority: trackAuthority }));
  });
  return JSON.parse(output) as ReturnType<typeof groupTransferSource>;
}

function transitionReference() {
  const python = process.env.ASTRID_TEST_PYTHON;
  if (!python) throw new Error('Set ASTRID_TEST_PYTHON to the qualified SDK test interpreter');
  return JSON.parse(execFileSync(python, ['-B', path.resolve(process.cwd(), 'src/tools/video-editor/hooks/transitionAssignment.fixture.py'), '--reference'], {
    encoding: 'utf8', env: process.env,
  })) as { id: string; revision: string; kind: 'transition'; packId: string };
}

function pinnedTransitionHost(reference: ReturnType<typeof transitionReference>): AstridElementHost {
  return { ...transitionHost(), descriptors: [{ ...reference, componentPath: 'transitions/cross-fade' }],
    resolveComponent: (id, kind, packId) => id === reference.id && kind === reference.kind && packId === reference.packId ? () => null : undefined };
}

describe('W29 actual inspector SDK receipt Undo Redo', () => {
  it.each(['absent assignment', 'null assignment', 'pinned update', 'legacy absent assignment', 'legacy null assignment'] as const)('%s retains exact SDK state and only admits receipt-backed history', async variant => {
    const legacy = variant.startsWith('legacy ');
    const kind = variant.replace('legacy ', '');
    const reference = { ...transitionReference(), opaqueReference: { keep: null } };
    const prior = { type: reference.id, revision: reference.revision, duration: 0.5, params: null, opaqueTransition: { keep: true } };
    const initial = await adjacentTransitionData(kind === 'absent assignment' ? {}
      : kind === 'null assignment' ? { transition: null, elementRef: null } : { transition: prior, elementRef: reference });
    const requests: CommitRequest[] = []; let proof!: Awaited<ReturnType<typeof transitionSource>>;
    const h = await setup(async request => {
      requests.push(request); proof = await transitionSource(initial, requests, legacy ? 'flat' : undefined);
      if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `w29-${variant.replaceAll(' ', '-')}.json`), JSON.stringify({ requests, proof }, null, 2));
      return { acceptedResult: proof.result };
    }, false, initial, 1, undefined, pinnedTransitionHost(reference), 'after');
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
      return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    act(() => editorReplaceTimelineSelection(['after', 'before']));
    const acknowledgements: unknown[] = [];
    const registrations: unknown[] = [];
    h.eventBus.on('nativeRegistrationAccepted', (owner, inverse) => acknowledgements.push({ inverse, commands: gestureCommandsFor(owner) }));
    h.eventBus.on('beforeCommit', (_data, options) => registrations.push({ ...options, nativeRegistrationOwner: Boolean(options.nativeRegistrationOwner) }));
    const selected = [...__getSelectionStateForTests().timeline.selectedClipIds];
    const next = { ...prior, duration: 0.731 };
    act(() => h.result.current.editing.handleSelectedClipChange({ transition: next, ...(kind === 'pinned update' ? {} : { elementRef: reference }) }));
    expect(isTransitionAssignmentBatch(gestureCommandsFor(h.result.current.data!) ?? [])).toBe(true);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `w29-ack-${variant.replaceAll(' ', '-')}.json`), JSON.stringify({ acknowledgements, registrations }, null, 2));
    expect(acknowledgements).toHaveLength(1);
    const forward = (requests[0].change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands;
    expect(proof.result.status, JSON.stringify(proof.result.error)).toBe('accepted');
    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({ op: 'clip.set-transition', select: 'parent/clip:after', resolved: ['parent/clip:after'],
      args: { transition: next, elementRef: reference, ...(kind === 'pinned update' ? {} : { from_clip: 'parent/clip:before' }) } });
    expect(proof.results[0].change.direct_writes.map(row => [row.id, row.path])).toEqual(kind === 'pinned update'
      ? [['parent/clip:after', 'transition']] : [['parent/clip:after', 'elementRef'], ['parent/clip:after', 'transition']]);
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    act(() => history.result.current.onRemoteData(initial, h.result.current.data!));
    expect(history.result.current.canUndo).toBe(true);
    act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
    if (kind === 'pinned update') {
      // e9 includes W13's complete parent inverse promotion. Never derive this
      // from consequences or a document diff; require the exact direct receipt.
      expect(proof.results[1].change.direct_writes).toEqual(('commands' in requests[1].change ? requests[1].change.commands[0].args.writes : undefined));
    }
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 60_000 });
    expect(proof.results[1].canonical_document).toEqual(proof.before);
    expect(proof.results[2].canonical_document).toEqual(proof.results[0].canonical_document);
    expect(requests.map(request => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(requests[1].change).toEqual({ commands: [{ op: 'timeline.inverse', select: null, args: { publication: 'pub-parent-r2',
      writes: proof.results[0].change.direct_writes.map(row => ({ ...row, before: row.after, after: row.before })) } }] });
    expect(requests[2].change).toEqual(requests[0].change);
    expect(proof.accept_counts).toEqual([1, 1, 1]);
    if (kind === 'absent assignment' && !legacy) {
      const stale = structuredClone(requests[0]);
      (stale.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands[0].expect!.transition = { state: 'present', value: null };
      const wrongPublication = structuredClone(requests[1]);
      (wrongPublication.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands[0].args.publication = 'foreign-publication';
      const late = structuredClone(requests[0]);
      (late.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands.push({ ...structuredClone(forward[0]), select: 'parent/clip:before', resolved: ['parent/clip:before'] });
      for (const [name, candidate, priorRequests] of [
        ['stale expectation', stale, []], ['wrong publication', wrongPublication, [requests[0]]], ['late batch refusal', late, []],
      ] as const) {
        const refused = await transitionSource(initial, [...priorRequests, candidate]);
        expect(['conflict', 'refused']).toContain(refused.result.status);
        expect(refused.result.accepted_publication_id).toBeNull();
        expect(refused.result.change.direct_writes).toEqual([]);
        expect(transitionAssignmentInverse('commands' in candidate.change ? candidate.change.commands : [], refused.result)).toBeUndefined();
        expect(refused.accept_counts).toHaveLength(priorRequests.length);
        if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `w29-sdk-${name.replaceAll(' ', '-')}.json`), JSON.stringify({ candidate, refused }, null, 2));
      }
    }
    expect(h.readbackHeads).toEqual(['parent-r2', 'parent-r3', 'parent-r4']);
    expect(h.result.current.data!.config.clips.map(clip => clip.id)).toEqual(initial.config.clips.map(clip => clip.id));
    expect([...__getSelectionStateForTests().timeline.selectedClipIds]).toEqual(selected);
    expect(h.result.current.data!.config.clips.find(clip => clip.id === 'after')).toMatchObject({ transition: next, elementRef: reference, params: { preserved: { nested: true } } });
    expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 180_000);
});


describe('W29 current D producer App requalification', () => {
  it.skipIf(!process.env.ASTRID_W29_CURRENT_PRODUCER)('current producer closes pinned-update and canonical-track App requalification cases', async () => {
    const reference = { ...transitionReference(), opaqueReference: { keep: null } };
    const prior = { type: reference.id, revision: reference.revision, duration: 0.5, params: null, opaqueTransition: { keep: true } };
    for (const scenario of ['pinned update', 'canonical tracks'] as const) {
      const initial = await adjacentTransitionData(scenario === 'pinned update'
        ? { transition: prior, elementRef: reference } : {});
      const requests: CommitRequest[] = []; let proof!: Awaited<ReturnType<typeof transitionSource>>;
      const h = await setup(async request => {
        requests.push(request);
        proof = await transitionSource(initial, requests, scenario === 'canonical tracks' ? 'canonical' : 'flat');
        return { acceptedResult: proof.result };
      }, false, initial, 1, undefined, pinnedTransitionHost(reference), 'after');
      const history = renderHook(() => {
        const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
        useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
        return state;
      }, { wrapper: overlapHistoryWrapper(h) });
      const next = { ...prior, duration: 0.731 };
      act(() => h.result.current.editing.handleSelectedClipChange({
        transition: next,
        ...(scenario === 'canonical tracks' ? { elementRef: reference } : {}),
      }));
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
      expect(proof.results[0].status).toBe('accepted');
      await waitFor(() => expect(history.result.current.canUndo).toBe(true));
      act(() => history.result.current.undo());
      await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
      expect(proof.results[1].canonical_document).toEqual(proof.before);
      expect(proof.results[1].change.direct_writes.map(row => row.path)).toContain('transition');
      await waitFor(() => expect(history.result.current.canRedo).toBe(true));
      act(() => history.result.current.redo());
      await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 60_000 });
      expect(proof.results[2].canonical_document).toEqual(proof.results[0].canonical_document);
      expect(requests.map(request => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
      expect(proof.accept_counts).toEqual([1, 1, 1]);
      expect(h.compatibilityRequests).toEqual([]);
      if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) {
        const name = scenario.replaceAll(' ', '-');
        writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `w29-current-${name}.json`), JSON.stringify({ requests, proof }, null, 2));
      }
      history.unmount(); h.unmount();
    }
  });
});

describe('W13 fade history guards', () => {
  it.each(['refused', 'stale', 'no_change', 'unacknowledged', 'wrong clip', 'extra path', 'duplicate path'] as const)('%s never arms history or submits a snapshot inverse', async kind => {
    const initial = await fadeHistoryData(false, 'absent');
    const h = await setup(async request => {
      if (kind === 'refused' || kind === 'stale' || kind === 'no_change') return kind;
      if (kind === 'unacknowledged') return;
      const proof = fadeSource(initial, [request]);
      expect(proof.result.status).toBe('accepted');
      const result = structuredClone(proof.result);
      const writes = result.change.direct_writes;
      if (kind === 'wrong clip') writes[0].id = 'parent/clip:clip-2';
      if (kind === 'extra path') writes.push({ ...writes[0], path: 'opacity' });
      if (kind === 'duplicate path') writes.push(structuredClone(writes[0]));
      if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `fade-tamper-source-${kind.replaceAll(' ', '-')}.json`), JSON.stringify({ request, proof, forged: result }, null, 2));
      return { acceptedResult: result, readbackConfig: fadeReadback(initial, proof) };
    });
    const history = mountFadeHistory(h);
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: { type: 'fade', duration: 0.37 } }));
    if (kind === 'refused' || kind === 'stale') await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    else await waitFor(() => expect(h.savedSeqRef.current === 1 || h.result.current.persistence.saveStatus === 'error').toBe(true), { timeout: 60_000 });
    expect(history.result.current.canUndo).toBe(false); expect(history.result.current.canRedo).toBe(false);
    act(() => history.result.current.undo()); act(() => history.result.current.redo());
    expect(h.requests).toHaveLength(1); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 60_000);
});

describe('W13 fade actual SDK boundaries', () => {
  it.each(['no_change', 'refused', 'stale'] as const)('%s uses the actual SDK result and creates no usable history', async kind => {
    let initial = await fadeHistoryData(kind === 'refused', 'absent');
    if (kind === 'no_change') initial = await buildTimelineData({ ...initial.config, clips: initial.config.clips.map((clip, index) => index ? clip : {
      ...clip, entrance: { type: 'fade', duration: 0.37 }, effects: { fade_in: 0.37 },
    }) }, initial.registry, undefined, 1, undefined, initial.head);
    let proof!: ReturnType<typeof fadeSource>;
    const h = await setup(async request => {
      proof = fadeSource(initial, [request], kind === 'no_change' ? undefined : kind);
      return { acceptedResult: proof.result, ...(kind === 'no_change' ? { readbackConfig: fadeReadback(initial, proof) } : {}) };
    }, false, initial, 1, undefined, undefined, initial.config.clips[0].id);
    const history = mountFadeHistory(h);
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: { type: 'fade', duration: 0.37 } }));
    if (kind === 'no_change') await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    else await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'), { timeout: 60_000 });
    expect(proof.result.status).toBe(kind === 'stale' ? 'refused' : kind);
    expect(proof.result.accepted_publication_id).toBeNull(); expect(proof.result.change.direct_writes).toEqual([]);
    expect(proof.accept_counts).toEqual([kind === 'no_change' ? 1 : 0]);
    expect(history.result.current.canUndo).toBe(false); expect(history.result.current.canRedo).toBe(false);
    act(() => history.result.current.undo()); act(() => history.result.current.redo());
    expect(h.requests).toHaveLength(1); expect(h.compatibilityRequests).toEqual([]);
    if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `fade-sdk-${kind}.json`), JSON.stringify({ requests: h.requests, proof }, null, 2));
    history.unmount(); h.unmount();
  }, 90_000);

  it('holds Redo when D156 omits an object-valued entrance direct write from the accepted Undo receipt', async () => {
    const initial = await fadeHistoryData(true, 'object', true);
    const requests: CommitRequest[] = []; let proof!: ReturnType<typeof fadeSource>;
    const h = await setup(async request => {
      requests.push(request); proof = fadeSource(initial, requests);
      return { acceptedResult: proof.result, readbackConfig: fadeReadback(initial, proof) };
    }, false, initial, 1, undefined, undefined, initial.config.clips[0].id);
    const history = mountFadeHistory(h);
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: { type: 'fade', duration: 0.37 } }));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true), { timeout: 60_000 });
    expect(proof.results[0].change.direct_writes.map(write => write.path)).toEqual(['effects.fade_in', 'entrance']);
    act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
    expect(proof.results[1].canonical_document).toEqual(proof.before);
    expect(proof.results[1].change.direct_writes.map(write => write.path)).toEqual(['effects.fade_in']);
    expect(history.result.current.canRedo).toBe(false);
    act(() => history.result.current.redo()); expect(h.requests).toHaveLength(2);
    expect(h.compatibilityRequests).toEqual([]);
    if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, 'fade-sdk-incomplete-phase-receipt.json'), JSON.stringify({ requests: h.requests, proof }, null, 2));
    history.unmount(); h.unmount();
  }, 120_000);
});

describe('W13 fade malformed caller', () => {
  it.each(['NaN', 'negative', 'wrong type', 'stale occurrence', 'malformed occurrence'] as const)('%s edits nothing and creates no history', async kind => {
    const initial = await fadeHistoryData(kind.includes('occurrence'), 'absent');
    if (kind === 'stale occurrence') (initial.config.clips[0].app!.canonical as CanonicalClipIdentity).headRevisionId = 'old';
    if (kind === 'malformed occurrence') delete (initial.config.clips[0].app!.canonical as Partial<CanonicalClipIdentity>).sourceClipId;
    const h = await setup(undefined, false, initial, 1, undefined, undefined, initial.config.clips[0].id);
    const history = mountFadeHistory(h);
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: { type: 'fade', duration:
      kind === 'NaN' ? Number.NaN : kind === 'negative' ? -1 : kind === 'wrong type' ? true as unknown as number : 0.37 } }));
    expect(h.result.current.data).toBe(initial); expect(h.result.current.editSeqRef.current).toBe(0);
    expect(history.result.current.canUndo).toBe(false); expect(history.result.current.canRedo).toBe(false);
    expect(h.requests).toEqual([]); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  });

});


describe('W13 fade legacy callback fallback', () => {
  it('preserves the whole legacy effects-array operation without a partial native fade', async () => {
    const base = await initialData();
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map((clip, index) => index ? clip : {
      ...clip, effects: [{ type: 'legacy-effect', opaque: { keep: null } }],
    }) } as never, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial, 1, undefined, undefined, 'clip-1', new Map(), undefined, false, catalogFadeFallback);
    const history = vi.fn(); const off = h.eventBus.on('beforeCommit', history);
    act(() => h.result.current.editing.handleSelectedClipChange({ entrance: { type: 'fade', duration: 0.4 } }));
    await waitFor(() => expect(h.compatibilityRequests).toHaveLength(1));
    expect(h.requests).toEqual([]);
    expect(h.result.current.data!.config.clips[0].effects).toEqual(initial.config.clips[0].effects);
    expect(h.result.current.data!.config.clips[0].entrance).toEqual({ type: 'fade', duration: 0.4 });
    expect(history).toHaveBeenCalledTimes(1); expect(history.mock.calls[0][1].nativeRegistrationOwner).toBeUndefined();
    off(); h.unmount();
  });
});


function trackReorderSource(initial: TimelineData, requests: CommitRequest[], mode = 'positive') {
  const python = process.env.ASTRID_TEST_PYTHON;
  if (!python) throw new Error('Set ASTRID_TEST_PYTHON to the qualified SDK test interpreter');
  return JSON.parse(execFileSync(python, ['-B', path.resolve(process.cwd(), 'src/tools/video-editor/hooks/trackReorder.fixture.py')], {
    input: JSON.stringify({ config: initial.config, registry: initial.registry, requests, mode }), encoding: 'utf8', env: process.env,
  })) as { before: { parent: { config: { tracks: Array<{ id: string }> } } }; results: CommitResult[]; result: CommitResult; replay: boolean[]; accept_counts: number[]; requests: CommitRequest[] };
}

async function trackReorderData() {
  const base = await initialData();
  return buildTimelineData({ ...base.config,
    tracks: [{ id: 'V1', kind: 'visual', app: { opaque: [null, false] } }, { id: 'A1', kind: 'audio' },
      { id: 'V2', kind: 'visual' }, { id: 'A4', kind: 'audio' }],
    clips: [{ id: 'retained', at: 0, hold: 1, clipType: 'hold', track: 'V1' }],
  }, base.registry, undefined, 1, undefined, base.head);
}

describe('W48 track-menu reorder native history', () => {
  it('uses D156 direct receipt, publication-bound Undo and original-command Redo at current revisions', async () => {
    const initial = await trackReorderData();
    const requests: CommitRequest[] = []; let proof!: ReturnType<typeof trackReorderSource>;
    const h = await setup(async request => {
      requests.push(request); proof = trackReorderSource(initial, requests);
      return { acceptedResult: proof.result };
    }, false, initial);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    const oldOrder = ['V1', 'A1', 'V2', 'A4'].map(id => `parent/track:${id}`);
    const newOrder = ['A1', 'V2', 'V1', 'A4'].map(id => `parent/track:${id}`);
    try {
      act(() => h.result.current.tracks.handleMoveTrack('V1', 'V2'));
      expect(history.result.current.canUndo).toBe(false);
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 120_000 });
      const forward = requests[0].change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] };
      expect(forward.commands).toEqual([{ op: 'timeline.reorder', select: oldOrder[0], resolved: [oldOrder[0]],
        args: { expected_order: oldOrder, order: newOrder }, expect: { [`${oldOrder[0]}::track_order`]: { state: 'present', value: oldOrder } } }]);
      const writes = [{ id: oldOrder[0], path: 'track_order', before: { state: 'present', value: oldOrder }, after: { state: 'present', value: newOrder } }];
      expect(proof.results[0].change.direct_writes).toEqual(writes);
      expect(proof.results[0].accepted_publication_id).toBe('pub-parent-r2');
      await waitFor(() => expect(history.result.current.canUndo).toBe(true));
      act(() => history.result.current.undo());
      await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 120_000 });
      expect(requests[1].change).toEqual({ commands: [{ op: 'timeline.inverse', select: null, args: { publication: 'pub-parent-r2',
        writes: writes.map(write => ({ ...write, before: write.after, after: write.before })) } }] });
      expect(proof.results[1].canonical_document).toEqual(proof.before);
      await waitFor(() => expect(history.result.current.canRedo).toBe(true));
      act(() => history.result.current.redo());
      await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 120_000 });
      expect(requests[2].change).toEqual(requests[0].change);
      expect(requests.map(request => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
      expect(proof.results[2].canonical_document).toEqual(proof.results[0].canonical_document);
      expect((proof.results[2].canonical_document as unknown as typeof proof.before).parent.config.tracks.map(row => `parent/track:${row.id}`)).toEqual(newOrder);
      expect(proof.replay).toEqual([true, true, true]); expect(proof.accept_counts).toEqual([1, 1, 1]);
      expect(h.compatibilityRequests).toEqual([]);
    } finally {
      if (process.env.E_W48_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W48_EVIDENCE_DIR, 'caller-sdk-history.json'), JSON.stringify({ requests, proof }, null, 2));
      history.unmount(); h.unmount();
    }
  }, 360_000);

  it.each(['stale', 'no_change'])('%s SDK receipt supplies no native Undo registration', async mode => {
    const initial = await trackReorderData(); let proof!: ReturnType<typeof trackReorderSource>;
    const h = await setup(async request => {
      proof = trackReorderSource(initial, [request], mode);
      return { acceptedResult: proof.result };
    }, false, initial);
    const accepted = vi.fn(); h.eventBus.on('nativeRegistrationAccepted', accepted);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    try {
      act(() => {
        if (mode === 'stale') h.result.current.tracks.handleMoveTrack('V1', 'V2');
        else h.result.current.applyEdit({ type: 'commands' }, {
          editCommands: reorderTrackGestureCommands(initial, 'V1', initial.config.tracks!)!,
        });
      });
      await waitFor(() => expect(proof).toBeDefined(), { timeout: 120_000 });
      expect(mode === 'stale' ? ['conflict', 'refused'] : ['no_change']).toContain(proof.result.status);
      expect(proof.result.change.direct_writes).toEqual([]);
      expect(proof.result.accepted_publication_id).toBeNull();
      if (mode === 'no_change') await waitFor(() => expect(accepted).toHaveBeenCalledWith(expect.anything(), null));
      else expect(accepted).not.toHaveBeenCalled();
      expect(history.result.current.canUndo).toBe(false);
      act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1);
    } finally {
      if (process.env.E_W48_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W48_EVIDENCE_DIR, `caller-sdk-${mode}.json`), JSON.stringify(proof, null, 2));
      history.unmount(); h.unmount();
    }
  }, 180_000);
});


describe('W48 malformed direct receipts never register native history', () => {
  it.each(['missing', 'extra', 'wrong identity', 'wrong order', 'malformed'])('%s stays unavailable for Undo', async kind => {
    const initial = await trackReorderData();
    const h = await setup(async request => {
      const command = (request.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands[0];
      const row = { id: command.select!, path: 'track_order', before: { state: 'present' as const, value: command.args.expected_order }, after: { state: 'present' as const, value: command.args.order } };
      const writes = kind === 'missing' ? [] : kind === 'extra' ? [row, { ...row, path: 'muted' }]
        : kind === 'wrong identity' ? [{ ...row, id: 'parent/track:A1' }]
          : kind === 'wrong order' ? [{ ...row, before: { state: 'present' as const, value: [...command.args.expected_order as string[]].reverse() } }]
            : [{ ...row, before: { state: 'absent' as const } }];
      return { directWrites: writes };
    }, false, initial);
    const accepted = vi.fn(); h.eventBus.on('nativeRegistrationAccepted', accepted);
    const history = renderHook(() => {
      const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
      useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
    }, { wrapper: overlapHistoryWrapper(h) });
    try {
      act(() => h.result.current.tracks.handleMoveTrack('V1', 'V2'));
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      expect(accepted).not.toHaveBeenCalled(); expect(history.result.current.canUndo).toBe(false);
      act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1);
      expect(h.compatibilityRequests).toEqual([]);
    } finally { history.unmount(); h.unmount(); }
  });
});


describe('W63 style-only native history', () => {
  it('actual updateClip waits for its accepted style inverse', async () => {
    const initial = await initialData();
    const h = await setup(async () => ({ directWrites: [{ id: 'parent/clip:clip-1', path: 'opacity', before: { state: 'present', value: 0.9 }, after: { state: 'present', value: 0 } }] }), false, initial);
    const native = vi.fn(); h.eventBus.on('nativeRegistrationAccepted', native);
    const before = vi.fn(); h.eventBus.on('beforeCommit', before);
    act(() => expect(mountedCommandsFor(h).updateClip({ clipId: 'clip-1', patch: { opacity: 0 } }).ok).toBe(true));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change.commands).toMatchObject([{ op: 'clip.set-look', args: { opacity: 0 } }]);
    expect(before.mock.calls[0][1].nativeRegistrationOwner).toBeDefined();
    expect(native).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ op: 'timeline.inverse' }));
    h.unmount();
  });
});

function lookStyleSource(initial: TimelineData, requests: CommitRequest[], stale = false) {
  return JSON.parse(execFileSync(process.env.ASTRID_TEST_PYTHON!, ['-B', path.resolve(process.cwd(), 'src/tools/video-editor/hooks/clipLookStyle.fixture.py')], {
    input: JSON.stringify({ config: initial.config, registry: initial.registry, requests, stale }), encoding: 'utf8', env: process.env,
  })) as { before: unknown; results: CommitResult[]; result: CommitResult; readback: unknown; accept_counts: number[] };
}
function lookStyleHistory(h: Awaited<ReturnType<typeof setup>>) {
  return renderHook(() => {
    const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
    useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
  }, { wrapper: overlapHistoryWrapper(h) });
}
async function lookStyleData() {
  const base = await selectedMoveData();
  return buildTimelineData({ ...base.config, clips: base.config.clips.map((clip, index) => index ? clip : { ...clip, cropTop: 0.1 }) }, base.registry, undefined, 1, undefined, base.head);
}
const lookStylePatch = { opacity: 0, volume: 0, cropTop: 0, cropBottom: 0.2, cropLeft: 0.3, cropRight: 0.4 };

describe('W63 style-only SDK history chain', () => {
  it('ordered six-field update is one receipt-owned action with exact Undo Redo and SDK replay/readback', async () => {
    const initial = await lookStyleData(); const requests: CommitRequest[] = [];
    let proof!: ReturnType<typeof lookStyleSource>;
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    const h = await setup(async request => {
      requests.push(request); proof = lookStyleSource(initial, requests);
      if (requests.length === 1) await held;
      if (process.env.E_W63_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W63_EVIDENCE_DIR, 'sdk-chain.json'), JSON.stringify({ requests, proof }, null, 2));
      return { acceptedResult: proof.result };
    }, false, initial);
    const history = lookStyleHistory(h); const native = vi.fn(); h.eventBus.on('nativeRegistrationAccepted', native);
    const before = vi.fn(); h.eventBus.on('beforeCommit', before);
    act(() => expect(mountedCommandsFor(h).updateClip({ clipId: 'clip-1', patch: lookStylePatch }).ok).toBe(true));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(history.result.current.canUndo).toBe(false); expect(native).not.toHaveBeenCalled();
    act(() => release()); await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    const forward = requests[0].change.commands;
    expect(forward.map(call => call.op)).toEqual(Array(6).fill('clip.set-look'));
    expect(forward.map(call => call.args)).toEqual([{ opacity: 0 }, { volume: 0 }, { crop_top: 0 }, { crop_bottom: 0.2 }, { crop_left: 0.3 }, { crop_right: 0.4 }]);
    expect(before).toHaveBeenCalledOnce();
    expect(proof.result.change.direct_writes).toHaveLength(6);
    expect(proof.result.change.direct_writes).toContainEqual({ id: 'parent/clip:clip-1', path: 'cropBottom', before: { state: 'absent' }, after: { state: 'present', value: 0.2 } });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    act(() => history.result.current.undo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo()); await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 60_000 });
    expect(requests).toHaveLength(3); expect(proof.accept_counts).toEqual([1, 1, 1]);
    expect(proof.results[1].canonical_document).toEqual(proof.before);
    expect(proof.readback).toEqual(proof.results[0].canonical_document);
    expect(requests[1].change.commands).toEqual([{ op: 'timeline.inverse', select: null, args: {
      publication: proof.results[0].accepted_publication_id,
      writes: proof.results[0].change.direct_writes.map(write => ({ ...write, before: write.after, after: write.before })),
    } }]);
    expect(requests[2].change.commands[0].args.publication).toBe(proof.results[1].accepted_publication_id);
    const beforeDocument = proof.before as { parent: { clips: Array<Record<string, unknown>> } };
    const afterDocument = proof.readback as typeof beforeDocument;
    expect(afterDocument.parent.clips[1]).toEqual(beforeDocument.parent.clips[1]);
    expect(afterDocument.parent.clips[0].app).toEqual(beforeDocument.parent.clips[0].app);
    expect(afterDocument.parent.clips[0].params).toEqual(beforeDocument.parent.clips[0].params);
    expect(h.compatibilityRequests).toEqual([]); history.unmount(); h.unmount();
  }, 180_000);

  it('one stale expectation rejects the entire six-field SDK transaction', async () => {
    const initial = await lookStyleData(); let proof!: ReturnType<typeof lookStyleSource>;
    const h = await setup(async request => {
      proof = lookStyleSource(initial, [request], true);
      if (process.env.E_W63_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W63_EVIDENCE_DIR, 'sdk-stale.json'), JSON.stringify(proof, null, 2));
      return { acceptedResult: proof.result };
    }, false, initial);
    const history = lookStyleHistory(h);
    act(() => expect(mountedCommandsFor(h).updateClip({ clipId: 'clip-1', patch: lookStylePatch }).ok).toBe(true));
    await waitFor(() => expect(proof?.result.status).toBe('refused'), { timeout: 60_000 });
    expect(proof.readback).toEqual(proof.before); expect(proof.result.change.direct_writes).toEqual([]);
    expect(history.result.current.canUndo).toBe(false); expect(h.savedSeqRef.current).toBe(0);
    history.unmount(); h.unmount();
  }, 60_000);

  it('SDK no-change removes its native owner without usable Undo', async () => {
    const initial = await lookStyleData(); let proof!: ReturnType<typeof lookStyleSource>;
    const h = await setup(async request => { proof = lookStyleSource(initial, [request]); return { acceptedResult: proof.result }; }, false, initial);
    const history = lookStyleHistory(h);
    act(() => expect(mountedCommandsFor(h).updateClip({ clipId: 'clip-1', patch: { opacity: 0.9 } }).ok).toBe(true));
    await waitFor(() => expect(proof?.result.status).toBe('no_change'), { timeout: 60_000 });
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(history.result.current.canUndo).toBe(false); expect(proof.result.accepted_publication_id).toBeNull();
    history.unmount(); h.unmount();
  }, 60_000);

  it.each(['missing', 'extra', 'malformed', 'wrong before', 'wrong after', 'duplicate'] as const)('%s receipt never enables native Undo', async kind => {
    const initial = await lookStyleData();
    const write = { id: 'parent/clip:clip-1', path: 'opacity', before: { state: 'present', value: 0.9 }, after: { state: 'present', value: 0 } };
    const writes: unknown[] = kind === 'missing' ? [] : kind === 'extra' ? [write, { ...write, path: 'volume' }]
      : kind === 'malformed' ? [{ ...write, before: { state: 'absent', value: null } }]
      : kind === 'wrong before' ? [{ ...write, before: { state: 'absent' } }]
      : kind === 'wrong after' ? [{ ...write, after: { state: 'present', value: 0.5 } }]
      : [write, write];
    const h = await setup(async () => ({ directWrites: writes as CommitResult['change']['direct_writes'] }), false, initial);
    const history = lookStyleHistory(h);
    act(() => expect(mountedCommandsFor(h).updateClip({ clipId: 'clip-1', patch: { opacity: 0 } }).ok).toBe(true));
    await waitFor(() => expect(h.requests).toHaveLength(1));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(history.result.current.canUndo).toBe(false);
    act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1);
    history.unmount(); h.unmount();
  });
});

// W64: the mounted tool, generated wire, exact D156 service and native stack.
function clipParamsSource(initial: TimelineData, requests: CommitRequest[], stale = false) {
  return JSON.parse(execFileSync(process.env.ASTRID_TEST_PYTHON!, ['-B', path.resolve(process.cwd(), 'src/tools/video-editor/hooks/clipParamsHistory.fixture.py')], {
    input: JSON.stringify({ config: initial.config, registry: initial.registry, requests, stale }), encoding: 'utf8', env: process.env,
  })) as { before: { parent: { clips: Array<{ params: Record<string, unknown> }> } }; results: CommitResult[]; result: CommitResult;
    readback: unknown; accept_counts: number[] };
}
function w64Commands(h: Awaited<ReturnType<typeof setup>>) {
  return createTimelineCommands({ getState: () => ({ data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
    ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true },
  }) } as unknown as TimelineStoreApi);
}
function w64History(h: Awaited<ReturnType<typeof setup>>) {
  return renderHook(() => {
    const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
    useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
  }, { wrapper: overlapHistoryWrapper(h) });
}
describe('W64 mounted params native history', () => {
  it('uses actual accepted params writes for one Undo and original ordered Redo batch', async () => {
    const base = await selectedMoveData();
    const retained = { nullable: null, opaque: [{ op: 'clear' }, { $absent: true }] };
    const initial = await buildTimelineData({ ...base.config, clips: base.config.clips.map(clip => clip.id === 'clip-1'
      ? { ...clip, params: { ...clip.params, retained } } : clip) }, base.registry, undefined, 1, undefined, base.head);
    const requests: CommitRequest[] = []; let proof!: ReturnType<typeof clipParamsSource>;
    const h = await setup(async request => {
      requests.push(request); proof = clipParamsSource(initial, requests);
      if (process.env.E_W64_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W64_EVIDENCE_DIR, 'params-chain.json'), JSON.stringify({ requests, proof }, null, 2));
      return { acceptedResult: proof.result };
    }, false, initial);
    const history = w64History(h);
    const params = { data: { op: 'clear', nested: [null, { opaque: true }] }, added: null, sibling: ['untouched', 7], retained };
    act(() => expect(w64Commands(h).setClipParams({ clipId: 'clip-1', params }).ok).toBe(true));
    expect(history.result.current.canUndo).toBe(false);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
    expect(requests[1].change).toEqual({ commands: [{ op: 'timeline.inverse', select: null, args: {
      publication: proof.results[0].accepted_publication_id,
      writes: proof.results[0].change.direct_writes.map(write => ({ ...write, before: write.after, after: write.before })),
    } }] });
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 60_000 });
    expect(requests[2].change).toEqual(requests[0].change);
    const forward = (requests[0].change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands;
    expect(forward.map(command => command.args.path)).toEqual(['data', 'added', 'sibling', 'retained']);
    expect(proof.results[0].change.direct_writes.map(write => write.path).sort()).toEqual(['params.added', 'params.data', 'params.sibling']);
    expect((proof.readback as typeof proof.before).parent.clips[0].params).toEqual(params);
    const beforeClip = proof.before.parent.clips[0];
    const afterClip = (proof.readback as typeof proof.before).parent.clips[0];
    expect({ ...afterClip, params: beforeClip.params }).toEqual(beforeClip);
    expect(requests.map(request => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(proof.results[1].canonical_document).toEqual(proof.before);
    expect(proof.results[2].canonical_document).toEqual(proof.results[0].canonical_document);
    expect(proof.readback).toEqual(proof.results[2].canonical_document);
    expect(proof.accept_counts).toEqual([1, 1, 1]); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 180_000);
  it('removes the pending native entry for an actual no-change receipt', async () => {
    const initial = await selectedMoveData(); let proof!: ReturnType<typeof clipParamsSource>;
    const h = await setup(async request => {
      proof = clipParamsSource(initial, [request]); return { acceptedResult: proof.result };
    }, false, initial);
    const history = w64History(h);
    act(() => expect(w64Commands(h).setClipParams({ clipId: 'clip-1', params: { data: null } }).ok).toBe(true));
    expect(history.result.current.canUndo).toBe(false);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    expect(proof.result.status).toBe('no_change'); expect(proof.result.change.direct_writes).toEqual([]);
    expect(history.result.current.canUndo).toBe(false); expect(history.result.current.canRedo).toBe(false);
    act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1);
    if (process.env.E_W64_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W64_EVIDENCE_DIR, 'params-no-change.json'), JSON.stringify({ requests: h.requests, proof }, null, 2));
    history.unmount(); h.unmount();
  }, 90_000);
  it('refuses the complete multi-key transaction when its later expectation is stale', async () => {
    const initial = await selectedMoveData(); let proof!: ReturnType<typeof clipParamsSource>;
    const h = await setup(async request => {
      proof = clipParamsSource(initial, [request], true); return { acceptedResult: proof.result };
    }, false, initial);
    const history = w64History(h);
    act(() => expect(w64Commands(h).setClipParams({ clipId: 'clip-1', params: { first: ['must roll back'], data: 'intended' } }).ok).toBe(true));
    await waitFor(() => expect(proof).toBeDefined(), { timeout: 60_000 });
    expect(proof.result.status).toBe('refused');
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(proof.accept_counts).toEqual([0]); expect(proof.result.change.direct_writes).toEqual([]);
    expect(proof.readback).toEqual(proof.before); expect(proof.before.parent.clips[0].params).toEqual({ data: 'intervening writer' });
    expect(h.savedSeqRef.current).toBe(0); expect(history.result.current.canUndo).toBe(false);
    act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1);
    if (process.env.E_W64_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W64_EVIDENCE_DIR, 'params-stale.json'), JSON.stringify({ requests: h.requests, proof }, null, 2));
    history.unmount(); h.unmount();
  }, 90_000);
  it.each(['missing', 'malformed', 'unexpected'] as const)('%s actual direct receipt writes never enable native Undo', async kind => {
    const initial = await selectedMoveData(); let proof!: ReturnType<typeof clipParamsSource>; let returned!: CommitResult;
    const h = await setup(async request => {
      proof = clipParamsSource(initial, [request]); returned = structuredClone(proof.result);
      if (kind === 'missing') returned.change.direct_writes = [];
      if (kind === 'malformed') delete (returned.change.direct_writes[0].before as Record<string, unknown>).state;
      if (kind === 'unexpected') returned.change.direct_writes.push({ ...returned.change.direct_writes[0], path: 'params.foreign' });
      return { acceptedResult: returned };
    }, false, initial);
    const history = w64History(h);
    act(() => expect(w64Commands(h).setClipParams({ clipId: 'clip-1', params: { data: 'accepted value', added: null } }).ok).toBe(true));
    await waitFor(() => expect(proof).toBeDefined(), { timeout: 60_000 });
    expect(proof.result.status).toBe('accepted'); expect(proof.accept_counts).toEqual([1]);
    await waitFor(() => expect(['saved', 'error']).toContain(h.result.current.persistence.saveStatus));
    expect(history.result.current.canUndo).toBe(false); act(() => history.result.current.undo());
    expect(h.requests).toHaveLength(1); expect(h.compatibilityRequests).toEqual([]);
    if (process.env.E_W64_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W64_EVIDENCE_DIR, `params-${kind}.json`), JSON.stringify({ requests: h.requests, proof, returned }, null, 2));
    history.unmount(); h.unmount();
  }, 90_000);
  it.each(['omission', 'dotted literal', 'explicit clear'] as const)('keeps %s on its existing caller route outside params native history', async kind => {
    const h = await setup(); const history = w64History(h);
    const params = kind === 'omission' ? {} : kind === 'dotted literal' ? { data: null, 'literal.key': 3 } : { data: undefined };
    act(() => expect(w64Commands(h).setClipParams({ clipId: 'clip-1', params }).ok).toBe(true));
    if (kind === 'explicit clear') expect(gestureCommandsFor(h.result.current.data!)?.[0].op).toBe('clip.clear');
    else expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
    history.unmount(); h.unmount();
  });

});

describe('W29 actual inspector receipt refusal boundaries', () => {
  it.each(['missing', 'extra', 'malformed', 'partial', 'stale', 'refused', 'no_change'] as const)(
    '%s receipt cannot enable native Undo or submit a snapshot', async kind => {
      let completed = false;
      const h = await setup(async request => {
        completed = true;
        if (kind === 'stale' || kind === 'refused' || kind === 'no_change') return kind;
        const call = (request.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands[0];
        const writes = ['elementRef', 'transition'].map(field => ({ id: call.select!, path: field,
          before: { state: 'absent' as const }, after: { state: 'present' as const, value: call.args[field] } }));
        if (kind === 'missing') return { directWrites: [] };
        if (kind === 'partial') return { directWrites: writes.slice(0, 1) };
        if (kind === 'extra') return { directWrites: [...writes, { ...writes[0], id: 'parent/clip:before' }] };
        return { directWrites: [{ ...writes[0], before: { state: 'absent', value: null } }, writes[1]] as never };
      }, false, await adjacentTransitionData(), 1, undefined, transitionHost(), 'after');
      const history = renderHook(() => {
        const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
        useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]); return state;
      }, { wrapper: overlapHistoryWrapper(h) });
      act(() => h.result.current.editing.handleSelectedClipChange({
        transition: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 },
        elementRef: { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition', packId: 'rendering' },
      }));
      expect(history.result.current.canUndo).toBe(false);
      await waitFor(() => expect(completed).toBe(true));
      if (!['stale', 'refused'].includes(kind)) await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      await act(async () => { await Promise.resolve(); });
      expect(history.result.current.canUndo).toBe(false);
      expect(history.result.current.canRedo).toBe(false);
      act(() => history.result.current.undo());
      expect(h.requests).toHaveLength(1);
      expect(h.compatibilityRequests).toEqual([]);
      history.unmount(); h.unmount();
    });
  it('existing bulk transition caller keeps its unsupported payload and fallback', async () => {
    const h = await setup(undefined, false, await adjacentTransitionData(), 1, undefined, transitionHost(), 'after');
    // The second clip has no predecessor: the whole operation must retain
    // compatibility even though its first member can map to the typed family.
    act(() => h.result.current.editing.handleUpdateClips(['after', 'before'], {
      transition: { type: 'crossfade', revision: 'sha256:crossfade-r1', duration: 0.5 },
      elementRef: { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition', packId: 'rendering' },
    }));
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    h.unmount();
  });
});

// W27 has its own selectors. The cheap caller group never invokes Python; the
// SDK group runs against the exact producer snapshot under current measured resource and lease coordination.
const w27Effect = { type: 'custom:orbit', intensity: 0.731, params: { enabled: false, opaque: [null, { literal: { $absent: true } }] }, opaque: { retained: null } };
const w27Catalog = {
  effects: [{ id: 'orbit', name: 'Orbit', category: 'continuous', parameterSchema: [{ name: 'enabled', label: 'Enabled parameter', type: 'boolean', default: true }] }],
  entrance: [], exit: [], continuous: [], canCreateEffect: true, canUpdateEffect: true,
};
w27Catalog.continuous = w27Catalog.effects as never;
async function w27Data(prior: 'absent' | 'null' | 'object' | 'mixed' = 'object', occurrence = false, sdkSafe = false) {
  const base = await initialData();
  const clips = base.config.clips.map((clip, index) => {
    const app = sdkSafe && index === 0
      ? Object.fromEntries(Object.entries(clip.app ?? {}).filter(([key]) => key !== 'astrid'))
      : clip.app;
    const source = {
      ...clip,
      ...(sdkSafe && index === 0 ? { app } : {}),
      ...(prior === 'absent' || prior === 'mixed' && index === 0 ? {} : { continuous: prior === 'null' ? null : { ...structuredClone(w27Effect), intensity: index ? 0.25 : 0.731 } }),
    };
    return occurrence ? { ...source, id: `projected-${clip.id}`, app: { ...source.app, canonical: {
      projectId: 'gesture-project', parentDocumentId: 'gesture-timeline', headRevisionId: 'parent-r1', occurrenceId: 'occ-A',
      shotId: 'A', revisionId: 'shot-r1', internalTimelineRevisionId: 'internal-r1', sourceClipId: clip.id, outputIdentity: 'output-A', sourceClip: source,
    } } } : source;
  });
  return buildTimelineData({ ...base.config, clips } as never, base.registry, undefined, 1, undefined, base.head);
}
async function w27SdkData(prior: 'absent' | 'null' | 'object' | 'mixed' = 'object', occurrence = false) {
  // The general integration seed carries an unrelated stale transcript pin on clip-1.
  // The real D reader correctly refuses it before these continuous-effect commands run.
  // Keep clipSentinel and all edited/opaque fields while dropping only that invalid pin.
  return w27Data(prior, occurrence, true);
}
type W27Action = 'type' | 'default' | 'params' | 'remove' | 'none' | 'saved' | 'intensity' | 'bulk type' | 'bulk clear';
async function w27Action(h: Awaited<ReturnType<typeof setup>>, action: W27Action) {
  const user = userEvent.setup();
  const initial = h.result.current.data!;
  const clip = initial.config.clips[0];
  const onChange = (patch: Parameters<typeof h.result.current.editing.handleSelectedClipChange>[0]) => h.result.current.editing.handleSelectedClipChange(patch);
  if (action === 'intensity') {
    // Neither mounted panel exposes an intensity widget. Preserve the supported
    // callback payload without manufacturing another UI control.
    act(() => onChange({ continuous: { ...clip.continuous!, intensity: 0.625 } }));
    return;
  }
  if (action.startsWith('bulk')) {
    const ids = initial.config.clips.map(c => c.id).reverse();
    render(<BulkClipPanelBody {...{
      clips: initial.config.clips, visibleTabs: ['effects'], activeTab: 'effects', setActiveTab: vi.fn(),
      compositionWidth: 1920, compositionHeight: 1080, sharedContinuous: null, sharedContinuousType: null,
      sharedEntranceType: null, sharedExitType: null, sharedTransitionType: null, sharedTransitionDuration: null,
      onChange: (patch: never) => h.result.current.editing.handleUpdateClips(ids, patch),
      onChangeDeep: (fn: never) => h.result.current.editing.handleUpdateClipsDeep(ids, fn),
      onClose: vi.fn(), onResetPosition: vi.fn(), onToggleMute: vi.fn(), effectResources: w27Catalog,
    } as never} />);
    const trigger = screen.getByText('Continuous').parentElement!.querySelector('[role="combobox"]')!;
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: action === 'bulk clear' ? 'None' : 'Orbit' }));
    return;
  }
  if (action === 'saved') {
    render(<ClipEffectsTab clip={clip as never} onChange={onChange} effectResources={w27Catalog as never}
      clipDescriptor={{ paramsSchema: { kind: 'opaque' } } as never} clipTypeResolution={{ status: 'unavailable' } as never} isEffectLayer={true}
      isSequenceClip={false} registry={{} as never} currentTime={0} creatorOpen={true} setCreatorOpen={vi.fn()}
      editingEffect={null} setEditingEffect={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Save W27 effect' }));
    return;
  }
  render(<ClipContinuousEffectField clip={clip as never} onChange={onChange} effectResources={w27Catalog as never}
    canEditEffects={false} setEditingEffect={vi.fn()} setCreatorOpen={vi.fn()} />);
  if (action === 'type' || action === 'none') {
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: action === 'none' ? 'None' : 'Orbit' }));
  } else if (action === 'params') await user.click(screen.getByTestId('schema-form-widget-enabled'));
  else await user.click(screen.getByRole('button', { name: action === 'remove' ? 'Remove' : 'Reset defaults' }));
}
const w27Actions: W27Action[] = ['type', 'default', 'params', 'remove', 'none', 'saved', 'intensity', 'bulk type', 'bulk clear'];
describe('W27 pure actual caller mapping', () => {
  it.each(w27Actions)('%s emits original caller intent without claiming synthetic acceptance', async action => {
    const initial = await w27Data(action === 'bulk type' ? 'mixed' : action === 'type' ? 'null' : 'object');
    const h = await setup(async () => 'refused', false, initial, 1, undefined, undefined, initial.config.clips[0].id);
    const history = mountFadeHistory(h);
    await w27Action(h, action);
    await waitFor(() => expect(h.requests).toHaveLength(1));
    const commands = (h.requests[0].request.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands;
    const clips = action.startsWith('bulk') ? [...initial.config.clips].reverse() : [initial.config.clips[0]];
    expect(commands.map(c => c.select)).toEqual(clips.map(c => `parent/clip:${c.id}`));
    expect(commands.every(c => c.op === 'clip.set-continuous')).toBe(true);
    expect(commands.map(c => c.expect!.continuous)).toEqual(clips.map(c => Object.prototype.hasOwnProperty.call(c, 'continuous') ? { state: 'present', value: c.continuous } : { state: 'absent' }));
    if (action === 'params') expect(commands[0].args).toEqual({ params: { enabled: true } });
    else if (['remove', 'none', 'bulk clear'].includes(action)) expect(commands.every(c => c.args.clear === true)).toBe(true);
    else {
      expect(commands.every(c => c.args.continuous)).toBe(true);
      if (action === 'default') expect(commands[0].args.continuous).toEqual({ ...w27Effect, params: { enabled: true } });
      if (action === 'intensity') expect(commands[0].args.continuous).toEqual({ ...w27Effect, intensity: 0.625 });
      if (action === 'type' || action === 'saved') expect(commands[0].args.continuous).toEqual({ type: 'custom:orbit', intensity: action === 'type' ? 0.5 : 0.731, params: { enabled: true } });
      if (action === 'bulk type') expect(commands.map(c => c.args.continuous)).toEqual([{ type: 'custom:orbit', intensity: 0.25, params: { enabled: true } }, { type: 'custom:orbit', intensity: 0.5, params: { enabled: true } }]);
    }
    expect(h.savedSeqRef.current).toBe(0); expect(history.result.current.canUndo).toBe(false);
    expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  });
  it.each(['missing', 'extra', 'duplicate', 'foreign', 'malformed'] as const)('%s synthetic receipt leaves acknowledgement and native history pending', async kind => {
    const initial = await w27Data();
    const h = await setup(async request => {
      const commands = (request.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands;
      const writes = commands.map(c => ({ id: c.select!, path: 'continuous', before: c.expect!.continuous, after: { state: 'absent' as const } }));
      if (kind === 'missing') writes.pop();
      if (kind === 'extra') writes.push({ ...writes[0], id: 'parent/clip:extra' });
      if (kind === 'duplicate') writes[1] = writes[0];
      if (kind === 'foreign') writes[1].id = 'occurrence:other/clip:clip-1';
      if (kind === 'malformed') writes[1].before = {} as never;
      return { directWrites: writes };
    }, false, initial);
    const history = mountFadeHistory(h); await w27Action(h, 'bulk clear');
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'));
    expect(h.savedSeqRef.current).toBe(0); expect(history.result.current.canUndo).toBe(false); expect(history.result.current.canRedo).toBe(false);
    act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1); history.unmount(); h.unmount();
  });
  it('adapts complete synthetic receipts to native Undo and the original ordered parent Redo batch', async () => {
    const initial = await w27Data();
    const h = await setup(async request => {
      const commands = (request.change as { commands: import('@/integrations/runtime/generated.ts').EditCommand[] }).commands;
      return { directWrites: commands[0].op === 'timeline.inverse' ? commands[0].args.writes as CommitResult['change']['direct_writes']
        : commands.map(c => ({ id: c.select!, path: 'continuous', before: c.expect!.continuous, after: { state: 'absent' as const } })) };
    }, false, initial);
    const history = mountFadeHistory(h); await w27Action(h, 'bulk clear');
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2));
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3));
    expect(h.requests[2].request.change).toEqual(h.requests[0].request.change);
    expect(h.requests.map(r => r.request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(h.compatibilityRequests).toEqual([]); history.unmount(); h.unmount();
  });
  it('keeps the complete bulk operation on fallback when a later value cannot map', async () => {
    const initial = await w27Data();
    const h = await setup(async () => 'refused', false, initial);
    act(() => h.result.current.editing.handleUpdateClipsDeep(['clip-2', 'clip-1'], meta => ({ continuous: meta.continuous?.intensity === 0.25 ? { ...w27Effect, intensity: 0.9 } : null } as never)));
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    h.unmount();
  });
});
async function w27Source(initial: TimelineData, requests: CommitRequest[], variant?: 'stale' | 'refused') {
  const input = JSON.stringify({ config: initial.config, registry: initial.registry, requests, variant });
  const digest = createHash('sha256').update(input).digest('hex');
  w27Evidence(`sdk-input-${digest}`, { input, source: process.env.ASTRID_CHECKOUT });
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile(process.env.ASTRID_TEST_PYTHON!, ['-B', path.resolve(process.cwd(), 'src/tools/video-editor/hooks/continuousHistory.fixture.py')], {
      encoding: 'utf8', env: process.env,
    }, (error, stdout, stderr) => {
      w27Evidence(`sdk-output-${digest}`, { stdout, stderr, error: error?.message });
      if (error) reject(error); else resolve(stdout);
    });
    child.stdin!.end(input);
  });
  return JSON.parse(stdout) as ReturnType<typeof fadeSource> & { readback: ReturnType<typeof fadeSource>['before'] };
}
function w27Evidence(name: string, value: unknown) {
  if (process.env.E_W27_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_W27_EVIDENCE_DIR, `${name.replaceAll(' ', '-')}.json`), JSON.stringify(value, null, 2));
}
describe('W27 SDK actual callers native chain', () => {
  it.each(w27Actions)('%s accepts one batch, receipt acknowledgement, whole-document Undo and original batch Redo', async action => {
    const initial = await w27SdkData(action === 'bulk type' ? 'mixed' : action === 'type' ? 'null' : 'object');
    const requests: CommitRequest[] = []; let proof!: Awaited<ReturnType<typeof w27Source>>;
    const h = await setup(async request => {
      requests.push(request); proof = await w27Source(initial, requests); w27Evidence(action, { requests, proof });
      return { acceptedResult: proof.result, readbackConfig: fadeReadback(initial, proof) };
    }, false, initial, 1, undefined, undefined, initial.config.clips[0].id);
    const history = mountFadeHistory(h);
    await w27Action(h, action);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    expect(proof.result.status).toBe('accepted');
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    expect(h.getCurrentConfig()).toEqual(fadeReadback(initial, proof));
    act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    expect(requests[1].change).toEqual({ commands: [{ op: 'timeline.inverse', select: null, args: {
      publication: proof.results[0].accepted_publication_id,
      writes: proof.results[0].change.direct_writes.map(w => ({ ...w, before: w.after, after: w.before })),
    } }] });
    act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 60_000 });
    expect(requests[2].change).toEqual(requests[0].change);
    expect(requests.map(r => r.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(proof.results[1].canonical_document).toEqual(proof.before);
    expect(proof.results[2].canonical_document).toEqual(proof.results[0].canonical_document);
    expect(proof.readback).toEqual(proof.results[2].canonical_document);
    expect(proof.accept_counts).toEqual([1, 1, 1]); expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 180_000);
  it.each(['absent', 'null', 'object'] as const)('preserves %s occurrence source values through acceptance and native history', async prior => {
    const initial = await w27SdkData(prior, true); const requests: CommitRequest[] = []; let proof!: Awaited<ReturnType<typeof w27Source>>;
    const h = await setup(async request => { requests.push(request); proof = await w27Source(initial, requests);
      w27Evidence(`occurrence-${prior}`, { requests, proof }); return { acceptedResult: proof.result, readbackConfig: fadeReadback(initial, proof) };
    }, false, initial, 1, undefined, undefined, initial.config.clips[0].id);
    const history = mountFadeHistory(h);
    act(() => h.result.current.editing.handleSelectedClipChange({ continuous: { ...w27Effect, intensity: 0.625 } }));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    expect((requests[0].change as {commands: Array<{select: string}>}).commands[0].select).toBe('occurrence:occ-A/clip:clip-1');
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 60_000 });
    await waitFor(() => expect(history.result.current.canRedo).toBe(true)); act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 60_000 });
    expect(requests[2].change).toEqual({ commands: [{ op: 'timeline.inverse', select: null, args: {
      publication: proof.results[1].accepted_publication_id,
      writes: proof.results[1].change.direct_writes.map(w => ({ ...w, before: w.after, after: w.before })),
    } }] });
    expect(proof.results[1].canonical_document).toEqual(proof.before);
    expect(proof.readback).toEqual(proof.results[0].canonical_document); history.unmount(); h.unmount();
  }, 180_000);
  it('qualifies a real no-change receipt without creating native history', async () => {
    const initial = await w27SdkData(); let proof!: Awaited<ReturnType<typeof w27Source>>;
    const h = await setup(async request => { proof = await w27Source(initial, [request]); w27Evidence('no-change', {request, proof}); return { acceptedResult: proof.result }; }, false, initial);
    const history = mountFadeHistory(h);
    act(() => h.result.current.editing.handleSelectedClipChange(continuousParameterPatch(initial.config.clips[0].continuous!, { enabled: false })));
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    expect(proof.result.status).toBe('no_change'); expect(proof.result.change.direct_writes).toEqual([]);
    expect(proof.readback).toEqual(proof.before); expect(history.result.current.canUndo).toBe(false); history.unmount(); h.unmount();
  }, 90_000);
  it('refuses an Undo acknowledgement that reuses the forward publication', async () => {
    const initial = await w27SdkData(); const requests: CommitRequest[] = []; let proof!: Awaited<ReturnType<typeof w27Source>>;
    const h = await setup(async request => { requests.push(request); proof = await w27Source(initial, requests); const returned = structuredClone(proof.result);
      if (requests.length === 2) returned.accepted_publication_id = proof.results[0].accepted_publication_id;
      w27Evidence('wrong-publication', {requests, proof, returned}); return { acceptedResult: returned };
    }, false, initial);
    const history = mountFadeHistory(h); await w27Action(h, 'bulk clear');
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 60_000 });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true)); act(() => history.result.current.undo());
    await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'), { timeout: 60_000 });
    expect(h.savedSeqRef.current).toBe(1); expect(history.result.current.canRedo).toBe(false); history.unmount(); h.unmount();
  }, 120_000);
  it('rolls back the first bulk change when the late member has a stale full prior', async () => {
    const initial = await w27SdkData(); let proof!: Awaited<ReturnType<typeof w27Source>>;
    const h = await setup(async request => { proof = await w27Source(initial, [request], 'stale'); w27Evidence('bulk-stale', {request, proof}); return { acceptedResult: proof.result }; }, false, initial);
    const history = mountFadeHistory(h);
    act(() => h.result.current.editing.handleUpdateClipsDeep(['clip-1', 'clip-2'], meta => ({ continuous: { ...meta.continuous!, intensity: 0.8 } })));
    await waitFor(() => expect(proof).toBeDefined(), { timeout: 60_000 });
    expect(proof.result.status).toBe('refused'); expect(proof.result.change.direct_writes).toEqual([]);
    expect(proof.accept_counts).toEqual([0]); expect(proof.readback).toEqual(proof.before);
    expect(h.savedSeqRef.current).toBe(0); expect(history.result.current.canUndo).toBe(false); history.unmount(); h.unmount();
  }, 90_000);
  it.each(['missing', 'extra', 'duplicate', 'foreign', 'malformed', 'no_change', 'no publication', 'refused'] as const)(
    '%s receipt cannot acknowledge a partial bulk edit or enable history', async kind => {
      const initial = await w27SdkData(); let proof!: Awaited<ReturnType<typeof w27Source>>;
      const h = await setup(async request => {
        proof = await w27Source(initial, [request]); const returned = structuredClone(proof.result), writes = returned.change.direct_writes;
        if (kind === 'missing') writes.pop();
        if (kind === 'extra') writes.push({ ...writes[0], id: 'parent/clip:foreign' });
        if (kind === 'duplicate') writes[1] = structuredClone(writes[0]);
        if (kind === 'foreign') writes[1].id = 'occurrence:foreign/clip:clip-1';
        if (kind === 'malformed') writes[1].after = { state: 'present' } as never;
        if (kind === 'no_change' || kind === 'refused') returned.status = kind;
        if (kind === 'no publication') returned.accepted_publication_id = null;
        w27Evidence(`bulk-${kind}`, { request, proof, returned }); return { acceptedResult: returned };
      }, false, initial);
      const history = mountFadeHistory(h); await w27Action(h, 'bulk clear');
      await waitFor(() => expect(h.result.current.persistence.saveStatus).toBe('error'), { timeout: 60_000 });
      expect(h.savedSeqRef.current).toBe(0); expect(history.result.current.canUndo).toBe(false); expect(history.result.current.canRedo).toBe(false);
      act(() => history.result.current.undo()); expect(h.requests).toHaveLength(1); history.unmount(); h.unmount();
    }, 90_000);
});

async function bulkTransitionData(reference: ReturnType<typeof transitionReference>, update = false) {
  const base = await initialData();
  return buildTimelineData({ ...base.config, clips: ['V1', 'V2'].flatMap((track, index) => [
    { id: `before-${index}`, at: 0, hold: 2, clipType: 'hold' as const, track, app: { predecessor: index } },
    { id: `after-${index}`, at: 2, hold: 2, clipType: 'hold' as const, track,
      params: { opaqueClip: { index, nullValue: null } }, app: { retained: index },
      ...(update ? {
        transition: { type: reference.id, revision: reference.revision, duration: 0.4 + index * 0.1,
          params: index ? null : {}, opaqueTransition: { index } },
        elementRef: { ...reference, opaqueReference: { index } },
      } : index ? { transition: null, elementRef: null } : {}),
    },
  ]) }, base.registry, undefined, 1, undefined, base.head);
}

const bulkSelection = ['after-1', 'after-0'];
function bulkHistory(h: Awaited<ReturnType<typeof setup>>) {
  return renderHook(() => {
    const state = useTimelineHistory({ ...h.result.current, eventBus: h.eventBus, interactionStateRef: h.interactionStateRef, pendingOpsRef: { current: 0 } });
    useEffect(() => h.eventBus.on('beforeCommit', state.onBeforeCommit), [state.onBeforeCommit]);
    return state;
  }, { wrapper: overlapHistoryWrapper(h) });
}
function writeW29Proof(name: string, value: unknown) {
  if (process.env.E_SELECTED_MOVE_EVIDENCE_DIR) writeFileSync(path.join(process.env.E_SELECTED_MOVE_EVIDENCE_DIR, `w29-bulk-${name}.json`), JSON.stringify(value, null, 2));
}

describe('W29 actual bulk caller SDK receipt history', () => {
  it.each(['assignment', 'deep update', 'flat assignment'] as const)('%s is one ordered transaction with whole-document receipt-only Undo and original-command Redo', async kind => {
    const reference = { ...transitionReference(), opaqueReference: { keep: null } };
    const initial = await bulkTransitionData(reference, kind === 'deep update');
    const requests: CommitRequest[] = []; let proof!: Awaited<ReturnType<typeof transitionSource>>;
    const h = await setup(async request => {
      requests.push(request); proof = await transitionSource(initial, requests, kind === 'flat assignment' ? 'flat' : undefined);
      writeW29Proof(kind.replaceAll(' ', '-'), { requests, proof });
      return { acceptedResult: proof.result };
    }, false, initial, 1, undefined, pinnedTransitionHost(reference), 'after-1');
    const history = bulkHistory(h);
    const acknowledgements: unknown[] = [];
    h.eventBus.on('nativeRegistrationAccepted', (_owner, inverse) => acknowledgements.push(inverse));
    act(() => editorReplaceTimelineSelection(bulkSelection));
    const selected = [...__getSelectionStateForTests().timeline.selectedClipIds];
    const next = { type: reference.id, revision: reference.revision, duration: 0.731, params: null, opaqueTransition: { keep: true } };
    act(() => {
      if (kind === 'deep update') h.result.current.editing.handleUpdateClipsDeep(selected,
        meta => ({ transition: { ...meta.transition!, duration: 0.731 } }));
      else h.result.current.editing.handleUpdateClips(selected, { transition: next, elementRef: reference });
    });
    expect(history.result.current.canUndo).toBe(false);
    const commands = gestureCommandsFor(h.result.current.data!)!;
    expect(isTransitionAssignmentBatch(commands)).toBe(true);
    expect(commands.map(command => command.select)).toEqual(selected.map(id => `parent/clip:${id}`));
    for (const [index, command] of commands.entries()) {
      const prior = initial.config.clips.find(clip => clip.id === selected[index])!;
      expect(command.expect!.transition).toEqual(Object.hasOwn(prior, 'transition') ? { state: 'present', value: prior.transition } : { state: 'absent' });
      expect(command.expect!.elementRef).toEqual(Object.hasOwn(prior, 'elementRef') ? { state: 'present', value: prior.elementRef } : { state: 'absent' });
      expect(command.expect![`parent/track:${prior.track}::kind`]).toEqual({ state: 'present', value: 'visual' });
      expect(command.args).toEqual(kind === 'deep update'
        ? { transition: { ...prior.transition, duration: 0.731 }, elementRef: prior.elementRef }
        : { transition: next, elementRef: reference, from_clip: `parent/clip:before-${1 - index}` });
    }
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1), { timeout: 90_000 });
    await waitFor(() => expect(history.result.current.canUndo).toBe(true));
    expect(requests).toHaveLength(1);
    expect(requests[0].change).toEqual({ commands });
    expect(acknowledgements).toHaveLength(1);
    expect(proof.results[0].change.direct_writes).toHaveLength(kind === 'deep update' ? 2 : 4);
    // Assert the complete authored result explicitly, not only roundtrip equality.
    const expectedDocument = structuredClone(proof.before);
    const parent = (expectedDocument as unknown as { parent: { clips: TimelineData['config']['clips'] } }).parent;
    for (const command of commands) Object.assign(parent.clips.find(clip => `parent/clip:${clip.id}` === command.select)!, {
      transition: command.args.transition, elementRef: command.args.elementRef,
    });
    expect(proof.results[0].canonical_document).toEqual(expectedDocument);
    act(() => history.result.current.undo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(2), { timeout: 90_000 });
    expect(proof.results[1].canonical_document).toEqual(proof.before);
    expect(proof.results[1].change.direct_writes).toEqual('commands' in requests[1].change ? requests[1].change.commands[0].args.writes : undefined);
    await waitFor(() => expect(history.result.current.canRedo).toBe(true));
    act(() => history.result.current.redo());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(3), { timeout: 90_000 });
    expect(proof.results[2].canonical_document).toEqual(expectedDocument);
    expect(requests[2].change).toEqual(requests[0].change);
    expect(requests.map(request => request.base_revision_id)).toEqual(['parent-r1', 'parent-r2', 'parent-r3']);
    expect(proof.accept_counts).toEqual([1, 1, 1]);
    expect(h.readbackHeads).toEqual(['parent-r2', 'parent-r3', 'parent-r4']);
    expect([...__getSelectionStateForTests().timeline.selectedClipIds]).toEqual(selected);
    expect(h.result.current.data!.config.clips.map(clip => clip.id)).toEqual(initial.config.clips.map(clip => clip.id));
    expect(h.result.current.data!.config.tracks).toEqual(initial.config.tracks);
    for (const command of commands) expect(h.result.current.data!.config.clips.find(clip => command.select === `parent/clip:${clip.id}`)).toEqual(parent.clips.find(clip => command.select === `parent/clip:${clip.id}`));
    expect(acknowledgements).toHaveLength(3);
    expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 240_000);
});

describe('W29 actual bulk caller provider atomic refusals', () => {
  it.each(['missing', 'extra', 'duplicate', 'foreign', 'malformed', 'no_change', 'refused'] as const)(
    '%s direct receipt never admits any member to Undo or Redo', async kind => {
      const reference = { ...transitionReference(), opaqueReference: { keep: null } };
      const initial = await bulkTransitionData(reference);
      let proof!: Awaited<ReturnType<typeof transitionSource>>; let completed = false;
      const h = await setup(async request => {
        proof = await transitionSource(initial, [request]);
        const returned = structuredClone(proof.result);
        if (kind === 'missing') returned.change.direct_writes.pop();
        if (kind === 'extra') returned.change.direct_writes.push({ ...returned.change.direct_writes[0], path: 'params' });
        if (kind === 'duplicate') returned.change.direct_writes.push(returned.change.direct_writes[0]);
        if (kind === 'foreign') returned.change.direct_writes[0].id = 'parent/clip:before-0';
        if (kind === 'malformed') returned.change.direct_writes[0].before = { state: 'absent', value: null } as never;
        completed = true;
        writeW29Proof(`receipt-${kind}`, { request, proof, returned, syntheticTransportCorruption: true });
        // The refusal/no-change answers are explicit transport doubles; the
        // unmodified real SDK accepted result is retained separately above.
        if (kind === 'no_change' || kind === 'refused') return kind;
        return { acceptedResult: returned };
      }, false, initial, 1, undefined, pinnedTransitionHost(reference), 'after-1');
      const history = bulkHistory(h);
      act(() => editorReplaceTimelineSelection(bulkSelection));
      const selected = [...__getSelectionStateForTests().timeline.selectedClipIds];
      act(() => h.result.current.editing.handleUpdateClips(selected, {
        transition: { type: reference.id, revision: reference.revision, duration: 0.731, params: null }, elementRef: reference,
      }));
      expect(history.result.current.canUndo).toBe(false);
      await waitFor(() => expect(completed).toBe(true), { timeout: 90_000 });
      if (kind !== 'refused') await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      await act(async () => { await Promise.resolve(); });
      expect(history.result.current.canUndo).toBe(false);
      expect(history.result.current.canRedo).toBe(false);
      act(() => { history.result.current.undo(); history.result.current.redo(); });
      expect(h.requests).toHaveLength(1);
      expect(proof.accept_counts).toEqual([1]);
      expect(proof.results[0].change.direct_writes).toHaveLength(4);
      expect([...__getSelectionStateForTests().timeline.selectedClipIds]).toEqual(selected);
      expect(h.compatibilityRequests).toEqual([]);
      history.unmount(); h.unmount();
    }, 120_000);
  it.each(['stale first', 'late second', 'dual tracks'] as const)(
    '%s SDK refusal crosses the real bulk caller and provider without partial acceptance', async kind => {
      const reference = transitionReference();
      const initial = await bulkTransitionData(reference);
      const server = { ...initial, config: structuredClone(initial.config) };
      if (kind !== 'dual tracks') {
        const target = server.config.clips.find(clip => clip.id === (kind === 'stale first' ? 'after-1' : 'after-0'))!;
        target.transition = { type: reference.id, revision: reference.revision, duration: 0.3 };
      }
      let completed = false; let proof!: Awaited<ReturnType<typeof transitionSource>>;
      const h = await setup(async request => {
        proof = await transitionSource(server, [request], kind === 'dual tracks' ? 'dual' : undefined);
        writeW29Proof(`sdk-${kind.replaceAll(' ', '-')}`, { request, proof });
        completed = true;
        return { acceptedResult: proof.result };
      }, false, initial, 1, undefined, pinnedTransitionHost(reference), 'after-1');
      const history = bulkHistory(h);
      act(() => h.result.current.editing.handleUpdateClips(bulkSelection, {
        transition: { type: reference.id, revision: reference.revision, duration: 0.731 }, elementRef: reference,
      }));
      await waitFor(() => expect(completed).toBe(true), { timeout: 90_000 });
      await act(async () => { await Promise.resolve(); });
      expect(['conflict', 'refused']).toContain(proof.result.status);
      expect(proof.result.canonical_document).toBeNull();
      expect(proof.result.accepted_revision_id).toBeNull();
      expect(proof.result.accepted_publication_id).toBeNull();
      expect(proof.result.change.direct_writes).toEqual([]);
      expect(proof.accept_counts).toEqual([]);
      expect((proof as unknown as { document: unknown; attempted_accept_count: number }).document).toEqual(proof.before);
      expect((proof as unknown as { attempted_accept_count: number }).attempted_accept_count).toBe(0);
      expect(h.getCurrentConfig()).toEqual(initial.config);
      expect(h.savedSeqRef.current).toBe(0);
      expect(history.result.current.canUndo).toBe(false);
      expect(history.result.current.canRedo).toBe(false);
      act(() => { history.result.current.undo(); history.result.current.redo(); });
      expect(h.requests).toHaveLength(1);
      expect(h.compatibilityRequests).toEqual([]);
      history.unmount(); h.unmount();
    }, 120_000);
  it('wrong publication on actual bulk Undo preserves the complete accepted document and cannot fabricate Redo', async () => {
    const reference = transitionReference(); const initial = await bulkTransitionData(reference);
    const requests: CommitRequest[] = []; let completed = false; let proof!: Awaited<ReturnType<typeof transitionSource>>;
    const h = await setup(async request => {
      requests.push(request);
      const submitted = structuredClone(request);
      if (requests.length === 2 && 'commands' in submitted.change) submitted.change.commands[0].args.publication = 'foreign-publication';
      proof = await transitionSource(initial, requests.length === 1 ? [submitted] : [requests[0], submitted]);
      writeW29Proof('wrong-publication', { requests, submitted, proof, syntheticPublicationCorruption: true });
      completed = requests.length === 2;
      return { acceptedResult: proof.result };
    }, false, initial, 1, undefined, pinnedTransitionHost(reference), 'after-1');
    const history = bulkHistory(h);
    act(() => h.result.current.editing.handleUpdateClips(bulkSelection, {
      transition: { type: reference.id, revision: reference.revision, duration: 0.731 }, elementRef: reference,
    }));
    await waitFor(() => expect(history.result.current.canUndo).toBe(true), { timeout: 90_000 });
    const acceptedConfig = h.getCurrentConfig();
    act(() => history.result.current.undo());
    await waitFor(() => expect(completed).toBe(true), { timeout: 90_000 });
    await act(async () => { await Promise.resolve(); });
    expect(proof.result.status).toBe('conflict');
    expect(proof.result.conflicts).toEqual([expect.objectContaining({ path: 'publication ancestry/evidence unavailable', kind: 'dependent' })]);
    expect(proof.result.change.direct_writes).toEqual([]);
    expect(proof.accept_counts).toEqual([1]);
    expect((proof as unknown as { document: unknown }).document).toEqual(proof.results[0].canonical_document);
    expect(h.getCurrentConfig()).toEqual(acceptedConfig);
    expect(history.result.current.canRedo).toBe(false);
    act(() => history.result.current.redo());
    expect(requests).toHaveLength(2);
    expect(h.compatibilityRequests).toEqual([]);
    history.unmount(); h.unmount();
  }, 180_000);
});


describe('W29 bulk whole-operation compatibility', () => {
  it.each(['unbound member', 'mixed field', 'null', 'clear', 'duplicate selection', 'missing selection', 'occurrence'] as const)(
    '%s retains the original bulk patches without partially converting', async kind => {
      const reference = { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition' as const, packId: 'rendering' };
      const initial = kind === 'occurrence' ? await occurrenceTransitionData() : await bulkTransitionData(reference, true);
      const h = await setup(undefined, false, initial, 1, undefined, transitionHost(), 'after-1');
      const selected = kind === 'occurrence' ? ['occ-after', 'occ-before']
        : kind === 'duplicate selection' ? ['after-1', 'after-1']
        : kind === 'missing selection' ? ['after-1', 'missing'] : bulkSelection;
      const patches: Partial<import('../lib/timeline-data.ts').ClipMeta>[] = [];
      act(() => h.result.current.editing.handleUpdateClipsDeep(selected, meta => {
        const patch = kind === 'null' ? { transition: null }
          : kind === 'clear' ? { transition: undefined }
          : kind === 'mixed field' ? { transition: { ...meta.transition!, duration: 0.731 }, opacity: 0.4 }
          : kind === 'unbound member' && patches.length === 1 ? { transition: { type: reference.id, duration: 0.731 } }
          : { transition: { ...meta.transition!, duration: 0.731 } };
        patches.push(patch as Partial<import('../lib/timeline-data.ts').ClipMeta>);
        return patch as Partial<import('../lib/timeline-data.ts').ClipMeta>;
      }));
      if (kind === 'clear') expect(gestureCommandsFor(h.result.current.data!)?.map(command => command.op)).toEqual(['clip.clear', 'clip.clear']);
      else expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
      expect(patches.length).toBeGreaterThan(0);
      writeW29Proof(`fallback-${kind.replaceAll(' ', '-')}`, { selected, patches, commands: gestureCommandsFor(h.result.current.data!) ?? null });
      h.unmount();
    });
  it('mounted bulk panel duration callback stays explicit compatibility when its payload omits the pin and reference', async () => {
    const reference = { id: 'crossfade', revision: 'sha256:crossfade-r1', kind: 'transition' as const, packId: 'rendering' };
    const initial = await bulkTransitionData(reference, true);
    const h = await setup(undefined, false, initial, 1, undefined, transitionHost(), 'after-1');
    const prior = initial.config.clips.find(clip => clip.id === 'after-0')!.transition!;
    const patches: unknown[] = [];
    const panel = render(<BulkClipPanelBody
      clips={initial.resolvedConfig.clips.filter(clip => bulkSelection.includes(clip.id))}
      effectResources={createVideoEditorEffectCatalog({ effects: [] })} visibleTabs={['effects']} activeTab="effects" setActiveTab={vi.fn()}
      compositionWidth={1920} compositionHeight={1080}
      sharedEntrance={null} sharedExit={null} sharedContinuous={null} sharedText={null}
      sharedEntranceType={null} sharedExitType={null} sharedContinuousType={null}
      sharedTransition={prior} sharedTransitionType={reference.id} sharedTransitionDuration={0.5}
      sharedSpeed={null} sharedFrom={null} sharedTo={null} sharedX={null} sharedY={null}
      sharedWidth={null} sharedHeight={null} sharedOpacity={null} sharedVolume={null}
      sharedFontSize={null} sharedTextColor={null}
      onChange={patch => h.result.current.editing.handleUpdateClips(bulkSelection, patch)}
      onChangeDeep={patchFn => h.result.current.editing.handleUpdateClipsDeep(bulkSelection, meta => {
        const patch = patchFn(meta); patches.push(patch); return patch;
      })} onResetPosition={vi.fn()} onToggleMute={vi.fn()} onClose={vi.fn()}
    />, { wrapper: overlapHistoryWrapper(h) });
    const input = screen.getByText('Duration (seconds)').parentElement!.querySelector('input')!;
    fireEvent.change(input, { target: { value: '0.731' } });
    expect(patches).toHaveLength(2);
    for (const patch of patches as { transition: Record<string, unknown> }[]) {
      expect(patch.transition).not.toHaveProperty('revision');
      expect(patch).not.toHaveProperty('elementRef');
      expect(patch.transition).not.toHaveProperty('opaqueTransition');
    }
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    writeW29Proof('mounted-panel-fallback', { patches, reason: 'Existing UI callback omits exact pinned revision/reference and opaque siblings; no UI or intent rewrite authorized.' });
    panel.unmount(); h.unmount();
  });
});
