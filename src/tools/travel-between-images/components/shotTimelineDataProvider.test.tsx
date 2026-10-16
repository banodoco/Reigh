// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { writeFileSync } from 'node:fs';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The repository's local fake IndexedDB fixture is JavaScript without declarations.
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
vi.mock('@/tools/video-editor/compositions/TimelineRenderer.tsx', () => ({ invalidateReferencedTimelineCache: vi.fn() }));
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider.ts';
import { RUNTIME_CLIENT_SCOPES } from '@/integrations/runtime/client.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from '@/integrations/runtime/contract-metadata.ts';
import type { CommitRequest, CommitResult, Transport } from '@/integrations/runtime/generated.ts';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { ShotCompositionContract } from '@/tools/video-editor/data/shotComposition.ts';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { attachGestureCommands, gestureCommandsFor, gestureOccurrenceFor, moveGestureCommands, propertyGestureCommands } from '@/tools/video-editor/commands/semanticGestures.ts';
import { TimelineEventBus } from '@/tools/video-editor/hooks/useTimelineEventBus.ts';
import { useTimelineCommit } from '@/tools/video-editor/hooks/useTimelineCommit.ts';
import { useClipEditing } from '@/tools/video-editor/hooks/useClipEditing.ts';
import { useTimelinePersistence } from '@/tools/video-editor/hooks/useTimelinePersistence.ts';
import { createInteractionState } from '@/tools/video-editor/lib/interaction-state.ts';
import { createShotTimelineDataProvider, createShotTimelineInitialData } from './shotTimelineDataProvider.ts';

type RecordValue = Record<string, unknown>;
const record = (value: unknown) => value as RecordValue;
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function graphFixture(): ShotCompositionContract {
  const graph = structuredClone(fixture) as unknown as ShotCompositionContract;
  graph.occurrences = graph.occurrences.slice(0, 2);
  const revision = graph.shot_revisions.find((item) => item.shot_id === 'shot-alpha' && item.revision_id === 'rev-a')!;
  record(record(revision.internal_timeline_revision).timeline).clips = [{
    id: 'clip-1', clipType: 'hold', at: 0.5, hold: 1, track: 'video', opacity: 0.9,
    app: { astrid: { on: '"hello" +2f' }, opaque: null },
  }];
  record(graph.parent_composition).config = {
    output: { resolution: '1920x1080', fps: 30, file: 'fixture.mp4' },
    tracks: [{ id: 'video', kind: 'visual' }],
    clips: [{ id: 'clip-1', clipType: 'hold', at: 0, hold: 1, track: 'video', app: { parent: true } }],
  };
  return graph;
}

