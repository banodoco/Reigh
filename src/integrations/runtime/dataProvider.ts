import { trackHistoryInverse } from '@/tools/video-editor/commands/trackHistory.ts';
import { clipStructureInverse } from '@/tools/video-editor/commands/clipStructureHistory.ts';
import { clipPlacementInverse } from '@/tools/video-editor/commands/clipPlacementHistory.ts';
import { transcriptCaptionInverse } from '@/tools/video-editor/commands/transcriptCaptionHistory.ts';
import { isTranscriptCaptionBatch, transcriptBindTarget } from '@/tools/video-editor/commands/transcriptCaptions.ts';
import { createProjectTranscriptReader } from './projectTranscriptReader.ts';
import { isCapturedShotMetadataCommand } from '@/tools/video-editor/data/canonicalShotMetadata.ts';
import { RuntimeCommitSession, browserCommitSessionStorage, type CommitSessionStorage } from './commitSession.ts';
import { assetRegistrationCommand, assetRegistrationInverse, isAssetRegistrationCommand, isAssetRegistrationInverse } from '@/tools/video-editor/commands/assetRegistration.ts';
import { tiedHoldExpansionInverse } from '@/tools/video-editor/commands/tiedHoldExpansionHistory.ts';
import { overlapTrimInverse } from '@/tools/video-editor/commands/overlapTrimHistory.ts';
import type { TimelineDraftRecoveryMetadata } from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import { ApiError, type ByteResponse, type MediaImportOperation as MediaImport, type RequestBody, type CommitRequest, type CommitResult, type EditCommand } from './generated.ts';
import {
  ReighRuntimeClient,
  RuntimeAuthenticationError,
  RuntimeUnavailableError,
  isRuntimeCanonicalPayloadConflict,
  isRuntimeConflict,
  isRuntimeUnavailableFailure,
  type RuntimeConnectorError,
} from './client.ts';
import {
  TimelineNotFoundError,
  TimelineSchemaIncompatibleError,
  TimelineVersionConflictError,
  type DataProvider,
  type LoadedTimeline,
  type TimelineHeadRevision,
  type TimelineOccurrenceContext,
  type TimelineSaveReceipt,
  type LoadedReferencedTimeline,
  type ProjectObjectStorage,
  type UploadedAssetResult,
  type UploadAssetOptions,
} from '@/tools/video-editor/data/DataProvider.ts';
import type {
  AssetRegistry,
  AssetRegistryEntry,
  TimelineConfig,
} from '@/tools/video-editor/types/index.ts';
import type { GenerationRow } from '@/domains/generation/types/index.ts';
import type { TimelineInspectionResult, Transport } from './generated.ts';
import {
  assertRuntimeMediaImportSize,
  type AssetResolveRequest,
  type AssetUploadRequest,
  type MediaImportOptions,
  type PreparedMediaImport,
} from '@/tools/video-editor/data/AssetResolver.ts';
import type { TimelineBundleEnvelope } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import { parseTimelineBundle } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import { readAudioLanePresentation } from '@/tools/video-editor/data/audioLanePresentation.ts';
import type { AudioLanePresentation } from '@/tools/video-editor/data/audioLanePresentation.ts';
import { withDefaultTimelineOutput } from '@/tools/video-editor/lib/defaults.ts';
import {
  ShotCompositionUnavailableError,
  type CanonicalShotCompositionHistoryEntry,
  type ShotCompositionHeadReadRequest,
  type ShotCompositionPort,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import {
  stableOccurrenceDeepLink,
  stableOutputIdentity,
  StaleWriteError,
} from '@/tools/video-editor/data/shotComposition.ts';
import { generateUUID } from '@/shared/lib/taskCreation/ids.ts';
import {
  runtimeThumbnailObjectId,
  selectRuntimePrimaryVariant,
} from './generationProjection.ts';
import { listAllRuntimeVariants } from './generationAccess.ts';
import { recordShotTimelinePhase } from '@/tools/video-editor/lib/shot-timeline-timing.ts';
import { isTimelineDiagnosticsEnabled } from '@/tools/video-editor/lib/timeline-diagnostics.ts';

type RuntimeRecord = Record<string, unknown>;
type CanonicalTimelineInspection = TimelineInspectionResult & {
  /** The optional response-only Runtime projection remains opaque to this transport layer. */
  presentation?: { audio_lane?: unknown };
};

type CanonicalTimelineState = {
  headRevisionId: string | null;
  parentComposition: RuntimeRecord;
  version: number;
};

type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export type ImmutableCommitRequest = Immutable<CommitRequest>;

/** A producer supplies explicit commands and captured identity; routing never derives intent. */
export interface TimelineCommitSaveContext {
  readonly occurrenceContext?: Immutable<TimelineOccurrenceContext>;
  readonly timelineId: string;
  readonly expectedHead: Immutable<TimelineHeadRevision>;
  readonly config: Immutable<TimelineConfig>;
  readonly registry?: Immutable<AssetRegistry>;
  readonly bundle?: Immutable<TimelineBundleEnvelope> | null;
  readonly editCommands?: readonly Immutable<EditCommand>[];
}

export interface TimelineCommitRouting {
  readonly enabled: boolean;
  readonly requestForSave?: (save: TimelineCommitSaveContext) => ImmutableCommitRequest;
}

function freezeCommitValue<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeCommitValue(child);
    Object.freeze(value);
  }
  return value;
}

interface TimelineCommitAttemptOwner {
  readonly config: TimelineConfig;
  readonly registry?: AssetRegistry;
  readonly bundle?: TimelineBundleEnvelope | null;
  readonly headRevisionId: string | null;
}

interface PendingTimelineCommit {
  readonly owner: TimelineCommitAttemptOwner;
  request: CommitRequest;
  readonly settled: Promise<void>;
  readonly release: () => void;
  flight?: Promise<TimelineSaveReceipt>;
}

export interface RuntimeDataProviderOptions {
  projectId: string;
  /** Defaults to the browser tab session context; null disables durable recovery. */
  commitSessionStorage?: CommitSessionStorage | null;
  /** Explicit opt-in. With no GESTURES producer, enabling this must fail closed. */
  commitRouting?: TimelineCommitRouting;
  baseUrl?: string;
  /** Direct clients may pass a disposable test credential; browser callers use the connector. */
  token?: string;
  transport?: Transport;
  /** UI-only observation of connector failures; Runtime remains the IO authority. */
  onRuntimeError?: (error: RuntimeConnectorError) => void;
}

/**
 * Reigh's neutral-runtime provider. It owns no storage: the generated
 * WorkspaceClient is the only IO authority, and the Runtime's immutable
 * parent-composition head is the editor's config/registry record.
 */
