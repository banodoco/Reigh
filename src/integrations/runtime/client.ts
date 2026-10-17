import type { SelectedProjectMediaIdentity } from '@/shared/contracts/selectedProjectMedia.ts';
import {
  ApiError,
  PROTOCOL,
  WorkspaceClient,
  type CommitRequest,
  type CommitResult,
  type Handshake,
  type Health,
  type Capability,
  type ByteResponse,
  type Generation,
  type GenerationVariant,
  type Event,
  type ManagedOutput,
  type ManagedOutputExportReceipt,
  type MediaImportOperation as MediaImport,
  type MutationResult,
  type Page,
  type Project,
  type Realm,
  type Task,
  type StoragePreparation,
  type StoragePreparationRequest,
  type ObjectLocation,
  type TimelineInspectionResult,
  type Transport,
  type RequestBody,
} from './generated.ts';
import {
  RUNTIME_ACCEPTED_SCHEMA_DIGESTS,
  RUNTIME_TARGETED_EXECUTION_CAPABILITY,
} from './contract-metadata.ts';

// Browser requests stay same-origin so the connector/proxy can inject the
// product credential without exposing it to the page. The endpoint env var is a
// Vite-server setting for the proxy, not a browser destination.
export const RUNTIME_BASE_URL = '/api/runtime';
export const RUNTIME_CLIENT_VERSION = 'reigh-r1-consumer-20260911';
export const RUNTIME_CLIENT_SCOPES = [
  'handshake',
  'projects:read',
  'projects:write',
  'objects:read',
  'objects:write',
  'tasks:read',
  'tasks:write',
];
const FORBIDDEN_RUNTIME_ACTORS = new Set(['owner', 'astrid-pack-host', 'admin', 'worker']);

export interface RuntimeIdentityBinding {
  actorId: string;
  realmId: string;
  runtimeInstanceId: string;
}

function configuredRuntimeIdentity(): RuntimeIdentityBinding | undefined {
  const actorId = import.meta.env.VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID?.trim();
  const realmId = import.meta.env.VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID?.trim();
  const runtimeInstanceId = import.meta.env.VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID?.trim();
  const configured = [actorId, realmId, runtimeInstanceId].filter(Boolean).length;
  if (configured === 0) return undefined;
  if (configured !== 3) {
    throw new Error('Workspace Runtime launch identity is incomplete');
  }
  return { actorId, realmId, runtimeInstanceId };
}

function hasExactScopes(actual: string[]): boolean {
  return actual.length === RUNTIME_CLIENT_SCOPES.length
    && [...actual].sort().every((scope, index) => scope === [...RUNTIME_CLIENT_SCOPES].sort()[index]);
}

export class RuntimeUnavailableError extends Error {
  readonly code = 'runtime_unavailable' as const;
  readonly recoveryAction: string;
  readonly status?: number;
  readonly causeCode?: string;
  readonly failureKind: 'storage' | 'admission' | 'transport' | 'unknown';

  constructor(cause: unknown, baseUrl: string) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const apiError = cause instanceof ApiError ? cause : undefined;
    const diagnostic = `${detail} ${apiError ? JSON.stringify(apiError.details) : ''}`;
    const storageFailure = /no space left on device|enospc|disk full|storage full/i.test(diagnostic);
    const admissionFailure = apiError?.code === 'realm_admission_failed'
      || /startup admission|integrity check|dependency_graph_mismatch/i.test(diagnostic);
    const failureKind = storageFailure
      ? 'storage'
      : admissionFailure
        ? 'admission'
        : apiError
          ? 'unknown'
          : 'transport';
    super(
      `Workspace Runtime is unavailable at ${baseUrl}: ${detail}. `
      + (storageFailure
        ? 'The Runtime reported a storage-capacity failure; your timeline draft is preserved.'
        : admissionFailure
          ? 'The Runtime failed its startup or integrity checks; your timeline draft is preserved.'
          : 'Start the supported Runtime and configure its authenticated connector, then retry.'),
    );
    this.name = 'RuntimeUnavailableError';
    this.status = apiError?.status;
    this.causeCode = apiError?.code;
    this.failureKind = failureKind;
    this.recoveryAction = storageFailure
      ? 'Check the Runtime data volume and restart it, then retry; your timeline draft is preserved.'
      : admissionFailure
        ? 'Repair or restore the Runtime realm, restart it, then retry; your timeline draft is preserved.'
        : 'Start the supported Runtime and configure its authenticated connector, then retry.';
  }
}

