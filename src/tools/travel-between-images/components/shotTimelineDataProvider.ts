import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { LoadedTimeline, TimelineOccurrenceContext, TimelineSaveReceipt } from '@/tools/video-editor/data/DataProvider.ts';
import { occurrenceIdentityFor } from '@/tools/video-editor/commands/semanticGestures.ts';
import {
  advanceTimelineDraftBaseAfterAcknowledgement,
  clearTimelineDraftIfMatches,
  loadTimelineDraft,
  reconcileTimelineDraftHeadMarker,
  saveTimelineDraftIfOwner,
  type TimelineDraftRecoveryMetadata,
} from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import type {
  PreparedShotComposition,
  ShotCompositionAdapter,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { ShotCompositionContract } from '@/tools/video-editor/data/shotComposition.ts';
import { StaleWriteError } from '@/tools/video-editor/data/shotComposition.ts';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { recordShotTimelinePhase } from '@/tools/video-editor/lib/shot-timeline-timing.ts';
import {
  enqueueCanonicalShotPublish,
  hardDurationMs,
  updateCanonicalShotTimeline,
} from '@/tools/video-editor/data/shotCompositionEditor.ts';
import type {
  ResolvedAssetRegistryEntry,
  ResolvedTimelineConfig,
  TimelineConfig,
} from '@/tools/video-editor/types/index.ts';
import { timelineContentExtentMs } from '@/tools/video-editor/data/shotCompositionTiming.ts';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';
import { assembleTimelineData, type TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { buildAssetReferenceMap } from '@/tools/video-editor/lib/asset-registry.ts';

type JsonObject = Record<string, unknown>;

export function shotTimelineSessionId(
  parentDocumentId: string,
  occurrenceId: string,
  editorSessionToken: string,
): string {
  // Query cache identity is per popup opening; durable recovery has its own
  // stable occurrence key below and is not tied to React Query freshness.
  return `${parentDocumentId}:shot:${occurrenceId}:session:${editorSessionToken}`;
}

export function shotTimelineRecoveryId(parentDocumentId: string, occurrenceId: string): string {
  return `${parentDocumentId}:shot:${occurrenceId}`;
}

export function createShotTimelineEditorSessionToken(): string {
  // Retained as a mount-local diagnostic token; durable recovery identity is
  // deliberately independent of the popup opening.
  return globalThis.crypto?.randomUUID?.() ?? `editor-${Date.now()}`;
}

export type ShotTimelineEditorHeadState = {
  canonicalHeadRevisionId: string | null;
  displayedHeadRevisionId: string | null;
};

function headRevisionIdFromConfig(config: Pick<TimelineConfig, 'app'>): string | null {
  const app = config.app && typeof config.app === 'object' && !Array.isArray(config.app)
    ? config.app as Record<string, unknown>
    : null;
  const canonical = app?.canonicalComposition && typeof app.canonicalComposition === 'object'
    && !Array.isArray(app.canonicalComposition)
    ? app.canonicalComposition as Record<string, unknown>
    : null;
  return typeof canonical?.headRevisionId === 'string' ? canonical.headRevisionId : null;
}

function reconcileConfigHeadRevision(config: TimelineConfig, headRevisionId: string): TimelineConfig {
  const app = config.app && typeof config.app === 'object' && !Array.isArray(config.app)
    ? config.app as Record<string, unknown>
    : null;
  const canonical = app?.canonicalComposition
    && typeof app.canonicalComposition === 'object'
    && !Array.isArray(app.canonicalComposition)
    ? app.canonicalComposition as Record<string, unknown>
    : null;
  if (!app || !canonical || canonical.headRevisionId === headRevisionId) return config;
  return {
    ...config,
    app: {
      ...app,
      canonicalComposition: { ...canonical, headRevisionId },
    },
  };
}

export function shotTimelineDurationSeconds(
  config: Pick<ResolvedTimelineConfig, 'clips'>,
  hardDurationSeconds?: number,
): number {
  const contentSeconds = timelineContentExtentMs({ clips: config.clips }) / 1000;
  return hardDurationSeconds === undefined
    ? contentSeconds
    : Math.min(contentSeconds, Math.max(0, hardDurationSeconds));
}

function createShotTimelineConfig(config: ResolvedTimelineConfig): TimelineConfig {
  return {
    output: config.output,
    clips: config.clips,
    tracks: config.tracks,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(config.theme_overrides ? { theme_overrides: config.theme_overrides } : {}),
    ...(config.generation_defaults ? { generation_defaults: config.generation_defaults } : {}),
    ...(config.app ? { app: config.app } : {}),
  };
}

/** Build first-render editor data from the already-resolved parent projection. */
export function createShotTimelineInitialData(
  config: ResolvedTimelineConfig,
  configVersion = 1,
  composition?: PreparedShotComposition,
): TimelineData {
  const registry = {
    assets: Object.fromEntries(Object.entries(config.registry).map(([assetId, entry]) => ([assetId, {
      ...entry,
      file: entry.file ?? entry.media_id ?? entry.url,
    }]))),
  };
  const timelineConfig = createShotTimelineConfig(config);
  const data = assembleTimelineData({
    config: timelineConfig,
    configVersion,
    registry,
    resolvedConfig: config,
    output: config.output,
    assetMap: buildAssetReferenceMap(registry),
  });
  if (composition) data.head = { projectId: composition.projectId, timelineId: composition.parentDocumentId,
    headRevisionId: composition.headRevisionId };
  return data;
}

function createCanonicalTimeline(config: TimelineConfig, occurrenceId: string): Record<string, unknown> {
  const clipPrefix = `${occurrenceId}:`;
  const clips = (config.clips ?? []).map((clip) => {
    const app = clip.app && typeof clip.app === 'object' && !Array.isArray(clip.app)
      ? Object.fromEntries(Object.entries(clip.app).filter(([key]) => !['canonical', 'canonicalTiming'].includes(key)))
      : clip.app;
    const { assetEntry: _assetEntry, ...persistedClip } = clip as typeof clip & { assetEntry?: unknown };
    return {
      ...persistedClip,
      id: persistedClip.id.startsWith(clipPrefix) ? persistedClip.id.slice(clipPrefix.length) : persistedClip.id,
      ...(app && typeof app === 'object' ? { app } : {}),
    };
  });
  return {
    tracks: config.tracks ?? [],
    clips,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(config.theme_overrides ? { theme_overrides: config.theme_overrides } : {}),
    ...(config.generation_defaults ? { generation_defaults: config.generation_defaults } : {}),
    ...(config.app ? { app: config.app } : {}),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeHeadForSignature(
  timeline: Record<string, unknown>,
  headRevisionId: string,
): Record<string, unknown> {
  const app = timeline.app && typeof timeline.app === 'object' && !Array.isArray(timeline.app)
    ? timeline.app as Record<string, unknown>
    : null;
  const canonical = app?.canonicalComposition
    && typeof app.canonicalComposition === 'object'
    && !Array.isArray(app.canonicalComposition)
    ? app.canonicalComposition as Record<string, unknown>
    : null;
  if (!app || !canonical) return timeline;
  return {
    ...timeline,
    app: {
      ...app,
      canonicalComposition: { ...canonical, headRevisionId },
    },
  };
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type PendingCanonicalPublication = {
  configSignature: string;
  expectedHeadRevisionId: string;
  idempotencyKey: string;
  graph: ShotCompositionContract;
};

type ShotTimelineDataProvider = DataProvider & {
  timelineQueryIdentity: string;
  setPublishCallback: (callback?: (
    composition: PreparedShotComposition,
    generation: number,
    expectedHeadRevisionId: string | null,
  ) => void) => void;
  setDraftState: (dirty: boolean) => void;
  setDraftGeneration: (generation: number) => void;
  adoptCleanBaseline: (config: ResolvedTimelineConfig, composition: PreparedShotComposition) => boolean;
};

/** Ephemeral shot-local geometry projection; it never changes the CAS graph. */
export function projectShotTimelineDraftComposition(
  composition: PreparedShotComposition,
  occurrenceId: string,
  config: ResolvedTimelineConfig,
): PreparedShotComposition {
  const occurrence = composition.occurrences.find((candidate) => candidate.occurrenceId === occurrenceId);
  if (!occurrence) return composition;
  const timeline = createCanonicalTimeline(createShotTimelineConfig(config), occurrenceId);
  const extentMs = timelineContentExtentMs(timeline);
  const hardLimitMs = hardDurationMs(composition.contract, occurrenceId, occurrence.atMs);
  const revision = occurrence.revision;
  const internal = revision.internal_timeline_revision
    && typeof revision.internal_timeline_revision === 'object'
    && !Array.isArray(revision.internal_timeline_revision)
    ? revision.internal_timeline_revision as JsonObject
    : {};
  return {
    ...composition,
    occurrences: composition.occurrences.map((candidate) => candidate.occurrenceId === occurrenceId
      ? {
        ...candidate,
        durationMs: hardLimitMs === undefined ? extentMs : Math.min(extentMs, hardLimitMs),
        revision: {
          ...revision,
          internal_timeline_revision: { ...internal, timeline },
        },
      }
      : candidate),
  };
}

/** DataProvider bridge for the shot-local popup's canonical CAS publication. */
export function createShotTimelineDataProvider(
  config: ResolvedTimelineConfig,
  composition: PreparedShotComposition,
  occurrenceId: string,
  shotCompositionAdapter?: ShotCompositionAdapter,
  onCanonicalCompositionPublished?: (
    composition: PreparedShotComposition,
    generation: number,
    expectedHeadRevisionId: string | null,
  ) => void,
  editorHeadState?: { current: ShotTimelineEditorHeadState },
  initialDraftGeneration = 0,
): ShotTimelineDataProvider {
  let registry: { assets: Record<string, ResolvedAssetRegistryEntry> } = {
    assets: Object.fromEntries(Object.entries(config.registry).map(([assetId, entry]) => ([assetId, {
      ...entry,
      file: entry.file ?? entry.media_id ?? entry.url,
    }]))),
  };
  const resolve = async (file: string): Promise<string> => {
    const entry = Object.values(registry.assets).find((candidate) => (
      candidate.file === file || candidate.media_id === file || candidate.url === file
    ));
    // Canonical projection has already resolved managed object IDs into src.
    // Prefer that display address over the persisted file/media identity so
    // opaque sha256: references never reach <img>/<video> as a request URL.
    if (entry?.src) return entry.src;
    if (entry?.url) return entry.url;
    return file.startsWith('sha256:')
      ? bridgeMediaUrl(composition.projectId, file)
      : file;
  };
  let timelineConfig = createShotTimelineConfig(config);
  let canonicalTimelineConfig = timelineConfig;
  let configVersion = 1;
  // This is the CAS base for the mounted popup session. Never reload here:
  // doing so would turn a stale local draft into an unconditional write over
  // a concurrent canonical head. Advance the base only after its publication
  let canonicalBase = composition;
  const editorHeadStateIsMounted = editorHeadState !== undefined;
  const activeEditorHeadState = editorHeadState ?? {
    current: {
      canonicalHeadRevisionId: composition.headRevisionId,
      displayedHeadRevisionId: headRevisionIdFromConfig(config),
    },
  };
  activeEditorHeadState.current.canonicalHeadRevisionId = composition.headRevisionId;
  const adoptCanonicalBase = (next: PreparedShotComposition, advanceDisplayedHead = false) => {
    canonicalBase = next;
    activeEditorHeadState.current.canonicalHeadRevisionId = next.headRevisionId;
    if (!editorHeadStateIsMounted || advanceDisplayedHead) {
      activeEditorHeadState.current.displayedHeadRevisionId = next.headRevisionId;
    }
  };
  const assertEditorHeadIsCurrent = () => {
    const { canonicalHeadRevisionId, displayedHeadRevisionId } = activeEditorHeadState.current;
    if (canonicalHeadRevisionId
      && displayedHeadRevisionId !== canonicalHeadRevisionId) {
      throw new StaleWriteError(
        'The shot timeline is still adopting the latest canonical revision; retry after the displayed shot updates.',
      );
    }
  };
  const recoveryKey = shotTimelineRecoveryId(composition.parentDocumentId, occurrenceId);
  let timelineQueryIdentity = composition.headRevisionId;
  let pendingPublication: PendingCanonicalPublication | null = null;
  let activeTimingTraceId: string | null = null;
  let publishCallback = onCanonicalCompositionPublished;
  let draftGeneration = initialDraftGeneration;
  let draftDirty = false;
  let pendingPublishes = 0;

  const head = () => ({ projectId: composition.projectId, timelineId: composition.parentDocumentId,
    headRevisionId: canonicalBase.headRevisionId });
  const projectCanonicalBase = (next: PreparedShotComposition) => {
    const occurrence = next.occurrences.find((candidate) => candidate.occurrenceId === occurrenceId);
    if (!occurrence) throw new Error('The canonical shot occurrence is unavailable');
    const projected = projectCanonicalComposition(
      { ...next, occurrences: [occurrence] },
      { ...canonicalTimelineConfig, clips: [], tracks: [], registry: {} },
      { clampToOccurrenceDuration: false },
    ).config;
    const offsetSeconds = occurrence.atMs / 1000;
    const canonicalResolvedConfig = {
      ...projected,
      clips: projected.clips.map((clip) => {
        const app = clip.app && typeof clip.app === 'object' && !Array.isArray(clip.app) ? clip.app : null;
        const timing = app?.canonicalTiming && typeof app.canonicalTiming === 'object'
          && !Array.isArray(app.canonicalTiming) ? app.canonicalTiming : null;
        return {
          ...clip,
          at: Math.max(0, clip.at - offsetSeconds),
          ...(app && timing
            ? { app: { ...app, canonicalTiming: { ...timing, occurrenceStartMs: 0 } } }
            : {}),
        };
      }),
    };
    registry = {
      assets: Object.fromEntries(Object.entries(canonicalResolvedConfig.registry).map(([assetId, entry]) => ([assetId, {
        ...entry,
        file: entry.file ?? entry.media_id ?? entry.url,
      }]))),
    };
    canonicalTimelineConfig = createShotTimelineConfig(canonicalResolvedConfig);
  };
  // A receipt survives an exact-head read failure; retry must not issue a new write.
  const semanticAttempts = new WeakMap<TimelineConfig, {
    context: TimelineOccurrenceContext; receipt?: TimelineSaveReceipt;
    send: () => Promise<TimelineSaveReceipt>;
    adopted?: TimelineSaveReceipt;
    flight?: Promise<TimelineSaveReceipt>;
  }>();

  const provider: ShotTimelineDataProvider = {
    get timelineQueryIdentity() {
      return timelineQueryIdentity;
    },
    persistenceEnabled: Boolean(shotCompositionAdapter?.publish),
    supportsEditorSync: false,
    semanticCommandSaving: shotCompositionAdapter?.semanticCommandSaving === true
      && Boolean(shotCompositionAdapter.saveTimelineAtHead),
    saveTimelineAtHead: async (timelineId, nextConfig, expectedHead, nextRegistry, bundle, commands, occurrenceContext) => {
      if (expectedHead.projectId !== composition.projectId
        || expectedHead.timelineId !== composition.parentDocumentId) {
        throw new StaleWriteError('The popup save has no trusted parent head.');
      }
      let attempt = semanticAttempts.get(nextConfig);
      if (!attempt && provider.semanticCommandSaving && commands?.length && occurrenceContext) {
        assertEditorHeadIsCurrent();
        const occurrence = canonicalBase.occurrences.filter((item) => item.occurrenceId === occurrenceId);
        const context = occurrenceContext;
        const selected = commands.map((command) => nextConfig.clips.filter((clip) => {
          const identity = occurrenceIdentityFor({ config: nextConfig }, clip.id);
          return identity && command.select === `occurrence:${identity.occurrenceId}/clip:${identity.sourceClipId}`;
        }));
        const prepared = occurrence.length === 1 ? occurrence[0] : undefined;
        const internal = prepared?.revision.internal_timeline_revision as JsonObject | undefined;
        const rawTimeline = internal?.timeline as JsonObject | undefined;
        const rawClips = rawTimeline?.clips as JsonObject[] | undefined;
        const valid = context.projectId === composition.projectId
          && context.parentDocumentId === composition.parentDocumentId
          && context.headRevisionId === expectedHead.headRevisionId
          && context.headRevisionId === canonicalBase.headRevisionId
          && context.occurrenceId === occurrenceId
          && context.shotId === prepared?.shotId && context.shotRevisionId === prepared?.revisionId
          && context.internalRevisionId === internal?.revision_id
          && stableStringify(nextConfig.app) === stableStringify(canonicalTimelineConfig.app)
          && selected.every((clips, index) => {
            if (clips.length !== 1) return false;
            const identity = occurrenceIdentityFor({ config: nextConfig }, clips[0].id)!;
            const source = rawClips?.filter((clip) => clip.id === identity.sourceClipId);
            return identity.projectId === context.projectId && identity.parentDocumentId === context.parentDocumentId
              && identity.outputIdentity === prepared?.outputIdentity
              && identity.occurrenceId === occurrenceId && identity.headRevisionId === context.headRevisionId
              && identity.shotId === context.shotId && identity.revisionId === context.shotRevisionId
              && identity.internalTimelineRevisionId === context.internalRevisionId
              && source?.length === 1 && stableStringify(source[0]) === stableStringify(identity.sourceClip)
              && ['clip.nudge', 'clip.set-track', 'clip.set-look', 'clip.set-param', 'clip.clear'].includes(commands[index].op)
              && commands[index].resolved?.length === 1 && commands[index].resolved?.[0] === commands[index].select;
          });
        if (valid) {
          const capturedContext = structuredClone(context);
          const capturedHead = structuredClone(expectedHead);
          const capturedCommands = structuredClone(commands);
          attempt = { context: capturedContext, send: () => shotCompositionAdapter!.saveTimelineAtHead!(
            composition.parentDocumentId, nextConfig, capturedHead, nextRegistry, bundle, capturedCommands, capturedContext) };
          semanticAttempts.set(nextConfig, attempt);
        }
      }
      if (!attempt) {
        if (expectedHead.headRevisionId !== canonicalBase.headRevisionId) {
          throw new StaleWriteError('The popup draft belongs to an older canonical head.');
        }
        const version = await provider.saveTimeline(timelineId, nextConfig, configVersion, nextRegistry, bundle);
        return { configVersion: version, head: head() };
      }
      if (attempt.flight) return attempt.flight;
      if (attempt.adopted) return attempt.adopted;
      const captured = attempt;
      const publicationGeneration = draftGeneration;
      pendingPublishes += 1;
      captured.flight = (async () => {
        captured.receipt ??= await captured.send();
        const acknowledged = await shotCompositionAdapter!.loadAtHead({
          projectId: composition.projectId, parentDocumentId: composition.parentDocumentId,
          headRevisionId: captured.receipt.head.headRevisionId!,
        });
        projectCanonicalBase(acknowledged);
        adoptCanonicalBase(acknowledged, true);
        // The clean-baseline gate advances the query identity. An ACK must
        // not replace a mounted editor that contains a newer local draft.
        timelineConfig = canonicalTimelineConfig;
        pendingPublication = null;
        configVersion = Math.max(configVersion + 1, captured.receipt.configVersion);
        publishCallback?.(acknowledged, publicationGeneration, captured.context.headRevisionId);
        captured.adopted = { configVersion, head: head() };
        return captured.adopted;
      })().finally(() => { pendingPublishes -= 1; captured.flight = undefined; });
      return captured.flight;
    },

    setShotTimelineTraceId: (traceId) => { activeTimingTraceId = traceId; },
    getTimelineDraftRecoveryMetadata: (): TimelineDraftRecoveryMetadata => ({
      recoveryKey,
      baseHeadRevisionId: canonicalBase.headRevisionId,
      baseCanonicalGraph: canonicalBase.contract as unknown as Record<string, unknown>,
      draftIdentity: globalThis.crypto?.randomUUID?.() ?? `edit-${Date.now()}-${Math.random()}`,
    }),
    resolveAssetUrl: resolve,
    onResolve: async ({ file }) => resolve(file),
    loadTimeline: async (_timelineId) => {
      timelineConfig = canonicalTimelineConfig;
      const recovery = await loadTimelineDraft(recoveryKey).catch(() => null);
      let recoveryBaseHeadRevisionId: string | null = null;
      if (recovery?.baseCanonicalGraph && shotCompositionAdapter) {
        try {
          const recoveredBase = shotCompositionAdapter.prepare(recovery.baseCanonicalGraph);
          if (recoveredBase.headRevisionId === recovery.baseHeadRevisionId) {
            const recoveryBaseIsCurrent = recoveredBase.headRevisionId === canonicalBase.headRevisionId;
            // A recovery base is CAS provenance, not proof that it is still the
            // current canonical head. Only adopt its displayed marker when it
            // matches the provider's latest known base; never rewrite a stale
            // draft's original CAS revision here.
            adoptCanonicalBase(recoveredBase, recoveryBaseIsCurrent);
            if (recoveryBaseIsCurrent) {
              recoveryBaseHeadRevisionId = recoveredBase.headRevisionId;
            }
          }
        } catch {
          // A malformed recovery base is not authority; keep the fresh graph.
        }
      }
      if (recoveryBaseHeadRevisionId && recovery?.draftIdentity) {
        // Keep the durable draft's marker aligned with the validated base.
        // Retry reads the one-slot record again, so an in-memory-only repair
        // here would let it rehydrate the stale marker and hit the edit gate.
        await reconcileTimelineDraftHeadMarker(
          recoveryKey,
          recovery.draftIdentity,
          recoveryBaseHeadRevisionId,
        ).catch(() => false);
      }
      const recoveredConfig = recovery?.draft.config;
      if (recoveredConfig && typeof recoveredConfig === 'object' && !Array.isArray(recoveredConfig)) {
        timelineConfig = recoveryBaseHeadRevisionId
          ? reconcileConfigHeadRevision(recoveredConfig as TimelineConfig, recoveryBaseHeadRevisionId)
          : recoveredConfig as TimelineConfig;
      }
      const savedPublication = recovery?.draft.canonicalPublication;
      if (savedPublication && typeof savedPublication === 'object' && !Array.isArray(savedPublication)) {
        const candidate = savedPublication as Record<string, unknown>;
        if (typeof candidate.configSignature === 'string'
          && typeof candidate.expectedHeadRevisionId === 'string'
          && typeof candidate.idempotencyKey === 'string'
          && candidate.graph && typeof candidate.graph === 'object' && !Array.isArray(candidate.graph)) {
          pendingPublication = {
            configSignature: candidate.configSignature,
            expectedHeadRevisionId: candidate.expectedHeadRevisionId,
            idempotencyKey: candidate.idempotencyKey,
            graph: candidate.graph as unknown as ShotCompositionContract,
          };
        }
      }
      return { config: timelineConfig, configVersion, ...(provider.semanticCommandSaving ? { head: head() } : {}) };
    },
    loadCanonicalTimeline: async (_timelineId): Promise<LoadedTimeline> => {
      if (shotCompositionAdapter) {
        const latest = await shotCompositionAdapter.load({
          projectId: composition.projectId,
          parentDocumentId: composition.parentDocumentId,
        });
        if (!latest) throw new Error('The canonical shot composition is unavailable');
        adoptCanonicalBase(latest);
        timelineQueryIdentity = latest.headRevisionId;
        projectCanonicalBase(latest);
      }
      timelineConfig = canonicalTimelineConfig;
      pendingPublication = null;
      return { config: timelineConfig, configVersion, ...(provider.semanticCommandSaving ? { head: head() } : {}) };
    },
    loadAssetRegistry: async () => registry,
    saveTimeline: async (timelineId, nextConfig, expectedVersion) => {
      const publicationGeneration = draftGeneration;
      assertEditorHeadIsCurrent();
      if (!shotCompositionAdapter?.publish) {
        throw new Error('The canonical shot-composition provider is read-only');
      }
      pendingPublishes += 1;
      const requestedAt = import.meta.env.DEV ? performance.now() : 0;
      const timingTraceId = activeTimingTraceId;
      let publicationExpectedHeadRevisionId: string | null = null;
      if (timingTraceId) recordShotTimelinePhase(timingTraceId, 'request-start', { expectedVersion });
      try {
        const timeline = createCanonicalTimeline(nextConfig, occurrenceId);
        // Reserve the project queue synchronously in caller order before any
        // async recovery read or hashing. Otherwise a later edit can finish
        // preparation first and publish ahead of the save that was requested
        // before it.
        const published = await enqueueCanonicalShotPublish(
          composition.projectId,
          composition.parentDocumentId,
          async () => {
            // The queued publication may have waited behind another shot edit
            // while the mounted popup adopted a newer head. Recheck at the
            // actual write boundary, not just when the UI requested the save.
            assertEditorHeadIsCurrent();
            // Another edit can become durable while this publication hashes
            // and prepares its graph, so owner comparison and write below are
            // still transactional.
            const recoveryAtStart = await loadTimelineDraft(recoveryKey).catch(() => null);
            const configSignature = await digest(normalizeHeadForSignature(timeline, canonicalBase.headRevisionId));
            let candidate = pendingPublication?.configSignature === configSignature
              ? pendingPublication
              : null;
            if (!candidate) {
              const identitySeed = (await digest({
                projectId: canonicalBase.projectId,
                parentDocumentId: canonicalBase.parentDocumentId,
                occurrenceId,
                expectedHeadRevisionId: canonicalBase.headRevisionId,
                configSignature,
              })).slice(0, 32);
              const graph = await updateCanonicalShotTimeline(
                canonicalBase.contract,
                occurrenceId,
                timeline,
                identitySeed,
              );
              candidate = {
                configSignature,
                expectedHeadRevisionId: canonicalBase.headRevisionId,
                idempotencyKey: `reigh.shot-popup.${identitySeed}`,
                graph,
              };
              pendingPublication = candidate;
            }
            publicationExpectedHeadRevisionId = candidate.expectedHeadRevisionId;
            const recoveryDraftConfig = recoveryAtStart?.draft.config;
            const recoveryMatchesThisSave = Boolean(
              recoveryAtStart?.draftIdentity
              && recoveryDraftConfig
              && typeof recoveryDraftConfig === 'object'
              && !Array.isArray(recoveryDraftConfig)
              && await digest(normalizeHeadForSignature(
                createCanonicalTimeline(recoveryDraftConfig as TimelineConfig, occurrenceId),
                canonicalBase.headRevisionId,
              )) === configSignature,
            );
            const expectedRecoveryOwner = recoveryAtStart === null
              ? null
              : recoveryMatchesThisSave
                ? recoveryAtStart.draftIdentity!
                // A different durable config is newer than this save or has
                // no trustworthy owner token. Force the conflict-merge path;
                // never adopt its owner token and overwrite its config.
                : `superseded:${candidate.idempotencyKey}`;
            const publicationDraft = {
              ...(recoveryAtStart?.draft ?? {}),
              config: nextConfig,
              registry,
              canonicalPublication: candidate,
            };
            await saveTimelineDraftIfOwner(
              timelineId,
              publicationDraft,
              expectedVersion,
              {
                recoveryKey,
                baseHeadRevisionId: candidate.expectedHeadRevisionId,
                baseCanonicalGraph: canonicalBase.contract as unknown as Record<string, unknown>,
                draftIdentity: candidate.idempotencyKey,
                acknowledgementIdentity: candidate.idempotencyKey,
              },
              expectedRecoveryOwner,
              (current, candidateRecord) => ({
                ...current,
                // Keep B's config/base/owner, but make A's exact publication
                // candidate available as a retry without making A the owner.
                draft: {
                  ...current.draft,
                  canonicalPublication: candidateRecord.draft.canonicalPublication,
                },
              }),
            );
            const publishStartedAt = import.meta.env.DEV ? performance.now() : 0;
            const acknowledged = await shotCompositionAdapter.publish!({
              projectId: canonicalBase.projectId,
              parentDocumentId: canonicalBase.parentDocumentId,
              expectedHeadRevisionId: candidate.expectedHeadRevisionId,
              graph: candidate.graph,
              idempotencyKey: candidate.idempotencyKey,
              timingTraceId: timingTraceId ?? undefined,
            });
            // This head is our own acknowledged publication. The mounted
            // editor contains that saved revision plus any newer local edits,
            // so it can continue on the new CAS base without waiting for a
            // redundant query echo to rewrite its head marker.
            adoptCanonicalBase(acknowledged, true);
            canonicalTimelineConfig = nextConfig;
            timelineConfig = canonicalTimelineConfig;
            pendingPublication = null;
            const clearedAcknowledgedDraft = await clearTimelineDraftIfMatches(
              recoveryKey,
              candidate.idempotencyKey,
            ).catch(() => false);
            if (!clearedAcknowledgedDraft) {
              await advanceTimelineDraftBaseAfterAcknowledgement(
                recoveryKey,
                candidate.expectedHeadRevisionId,
                acknowledged.headRevisionId,
                acknowledged.contract as unknown as Record<string, unknown>,
                candidate.idempotencyKey,
              ).catch(() => false);
            }
            if (import.meta.env.DEV) {
              console.debug('[ShotTimelineLatency]', {
                phase: 'canonical-publish-ack',
                occurrenceId,
                queueWaitMs: Math.round(publishStartedAt - requestedAt),
                publishMs: Math.round(performance.now() - publishStartedAt),
              });
            }
            if (timingTraceId) recordShotTimelinePhase(timingTraceId, 'canonical-ack', {
              headRevisionId: acknowledged.headRevisionId,
            });
            return acknowledged;
          },
        );
        if (timingTraceId) recordShotTimelinePhase(timingTraceId, 'request-end', {
          durationMs: Math.round(performance.now() - requestedAt),
        });
        // A publication can finish after React has rendered a newer callback.
        // Keep the callback current without rebuilding the editor's provider.
        publishCallback?.(published, publicationGeneration, publicationExpectedHeadRevisionId);
        configVersion += 1;
        return configVersion;
      } finally {
        pendingPublishes -= 1;
      }
    },
    setPublishCallback: (callback) => { publishCallback = callback; },
    setDraftState: (dirty) => { draftDirty = dirty; },
    setDraftGeneration: (generation) => { draftGeneration = Math.max(draftGeneration, generation); },
    adoptCleanBaseline: (nextConfig, nextComposition) => {
      if (draftDirty || pendingPublishes > 0) {
        return false;
      }
      timelineConfig = createShotTimelineConfig(nextConfig);
      canonicalTimelineConfig = timelineConfig;
      registry = {
        assets: Object.fromEntries(Object.entries(nextConfig.registry).map(([assetId, entry]) => ([assetId, {
          ...entry,
          file: entry.file ?? entry.media_id ?? entry.url,
        }]))),
      };
      adoptCanonicalBase(nextComposition);
      timelineQueryIdentity = nextComposition.headRevisionId;
      return true;
    },
  };
  if (!provider.semanticCommandSaving) delete provider.saveTimelineAtHead;
  return provider;
}