export class RuntimeDataProvider implements DataProvider {
  readonly persistenceEnabled = true;
  readonly supportsEditorSync = false;
  readonly supportsDirectAssetUpload = true;
  /**
   * Runtime has no public timeline-document event cursor yet. Until that
   * contract exists, the consumer catches up through its canonical versioned
   * read every 30 seconds; usePollSync decides whether to adopt it.
   */
  readonly refreshIntervalMs = 30_000;
  readonly apiBaseUrl: string;
  readonly projectTranscripts: import('./projectTranscriptReader.ts').ProjectTranscriptReader;
  readonly projectObjects: ProjectObjectStorage = {
    ingest: async (bytes, mediaType, filename) => {
      const object = await this.client.ingestProjectObject(this.projectId, bytes, mediaType, filename);
      return {
        object_id: object.object_id,
        digest: object.digest,
        media_type: object.media_type,
        size: object.size,
        ...(object.filename !== undefined ? { filename: object.filename } : {}),
      };
    },
    read: async (objectId) => {
      const location = await this.client.getProjectObjectLocation(this.projectId, objectId);
      if (location.object_id !== objectId) {
        throw new Error(
          `Workspace Runtime project-object authority returned ${location.object_id} for ${objectId}`,
        );
      }
      const response = await this.client.getObject(objectId);
      if (response.etag) {
        assertManagedObjectIdentity(objectId, location.digest, response.etag);
      }
      if (response.data.byteLength !== location.size) {
        throw new Error(
          `Workspace Runtime object size mismatch for ${objectId}: expected ${location.size}, got ${response.data.byteLength}`,
        );
      }
      return response.data;
    },
  };
  readonly shotComposition: ShotCompositionPort = {
    // Use this provider's existing client, serializer and retry reservation.
    saveTimelineAtHead: (...args) => this.saveTimelineAtHead(...args),
    getTimelineDraftRecoveryMetadata: (request) => request.projectId === this.projectId
      ? this.getTimelineDraftRecoveryMetadata(request.parentDocumentId) : { recoveryKey: null },
    getSourceFrameThumbnailUrl: async (request) => {
      const descriptor = await this.client.getSourceFrameThumbnail(
        request.projectId,
        request.sourceObjectId,
        request.sourceTimeSeconds,
        request.recipeVersion ?? 1,
      );
      const objectId = descriptor && typeof descriptor.object_id === 'string'
        ? descriptor.object_id
        : null;
      return objectId ? this.client.objectContentUrl(objectId) : null;
    },
    load: async (request) => {
      try {
        return await this.loadRuntimeShotComposition(request.projectId, request.parentDocumentId);
      } catch (error) {
        throw this.toProviderError(error, request.parentDocumentId);
      }
    },
    loadAtHead: async (request) => {
      try {
        return await this.loadRuntimeShotCompositionAtHead(request);
      } catch (error) {
        throw this.toProviderError(error, request.parentDocumentId);
      }
    },
    listHistory: async (request) => {
      const entries: CanonicalShotCompositionHistoryEntry[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.client.listProjectParentCompositionRevisions(
          request.projectId,
          request.parentDocumentId,
          cursor,
        );
        for (const value of page.items) {
          const revisionId = requiredString(value.revision_id, 'composition history.revision_id');
          const projectId = requiredString(value.project_id, 'composition history.project_id');
          const parentDocumentId = requiredString(value.timeline_id, 'composition history.timeline_id');
          if (projectId !== request.projectId || parentDocumentId !== request.parentDocumentId) {
            throw new ShotCompositionUnavailableError('Workspace Runtime returned history outside the requested project and timeline');
          }
          entries.push({
            revisionId,
            projectId,
            parentDocumentId,
            contentDigest: requiredString(value.content_digest, 'composition history.content_digest'),
            createdAt: requiredString(value.created_at, 'composition history.created_at'),
            isCurrentHead: value.is_current_head === true,
          });
        }
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      return entries;
    },
    restoreHistory: async (request) => {
      const inspection = await this.inspectCanonicalTimelineHead(request.projectId, request.parentDocumentId);
      const expectedHead = nullableString(inspection.head_revision_id, 'canonical timeline inspection.head_revision_id');
      if (!expectedHead) {
        throw new ShotCompositionUnavailableError('Workspace Runtime timeline has no current head to compare before restoring history');
      }
      const restored = await this.client.restoreProjectParentCompositionRevision(
        request.projectId,
        request.parentDocumentId,
        request.revisionId,
        expectedHead,
        generateUUID(),
      );
      const newHead = nullableString(
        restored.revision_id ?? restored.parent_revision_id ?? restored.new_head,
        'parent composition restore receipt.new_head',
      );
      if (!newHead) {
        throw new ShotCompositionUnavailableError('Workspace Runtime restore receipt omitted the new canonical head');
      }
      // Resolve the exact committed closure now so a malformed historical
      // revision cannot appear to have restored successfully in the editor.
      await this.loadRuntimeShotCompositionAtHead({
        projectId: request.projectId,
        parentDocumentId: request.parentDocumentId,
        headRevisionId: newHead,
      });
      return { newHead };
    },
    publish: async (request) => {
      const publishStartedAt = import.meta.env.DEV ? performance.now() : 0;
      try {
        assertGraphRequestIdentity(request.graph, request.projectId, request.parentDocumentId);
        const headReadStartedAt = import.meta.env.DEV ? performance.now() : 0;
        // A null expected head is an explicit first publication, so there is
        // no existing head to inspect. Every non-null head is still checked
        // through the canonical inspection contract before publishing.
        const inspection = request.expectedHeadRevisionId === null
          ? null
          : await this.inspectCanonicalTimelineHead(request.projectId, request.parentDocumentId);
        this.logShotTimelineLatency('runtime-head-read', headReadStartedAt, request.timingTraceId);
        // Do not reject a retry merely because the mutable head has advanced:
        // Runtime checks durable idempotency replay before its CAS comparison.
        // A new key still receives the Runtime's explicit stale-head 409.
        if (inspection) {
          const currentHead = nullableString(
            inspection.head_revision_id,
            'canonical timeline inspection.head_revision_id',
          );
          if (currentHead === null) {
            throw new ShotCompositionUnavailableError(
              `Workspace Runtime timeline ${request.parentDocumentId} has no published canonical shot-composition head`,
            );
          }
        }
        const publication = await toRuntimePublication(request.graph, request.projectId, request.parentDocumentId, request.expectedHeadRevisionId);
        const idempotencyKey = request.idempotencyKey ?? await stablePublicationKey(
          request.projectId,
          request.parentDocumentId,
          request.expectedHeadRevisionId,
          request.graph,
        );
        const commitStartedAt = import.meta.env.DEV ? performance.now() : 0;
        const committed = await this.client.publishParentComposition(
          request.projectId,
          request.parentDocumentId,
          publication,
          idempotencyKey,
        );
        this.logShotTimelineLatency('runtime-publish-request', commitStartedAt, request.timingTraceId);
        // Never reload the mutable current head here: another writer may have
        // advanced it before the response arrived. Pin the returned receipt's
        // exact immutable revision and carry the receipt/diff alongside it.
        const committedHead = committed.revision_id ?? committed.parent_revision_id ?? committed.new_head;
        if (typeof committedHead !== 'string' || committedHead.length === 0) {
          throw new Error('Workspace Runtime publication receipt omitted its committed parent head');
        }
        const reloadStartedAt = import.meta.env.DEV ? performance.now() : 0;
        const graph = await this.loadRuntimeShotCompositionAtHead({
          projectId: request.projectId,
          parentDocumentId: request.parentDocumentId,
          headRevisionId: committedHead,
        });
        this.logShotTimelineLatency('runtime-exact-head-reload', reloadStartedAt, request.timingTraceId);
        const receipt = asRecord((committed as RuntimeRecord).receipt);
        const result = asRecord(receipt?.result);
        const changedIdentities = publicationChangedIdentities(result, committedHead);
        const publishedGraph = {
          ...(graph as RuntimeRecord),
          publication_receipt: {
            ...(typeof receipt?.receipt_id === 'string' ? { receipt_id: receipt.receipt_id } : {}),
            idempotency_key: idempotencyKey,
            ...(typeof receipt?.request_hash === 'string' ? { request_hash: receipt.request_hash } : {}),
            expected_head: request.expectedHeadRevisionId,
            new_head: committedHead,
            changed_identities: changedIdentities,
            diff: result ?? {},
          },
        };
        this.logShotTimelineLatency('runtime-publish-total', publishStartedAt, request.timingTraceId);
        return publishedGraph;
      } catch (error) {
        if (isRuntimeConflict(error)) {
          throw new StaleWriteError(`Workspace Runtime rejected a stale shot-composition write: ${error.message}`);
        }
        throw this.toProviderError(error, request.parentDocumentId);
      }
    },
  };

  private readonly commitRouting?: TimelineCommitRouting;
  readonly semanticCommandSaving: boolean;
  private readonly commitSession: RuntimeCommitSession;
  private recoveryRealmId: string | null = null;
  private readonly commitScope: ImmutableCommitRequest['scope'] = Object.freeze({
    target: 'parent', complete: Object.freeze(['clips', 'tracks'] as const), projection_version: 1,
  });
  private readonly pendingCommits = new Map<string, PendingTimelineCommit>();
  private readonly assetRegistrationAttempts = new WeakMap<AssetRegistryEntry, Map<string, Promise<{
    config: TimelineConfig; registry: AssetRegistry; head: TimelineHeadRevision; commands: EditCommand[];
  }>>>();
  private readonly projectId: string;
  private readonly client: ReighRuntimeClient;
  private readonly audioLaneRequestFailures = new WeakMap<object, string>();
  private readonly onRuntimeError?: (error: RuntimeConnectorError) => void;
  private activeRegistry: AssetRegistry | null = null;
  private readonly canonicalTimelineState = new Map<string, CanonicalTimelineState>();
  private readonly timelineOperations = new Map<string, Promise<void>>();
  // One unresolved transport attempt per timeline. Only byte-equivalent input
  // may replay its original key/head; a poll is not an authorship receipt.
  private readonly unacknowledgedSaves = new Map<string, {
    expectedVersion: number;
    requestSignature: string;
    expectedHead: string | null;
    parentComposition: RuntimeRecord;
    idempotencyKey: string;
  }>();

  /** Keep head discovery, immutable payload reads, and publication receipts in
   * one order per timeline. Otherwise an older read can overwrite a save ACK
   * and invent a version conflict on this editor's next edit. Runtime CAS still
   * arbitrates other providers/tabs; this queue never rebases a stale write. */
  private withTimelineOperation<T>(timelineId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.timelineOperations.get(timelineId) ?? Promise.resolve();
    const result = previous.then(operation);
    const settled = result.then(() => {}, () => {});
    this.timelineOperations.set(timelineId, settled);
    void settled.then(() => {
      if (this.timelineOperations.get(timelineId) === settled) {
        this.timelineOperations.delete(timelineId);
      }
    });
    return result;
  }

  constructor(options: RuntimeDataProviderOptions) {
    this.projectId = options.projectId;
    this.semanticCommandSaving = options.commitRouting?.enabled === true;
    Object.defineProperty(this.shotComposition, 'semanticCommandSaving', { enumerable: true, get: () => this.semanticCommandSaving });
    this.commitRouting = options.commitRouting
      ? Object.freeze({ ...options.commitRouting })
      : undefined;
    this.client = new ReighRuntimeClient({ baseUrl: options.baseUrl, token: options.token, transport: options.transport });
    this.projectTranscripts = createProjectTranscriptReader(this.client, this.projectId);
    this.onRuntimeError = options.onRuntimeError;
    this.apiBaseUrl = this.client.baseUrl;
    // Endpoint partitioning is local context only, never realm authority. URL
    // credentials/query/hash must not enter even the browser storage key.
    let endpoint: string[] = [];
    try {
      const url = new URL(this.apiBaseUrl, 'http://relative-runtime.invalid');
      if (url.protocol === 'http:' || url.protocol === 'https:') endpoint = [url.origin, url.pathname];
    } catch { /* Invalid custom transports still retain ordinary commit behavior. */ }
    const namespace = JSON.stringify([...endpoint, this.projectId]);
    const context = options.commitSessionStorage === undefined
      ? browserCommitSessionStorage(namespace) : { storage: options.commitSessionStorage, fresh: false };
    this.commitSession = new RuntimeCommitSession(context.storage, namespace, context.fresh);
  }

  async getProjectMediaSelection(request: {
    projectId: string;
    asset: string;
    generationId: string;
    variantId: string;
  }) {
    if (request.projectId !== this.projectId) {
      throw new Error('Runtime media selection belongs to a different project');
    }
    return this.client.getProjectMediaSelection(
      this.projectId, request.asset, request.generationId, request.variantId,
    );
  }

  async getProjectMediaSelectionForOutput(request: {
    projectId: string;
    association_id: string;
    object_id: string;
    version: number;
  }) {
    if (request.projectId !== this.projectId) {
      throw new Error('Runtime media selection belongs to a different project');
    }
    if (!request.association_id || !request.object_id
      || !Number.isSafeInteger(request.version) || request.version < 1) {
      throw new Error('Runtime output media selection requires an exact association, object, and version');
    }
    return this.client.getProjectMediaSelectionForOutput(this.projectId, {
      association_id: request.association_id,
      object_id: request.object_id,
      version: request.version,
    });
  }

  private async loadRuntimeShotComposition(projectId: string, timelineId: string): Promise<unknown> {
    await this.initializeRecoveryIdentity();
    const startedAt = import.meta.env.DEV ? performance.now() : 0;
    const inspection = await this.inspectCanonicalTimelineHead(projectId, timelineId);
    const headRevisionId = nullableString(inspection.head_revision_id, 'canonical timeline inspection.head_revision_id');
    if (headRevisionId === null) {
      throw new ShotCompositionUnavailableError(
        `Workspace Runtime timeline ${timelineId} has no published canonical shot-composition head`,
      );
    }
    const graph = await this.loadRuntimeShotCompositionAtHead({ projectId, parentDocumentId: timelineId, headRevisionId });
    this.logShotTimelineLatency('runtime-composition-load', startedAt);
    return graph;
  }

  /**
   * Resolve the current immutable composition head through Runtime's typed
   * inspection contract. The legacy timeline resource is deliberately not a
   * head-discovery fallback: it is a mutable document and may describe a
   * different shell than the canonical shot composition.
   */
  private async inspectCanonicalTimelineHead(
    projectId: string,
    timelineId: string,
    includeAudioLane = false,
  ): Promise<CanonicalTimelineInspection> {
    const inspection = await this.requestCanonicalTimelineInspection(projectId, timelineId, includeAudioLane);
    if (inspection.project_id !== projectId) {
      throw new Error(
        `Workspace Runtime canonical timeline inspection belongs to project ${String(inspection.project_id)}, not ${projectId}`,
      );
    }
    if (inspection.timeline_id !== timelineId) {
      throw new Error(
        `Workspace Runtime canonical timeline inspection belongs to timeline ${String(inspection.timeline_id)}, not ${timelineId}`,
      );
    }
    if (inspection.representation !== 'canonical_head') {
      throw new Error(
        `Workspace Runtime canonical timeline inspection returned ${String(inspection.representation)} instead of canonical_head`,
      );
    }
    if (inspection.authority !== 'runtime_parent_composition') {
      throw new Error(
        `Workspace Runtime canonical timeline inspection returned authority ${String(inspection.authority)}`,
      );
    }
    if (inspection.is_current_head !== true) {
      throw new Error('Workspace Runtime canonical timeline inspection is not the current head');
    }
    const headRevisionId = nullableString(
      inspection.head_revision_id,
      'canonical timeline inspection.head_revision_id',
    );
    if (headRevisionId !== null && inspection.revision_id !== headRevisionId) {
      throw new Error(
        `Workspace Runtime canonical timeline inspection revision ${inspection.revision_id} does not match head ${headRevisionId}`,
      );
    }
    return inspection;
  }

  /**
   * Single request seam for the canonical authenticated inspect response used
   * by the editor loader. Audio presentation is explicitly opt-in and uses C's
   * exact request envelope; other inspect callers keep their existing request.
   */
  private requestCanonicalTimelineInspection(
    projectId: string,
    timelineId: string,
    includeAudioLane: boolean,
  ): Promise<CanonicalTimelineInspection> {
    const options = includeAudioLane
      ? {
        presentation: { audio_lane: true },
        supported_capabilities: ['adopted-music-bed'],
      }
      : {};
    return (this.client.inspectTimeline(projectId, timelineId, options) as Promise<CanonicalTimelineInspection>)
      .catch(async (error: unknown) => {
        if (!includeAudioLane || !(error instanceof ApiError)
          || !((error.status === 409 && error.code === 'unavailable')
            || (error.status === 422 && error.code === 'validation_error'))) {
          throw error;
        }

        // Runtime keeps plain inspect usable when the optional presenter or
        // caller capability is unavailable. Re-read that canonical head without
        // the opt-in and bind the visible refusal to the fallback response.
        const inspection = await this.client.inspectTimeline(projectId, timelineId) as unknown as CanonicalTimelineInspection;
        this.audioLaneRequestFailures.set(inspection as object, error.message);
        return inspection;
      });
  }

  private logShotTimelineLatency(phase: string, startedAt: number, traceId?: string): void {
    if (!isTimelineDiagnosticsEnabled()) return;
    const durationMs = Math.round(performance.now() - startedAt);
    if (traceId) {
      recordShotTimelinePhase(traceId, phase, { durationMs });
      return;
    }
    console.debug('[ShotTimelineLatency]', {
      phase,
      durationMs,
    });
  }

  private async loadRuntimeShotCompositionAtHead({ projectId, parentDocumentId: timelineId, headRevisionId }: ShotCompositionHeadReadRequest): Promise<unknown> {
    const parent = await this.client.getProjectParentCompositionRevision(projectId, timelineId, headRevisionId);
    assertRuntimeIdentity(parent, projectId, timelineId, 'parent composition revision');
    assertRevisionIdentity(parent, headRevisionId, 'parent composition revision');
    const parentPayload = requiredRecord(parent.payload, 'parent composition revision.payload');
    const rawOccurrences = array(parentPayload.occurrences, 'parent composition.occurrences');
    const identities = uniqueOccurrences(rawOccurrences).map((occurrence) => ({
      shotId: requiredString(occurrence.shot_id, 'parent composition occurrence.shot_id'),
      revisionId: requiredString(occurrence.shot_revision_id ?? occurrence.revision_id, 'parent composition occurrence.shot_revision_id'),
    }));
    const resolved = await Promise.all(identities.map(async ({ shotId, revisionId }) => {
      const shot = await this.client.getProjectShotRevision(projectId, shotId, revisionId);
      assertRuntimeIdentity(shot, projectId, shotId, 'shot revision');
      assertRevisionIdentity(shot, revisionId, 'shot revision');
      if (shot.shot_id !== shotId) throw new Error(`Runtime shot revision identity mismatch: requested ${shotId}, got ${String(shot.shot_id)}`);
      const internalRevisionId = requiredString(shot.internal_timeline_revision_id, `shot revision ${revisionId}.internal_timeline_revision_id`);
      // Runtime resolves this scope from the immutable child revision. The
      // parent timeline is not a child scope; never probe another timeline.
      const internalTimelineScope = requiredString(
        shot.internal_timeline_id, `shot revision ${revisionId}.internal_timeline_id`,
      );
      if (shot.timeline_id !== undefined && shot.timeline_id !== internalTimelineScope) {
        throw new ShotCompositionUnavailableError(
          `Workspace Runtime canonical internal timeline revision ${internalRevisionId} has conflicting timeline scopes`,
        );
      }
      let internal: RuntimeRecord;
      try {
        internal = await this.client.getProjectTimelineRevision(projectId, internalTimelineScope, internalRevisionId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          throw new ShotCompositionUnavailableError(
            `Workspace Runtime canonical internal timeline revision ${internalRevisionId} is unavailable at scope ${internalTimelineScope}`,
          );
        }
        throw error;
      }
      assertRuntimeIdentity(internal, projectId, internalTimelineScope, 'internal timeline revision');
      assertRevisionIdentity(internal, internalRevisionId, 'internal timeline revision');
      return { shot, internal };
    }));
    return runtimeGraphToContract(
      projectId,
      timelineId,
      { project_id: projectId, timeline_id: timelineId, version: 1, head_revision_id: headRevisionId },
      parent,
      resolved,
    );
  }

  /** Re-open the cached Runtime handshake before the next hosted read. */
  async reconnect(): Promise<void> {
    try {
      await this.client.reconnect();
    } catch (error) {
      this.reportRuntimeError(error);
      throw error;
    }
  }

  async loadTimeline(timelineId: string): Promise<LoadedTimeline> {
    const record = await this.readTimeline(timelineId, true);
    const configRecord = asRecord(record.config);
    if (!configRecord) {
      throw new TimelineSchemaIncompatibleError('Workspace Runtime timeline has no config object');
    }
    const bundle = configRecord.bundle;
    if (bundle !== undefined && bundle !== null) parseTimelineBundle(bundle);
    const { bundle: _storedBundle, ...configWithoutBundle } = configRecord;
    return {
      config: { ...configWithoutBundle, ...withDefaultTimelineOutput(configWithoutBundle as Partial<TimelineConfig>) },
      configVersion: runtimeVersion(record),
      head: this.timelineHead(timelineId, record.head_revision_id as string | null),
      ...(record.audioLanePresentation
        ? { audioLanePresentation: record.audioLanePresentation as AudioLanePresentation }
        : {}),
      ...(bundle === null ? { bundle: null } : bundle === undefined ? {} : { bundle: bundle as TimelineBundleEnvelope }),
    };
  }

  async loadAssetRegistry(timelineId: string): Promise<AssetRegistry> {
    const registry = normalizeRegistry((await this.readTimeline(timelineId)).registry);
    this.activeRegistry = registry;
    return registry;
  }

  async loadReferencedTimeline(timelineId: string): Promise<LoadedReferencedTimeline> {
    const record = await this.readTimeline(timelineId, true);
    const configRecord = asRecord(record.config);
    if (!configRecord) {
      throw new TimelineSchemaIncompatibleError('Workspace Runtime timeline has no config object');
    }
    const bundle = configRecord.bundle;
    if (bundle !== undefined && bundle !== null) parseTimelineBundle(bundle);
    const { bundle: _storedBundle, ...configWithoutBundle } = configRecord;
    return {
      timeline: {
        config: { ...configWithoutBundle, ...withDefaultTimelineOutput(configWithoutBundle as Partial<TimelineConfig>) },
        configVersion: runtimeVersion(record),
        head: this.timelineHead(timelineId, record.head_revision_id as string | null),
        ...(record.audioLanePresentation
          ? { audioLanePresentation: record.audioLanePresentation as AudioLanePresentation }
          : {}),
        ...(bundle === null ? { bundle: null } : bundle === undefined ? {} : { bundle: bundle as TimelineBundleEnvelope }),
      },
      registry: normalizeRegistry(record.registry),
      resolveAssetUrl: async (file: string) => this.resolveAssetUrlFromRegistry(file, normalizeRegistry(record.registry)),
    };
  }

  async setPrimaryTimeline(timelineId: string): Promise<void> {
    const project = await this.client.getProject(this.projectId);
    await this.client.updateProject(
      this.projectId,
      generateUUID(),
      project.version,
      undefined,
      { ...project.metadata, default_timeline_id: timelineId },
    );
  }

  async saveTimeline(
    timelineId: string,
    config: TimelineConfig,
    expectedVersion: number,
    _registry?: AssetRegistry,
    _bundle?: TimelineBundleEnvelope | null,
  ): Promise<number> {
    throw new TimelineVersionConflictError('Workspace Runtime requires the original scoped timeline head; numeric versions cannot authorize a save.', expectedVersion);
  }

  private timelineHead(timelineId: string, headRevisionId: string | null): TimelineHeadRevision {
    return { projectId: this.projectId, timelineId, headRevisionId };
  }

  async saveTimelineAtHead(
    timelineId: string,
    config: TimelineConfig,
    expectedHead: TimelineHeadRevision,
    registry?: AssetRegistry,
    bundle?: TimelineBundleEnvelope | null,
    editCommands?: readonly EditCommand[],
    occurrenceContext?: TimelineOccurrenceContext,
  ): Promise<TimelineSaveReceipt> {
    if (expectedHead?.projectId !== this.projectId || expectedHead.timelineId !== timelineId
      || !(expectedHead.headRevisionId === null || (typeof expectedHead.headRevisionId === 'string' && expectedHead.headRevisionId.length > 0))) {
      throw new TimelineVersionConflictError('Workspace Runtime save has missing or untrusted timeline head provenance.');
    }
    const base = { ...expectedHead };
    if (this.commitRouting?.enabled && (editCommands !== undefined || this.commitRouting.requestForSave)) {
      // Capture before waiting: subsequent editor/producer mutations cannot alter this save.
      const save = freezeCommitValue(structuredClone({ timelineId, expectedHead: base, config, registry, bundle, editCommands, occurrenceContext }));
      return this.saveCommitAtHead(save, { config, registry, bundle, headRevisionId: base.headRevisionId });
    }
    return this.withTimelineOperation(timelineId, () =>
      this.saveTimelineInOrder(timelineId, config, base, registry, bundle));
  }

  private async initializeRecoveryIdentity(): Promise<void> {
    const { handshake, realm } = await this.client.ensureSession();
    this.recoveryRealmId = typeof realm.realm_id === 'string' && realm.realm_id.length > 0
      && realm.realm_id === handshake.realm_id ? realm.realm_id : null;
  }

  getTimelineDraftRecoveryMetadata(timelineId?: string): TimelineDraftRecoveryMetadata {
    // Injected request producers own their scope/session. Never guess those
    // dimensions from the native gesture path or fall back to a timeline key.
    if (!this.recoveryRealmId || !this.projectId || !timelineId
      || !this.commitSession.recoverable || this.commitRouting?.requestForSave) {
      return { recoveryKey: null };
    }
    return { recoveryKey: JSON.stringify([
      'runtime-timeline-draft-v1', this.recoveryRealmId, this.projectId,
      timelineId, this.commitScope, this.commitSession.id,
    ]) };
  }

  private requestForGestureSave(save: TimelineCommitSaveContext): ImmutableCommitRequest {
    if (!save.expectedHead.headRevisionId) {
      throw new TimelineSchemaIncompatibleError('Semantic gestures require an existing exact revision.');
    }
    const occurrence = save.occurrenceContext;
    const shotMetadata = save.editCommands?.some((command) => command.op === 'shot.set');
    if (occurrence && (occurrence.projectId !== this.projectId || occurrence.parentDocumentId !== save.timelineId
      || occurrence.headRevisionId !== save.expectedHead.headRevisionId
      || ![occurrence.occurrenceId, occurrence.shotId, occurrence.shotRevisionId, occurrence.internalRevisionId].every(Boolean)
      || !save.editCommands?.length || save.editCommands.some((command) =>
        !(shotMetadata
          ? save.editCommands?.length === 1 && isCapturedShotMetadataCommand(command as EditCommand, occurrence)
          : isTranscriptCaptionBatch(save.editCommands as readonly EditCommand[])
            ? transcriptBindTarget(save.editCommands?.[0] as EditCommand | undefined)?.occurrence_id === occurrence.occurrenceId
            : command.select?.startsWith(`occurrence:${occurrence.occurrenceId}/clip:`)
            && command.resolved?.length === 1 && command.resolved[0] === command.select)))) {
      throw new TimelineSchemaIncompatibleError('Semantic occurrence gestures require one captured owner and exact pins.');
    }
    if (!occurrence && save.editCommands?.some((command) => command.select?.startsWith('occurrence:'))) {
      throw new TimelineSchemaIncompatibleError('Semantic occurrence gestures require their captured context.');
    }
    const session = this.commitSession.next();
    return {
      api_version: 1, project_id: this.projectId, timeline_id: save.timelineId,
      request_id: generateUUID(), session_id: session.id,
      session_sequence: session.sequence,
      base_revision_id: save.expectedHead.headRevisionId, base_publication_id: null,
      scope: occurrence ? { target: `occurrence:${occurrence.occurrenceId}`, content: 'this-occurrence',
        shot_id: occurrence.shotId, shot_revision_id: occurrence.shotRevisionId,
        internal_revision_id: occurrence.internalRevisionId, complete: ['clips', 'tracks'], projection_version: 1 }
        : this.commitScope,
      change: { commands: save.editCommands ?? [] },
      source: { via: 'app' }, dry_run: false,
    };
  }

  private saveCommitAtHead(
    save: TimelineCommitSaveContext, owner: TimelineCommitAttemptOwner,
  ): Promise<TimelineSaveReceipt> {
    const { timelineId } = save;
    let pending = this.pendingCommits.get(timelineId);
    // useTimelinePersistence retains the exact attempt objects for a transport
    // retry and clones a new config for a newer edit. Equal snapshot values do
    // not prove equal authorship and must never deduplicate distinct gestures.
    if (pending && (pending.owner.config !== owner.config || pending.owner.registry !== owner.registry
      || pending.owner.bundle !== owner.bundle || pending.owner.headRevisionId !== owner.headRevisionId)) {
      // Wait outside timelineOperations so the original attempt can retry while
      // newer edits are parked. Waiting inside that queue would deadlock its retry.
      return pending.settled.then(() => this.saveCommitAtHead(save, owner));
    }
    if (!pending) {
      const produced = this.commitRouting?.requestForSave
        ? this.commitRouting.requestForSave(save)
        : this.requestForGestureSave(save);
      // JSON is the generated client's wire boundary. Capture once, including nested
      // commands; the producer retains no mutable reference into a retry's body.
      const request = freezeCommitValue(JSON.parse(JSON.stringify(produced)) as CommitRequest);
      if (request.project_id !== this.projectId || request.timeline_id !== timelineId
        || request.base_revision_id !== save.expectedHead.headRevisionId || request.dry_run
        || request.source.via !== 'app' || !request.request_id || !request.session_id) {
        throw new TimelineSchemaIncompatibleError('Commit producer supplied an untrusted save identity or base.');
      }
      let release!: () => void;
      const settled = new Promise<void>((resolve) => { release = resolve; });
      const currentHead = this.canonicalTimelineState.get(timelineId)?.headRevisionId;
      // Commands keep their authored base. Only Astrid may rebase a suffix
      // after an earlier save (or another writer) advanced the canonical head.
      const needsPreview = currentHead !== undefined && currentHead !== request.base_revision_id;
      pending = { owner, request: needsPreview
        ? freezeCommitValue({ ...request, dry_run: true }) : request, settled, release };
      this.pendingCommits.set(timelineId, pending);
    }
    if (pending.flight) return pending.flight;
    const attempt = pending;
    const finish = () => {
      if (this.pendingCommits.get(timelineId) === attempt) this.pendingCommits.delete(timelineId);
      attempt.release();
    };
    attempt.flight = this.withTimelineOperation(timelineId, async () => {
      try {
        if (attempt.request.dry_run) {
          const preview = await this.client.commitTimeline(attempt.request);
          this.validateCommitResponse(attempt.request, preview);
          if (preview.status !== 'preview' || preview.accepted_revision_id !== null
            || preview.accepted_publication_id !== null || preview.schema_report !== null
            || !Array.isArray(preview.change?.commands)) {
            throw new TimelineSchemaIncompatibleError('Runtime did not return a complete timeline suffix preview.');
          }
          const targetHead = preview.rebased_onto ?? preview.base_revision_id;
          if (typeof targetHead !== 'string' || targetHead.length === 0) {
            throw new TimelineSchemaIncompatibleError('Runtime suffix preview omitted its target head.');
          }
          // This is a new real transaction, not a retry of the dry-run key.
          // Capture it before sending: uncertain transport always retries these
          // exact commands, target and identity, even if the head later moves.
          const session = this.commitSession.next(attempt.request.session_sequence);
          attempt.request = freezeCommitValue(JSON.parse(JSON.stringify({
            ...attempt.request, request_id: generateUUID(),
            // An injected producer retains its own session identity. Native
            // gestures use the same persisted allocator for preview and commit.
            session_id: this.commitRouting?.requestForSave ? attempt.request.session_id : session.id,
            session_sequence: session.sequence,
            base_revision_id: targetHead, base_publication_id: null,
            change: { commands: preview.change.commands }, dry_run: false,
          })) as CommitRequest);
        }
        const result = await this.client.commitTimeline(attempt.request);
        this.validateCommitResponse(attempt.request, result);
        if (result.status !== 'accepted' && result.status !== 'no_change') {
          throw new TimelineSchemaIncompatibleError(result.error?.message ?? 'Runtime did not accept the timeline commit.');
        }
        const receipt = await this.readCommittedTimeline(timelineId, attempt.request, result);
        finish();
        return receipt;
      } catch (error) {
        // Terminal responses release the next save. Transport/unknown outcomes keep
        // the exact request reserved until its acknowledgement is recovered.
        if (error instanceof TimelineVersionConflictError || error instanceof TimelineSchemaIncompatibleError
          || (error instanceof ApiError && error.status >= 400 && error.status < 500
            && error.status !== 408 && error.status !== 429)) finish();
        throw this.toProviderError(error, timelineId);
      }
    }).finally(() => { attempt.flight = undefined; });
    return attempt.flight;
  }

  private validateCommitResponse(request: CommitRequest, result: CommitResult): void {
    if (!result || result.request_id !== request.request_id || result.base_revision_id !== request.base_revision_id
      || !Array.isArray(result.conflicts) || !Array.isArray(result.choices)) {
      throw new TimelineSchemaIncompatibleError('Runtime commit response does not identify this request.');
    }
    if (result.status === 'error' && result.error?.code === 'runtime_unavailable') {
      throw new RuntimeUnavailableError(new ApiError(503, result.error.code, result.error.message), this.apiBaseUrl);
    }
    if (result.status === 'conflict' || result.conflicts?.length || result.choices?.length) {
      throw new TimelineVersionConflictError('Runtime commit requires conflict resolution.');
    }
    if (result.error || result.status === 'refused' || result.status === 'error') {
      throw new TimelineSchemaIncompatibleError(result.error?.message ?? 'Runtime refused the timeline commit.');
    }
  }

  private async readCommittedTimeline(
    timelineId: string, request: CommitRequest, result: CommitResult,
  ): Promise<TimelineSaveReceipt> {
    const head = result.accepted_revision_id ?? (result.status === 'no_change' ? result.base_revision_id : null);
    if (!head) throw new TimelineSchemaIncompatibleError('Runtime commit omitted its accepted revision.');
    // Resolve the exact immutable Runtime revision, never infer publication shape
    // from the request snapshot or substitute a later polled head.
    const record = await this.client.getProjectParentCompositionRevision(this.projectId, timelineId, head);
    assertRuntimeIdentity(record, this.projectId, timelineId, 'committed parent composition revision');
    assertRevisionIdentity(record, head, 'committed parent composition revision');
    const parentComposition = requiredRecord(record.payload, 'committed parent composition revision.payload');
    const current = this.canonicalTimelineState.get(timelineId);
    if (current && current.headRevisionId !== request.base_revision_id && current.headRevisionId !== head) {
      throw new TimelineVersionConflictError('The commit was confirmed, but the timeline has since changed; review the current head.');
    }
    const version = current?.headRevisionId === head ? current.version : (current?.version ?? 0) + 1;
    const registry = normalizeRegistry(parentComposition.registry);
    this.canonicalTimelineState.set(timelineId, { headRevisionId: head, parentComposition, version });
    this.activeRegistry = registry;
    const registryCommands = 'commands' in request.change ? request.change.commands : [];
    const registryNoChange = result.status === 'no_change' && registryCommands.length === 1
      && (isAssetRegistrationCommand(registryCommands[0]) || isAssetRegistrationInverse(registryCommands[0]));
    const captionInverse = transcriptCaptionInverse(registryCommands, result);
    const overlapInverse = overlapTrimInverse(registryCommands, result);
    // null means this owner explicitly had no change; it must not fall through.
    const commandInverse = registryNoChange ? null : [captionInverse, assetRegistrationInverse(registryCommands, result),
      overlapInverse, tiedHoldExpansionInverse(registryCommands, result), clipPlacementInverse(registryCommands, result),
      clipStructureInverse(registryCommands, result), trackHistoryInverse(registryCommands, result)]
      .find(inverse => inverse !== undefined);
    return { configVersion: version, head: this.timelineHead(timelineId, head),
      ...(commandInverse !== undefined ? { commandInverse } : {}) };
  }

  private async saveTimelineInOrder(
    timelineId: string,
    config: TimelineConfig,
    base: TimelineHeadRevision,
    registry?: AssetRegistry,
    bundle?: TimelineBundleEnvelope | null,
  ): Promise<TimelineSaveReceipt> {
    if (bundle !== undefined && bundle !== null) parseTimelineBundle(bundle);
    let current = this.canonicalTimelineState.get(timelineId);
    if (!current) {
      await this.readTimelineInOrder(timelineId);
      current = this.canonicalTimelineState.get(timelineId);
    }
    if (!current) {
      throw new TimelineSchemaIncompatibleError('Workspace Runtime canonical timeline state was not loaded');
    }
    const expectedVersion = current.version;
    const deletedTransitions = config.clips
      .filter((clip) => Object.prototype.hasOwnProperty.call(clip, 'transition') && clip.transition === undefined)
      .map((clip) => clip.id);
    // JSON omits undefined. Pending acknowledgements must still distinguish an
    // explicit None action from an otherwise identical partial clip edit.
    const requestSignature = stableJson({ config, registry, bundle,
      ...(deletedTransitions.length > 0 ? { deletedTransitions } : {}),
    });
    const pending = this.unacknowledgedSaves.get(timelineId);
    const replay = pending?.expectedHead === base.headRevisionId
      && pending.requestSignature === requestSignature ? pending : undefined;
    if (pending && !replay && pending.expectedHead === base.headRevisionId) {
      throw new TimelineVersionConflictError('An unacknowledged save owns this timeline head and payload; resolve its acknowledgement before publishing another edit.');
    }
    // Load the immutable base payload, not a newer cached/polled head. Runtime
    // owns CAS (and checks idempotency replay first), including read/publish races.
    const baseComposition = replay ? replay.parentComposition
      : current.headRevisionId === base.headRevisionId ? current.parentComposition
      : base.headRevisionId === null ? { config: {}, registry: { assets: {} }, clips: [], occurrences: [] }
      : await this.client.getProjectParentCompositionRevision(this.projectId, timelineId, base.headRevisionId)
          .then((record) => {
            assertRuntimeIdentity(record, this.projectId, timelineId, 'parent composition revision');
            assertRevisionIdentity(record, base.headRevisionId!, 'parent composition revision');
            return requiredRecord(record.payload, 'parent composition revision.payload');
          });
    const nextRegistry = registry ?? normalizeRegistry(baseComposition.registry);
    const { output: _derivedOutput, ...configWithoutOutput } = config;
    const baseConfig = asRecord(baseComposition.config);
    const { output: _baseDerivedOutput, ...baseConfigWithoutOutput } = baseConfig ?? {};
    const storedBundle = baseConfig?.bundle;
    const nextClips = reconcileParentClips(baseComposition, config.clips);
    const configForWire: RuntimeRecord = {
      ...baseConfigWithoutOutput,
      ...configWithoutOutput,
      // Runtime accepts the legacy duplicate for compatibility, but both
      // copies must describe the same authored parent clips. Keeping the
      // editor's authored order/content here also preserves clip edits while
      // reconciling the canonical top-level field below.
      clips: nextClips,
      tracks: config.tracks ?? [],
      ...(bundle !== undefined
        ? { bundle }
        : storedBundle !== undefined
          ? { bundle: storedBundle }
          : {}),
    };
    const parentComposition: RuntimeRecord = replay?.parentComposition ?? {
      ...baseComposition,
      clips: nextClips,
      config: configForWire,
      registry: nextRegistry,
    };
    const expectedHead = base.headRevisionId;
    const idempotencyKey = replay?.idempotencyKey ?? await stableTimelinePublicationKey(
      this.projectId,
      timelineId,
      expectedHead,
      parentComposition,
    );
    this.unacknowledgedSaves.set(timelineId, {
      expectedVersion, requestSignature, expectedHead,
      parentComposition: structuredClone(parentComposition), idempotencyKey,
    });

    const publishStartedAt = performance.now();
    if (isTimelineDiagnosticsEnabled()) {
      console.log('[TimelineSave] runtime publish start', {
        projectId: this.projectId,
        timelineId,
        expectedHead,
        idempotencyKey,
        payloadBytes: JSON.stringify({
          expected_head: expectedHead,
          parent_composition: parentComposition,
        }).length,
        topLevelClipIds: Array.isArray(parentComposition.clips)
          ? parentComposition.clips.map((clip) => asRecord(clip)?.id)
          : null,
        configClipIds: Array.isArray(asRecord(parentComposition.config)?.clips)
          ? (asRecord(parentComposition.config)?.clips as unknown[]).map((clip) => asRecord(clip)?.id)
          : null,
      });
    }
    try {
      const saved = await this.client.publishParentComposition(
        this.projectId,
        timelineId,
        {
          expected_head: expectedHead,
          parent_revision_id: idempotencyKey,
          parent_composition: parentComposition,
          // Existing immutable child revisions are resolved by Runtime from
          // the parent occurrences. The editor only changes the parent
          // config/registry, so it must not reconstruct child authority.
          internal_timeline_revisions: [],
          shot_revisions: [],
        },
        idempotencyKey,
      );
      if (isTimelineDiagnosticsEnabled()) {
        console.log('[TimelineSave] runtime publish success', {
          projectId: this.projectId,
          timelineId,
          durationMs: Math.round(performance.now() - publishStartedAt),
          revisionId: saved.revision_id ?? saved.parent_revision_id ?? saved.new_head,
        });
      }
      const committedHead = saved.revision_id ?? saved.parent_revision_id ?? saved.new_head;
      if (typeof committedHead !== 'string' || committedHead.length === 0) {
        throw new Error('Workspace Runtime publication receipt omitted its committed parent head');
      }
      // A replay receipt proves our save committed, but must never rebase a
      // local draft onto a different head observed in the meantime.
      if (current.headRevisionId !== expectedHead && current.headRevisionId !== committedHead) {
        throw new TimelineVersionConflictError(
          'The save was confirmed, but the timeline has since changed; review the current head.',
          expectedVersion, current.version,
        );
      }
      const savedRegistry = normalizeRegistry(parentComposition.registry);
      const nextVersion = current.headRevisionId === committedHead ? current.version : current.version + 1;
      this.canonicalTimelineState.set(timelineId, {
        headRevisionId: committedHead,
        parentComposition: {
          ...parentComposition,
          registry: savedRegistry,
        },
        version: nextVersion,
      });
      this.activeRegistry = savedRegistry;
      this.unacknowledgedSaves.delete(timelineId);
      return { configVersion: nextVersion, head: this.timelineHead(timelineId, committedHead) };
    } catch (error) {
      if (isTimelineDiagnosticsEnabled()) {
        const diagnostic = error && typeof error === 'object'
          ? error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; details?: unknown }
          : {};
        console.error('[TimelineSave] runtime publish failed ' + JSON.stringify({
          projectId: this.projectId,
          timelineId,
          durationMs: Math.round(performance.now() - publishStartedAt),
          name: diagnostic.name,
          message: diagnostic.message,
          code: diagnostic.code,
          status: diagnostic.status,
          details: diagnostic.details,
        }));
      }
      if (error instanceof TimelineVersionConflictError
        || (error instanceof ApiError && error.status >= 400 && error.status < 500
          && error.status !== 408 && error.status !== 429)) {
        this.unacknowledgedSaves.delete(timelineId);
      }
      throw this.toProviderError(error, timelineId, expectedVersion);
    }
  }

