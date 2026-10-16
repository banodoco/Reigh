// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
vi.mock('@/tools/video-editor/compositions/TimelineRenderer.tsx', () => ({ invalidateReferencedTimelineCache: vi.fn() }));
import * as draftStorage from '../data/timelineDraftIndexedDb.ts';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider.ts';
import { RUNTIME_CLIENT_SCOPES } from '@/integrations/runtime/client.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from '@/integrations/runtime/contract-metadata.ts';
import type { CommitRequest, CommitResult, Transport } from '@/integrations/runtime/generated.ts';
import { buildTimelineData, type TimelineData } from '../lib/timeline-data.ts';
import type { TimelineEditability } from '../lib/timeline-editability.ts';
import { commitDraggingSession, type InternalDragSession } from './useClipDrag.helpers.ts';
import { createInteractionState, notifyInteractionEndIfIdle } from '../lib/interaction-state.ts';
import { __resetSelectionStoreForTests } from '@/shared/state/selectionStore.ts';
import { TimelineEventBus } from './useTimelineEventBus.ts';
import { useTimelineCommit } from './useTimelineCommit.ts';
import { useAssetManagement } from './useAssetManagement.ts';
import { VideoEditorRuntimeProvider, type VideoEditorRuntimeContextValue } from '../contexts/VideoEditorRuntimeContext.tsx';
import { useTimelinePersistence } from './useTimelinePersistence.ts';
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
import { createProposalRuntime } from '../lib/proposal-runtime.ts';
import { createTimelineReader } from '../lib/timeline-reader.ts';
import { AstridElementOperationAdapter, createElementTimelineRoutes } from '../runtime/element-adapter.ts';
import { buildReighAgentElementContext } from '../runtime/element-contract.ts';
import { readAudioLanePresentation } from '../data/audioLanePresentation.ts';
import { planClipDrag } from '../lib/clip-drag-planner.ts';
import { createTimelineEditability } from '../lib/timeline-editability.ts';

// This transport is a wire recorder, not an Astrid operation executor. Successful
// fixture acknowledgements establish App adaptation only, never Runtime acceptance.
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
type FixtureReply = (request: CommitRequest, call: number) => Promise<void | 'unavailable' | 'failed' | 'rejected' | 'refused'>;
function wireFixture(initial: TimelineData, reply?: FixtureReply) {
  const requests: Array<{ request: CommitRequest; bytes: string; headers: Record<string, string> }> = [];
  const compatibilityRequests: string[] = [];
  let currentHead = initial.head!.headRevisionId!;
  let acceptanceSequence = 1;
  const acceptedHeads = new Map<string, string>();
  const transport: Transport = async (method, path, headers, body) => {
    if (method === 'POST' && (/\/(?:publish-document|publish|composition-revisions)(?:$|\?)/.test(path))) {
      compatibilityRequests.push(path);
      throw new Error(`Unmarked census writer used compatibility publication: ${path}`);
    }
    if (path === '/v1/health') return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 }) };
    if (path === '/v1/handshake') return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 'fixture', actor_id: 'reigh-product-connector', realm_id: 'fixture', scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }) };
    if (path === '/v1/realm') return { status: 200, headers: {}, body: json({ realm_id: 'fixture' }) };
    if (method === 'POST' && path.endsWith('/commit')) {
      const bytes = new TextDecoder().decode(body as Uint8Array);
      const request = JSON.parse(bytes) as CommitRequest;
      requests.push({ request, bytes, headers: { ...headers } });
      const outcome = await reply?.(request, requests.length);
      const unavailable = outcome === 'unavailable';
      const failed = outcome === 'failed';
      const rejected = outcome === 'rejected';
      const refused = outcome === 'refused';
      if (!unavailable && !failed && !rejected && !refused && !request.dry_run && !acceptedHeads.has(request.request_id)) {
        currentHead = `parent-r${++acceptanceSequence}`;
        acceptedHeads.set(request.request_id, currentHead);
      }
      const response: CommitResult = {
        status: unavailable || failed || rejected ? 'error' : refused ? 'refused' : request.dry_run ? 'preview' : 'accepted', request_id: request.request_id, request_hash: 'fixture',
        base_revision_id: request.base_revision_id, accepted_revision_id: unavailable || failed || rejected || refused || request.dry_run ? null : acceptedHeads.get(request.request_id)!,
        accepted_publication_id: null, previous_revision_id: request.base_revision_id, rebased_onto: request.dry_run ? currentHead : null,
        canonical_document: null, projection_version: 1, document_digest: null, id_map: {},
        change: { changes: [], commands: request.dry_run && 'commands' in request.change
          ? structuredClone(request.change.commands) : [], direct_writes: [], consequences: [], affected: [] },
        conflicts: [], choices: [], provenance: null, evidence: null, schema_report: null, runtime_receipt: null, error: unavailable ? { code: 'runtime_unavailable', message: 'fixture unavailable', hint: 'retry', next_action: 'retry' } : failed ? { code: 'validation_error', message: 'fixture refused batch', hint: 'invalid batch', next_action: 'fix' } : rejected ? { code: 'invalid_command', message: 'fixture rejected acceptance', hint: 'fix the command', next_action: 'fix' } : refused ? { code: 'bad_request', message: 'fixture refusal', hint: 'inspect the refused command', next_action: 'inspect' } : null,
      };
      return { status: unavailable ? 503 : 200, headers: {}, body: json(response) };
    }
    const revision = /\/composition-revisions\/([^/]+)$/.exec(path);
    if (method === 'GET' && revision) return { status: 200, headers: {}, body: json({ project_id: 'gesture-project', timeline_id: 'gesture-timeline', revision_id: revision[1], payload: { config: initial.config, clips: initial.config.clips, registry: initial.registry, occurrences: [] } }) };
    throw new Error(`Unexpected fixture call ${method} ${path}`);
  };
  return { requests, compatibilityRequests, transport, provider: new RuntimeDataProvider({ projectId: 'gesture-project', baseUrl: 'http://runtime.fixture', token: 'fixture-only', transport, commitRouting: { enabled: true } }) };
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
async function setup(reply?: FixtureReply, media = false, providedInitial?: TimelineData, currentTime = 1, editability?: TimelineEditability) {
  const initial = providedInitial ?? await initialData(media);
  const fixture = wireFixture(initial, reply);
  const eventBus = new TimelineEventBus();
  const lastSavedSignatureRef = { current: initial.stableSignature };
  const headRevisionRef = { current: initial.head };
  const savedSeqRef = { current: 0 };
  const configVersionRef = { current: 1 };
  const interactionStateRef = { current: createInteractionState() };
  const query = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: query }, children);
  const selectClip = vi.fn();
  const hook = renderHook(() => {
    const commit = useTimelineCommit({ eventBus, lastSavedSignatureRef, initialData: initial, editability });
    const persistence = useTimelinePersistence({ provider: fixture.provider, assetResolver: fixture.provider, timelineId: 'gesture-timeline', eventBus, ...commit, savedSeqRef, configVersionRef, headRevisionRef, lastSavedSignatureRef, interactionStateRef });
    useEffect(() => eventBus.on('scheduleSave', persistence.scheduleSave), [persistence.scheduleSave]);
    const editing = useClipEditing({ ...commit, selectedClipId: 'clip-1', selectedTrack: initial.tracks[0], currentTime, selectClip, resolvedConfig: commit.data?.resolvedConfig ?? null });
    const tracks = useTimelineTrackManagement({ ...commit, resolvedConfig: commit.data?.resolvedConfig ?? null, eventBus, editability });
    const resize = useClipResize({ ...commit, semanticCommandSaving: fixture.provider.semanticCommandSaving });
    const ops = useTimelineOps({ ...commit, createManualCheckpoint: vi.fn(), jumpToCheckpoint: vi.fn(), checkpoints: [], editability });
    return { ...commit, editing, tracks, resize, persistence, ops };
  }, { wrapper });
  return { ...hook, ...fixture, initial, savedSeqRef, interactionStateRef, eventBus, selectClip, configVersionRef, headRevisionRef, lastSavedSignatureRef };
}
beforeEach(() => { vi.stubGlobal('indexedDB', createFakeIndexedDB()); __resetSelectionStoreForTests(); });
afterEach(() => { resetFakeIndexedDB(); vi.restoreAllMocks(); });