export class RuntimeAuthenticationError extends Error {
  readonly code = 'runtime_authentication' as const;
  readonly status = 401 as const;
  readonly recoveryAction = 'Provide an authenticated connector credential and retry.';

  constructor(baseUrl: string) {
    super(
      `Workspace Runtime authentication failed at ${baseUrl}: the credential was rejected or revoked. `
      + 'Provide an authenticated connector credential and retry.',
    );
    this.name = 'RuntimeAuthenticationError';
  }
}

export class RuntimeCompatibilityError extends Error {
  readonly code = 'runtime_incompatible' as const;
  readonly recoveryAction = 'Start the Runtime built from the accepted contract and retry.';

  constructor(public readonly reason: string, baseUrl: string) {
    const recoveryAction = 'Start the Runtime built from the accepted contract and retry.';
    super(`Workspace Runtime at ${baseUrl} is incompatible with the accepted consumer contract: ${reason}. ${recoveryAction}`);
    this.name = 'RuntimeCompatibilityError';
  }
}

export type RuntimeConnectorError = RuntimeAuthenticationError | RuntimeUnavailableError | RuntimeCompatibilityError;

export function isRuntimeUnavailableFailure(error: unknown): boolean {
  if (error instanceof RuntimeUnavailableError) return true;
  if (!(error instanceof ApiError)) return false;
  return error.status >= 500
    || error.code === 'realm_admission_failed'
    || error.code === 'runtime_unhealthy'
    || error.code === 'service_unavailable';
}

export function isRuntimeConflict(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  if (error.code === 'realm_admission_failed' || error.code === 'runtime_unhealthy') return false;
  if (error.code === 'timeline_version_conflict' || error.code === 'stale_write') return true;
  const diagnostic = `${error.message} ${JSON.stringify(error.details)}`;
  return error.code === 'conflict' && /head|version|timeline|stale/i.test(diagnostic);
}

/**
 * A canonical payload disagreement is a schema/persistence defect, not a
 * stale-head conflict. It must stop the save retry loop and keep the draft
 * available for correction.
 */
export function isRuntimeCanonicalPayloadConflict(error: unknown): error is ApiError {
  return error instanceof ApiError
    && error.status === 409
    && /canonical parent clips and config\.clips disagree/i.test(error.message);
}

/** C007 is optional until A admits the generated-client successor. */
interface ProjectMediaSelectionClient {
  getProjectMediaSelection?: (
    projectId: string,
    asset: string,
    generationId: string,
    variantId: string,
  ) => Promise<SelectedProjectMediaIdentity>;
  getProjectMediaSelectionForOutput?: (
    projectId: string,
    selectors: { association_id: string; object_id: string; version: number },
  ) => Promise<SelectedProjectMediaIdentity>;
}

export class ReighRuntimeClient {
  readonly baseUrl: string;
  private readonly client: WorkspaceClient;
  private readonly expectedIdentity: RuntimeIdentityBinding | undefined;
  private session: Promise<{ health: Health; handshake: Handshake; realm: Realm }> | null = null;

  constructor(options: { baseUrl?: string; token?: string; transport?: Transport; expectedIdentity?: RuntimeIdentityBinding } = {}) {
    this.baseUrl = options.baseUrl ?? RUNTIME_BASE_URL;
    this.expectedIdentity = options.expectedIdentity ?? configuredRuntimeIdentity();
    // Browser credentials are supplied by the authenticated connector/proxy.
    // A token is accepted for direct test/CLI clients, but is never persisted.
    this.client = new WorkspaceClient(this.baseUrl, options.token, options.transport);
  }