  async resolveAssetUrl(file: string): Promise<string> {
    return this.resolveAssetUrlFromRegistry(file, this.activeRegistry);
  }

  /** Resolve a Runtime generation into the editor's existing lightbox row shape. */
  async loadGenerationForLightbox(generationId: string): Promise<GenerationRow | null> {
    try {
      const generation = await this.client.getGeneration(generationId);
      const variants = await listAllRuntimeVariants(this.client, generationId, 200);
      const primary = selectRuntimePrimaryVariant(variants);
      if (!primary?.object_id) return null;
      const mediaType = typeof primary.metadata.media_type === 'string'
        ? primary.metadata.media_type
        : (typeof primary.metadata.content_type === 'string' ? primary.metadata.content_type : 'image/png');
      const url = this.client.objectContentUrl(primary.object_id);
      const thumbnailObjectId = runtimeThumbnailObjectId(generation, primary.object_id);
      const thumbnailUrl = thumbnailObjectId
        ? this.client.objectContentUrl(thumbnailObjectId)
        : null;
      return {
        id: generation.generation_id,
        generation_id: generation.generation_id,
        location: url,
        imageUrl: url,
        ...(thumbnailUrl ? { thumbUrl: thumbnailUrl } : {}),
        type: mediaType,
        contentType: mediaType,
        createdAt: generation.created_at,
        metadata: generation.metadata,
        name: typeof generation.metadata.name === 'string' ? generation.metadata.name : null,
        primary_variant_id: primary.variant_id,
        source_task_id: generation.source_task_id ?? null,
        media_id: primary.object_id,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  /** Read managed bytes through the generated Range/ETag Runtime contract. */
  async readAsset(file: string, byteRange?: [number, number?]): Promise<ByteResponse> {
    const asset = this.findManagedAsset(file, true);
    const response = await this.client.getObject(asset.objectId, byteRange);
    assertManagedObjectIdentity(asset.objectId, asset.expectedDigest, response.etag);
    return response;
  }

  /** Read managed media metadata through the generated Range/ETag contract. */
  async headAsset(file: string, byteRange?: [number, number?]): Promise<ByteResponse> {
    const asset = this.findManagedAsset(file, true);
    const response = await this.client.headObject(asset.objectId, byteRange);
    assertManagedObjectIdentity(asset.objectId, asset.expectedDigest, response.etag);
    return response;
  }

  async onResolve(request: AssetResolveRequest): Promise<string> {
    return this.resolveAssetUrl(request.assetId ?? request.file);
  }

  async registerAsset(timelineId: string, assetId: string, entry: AssetRegistryEntry): Promise<void> {
    const key = JSON.stringify([timelineId, assetId]);
    let attempts = this.assetRegistrationAttempts.get(entry);
    let captured = attempts?.get(key);
    if (this.semanticCommandSaving && (captured || assetRegistrationCommand({ assets: {} }, assetId, entry))) {
      if (!attempts) { attempts = new Map(); this.assetRegistrationAttempts.set(entry, attempts); }
      const owner = attempts;
      if (!captured) {
        const assignedEntry = structuredClone(entry);
        captured = this.withTimelineOperation(timelineId, async () => {
          const record = await this.readTimelineInOrder(timelineId);
          const parent = this.canonicalTimelineState.get(timelineId)?.parentComposition;
          const config = asRecord(record.config);
          if (!parent || !config) throw new TimelineSchemaIncompatibleError('Asset registration has no captured canonical parent');
          const command = assetRegistrationCommand(parent.registry, assetId, assignedEntry)!;
          return { config: withDefaultTimelineOutput(config as Partial<TimelineConfig>),
            registry: { ...normalizeRegistry(record.registry), assets: { ...normalizeRegistry(record.registry).assets, [assetId]: assignedEntry } },
            head: this.timelineHead(timelineId, record.head_revision_id as string | null), commands: [command] };
        });
        owner.set(key, captured);
        void captured.catch(() => { if (owner.get(key) === captured) owner.delete(key); });
      }
      let savedConfig: TimelineConfig | undefined;
      try {
        const save = await captured;
        savedConfig = save.config;
        // Outside the read queue: the existing save owner serializes transport
        // and retains these exact objects/identity after an unknown outcome.
        await this.saveTimelineAtHead(timelineId, save.config, save.head, save.registry, undefined, save.commands);
        owner.delete(key);
      } catch (error) {
        // Match the existing save owner's terminal/unknown classification,
        // including an uncertain exact-head read after accepted transport.
        if (!savedConfig || this.pendingCommits.get(timelineId)?.owner.config !== savedConfig) owner.delete(key);
        throw error;
      }
      return;
    }
    return this.withTimelineOperation(timelineId, async () => {
      const record = await this.readTimelineInOrder(timelineId);
      const configRecord = asRecord(record.config);
      if (!configRecord) throw new TimelineSchemaIncompatibleError('Workspace Runtime timeline has no config object');
      await this.saveTimelineInOrder(
        timelineId,
        withDefaultTimelineOutput(configRecord as Partial<TimelineConfig>),
        this.timelineHead(timelineId, record.head_revision_id as string | null),
        {
          assets: { ...normalizeRegistry(record.registry).assets, [assetId]: entry },
        },
      );
    });
  }

  /**
   * Settle local image/video bytes in Runtime's host-owned catalog boundary.
   * The operation key is persisted before the request so a lost response can
   * be recovered with Runtime's operation lookup without re-importing bytes.
   */
  async prepareMediaImport(
    file: File,
    options: MediaImportOptions = {},
  ): Promise<PreparedMediaImport> {
    assertRuntimeMediaImportSize(file);
    const importOperationId = generateUUID();
    const mediaType = options.mediaType ?? file.type;
    const filename = options.filename ?? file.name;
    persistMediaImportOperation(this.projectId, importOperationId, { filename, mediaType });

    const data = file;
    let imported: MediaImport;
    try {
      imported = await this.client.importProjectMedia(
        this.projectId,
        data,
        mediaType,
        importOperationId,
        filename,
        options.expectedDigest,
        options.width,
        options.height,
        options.durationSeconds,
      );
    } catch (firstError) {
      imported = await recoverMediaImportAfterLostAck(
        this.client,
        this.projectId,
        data,
        mediaType,
        filename,
        importOperationId,
        options,
        firstError,
      );
    }

    if (imported.project !== this.projectId) {
      throw new Error(
        `Workspace Runtime media import belongs to project ${imported.project}, not ${this.projectId}`,
      );
    }

    const prepared = toPreparedMediaImport(
      this.client,
      imported,
      mediaType,
      filename,
      options.durationSeconds,
    );
    persistMediaImportOperation(this.projectId, importOperationId, prepared);
    this.activeRegistry = {
      assets: {
        ...(this.activeRegistry?.assets ?? {}),
        [prepared.assetId]: prepared.entry,
      },
    };
    return prepared;
  }

  async prepareAsset(file: File, options: UploadAssetOptions): Promise<UploadedAssetResult> {
    // AssetPanel and external drops use this seam. User media must take the
    // same validated host import/catalog operation as gallery imports.
    const prepared = await this.prepareMediaImport(file, {
      filename: options.filename ?? file.name,
    });
    const entry: AssetRegistryEntry = {
      ...prepared.entry,
      metadata: {
        ...prepared.entry.metadata,
        provenance: {
          ...prepared.entry.metadata?.provenance,
          sourceProvider: 'workspace-runtime',
          importedBy: options.userId,
          originalFilename: options.filename ?? file.name,
        },
      },
    };
    return { assetId: prepared.assetId, entry };
  }

  async uploadAsset(file: File, options: UploadAssetOptions): Promise<UploadedAssetResult> {
    const result = await this.prepareAsset(file, options);
    await this.registerAsset(options.timelineId, result.assetId, result.entry);
    return result;
  }

  async onUpload(request: AssetUploadRequest): Promise<UploadedAssetResult> {
    return this.uploadAsset(request.file, request.options);
  }

  private readTimeline(timelineId: string, includeAudioLane = false): Promise<RuntimeRecord> {
    return this.withTimelineOperation(timelineId, () => this.readTimelineInOrder(timelineId, includeAudioLane));
  }

  private async readTimelineInOrder(timelineId: string, includeAudioLane = false): Promise<RuntimeRecord> {
    try {
      const inspection = await this.inspectCanonicalTimelineHead(this.projectId, timelineId, includeAudioLane);
      const headRevisionId = nullableString(
        inspection.head_revision_id,
        'canonical timeline inspection.head_revision_id',
      );
      const parentComposition = headRevisionId === null
        ? { config: {}, registry: { assets: {} }, clips: [], occurrences: [] }
        : await this.client.getProjectParentCompositionRevision(
            this.projectId,
            timelineId,
            headRevisionId,
          ).then((record) => {
            assertRuntimeIdentity(record, this.projectId, timelineId, 'parent composition revision');
            assertRevisionIdentity(record, headRevisionId, 'parent composition revision');
            return requiredRecord(record.payload, 'parent composition revision.payload');
          });
      const config = asRecord(parentComposition.config);
      if (!config) {
        throw new TimelineSchemaIncompatibleError('Workspace Runtime canonical timeline has no config object');
      }
      const clips = canonicalParentClips(parentComposition, config);
      // Both direct and referenced editor loads must establish recovery from
      // the same authenticated realm. A missing/mismatched identity disables
      // recovery only; ordinary Runtime reads keep their existing errors.
      await this.initializeRecoveryIdentity();
      const previous = this.canonicalTimelineState.get(timelineId);
      const version = previous && previous.headRevisionId === headRevisionId
        ? previous.version
        : (previous?.version ?? 0) + 1;
      this.canonicalTimelineState.set(timelineId, {
        headRevisionId,
        parentComposition,
        version,
      });
      return {
        project_id: this.projectId,
        timeline_id: timelineId,
        version,
        head_revision_id: headRevisionId,
        config: { ...config, clips },
        registry: parentComposition.registry ?? { assets: {} },
        ...(includeAudioLane ? {
          audioLanePresentation: readAudioLanePresentation(inspection, {
            projectId: this.projectId,
            timelineId,
            revisionId: headRevisionId ?? inspection.revision_id,
          }, this.audioLaneRequestFailures.get(inspection as object)),
        } : {}),
      };
    } catch (error) {
      throw this.toProviderError(error, timelineId);
    }
  }

  private findManagedAsset(
    candidate: string,
    requireDigest = false,
    registry: AssetRegistry | null = this.activeRegistry,
  ): { objectId: string; expectedDigest: string } {
    const entry = Object.entries(registry?.assets ?? {}).find(([assetId, value]) => (
      assetId === candidate || value.file === candidate || value.media_id === candidate
    ))?.[1];
    const objectId = entry?.media_id;
    if (!objectId) {
      throw new Error(`Workspace Runtime has no managed object for asset ${candidate}`);
    }
    const expectedDigest = normalizeDigest(entry.content_sha256 ?? entry.etag);
    if (requireDigest && !expectedDigest) {
      throw new Error(`Workspace Runtime registry has no digest identity for managed object ${objectId}`);
    }
    return { objectId, expectedDigest };
  }

  private async resolveAssetUrlFromRegistry(
    file: string,
    registry: AssetRegistry | null,
  ): Promise<string> {
    const candidate = file.trim();
    if (!candidate) throw new Error('Cannot resolve a Runtime asset URL for an empty file path');
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return this.client.objectContentUrl(this.findManagedAsset(candidate, false, registry).objectId);
  }

  private toProviderError(error: unknown, timelineId: string, expectedVersion?: number): Error {
    let providerError: Error;
    if (error instanceof TimelineSchemaIncompatibleError || error instanceof TimelineVersionConflictError) {
      providerError = error;
    } else if (isRuntimeUnavailableFailure(error)) {
      providerError = error instanceof RuntimeUnavailableError
        ? error
        : new RuntimeUnavailableError(error, this.apiBaseUrl);
    } else if (isRuntimeCanonicalPayloadConflict(error)) {
      providerError = new TimelineSchemaIncompatibleError(
        `Workspace Runtime rejected a non-canonical parent payload: ${error.message}`,
        [{ pointer: '/clips', code: 'canonical_duplicate_mismatch', message: error.message }],
      );
    } else if (isRuntimeConflict(error)) {
      const actual = asRecord(error.details)?.actual;
      providerError = new TimelineVersionConflictError(
        'Workspace Runtime rejected a stale timeline version; reload to review the canonical head.',
        expectedVersion,
        typeof actual === 'number' ? actual : undefined,
      );
    } else if (error instanceof ApiError && error.status === 404) {
      providerError = new TimelineNotFoundError(timelineId);
    } else if (error instanceof ApiError && error.status >= 400 && error.status < 500
      && error.status !== 408 && error.status !== 429) {
      // Deterministic client rejections are terminal for this payload. They
      // are not transport failures and must not enter the generic retry loop.
      const details = asRecord(error.details);
      providerError = new TimelineSchemaIncompatibleError(
        `Workspace Runtime rejected the timeline save: ${error.message}`,
        [{
          code: typeof details?.code === 'string' ? details.code : error.code,
          message: error.message,
        }],
      );
    } else {
      providerError = error instanceof Error ? error : new Error(String(error));
    }
    this.reportRuntimeError(providerError);
    return providerError;
  }

  private reportRuntimeError(error: unknown): void {
    if (error instanceof RuntimeAuthenticationError || error instanceof RuntimeUnavailableError) {
      this.onRuntimeError?.(error);
    }
  }
}

function asRecord(value: unknown): RuntimeRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RuntimeRecord
    : null;
}

function normalizeRegistry(value: unknown): AssetRegistry {
  const record = asRecord(value);
  const assets = asRecord(record?.assets);
  if (!assets) return { assets: {} };
  return {
    ...record,
    assets: Object.fromEntries(Object.entries(assets).map(([assetKey, rawEntry]) => {
      const entry = asRecord(rawEntry) as AssetRegistryEntry | null;
      if (!entry || entry.media_id || typeof entry.content_sha256 !== 'string') {
        return [assetKey, rawEntry];
      }
      const digest = entry.content_sha256.replace(/^sha256:/, '').trim();
      return /^[0-9a-f]{64}$/.test(digest)
        ? [assetKey, { ...entry, media_id: `sha256:${digest}` }]
        : [assetKey, rawEntry];
    })) as Record<string, AssetRegistryEntry>,
  };
}

function runtimeVersion(record: RuntimeRecord): number {
  const value = record.config_version ?? record.version;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TimelineSchemaIncompatibleError('Workspace Runtime timeline has no positive version');
  }
  return value;
}

function normalizeDigest(value: string | undefined): string {
  return value?.trim().replace(/^W\//, '').replace(/^"|"$/g, '') ?? '';
}

function assertManagedObjectIdentity(
  objectId: string,
  expectedDigest: string,
  etag: string | undefined,
): void {
  const actualDigest = normalizeDigest(etag);
  if (!actualDigest) {
    throw new Error(`Workspace Runtime object ${objectId} response omitted its strong ETag identity`);
  }
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `Workspace Runtime object identity mismatch for ${objectId}: expected ${expectedDigest}, got ${actualDigest}`,
    );
  }
}

