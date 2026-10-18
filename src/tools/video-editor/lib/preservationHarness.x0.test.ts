import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The repository's local fake IndexedDB fixture is JavaScript without declarations.
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
import { ReighRuntimeClient } from '@/integrations/runtime/client.ts';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider.ts';
import { RUNTIME_CLIENT_SCOPES } from '@/integrations/runtime/client.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from '@/integrations/runtime/contract-metadata.ts';
import type { Transport } from '@/integrations/runtime/generated.ts';
import { AstridElementOperationAdapter, createElementTimelineRoutes } from '@/tools/video-editor/runtime/element-adapter.ts';
import { buildReighAgentElementContext } from '@/tools/video-editor/runtime/element-contract.ts';
import { ASTRID_EFFECT_CATALOG } from '@/tools/video-editor/runtime/astrid-element-catalog.ts';
import { useTimelineOps } from '@/tools/video-editor/hooks/useTimelineOps.ts';
import { useTimelinePersistence } from '@/tools/video-editor/hooks/useTimelinePersistence.ts';
import { TimelineEventBus } from '@/tools/video-editor/hooks/useTimelineEventBus.ts';
import { createInteractionState } from '@/tools/video-editor/lib/interaction-state.ts';
import { createTimelineReader } from '@/tools/video-editor/lib/timeline-reader.ts';
import { createProposalRuntime } from '@/tools/video-editor/lib/proposal-runtime.ts';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { createShotCompositionAdapter, type PreparedShotComposition } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { ShotCompositionContract } from '@/tools/video-editor/data/shotComposition.ts';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { createShotTimelineDataProvider, createShotTimelineInitialData } from '@/tools/travel-between-images/components/shotTimelineDataProvider.ts';
import { loadTimelineDraft } from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import { cloneAssetRegistry } from '@/tools/video-editor/lib/timeline-domain.ts';
import { resolveTimelineConfig } from '@/tools/video-editor/lib/config-utils.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import { serializeForDisk } from '@/tools/video-editor/lib/serialize.ts';
import type { AssetRegistry, ResolvedTimelineConfig, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import shotCompositionFixture from '@/tools/video-editor/data/shotComposition.fixture.json';

/**
 * S-PRES contract (WS-SAVE): opaque and unknown fields are kept across every
 * covered App save path: top-level config, `config.app` namespaces, clip and
 * track `app`, unknown clip fields, registry metadata, and the bundle. A known
 * field clear is the explicit `{"op":"clear"}` operation within its declared
 * coverage. Absent or removed values never reappear after save or exact reload.
 *
 * This fixture-backed harness intentionally retains red preservation checks
 * on the assigned base. It records the observed X0 output separately from the
 * current App serializer result; neither is rewritten as a pass.
 */

type JsonRecord = Record<string, unknown>;
type PreserveAssertion = { path: string; value: unknown };
type CapturedPublication = {
  idempotency_key: string;
  body: {
    expected_head: string;
    parent_revision_id: string;
    project_id: string;
    timeline_id: string;
    parent_composition: JsonRecord;
  };
};
type Case2Fixture = {
  B0: { immutable_base: { project_id: string; timeline_id: string; revision_id: string } };
  B2: { transactions: Array<{ gesture: string }> };
  B4: { publications: CapturedPublication[] };
  B5: { exact_reloads: Array<{ receipt_revision: string; reloaded_revision_id: string; status: string }> };
  expected: { must_preserve: PreserveAssertion[] };
};
type Case1Fixture = {
  B3: { scheduled: boolean };
  B4: { publication: unknown; composition_publication_count_before_first_edit: number };
  B5: { exact_reload: unknown; receipt_revision: unknown };
  expected: { revision_created: boolean; exact_reload: boolean; status: string };
};

const fixtureRoot = process.env.PRES_HARNESS_FIXTURE_ROOT;
const runtimeBaseUrl = process.env.PRES_HARNESS_RUNTIME_BASE_URL;
const runtimeEnabled = Boolean(runtimeBaseUrl);
const popupRuntimeReady = process.env.PRES_HARNESS_POPUP_RUNTIME_READY;
const popupEvidenceDirectory = process.env.PRES_HARNESS_POPUP_EVIDENCE_DIR;
const MISSING = Symbol('missing');
const case1Fixture = fixtureRoot ? readFixture<Case1Fixture>('x0-1-editor.json') : null;
const case2Fixture = fixtureRoot ? readFixture<Case2Fixture>('x0-2-editor.json') : null;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a fixture object');
  }
  return value as JsonRecord;
}

function readFixture<T>(name: string): T {
  if (!fixtureRoot) throw new Error('Set PRES_HARNESS_FIXTURE_ROOT to the admitted X0-EDITOR fixture directory');
  return JSON.parse(readFileSync(join(fixtureRoot, name), 'utf8')) as T;
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readDeep(value: unknown, parts: string[]): unknown | typeof MISSING {
  let current = value;
  for (const part of parts) {
    const object = current && typeof current === 'object' && !Array.isArray(current)
      ? current as JsonRecord
      : undefined;
    if (!object || !Object.prototype.hasOwnProperty.call(object, part)) return MISSING;
    current = object[part];
  }
  return current;
}

function writeDeep(value: JsonRecord, parts: string[], next: unknown): void {
  let current = value;
  for (const part of parts.slice(0, -1)) {
    const child = current[part];
    if (!child || typeof child !== 'object' || Array.isArray(child)) current[part] = {};
    current = current[part] as JsonRecord;
  }
  current[parts[parts.length - 1]!] = next;
}

function indexedPath(parent: JsonRecord, path: string): unknown | typeof MISSING {
  const indexed = /^(clips|tracks)\[([^\]]+)\]\.(.+)$/.exec(path);
  if (!indexed) return MISSING;
  const config = asRecord(parent.config);
  const collection = config[indexed[1]!];
  if (!Array.isArray(collection)) return MISSING;
  const item = collection.map(asRecord).find((candidate) => candidate.id === indexed[2]);
  return item ? readDeep(item, indexed[3]!.split('.')) : MISSING;
}

function readPreservationPath(parent: JsonRecord, path: string): unknown | typeof MISSING {
  if (path.startsWith('config.')) return readDeep(parent.config, path.slice('config.'.length).split('.'));
  if (path === 'unknownParentField') return readDeep(parent, ['unknownParentField']);
  if (path === 'registry.metadata') return readDeep(parent.registry, ['metadata']);

  const assetPath = /^registry\.assets\[([^\]]+)\]\.(.+)$/.exec(path);
  if (assetPath) {
    return readDeep(parent.registry, ['assets', assetPath[1]!, ...assetPath[2]!.split('.')]);
  }

  if (path.startsWith('clips[') || path.startsWith('tracks[')) return indexedPath(parent, path);
  return MISSING;
}

function writePreservationPath(parent: JsonRecord, path: string, value: unknown): void {
  if (path.startsWith('config.')) {
    writeDeep(asRecord(parent.config), path.slice('config.'.length).split('.'), value);
    return;
  }
  if (path === 'unknownParentField') {
    parent.unknownParentField = value;
    return;
  }
  if (path === 'registry.metadata') {
    writeDeep(asRecord(parent.registry), ['metadata'], value);
    return;
  }

  const assetPath = /^registry\.assets\[([^\]]+)\]\.(.+)$/.exec(path);
  if (assetPath) {
    writeDeep(asRecord(parent.registry), ['assets', assetPath[1]!, ...assetPath[2]!.split('.')], value);
    return;
  }

  const indexed = /^(clips|tracks)\[([^\]]+)\]\.(.+)$/.exec(path);
  if (indexed) {
    const config = asRecord(parent.config);
    const collection = config[indexed[1]!];
    if (!Array.isArray(collection)) throw new Error(`Missing ${indexed[1]} for ${path}`);
    const item = collection.map(asRecord).find((candidate) => candidate.id === indexed[2]);
    if (!item) throw new Error(`Missing ${indexed[1]} entry ${indexed[2]} for ${path}`);
    writeDeep(item, indexed[3]!.split('.'), value);
    return;
  }
  throw new Error(`Unsupported fixture preservation path: ${path}`);
}

function restoreRecordedBase(parentValue: JsonRecord, preserve: PreserveAssertion[]): JsonRecord {
  const parent = cloneRecord(parentValue);
  for (const assertion of preserve) writePreservationPath(parent, assertion.path, assertion.value);
  return parent;
}

function missingPreservationPaths(parent: JsonRecord, preserve: PreserveAssertion[]): string[] {
  return preserve
    .filter((assertion) => !isDeepStrictEqual(readPreservationPath(parent, assertion.path), assertion.value))
    .map((assertion) => assertion.path)
    .sort();
}

function observedCase2LossPaths(parent: JsonRecord): string[] {
  const registry = asRecord(parent.registry);
  const assets = asRecord(registry.assets);
  const assetMetadataFields = ['asset_id', 'digest', 'media_type', 'object_id', 'role', 'scope'];
  const assetLosses = Object.keys(assets).flatMap((assetId) =>
    assetMetadataFields.map((field) => `registry.assets[${assetId}].${field}`));
  const trackLosses = ['video', 'audio', 'titles', 'source-video'].map((trackId) => `tracks[${trackId}].name`);
  return ['registry.metadata', ...assetLosses, ...trackLosses].sort();
}

const unchangedCase2SentinelPaths = [
  'config.app',
  'config.vendorNamespace',
  'config.unknownConfigField',
  'config.bundle',
  'unknownParentField',
  'clips[parent-clip-one].app',
  'clips[parent-clip-one].unknownClipField',
  'clips[parent-clip-two].clipType',
  'clips[parent-clip-two].steps',
  'tracks[source-video].app.source',
  'tracks[source-video].app.x0TrackSentinel',
];

async function runAppSerializer(parent: JsonRecord): Promise<{ config: TimelineConfig; registry: AssetRegistry }> {
  const sourceConfig = asRecord(parent.config);
  const inputConfig = {
    ...sourceConfig,
    // `output` is derived editor state and is stripped by serializeForDisk.
    output: createDefaultTimelineConfig().output,
  } as unknown as TimelineConfig;
  const sourceRegistry = parent.registry as AssetRegistry;
  const resolved = await resolveTimelineConfig(
    inputConfig,
    sourceRegistry,
    async (file) => `https://fixture.invalid/${encodeURIComponent(file)}`,
  );
  return {
    config: serializeForDisk(resolved as ResolvedTimelineConfig),
    registry: cloneAssetRegistry(sourceRegistry),
  };
}