  async ensureSession(): Promise<{ health: Health; handshake: Handshake; realm: Realm }> {
    if (!this.session) {
      this.session = this.openSession().catch((error) => {
        this.session = null;
        throw error;
      });
    }
    return this.session;
  }

  /** Force the existing client through a fresh authenticated handshake. */
  async reconnect(): Promise<{ health: Health; handshake: Handshake; realm: Realm }> {
    this.session = null;
    return this.ensureSession();
  }

  private async openSession() {
    try {
      const health = await this.client.health();
      if (health.status !== 'ok') {
        throw new ApiError(503, 'runtime_unhealthy', `Runtime health is ${health.status}`, '', { health });
      }
      const handshake = await this.client.handshake(
        'reigh-browser',
        RUNTIME_CLIENT_VERSION,
        RUNTIME_CLIENT_SCOPES,
      );
      if (!RUNTIME_ACCEPTED_SCHEMA_DIGESTS.includes(health.schema_digest as typeof RUNTIME_ACCEPTED_SCHEMA_DIGESTS[number])
        || !RUNTIME_ACCEPTED_SCHEMA_DIGESTS.includes(handshake.schema_digest as typeof RUNTIME_ACCEPTED_SCHEMA_DIGESTS[number])) {
        throw new RuntimeCompatibilityError(
          `schema digest mismatch (health=${health.schema_digest}, handshake=${handshake.schema_digest}, expected one of ${RUNTIME_ACCEPTED_SCHEMA_DIGESTS.join(', ')})`,
          this.baseUrl,
        );
      }
      if (!handshake.capabilities.includes(RUNTIME_TARGETED_EXECUTION_CAPABILITY)) {
        throw new RuntimeCompatibilityError(
          `missing capability ${RUNTIME_TARGETED_EXECUTION_CAPABILITY}`,
          this.baseUrl,
        );
      }
      if (FORBIDDEN_RUNTIME_ACTORS.has(handshake.actor_id) || !hasExactScopes(handshake.scopes)) {
        throw new RuntimeCompatibilityError(
          'authenticated actor or granted scopes do not match the Reigh product connector role',
          this.baseUrl,
        );
      }
      if (this.expectedIdentity) {
        if (handshake.actor_id !== this.expectedIdentity.actorId
          || handshake.realm_id !== this.expectedIdentity.realmId) {
          throw new RuntimeCompatibilityError(
            'authenticated actor or realm does not match the selected Astrid profile',
            this.baseUrl,
          );
        }
      }
      // Keep the selected launch binding across reconnects. A healthy replacement
      // process in the same realm is not permission to write the local draft.
      if (this.expectedIdentity
        && (health as Health & { runtime_instance_id?: string }).runtime_instance_id
          !== this.expectedIdentity.runtimeInstanceId) {
        throw new RuntimeCompatibilityError(
          'Runtime restarted—relaunch workspace. The selected Runtime instance changed; your timeline draft is preserved.',
          this.baseUrl,
        );
      }
      const realm = await this.client.getRealm();
      if (this.expectedIdentity && realm.realm_id !== this.expectedIdentity.realmId) {
        throw new RuntimeCompatibilityError(
          'Runtime realm endpoint does not match the selected Astrid profile',
          this.baseUrl,
        );
      }
      return { health, handshake, realm };
    } catch (error) {
      if (error instanceof RuntimeCompatibilityError) throw error;
      if (error instanceof ApiError && error.status === 401) {
        throw new RuntimeAuthenticationError(this.baseUrl);
      }
      throw new RuntimeUnavailableError(error, this.baseUrl);
    }
  }