const MEDIA_IMPORT_STORAGE_PREFIX = 'reigh.runtime.media-import.v1:';

function persistMediaImportOperation(
  projectId: string,
  importOperationId: string,
  value: object,
): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        `${MEDIA_IMPORT_STORAGE_PREFIX}${projectId}:${importOperationId}`,
        JSON.stringify({ projectId, importOperationId, ...value }),
      );
    }
  } catch {
    // Runtime remains the durable authority when browser storage is unavailable.
  }
}

async function recoverMediaImportAfterLostAck(
  client: ReighRuntimeClient,
  projectId: string,
  data: RequestBody,
  mediaType: string,
  filename: string,
  importOperationId: string,
  options: MediaImportOptions,
  firstError: unknown,
): Promise<MediaImport> {
  try {
    const recovered = await client.getProjectMediaImport(projectId, importOperationId);
    if (recovered.status === 'completed') return recovered;

    // A durable pending object means ingestion succeeded but the ACK was lost
    // before catalog settlement. Replaying the same caller key asks Runtime to
    // finish that exact operation; it cannot create a second object or pair.
    return await client.importProjectMedia(
      projectId,
      data,
      mediaType,
      importOperationId,
      filename,
      options.expectedDigest,
      options.width,
      options.height,
      options.durationSeconds,
    );
  } catch (recoveryError) {
    throw firstError instanceof Error ? firstError : recoveryError;
  }
}