const cases = [
  ['property opacity', 'handleSelectedClipChange', { opacity: 0.4 }, 'clip.set-look', { opacity: 0.4 }],
  ['entrance effect', 'handleSelectedClipChange', { entrance: { type: 'fade', duration: 0.4 } }, 'clip.set-look', { entrance: { type: 'fade', duration: 0.4 } }],
  ['exit effect', 'handleSelectedClipChange', { exit: { type: 'fade', duration: 0.4 } }, 'clip.set-look', { exit: { type: 'fade', duration: 0.4 } }],
  ['explicit transition clear', 'handleSelectedClipChange', { transition: undefined }, 'clip.clear', { keys: ['transition'] }],
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
  it('keeps a tiny hold with an authored end relation on its explicit fallback', async () => {
    const base = await relationData({ on: 'beat 2', until: 'beat 4' });
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
      : writer === 'deleteClip' ? [{ ...scoped, op: 'clip.remove', args: {}, expect: { '': { state: 'present', value: h.initial.config.clips[0] } } }]
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
    const initial = await buildTimelineData({ ...base.config, tracks: [...base.config.tracks!,
      { id: 'unused', kind: 'visual', label: 'Unused', app: { opaque: null } }] }, base.registry, undefined, 1, undefined, base.head);
    const h = await setup(undefined, false, initial);
    act(() => mode === 'remove' ? h.result.current.tracks.handleRemoveTrack('unused') : h.result.current.tracks.handleClearUnusedTracks());
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    const ids = mode === 'remove' ? ['unused'] : ['V2', 'unused'];
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: ids.map((id) => ({ op: 'timeline.remove', select: `parent/track:${id}`, args: {},
      expect: { '': { state: 'present', value: initial.config.tracks!.find((track) => track.id === id) } } })) });
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
        expect: { 'parent/clip:clip-1::': { state: 'present', value: before.clips.find((clip) => clip.id === 'clip-1') } } },
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
      op: 'timeline.add', select: 'parent/track:V1', args: { media: selection, at: 10, duration: 5 },
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