describe.skipIf(!fixtureRoot)('X0-EDITOR admitted preservation harness', () => {
  const case1 = case1Fixture as Case1Fixture;
  const case2 = case2Fixture as Case2Fixture;

  it('records case 1 as a no-edit open with no publication and no receipt reload', () => {
    expect(case1.B3.scheduled).toBe(false);
    expect(case1.B4.composition_publication_count_before_first_edit).toBe(0);
    expect(case1.B4.publication).toBeNull();
    expect(case1.B5.exact_reload).toBeNull();
    expect(case1.B5.receipt_revision).toBeNull();
    expect(case1.expected).toMatchObject({ revision_created: false, exact_reload: false, status: 'pass' });
  });

  it('keeps the captured case 2 red signature explicit: 23 of 34 preserved paths are absent', () => {
    expect(case2.B4.publications).toHaveLength(3);
    expect(case2.B5.exact_reloads).toHaveLength(3);
    const expectedLosses = observedCase2LossPaths(case2.B4.publications[0]!.body.parent_composition);
    expect(case2.expected.must_preserve).toHaveLength(34);
    expect(unchangedCase2SentinelPaths).toHaveLength(11);

    for (const [index, publication] of case2.B4.publications.entries()) {
      const parent = publication.body.parent_composition;
      const missing = missingPreservationPaths(parent, case2.expected.must_preserve);
      expect(publication.idempotency_key).toBe(publication.body.parent_revision_id);
      expect(publication.body.expected_head).toBe(
        index === 0 ? case2.B0.immutable_base.revision_id : case2.B5.exact_reloads[index - 1]!.receipt_revision,
      );
      expect(publication.body.project_id).toBe(case2.B0.immutable_base.project_id);
      expect(publication.body.timeline_id).toBe(case2.B0.immutable_base.timeline_id);
      expect(missing).toEqual(expectedLosses);
      expect(missing).toHaveLength(23);
      for (const path of unchangedCase2SentinelPaths) {
        const assertion = case2.expected.must_preserve.find((candidate) => candidate.path === path);
        expect(assertion, `Fixture is missing sentinel assertion ${path}`).toBeDefined();
        expect(readPreservationPath(parent, path), `Captured save changed sentinel ${path}`).toEqual(assertion!.value);
      }
      expect(case2.B5.exact_reloads[index]).toMatchObject({
        status: 'captured',
        receipt_revision: case2.B5.exact_reloads[index]!.reloaded_revision_id,
      });
    }
  });

  it('shows the admitted config.app and clip/track app sentinels still pass App resolution and serialization', async () => {
    for (const publication of case2.B4.publications) {
      const parent = restoreRecordedBase(publication.body.parent_composition, case2.expected.must_preserve);
      const sourceConfig = asRecord(parent.config);
      const resolvedAndSerialized = await runAppSerializer(parent);

      expect(resolvedAndSerialized.config.app).toEqual(sourceConfig.app);
      for (const clipId of ['parent-clip-one', 'parent-clip-two']) {
        const sourceClip = asRecord((sourceConfig.clips as unknown[]).map(asRecord).find((clip) => clip.id === clipId));
        const serializedClip = resolvedAndSerialized.config.clips.find((clip) => clip.id === clipId);
        if (sourceClip.app !== undefined) expect(serializedClip?.app).toEqual(sourceClip.app);
      }
      for (const track of sourceConfig.tracks as Array<Record<string, unknown>>) {
        if (track.app !== undefined) {
          expect(resolvedAndSerialized.config.tracks?.find((candidate) => candidate.id === track.id)?.app).toEqual(track.app);
        }
      }
    }
  });

  it('preserves every admitted X0 sentinel through the assigned App serializer (base red)', async () => {
    const findings: Array<{ gesture: string; missing: string[] }> = [];
    const serializerPaths = case2.expected.must_preserve.filter(({ path }) => path !== 'unknownParentField');

    for (const [index, publication] of case2.B4.publications.entries()) {
      const parent = restoreRecordedBase(publication.body.parent_composition, case2.expected.must_preserve);
      const serialized = await runAppSerializer(parent);
      const actual = { config: serialized.config, registry: serialized.registry } as JsonRecord;
      const missing = missingPreservationPaths(actual, serializerPaths);
      // A finding denotes a loss; keep the original empty-findings assertion
      // meaningful once every path survives, and check each snapshot directly.
      expect(missing, case2.B2.transactions[index]!.gesture).toEqual([]);
      if (missing.length === 0) continue;
      findings.push({ gesture: case2.B2.transactions[index]!.gesture, missing });
    }

    expect(findings, `Base App serializer preservation losses:\n${JSON.stringify(findings, null, 2)}`).toEqual([]);
  });

  const exactReloadIt = runtimeEnabled ? it : it.skip;
  exactReloadIt('loads each captured receipt revision through the App Runtime client', async () => {
    const client = new ReighRuntimeClient({ baseUrl: runtimeBaseUrl! });
    const firstBody = case2.B4.publications[0]!.body;
    const projectId = String(firstBody.project_id);
    const timelineId = String(firstBody.timeline_id);

    for (const reload of case2.B5.exact_reloads) {
      const record = await client.getProjectParentCompositionRevision(projectId, timelineId, reload.receipt_revision);
      expect(record.revision_id).toBe(reload.reloaded_revision_id);
      const payload = asRecord(record.payload);
      const missing = missingPreservationPaths(payload, case2.expected.must_preserve);
      expect(missing, `Exact Runtime reload lost: ${missing.join(', ')}`).toEqual([]);
    }
  });
});

/**
 * Constructed provider replay from admitted X0-EDITOR values, never a captured
 * X0-POPUP fixture. Opt in only with a task-owned loopback Runtime/store.
 * Three shot-local geometry edits repeat the original 23 repaired-value and
 * 11 sentinel predicates; these are 69/33 comparisons, not unique defects.
 * No parent split occurs, so the 16 split-child predicates remain inapplicable
 * here and retain their separate existing editor-path proof.
 */
it.skipIf(!popupRuntimeReady || !popupEvidenceDirectory || !fixtureRoot)(
  'constructed popup provider preserves admitted X0 values through actual Runtime exact reload',
  async () => {
    const ready = JSON.parse(readFileSync(popupRuntimeReady!, 'utf8')) as {
      endpoint: string; project_id: string; timeline_id: string; base_revision: string;
      occurrence_id: string; token_file: string;
    };
    expect(new URL(ready.endpoint).hostname).toBe('127.0.0.1');
    const token = readFileSync(ready.token_file, 'utf8').trim();
    const evidence = (name: string, value: unknown) =>
      writeFileSync(join(popupEvidenceDirectory!, name), JSON.stringify(value, null, 2));
    const exchanges: Array<{
      method: string; path: string; request: unknown; idempotencyKey?: string;
      status: number; result: unknown; responseUtf8: string;
    }> = [];
    const transport: Transport = async (method, path, headers, body) => {
      const bytes = body === undefined ? undefined : Buffer.from(ArrayBuffer.isView(body)
        ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
        : await (body as Blob).arrayBuffer());
      const response = await new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>((resolve, reject) => {
        const req = request(ready.endpoint + path, {
          method, headers: { ...headers, Authorization: `Bearer ${token}`,
            ...(bytes ? { 'Content-Length': String(bytes.length) } : {}) },
        }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve({
            status: res.statusCode!,
            headers: Object.fromEntries(Object.entries(res.headers)
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
            body: Buffer.concat(chunks),
          }));
        });
        req.on('error', reject);
        if (bytes) req.write(bytes);
        req.end();
      });
      exchanges.push({
        method, path, request: bytes ? JSON.parse(bytes.toString('utf8')) : null,
        idempotencyKey: headers['Idempotency-Key'], status: response.status,
        result: JSON.parse(response.body.toString('utf8')), responseUtf8: response.body.toString('utf8'),
      });
      evidence('popup-http.json', exchanges);
      return response;
    };
    const runtime = new RuntimeDataProvider({
      projectId: ready.project_id, baseUrl: ready.endpoint, transport, commitSessionStorage: null,
    });
    const client = new ReighRuntimeClient({ baseUrl: ready.endpoint, transport });
    const adapter = createShotCompositionAdapter(runtime.shotComposition);
    const base = await client.getProjectParentCompositionRevision(
      ready.project_id, ready.timeline_id, ready.base_revision,
    );
    expect(missingPreservationPaths(asRecord(base.payload), case2Fixture!.expected.must_preserve)).toEqual([]);
    let composition = await adapter.load({ projectId: ready.project_id, parentDocumentId: ready.timeline_id });
    expect(composition.headRevisionId).toBe(ready.base_revision);
    evidence('popup-base-exact.json', base);
    evidence('popup-loaded-graph.json', composition.contract);
    const opaqueParent = Object.fromEntries(Object.entries(asRecord(base.payload))
      .filter(([key]) => !['config', 'registry', 'clips', 'occurrences'].includes(key)));
    expect(opaqueParent).toHaveProperty('unknownParentField');
    const assertOpaqueParent = (parent: JsonRecord) => {
      for (const [key, value] of Object.entries(opaqueParent)) {
        expect(Object.hasOwn(parent, key), `Opaque parent sibling ${key} is absent`).toBe(true);
        expect(parent[key], `Opaque parent sibling ${key} changed`).toEqual(value);
      }
      expect(parent).not.toHaveProperty('opaqueParentAbsent');
    };
    assertOpaqueParent(asRecord(composition.contract.parent_composition));
    const counts = { repaired: 0, unaffected: 0 };
    for (const x of [12, 24, 36]) {
      const occurrence = composition.occurrences.find((item) => item.occurrenceId === ready.occurrence_id)!;
      const config = projectCanonicalComposition({ ...composition, occurrences: [occurrence] },
        { ...createDefaultTimelineConfig(), clips: [], tracks: [], registry: {} },
        { clampToOccurrenceDuration: false }).config;
      const published: PreparedShotComposition[] = [];
      const popup = createShotTimelineDataProvider(config, composition, ready.occurrence_id, adapter,
        (next) => published.push(next));
      const session = `${ready.timeline_id}:shot:${ready.occurrence_id}`;
      const loaded = await popup.loadTimeline(session);
      const edited = { ...loaded.config,
        clips: loaded.config.clips.map((clip) => ({ ...clip, x })) };
      // Supported canonical popup publication, with no serializer shortcut.
      const configVersion = await popup.saveTimeline(session, edited, loaded.configVersion);
      expect(published).toHaveLength(1);
      const receipt = { configVersion, publication: published[0]!.publicationReceipt };
      const revision = published[0]!.headRevisionId;
      evidence(`popup-${x}-app-receipt.json`, receipt);
      expect(revision).not.toBe(composition.headRevisionId);
      const first = await client.getProjectParentCompositionRevision(ready.project_id, ready.timeline_id, revision);
      const second = await client.getProjectParentCompositionRevision(ready.project_id, ready.timeline_id, revision);
      evidence(`popup-${x}-exact-1.json`, first);
      evidence(`popup-${x}-exact-2.json`, second);
      expect(first.revision_id).toBe(revision);
      expect(second).toEqual(first);
      const reads = exchanges.filter((item) => item.method === 'GET'
        && item.path.endsWith(`/composition-revisions/${revision}`)).slice(-2);
      expect(reads).toHaveLength(2);
      expect(reads[0]!.responseUtf8).toBe(reads[1]!.responseUtf8);
      const publication = exchanges.filter((item) => item.method === 'POST'
        && item.path.endsWith('/composition-revisions')).at(-1)!;
      evidence(`popup-${x}-publication.json`, publication);
      expect(publication.status).toBe(200);
      expect(publication.idempotencyKey).toMatch(/^reigh\.shot-popup\./);
      assertOpaqueParent(asRecord(asRecord(publication.request).parent_composition));
      assertOpaqueParent(asRecord(first.payload));
      assertOpaqueParent(asRecord(second.payload));
      composition = await adapter.loadAtHead({
        projectId: ready.project_id, parentDocumentId: ready.timeline_id, headRevisionId: revision,
      });
      assertOpaqueParent(asRecord(composition.contract.parent_composition));
      const accepted = composition.occurrences.find((item) => item.occurrenceId === ready.occurrence_id)!;
      const internal = asRecord(accepted.revision.internal_timeline_revision);
      const clips = asRecord(internal.timeline).clips as JsonRecord[];
      evidence(`popup-${x}-accepted-shot.json`, accepted);
      expect(clips.length).toBeGreaterThan(0);
      expect(clips.every((clip) => clip.x === x)).toBe(true);
      const parent = asRecord(first.payload);
      const predicates = case2Fixture!.expected.must_preserve.map((check) => {
        const actual = readPreservationPath(parent, check.path);
        return { ...check, actual: actual === MISSING ? { missing: true } : actual,
          passed: isDeepStrictEqual(actual, check.value),
          category: unchangedCase2SentinelPaths.includes(check.path) ? 'unaffected' : 'repaired' };
      });
      evidence(`popup-${x}-predicates.json`, predicates);
      // Do not submit any subsequent edit after detecting a product loss.
      for (const check of predicates) {
        expect(check.passed, `Popup lost ${check.path}; see exact revision ${revision}`).toBe(true);
        counts[check.category as keyof typeof counts]++;
      }
    }
    expect(counts).toEqual({ repaired: 69, unaffected: 33 });
    evidence('popup-verification.json', { counts, splitChildAbsences: {
      applicable: 0, open: 16, reason: 'Shot-local geometry edit creates no parent split child.',
    } });
  }, 30_000,
);