// Wire fixture only. It executes the asserted bounded edit to expose selection
// mistakes, and does not establish installed Astrid/Runtime or journal proof.
function setupWire(options: { unknown?: boolean; readFailure?: boolean; readGate?: Promise<void> } = {}) {
  const graph = graphFixture();
  const prepare = createShotCompositionAdapter({ load: vi.fn() }).prepare;
  const composition = prepare(graph);
  const requests: Array<{ request: CommitRequest; bytes: string; headers: Record<string, string>; result: CommitResult }> = [];
  const revisions = new Map([[composition.headRevisionId, graph]]);
  let accepted: ShotCompositionContract | undefined;
  const exactReads: string[] = [];
  const transport: Transport = async (method, path, headers, body) => {
    if (path === '/v1/health') return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 }) };
    if (path === '/v1/handshake') return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 'fixture', actor_id: 'reigh-product-connector', realm_id: 'fixture', scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }) };
    if (path === '/v1/realm') return { status: 200, headers: {}, body: json({ realm_id: 'fixture' }) };
    if (method === 'POST' && path.endsWith('/commit')) {
      const bytes = new TextDecoder().decode(body as Uint8Array);
      const request = JSON.parse(bytes) as CommitRequest;
      if (!accepted) {
        accepted = structuredClone(graph);
        record(accepted.primary_timeline.head).revision_id = 'ack-head';
        const occurrence = accepted.occurrences.find((item) => 'occurrence:' + item.occurrence_id === request.scope.target)!;
        const revision = structuredClone(accepted.shot_revisions.find((item) => item.shot_id === occurrence.shot_id && item.revision_id === occurrence.revision_id)!);
        revision.revision_id = 'rev-edited';
        record(revision.internal_timeline_revision).revision_id = 'internal-edited';
        const clips = record(record(revision.internal_timeline_revision).timeline).clips as RecordValue[];
        for (const command of 'commands' in request.change ? request.change.commands : []) {
          const clip = clips.find((item) => command.select === 'occurrence:' + occurrence.occurrence_id + '/clip:' + item.id)!;
          if (command.op === 'clip.nudge') clip.at = Number(clip.at) + Number(record(command.args).frames) / 30;
          else if (command.op === 'clip.set-look') Object.assign(clip, command.args);
          else throw new Error('Fixture only supports the asserted move/property commands');
        }
        accepted.shot_revisions.push(revision);
        occurrence.revision_id = revision.revision_id;
        occurrence.stable_deep_link = String(occurrence.stable_deep_link).replace('/revision/rev-a/', '/revision/rev-edited/');
        revisions.set('ack-head', accepted);
      }
      const result: CommitResult = {
        status: request.dry_run ? 'preview' : 'accepted', request_id: request.request_id, request_hash: 'fixture',
        base_revision_id: request.base_revision_id, accepted_revision_id: request.dry_run ? null : 'ack-head',
        accepted_publication_id: null, previous_revision_id: request.base_revision_id, rebased_onto: request.dry_run ? 'ack-head' : null,
        canonical_document: null, projection_version: 1, document_digest: null, id_map: {},
        change: { changes: [], commands: 'commands' in request.change ? request.change.commands : [], direct_writes: [], consequences: [], affected: [] },
        conflicts: [], choices: [], provenance: null, evidence: null, schema_report: null, runtime_receipt: null, error: null,
      };
      requests.push({ request, bytes, headers: { ...headers }, result });
      if (options.unknown && requests.length === 1) throw new Error('lost acknowledgement after fixture acceptance');
      return { status: 200, headers: {}, body: json(result) };
    }
    const revision = /\/composition-revisions\/([^/]+)$/.exec(path);
    if (method === 'GET' && revision) {
      exactReads.push(revision[1]);
      return { status: 200, headers: {}, body: json({
        project_id: composition.projectId, timeline_id: composition.parentDocumentId,
        revision_id: revision[1], payload: revisions.get(revision[1])?.parent_composition,
      }) };
    }
    throw new Error('Unexpected fixture call ' + method + ' ' + path);
  };
  const runtime = new RuntimeDataProvider({ projectId: composition.projectId, baseUrl: 'http://runtime.fixture', token: 'fixture-only', transport, commitRouting: { enabled: true } });
  const publish = vi.fn(async () => graph);
  const loadAtHead = vi.fn(async ({ headRevisionId }: { headRevisionId: string }) => {
    if (options.readFailure && loadAtHead.mock.calls.length === 1) throw new Error('exact read unavailable');
    await options.readGate;
    return revisions.get(headRevisionId);
  });
  const adapter = createShotCompositionAdapter({ ...runtime.shotComposition, load: async () => graph, loadAtHead, publish });
  const config = projectCanonicalComposition({ ...composition, occurrences: [composition.occurrences[0]] }, {
    output: { resolution: '1920x1080', fps: 30, file: 'fixture.mp4' }, clips: [], tracks: [], registry: {},
  }, { clampToOccurrenceDuration: false }).config;
  const adopted = vi.fn();
  const popup = createShotTimelineDataProvider(config, composition, 'occ-1', adapter, adopted);
  const initial = createShotTimelineInitialData(config, 1, composition);
  function move() {
    const commands = moveGestureCommands(initial, 'occ-1:clip-1', 0.8)!;
    const next = { ...initial, config: { ...initial.config, clips: initial.config.clips.map((clip) => ({ ...clip, at: 0.8 })) } };
    attachGestureCommands(next, commands);
    return { next, commands: gestureCommandsFor(next)!, context: gestureOccurrenceFor(next)! };
  }
  return { graph, composition, requests, runtime, publish, popup, adopted, initial, move, loadAtHead, exactReads, revisions, get accepted() { return accepted; } };
}