  private async withSession<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureSession();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.session = null;
        throw new RuntimeAuthenticationError(this.baseUrl);
      }
      throw error;
    }
  }

  async commitTimeline(body: CommitRequest): Promise<CommitResult> {
    return this.withSession(() => this.client.commitTimeline(body));
  }

  async listProjects(): Promise<Project[]> {
    return this.withSession(async () => {
      const projects: Project[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.client.listProjects(cursor, 200);
        projects.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor !== undefined);
      return projects;
    });
  }

  async getProject(projectId: string): Promise<Project> {
    return this.withSession(() => this.client.getProject(projectId));
  }

  async updateProject(
    projectId: string,
    idempotencyKey: string,
    expectedVersion: number,
    name: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<Project> {
    return this.withSession(() => this.client.updateProject(
      projectId,
      idempotencyKey,
      expectedVersion,
      name,
      metadata,
    ));
  }

  async listTimelines(projectId: string): Promise<Record<string, unknown>[]> {
    return this.withSession(async () => {
      const timelines: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.client.listTimelines(projectId, cursor, 200);
        timelines.push(...page.items);
        cursor = page.next_cursor ?? undefined;
      } while (cursor !== undefined);
      return timelines;
    });
  }

  async getProjectTimeline(projectId: string, timelineId: string): Promise<Record<string, unknown>> {
    return this.withSession(() => this.client.getProjectTimeline(projectId, timelineId));
  }

  /**
   * Read the Runtime-owned canonical timeline head. Consumers that need the
   * shot-composition closure must begin here so a mutable legacy timeline
   * document cannot select the editor's authority by accident.
   */
  async inspectTimeline(
    projectId: string,
    timelineId: string,
    options: Record<string, unknown> = {},
  ): Promise<TimelineInspectionResult> {
    return this.withSession(async () => {
      const result = await this.client.inspectTimeline(projectId, timelineId, options);
      return result as unknown as TimelineInspectionResult;
    });
  }

  async publishParentComposition(
    projectId: string,
    timelineId: string,
    publication: Record<string, unknown>,
    idempotencyKeyValue?: string,
  ): Promise<MutationResult<Record<string, unknown>>> {
    return this.withSession(() => this.client.publishParentComposition(
      projectId,
      timelineId,
      publication,
      idempotencyKeyValue ?? idempotencyKey(),
    ));
  }

  async getProjectParentCompositionRevision(projectId: string, timelineId: string, revision: string): Promise<Record<string, unknown>> {
    return this.withSession(() => this.client.getProjectParentCompositionRevision(projectId, timelineId, revision));
  }

  async listProjectParentCompositionRevisions(projectId: string, timelineId: string, cursor?: string, limit = 50): Promise<Page<Record<string, unknown>>> {
    return this.withSession(() => this.client.listProjectParentCompositionRevisions(projectId, timelineId, cursor, limit));
  }

  async restoreProjectParentCompositionRevision(projectId: string, timelineId: string, revision: string, expectedHead: string | null, key?: string): Promise<MutationResult<Record<string, unknown>>> {
    return this.withSession(() => this.client.restoreProjectParentCompositionRevision(
      projectId, timelineId, revision, expectedHead, key ?? idempotencyKey(),
    ));
  }

  async getProjectShotRevision(projectId: string, shotId: string, revision: string): Promise<Record<string, unknown>> {
    return this.withSession(() => this.client.getProjectShotRevision(projectId, shotId, revision));
  }

  async getProjectTimelineRevision(projectId: string, timelineId: string, revision: string): Promise<Record<string, unknown>> {
    return this.withSession(() => this.client.getProjectTimelineRevision(projectId, timelineId, revision));
  }

  async updateTimelineDocument(
    projectId: string,
    timelineId: string,
    expectedVersion: number,
    config: Record<string, unknown>,
    registry: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.withSession(() => this.client.updateTimelineDocument(
      projectId,
      timelineId,
      expectedVersion,
      idempotencyKey(),
      config,
      registry,
    ));
  }

  async ingestProjectObject(
    projectId: string,
    data: RequestBody,
    mediaType: string,
    filename?: string,
  ) {
    return this.withSession(() => this.client.ingestProjectObject(projectId, data, mediaType, idempotencyKey(), filename));
  }

  /** Project-scoped object authority check; the local path is never exposed. */
  async listDocuments(projectId: string, cursor?: string) {
    return this.withSession(() => this.client.listDocuments(projectId, cursor));
  }

  async getDocument(projectId: string, documentId: string) {
    return this.withSession(() => this.client.getDocument(projectId, documentId));
  }

  async listProjectObjects(projectId: string, cursor?: string) {
    return this.withSession(() => this.client.listProjectObjects(projectId, cursor));
  }

  async getProjectObjectLocation(projectId: string, objectId: string): Promise<ObjectLocation> {
    return this.withSession(() => this.client.getProjectObjectLocation(projectId, objectId));
  }
  async importProjectMedia(
    projectId: string,
    data: RequestBody,
    mediaType: string,
    idempotencyKey: string,
    filename?: string,
    expectedDigest?: string,
    width?: number,
    height?: number,
    durationSeconds?: number,
  ): Promise<MediaImport> {
    return this.withSession(() => this.client.importProjectMedia(
      projectId,
      data,
      mediaType,
      idempotencyKey,
      { filename, expectedDigest, width, height, durationSeconds },
    ));
  }

  async getProjectMediaSelection(
    projectId: string,
    asset: string,
    generationId: string,
    variantId: string,
  ): Promise<SelectedProjectMediaIdentity> {
    return this.withSession(() => {
      const client: WorkspaceClient & ProjectMediaSelectionClient = this.client;
      if (!client.getProjectMediaSelection) {
        throw new RuntimeCompatibilityError('generated client has no getProjectMediaSelection (C007)', this.baseUrl);
      }
      return this.client.getProjectMediaSelection(projectId, asset, generationId, variantId);
    });
  }

  async getProjectMediaSelectionForOutput(
    projectId: string,
    selectors: { association_id: string; object_id: string; version: number },
  ): Promise<SelectedProjectMediaIdentity> {
    return this.withSession(() => {
      const client: WorkspaceClient & ProjectMediaSelectionClient = this.client;
      if (!client.getProjectMediaSelectionForOutput) {
        throw new RuntimeCompatibilityError(
          'generated client has no getProjectMediaSelectionForOutput (E069)',
          this.baseUrl,
        );
      }
      return this.client.getProjectMediaSelectionForOutput(projectId, selectors);
    });
  }

  async getProjectMediaImport(projectId: string, importOperationId: string): Promise<MediaImport> {
    return this.withSession(() => this.client.getProjectMediaImport(projectId, importOperationId));
  }

  /** Canonical Runtime generation page; the opaque cursor is caller-owned. */
  async listGenerations(projectId: string, cursor?: string, limit = 50): Promise<Page<Generation>> {
    return this.withSession(() => this.client.listGenerations(projectId, cursor, limit));
  }

  async getGeneration(generationId: string): Promise<Generation> {
    return this.withSession(() => this.client.getGeneration(generationId));
  }

  /** Canonical Runtime variant page; the opaque cursor is caller-owned. */
  async listVariants(generationId: string, cursor?: string, limit = 50): Promise<Page<GenerationVariant>> {
    return this.withSession(() => this.client.listVariants(generationId, cursor, limit));
  }

  async markVariantViewed(variantId: string): Promise<MutationResult<GenerationVariant>> {
    return this.withSession(() => this.client.markVariantViewed(variantId, idempotencyKey()));
  }

  async markGenerationVariantsViewed(generationId: string): Promise<MutationResult<Record<string, unknown>>> {
    return this.withSession(() => this.client.markGenerationVariantsViewed(generationId, idempotencyKey()));
  }

  /** Capability discovery is read-only and supplies the digest for admission. */
  async listCapabilities(cursor?: string, limit = 50): Promise<Page<Capability>> {
    return this.withSession(() => this.client.listCapabilities(cursor, limit));
  }

  /** Authenticated, read-only preparation of a request-specific estimate. */
  async prepareCapabilityStorage(
    projectId: string,
    capabilityId: string,
    body: StoragePreparationRequest,
  ): Promise<StoragePreparation> {
    return this.withSession(() => this.client.prepareCapabilityStorage(projectId, capabilityId, body));
  }

  /** Browser admission only. Claim, execution, and settlement remain host-owned. */
  async admitTask(
    input: Parameters<WorkspaceClient['admitTask']>[0],
    admissionKey: string,
  ): Promise<MutationResult<Task>> {
    return this.withSession(() => this.client.admitTask(input, admissionKey));
  }

  async getTask(taskId: string): Promise<Task> {
    return this.withSession(() => this.client.getTask(taskId));
  }

  async listProjectTasks(projectId: string, cursor?: string, limit = 50): Promise<Page<Task>> {
    return this.withSession(() => this.client.listProjectTasks(projectId, cursor, limit));
  }

  /** Read lifecycle events for one task without exposing raw event payloads to callers. */
  async listTaskEvents(taskId: string, cursor?: string, limit = 50): Promise<Page<Event>> {
    return this.withSession(() => this.client.listEvents(cursor, limit, taskId));
  }

  async cancelTask(taskId: string, admissionKey: string, expectedVersion?: number): Promise<MutationResult<Task>> {
    return this.withSession(() => this.client.cancelTask(taskId, admissionKey, expectedVersion));
  }

  async retryTask(taskId: string, admissionKey: string, expectedVersion?: number): Promise<MutationResult<Task>> {
    return this.withSession(() => this.client.retryTask(taskId, admissionKey, expectedVersion));
  }

  /** Canonical managed-output associations for one completed task. */
  async listManagedOutputs(taskId: string, cursor?: string, limit = 50): Promise<Page<ManagedOutput>> {
    return this.withSession(() => this.client.listManagedOutputs(taskId, cursor, limit));
  }

  /** Canonical readback of one managed-output association. */
  async getManagedOutput(associationId: string): Promise<ManagedOutput> {
    return this.withSession(() => this.client.getManagedOutput(associationId));
  }

  /** Export one selected Runtime-managed output; Runtime owns the destination and receipt. */
  async exportManagedOutput(
    associationId: string,
    destinationFilename: string,
    expected?: Record<string, unknown>,
  ): Promise<MutationResult<ManagedOutputExportReceipt>> {
    return this.withSession(() => this.client.exportManagedOutput(
      associationId,
      destinationFilename,
      idempotencyKey(),
      expected,
    ));
  }

  /** Read a Runtime-owned thumbnail selected from a source video frame. */
  async getSourceFrameThumbnail(
    projectId: string,
    sourceObjectId: string,
    sourceTimeSeconds: number,
    recipeVersion = 1,
  ): Promise<Record<string, unknown> | null> {
    return this.withSession(() => this.client.getSourceFrameThumbnail(
      projectId,
      sourceObjectId,
      sourceTimeSeconds,
      recipeVersion,
    ));
  }

  /** Ensure a typed source-frame thumbnail relation exists, idempotently. */
  async ensureSourceFrameThumbnail(
    projectId: string,
    thumbnail: Record<string, unknown>,
    idempotencyKeyValue: string,
  ): Promise<MutationResult<Record<string, unknown>>> {
    return this.withSession(() => this.client.ensureSourceFrameThumbnail(
      projectId,
      thumbnail,
      idempotencyKeyValue,
    ));
  }

  /** Authenticated generated Runtime media read with optional byte range. */
  async getObject(objectId: string, byteRange?: [number, number?]): Promise<ByteResponse> {
    return this.withSession(() => this.client.getObject(objectId, byteRange));
  }

  /** Authenticated generated Runtime media metadata read with optional range. */
  async headObject(objectId: string, byteRange?: [number, number?]): Promise<ByteResponse> {
    return this.withSession(() => this.client.headObject(objectId, byteRange));
  }

  objectContentUrl(objectId: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/v1/objects/${encodeURIComponent(objectId)}`;
  }
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reigh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export { PROTOCOL };