function toPreparedMediaImport(
  client: ReighRuntimeClient,
  imported: MediaImport,
  fallbackMediaType: string,
  fallbackFilename: string,
  fallbackDuration?: number,
): PreparedMediaImport {
  if (
    imported.provider !== 'runtime'
    || imported.status !== 'completed'
    || typeof imported.project !== 'string'
    || typeof imported.import_operation_id !== 'string'
    || typeof imported.generation_id !== 'string'
    || typeof imported.variant_id !== 'string'
    || typeof imported.asset_id !== 'string'
  ) {
    throw new Error('Workspace Runtime returned an incomplete media import descriptor');
  }

  const mediaType = imported.entry.media_type || fallbackMediaType;
  const filename = imported.entry.filename || fallbackFilename;
  const duration = imported.duration_seconds ?? fallbackDuration;
  const entry: AssetRegistryEntry = {
    file: client.objectContentUrl(imported.asset_id),
    media_id: imported.asset_id,
    content_sha256: imported.asset_id,
    type: mediaType,
    ...(typeof duration === 'number' && duration > 0 ? { duration } : {}),
    generationId: imported.generation_id,
    variantId: imported.variant_id,
    metadata: {
      provenance: {
        sourceProvider: 'workspace-runtime',
        importOperationId: imported.import_operation_id,
        ...(imported.provenance ?? {}),
      },
      extensions: {
        originalFilename: filename,
        ...(typeof imported.entry.size === 'number' ? { byteSize: imported.entry.size } : {}),
      },
    },
  };

  return {
    provider: imported.provider,
    project: imported.project,
    importOperationId: imported.import_operation_id,
    generationId: imported.generation_id,
    variantId: imported.variant_id,
    assetId: imported.asset_id,
    entry,
  };
}

