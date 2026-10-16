// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider.ts';
import type { CommitRequest, CommitResult, Transport } from '@/integrations/runtime/generated.ts';
import { RUNTIME_CLIENT_SCOPES } from '@/integrations/runtime/client.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from '@/integrations/runtime/contract-metadata.ts';
import type { ShotCompositionContract } from '@/tools/video-editor/data/shotComposition.ts';
import { captureShotMetadataEdit, isCapturedShotMetadataCommand } from '@/tools/video-editor/data/canonicalShotMetadata.ts';
import { ShotEditorView } from './ShotEditorView.tsx';
import { selectCanonicalShotOccurrences } from './localTimelineShotModel.ts';
import { selectCanonicalShotViewModels } from '@/tools/video-editor/data/canonicalShotViewModel.ts';
import type { PreparedShotComposition } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter, type ShotCompositionPublishRequest } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { StaleWriteError, stableOccurrenceDeepLink } from '@/tools/video-editor/data/shotComposition.ts';
import { updateCanonicalShotName, updateCanonicalShotSettings } from '@/tools/video-editor/data/shotCompositionEditor.ts';
import type { Shot } from '@/domains/generation/types';

const capture = vi.hoisted(() => ({ persistence: null as any, onName: null as any, errors: vi.fn() }));
vi.mock('../components/ShotEditor', () => ({ ShotSettingsEditor: (props: any) => { capture.onName = props.onUpdateShotName; return null; } }));
vi.mock('../providers', () => ({
  VideoTravelSettingsProvider: (props: any) => { capture.persistence = props.shotSettingsPersistence; return props.children; },
  useVideoTravelSettingsMutations: () => ({ settings: {}, status: 'loading' }),
}));
vi.mock('../components/ShotTimelinePreview.tsx', () => ({ ShotTimelinePreview: () => null }));
vi.mock('../components/VideoTravelFloatingOverlay', () => ({ VideoTravelFloatingOverlay: () => null }));
// The frozen browser input lacks Tool catalog bytes; navigation is outside this callback boundary.
vi.mock('@/shared/lib/tooling/toolRoutes.ts', () => ({ shotListLocation: (pathname: string, search: string) => ({ pathname, search, hash: '' }) }));
vi.mock('@/shared/state/selectionStore', () => ({ useCurrentShot: () => ({ setCurrentShotId: vi.fn() }) }));
vi.mock('@/shared/hooks/mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/shared/hooks/shots/useShotNavigation', () => ({ useShotNavigation: () => ({ navigateToPreviousShot: vi.fn(), navigateToNextShot: vi.fn() }) }));
vi.mock('@/shared/hooks/shots', () => ({ useUpdateShotName: () => ({ mutate: vi.fn() }) }));
vi.mock('@/shared/hooks/shots/useShotImages', () => ({ usePrimeShotImagesCache: () => undefined }));
vi.mock('@/shared/hooks/invalidation/useGenerationInvalidation', () => ({ useEnqueueGenerationsInvalidation: () => vi.fn() }));
vi.mock('@/shared/hooks/projects/useProjectVideoCountsCache', () => ({ useProjectVideoCountsCache: () => ({ getFinalVideoCount: vi.fn(), getHasStructureVideo: vi.fn() }) }));
vi.mock('@/shared/hooks/projects/useProjectGenerationModesCache', () => ({ useProjectGenerationModesCache: () => ({ updateShotMode: vi.fn() }) }));
vi.mock('@/shared/hooks/gallery/useVideoGalleryPreloader', () => ({ useVideoGalleryPreloader: () => undefined }));
vi.mock('../hooks/useStickyHeader', () => ({ useStickyHeader: () => ({}) }));
vi.mock('../hooks/navigation/useNavigationState', () => ({ useNavigationState: () => ({ sortedShots: [], hasPrevious: false, hasNext: false }) }));
vi.mock('../hooks/useOperationTracking', () => ({ useOperationTracking: () => ({ setIsDraggingInTimeline: vi.fn(), signalShotOperation: vi.fn() }) }));
vi.mock('@/shared/state/panesStore', () => ({ usePanesStore: (select: any) => select({}) }));
vi.mock('@/shared/lib/errorHandling/runtimeError.ts', () => ({ normalizeAndPresentError: capture.errors }));