type Case910PopupHarness = Awaited<ReturnType<typeof createCase910PopupHarness>>;

async function createCase910PopupHarness(options: { publicationStatus?: number } = {}) {
  const graph = structuredClone(shotCompositionFixture) as unknown as ShotCompositionContract;
  const projectId = String(graph.project.project_id);
  const parentDocumentId = String(graph.primary_timeline.document_id);
  const baseUrl = 'http://case910-runtime.fixture';
  const wire: Array<{ method: string; path: string; url: string; bytes?: string; headers: Record<string, string>; status?: number; response?: string }> = [];
  const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const transport: Transport = async (method, path, headers, body) => {
    const exchange: typeof wire[number] = { method, path, url: `${baseUrl}${path}`, headers: { ...headers } };
    if (typeof body === 'string') exchange.bytes = body;
    else if (body && typeof (body as Blob).text === 'function') exchange.bytes = await (body as Blob).text();
    else if (ArrayBuffer.isView(body)) exchange.bytes = new TextDecoder().decode(body as Uint8Array);
    if (path === '/v1/health') {
      exchange.status = 200;
      exchange.response = JSON.stringify({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 });
      wire.push(exchange);
      return { status: 200, headers: {}, body: json(JSON.parse(exchange.response)) };
    }
    if (path === '/v1/handshake') {
      exchange.status = 200;
      exchange.response = JSON.stringify({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST,
        session_id: 'case910-session', actor_id: 'reigh-product-connector', realm_id: 'case910-realm',
        scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] });
      wire.push(exchange);
      return { status: 200, headers: {}, body: json(JSON.parse(exchange.response)) };
    }
    if (path === '/v1/realm') {
      exchange.status = 200;
      exchange.response = JSON.stringify({ realm_id: 'case910-realm' });
      wire.push(exchange);
      return { status: 200, headers: {}, body: json(JSON.parse(exchange.response)) };
    }
    if (method === 'POST' && path.endsWith('/inspect')) {
      exchange.status = 200;
      exchange.response = JSON.stringify({ project_id: projectId, timeline_id: parentDocumentId,
        representation: 'canonical_head', authority: 'runtime_parent_composition', is_current_head: true,
        revision_id: graph.primary_timeline.head.revision_id,
        head_revision_id: graph.primary_timeline.head.revision_id });
      wire.push(exchange);
      return { status: 200, headers: {}, body: json(JSON.parse(exchange.response)) };
    }
    if (method === 'POST' && path.endsWith('/composition-revisions')) {
      exchange.status = options.publicationStatus ?? 503;
      exchange.response = JSON.stringify(exchange.status === 401
        ? { code: 'unauthorized', message: 'Case 9 hook harness refuses before publication acceptance' }
        : { code: 'unavailable', message: 'Case 9 harness refuses before publication acceptance' });
      wire.push(exchange);
      return { status: exchange.status, headers: {}, body: json(JSON.parse(exchange.response)) };
    }
    wire.push(exchange);
    throw new Error(`Unexpected case 9 transport ${method} ${path}`);
  };
  const runtime = new RuntimeDataProvider({
    projectId,
    baseUrl,
    transport,
    commitRouting: { enabled: true },
  });
  const publicationRequests: unknown[] = [];
  const publishAtRuntime = runtime.shotComposition.publish!;
  const adapter = createShotCompositionAdapter({
    ...runtime.shotComposition,
    getTimelineDraftRecoveryMetadata: () => ({ recoveryKey: 'case910-popup-recovery', preservePendingCommit: true }),
    load: async () => graph,
    loadAtHead: async () => graph,
    // Record the App request, then pass it through the actual provider HTTP path.
    // The refusal transport stops before Runtime can accept a publication.
    publish: async (request) => {
      publicationRequests.push(structuredClone(request));
      return publishAtRuntime(request);
    },
  });
  const composition = adapter.prepare(graph);
  const occurrence = composition.occurrences.find((item) => item.occurrenceId === 'occ-1');
  if (!occurrence) throw new Error('Case 9 fixture setup lost occurrence occ-1');
  const config = projectCanonicalComposition({ ...composition, occurrences: [occurrence] }, {
    ...createDefaultTimelineConfig(), clips: [], tracks: [], registry: {},
  }, { clampToOccurrenceDuration: false }).config;
  const popup = createShotTimelineDataProvider(config, composition, occurrence.occurrenceId, adapter);
  return { graph, runtime, adapter, composition, occurrence, config, popup, publicationRequests, wire };
}

function createCase10RefusalTransport(projectId: string) {
  const baseUrl = 'http://case10-runtime.fixture';
  const wire: Array<{ method: string; path: string; url: string; bytes?: string; headers: Record<string, string>; status?: number; response?: string }> = [];
  const sessionValues = new Map<string, string>();
  const commitSessionStorage = {
    getItem: (key: string) => sessionValues.get(key) ?? null,
    setItem: (key: string, value: string) => { sessionValues.set(key, value); },
  };
  const config = {
    ...createDefaultTimelineConfig(),
    tracks: [{ id: 'V1', kind: 'visual' as const }],
    clips: [{ id: 'catalog-target', track: 'V1', at: 0, hold: 2 }],
  };
  const payload = { config, registry: { assets: {} }, clips: structuredClone(config.clips), occurrences: [] };
  const transport: Transport = async (method, path, headers, body) => {
    const exchange: typeof wire[number] = { method, path, url: `${baseUrl}${path}`, headers: { ...headers } };
    if (typeof body === 'string') exchange.bytes = body;
    else if (body && typeof (body as Blob).text === 'function') exchange.bytes = await (body as Blob).text();
    else if (ArrayBuffer.isView(body)) exchange.bytes = new TextDecoder().decode(body as Uint8Array);
    if (path === '/v1/health') {
      exchange.status = 200;
      exchange.response = JSON.stringify({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 });
      wire.push(exchange);
      return { status: 200, headers: {}, body: new TextEncoder().encode(exchange.response) };
    }
    if (path === '/v1/handshake') {
      exchange.status = 200;
      exchange.response = JSON.stringify({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST,
        session_id: 'case10-session', actor_id: 'reigh-product-connector', realm_id: 'case10-realm',
        scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] });
      wire.push(exchange);
      return { status: 200, headers: {}, body: new TextEncoder().encode(exchange.response) };
    }
    if (path === '/v1/realm') {
      exchange.status = 200;
      exchange.response = JSON.stringify({ realm_id: 'case10-realm' });
      wire.push(exchange);
      return { status: 200, headers: {}, body: new TextEncoder().encode(exchange.response) };
    }
    if (method === 'POST' && path.endsWith('/inspect')) {
      exchange.status = 200;
      exchange.response = JSON.stringify({ project_id: projectId, timeline_id: 'case10-parent',
        representation: 'canonical_head', authority: 'runtime_parent_composition', is_current_head: true,
        revision_id: 'case10-head-0', head_revision_id: 'case10-head-0' });
      wire.push(exchange);
      return { status: 200, headers: {}, body: new TextEncoder().encode(exchange.response) };
    }
    if (method === 'GET' && path.endsWith('/composition-revisions/case10-head-0')) {
      exchange.status = 200;
      exchange.response = JSON.stringify({ project_id: projectId, timeline_id: 'case10-parent', revision_id: 'case10-head-0', payload });
      wire.push(exchange);
      return { status: 200, headers: {}, body: new TextEncoder().encode(exchange.response) };
    }
    if (method === 'POST' && path.endsWith('/commit')) {
      exchange.status = 503;
      exchange.response = JSON.stringify({ code: 'unavailable', message: 'Harness refuses before semantic acceptance' });
      wire.push(exchange);
      return { status: 503, headers: {}, body: new TextEncoder().encode(exchange.response) };
    }
    wire.push(exchange);
    throw new Error(`Unexpected case 10 transport ${method} ${path}`);
  };
  return { baseUrl, wire, transport, commitSessionStorage };
}