export type { RuntimeUnavailableError };

function requiredRecord(value: unknown, label: string): RuntimeRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Workspace Runtime ${label} must be an object`);
  }
  return value as RuntimeRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Workspace Runtime ${label} is missing`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function array(value: unknown, label: string): RuntimeRecord[] {
  if (!Array.isArray(value)) throw new Error(`Workspace Runtime ${label} must be an array`);
  return value.map((item, index) => requiredRecord(item, `${label}[${index}]`));
}

function assertRuntimeIdentity(value: RuntimeRecord, projectId: string, identity: string, label: string): void {
  if (value.project_id !== projectId) {
    throw new Error(`Workspace Runtime ${label} belongs to project ${String(value.project_id)}, not ${projectId}`);
  }
  const key = label.includes('shot') ? 'shot_id' : 'timeline_id';
  if (value[key] !== identity) {
    throw new Error(`Workspace Runtime ${label} belongs to ${key === 'shot_id' ? 'shot' : 'timeline'} ${String(value[key])}, not ${identity}`);
  }
}

function assertRevisionIdentity(value: RuntimeRecord, revisionId: string, label: string): void {
  if (value.revision_id !== revisionId) {
    throw new Error(`Workspace Runtime ${label} identity mismatch: requested ${revisionId}, got ${String(value.revision_id)}`);
  }
}