afterEach(() => { cleanup(); capture.errors.mockClear(); capture.persistence = null; capture.onName = null; });

async function setup() {
  let current = structuredClone(fixture);
  const publish = vi.fn(async (request: ShotCompositionPublishRequest) => {
    if (request.expectedHeadRevisionId !== current.primary_timeline.head.revision_id) throw new StaleWriteError('fixture competing immutable head');
    current = request.graph as typeof current;
    return current;
  });
  const adapter = createShotCompositionAdapter({ load: async () => current, publish });
  const base = await adapter.load({ projectId: 'project-001', parentDocumentId: 'document-primary' });
  const occurrence = base.occurrences.find((value) => value.occurrenceId === 'occ-1')!;
  render(<MemoryRouter initialEntries={['/tools/travel-between-images?localProject=project-001&localTimeline=document-primary']}>
    <ShotEditorView shotToEdit={{ id: 'shot-alpha', name: 'Original', images: [] } as unknown as Shot}
      selectedProjectId="project-001" isNewlyCreatedShot={false} shotFromState={undefined} shots={[]}
      availableLoras={[]} canonicalComposition={base} canonicalShotComposition={adapter}
      canonicalOccurrence={occurrence} />
  </MemoryRouter>);
  return { base, publish, read: () => current, compete: (graph: typeof current) => { current = graph; } };
}

describe('current App shot editing base', () => {
  it.each(['name', 'settings'] as const)('rejects a competing %s edit instead of silently adopting its new head', async (field) => {
    const state = await setup();
    if (field === 'settings') await capture.persistence.load('shot-alpha');
    const competing = field === 'name'
      ? await updateCanonicalShotName(state.base.contract, 'occ-1', 'Competing name')
      : await updateCanonicalShotSettings(state.base.contract, 'occ-1', { prompt: 'Competing prompt' });
    state.compete(competing as typeof fixture);
    if (field === 'name') {
      capture.onName('My older name');
      await waitFor(() => expect(capture.errors).toHaveBeenCalled());
      expect(capture.errors.mock.calls[0]?.[0]).toBeInstanceOf(StaleWriteError);
    } else {
      await expect(capture.persistence.save('shot-alpha', { prompt: 'My older prompt' })).rejects.toBeInstanceOf(StaleWriteError);
    }
    expect(state.publish).toHaveBeenCalledWith(expect.objectContaining({ expectedHeadRevisionId: state.base.headRevisionId }));
    expect(state.read()).toEqual(competing);
  });

  it('keeps the immutable editing head for an independent competing field too', async () => {
    const state = await setup();
    await capture.persistence.load('shot-alpha');
    const competing = await updateCanonicalShotName(state.base.contract, 'occ-1', 'Independent name');
    state.compete(competing as typeof fixture);
    await expect(capture.persistence.save('shot-alpha', { prompt: 'My prompt' })).rejects.toBeInstanceOf(StaleWriteError);
    expect(state.read()).toEqual(competing);
  });
  it.each(['name', 'settings'] as const)('publishes an uncontended %s edit from its captured head', async (field) => {
    const state = await setup();
    if (field === 'name') {
      capture.onName('My name');
      await waitFor(() => expect(state.publish).toHaveBeenCalledOnce());
      expect(capture.errors).not.toHaveBeenCalled();
    } else {
      await capture.persistence.load('shot-alpha');
      await capture.persistence.save('shot-alpha', { prompt: 'First prompt' });
      const ownHead = state.read().primary_timeline.head.revision_id;
      await capture.persistence.save('shot-alpha', { prompt: 'Second prompt' });
      expect(state.publish.mock.calls[1]?.[0].expectedHeadRevisionId).toBe(ownHead);
    }
    expect(state.publish.mock.calls[0]?.[0].expectedHeadRevisionId).toBe(state.base.headRevisionId);
    expect(state.read().primary_timeline.head.revision_id).not.toBe(state.base.headRevisionId);
  });

});

