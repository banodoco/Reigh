// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { readFileSync } from 'node:fs';
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
import { useTimelinePersistence } from './useTimelinePersistence.ts';
import { useClipResize } from './useClipResize.ts';
import { useClipEditing } from './useClipEditing.ts';
import { useTimelineTrackManagement } from './useTimelineTrackManagement.ts';
import { buildKeyboardTimeNudgeEdit } from '../lib/keyboard-nudge.ts';
import { expandTinyClip } from '../lib/expand-tiny-clip.ts';
import { gestureCommandsFor, tiedStartDragGesture } from '../commands/semanticGestures.ts';
import { createTimelineCommands } from './useTimelineCommandsService.ts';
import type { TimelineStoreApi } from './timelineStore.ts';
import { useTimelineOps } from './useTimelineOps.ts';
import { createProposalRuntime } from '../lib/proposal-runtime.ts';
import { createTimelineReader } from '../lib/timeline-reader.ts';
import { AstridElementOperationAdapter, createElementTimelineRoutes } from '../runtime/element-adapter.ts';
import { buildReighAgentElementContext } from '../runtime/element-contract.ts';
import { readAudioLanePresentation } from '../data/audioLanePresentation.ts';

// This transport is a wire recorder, not an Astrid operation executor. Successful
// fixture acknowledgements establish App adaptation only, never Runtime acceptance.
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function wireFixture(initial: TimelineData, reply?: (request: CommitRequest, call: number) => Promise<void | 'unavailable'>) {
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
      const unavailable = await reply?.(request, requests.length) === 'unavailable';
      if (!unavailable && !request.dry_run && !acceptedHeads.has(request.request_id)) {
        currentHead = `parent-r${++acceptanceSequence}`;
        acceptedHeads.set(request.request_id, currentHead);
      }
      const response: CommitResult = {
        status: unavailable ? 'error' : request.dry_run ? 'preview' : 'accepted', request_id: request.request_id, request_hash: 'fixture',
        base_revision_id: request.base_revision_id, accepted_revision_id: unavailable || request.dry_run ? null : acceptedHeads.get(request.request_id)!,
        accepted_publication_id: null, previous_revision_id: request.base_revision_id, rebased_onto: request.dry_run ? currentHead : null,
        canonical_document: null, projection_version: 1, document_digest: null, id_map: {},
        change: { changes: [], commands: request.dry_run && 'commands' in request.change
          ? structuredClone(request.change.commands) : [], direct_writes: [], consequences: [], affected: [] },
        conflicts: [], choices: [], provenance: null, evidence: null, schema_report: null, runtime_receipt: null, error: unavailable ? { code: 'runtime_unavailable', message: 'fixture unavailable', hint: 'retry', next_action: 'retry' } : null,
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
async function setup(reply?: (request: CommitRequest, call: number) => Promise<void | 'unavailable'>, media = false, providedInitial?: TimelineData, currentTime = 1, editability?: TimelineEditability) {
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
  const hook = renderHook(() => {
    const commit = useTimelineCommit({ eventBus, lastSavedSignatureRef, initialData: initial, editability });
    const persistence = useTimelinePersistence({ provider: fixture.provider, assetResolver: fixture.provider, timelineId: 'gesture-timeline', eventBus, ...commit, savedSeqRef, configVersionRef, headRevisionRef, lastSavedSignatureRef, interactionStateRef });
    useEffect(() => eventBus.on('scheduleSave', persistence.scheduleSave), [persistence.scheduleSave]);
    const editing = useClipEditing({ ...commit, selectedClipId: 'clip-1', selectedTrack: initial.tracks[0], currentTime, selectClip: vi.fn(), resolvedConfig: commit.data?.resolvedConfig ?? null });
    const tracks = useTimelineTrackManagement({ ...commit, resolvedConfig: commit.data?.resolvedConfig ?? null, eventBus });
    const resize = useClipResize(commit);
    const ops = useTimelineOps({ ...commit, createManualCheckpoint: vi.fn(), jumpToCheckpoint: vi.fn(), checkpoints: [], editability });
    return { ...commit, editing, tracks, resize, persistence, ops };
  }, { wrapper });
  return { ...hook, ...fixture, initial, savedSeqRef, interactionStateRef, eventBus };
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
  ['neighbour', { on: 'c2', until: 'end of c2' }],
  ['sequence step', { on: 'c2 +2f', until: 'end of c2', sequence: { id: 'steps', index: 1 } }],
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
describe('authored end relation choices through the main resize handler', () => {
  for (const [relation, astrid] of authoredRelations) {
    it.each(['keep', null, 'unknown'])(`${relation} overlap choice %s keeps the captured base and sends nothing`, async (choice) => {
      const initial = await relationData(astrid);
      const prompt = vi.spyOn(window, 'prompt').mockReturnValue(choice);
      const h = await setup(undefined, false, initial);
      resizeFirst(h);
      expect(prompt).toHaveBeenCalledOnce();
      expect(prompt.mock.calls[0][0]).toContain(astrid.until);
      expect(h.result.current.data).toBe(initial);
      expect(h.result.current.editSeqRef.current).toBe(0);
      expect(h.requests).toHaveLength(0);
      h.unmount();
    });
    it.each(['detach', 'adjust-offset', 're-anchor'])(`${relation} overlap choice %s sends one captured command`, async (choice) => {
      const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce(choice).mockReturnValueOnce('beat 8');
      const initial = await relationData(astrid);
      const h = await setup(undefined, false, initial);
      resizeFirst(h);
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      expect(h.requests).toHaveLength(1);
      const op = choice === 'detach' ? 'clip.set-duration' : 'clip.until';
      const args = choice === 'detach' ? { seconds: 4 }
        : { moment: choice === 're-anchor' ? 'beat 8' : `${astrid.until} +60f` };
      expect(h.requests[0].request.change).toEqual({ commands: [{
        op, select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args,
        expect: { at: { state: 'present', value: 1 }, hold: { state: 'present', value: 2 },
          'app.astrid.on': { state: 'present', value: astrid.on },
          'app.astrid.until': { state: 'present', value: astrid.until }, 'app.astrid.for': { state: 'absent' } },
      }] });
      const clip = h.result.current.data!.config.clips.find((clip) => clip.id === 'clip-1')!;
      expect(clip.hold).toBe(4);
      expect(clip.app?.clipSentinel).toBe(true);
      const writtenIntent = clip.app?.astrid as Record<string, unknown> | undefined;
      expect(writtenIntent?.on).toBe(astrid.on);
      if (choice === 'detach') {
        expect(clip.app?.astrid).not.toHaveProperty('until');
        expect(writtenIntent?.for).toBe(4);
      } else expect(writtenIntent?.until).toBe(args.moment);
      expect(prompt).toHaveBeenCalledTimes(choice === 're-anchor' ? 2 : 1);
      h.unmount();
    });
    it(`${relation} plain drag preserves its start tie without showing a choice`, async () => {
      const { until: _until, ...startRelation } = astrid;
      const initial = await relationData(startRelation);
      const prompt = vi.spyOn(window, 'prompt');
      const h = await setup(undefined, false, initial);
      act(() => h.result.current.editing.handleSelectedClipChange({ at: 1.3 }));
      await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
      expect(h.requests).toHaveLength(1);
      expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({
        op: 'clip.nudge', select: 'parent/clip:clip-1', resolved: ['parent/clip:clip-1'], args: { frames: 9 },
        expect: { at: { state: 'present', value: 1 }, 'app.astrid.on': { state: 'present', value: astrid.on },
          'app.astrid.until': { state: 'absent' } },
      })] });
      expect(prompt).not.toHaveBeenCalled();
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
  it('an end choice captures present-null for separately from absence', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('detach');
    const h = await setup(undefined, false, await relationData({ on: 'beat 2', until: 'beat 4', for: null }));
    resizeFirst(h, 3.5);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({
      op: 'clip.set-duration', args: { seconds: 2.5 },
      expect: expect.objectContaining({ 'app.astrid.for': { state: 'present', value: null } }),
    })] });
    h.unmount();
  });
  it('cancelling a re-anchor sends nothing', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('re-anchor').mockReturnValueOnce(null);
    const initial = await relationData({ on: 'beat 2', until: 'beat 4' });
    const h = await setup(undefined, false, initial);
    resizeFirst(h);
    expect(h.result.current.data).toBe(initial);
    expect(h.requests).toHaveLength(0);
    h.unmount();
  });
  it('an offset choice retains existing frame and second offsets as authored TimeRef text', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('adjust-offset');
    const h = await setup(undefined, false, await relationData({ on: 'beat 2', until: 'beat 4 +2f -0.1s' }));
    resizeFirst(h, 2.5);
    await waitFor(() => expect(h.savedSeqRef.current).toBe(1));
    expect(h.requests[0].request.change).toEqual({ commands: [expect.objectContaining({
      op: 'clip.until', args: { moment: 'beat 4 +2f -0.1s -15f' },
    })] });
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
  it('audio detach that creates a track retains its existing unconverted edit path', async () => {
    const h = await setup(undefined, true, await videoData(false));
    act(() => h.result.current.editing.handleDetachAudioClip('clip-1'));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.result.current.data!.tracks.some((track) => track.id === 'A1')).toBe(true);
    expect(h.requests).toHaveLength(0);
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
  it('existing-source duplicate with following row actions keeps the whole ripple on its explicit fallback', async () => {
    const h = await setup(undefined, false, await literalData());
    const commands = createTimelineCommands({ getState: () => ({ data: { data: h.result.current.data, dataRef: h.result.current.dataRef },
      ops: { applyEdit: h.result.current.applyEdit }, availability: { mounted: true } }) } as unknown as TimelineStoreApi);
    act(() => expect(commands.addClip({ assetId: 'source', afterClipId: 'clip-1' }).ok).toBe(true));
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.requests).toHaveLength(0);
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
  it('cross-kind drag preserves its existing fallback behavior', async () => {
    const h = await setup(undefined, false, await trackData(true));
    act(() => h.result.current.tracks.handleMoveTrack('V1', 'A1'));
    expect(gestureCommandsFor(h.result.current.data!)).toBeUndefined();
    expect(h.result.current.data!.tracks.map((track) => track.id)).toEqual(['A1', 'V1', 'V2', 'A4']);
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
  it.each(['add', 'reorder', 'property', 'mute-all'] as const)('%s retains strict invalid-row refusal before any transaction', async (operation) => {
    const initial = await trackData(true);
    Reflect.set(initial.config.tracks![0], 'future', { opaque: null });
    const before = structuredClone(initial.config);
    const h = await setup(undefined, false, initial);
    expect(() => act(() => {
      if (operation === 'mute-all') h.result.current.ops.setAllTracksMuted(true);
      if (operation === 'add') h.result.current.tracks.handleAddTrack('visual');
      if (operation === 'reorder') h.result.current.tracks.handleMoveTrack('V1', 'V2');
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


describe('E015 source-backed plain start-tied drag', () => {
  // D core/timeline/moments.py format_moment/format_offset and SDK Clip.nudge:
  // frames add to the existing offset; the canonical anchor itself is unchanged.
  const relations = [
    ['word', '"hello" in v20a #2 +2f', 1.3, '"hello" in v20a #2 +11f'],
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
  it.each(relations)('%s drag preserves its exact anchor and adjusts the signed frame offset in one commit', async (_relation, on, start, adjusted) => {
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
    expect(h.result.current.editSeqRef.current).toBe(1);
    expect(h.requests[0].request.source).toEqual({ via: 'app' });
    expect(h.compatibilityRequests).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
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