beforeEach(() => vi.stubGlobal('indexedDB', createFakeIndexedDB()));
afterEach(() => { resetFakeIndexedDB(); vi.restoreAllMocks(); });

describe('occurrence popup command boundary', () => {
  it('carries a real 9-frame gesture through persistence into one exact occurrence commit and acknowledged head', async () => {
    const h = setupWire();
    expect((await h.popup.loadCanonicalTimeline!('popup-session')).head).toEqual(h.initial.head);
    const eventBus = new TimelineEventBus();
    const savedSeqRef = { current: 0 }, configVersionRef = { current: 1 }, headRevisionRef = { current: h.initial.head };
    const lastSavedSignatureRef = { current: h.initial.stableSignature };
    const interactionStateRef = { current: createInteractionState() };
    const query = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: query }, children);
    const hook = renderHook(() => {
      const commit = useTimelineCommit({ eventBus, lastSavedSignatureRef, initialData: h.initial });
      const persistence = useTimelinePersistence({ ...commit, provider: h.popup, timelineId: 'popup-session', eventBus,
        savedSeqRef, configVersionRef, headRevisionRef, lastSavedSignatureRef, interactionStateRef });
      useEffect(() => eventBus.on('scheduleSave', persistence.scheduleSave), [persistence.scheduleSave]);
      const editing = useClipEditing({ ...commit, selectedClipId: 'occ-1:clip-1', selectedTrack: h.initial.tracks[0],
        currentTime: 0.5, selectClip: vi.fn(), resolvedConfig: commit.data?.resolvedConfig ?? null });
      return { commit, persistence, editing };
    }, { wrapper });
    act(() => hook.result.current.editing.handleSelectedClipChange({ at: 0.8 }));
    await waitFor(() => expect(savedSeqRef.current).toBe(1));
    expect(h.requests).toHaveLength(1);
    const request = h.requests[0].request;
    expect(request).toMatchObject({ timeline_id: 'document-primary', base_revision_id: 'timeline-rev-2', source: { via: 'app' },
      scope: { target: 'occurrence:occ-1', content: 'this-occurrence', shot_id: 'shot-alpha', shot_revision_id: 'rev-a',
        internal_revision_id: 'timeline-alpha-a', complete: ['clips', 'tracks'], projection_version: 1 },
      change: { commands: [{ op: 'clip.nudge', select: 'occurrence:occ-1/clip:clip-1', resolved: ['occurrence:occ-1/clip:clip-1'],
        args: { frames: 9 }, expect: { at: { state: 'present', value: 0.5 } } }] },
    });
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.exactReads).toEqual(['ack-head']);
    expect(h.loadAtHead).toHaveBeenCalledWith({ projectId: 'project-001', parentDocumentId: 'document-primary', headRevisionId: 'ack-head' });
    expect(headRevisionRef.current?.headRevisionId).toBe('ack-head');
    expect(h.adopted).toHaveBeenCalledOnce();
    expect(h.popup.getTimelineDraftRecoveryMetadata!().baseHeadRevisionId).toBe('ack-head');
    expect(h.accepted!.occurrences[1]).toEqual(h.graph.occurrences[1]);
    expect(h.accepted!.parent_composition).toEqual(h.graph.parent_composition);
    expect(h.accepted!.shot_revisions.slice(0, -1)).toEqual(h.graph.shot_revisions);
    const acknowledged = await h.popup.loadTimeline('popup-session');
    expect(acknowledged.config.clips[0]).toMatchObject({ id: 'occ-1:clip-1', at: 0.8, app: { canonical: { revisionId: 'rev-edited', internalTimelineRevisionId: 'internal-edited' } } });
    if (process.env.OCCURRENCE_EVIDENCE_PATH) writeFileSync(process.env.OCCURRENCE_EVIDENCE_PATH, JSON.stringify({
      request: h.requests[0], head: headRevisionRef.current, adoptedHead: h.adopted.mock.calls[0][0].headRevisionId,
      siblingUnchanged: true, parentUnchanged: true, fixtureOnly: true,
    }, null, 2));
    hook.unmount();
  });

  it('retries an unknown outcome with identical bytes/key and the original pins before adopting', async () => {
    const h = setupWire({ unknown: true });
    const edit = h.move();
    const save = () => h.popup.saveTimelineAtHead!('popup', edit.next.config, h.initial.head!, h.initial.registry, undefined, edit.commands, edit.context);
    await expect(save()).rejects.toThrow();
    expect(h.adopted).not.toHaveBeenCalled();
    expect(h.popup.getTimelineDraftRecoveryMetadata!().baseHeadRevisionId).toBe('timeline-rev-2');
    Object.assign(edit.context, { shotRevisionId: 'wrong-newer-pin' });
    await save();
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].bytes).toBe(h.requests[0].bytes);
    expect(h.requests[1].headers['Idempotency-Key']).toBe(h.requests[0].headers['Idempotency-Key']);
    expect(h.requests[1].request.scope.shot_revision_id).toBe('rev-a');
    if (process.env.OCCURRENCE_EVIDENCE_PATH) writeFileSync(process.env.OCCURRENCE_EVIDENCE_PATH + '.retry.json',
      JSON.stringify({ attempts: h.requests, fixtureOnly: true }, null, 2));

    expect(h.adopted).toHaveBeenCalledOnce();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('retries a failed exact acknowledged-head read without another commit', async () => {
    const h = setupWire({ readFailure: true });
    const edit = h.move();
    const save = () => h.popup.saveTimelineAtHead!('popup', edit.next.config, h.initial.head!, h.initial.registry, undefined, edit.commands, edit.context);
    await expect(save()).rejects.toThrow('exact read unavailable');
    expect(h.adopted).not.toHaveBeenCalled();
    await save();
    expect(h.requests).toHaveLength(1);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.adopted).toHaveBeenCalledOnce();
  });

  it('keeps a newer local draft behind the existing clean-baseline query gate after acknowledgement', async () => {
    let release!: () => void;
    const h = setupWire({ readGate: new Promise<void>((resolve) => { release = resolve; }) });
    const edit = h.move();
    h.popup.setDraftGeneration(1);
    h.popup.setDraftState(true);
    const saving = h.popup.saveTimelineAtHead!('popup', edit.next.config, h.initial.head!, h.initial.registry, undefined, edit.commands, edit.context);
    await waitFor(() => expect(h.loadAtHead).toHaveBeenCalledOnce());
    h.popup.setDraftGeneration(2);
    release();
    await saving;
    const acknowledged = h.adopted.mock.calls[0][0];
    expect(h.adopted.mock.calls[0].slice(1)).toEqual([1, 'timeline-rev-2']);
    const acknowledgedConfig = projectCanonicalComposition({ ...acknowledged, occurrences: [acknowledged.occurrences[0]] }).config;
    expect(h.popup.timelineQueryIdentity).toBe('timeline-rev-2');
    expect(h.popup.adoptCleanBaseline(acknowledgedConfig, acknowledged)).toBe(false);
    h.popup.setDraftState(false);
    expect(h.popup.adoptCleanBaseline(acknowledgedConfig, acknowledged)).toBe(true);
    expect(h.popup.timelineQueryIdentity).toBe('ack-head');
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('uses source property expectations rather than normalized display defaults', () => {
    const h = setupWire();
    expect(propertyGestureCommands(h.initial, 'occ-1:clip-1', { volume: 0.2 })).toEqual([{
      op: 'clip.set-look', select: 'occurrence:occ-1/clip:clip-1', resolved: ['occurrence:occ-1/clip:clip-1'],
      args: { volume: 0.2 }, expect: { volume: { state: 'absent' } },
    }]);
  });

  it('preserves occurrence target and captured pins through the existing stale-base preview/rebase', async () => {
    const h = setupWire();
    const edit = h.move();
    // A prior acknowledged operation on the same provider advances its known
    // parent head while this popup gesture retains its authored old base.
    await h.runtime.saveTimelineAtHead(h.composition.parentDocumentId, { ...edit.next.config }, h.initial.head!,
      h.initial.registry, undefined, edit.commands, edit.context);
    await h.popup.saveTimelineAtHead!('popup', edit.next.config, h.initial.head!, h.initial.registry, undefined, edit.commands, edit.context);
    expect(h.requests).toHaveLength(3);
    const preview = h.requests[1].request, accepted = h.requests[2].request;
    expect(preview.dry_run).toBe(true);
    expect(preview.base_revision_id).toBe('timeline-rev-2');
    expect(accepted.base_revision_id).toBe('ack-head');
    expect(accepted.dry_run).toBe(false);
    expect(accepted.scope).toEqual(preview.scope);
    expect(accepted.scope).toMatchObject({ target: 'occurrence:occ-1', shot_revision_id: 'rev-a', internal_revision_id: 'timeline-alpha-a' });
    expect(accepted.change).toEqual(preview.change);
    expect(accepted.request_id).not.toBe(preview.request_id);
    if (process.env.OCCURRENCE_EVIDENCE_PATH) writeFileSync(process.env.OCCURRENCE_EVIDENCE_PATH + '.rebase.json',
      JSON.stringify({ attempts: h.requests, fixtureOnly: true }, null, 2));

    expect(h.publish).not.toHaveBeenCalled();
  });

  it.each(['missing', 'ambiguous', 'mixed', 'stale', 'metadata'] as const)('sends no semantic command for %s input', async (kind) => {
    const h = setupWire();
    const edit = h.move();
    if (kind === 'missing') record(edit.next.config.clips[0].app).canonical = { ...record(edit.next.config.clips[0].app!.canonical), sourceClipId: undefined };
    if (kind === 'ambiguous') edit.next.config.clips.push(structuredClone(edit.next.config.clips[0]));
    if (kind === 'mixed') edit.commands = [...edit.commands, { ...edit.commands[0], select: 'occurrence:occ-2/clip:clip-1', resolved: ['occurrence:occ-2/clip:clip-1'] }];
    if (kind === 'stale') Object.assign(edit.context, { internalRevisionId: 'stale-internal' });
    if (kind === 'metadata') edit.next.config.app = { ...edit.next.config.app, customMetadata: { opaque: null } };
    // The existing graph writer may refuse this intentionally overlapping graph
    // at visual-seam admission; semantic routing must still fail closed first.
    const compatibility = vi.spyOn(h.popup, 'saveTimeline');
    await h.popup.saveTimelineAtHead!('popup', edit.next.config, h.initial.head!, h.initial.registry, undefined, edit.commands, edit.context).catch(() => {});
    expect(h.requests).toEqual([]);
    expect(compatibility).toHaveBeenCalledOnce();
  });

  it('refuses mixed owners in the gesture attachment before persistence', () => {
    const h = setupWire();
    const config = projectCanonicalComposition(h.composition).config;
    const data = createShotTimelineInitialData(config, 1, h.composition);
    const commands = [...moveGestureCommands(data, 'occ-1:clip-1', 0.8)!, ...moveGestureCommands(data, 'occ-2:clip-1', 4.8)!];
    attachGestureCommands(data, commands);
    expect(gestureCommandsFor(data)).toBeUndefined();
    expect(gestureOccurrenceFor(data)).toBeUndefined();
    expect(h.requests).toEqual([]);
  });

  it('rejects a stale captured parent base without a semantic or graph write', async () => {
    const h = setupWire();
    const edit = h.move();
    await expect(h.popup.saveTimelineAtHead!('popup', edit.next.config,
      { ...h.initial.head!, headRevisionId: 'stale-head' }, h.initial.registry, undefined, edit.commands, edit.context)).rejects.toThrow('older canonical head');
    expect(h.requests).toEqual([]);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('keeps a parent/occurrence mixed gesture and a missing source pin on compatibility routing', () => {
    const h = setupWire();
    const data = createShotTimelineInitialData(projectCanonicalComposition(h.composition).config, 1, h.composition);
    attachGestureCommands(data, [
      ...moveGestureCommands(data, 'occ-1:clip-1', 0.8)!,
      ...moveGestureCommands(data, 'clip-1', 0.3)!,
    ]);
    expect(gestureCommandsFor(data)).toBeUndefined();
    const identity = record(h.initial.config.clips[0].app!.canonical);
    record(h.initial.config.clips[0].app).canonical = { ...identity, internalTimelineRevisionId: undefined };
    expect(moveGestureCommands(h.initial, 'occ-1:clip-1', 0.8)).toBeUndefined();
    expect(propertyGestureCommands(h.initial, 'occ-1:clip-1', { opacity: 0.4 })).toBeUndefined();
  });
});