// Same generated-client/immutable-read seam as the E017 popup tests. This is
// disposable App transport evidence, not an installed producer or Runtime run.
async function setupMetadata(options: { lost?: boolean; readFailure?: boolean; refuse?: boolean; presentNull?: boolean; absent?: boolean; suffix?: boolean; empty?: boolean } = {}) {
  const graph = structuredClone(fixture) as unknown as ShotCompositionContract;
  const revision = graph.shot_revisions.find((item) => item.shot_id === 'shot-alpha')!;
  revision.name = 'Legacy display name';
  if (options.empty) (revision.internal_timeline_revision as Record<string, unknown>).timeline = { clips: [], tracks: [] };
  revision.provenance = { opaque: { retain: null }, ...(options.absent ? {} : { name: 'Authored name' }) };
  revision.metadata = { opaque: { retain: false }, ...(options.absent ? {} : { settings: options.presentNull ? null : {
    prompt: 'Authored prompt', opaque: { nested: null }, steerableMotionSettings: { unknownSibling: 7 },
  } }) };
  const prepare = createShotCompositionAdapter({ load: vi.fn() }).prepare;
  const base = prepare(graph);
  const accepted = structuredClone(graph);
  (accepted.primary_timeline.head as Record<string, unknown>).revision_id = 'metadata-ack';
  const occurrence = accepted.occurrences.find((item) => item.occurrence_id === 'occ-1')!;
  occurrence.revision_id = 'metadata-shot';
  occurrence.stable_deep_link = stableOccurrenceDeepLink(base.projectId, base.parentDocumentId, 'shot-alpha', 'metadata-shot', 'occ-1');
  const edited = structuredClone(revision);
  edited.revision_id = 'metadata-shot';
  accepted.shot_revisions.push(edited);
  const requests: { request: CommitRequest; bytes: string; headers: Record<string, string>; result: CommitResult }[] = [];
  const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  let failRead = options.readFailure;
  const transport: Transport = async (method, path, _headers, body) => {
    if (path === '/v1/health') return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 }) };
    if (path === '/v1/handshake') return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 'fixture', actor_id: 'reigh-product-connector', realm_id: 'fixture', scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }) };
    if (path === '/v1/realm') return { status: 200, headers: {}, body: json({ realm_id: 'fixture' }) };
    if (method === 'POST' && path.endsWith('/commit')) {
      const bytes = new TextDecoder().decode(body as Uint8Array);
      const request = JSON.parse(bytes) as CommitRequest;
      const commands = 'commands' in request.change ? request.change.commands : [];
      const returnedCommands = request.dry_run && options.suffix ? commands.map((command) => ({ ...command, args: { ...command.args, values: { name: 'server suffix' } } })) : commands;
      const result: CommitResult = {
        status: options.refuse ? 'refused' : request.dry_run ? 'preview' : 'accepted', request_id: request.request_id,
        request_hash: 'fixture', base_revision_id: request.base_revision_id,
        accepted_revision_id: options.refuse || request.dry_run ? null : 'metadata-ack', accepted_publication_id: null,
        previous_revision_id: request.base_revision_id, rebased_onto: request.dry_run ? 'metadata-ack' : null,
        canonical_document: null, projection_version: 1, document_digest: null, id_map: {},
        change: { changes: [], commands: returnedCommands, direct_writes: [], consequences: [], affected: [] },
        conflicts: [], choices: [], provenance: null, evidence: null, schema_report: null, runtime_receipt: null,
        error: options.refuse ? { code: 'bad_request', message: 'late invalid placement/child', hint: 'fixture', next_action: 'fix' } : null,
      };
      // Fake immutable receipt payload, restricted to the fields under test;
      // producer semantics and atomic storage still require the paired Runtime flow.
      if (!request.dry_run && !options.refuse) for (const command of commands) {
        const values = command.args.values as Record<string, unknown> | undefined;
        if (values && Object.prototype.hasOwnProperty.call(values, 'name')) edited.provenance = { ...(edited.provenance as Record<string, unknown>), name: values.name };
        if (values && Object.prototype.hasOwnProperty.call(values, 'settings')) edited.metadata = { ...(edited.metadata as Record<string, unknown>), settings: values.settings };
      }
      requests.push({ request, bytes, headers: { 'Idempotency-Key': _headers['Idempotency-Key'], 'X-Astrid-Session': _headers['X-Astrid-Session'] }, result });
      if (options.lost && requests.length === 1) throw new Error('lost metadata acknowledgement');
      return { status: 200, headers: {}, body: json(result) };
    }
    if (method === 'GET' && path.endsWith('/composition-revisions/metadata-ack')) return { status: 200, headers: {}, body: json({
      project_id: base.projectId, timeline_id: base.parentDocumentId, revision_id: 'metadata-ack', payload: accepted.parent_composition,
    }) };
    throw new Error(`Unexpected metadata fixture call ${method} ${path}`);
  };
  const runtime = new RuntimeDataProvider({ projectId: base.projectId, baseUrl: 'http://runtime.fixture', token: 'fixture-only', transport,
    commitSessionStorage: null, commitRouting: { enabled: true } });
  const publish = vi.fn();
  const loadAtHead = vi.fn(async ({ headRevisionId }: { headRevisionId: string }) => {
    expect(headRevisionId).toBe('metadata-ack');
    if (failRead) { failRead = false; throw new Error('exact metadata closure read unavailable'); }
    return accepted;
  });
  const adapter = createShotCompositionAdapter({ ...runtime.shotComposition, load: async () => graph, loadAtHead, publish });
  const published = vi.fn();
  render(<MemoryRouter initialEntries={['/tools/travel-between-images?localProject=project-001&localTimeline=document-primary']}>
    <ShotEditorView shotToEdit={{ id: 'display-row-not-shot-id', name: 'Display defaults', images: [] } as unknown as Shot}
      selectedProjectId="project-001" isNewlyCreatedShot={false} shotFromState={undefined} shots={[]}
      availableLoras={[]} canonicalComposition={base} canonicalShotComposition={adapter}
      canonicalOccurrence={base.occurrences.find((item) => item.occurrenceId === 'occ-1')!}
      onCanonicalCompositionPublished={published} />
  </MemoryRouter>);
  return { base, graph, requests, publish, published, loadAtHead, runtime, adapter };
}