function extendPopupClip(config: TimelineConfig, clipId: string, endSeconds: number): TimelineConfig {
  return {
    ...config,
    clips: config.clips.map((clip) => {
      if (clip.id !== clipId) return clip;
      const { hold: _hold, duration: _duration, duration_ms: _durationMs, ...withoutDuration } = clip as typeof clip & {
        duration?: number; duration_ms?: number;
      };
      return { ...withoutDuration, from: 0, to: endSeconds, speed: 1 };
    }),
  };
}

function writeX0HarnessEvidence(name: string, evidence: unknown): void {
  const directory = process.env.X0_218_EVIDENCE_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), JSON.stringify({
    evidence_kind: 'synthetic-test-harness-only',
    live_runtime_capture: false,
    acceptance_claimed: false,
    ...asRecord(evidence),
  }, null, 2));
}

beforeEach(() => vi.stubGlobal('indexedDB', createFakeIndexedDB()));
afterEach(() => { resetFakeIndexedDB(); vi.unstubAllGlobals(); });

describe('X0 current App provider assertions', () => {
  it('case 9 low-level provider factory scheduleSave preserves loaded canonical media identity; import/swap is undetermined', async () => {
    const h = await createCase910PopupHarness({ publicationStatus: 401 });
    const session = 'case910-popup-hook-loaded-media';
    const graphBefore = structuredClone(h.graph);
    await h.popup.loadCanonicalTimeline!(session);
    const loaded = await h.popup.loadTimeline(session);
    const initial = createShotTimelineInitialData(
      h.config as ResolvedTimelineConfig, loaded.configVersion, h.composition,
    );
    const visualClip = initial.resolvedConfig.clips.find((clip) => clip.track === 'video');
    const audioClip = initial.resolvedConfig.clips.find((clip) => clip.track === 'audio');
    if (!visualClip?.asset || !audioClip) throw new Error('Case 9 provider projection lacks fixture media clips');

    const canonicalRevision = h.graph.shot_revisions.find((revision) => (
      revision.shot_id === h.occurrence.shotId && revision.revision_id === h.occurrence.revisionId
    ));
    if (!canonicalRevision) throw new Error('Case 9 fixture lost the selected canonical shot revision');
    const revisionAssets = (canonicalRevision as unknown as JsonRecord).assets;
    const canonicalAsset = Array.isArray(revisionAssets)
      ? revisionAssets.map((asset) => asRecord(asset)).find((asset) => asset.asset_id === visualClip.asset)
      : undefined;
    if (!canonicalAsset) throw new Error('Case 9 fixture lost the selected canonical media asset');
    const canonicalObjectId = String(canonicalAsset.object_id);
    const canonicalDigest = String(canonicalAsset.digest);
    const loadedRegistry = await h.popup.loadAssetRegistry(session);
    const loadedAsset = loadedRegistry.assets[visualClip.asset];
    expect(loadedAsset).toMatchObject({
      media_id: canonicalObjectId,
      content_sha256: canonicalDigest,
    });
    expect(initial.registry.assets[visualClip.asset]).toMatchObject({
      media_id: canonicalObjectId,
      content_sha256: canonicalDigest,
    });

    // This is only a probe of the low-level factory instance. It cannot establish
    // public popup, _load_revision, or shared-placement import capabilities.
    const popupMediaProvider = h.popup as typeof h.popup & {
      prepareMediaImport?: unknown;
      prepareAsset?: unknown;
      uploadAsset?: unknown;
      supportsDirectAssetUpload?: unknown;
    };
    const popupMediaRoute = {
      prepareMediaImport: typeof popupMediaProvider.prepareMediaImport,
      prepareAsset: typeof popupMediaProvider.prepareAsset,
      uploadAsset: typeof popupMediaProvider.uploadAsset,
      supportsDirectAssetUpload: popupMediaProvider.supportsDirectAssetUpload,
    };
    expect(popupMediaRoute).toEqual({
      prepareMediaImport: 'undefined',
      prepareAsset: 'undefined',
      uploadAsset: 'undefined',
      supportsDirectAssetUpload: undefined,
    });

    const edited = structuredClone(initial);
    edited.config = {
      ...edited.config,
      clips: edited.config.clips.map((clip) => clip.id === audioClip.id ? { ...clip, volume: 0.5 } : clip),
    };
    edited.resolvedConfig = {
      ...edited.resolvedConfig,
      clips: edited.resolvedConfig.clips.map((clip) => clip.id === audioClip.id ? { ...clip, volume: 0.5 } : clip),
    };
    h.popup.setDraftGeneration(1);
    h.popup.setDraftState(true);

    const refusals: unknown[] = [];
    const saveTimeline = h.popup.saveTimeline!.bind(h.popup);
    const save = vi.spyOn(h.popup, 'saveTimeline').mockImplementation(async (...args) => {
      try {
        return await saveTimeline(...args);
      } catch (error) {
        refusals.push(error);
        throw error;
      }
    });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(
      QueryClientProvider, { client, children },
    );
    const dataRef = { current: initial };
    const editSeqRef = { current: 1 };
    const savedSeqRef = { current: 0 };
    const configVersionRef = { current: initial.configVersion };
    const headRevisionRef = { current: initial.head };
    const lastSavedSignatureRef = { current: initial.stableSignature };
    const selectedClipIdRef = { current: audioClip.id };
    const selectedTrackIdRef = { current: audioClip.track };
    const interactionStateRef = { current: createInteractionState() };
    const hook = renderHook(() => useTimelinePersistence({
      provider: h.popup,
      timelineId: session,
      eventBus: new TimelineEventBus(),
      dataRef,
      commitData: vi.fn(),
      selectedClipIdRef,
      selectedTrackIdRef,
      editSeqRef,
      savedSeqRef,
      configVersionRef,
      headRevisionRef,
      lastSavedSignatureRef,
      interactionStateRef,
    }), { wrapper });

    dataRef.current = edited;
    act(() => hook.result.current.scheduleSave(edited));
    await waitFor(() => expect(refusals).toHaveLength(1), { timeout: 3000 });
    hook.unmount();

    const recoveryMetadata = h.popup.getTimelineDraftRecoveryMetadata!();
    const recovered = await loadTimelineDraft(recoveryMetadata.recoveryKey ?? null);
    expect(save).toHaveBeenCalledOnce();
    expect(refusals[0]).toMatchObject({ code: 'runtime_authentication' });
    expect(recovered).toMatchObject({
      baseHeadRevisionId: loaded.head?.headRevisionId,
      draft: {
        config: { clips: expect.arrayContaining([
          expect.objectContaining({ id: audioClip.id, volume: 0.5 }),
        ]) },
        registry: { assets: { [visualClip.asset]: {
          media_id: canonicalObjectId,
          content_sha256: canonicalDigest,
        } } },
      },
    });
    expect(h.popup.timelineQueryIdentity).toBe(loaded.head?.headRevisionId);
    expect(recoveryMetadata.baseHeadRevisionId).toBe(loaded.head?.headRevisionId);
    expect(h.publicationRequests).toHaveLength(1);
    const publication = h.wire.find((exchange) => exchange.method === 'POST'
      && exchange.path.endsWith('/composition-revisions'));
    expect(publication?.status).toBe(401);
    expect(publication?.response).toContain('Case 9 hook harness refuses before publication acceptance');
    expect(h.wire.filter((exchange) => exchange.method === 'POST'
      && exchange.path.endsWith('/composition-revisions'))).toHaveLength(1);
    expect(h.wire.some((exchange) => exchange.method === 'GET'
      && exchange.path.includes('/composition-revisions/'))).toBe(false);
    expect(h.wire.some((exchange) => exchange.path.includes('/history'))).toBe(false);
    expect(h.wire.some((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'))).toBe(false);
    expect(h.graph).toEqual(graphBefore);
    expect(h.composition.contract).toEqual(graphBefore);
    expect(h.composition.occurrences.filter((row) => row.shotId === h.occurrence.shotId)
      .map((row) => [row.occurrenceId, row.shotId, row.revisionId]))
      .toEqual([['occ-1', 'shot-alpha', 'rev-a'], ['occ-2', 'shot-alpha', 'rev-a'],
        ['occ-3', 'shot-alpha', 'rev-b']]);

    const appRequest = asRecord(h.publicationRequests[0]);
    expect(publication?.headers['Idempotency-Key']).toBe(appRequest.idempotencyKey);
    const requestBody = JSON.parse(publication!.bytes!) as JsonRecord;
    writeX0HarnessEvidence('case9-hook-loaded-media-identity.json', {
      action_order: ['load selected occurrence through the low-level factory provider',
        'probe the low-level factory instance for media import methods (not public popup capability)',
        'prepare a non-media edit using the actual loaded canonical asset registry',
        'call useTimelinePersistence.scheduleSave', 'synthetic HTTP 401 refusal before acceptance'],
      exercised_level: {
        popup_ui_mounted: false,
        editor_gesture_driven: false,
        timeline_commit_apply_edit_driven: false,
      },
      case9_import_swap: 'undetermined_not_exercised_in_low_level_fixture',
      import_swap_scope: 'This direct low-level factory harness bypasses public _load_revision/open_authoring_bundle ownership preparation. The method probe provides no public popup or shared-placement capability conclusion; Add+swap and full closure remain pending the scoped Sol bridge.',
      popup_media_route_probe_scope: 'Low-level factory instance only; not public popup capability evidence.',
      fixture: { project_id: h.graph.project.project_id, parent_document_id: h.graph.primary_timeline.document_id,
        base_revision_id: loaded.head?.headRevisionId, occurrence_id: h.occurrence.occurrenceId,
        shared_shot_id: h.occurrence.shotId, same_shot_occurrences: h.composition.occurrences
          .filter((row) => row.shotId === h.occurrence.shotId)
          .map((row) => ({ occurrence_id: row.occurrenceId, shot_id: row.shotId, revision_id: row.revisionId })) },
      popup_media_route: popupMediaRoute,
      media_identity_digest_control: {
        asset_id: visualClip.asset,
        source_canonical_object_id: canonicalObjectId,
        source_canonical_digest: canonicalDigest,
        loaded_provider_registry_entry: loadedAsset,
        recovered_draft_registry_entry: recovered?.draft.registry.assets[visualClip.asset],
      },
      refusal: refusals.map((error) => ({
        name: (error as Error).name,
        message: (error as Error).message,
        code: (error as { code?: unknown }).code,
      })),
      transport_response: { label: 'synthetic test transport refusal before acceptance', wire: h.wire },
      app_publication_request: h.publicationRequests[0],
      publication_request_body: requestBody,
      recovered_draft: recovered,
      no_effect: { publication_requests: h.publicationRequests.length,
        publication_http_attempts: h.wire.filter((exchange) => exchange.method === 'POST'
          && exchange.path.endsWith('/composition-revisions')).length,
        head_revision_id: h.popup.timelineQueryIdentity, history_reads: 0,
        sibling_occurrences: h.composition.occurrences.filter((row) => row.shotId === h.occurrence.shotId)
          .map((row) => [row.occurrenceId, row.shotId, row.revisionId]) },
    });
  });

  it('case 9 low-level provider factory scheduleSave refuses 4.001s recoverably and leaves no second publication or sibling effect', async () => {
    const h = await createCase910PopupHarness({ publicationStatus: 401 });
    const session = 'case910-popup-hook-boundary';
    const graphBefore = structuredClone(h.graph);

    // This uses the popup provider factory and the same persistence hook as 219.
    // The draft values are prepared TimelineData unit inputs; no editor gesture
    // or mounted ShotTimelinePreview is claimed.
    await h.popup.loadCanonicalTimeline!(session);
    const loaded = await h.popup.loadTimeline(session);
    const initial = createShotTimelineInitialData(
      h.config as ResolvedTimelineConfig, loaded.configVersion, h.composition,
    );
    const boundaryClip = initial.resolvedConfig.clips[1];
    const visualClip = initial.resolvedConfig.clips.find((clip) => clip.track === 'video');
    if (!boundaryClip || !visualClip?.asset) throw new Error('Case 9 popup projection needs its media and child clip');
    expect(initial.resolvedConfig.output.fps).toBe(30);

    const canonicalRevision = h.graph.shot_revisions.find((revision) => (
      revision.shot_id === h.occurrence.shotId && revision.revision_id === h.occurrence.revisionId
    ));
    if (!canonicalRevision) throw new Error('Case 9 fixture lost the selected canonical shot revision');
    const revisionAssets = (canonicalRevision as unknown as JsonRecord).assets;
    const canonicalAsset = Array.isArray(revisionAssets)
      ? revisionAssets.map((asset) => asRecord(asset)).find((asset) => asset.asset_id === visualClip.asset)
      : undefined;
    if (!canonicalAsset) throw new Error('Case 9 fixture lost the selected canonical media asset');
    const canonicalObjectId = String(canonicalAsset.object_id);
    const canonicalDigest = String(canonicalAsset.digest);
    const mediaEntry = initial.registry.assets[visualClip.asset];
    expect(mediaEntry).toMatchObject({
      media_id: canonicalObjectId,
      content_sha256: canonicalDigest,
    });

    const dataAt = (hold: number) => {
      const data = structuredClone(initial);
      data.config = { ...data.config, clips: data.config.clips.map((clip) => clip.id === boundaryClip.id
        ? { ...clip, hold } : clip) };
      data.resolvedConfig = {
        ...data.resolvedConfig,
        clips: data.resolvedConfig.clips.map((clip) => clip.id === boundaryClip.id ? { ...clip, hold } : clip),
      };
      return data;
    };
    const atBoundary = dataAt(4);
    const pastBoundary = dataAt(4.001);

    // Preserve the stale-head negative control: wrong identity refuses before publication.
    const staleHead = { ...initial.head!, headRevisionId: 'timeline-rev-stale' };
    await expect(h.popup.saveTimelineAtHead!(session, atBoundary.config, staleHead, atBoundary.registry))
      .rejects.toThrow(/older canonical head/);
    expect(h.publicationRequests).toHaveLength(0);

    h.popup.setDraftGeneration(1);
    h.popup.setDraftState(true);
    const refusals: unknown[] = [];
    const saveTimeline = h.popup.saveTimeline!.bind(h.popup);
    const save = vi.spyOn(h.popup, 'saveTimeline').mockImplementation(async (...args) => {
      try {
        return await saveTimeline(...args);
      } catch (error) {
        refusals.push(error);
        throw error;
      }
    });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(
      QueryClientProvider, { client, children },
    );
    const dataRef = { current: initial };
    const editSeqRef = { current: 1 };
    const savedSeqRef = { current: 0 };
    const configVersionRef = { current: initial.configVersion };
    const headRevisionRef = { current: initial.head };
    const lastSavedSignatureRef = { current: initial.stableSignature };
    const selectedClipIdRef = { current: boundaryClip.id };
    const selectedTrackIdRef = { current: boundaryClip.track };
    const interactionStateRef = { current: createInteractionState() };
    const hook = renderHook(() => useTimelinePersistence({
      provider: h.popup,
      timelineId: session,
      eventBus: new TimelineEventBus(),
      dataRef,
      commitData: vi.fn(),
      selectedClipIdRef,
      selectedTrackIdRef,
      editSeqRef,
      savedSeqRef,
      configVersionRef,
      headRevisionRef,
      lastSavedSignatureRef,
      interactionStateRef,
    }), { wrapper });

    const recoveryMetadata = h.popup.getTimelineDraftRecoveryMetadata!();
    dataRef.current = atBoundary;
    act(() => hook.result.current.scheduleSave(atBoundary));
    await waitFor(() => expect(refusals).toHaveLength(1), { timeout: 3000 });
    expect(refusals[0]).toMatchObject({ code: 'runtime_authentication' });
    expect(h.publicationRequests).toHaveLength(1);
    const recoveredAtBoundary = await loadTimelineDraft(recoveryMetadata.recoveryKey ?? null);
    expect(recoveredAtBoundary?.draft.config.clips).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: boundaryClip.id, hold: 4 }),
    ]));

    editSeqRef.current = 2;
    dataRef.current = pastBoundary;
    h.popup.setDraftGeneration(2);
    act(() => hook.result.current.scheduleSave(pastBoundary));
    await waitFor(() => expect(refusals).toHaveLength(2), { timeout: 3000 });
    hook.unmount();

    const recovered = await loadTimelineDraft(recoveryMetadata.recoveryKey ?? null);
    expect(save).toHaveBeenCalledTimes(2);
    expect(refusals[1]).toMatchObject({ message: 'Shot content would cross the next shot at 4s' });
    expect(recovered).toMatchObject({
      baseHeadRevisionId: loaded.head?.headRevisionId,
      draft: {
        config: { clips: expect.arrayContaining([
          expect.objectContaining({ id: boundaryClip.id, hold: 4.001 }),
          expect.objectContaining({ id: visualClip.id, asset: visualClip.asset }),
        ]) },
        registry: { assets: { [visualClip.asset]: {
          media_id: canonicalObjectId,
          content_sha256: canonicalDigest,
        } } },
      },
    });
    const visualIdentity = asRecord(asRecord(visualClip.app).canonical);
    expect(visualIdentity).toMatchObject({
      occurrenceId: 'occ-1',
      shotId: 'shot-alpha',
      revisionId: 'rev-a',
      internalTimelineRevisionId: 'timeline-alpha-a',
    });
    expect(h.popup.timelineQueryIdentity).toBe(loaded.head?.headRevisionId);
    expect(recoveryMetadata.baseHeadRevisionId).toBe(loaded.head?.headRevisionId);
    expect(h.publicationRequests).toHaveLength(1);
    const publication = h.wire.find((exchange) => exchange.method === 'POST'
      && exchange.path.endsWith('/composition-revisions'));
    expect(publication?.status).toBe(401);
    expect(publication?.response).toContain('Case 9 hook harness refuses before publication acceptance');
    expect(h.wire.filter((exchange) => exchange.method === 'POST'
      && exchange.path.endsWith('/composition-revisions'))).toHaveLength(1);
    expect(h.wire.some((exchange) => exchange.method === 'GET'
      && exchange.path.includes('/composition-revisions/'))).toBe(false);
    expect(h.wire.some((exchange) => exchange.path.includes('/history'))).toBe(false);
    expect(h.wire.some((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'))).toBe(false);
    expect(h.graph).toEqual(graphBefore);
    expect(h.composition.contract).toEqual(graphBefore);
    expect(h.composition.occurrences.filter((row) => row.shotId === h.occurrence.shotId)
      .map((row) => [row.occurrenceId, row.shotId, row.revisionId]))
      .toEqual([['occ-1', 'shot-alpha', 'rev-a'], ['occ-2', 'shot-alpha', 'rev-a'],
        ['occ-3', 'shot-alpha', 'rev-b']]);

    const appRequest = asRecord(h.publicationRequests[0]);
    expect(publication?.headers['Idempotency-Key']).toBe(appRequest.idempotencyKey);
    const requestBody = JSON.parse(publication!.bytes!) as JsonRecord;
    writeX0HarnessEvidence('case9-popup-hook-boundary-correction.json', {
      action_order: ['load canonical timeline through the low-level occurrence-scoped factory provider',
        'prepare TimelineData with test dataAt(4)', 'call useTimelinePersistence.scheduleSave at 4s',
        'synthetic HTTP 401 refusal before publication acceptance',
        'prepare TimelineData with test dataAt(4.001)', 'call useTimelinePersistence.scheduleSave at 4.001s',
        'local occurrence-boundary refusal before a second publication'],
      exercised_level: {
        popup_ui_mounted: false,
        draft_authoring: 'test-prepared TimelineData via dataAt(hold)',
        editor_gesture_driven: false,
        timeline_commit_apply_edit_driven: false,
        boundary_value_scope: 'scheduleSave unit assertion only; 4.001s is directly constructed and is not a 30fps public gesture value',
        output_fps: initial.resolvedConfig.output.fps,
      },
      fixture: { project_id: h.graph.project.project_id, parent_document_id: h.graph.primary_timeline.document_id,
        base_revision_id: loaded.head?.headRevisionId, occurrence_id: h.occurrence.occurrenceId,
        shared_shot_id: h.occurrence.shotId, same_shot_occurrences: h.composition.occurrences
          .filter((row) => row.shotId === h.occurrence.shotId)
          .map((row) => ({ occurrence_id: row.occurrenceId, shot_id: row.shotId, revision_id: row.revisionId })),
        boundary_clip_id: boundaryClip.id },
      media_identity_digest_control: {
        asset_id: visualClip.asset,
        source_canonical_object_id: canonicalObjectId,
        source_canonical_digest: canonicalDigest,
        loaded_registry_entry: mediaEntry,
        recovered_draft_registry_entry: recovered?.draft.registry.assets[visualClip.asset],
        clip_identity: visualIdentity,
      },
      refusals: refusals.map((error) => ({
        name: (error as Error).name,
        message: (error as Error).message,
        code: (error as { code?: unknown }).code,
      })),
      transport_response: { label: 'synthetic test transport refusal before acceptance', wire: h.wire },
      app_publication_request: h.publicationRequests[0],
      publication_request_body: requestBody,
      recovered_at_boundary: recoveredAtBoundary,
      recovered_draft: recovered,
      no_effect: { publication_requests: h.publicationRequests.length,
        publication_http_attempts: h.wire.filter((exchange) => exchange.method === 'POST'
          && exchange.path.endsWith('/composition-revisions')).length,
        head_revision_id: h.popup.timelineQueryIdentity, history_reads: 0,
        sibling_occurrences: h.composition.occurrences.filter((row) => row.shotId === h.occurrence.shotId)
          .map((row) => [row.occurrenceId, row.shotId, row.revisionId]) },
    });
  });

  it('case 10 catalog apply binds its App entrypoint to the refused semantic COMMIT request', async () => {
    const projectId = 'case10-catalog-project';
    const { baseUrl, wire, transport, commitSessionStorage } = createCase10RefusalTransport(projectId);
    const runtime = new RuntimeDataProvider({ projectId, baseUrl, transport, commitSessionStorage,
      commitRouting: { enabled: true } });
    const context = buildReighAgentElementContext({
      astridEffects: ASTRID_EFFECT_CATALOG,
      clips: [{ id: 'catalog-target', trackId: 'V1', at: 0, duration: 2 }],
    });
    const adapter = new AstridElementOperationAdapter(context, createElementTimelineRoutes(runtime), projectId);
    const element = context.catalog.find((entry) => entry.id === 'text-card' && entry.packId === 'rendering');
    if (!element) throw new Error('Case 10 catalog setup has no published element');

    let actionError: unknown;
    try {
      await adapter.execute({ name: 'timeline.apply_element', project: projectId, timeline: 'case10-parent',
        expected_version: 1, clip_id: 'catalog-target', placement: 'overlay',
        element: { id: element.id, kind: element.kind, revision: element.revision, packId: element.packId } });
    } catch (error) { actionError = error; }
    expect(actionError).toBeDefined();

    const commit = wire.find((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'));
    writeX0HarnessEvidence('case10-catalog-apply-http.json', {
      action: 'ElementsLibraryPanel.applyElement -> AstridElementOperationAdapter.execute(timeline.apply_element)',
      fixture: { project_id: projectId, timeline_id: 'case10-parent', base_revision_id: 'case10-head-0', element },
      wire,
    });
    expect(commit, `Catalog action failed before COMMIT: ${String(actionError)}; exchanges=${JSON.stringify(wire)}`).toBeDefined();
    expect(commit?.status).toBe(503);
    const request = JSON.parse(commit!.bytes!) as Record<string, unknown>;
    expect(request).toMatchObject({ project_id: projectId, timeline_id: 'case10-parent',
      base_revision_id: 'case10-head-0', source: { via: 'app' } });
    expect(asRecord(request.change).commands).toEqual(expect.arrayContaining([expect.objectContaining({ op: expect.any(String) })]));
    expect(commit?.headers['Idempotency-Key']).toBe(request.request_id);
    expect(request.session_id).toEqual(expect.any(String));
    expect(request.session_sequence).toEqual(expect.any(Number));
    expect(wire.filter((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'))).toHaveLength(1);
    const revisionReads = wire.filter((exchange) => exchange.method === 'GET'
      && exchange.path.includes('/composition-revisions/'));
    expect(revisionReads.length).toBeGreaterThan(0);
    expect(revisionReads.every((exchange) => exchange.path.endsWith('/composition-revisions/case10-head-0'))).toBe(true);
    expect(revisionReads.every((exchange) => wire.indexOf(exchange) < wire.indexOf(commit!))).toBe(true);
  });

  it('case 10 register-asset binds RuntimeDataProvider.registerAsset to a refused semantic COMMIT request', async () => {
    const projectId = 'case10-asset-project';
    const { baseUrl, wire, transport, commitSessionStorage } = createCase10RefusalTransport(projectId);
    const runtime = new RuntimeDataProvider({ projectId, baseUrl, transport, commitSessionStorage,
      commitRouting: { enabled: true } });
    const assetId = 'case10-registered-asset';
    const entry = { media_id: `sha256:${'c'.repeat(64)}`, type: 'image/png', file: 'https://fixture.invalid/case10.png' };

    let actionError: unknown;
    try { await runtime.registerAsset('case10-parent', assetId, entry); } catch (error) { actionError = error; }
    expect(actionError).toBeDefined();

    const commit = wire.find((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'));
    writeX0HarnessEvidence('case10-register-asset-http.json', {
      action: 'RuntimeDataProvider.registerAsset',
      fixture: { project_id: projectId, timeline_id: 'case10-parent', base_revision_id: 'case10-head-0', asset_id: assetId },
      wire,
    });
    expect(commit, `Asset action failed before COMMIT: ${String(actionError)}; exchanges=${JSON.stringify(wire)}`).toBeDefined();
    expect(commit?.status).toBe(503);
    const request = JSON.parse(commit!.bytes!) as Record<string, unknown>;
    expect(request).toMatchObject({ project_id: projectId, timeline_id: 'case10-parent',
      base_revision_id: 'case10-head-0', source: { via: 'app' },
      change: { commands: [{ op: 'timeline.register-asset', args: { asset_id: assetId, entry } }] } });
    expect(commit?.headers['Idempotency-Key']).toBe(request.request_id);
    expect(request.session_id).toEqual(expect.any(String));
    expect(request.session_sequence).toEqual(expect.any(Number));
    expect(wire.filter((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'))).toHaveLength(1);
    const revisionReads = wire.filter((exchange) => exchange.method === 'GET'
      && exchange.path.includes('/composition-revisions/'));
    expect(revisionReads).toHaveLength(1);
    expect(revisionReads[0]?.path.endsWith('/composition-revisions/case10-head-0')).toBe(true);
    expect(wire.indexOf(revisionReads[0]!) < wire.indexOf(commit!)).toBe(true);
  });

  it('case 10 proposal acceptance calls TimelineOps.acceptProposal and records the refused semantic COMMIT', async () => {
    const projectId = 'case10-proposal-project';
    const { baseUrl, wire, transport, commitSessionStorage } = createCase10RefusalTransport(projectId);
    const runtime = new RuntimeDataProvider({ projectId, baseUrl, transport, commitSessionStorage,
      commitRouting: { enabled: true } });
    const loaded = await runtime.loadTimeline('case10-parent');
    const initial = await buildTimelineData(loaded.config, loaded.registry ?? { assets: {} }, undefined,
      loaded.configVersion, undefined, loaded.head);
    const dataRef = { current: initial };
    let authored: { data: typeof initial; options?: { editCommands?: readonly import('@/integrations/runtime/generated.ts').EditCommand[] } } | undefined;
    const saveTarget = { session: {}, timelineId: 'case10-parent', targetSeq: 1, generation: 1 };
    const hook = renderHook(() => useTimelineOps({
      dataRef,
      semanticCommandSaving: runtime.semanticCommandSaving,
      getConfigVersion: () => initial.configVersion,
      commitData: (data, options) => { dataRef.current = data; authored = { data, options }; },
      captureSaveTarget: () => saveTarget,
      flushSaveTarget: async () => {
        if (!authored) throw new Error('Proposal did not author a semantic save');
        await runtime.saveTimelineAtHead('case10-parent', authored.data.config, loaded.head!,
          authored.data.registry, undefined, authored.options?.editCommands);
        return 1;
      },
      createManualCheckpoint: async () => {}, jumpToCheckpoint: () => {}, checkpoints: [],
    }));
    const reader = createTimelineReader({ data: () => dataRef.current! });
    const proposals = createProposalRuntime({ timelineOps: hook.result.current, reader, persistenceProvider: null });
    const proposal = proposals.create({ source: 'x0-case10-proposal', rationale: 'case 10 harness action',
      baseVersion: initial.configVersion, patch: { version: initial.configVersion, operations: [
        { op: 'clip.update', target: 'catalog-target', payload: { opacity: 0.6 } },
      ] } });

    await act(async () => { await expect(proposals.accept(proposal.id)).rejects.toThrow(); });

    const commit = wire.find((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'));
    writeX0HarnessEvidence('case10-proposal-accept-http.json', {
      action: 'createProposalRuntime.accept -> TimelineOps.acceptProposal -> RuntimeDataProvider.saveTimelineAtHead',
      fixture: { project_id: projectId, timeline_id: 'case10-parent', base_revision_id: 'case10-head-0',
        proposal_id: proposal.id, proposal_transaction_id: `proposal:${proposal.id}` },
      wire,
    });
    expect(commit?.status).toBe(503);
    const request = JSON.parse(commit!.bytes!) as Record<string, unknown>;
    expect(request).toMatchObject({ project_id: projectId, timeline_id: 'case10-parent',
      base_revision_id: 'case10-head-0', source: { via: 'app' },
      change: { commands: [expect.objectContaining({ op: 'clip.set-look' })] } });
    expect(commit?.headers['Idempotency-Key']).toBe(request.request_id);
    expect(request.session_id).toEqual(expect.any(String));
    expect(request.session_sequence).toEqual(expect.any(Number));
    expect(wire.filter((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'))).toHaveLength(1);
    expect(authored?.options).toMatchObject({ semantic: true, transactionId: `proposal:${proposal.id}` });
    const revisionReads = wire.filter((exchange) => exchange.method === 'GET'
      && exchange.path.includes('/composition-revisions/'));
    expect(revisionReads).toHaveLength(1);
    expect(revisionReads[0]?.path.endsWith('/composition-revisions/case10-head-0')).toBe(true);
    expect(wire.indexOf(revisionReads[0]!) < wire.indexOf(commit!)).toBe(true);
    hook.unmount();
  });

  it('case 10 canonical duplicate handler submits an independent graph through Runtime shotComposition.publish; synthetic refusal is pre-acceptance', async () => {
    const h = await createCase910PopupHarness({ publicationStatus: 503 });
    const originalGraph = structuredClone(h.graph);
    const refetchShots = vi.fn();
    const editorData = {
      config: { ...createDefaultTimelineConfig(), tracks: [{ id: 'V1', kind: 'visual' as const }], clips: [], pinnedShotGroups: [] },
      configVersion: 1,
      registry: { assets: {} },
      resolvedConfig: { registry: {} },
      rows: [{ id: 'V1', actions: [] }],
      meta: {},
    };
    const runtimeContext = {
      userId: null,
      timelineId: h.graph.primary_timeline.document_id,
      project: { projectId: h.graph.project.project_id },
      provider: { apiBaseUrl: 'http://case910-runtime.fixture' },
      shots: {
        canonicalOccurrences: h.composition.occurrences,
        shotComposition: h.adapter,
        canonicalComposition: h.composition,
        refetchShots,
      },
    };
    const mockedModules = [
      '@/shared/contexts/ShotsContext.tsx',
      '@/shared/hooks/shotCreation/useShotCreation.ts',
      '@/shared/hooks/shots/useShotNavigation.ts',
      '@/shared/contexts/ProjectContext.tsx',
      '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx',
      '@/tools/video-editor/hooks/timelineStore.ts',
      '@/tools/video-editor/hooks/useTimelineCommandsService.ts',
      '@/tools/video-editor/hooks/usePinnedShotGroups.ts',
      '@/tools/video-editor/hooks/useShotGroups.ts',
      '@/tools/video-editor/hooks/useActiveTaskClips.ts',
      '@/tools/video-editor/hooks/useFinalVideoAvailable.ts',
      '@/tools/video-editor/hooks/useSwitchToFinalVideo.ts',
      '@/tools/video-editor/hooks/useShotGroupHandlers.ts',
      '@/tools/video-editor/lib/shot-group-pack-commands.ts',
      '@/integrations/astrid/client.ts',
      '@/tools/video-editor/components/TimelineEditor/TimelineEditorCore.tsx',
      '@/tools/video-editor/lib/generation-utils.ts',
      '@/tools/travel-between-images/components/VideoGenerationModal.tsx',
      '@/tools/travel-between-images/pages/LocalTimelineShotBrowser.tsx',
      '@/shared/components/ui/runtime/sonner.tsx',
      '@/shared/lib/errorHandling/runtimeError.ts',
    ];
    let unmount: (() => void) | undefined;
    try {
      vi.doMock('@/shared/contexts/ShotsContext.tsx', () => ({ useShots: () => ({ shots: [] }) }));
      vi.doMock('@/shared/hooks/shotCreation/useShotCreation.ts', () => ({ useShotCreation: () => ({ createShot: vi.fn(), isCreating: false }) }));
      vi.doMock('@/shared/hooks/shots/useShotNavigation.ts', () => ({ useShotNavigation: () => ({ navigateToShot: vi.fn() }) }));
      vi.doMock('@/shared/contexts/ProjectContext.tsx', () => ({ useProjectSelectionContext: () => ({ selectedProjectId: h.graph.project.project_id }) }));
      vi.doMock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({ useVideoEditorRuntime: () => runtimeContext }));
      vi.doMock('@/tools/video-editor/hooks/timelineStore.ts', () => ({
        useTimelineConfigVersion: () => 1,
        useTimelineDataSelector: (selector: (value: unknown) => unknown) => selector({ data: editorData,
          resolvedConfig: editorData.resolvedConfig, dataRef: { current: editorData }, selectedClipIds: new Set<string>(),
          interactionStateRef: { current: { drag: false, resize: false } } }),
        useTimelineOpsSelector: (selector: (value: unknown) => unknown) => selector({ applyEdit: vi.fn(),
          prepareGenerationAsset: vi.fn(), registerGenerationAsset: vi.fn(), registerAsset: vi.fn() }),
        useTimelineChromeSelector: (selector: (value: unknown) => unknown) => selector({ reloadFromServer: vi.fn() }),
      }));
      vi.doMock('@/tools/video-editor/hooks/useTimelineCommandsService.ts', () => ({ useTimelineCommandsService: () => ({
        addClip: vi.fn(), prepareGenerationClone: vi.fn(),
      }) }));
      vi.doMock('@/tools/video-editor/hooks/usePinnedShotGroups.ts', () => ({
        usePinnedShotGroups: () => ({ pinGroup: vi.fn(), unpinGroup: vi.fn() }),
        usePinnedShotGroupViews: () => [], usePinnedGroupSync: vi.fn(),
      }));
      vi.doMock('@/tools/video-editor/hooks/useShotGroups.ts', () => ({
        useShotGroups: () => [{ shotId: h.occurrence.shotId, shotName: 'Opening', rowId: 'V1', rowIndex: 0,
          start: 0, clipIds: [], children: [], color: '#fff', poolGenerationIds: [], variantIdsByGenerationId: {},
          canonicalIdentity: h.occurrence }],
        projectCanonicalShotRows: (rows: unknown[]) => rows,
        shotGroupVideoKey: () => 'case10-shot-video',
      }));
      vi.doMock('@/tools/video-editor/hooks/useActiveTaskClips.ts', () => ({ useActiveTaskClips: () => ({ activeTaskAssetKeys: new Set() }) }));
      vi.doMock('@/tools/video-editor/hooks/useFinalVideoAvailable.ts', () => ({
        useFinalVideoAvailable: () => ({ finalVideoMap: new Map(), dismissFinalVideo: vi.fn(), exportRuntimeManagedOutput: vi.fn() }),
        formatManagedOutputExportReceipt: vi.fn(),
      }));
      vi.doMock('@/tools/video-editor/hooks/useSwitchToFinalVideo.ts', () => ({ useSwitchToFinalVideo: () => ({
        switchToFinalVideo: vi.fn(), updateToLatestVideo: vi.fn(), switchToImages: vi.fn(),
      }) }));
      vi.doMock('@/tools/video-editor/hooks/useShotGroupHandlers.ts', () => ({ useShotGroupHandlers: () => ({
        shotGroupClipIds: new Set(), activeTaskClipIds: new Set(), staleShotGroupIds: new Set(),
        handleShotGroupNavigate: vi.fn(), handleShotGroupGenerateVideo: vi.fn(), handleDeleteShotGroup: vi.fn(),
        handleUpdateToLatestVideo: vi.fn(), handleShotGroupUnpin: vi.fn(), handleShotGroupSwitchToFinalVideo: vi.fn(),
        handleShotGroupSwitchToImages: vi.fn(),
      }) }));
      vi.doMock('@/tools/video-editor/lib/shot-group-pack-commands.ts', () => ({
        duplicateShotGroup: vi.fn(), promotePrimaryVariant: vi.fn(),
      }));
      vi.doMock('@/integrations/astrid/client.ts', () => ({ AstridLocalClient: class {} }));
      vi.doMock('@/tools/video-editor/components/TimelineEditor/TimelineEditorCore.tsx', () => ({
        resolveSelectedGenerationIdsForShotCreation: () => ({ canCreateShot: false, generationIds: [] }),
        TimelineEditorCore: (props: { onShotGroupDuplicate?: (group: { shotId: string; trackId: string; canonicalIdentity?: unknown }) => void }) => React.createElement(
          'button', { type: 'button', onClick: () => { void props.onShotGroupDuplicate?.({
            shotId: h.occurrence.shotId, trackId: 'V1', canonicalIdentity: h.occurrence,
          }); } }, 'Duplicate canonical occurrence',
        ),
      }));
      vi.doMock('@/tools/video-editor/lib/generation-utils.ts', () => ({ duplicateGenerationAsset: vi.fn() }));
      vi.doMock('@/tools/travel-between-images/components/VideoGenerationModal.tsx', () => ({ VideoGenerationModal: () => null }));
      vi.doMock('@/tools/travel-between-images/pages/LocalTimelineShotBrowser.tsx', () => ({ LocalTimelineShotBrowser: () => null }));
      vi.doMock('@/shared/components/ui/runtime/sonner.tsx', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
      vi.doMock('@/shared/lib/errorHandling/runtimeError.ts', () => ({ normalizeAndPresentError: vi.fn() }));

      const { ReighTimelineEditor } = await import('@/tools/video-editor/components/ReighTimelineEditor.tsx');
      const view = render(React.createElement(ReighTimelineEditor));
      unmount = () => view.unmount();
      fireEvent.click(screen.getByRole('button', { name: 'Duplicate canonical occurrence' }));

      await waitFor(() => expect(h.wire.some((exchange) => exchange.method === 'POST'
        && exchange.path.endsWith('/composition-revisions'))).toBe(true));
      const request = h.publicationRequests[0] as {
        projectId: string; parentDocumentId: string; expectedHeadRevisionId: string | null; graph: ShotCompositionContract;
      };
      expect(h.publicationRequests).toHaveLength(1);
      expect(request).toMatchObject({ projectId: h.graph.project.project_id,
        parentDocumentId: h.graph.primary_timeline.document_id,
        expectedHeadRevisionId: h.graph.primary_timeline.head.revision_id });
      expect(request.graph.occurrences).toHaveLength(originalGraph.occurrences.length + 1);
      const withoutOrdinal = (row: JsonRecord): JsonRecord => {
        const { ordinal: _ordinal, ...immutableFields } = row;
        return immutableFields;
      };
      for (const originalOccurrence of originalGraph.occurrences) {
        const attemptedOccurrence = request.graph.occurrences.find((row) => row.occurrence_id === originalOccurrence.occurrence_id);
        expect(attemptedOccurrence).toBeDefined();
        expect(withoutOrdinal(attemptedOccurrence!)).toEqual(withoutOrdinal(originalOccurrence));
      }
      expect(request.graph.occurrences.map((row) => row.ordinal))
        .toEqual(request.graph.occurrences.map((_, index) => index));
      const originalSourceSiblingIds = originalGraph.occurrences
        .filter((row) => row.shot_id === h.occurrence.shotId).map((row) => row.occurrence_id);
      const attemptedSourceSiblingIds = request.graph.occurrences
        .filter((row) => originalSourceSiblingIds.includes(String(row.occurrence_id)))
        .map((row) => row.occurrence_id);
      expect(attemptedSourceSiblingIds).toEqual(originalSourceSiblingIds);
      const newOccurrence = request.graph.occurrences.find((row) => !originalGraph.occurrences.some((existing) => existing.occurrence_id === row.occurrence_id));
      expect(newOccurrence).toBeDefined();
      expect(newOccurrence?.shot_id).toMatch(new RegExp(`^${h.occurrence.shotId}-copy-`));
      expect(newOccurrence?.revision_id).toMatch(new RegExp(`^${h.occurrence.revisionId}-copy-`));
      expect(newOccurrence?.occurrence_id).toMatch(new RegExp(`^${h.occurrence.occurrenceId}-copy-`));
      expect(request.graph.shot_revisions).toHaveLength(originalGraph.shot_revisions.length + 1);
      for (const originalRevision of originalGraph.shot_revisions) {
        expect(request.graph.shot_revisions.find((row) => row.shot_id === originalRevision.shot_id
          && row.revision_id === originalRevision.revision_id)).toEqual(originalRevision);
      }
      expect(request.graph.shot_revisions.find((row) => row.shot_id === newOccurrence?.shot_id
        && row.revision_id === newOccurrence?.revision_id)).toMatchObject({ publish: true,
          internal_timeline_revision: { revision_id: expect.stringMatching(/-timeline-copy-/), publish: true } });
      expect(h.graph).toEqual(originalGraph);

      const publications = h.wire.filter((exchange) => exchange.method === 'POST'
        && exchange.path.endsWith('/composition-revisions'));
      expect(publications).toHaveLength(1);
      expect(publications[0]).toMatchObject({ status: 503,
        url: `${h.runtime.apiBaseUrl}/v1/projects/${h.graph.project.project_id}/timelines/${h.graph.primary_timeline.document_id}/composition-revisions` });
      expect(publications[0]?.headers['Idempotency-Key']).toEqual(expect.any(String));
      const body = JSON.parse(publications[0]!.bytes!) as Record<string, unknown>;
      expect(body).toMatchObject({ project_id: h.graph.project.project_id,
        timeline_id: h.graph.primary_timeline.document_id,
        expected_head: h.graph.primary_timeline.head.revision_id,
        parent_composition: { occurrences: expect.arrayContaining([expect.objectContaining({
          occurrence_id: newOccurrence?.occurrence_id, shot_id: newOccurrence?.shot_id,
          shot_revision_id: newOccurrence?.revision_id,
        })]) } });
      expect(h.wire.filter((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/composition-revisions'))).toHaveLength(1);
      expect(h.wire.some((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'))).toBe(false);
      expect(h.wire.some((exchange) => exchange.method === 'GET' && exchange.path.includes('/composition-revisions/'))).toBe(false);
      expect(refetchShots).not.toHaveBeenCalled();
      writeX0HarnessEvidence('case10-canonical-duplicate-handler-http.json', {
        action: 'ReighTimelineEditor.handleDuplicateDocumentShotGroup -> duplicateIndependentShot -> ShotCompositionAdapter.publish -> RuntimeDataProvider.shotComposition.publish',
        route_selection: 'canonicalIdentity branch; TimelineEditorCore is a minimal button mock, while ReighTimelineEditor handler, graph duplicator, shot-composition adapter and RuntimeDataProvider transport path are actual App modules',
        fixture: { project_id: h.graph.project.project_id, parent_document_id: h.graph.primary_timeline.document_id,
          base_head_revision_id: h.graph.primary_timeline.head.revision_id, source_occurrence_id: h.occurrence.occurrenceId,
          source_shot_id: h.occurrence.shotId, same_shot_siblings: originalGraph.occurrences
            .filter((row) => row.shot_id === h.occurrence.shotId).map((row) => row.occurrence_id) },
        attempted_publication: { request: h.publicationRequests[0], http: publications[0], retries: 0,
          response_label: 'synthetic test transport refusal before acceptance' },
        no_effect: { original_graph_unchanged: isDeepStrictEqual(h.graph, originalGraph),
          original_occurrence_fields_preserved_except_reordered_ordinals: originalGraph.occurrences.every((row) => {
            const attempted = request.graph.occurrences.find((candidate) => candidate.occurrence_id === row.occurrence_id);
            return Boolean(attempted && isDeepStrictEqual(withoutOrdinal(attempted), withoutOrdinal(row)));
          }),
          attempted_ordinals_match_sorted_positions: request.graph.occurrences.every((row, index) => row.ordinal === index),
          source_sibling_relative_order_preserved: isDeepStrictEqual(attemptedSourceSiblingIds, originalSourceSiblingIds),
          publication_attempts: publications.length, accepted_revision: null, exact_readback: null,
          refetch_shots_calls: refetchShots.mock.calls.length },
        exercised_level: { reigh_timeline_editor_rendered: true, timeline_editor_core_mocked: true,
          runtime_provider_actual: true, synthetic_transport: true, live_runtime_capture: false,
          acceptance_claimed: false },
      });
    } finally {
      unmount?.();
      for (const moduleId of mockedModules) vi.doUnmock(moduleId);
    }
  });

  it('case 10 restore-history emits the App semantic COMMIT request and records a terminal refusal without acceptance', async () => {
    const wire: Array<{ method: string; path: string; url: string; bytes?: string; headers: Record<string, string>; status?: number; response?: string }> = [];
    const projectId = 'case10-restore-project';
    const baseUrl = 'http://case10-runtime.fixture';
    const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const transport: Transport = async (method, path, headers, body) => {
      const exchange: typeof wire[number] = { method, path, url: `${baseUrl}${path}`, headers: { ...headers } };
      if (typeof body === 'string') exchange.bytes = body;
      else if (body && typeof (body as Blob).text === 'function') exchange.bytes = await (body as Blob).text();
      else if (ArrayBuffer.isView(body)) exchange.bytes = new TextDecoder().decode(body as Uint8Array);
      if (path === '/v1/health') {
        exchange.status = 200;
        exchange.response = JSON.stringify({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 });
        wire.push(exchange);
        return { status: 200, headers: {}, body: json(JSON.parse(exchange.response)) };
      }
      if (path === '/v1/handshake') {
        exchange.status = 200;
        exchange.response = JSON.stringify({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST,
          session_id: 'case10-session', actor_id: 'reigh-product-connector', realm_id: 'case10-realm',
          scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] });
        wire.push(exchange);
        return { status: 200, headers: {}, body: json(JSON.parse(exchange.response)) };
      }
      if (path === '/v1/realm') {
        exchange.status = 200;
        exchange.response = JSON.stringify({ realm_id: 'case10-realm' });
        wire.push(exchange);
        return { status: 200, headers: {}, body: json(JSON.parse(exchange.response)) };
      }
      if (method === 'POST' && path.endsWith('/commit')) {
        exchange.status = 503;
        exchange.response = JSON.stringify({ code: 'unavailable', message: 'Harness refuses before semantic acceptance' });
        wire.push(exchange);
        return { status: 503, headers: {}, body: json(JSON.parse(exchange.response)) };
      }
      wire.push(exchange);
      throw new Error(`Unexpected restore-history transport ${method} ${path}`);
    };
    const runtime = new RuntimeDataProvider({ projectId, baseUrl, transport, commitRouting: { enabled: true } });
    const requestId = 'case10-restore-request-1';

    await expect(runtime.shotComposition.restoreHistory!({
      projectId, parentDocumentId: 'case10-parent', expectedHead: 'case10-head-0',
      expectedPublicationId: 'case10-publication-0', revisionId: 'case10-history-revision',
      publicationId: 'case10-history-publication', contentDigest: `sha256:${'b'.repeat(64)}`, requestId,
    })).rejects.toThrow();

    const commit = wire.find((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'));
    writeX0HarnessEvidence('case10-restore-history-http.json', {
      action: 'RuntimeDataProvider.shotComposition.restoreHistory',
      fixture: { project_id: projectId, timeline_id: 'case10-parent', base_revision_id: 'case10-head-0',
        selected_revision_id: 'case10-history-revision' },
      wire,
    });
    expect(commit).toMatchObject({ status: 503, url: `${baseUrl}/astrid/v1/projects/${projectId}/timelines/case10-parent/commit` });
    expect(commit?.bytes).toBeTruthy();
    const request = JSON.parse(commit!.bytes!) as Record<string, unknown>;
    expect(request).toMatchObject({ project_id: projectId, timeline_id: 'case10-parent',
      base_revision_id: 'case10-head-0', request_id: requestId,
      change: { commands: [{ op: 'timeline.restore', args: { revision_id: 'case10-history-revision',
        content_digest: `sha256:${'b'.repeat(64)}`, publication_id: 'case10-history-publication' } }] } });
    expect(commit?.headers['Idempotency-Key']).toBe(requestId);
    expect(request.session_id).toEqual(expect.any(String));
    expect(String(request.session_id).length).toBeGreaterThan(0);
    expect(request).toHaveProperty('session_sequence');
    expect(wire.filter((exchange) => exchange.method === 'POST' && exchange.path.endsWith('/commit'))).toHaveLength(1);
    expect(wire.some((exchange) => exchange.method === 'GET' && exchange.path.includes('/composition-revisions/'))).toBe(false);
  });
});