function assertGraphRequestIdentity(graph: unknown, projectId: string, timelineId: string): void {
  const graphRecord = requiredRecord(graph, 'publication graph');
  const project = requiredRecord(graphRecord.project, 'publication graph.project');
  const primary = requiredRecord(graphRecord.primary_timeline, 'publication graph.primary_timeline');
  const graphProjectId = requiredString(project.project_id, 'publication graph.project.project_id');
  const projectDocumentId = requiredString(project.document_id, 'publication graph.project.document_id');
  const primaryDocumentId = requiredString(primary.document_id, 'publication graph.primary_timeline.document_id');
  if (graphProjectId !== projectId) {
    throw new Error(`Workspace Runtime publication graph belongs to project ${graphProjectId}, not ${projectId}`);
  }
  if (projectDocumentId !== timelineId) {
    throw new Error(`Workspace Runtime publication graph project document is ${projectDocumentId}, not ${timelineId}`);
  }
  if (primaryDocumentId !== timelineId) {
    throw new Error(`Workspace Runtime publication graph primary timeline is ${primaryDocumentId}, not ${timelineId}`);
  }
}

function uniqueOccurrences(occurrences: RuntimeRecord[]): RuntimeRecord[] {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    const key = `${String(occurrence.shot_id)}\u0000${String(occurrence.shot_revision_id ?? occurrence.revision_id)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalArray(value: unknown, fallback: unknown[] = []): unknown[] {
  return Array.isArray(value) ? value : fallback;
}

function canonicalParentClips(parent: RuntimeRecord, config: RuntimeRecord): unknown[] {
  // Match Runtime's _canonical_parent_clips: absent lists are empty, malformed
  // lists fail closed, and only two non-empty authorities can conflict.
  const parentClips = parent.clips === undefined ? [] : parent.clips;
  const configClips = config.clips === undefined ? [] : config.clips;
  if (!Array.isArray(parentClips) || !Array.isArray(configClips)) {
    throw new TimelineSchemaIncompatibleError('Workspace Runtime canonical parent composition clips are invalid');
  }
  if (parentClips.length && configClips.length && stableJson(parentClips) !== stableJson(configClips)) {
    throw new TimelineSchemaIncompatibleError('Workspace Runtime canonical parent clips and config.clips disagree');
  }
  return parentClips.length ? parentClips : configClips;
}


function reconcileParentClips(
  baseComposition: RuntimeRecord,
  authoredClips: unknown,
): RuntimeRecord[] {
  const baseConfig = asRecord(baseComposition.config);
  canonicalParentClips(baseComposition, baseConfig ?? {});
  const topLevelClips = asRuntimeRecordArray(baseComposition.clips, 'canonical parent clips');
  const configClips = asRuntimeRecordArray(baseConfig?.clips, 'canonical config.clips');

  // Runtime's compatibility rule permits one side to be absent/empty, but
  // two populated canonical lists must already agree. Do not silently choose
  // one half of a corrupt base revision.
  if (topLevelClips.length > 0 && configClips.length > 0
    && stableJson(topLevelClips) !== stableJson(configClips)) {
    throw new TimelineSchemaIncompatibleError(
      'Workspace Runtime canonical parent clips and config.clips disagree',
      [{ pointer: '/clips', code: 'canonical_duplicate_mismatch', message: 'Canonical parent clips and config.clips disagree.' }],
    );
  }

  const canonicalClips = topLevelClips.length > 0 ? topLevelClips : configClips;
  if (!Array.isArray(authoredClips)) {
    throw new TimelineSchemaIncompatibleError(
      'Workspace Runtime editor config.clips must be an array',
      [{ pointer: '/config/clips', code: 'invalid_type', message: 'Expected an array of authored clips.' }],
    );
  }

  const canonicalById = new Map(
    canonicalClips
      .map((clip) => [typeof clip.id === 'string' ? clip.id : null, clip] as const)
      .filter((entry): entry is readonly [string, RuntimeRecord] => entry[0] !== null),
  );
  return authoredClips.map((rawClip, index) => {
    const clip = asRecord(rawClip);
    if (!clip) {
      throw new TimelineSchemaIncompatibleError(
        `Workspace Runtime editor config.clips[${index}] must be an object`,
        [{ pointer: `/config/clips/${index}`, code: 'invalid_type', message: 'Expected a clip object.' }],
      );
    }
    const id = typeof clip.id === 'string' ? clip.id : null;
    const canonical = id ? canonicalById.get(id) : undefined;
    // The editor may submit a partial authored clip while preserving the
    // stable identity. Merge it over the canonical object so unknown fields
    // (effects, live-scene metadata, provenance) survive untouched.
    const reconciled = canonical ? { ...canonical, ...clip } : { ...clip };
    if (Object.prototype.hasOwnProperty.call(clip, 'transition') && clip.transition === undefined) {
      delete reconciled.transition;
    }
    return reconciled;
  });
}

function asRuntimeRecordArray(value: unknown, label: string): RuntimeRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TimelineSchemaIncompatibleError(
      `Workspace Runtime ${label} must be an array`,
      [{ pointer: label === 'canonical parent clips' ? '/clips' : '/config/clips', code: 'invalid_type', message: 'Expected an array of clips.' }],
    );
  }
  return value.map((item, index) => {
    const record = asRecord(item);
    if (!record) {
      throw new TimelineSchemaIncompatibleError(
        `Workspace Runtime ${label}[${index}] must be an object`,
        [{ pointer: label === 'canonical parent clips' ? `/clips/${index}` : `/config/clips/${index}`, code: 'invalid_type', message: 'Expected a clip object.' }],
      );
    }
    return record;
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as RuntimeRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function stablePublicationKey(
  projectId: string,
  timelineId: string,
  expectedHead: string | null,
  graph: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson({ projectId, timelineId, expectedHead, graph }));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  // Runtime's idempotency-key grammar accepts dots/dashes but not colons.
  return `reigh.shot-composition.${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function stableTimelinePublicationKey(
  projectId: string,
  timelineId: string,
  expectedHead: string | null,
  parentComposition: RuntimeRecord,
): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson({
    projectId,
    timelineId,
    expectedHead,
    parentComposition,
  }));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `reigh.editor.timeline.${hex}`;
}

function publicationChangedIdentities(result: RuntimeRecord | null, parentRevisionId: string): string[] {
  const identities = new Set<string>([parentRevisionId]);
  const manifest = asRecord(result?.dependency_manifest);
  for (const section of ['shots', 'internal_timelines', 'timelines', 'media']) {
    const values = manifest && Array.isArray(manifest[section]) ? manifest[section] : [];
    for (const raw of values) {
      const item = asRecord(raw);
      if (!item) continue;
      for (const field of ['shot_id', 'timeline_id', 'revision_id', 'internal_timeline_revision_id', 'content_digest']) {
        if (typeof item[field] === 'string' && item[field].length > 0) identities.add(item[field] as string);
      }
    }
  }
  const contentDigests = asRecord(result?.content_digests);
  if (contentDigests) Object.keys(contentDigests).forEach((identity) => identities.add(identity));
  return [...identities];
}

function canonicalAudio(payload: RuntimeRecord): RuntimeRecord | undefined {
  if (payload.audio === undefined) return undefined;
  const audio = asRecord(payload.audio);
  if (!audio) {
    throw new Error('Workspace Runtime shot revision has an invalid legacy audio descriptor');
  }
  // This is a read-only compatibility field. Child timeline clips and
  // bindings remain playback authority; never synthesize or collapse them
  // into one aggregate descriptor.
  return audio;
}

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/i;

function canonicalAssetDigest(rawAsset: RuntimeRecord, objectId: string, label: string): string {
  const candidate = [rawAsset.digest, rawAsset.content_sha256, rawAsset.sha256, objectId]
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  if (!candidate) {
    throw new Error(`Workspace Runtime ${label} has no immutable asset digest`);
  }
  if (SHA256_DIGEST.test(candidate)) return candidate.toLowerCase();
  if (/^[0-9a-f]{64}$/i.test(candidate)) return `sha256:${candidate.toLowerCase()}`;
  throw new Error(`Workspace Runtime ${label} has an invalid immutable asset digest`);
}

function canonicalAssetRole(rawAsset: RuntimeRecord, fallback?: string): string {
  const source = asRecord(rawAsset.source);
  const role = [rawAsset.role, rawAsset.media_type, rawAsset.type, source?.media_type, source?.type]
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  return role ?? fallback ?? 'source';
}

/**
 * Normalize all media declarations for one pinned shot revision at the
 * Runtime boundary. A child timeline can carry an immutable registry even when
 * the older shot manifest omitted the same declaration; after this boundary
 * the canonical contract has one revision-scoped asset list and projection
 * does not need to understand transport-specific fallbacks.
 */
function normalizeShotRevisionAssets(
  projectId: string,
  shotId: string,
  revisionId: string,
  shotPayload: RuntimeRecord,
  timelinePayload: RuntimeRecord,
): RuntimeRecord[] {
  const assets = new Map<string, RuntimeRecord>();
  const selectedAssetIds = new Set(
    [...canonicalArray(timelinePayload.clips), ...canonicalArray(shotPayload.audio_bindings)]
      .flatMap((value) => {
        const selection = asRecord(value);
        return [selection?.asset_id, selection?.asset]
          .filter((assetId): assetId is string => typeof assetId === 'string' && assetId.length > 0);
      }),
  );
  const add = (assetId: string, rawAsset: RuntimeRecord, sourceLabel: string): void => {
    const objectId = typeof rawAsset.object_id === 'string' && rawAsset.object_id.length > 0
      ? rawAsset.object_id
      : typeof rawAsset.media_id === 'string' && rawAsset.media_id.length > 0
        ? rawAsset.media_id
        : undefined;
    if (!objectId) return;
    const label = `${sourceLabel} ${shotId}/${revisionId} asset ${assetId}`;
    const normalized: RuntimeRecord = {
      ...rawAsset,
      asset_id: assetId,
      object_id: objectId,
      digest: canonicalAssetDigest(rawAsset, objectId, label),
      role: canonicalAssetRole(rawAsset, typeof assets.get(assetId)?.role === 'string' ? String(assets.get(assetId)?.role) : undefined),
      scope: { ...(asRecord(rawAsset.scope) ?? {}), project_id: projectId },
    };
    const existing = assets.get(assetId);
    if (existing && existing.object_id !== objectId) {
      // Older children inherited the whole project registry, including unused
      // alternatives whose later copies can differ from the shot manifest.
      // Only selected media participates in this shot's playback closure.
      if (sourceLabel === 'internal timeline' && !selectedAssetIds.has(assetId)) return;
      throw new Error(
        `Workspace Runtime ${label} conflicts with object ${String(existing.object_id)}`,
      );
    }
    assets.set(assetId, { ...existing, ...normalized });
  };

  for (const rawAsset of canonicalArray(shotPayload.assets)) {
    const asset = asRecord(rawAsset);
    const assetId = typeof asset?.asset_id === 'string' && asset.asset_id.length > 0 ? asset.asset_id : undefined;
    if (asset && assetId) add(assetId, asset, 'shot revision');
  }

  // The registry is the authored selector authority. The older top-level
  // assets map is only a fallback and can retain pre-edit alternatives.
  const childAssets = {
    ...asRecord(timelinePayload.assets),
    ...asRecord(asRecord(timelinePayload.registry)?.assets),
  };
  for (const [assetId, rawAsset] of Object.entries(childAssets)) {
    const asset = asRecord(rawAsset);
    if (asset) add(assetId, asset, 'internal timeline');
  }

  return [...assets.values()];
}