describe('D012 mounted shot metadata callback boundary', () => {
  it('renames one captured occurrence with one exact shot.set commit, including an empty child timeline', async () => {
    const h = await setupMetadata({ empty: true });
    const before = structuredClone(h.graph);
    capture.onName('New name');
    await waitFor(() => expect(h.published).toHaveBeenCalledOnce());
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(1);
    const request = h.requests[0].request;
    expect(request).toMatchObject({ base_revision_id: h.base.headRevisionId, project_id: 'project-001', timeline_id: 'document-primary', source: { via: 'app' },
      scope: { target: 'occurrence:occ-1', content: 'this-occurrence', shot_id: 'shot-alpha', shot_revision_id: 'rev-a', internal_revision_id: 'timeline-alpha-a' } });
    expect(request.change).toEqual({ commands: [{ op: 'shot.set', select: 'occurrence:occ-1/shot', resolved: ['occurrence:occ-1/shot'],
      args: { source: { parent_revision_id: h.base.headRevisionId, occurrence_id: 'occ-1', shot_id: 'shot-alpha', shot_revision_id: 'rev-a', internal_revision_id: 'timeline-alpha-a' }, values: { name: 'New name' } },
      expect: { 'provenance.name': { state: 'present', value: 'Authored name' } },
    }] });
    expect(h.graph).toEqual(before); // no speculative mutation of selected/sibling/source payloads
    const acknowledged = h.published.mock.calls[0][0] as PreparedShotComposition;
    expect(h.loadAtHead).toHaveBeenCalledWith({ projectId: h.base.projectId, parentDocumentId: h.base.parentDocumentId, headRevisionId: 'metadata-ack' });
    expect(selectCanonicalShotOccurrences(acknowledged).find((item) => item.occurrenceId === 'occ-1')?.name).toBe('New name');
    expect(selectCanonicalShotViewModels(acknowledged).find((item) => item.id === 'occ-1')?.name).toBe('New name');
    expect(acknowledged.occurrences.find((item) => item.occurrenceId === 'occ-1')?.revision).toMatchObject({ name: 'Legacy display name', provenance: { name: 'New name', opaque: { retain: null } } });
    expect(acknowledged.occurrences.filter((item) => item.occurrenceId !== 'occ-1')).toEqual(h.base.occurrences.filter((item) => item.occurrenceId !== 'occ-1'));
    if (process.env.SHOT_METADATA_EVIDENCE_PATH) writeFileSync(process.env.SHOT_METADATA_EVIDENCE_PATH, JSON.stringify({ fixtureOnly: true, request, result: h.requests[0].result }, null, 2));
  });

  it('saves settings with authored expectations and preserves unknown settings siblings', async () => {
    const h = await setupMetadata();
    await capture.persistence.load('display-row-not-shot-id');
    await capture.persistence.save('display-row-not-shot-id', { prompt: 'Updated', steerableMotionSettings: { known: 2 } });
    expect(h.requests).toHaveLength(1);
    expect(h.publish).not.toHaveBeenCalled();
    const command = 'commands' in h.requests[0].request.change ? h.requests[0].request.change.commands[0] : undefined;
    expect(command?.args.values).toEqual({ settings: { prompt: 'Updated', opaque: { nested: null }, steerableMotionSettings: { unknownSibling: 7, known: 2 } } });
    expect(command?.expect?.['metadata.settings']).toEqual({ state: 'present', value: { prompt: 'Authored prompt', opaque: { nested: null }, steerableMotionSettings: { unknownSibling: 7 } } });
    expect(command?.expect).not.toHaveProperty('provenance.name');
    const acknowledged = h.published.mock.calls[0][0] as PreparedShotComposition;
    expect(selectCanonicalShotOccurrences(acknowledged).find((item) => item.occurrenceId === 'occ-1')?.settings).toEqual({ prompt: 'Updated', opaque: { nested: null }, steerableMotionSettings: { unknownSibling: 7, known: 2 } });
    expect(acknowledged.occurrences.find((item) => item.occurrenceId === 'occ-1')?.revision.metadata).toMatchObject({ opaque: { retain: false } });
    expect(h.published).toHaveBeenCalledOnce();
    if (process.env.SHOT_SETTINGS_EVIDENCE_PATH) writeFileSync(process.env.SHOT_SETTINGS_EVIDENCE_PATH, JSON.stringify({ fixtureOnly: true, ...h.requests[0] }, null, 2));
  });

  it('retains the existing explicit optional-setting removal while preserving omitted unknown fields', async () => {
    const h = await setupMetadata();
    const revision = h.base.occurrences.find((item) => item.occurrenceId === 'occ-1')!.revision;
    const settings = (revision.metadata as Record<string, unknown>).settings as Record<string, unknown>;
    settings.customWidth = 640;
    await capture.persistence.save('display-row-not-shot-id', { customWidth: undefined });
    const change = h.requests[0].request.change;
    const command = 'commands' in change ? change.commands[0] : undefined;
    expect(command?.args.values).toEqual({ settings: { prompt: 'Authored prompt', opaque: { nested: null }, steerableMotionSettings: { unknownSibling: 7 } } });
    expect(command?.expect?.['metadata.settings']).toEqual({ state: 'present', value: { ...settings, customWidth: 640 } });
  });

  it.each(['null', 'absent'] as const)('keeps %s settings expectations distinct from normalized defaults', async (presence) => {
    const h = await setupMetadata({ presentNull: presence === 'null', absent: presence === 'absent' });
    await capture.persistence.load('display-row-not-shot-id');
    await capture.persistence.save('display-row-not-shot-id', { prompt: 'new' });
    const change = h.requests[0].request.change;
    expect('commands' in change && change.commands[0].expect?.['metadata.settings']).toEqual(presence === 'null' ? { state: 'present', value: null } : { state: 'absent' });
  });

  it('keeps request bytes and captured source pins through response loss and caller mutation', async () => {
    const h = await setupMetadata({ lost: true });
    await expect(capture.persistence.save('display-row-not-shot-id', { prompt: 'retry' })).rejects.toThrow();
    expect(h.published).not.toHaveBeenCalled();
    const selected = h.base.occurrences.find((item) => item.occurrenceId === 'occ-1')!;
    selected.revision.internal_timeline_revision = { revision_id: 'mutated-pin' };
    await capture.persistence.save('display-row-not-shot-id', { prompt: 'retry' });
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].bytes).toBe(h.requests[0].bytes);
    expect(h.requests[1].headers).toEqual(h.requests[0].headers);
    expect(h.published).toHaveBeenCalledOnce();
  });

  it('keeps a newer settings edit in the existing provider queue until an uncertain attempt is retried', async () => {
    const h = await setupMetadata({ lost: true });
    await expect(capture.persistence.save('display-row-not-shot-id', { prompt: 'first' })).rejects.toThrow();
    const newer = capture.persistence.save('display-row-not-shot-id', { prompt: 'newer' });
    expect(h.requests).toHaveLength(1);
    await capture.persistence.save('display-row-not-shot-id', { prompt: 'first' });
    await newer;
    expect(h.requests).toHaveLength(4); // original, exact retry, newer preview, actual suffix
    expect(h.requests[1].bytes).toBe(h.requests[0].bytes);
    expect(h.requests[2].request.dry_run).toBe(true);
    const actual = h.requests[3].request.change;
    expect('commands' in actual && actual.commands[0].args.values).toMatchObject({ settings: { prompt: 'newer' } });
    expect(h.published).toHaveBeenCalledTimes(2);
  });

  it('retries the mounted name callback with its original request after response loss', async () => {
    const h = await setupMetadata({ lost: true });
    capture.onName('Retry title');
    await waitFor(() => expect(capture.errors).toHaveBeenCalledOnce());
    expect(h.published).not.toHaveBeenCalled();
    capture.onName('Retry title');
    await waitFor(() => expect(h.published).toHaveBeenCalledOnce());
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].bytes).toBe(h.requests[0].bytes);
    expect(h.requests[1].headers).toEqual(h.requests[0].headers);
  });

  it('sends whole-settings null as a present value through the mounted persistence callback', async () => {
    const h = await setupMetadata();
    await capture.persistence.save('display-row-not-shot-id', null);
    const change = h.requests[0].request.change;
    expect('commands' in change && change.commands[0].args.values).toEqual({ settings: null });
    expect('commands' in change && change.commands[0].args).not.toHaveProperty('clear');
    expect(h.published).toHaveBeenCalledOnce();
  });

  it('refuses mismatched source closure and mixed shot/clip batches before transport', async () => {
    const h = await setupMetadata();
    const captured = captureShotMetadataEdit(h.base, 'occ-1', { values: { name: 'next' } });
    const head = { projectId: h.base.projectId, timelineId: h.base.parentDocumentId, headRevisionId: h.base.headRevisionId };
    const mismatched = { ...captured.command, args: { ...captured.command.args,
      source: { ...(captured.command.args.source as Record<string, unknown>), shot_id: 'sibling' } } };
    await expect(h.runtime.saveTimelineAtHead(head.timelineId, captured.config, head, undefined, undefined, [mismatched], captured.context)).rejects.toThrow('exact pins');
    await expect(h.runtime.saveTimelineAtHead(head.timelineId, captured.config, head, undefined, undefined,
      [captured.command, { ...captured.command, op: 'clip.nudge', select: 'occurrence:occ-1/clip:clip-1' }], captured.context)).rejects.toThrow('exact pins');
    expect(h.requests).toHaveLength(0);
  });

  it('retries an exact accepted-head read without another write or partial local acceptance', async () => {
    const h = await setupMetadata({ readFailure: true });
    await expect(capture.persistence.save('display-row-not-shot-id', { prompt: 'retry' })).rejects.toThrow('exact metadata closure');
    expect(h.published).not.toHaveBeenCalled();
    await capture.persistence.save('display-row-not-shot-id', { prompt: 'retry' });
    expect(h.requests).toHaveLength(1);
    expect(h.loadAtHead).toHaveBeenCalledTimes(2);
    expect(h.published).toHaveBeenCalledOnce();
  });

  it('does not accept a late Runtime refusal or send an unsupported structural command', async () => {
    const h = await setupMetadata({ refuse: true });
    const before = structuredClone(h.graph);
    await expect(capture.persistence.save('display-row-not-shot-id', { prompt: 'refused' })).rejects.toThrow('late invalid placement/child');
    expect(h.requests).toHaveLength(1);
    expect(h.published).not.toHaveBeenCalled();
    expect(h.graph).toEqual(before);
    const captured = captureShotMetadataEdit(h.base, 'occ-1', { values: { name: 'next' } });
    for (const op of ['occurrence.set', 'occurrence.add']) {
      expect(isCapturedShotMetadataCommand({ ...captured.command, op }, captured.context)).toBe(false);
    }
  });

  it('constructs explicit clear and present-null values without conflating omitted fields', async () => {
    const h = await setupMetadata();
    const cleared = captureShotMetadataEdit(h.base, 'occ-1', { clear: ['name'] });
    expect(cleared.command.args).toHaveProperty('clear', ['name']);
    expect(cleared.command.args).not.toHaveProperty('values');
    expect(cleared.command.expect).not.toHaveProperty('metadata.settings');
    const nulled = captureShotMetadataEdit(h.base, 'occ-1', { values: { settings: null } });
    expect(nulled.command.args).toHaveProperty('values', { settings: null });
    expect(nulled.command.args).not.toHaveProperty('clear');
    expect(() => captureShotMetadataEdit(h.base, 'occ-1', { values: { name: 'conflict' }, clear: ['name'] })).toThrow();
    expect(h.requests).toHaveLength(0); // no new clear UI was mounted by this test
  });

  it('uses only returned suffix commands after the existing provider previews a captured older head', async () => {
    const h = await setupMetadata({ suffix: true });
    capture.onName('first');
    await waitFor(() => expect(h.published).toHaveBeenCalledTimes(1));
    capture.onName('second');
    await waitFor(() => expect(h.published).toHaveBeenCalledTimes(2));
    expect(h.requests).toHaveLength(3);
    expect(h.requests[1].request).toMatchObject({ dry_run: true, base_revision_id: h.base.headRevisionId });
    expect(h.requests[2].request).toMatchObject({ dry_run: false, base_revision_id: 'metadata-ack' });
    const actual = h.requests[2].request.change;
    expect('commands' in actual && actual.commands[0].args.values).toEqual({ name: 'server suffix' });
    expect(h.requests[2].request.request_id).not.toBe(h.requests[1].request.request_id);
  });
});