function runtimeGraphToContract(
  projectId: string,
  timelineId: string,
  timeline: RuntimeRecord,
  parent: RuntimeRecord,
  resolved: Array<{ shot: RuntimeRecord; internal: RuntimeRecord }>,
): RuntimeRecord {
  const parentPayload = requiredRecord(parent.payload, 'parent composition revision.payload');
  const parentOccurrences = array(parentPayload.occurrences, 'parent composition.occurrences');
  const resolvedByKey = new Map(resolved.map(({ shot, internal }) => [
    `${String(shot.shot_id)}\u0000${String(shot.revision_id)}`,
    { shot, internal },
  ]));
  const durationByKey = new Map(parentOccurrences.map((occurrence) => [
    `${String(occurrence.shot_id)}\u0000${String(occurrence.shot_revision_id ?? occurrence.revision_id)}`,
    Number(occurrence.duration_ms ?? occurrence.duration ?? 0),
  ]));
  const shotRevisions = resolved.map(({ shot, internal }) => {
    const shotPayload = requiredRecord(shot.payload, `shot revision ${String(shot.revision_id)}.payload`);
    const internalPayload = requiredRecord(internal.payload, `internal timeline revision ${String(internal.revision_id)}.payload`);
    const timelinePayload = requiredRecord(internalPayload.timeline ?? internalPayload, `internal timeline revision ${String(internal.revision_id)}.timeline`);
    const timing = shotPayload.timing && typeof shotPayload.timing === 'object' && !Array.isArray(shotPayload.timing)
      ? shotPayload.timing as RuntimeRecord
      : { duration_ms: durationByKey.get(`${String(shot.shot_id)}\u0000${String(shot.revision_id)}`) ?? 0 };
    const provenance = shotPayload.provenance && typeof shotPayload.provenance === 'object' && !Array.isArray(shotPayload.provenance)
      ? shotPayload.provenance as RuntimeRecord
      : {};
    const assets = normalizeShotRevisionAssets(projectId, String(shot.shot_id), String(shot.revision_id), shotPayload, timelinePayload);
    const audio = canonicalAudio(shotPayload);
    return {
      ...shotPayload,
      shot_id: requiredString(shot.shot_id, 'shot revision.shot_id'),
      revision_id: requiredString(shot.revision_id, 'shot revision.revision_id'),
      document_role: 'shot_revision',
      content_digest: requiredString(shot.content_digest, 'shot revision.content_digest'),
      internal_timeline_revision: {
        timeline_id: typeof internal.timeline_id === 'string' && internal.timeline_id.length > 0
          ? internal.timeline_id
          : timelineId,
        revision_id: requiredString(internal.revision_id, 'internal timeline revision.revision_id'),
        content_digest: requiredString(internal.content_digest, 'internal timeline revision.content_digest'),
        timeline: timelinePayload,
      },
      dependencies: canonicalArray(shotPayload.dependencies),
      assets,
      generation_inputs: canonicalArray(shotPayload.generation_inputs),
      timing,
      ...(audio ? { audio } : {}),
      provenance,
    };
  });
  const graphOccurrences = parentOccurrences.map((occurrence, ordinal) => {
    const shotId = requiredString(occurrence.shot_id, `parent composition occurrence[${ordinal}].shot_id`);
    const revisionId = requiredString(occurrence.shot_revision_id ?? occurrence.revision_id, `parent composition occurrence[${ordinal}].shot_revision_id`);
    const placement = occurrence.placement && typeof occurrence.placement === 'object' && !Array.isArray(occurrence.placement)
      ? occurrence.placement as RuntimeRecord
      : {};
    const atMs = Number(placement.start_ms ?? occurrence.at_ms ?? 0);
    const durationMs = Number(occurrence.duration_ms ?? occurrence.duration ?? 0);
    const occurrenceId = requiredString(occurrence.occurrence_id, `parent composition occurrence[${ordinal}].occurrence_id`);
    return {
      occurrence_id: occurrenceId,
      parent_document_id: timelineId,
      shot_id: shotId,
      revision_id: revisionId,
      ordinal,
      at_ms: atMs,
      duration_ms: durationMs,
      stable_deep_link: stableOccurrenceDeepLink(projectId, timelineId, shotId, revisionId, occurrenceId),
      output_identity: stableOutputIdentity(projectId, timelineId, occurrenceId),
      placement,
      source_offset: occurrence.source_offset ?? 0,
      speed: occurrence.speed ?? 1,
      track: occurrence.track ?? placement.track ?? 'video',
      transform: occurrence.transform ?? {},
      gain: occurrence.gain ?? 1,
      muted: occurrence.muted ?? occurrence.mute ?? false,
      provenance: occurrence.provenance ?? {},
      ...(Array.isArray(occurrence.text_bindings)
        ? { text_bindings: occurrence.text_bindings }
        : {}),
    };
  });
  for (const occurrence of graphOccurrences) {
    if (!resolvedByKey.has(`${occurrence.shot_id}\u0000${occurrence.revision_id}`)) {
      throw new Error(`Workspace Runtime parent composition references an unresolved shot revision ${occurrence.shot_id}/${occurrence.revision_id}`);
    }
  }
  const headRevisionId = requiredString(parent.revision_id, 'parent composition revision.revision_id');
  const parentGraph = {
    ...parentPayload,
    config: parentPayload.config ?? {},
    registry: parentPayload.registry ?? {},
    clips: parentPayload.clips ?? [],
    occurrences: parentPayload.occurrences,
  };
  return {
    schema_version: 1,
    project: { project_id: projectId, document_id: timelineId, role: 'project' },
    primary_timeline: {
      document_id: timelineId,
      role: 'primary_timeline',
      head: { revision_id: headRevisionId, content_digest: requiredString(parent.content_digest, 'parent composition revision.content_digest') },
    },
    parent_composition: parentGraph,
    shot_revisions: shotRevisions,
    occurrences: graphOccurrences,
    cases: {
      missing_dependency: { shot_id: 'missing-dependency', revision_id: 'missing-revision', expected: 'missing_dependency' },
      stale_write_rejection: { expected_head_revision_id: headRevisionId, submitted_head_revision_id: headRevisionId, expected_status: 409 },
    },
    timeline: { timeline_id: timeline.timeline_id, project_id: timeline.project_id, version: timeline.version },
  };
}

function runtimePayloadWithoutCanonicalEnvelope(revision: RuntimeRecord): RuntimeRecord {
  const { shot_id: _shotId, revision_id: _revisionId, document_role: _role, content_digest: _digest, internal_timeline_revision: _internal, publish: _publish, ...payload } = revision;
  return payload;
}

export async function toRuntimePublication(
  graph: RuntimeRecord,
  projectId: string,
  timelineId: string,
  expectedHead: string | null,
): Promise<RuntimeRecord> {
  const primary = requiredRecord(graph.primary_timeline, 'primary_timeline');
  const head = requiredRecord(primary.head, 'primary_timeline.head');
  const parentRevisionId = requiredString(head.revision_id, 'primary_timeline.head.revision_id');
  const revisions = array(graph.shot_revisions, 'shot_revisions');
  const occurrences = array(graph.occurrences, 'occurrences');
  const revisionByKey = new Map(revisions.map((revision) => [
    `${String(revision.shot_id)}\u0000${String(revision.revision_id)}`,
    revision,
  ]));
  const used = uniqueOccurrences(occurrences).map((occurrence) => {
    const key = `${String(occurrence.shot_id)}\u0000${String(occurrence.revision_id)}`;
    const revision = revisionByKey.get(key);
    if (!revision) throw new Error(`Canonical graph is missing shot revision ${key}`);
    return revision;
  }).filter((revision) => revision.publish === true);
  const internalByKey = new Map<string, RuntimeRecord>();
  const shotRevisions = used.map((revision) => {
    const internal = requiredRecord(revision.internal_timeline_revision, `shot revision ${String(revision.revision_id)}.internal_timeline_revision`);
    const internalRevisionId = requiredString(internal.revision_id, 'internal timeline revision.revision_id');
    const internalTimeline = requiredRecord(internal.timeline, `internal timeline revision ${internalRevisionId}.timeline`);
    const internalTimelineId = typeof internal.timeline_id === 'string' && internal.timeline_id.length > 0
      ? internal.timeline_id
      : timelineId;
    const timelineRevision = {
      timeline_id: internalTimelineId,
      revision_id: internalRevisionId,
      payload: internalTimeline,
    };
    if (internal.publish === true) {
      internalByKey.set(`${internalTimelineId}\u0000${internalRevisionId}`, timelineRevision);
    }
    return {
      shot_id: requiredString(revision.shot_id, 'shot revision.shot_id'),
      revision_id: requiredString(revision.revision_id, 'shot revision.revision_id'),
      internal_timeline_revision_id: internalRevisionId,
      payload: runtimePayloadWithoutCanonicalEnvelope(revision),
    };
  });
  const parentSource = requiredRecord(graph.parent_composition ?? {}, 'parent_composition');
  const parentComposition = {
    ...parentSource,
    config: parentSource.config ?? {},
    registry: parentSource.registry ?? {},
    clips: parentSource.clips ?? [],
    occurrences: occurrences.map((occurrence, ordinal) => ({
      ...occurrence,
      occurrence_id: requiredString(occurrence.occurrence_id, `occurrences[${ordinal}].occurrence_id`),
      shot_id: requiredString(occurrence.shot_id, `occurrences[${ordinal}].shot_id`),
      shot_revision_id: requiredString(occurrence.revision_id, `occurrences[${ordinal}].revision_id`),
      // `at_ms` is the canonical occurrence field. Spread legacy placement
      // metadata first so a stale nested start cannot overwrite a fresh drag.
      placement: { ...(occurrence.placement as RuntimeRecord ?? {}), start_ms: Number(occurrence.at_ms ?? 0) },
      source_offset: occurrence.source_offset ?? 0,
      duration_ms: Number(occurrence.duration_ms ?? 0),
      speed: occurrence.speed ?? 1,
      track: occurrence.track ?? 'video',
      transform: occurrence.transform ?? {},
      gain: occurrence.gain ?? 1,
      mute: occurrence.muted ?? occurrence.mute ?? false,
      provenance: occurrence.provenance ?? {},
      ...(Array.isArray(occurrence.text_bindings)
        ? { text_bindings: occurrence.text_bindings }
        : Array.isArray(occurrence.textBindings)
          ? { text_bindings: occurrence.textBindings }
          : {}),
    })),
  };
  const mediaDigests = new Set<string>();
  const collectMedia = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(collectMedia);
    if (value === null || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value as RuntimeRecord)) {
      if (['digest', 'content_digest', 'content_sha256', 'sha256'].includes(key) && typeof item === 'string' && /^sha256:[0-9a-f]{64}$/.test(item)) mediaDigests.add(item);
      else collectMedia(item);
    }
  };
  collectMedia(shotRevisions.map((revision) => revision.payload));
  collectMedia([...internalByKey.values()].map((revision) => revision.payload));
  collectMedia(parentComposition);
  return {
    project_id: projectId,
    timeline_id: timelineId,
    expected_head: expectedHead,
    parent_revision_id: parentRevisionId,
    parent_composition: parentComposition,
    shot_revisions: shotRevisions,
    internal_timeline_revisions: [...internalByKey.values()],
  };
}
