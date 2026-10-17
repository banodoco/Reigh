import { isManualTextBatch, isManualTextCreation, isManualTextInverse } from '../commands/manualTextHistory.ts';
import { manualTextBefore } from '../commands/manualText.ts';
import { proposalSaveFor, proposalCorrelationFor } from '../lib/proposal-command-binding.ts';
import { timelineDraftRecoveryKey } from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import type { EditCommand } from '@/integrations/runtime/generated.ts';
import { gestureCommandsFor, gestureOccurrenceFor } from '../commands/semanticGestures.ts';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isInteractionActive, onInteractionEnd, type InteractionStateRef } from '@/tools/video-editor/lib/interaction-state.ts';
import { TimelineEventBus } from '@/tools/video-editor/hooks/useTimelineEventBus.ts';
import type { TimelineStoreApi } from '@/tools/video-editor/hooks/timelineStore.ts';
import {
  isDataProviderPersistenceEnabled,
  isTimelineNotFoundError,
  isProviderUnavailableError,
  isTimelineSchemaIncompatibleError,
  isTimelineVersionConflictError,
  TimelineVersionConflictError,
  type DataProvider,
  type TimelineHeadRevision,
  type TimelineOccurrenceContext,
  type TimelineSaveReceipt,
  type TimelineSchemaIssue,
} from '@/tools/video-editor/data/DataProvider.ts';
import { StaleWriteError } from '@/tools/video-editor/data/shotComposition.ts';
import { buildTimelineData, buildTimelineDataWithResolver, type TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { getStableConfigSignature } from '@/tools/video-editor/lib/config-utils.ts';
import type { AssetResolver } from '@/tools/video-editor/data/AssetResolver.ts';
import { BRIDGE_REQUEST_TIMEOUT_MS } from '@/tools/video-editor/data/bridgeContract.ts';
import { invalidateReferencedTimelineCache } from '@/tools/video-editor/compositions/TimelineRenderer.tsx';
import {
  clearTimelineDraft,
  clearTimelineDraftIfSnapshotMatches,
  advanceTimelineDraftBaseAfterHeadAcknowledgement,
  loadTimelineDraft,
  saveTimelineDraft,
} from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import { recordShotTimelinePhase } from '@/tools/video-editor/lib/shot-timeline-timing.ts';
import { canonicalJsonStringify, type TimelineBundleEnvelope } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import type { CommitDataOptions, ScheduleSaveFn } from '@/tools/video-editor/hooks/useTimelineCommit.ts';
import { generateUUID } from '@/shared/lib/taskCreation/ids.ts';
import { isTimelineDiagnosticsEnabled } from '@/tools/video-editor/lib/timeline-diagnostics.ts';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'retrying' | 'error';

const TIMELINE_SYNC_LOG_TAG = '[TimelineSync]';
const SAVE_DEBOUNCE_MS = 500;
let shotTimelineTraceSequence = 0;

function createShotTimelineTraceId(timelineId: string): string {
  shotTimelineTraceSequence += 1;
  return `${timelineId}:${shotTimelineTraceSequence}`;
}
/**
 * Backoff for the *transport* retry (a 500, a dropped connection — anything that
 * is neither a version conflict nor a missing timeline). It must be a real timer:
 * routing this retry back through `scheduleSave` puts it in `pendingSaveRef`,
 * which the `finally` block below drains immediately, so a backend that keeps
 * failing gets re-POSTed once per round trip forever with no gap between
 * attempts (measured: 73 POSTs in 1.5s at a 20ms RTT, and the chain outlived the
 * unmounted editor).
 */
const SAVE_ERROR_RETRY_BASE_MS = 500;
const SAVE_ERROR_RETRY_MAX_MS = 8_000;
/**
 * Write-ack watchdog grace: if an edit is unacknowledged (no durable save
 * receipt) for longer than this, the UI surfaces a persistent error. Covers
 * timeouts, 4xx/5xx, rejected CAS, and the null-data no-op path.
 *
 * Computed, not a magic constant: the clock starts at the debounce, the POST
 * itself is valid for the full bridge request window, and one quick transport
 * retry (at SAVE_ERROR_RETRY_BASE_MS) gets a chance to ack before the
 * watchdog trips. A save that lands inside the valid request window must
 * never show a false "not saved" banner.
 */
const WATCHDOG_GRACE_MS =
  SAVE_DEBOUNCE_MS + BRIDGE_REQUEST_TIMEOUT_MS + 2 * SAVE_ERROR_RETRY_BASE_MS;

type ConfigVersionUpdateSource = 'save' | 'reload';

interface UseTimelinePersistenceOptions {
  store?: TimelineStoreApi;
  provider: DataProvider;
  timelineId: string;
  resolveAssetUrl?: (file: string) => Promise<string>;
  /**
   * Optional AssetResolver. When provided, reload paths route asset
   * lookups through `assetResolver.onResolve` (and surface missing
   * assets via `onMissing`) so the host's resolver lifecycle stays
   * authoritative on refresh.
   */
  assetResolver?: AssetResolver;
  eventBus: TimelineEventBus;
  dataRef: MutableRefObject<TimelineData | null>;
  commitData: (nextData: TimelineData, options?: CommitDataOptions) => void;
  selectedClipIdRef: MutableRefObject<string | null>;
  selectedTrackIdRef: MutableRefObject<string | null>;
  editSeqRef: MutableRefObject<number>;
  savedSeqRef: MutableRefObject<number>;
  configVersionRef: MutableRefObject<number>;
  headRevisionRef?: MutableRefObject<TimelineHeadRevision | undefined>;
  /** Freeze writes until a recovery draft has been explicitly retried/discarded. */
  recoveryPendingRef?: MutableRefObject<boolean>;
  /** Freeze writes while the initial recovery slot is still being discovered. */
  recoveryActiveRef?: MutableRefObject<boolean>;
  lastSavedSignatureRef: MutableRefObject<string>;
  interactionStateRef: InteractionStateRef;
  onCanonicalReloadStart?: () => void;
}

export type TimelineSaveTarget = Readonly<{ session: object; timelineId: string; targetSeq: number; generation: number }>;

/** Additive Error metadata; legacy flush callers keep their number/Error contract. */
export class TimelineSaveBarrierError extends Error {
  readonly cause: unknown;
  constructor(message: string, readonly target: TimelineSaveTarget,
    readonly certainty: 'definitely-uncommitted' | 'ambiguous', cause: unknown) {
    super(message);
    this.name = 'TimelineSaveBarrierError';
    this.cause = cause;
  }
}

interface PersistenceSession {
  identity: object;
  provider: DataProvider;
  timelineId: string;
  dataRef: MutableRefObject<TimelineData | null>;
  editSeqRef: MutableRefObject<number>;
  savedSeqRef: MutableRefObject<number>;
  configVersionRef: MutableRefObject<number>;
  /** Reused host refs cannot lend an acknowledgement to a replacement. */
  acknowledgedSeq: number;
  generation: number;
  uncertainThroughSeq: number;
  activeAttempts: Set<SaveAttempt>;
  cancelledRanges: Array<{ from: number; through: number }>;
}

interface ScheduledSave {
  editCommands?: readonly EditCommand[];
  occurrenceContext?: TimelineOccurrenceContext;
  nextCommandSave?: ScheduledSave;
  session: PersistenceSession;
  generation: number;
  data: TimelineData;
  seq: number;
  draftOwnerId: string;
  draftRecoveryKey: string | null;
  draftWrite: Promise<void>;
  traceId: string;
  /** The editor base captured when this mutation was scheduled. */
  baseHead?: TimelineHeadRevision;
  /** Complete document value used for recovery/draft comparison. */
  effectiveBundle: TimelineBundleEnvelope | null;
  /** Provider wire semantics: undefined preserves an already stored bundle. */
  wireBundle: TimelineBundleEnvelope | null | undefined;
  /** Waits for a queued descendant's draft base to advance before sending it. */
  baseHeadAdvance?: Promise<void>;
}

interface DeferredRecoverySave {
  data: TimelineData;
  preserveStatus?: boolean;
}

interface SaveAttempt extends ScheduledSave {
  provider: DataProvider;
  timelineId: string;
  expectedVersion: number;
  expectedHead?: TimelineHeadRevision;
  config: TimelineConfig;
  registry: AssetRegistry;
  stableSignature: string;
}

function cloneAttemptValue<T>(value: T): T {
  return structuredClone(value);
}

function sameHead(a: TimelineHeadRevision | undefined, b: TimelineHeadRevision | undefined): boolean {
  return a?.projectId === b?.projectId
    && a?.timelineId === b?.timelineId
    && a?.headRevisionId === b?.headRevisionId;
}

export interface UseTimelinePersistenceResult {
  scheduleSave: ScheduleSaveFn;
  /** Resume the latest edit deferred while recovery provenance was being checked. */
  resumeDeferredRecoverySave: () => void;
  /** Drop a deferred edit because the recovery action is replacing/discarding it. */
  clearDeferredRecoverySave: () => void;
  /**
   * Flush the latest editor document through the normal CAS writer and return
   * the exact acknowledged version. Render admission uses this as a barrier so
   * it can never snapshot an autosave-pending or unversioned `head`.
   */
  flushPendingSave: () => Promise<number>;
  captureSaveTarget: (targetSeq?: number) => TimelineSaveTarget;
  flushSaveTarget: (target: TimelineSaveTarget) => Promise<number>;
  discardUncommittedSaveTarget: (target: TimelineSaveTarget, error: unknown) => boolean;
  saveStatus: SaveStatus;
  isConflictExhausted: boolean;
  schemaIncompatible: ReadonlyArray<TimelineSchemaIssue> | null;
  reloadFromServer: (options?: { clearDraft?: boolean; preserveDraft?: boolean }) => Promise<void>;
  retrySaveAfterConflict: () => Promise<void>;
  isSavingRef: MutableRefObject<boolean>;
  /** Mirrors isConflictExhausted for the poll gate. */
  isConflictExhaustedRef: MutableRefObject<boolean>;
  /**
   * Write-ack watchdog: true when an edit went unacknowledged past the grace
   * period (or was dropped on the null-data path). Persistent until an ack or
   * an explicit retry/dismiss clears it.
   */
  watchdogTripped: boolean;
  /** Why the watchdog tripped: a save that never acknowledged, or a dropped edit. */
  watchdogReason: 'timeout' | 'lost-edit' | null;
  /** Re-attempt the save (timeout) or dismiss the notice (lost-edit). */
  retryWatchdog: () => void;
  /** Synchronous guard for recovery actions that must not race canonical reload. */
  canonicalReloadInProgressRef: MutableRefObject<boolean>;
  /**
   * The bundle carried by the most recent server reload (`reloadFromServer`).
   * [V2-B4 handoff] the assembly authority supersedes this ref as the
   * save-side producer once source items become editor-mutable; until then a
   * reloaded bundle is re-persisted verbatim so edits that don't touch lanes
   * can't silently drop it.
   */
  loadedBundleRef: MutableRefObject<TimelineBundleEnvelope | null>;
}

export function useTimelinePersistence({
  store,
  provider,
  timelineId,
  resolveAssetUrl,
  assetResolver,
  eventBus,
  dataRef,
  commitData,
  selectedClipIdRef,
  selectedTrackIdRef,
  editSeqRef,
  savedSeqRef,
  configVersionRef,
  headRevisionRef: suppliedHeadRevisionRef,
  recoveryPendingRef,
  recoveryActiveRef,
  lastSavedSignatureRef,
  interactionStateRef,
  onCanonicalReloadStart,
}: UseTimelinePersistenceOptions): UseTimelinePersistenceResult {
  const fallbackHeadRevisionRef = useRef(dataRef.current?.head);
  const headRevisionRef = suppliedHeadRevisionRef ?? fallbackHeadRevisionRef;
  const persistenceEnabled = isDataProviderPersistenceEnabled(provider);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<ScheduledSave | null>(null);
  const enqueueSave = useCallback((save: ScheduledSave) => {
    const pending = pendingSaveRef.current;
    if (!save.session.provider.semanticCommandSaving || !pending) {
      pendingSaveRef.current = save;
      return;
    }
    // Snapshot coalescing is valid for the old document route. Command authorship
    // must survive: two equal-valued edits are still two transactions.
    let tail = pending;
    while (tail.nextCommandSave) tail = tail.nextCommandSave;
    if (tail.seq !== save.seq) tail.nextCommandSave = save;
  }, []);

  // Stash for scheduleSave() calls that arrive while a drag/resize is active.
  // Flushed on gesture end by the onInteractionEnd listener below.
  const deferredSaveRef = useRef<{ save: ScheduledSave; preserveStatus?: boolean } | null>(null);
  const deferredDuringRecoveryRef = useRef<DeferredRecoverySave | null>(null);
  const latestScheduledSaveRef = useRef<ScheduledSave | null>(null);
  const isSavingRef = useRef(false);
  const reloadInProgressRef = useRef(false);
  // Invalidates delayed queue continuations when a canonical reload begins.
  const saveQueueGenerationRef = useRef(0);
  const reloadCancelledRef = useRef(false);
  const reloadPromiseRef = useRef<Promise<void> | null>(null);
  const deferredDuringReloadRef = useRef<{ save: ScheduledSave; preserveStatus?: boolean } | null>(null);
  const saveDrainWaitersRef = useRef<Array<() => void>>([]);
  /**
   * The bundle carried by the most recent server reload (`reloadFromServer`).
   * [V2-B4 handoff] the assembly authority supersedes this ref as the
   * save-side producer once source items become editor-mutable; until then a
   * reloaded bundle is re-persisted verbatim so edits that don't touch lanes
   * can't silently drop it.
   */
  const loadedBundleRef = useRef<TimelineBundleEnvelope | null>(null);
  // Transport-failure retry: attempt counter + its own timer, so a failing
  // backend is retried on a backoff instead of as fast as it can answer.
  const errorRetryRef = useRef(0);
  const errorRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRetrySessionRef = useRef<PersistenceSession | null>(null);
  const isMountedRef = useRef(true);
  const activeTargetRef = useRef<PersistenceSession>({ identity: {}, provider, timelineId, dataRef, editSeqRef, savedSeqRef, configVersionRef, acknowledgedSeq: savedSeqRef.current, generation: 0, uncertainThroughSeq: -1, activeAttempts: new Set(), cancelledRanges: [] });
  if (
    activeTargetRef.current.provider !== provider
    || activeTargetRef.current.timelineId !== timelineId
    || activeTargetRef.current.dataRef !== dataRef
    || activeTargetRef.current.editSeqRef !== editSeqRef
    || activeTargetRef.current.savedSeqRef !== savedSeqRef
    || activeTargetRef.current.configVersionRef !== configVersionRef
  ) {
    // Object identity also protects an A -> B -> A replacement: an old
    // request's receipt must never acknowledge the new session's sequence.
    activeTargetRef.current = { identity: {}, provider, timelineId, dataRef, editSeqRef, savedSeqRef, configVersionRef, acknowledgedSeq: -1, generation: 0, uncertainThroughSeq: -1, activeAttempts: new Set(), cancelledRanges: [] };
  }
  const session = activeTargetRef.current;
  const issuedFailuresRef = useRef(new WeakSet<TimelineSaveBarrierError>());
  const errorRetryAttemptRef = useRef<SaveAttempt | null>(null);
  const makeBarrierError = useCallback((target: TimelineSaveTarget, cause: unknown,
    noWrite = false, rejectedAttempt?: SaveAttempt) => {
    const owner = activeTargetRef.current;
    const uncertain = target.session !== owner.identity || target.generation !== owner.generation
      || owner.uncertainThroughSeq >= target.targetSeq
      || [...owner.activeAttempts].some((attempt) => attempt !== rejectedAttempt && attempt.seq >= target.targetSeq);
    const certainty = noWrite && !uncertain
      ? 'definitely-uncommitted' : 'ambiguous';
    const message = cause instanceof Error ? cause.message : String(cause ?? 'Timeline save acknowledgement failed.');
    const failure = new TimelineSaveBarrierError(message, target, certainty, cause);
    issuedFailuresRef.current.add(failure);
    return failure;
  }, []);
  const captureSaveTarget = useCallback((targetSeq = editSeqRef.current): TimelineSaveTarget => {
    if (!isMountedRef.current || session !== activeTargetRef.current) {
      throw new Error('Timeline session is closed or replaced before registration.');
    }
    if (!Number.isSafeInteger(targetSeq) || targetSeq < 0 || targetSeq > editSeqRef.current) {
      throw new Error('Invalid timeline save target sequence.');
    }
    return Object.freeze({ session: session.identity, timelineId, targetSeq, generation: session.generation });
  }, [editSeqRef, session, timelineId]);
  const draftWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const doSaveRef = useRef<((save: ScheduledSave | SaveAttempt, options?: { attemptKind?: 'initial' | 'transport-retry' }) => void) | null>(null);
  const flushWaitersRef = useRef<Array<{
    session: PersistenceSession;
    targetSeq: number;
    target: TimelineSaveTarget;
    typed: boolean;
    resolve: (version: number) => void;
    reject: (error: Error) => void;
  }>>([]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isConflictExhausted, setIsConflictExhausted] = useState(false);
  const [schemaIncompatible, setSchemaIncompatible] = useState<ReadonlyArray<TimelineSchemaIssue> | null>(null);
  const [watchdogTripped, setWatchdogTripped] = useState(false);
  const [watchdogReason, setWatchdogReason] = useState<'timeout' | 'lost-edit' | null>(null);
  const watchdogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors isConflictExhausted for the poll gate (usePollSync) — a diverged
  // timeline must not adopt remote data over local edits.
  const isConflictExhaustedRef = useRef(false);
  const isSchemaIncompatibleRef = useRef(false);
  const getDataRef = useCallback(() => {
    const storeDataRef = store?.getState().data.dataRef;
    return storeDataRef && storeDataRef.current !== null ? storeDataRef : dataRef;
  }, [dataRef, store]);
  const getInteractionStateRef = useCallback(() => {
    const storeInteractionStateRef = store?.getState().data.interactionStateRef;
    return storeInteractionStateRef ? storeInteractionStateRef : interactionStateRef;
  }, [interactionStateRef, store]);

  const logConfigVersionUpdate = useCallback((source: ConfigVersionUpdateSource, nextVersion: number) => {
    if (!isTimelineDiagnosticsEnabled()) {
      return;
    }

    console.log(TIMELINE_SYNC_LOG_TAG, 'configVersionRef updated', {
      source,
      from: configVersionRef.current,
      to: nextVersion,
    });
  }, [configVersionRef]);

  const handleConflictExhausted = useCallback((details: {
    expectedVersion: number;
    actualVersion?: number;
    retries: number;
    reason: 'load_failed' | 'max_retries' | 'missing_local_data';
  }) => {
    if (isTimelineDiagnosticsEnabled()) {
      console.log('[TimelineSave] conflict retries exhausted', details);
    }
    setIsConflictExhausted(true);
    // Keep the synchronous poll/write gate ahead of React's next render.
    isConflictExhaustedRef.current = true;
    setSaveStatus('error');
  }, []);

  const saveMutation = useMutation({
    mutationFn: ({
      config,
      expectedVersion,
      expectedHead,
      registry,
      bundle,
      attemptProvider,
      attemptTimelineId,
      traceId,
      editCommands,
      occurrenceContext,
      commitOwner,
    }: {
      config: TimelineConfig;
      editCommands?: readonly EditCommand[];
      occurrenceContext?: TimelineOccurrenceContext;
      commitOwner?: { id: string; proposalTransactionId?: string };
      expectedVersion: number;
      expectedHead?: TimelineHeadRevision;
      registry?: AssetRegistry;
      traceId: string;
      /** `undefined` keeps the stored bundle; `null` clears it. */
      bundle?: TimelineBundleEnvelope | null;
      attemptProvider: DataProvider;
      attemptTimelineId: string;
    }) => {
      attemptProvider.setShotTimelineTraceId?.(traceId);
      const saved: Promise<number | TimelineSaveReceipt> = attemptProvider.saveTimelineAtHead
        ? expectedHead
          ? attemptProvider.recoverTimelineCommit
            ? attemptProvider.saveTimelineAtHead(attemptTimelineId, config, expectedHead, registry, bundle, editCommands, occurrenceContext, commitOwner)
            : occurrenceContext
            ? attemptProvider.saveTimelineAtHead(attemptTimelineId, config, expectedHead, registry, bundle, editCommands, occurrenceContext)
            : attemptProvider.saveTimelineAtHead(attemptTimelineId, config, expectedHead, registry, bundle, editCommands)
          : Promise.reject(new TimelineVersionConflictError('Timeline draft has unknown head provenance; resolve or discard it before saving.'))
        : attemptProvider.saveTimeline(attemptTimelineId, config, expectedVersion, registry, bundle);
      // Drop any cached resolved preview of THIS timeline used by a parent
      // composition's shot clips, so the next boundary crossing reloads the
      // freshly saved data instead of replaying a stale cached config.
      void saved.then(() => invalidateReferencedTimelineCache(attemptProvider, attemptTimelineId)).catch(() => {});
      return saved;
    },
    retry: false,
  });

  // The old conflict path reloaded the remote version and re-POSTed local
  // state, silently overwriting the other writer (the CAS-defeating bug from
  // the incident). B4 removes it entirely: a 409 enters the diverged state.

  const cancelErrorRetryTimer = useCallback(() => {
    if (errorRetryTimer.current) {
      clearTimeout(errorRetryTimer.current);
      errorRetryTimer.current = null;
    }
    errorRetrySessionRef.current = null;
    errorRetryAttemptRef.current = null;
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimer.current) {
      clearTimeout(watchdogTimer.current);
      watchdogTimer.current = null;
    }
    setWatchdogTripped(false);
    setWatchdogReason(null);
  }, []);

  const resolveFlushWaiters = useCallback((attempt: SaveAttempt, acknowledgedVersion: number) => {
    const remaining: typeof flushWaitersRef.current = [];
    for (const waiter of flushWaitersRef.current) {
      if (waiter.session !== activeTargetRef.current || waiter.target.generation !== waiter.session.generation) {
        waiter.reject(waiter.typed ? makeBarrierError(waiter.target, new Error('Timeline session replaced before durable acknowledgement.')) : new Error('Timeline session replaced before durable acknowledgement.'));
      } else if (!isDataProviderPersistenceEnabled(waiter.session.provider) || typeof waiter.session.provider.saveTimeline !== 'function') {
        waiter.reject(waiter.typed ? makeBarrierError(waiter.target, new Error('Durable timeline persistence is unavailable.')) : new Error('Durable timeline persistence is unavailable.'));
      } else if (!waiter.session.dataRef.current || !getDataRef().current) {
        waiter.reject(waiter.typed ? makeBarrierError(waiter.target, new Error('Timeline data unloaded before durable acknowledgement.')) : new Error('Timeline data unloaded before durable acknowledgement.'));
      } else if (waiter.session === attempt.session && waiter.targetSeq <= attempt.seq) {
        waiter.resolve(acknowledgedVersion);
      } else {
        remaining.push(waiter);
      }
    }
    flushWaitersRef.current = remaining;
  }, [getDataRef, makeBarrierError]);

  const rejectFlushWaiters = useCallback((error: unknown, attempt?: SaveAttempt, noWrite = false) => {
    const normalized = error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Timeline save acknowledgement failed.');
    const waiters = flushWaitersRef.current;
    flushWaitersRef.current = [];
    for (const waiter of waiters) {
      waiter.reject(waiter.typed ? makeBarrierError(waiter.target, normalized, noWrite, attempt) : normalized);
    }
  }, [makeBarrierError]);

  /**
   * Cancel a pending watchdog trip WITHOUT clearing an already-tripped error.
   * Used when a debounce-pending save becomes interaction-deferred: the
   * watchdog armed with that debounce must not keep consuming grace while no
   * POST is in flight (a long drag could otherwise trip a false error). The
   * deferred flush re-arms it through `scheduleSave` when the gesture ends.
   */
  const disarmWatchdog = useCallback(() => {
    if (watchdogTimer.current) {
      clearTimeout(watchdogTimer.current);
      watchdogTimer.current = null;
    }
  }, []);

  /**
   * Arm the write-ack watchdog: an edit exists that has no durable save
   * receipt. If no ack arrives within the grace period the UI trips. A
   * 'lost-edit' trips immediately (the edit was already dropped).
   */
  const armWatchdog = useCallback((reason: 'timeout' | 'lost-edit') => {
    setWatchdogReason(reason);
    if (reason === 'lost-edit') {
      if (watchdogTimer.current) {
        clearTimeout(watchdogTimer.current);
        watchdogTimer.current = null;
      }
      setWatchdogTripped(true);
      return;
    }
    if (watchdogTimer.current) {
      return;
    }
    watchdogTimer.current = setTimeout(() => {
      watchdogTimer.current = null;
      setWatchdogTripped(true);
    }, WATCHDOG_GRACE_MS);
  }, []);


  /** A save landed (or persistence is off): drop the pending retry and its backoff. */
  const clearErrorRetry = useCallback(() => {
    cancelErrorRetryTimer();
    errorRetryRef.current = 0;
  }, [cancelErrorRetryTimer]);

  const waitForRecoveryDraftWrites = useCallback(async () => {
    let observed: Promise<void>;
    do {
      observed = draftWriteChainRef.current;
      await observed.catch(() => {});
    } while (observed !== draftWriteChainRef.current);
  }, []);

  const waitForSaveDrain = useCallback(() => {
    if (!isSavingRef.current && !pendingSaveRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => saveDrainWaitersRef.current.push(resolve));
  }, []);

  const resolveSaveDrainWaiters = useCallback(() => {
    if (isSavingRef.current || pendingSaveRef.current) return;
    const waiters = saveDrainWaitersRef.current;
    saveDrainWaitersRef.current = [];
    waiters.forEach((resolve) => resolve());
  }, []);

  /**
   * Re-attempt a save that failed for transport reasons, on an exponential
   * backoff, from a timer this hook owns and cancels on unmount. Unbounded in
   * attempts (the edit must eventually land) but bounded in rate.
   */
  const scheduleErrorRetry = useCallback((attemptToRetry: SaveAttempt) => {
    if (!isMountedRef.current || reloadInProgressRef.current || activeTargetRef.current !== attemptToRetry.session) {
      return;
    }
    if (isConflictExhaustedRef.current || isSchemaIncompatibleRef.current) {
      return;
    }

    if (errorRetryTimer.current) {
      clearTimeout(errorRetryTimer.current);
    }

    const attempt = errorRetryRef.current;
    errorRetryRef.current = attempt + 1;
    const delay = Math.min(SAVE_ERROR_RETRY_BASE_MS * 2 ** attempt, SAVE_ERROR_RETRY_MAX_MS);
    if (isTimelineDiagnosticsEnabled()) {
      console.log('[TimelineSave] save failed, retrying', { attempt: attempt + 1, delayMs: delay });
    }

    errorRetrySessionRef.current = attemptToRetry.session;
    errorRetryAttemptRef.current = attemptToRetry;
    errorRetryTimer.current = setTimeout(() => {
      errorRetryTimer.current = null;
      errorRetrySessionRef.current = null;
      if (!isMountedRef.current || reloadInProgressRef.current || activeTargetRef.current !== attemptToRetry.session) {
        return;
      }
      if (isConflictExhaustedRef.current || isSchemaIncompatibleRef.current) {
        return;
      }
      if (isInteractionActive(getInteractionStateRef())) {
        // Same gate `scheduleSave` applies: no save round-trip mid-gesture.
        // Waiting out a drag is not a failure, so re-arm at the same level.
        errorRetryRef.current = attempt;
        scheduleErrorRetry(attemptToRetry);
        return;
      }
      doSaveRef.current?.(attemptToRetry, { attemptKind: 'transport-retry' });
    }, delay);
  }, [getInteractionStateRef]);

  /**
   * Verify a transport-retry 409 was a lost acknowledgement rather than a
   * concurrent edit. A timed-out POST may have committed remotely; the retry
   * then uses the same stale expected version and receives 409. Only
   * inspect it using a provider's coherent snapshot of the exact document
   * revision and complete payload (config, registry, and bundle).
   * Providers without that existing capability remain conservatively
   * conflicted: separate reads can accidentally combine different revisions,
   * and content equality alone is not an authorship receipt.
   */
  const inspectLostAck = useCallback(async (
    attempt: SaveAttempt,
  ): Promise<'exact-payload-ambiguous' | 'different' | 'unavailable'> => {
    if (
      activeTargetRef.current.provider !== attempt.provider
      || activeTargetRef.current.timelineId !== attempt.timelineId
      || !attempt.provider.loadReferencedTimeline
    ) {
      return 'unavailable';
    }
    try {
      const snapshot = await attempt.provider.loadReferencedTimeline(attempt.timelineId);
      const freshVersion = snapshot.timeline.configVersion;
      if (freshVersion !== attempt.expectedVersion + 1) {
        return 'different';
      }
      if (getStableConfigSignature(snapshot.timeline.config, snapshot.registry) !== attempt.stableSignature) {
        return 'different';
      }
      if (canonicalJsonStringify(snapshot.timeline.bundle ?? null) !== canonicalJsonStringify(attempt.effectiveBundle)) {
        return 'different';
      }
      // Exact state equality proves what is stored, not who authored it. The
      // current DataProvider contract exposes neither the save request's
      // idempotency identity nor a mutation receipt, so this remains an
      // ambiguous 409 and must not acknowledge the sequence or clear a draft.
      return 'exact-payload-ambiguous';
    } catch {
      return 'unavailable';
    }
  }, []);

  const doSave = useCallback(async (
    scheduledOrAttempt: ScheduledSave | SaveAttempt,
    options?: {
      bypassQueue?: boolean;
      completedSeqRef?: { current: number | null };
      attemptKind?: 'initial' | 'transport-retry';
      traceId?: string;
    },
  ) => {
    if (reloadInProgressRef.current) return;
    if (recoveryPendingRef?.current || recoveryActiveRef?.current) return;
    if (scheduledOrAttempt.session !== activeTargetRef.current
      || scheduledOrAttempt.generation !== scheduledOrAttempt.session.generation
      || scheduledOrAttempt.session.cancelledRanges.some((range) => scheduledOrAttempt.seq >= range.from && scheduledOrAttempt.seq <= range.through)) return;
    if (isSavingRef.current && !options?.bypassQueue) {
      if (!('expectedVersion' in scheduledOrAttempt)) {
        enqueueSave(scheduledOrAttempt);
      }
      return;
    }

    const completedSeqRef = options?.completedSeqRef ?? { current: null };
    const attempt: SaveAttempt = 'expectedVersion' in scheduledOrAttempt
      ? scheduledOrAttempt
      : {
          ...scheduledOrAttempt,
          provider: scheduledOrAttempt.session.provider,
          timelineId: scheduledOrAttempt.session.timelineId,
          expectedVersion: configVersionRef.current,
          expectedHead: scheduledOrAttempt.baseHead
            ? cloneAttemptValue(scheduledOrAttempt.baseHead)
            : headRevisionRef.current
              ? cloneAttemptValue(headRevisionRef.current)
              : undefined,
          config: cloneAttemptValue(scheduledOrAttempt.data.config),
          registry: cloneAttemptValue(scheduledOrAttempt.data.registry),
          stableSignature: scheduledOrAttempt.data.stableSignature,
        };
    let retryScheduled = false;

    if (!options?.bypassQueue) {
      isSavingRef.current = true;
    }
    setSaveStatus('saving');

    attempt.session.activeAttempts.add(attempt);
    try {
      // Reserve the single flight before awaiting the queued draft's base write.
      // Otherwise a later gesture could overtake this queued transaction while
      // IndexedDB is still advancing its recovery record.
      if (attempt.baseHeadAdvance) {
        await attempt.baseHeadAdvance.catch(() => {});
        if (reloadInProgressRef.current || !isMountedRef.current
          || activeTargetRef.current !== attempt.session
          || attempt.generation !== attempt.session.generation) return;
      }
      await saveMutation.mutateAsync(
        {
          config: attempt.config,
          expectedVersion: attempt.expectedVersion,
          expectedHead: attempt.expectedHead,
          registry: attempt.registry,
          bundle: attempt.wireBundle,
          attemptProvider: attempt.provider,
          attemptTimelineId: attempt.timelineId,
          traceId: attempt.traceId,
          editCommands: attempt.editCommands,
          occurrenceContext: attempt.occurrenceContext,
          commitOwner: { id: attempt.draftOwnerId, proposalTransactionId: proposalCorrelationFor(attempt.data) },
        },
        {
          onSuccess: (receipt) => {
            if (
              !isMountedRef.current
              || activeTargetRef.current !== attempt.session
            ) {
              return;
            }
            const nextVersion = typeof receipt === 'number' ? receipt : receipt.configVersion;
            if (typeof receipt !== 'number') {
              headRevisionRef.current = receipt.head;
              if (receipt.commandInverse !== undefined && attempt.generation === attempt.session.generation) {
                eventBus.emit('nativeRegistrationAccepted', attempt.data, receipt.commandInverse);
              }
            }
            if (typeof receipt === 'number' && nextVersion < configVersionRef.current) {
              // Versions are monotonic per backend generation, so a decrease
              // means the backend lost its history (a restarted local bridge
              // reverting to its seed). The save that just landed re-pushed the
              // browser's state, which is the only surviving copy — say so,
              // because the badge alone will just read `saved` again.
              console.warn(
                '[TimelineSave] bridge config_version went backwards (restart?) — local state re-pushed',
                { from: configVersionRef.current, to: nextVersion },
              );
            }
            logConfigVersionUpdate('save', nextVersion);
            recordShotTimelinePhase(attempt.traceId, 'editor-ack', { version: nextVersion });
            configVersionRef.current = nextVersion;
            // Advance the canonical version channel OUTSIDE the data object:
            // a receipt-only ack must NOT commit a new data object (that
            // rebuilds the editor-data slice and triggers the O(n) render
            // cascade mid-drag). Reader/ops/sync read this store field.
            store?.getState().setConfigVersion(nextVersion);
            if (attempt.generation === attempt.session.generation) proposalSaveFor(attempt.data)?.acknowledge();
            completedSeqRef.current = attempt.seq;
            attempt.session.acknowledgedSeq = Math.max(attempt.session.acknowledgedSeq, attempt.seq);

            // Legacy document saves advance their recovery base after an ACK.
            // Semantic commands retain the exact authored base in both the
            // queue and draft; the provider asks Astrid for their rebased suffix.
            if (typeof receipt !== 'number' && attempt.expectedHead) {
              let pendingSave = pendingSaveRef.current;
              while (pendingSave) {
                if (pendingSave.editCommands === undefined && sameHead(pendingSave.baseHead, attempt.expectedHead)) {
                  const acknowledgedHead = cloneAttemptValue(receipt.head);
                  const queuedSave = pendingSave;
                  queuedSave.baseHead = acknowledgedHead;
                  queuedSave.baseHeadAdvance = queuedSave.draftWrite
                    .catch(() => {})
                    .then(() => advanceTimelineDraftBaseAfterHeadAcknowledgement(
                      queuedSave.draftRecoveryKey,
                      queuedSave.draftOwnerId,
                      attempt.expectedHead!,
                      acknowledgedHead,
                    ))
                    .then(() => undefined)
                    .catch(() => undefined);
                }
                pendingSave = pendingSave.nextCommandSave ?? null;
              }
            }

            clearErrorRetry();
            setIsConflictExhausted(false);
            setSchemaIncompatible(null);
            isSchemaIncompatibleRef.current = false;
            if (attempt.seq > savedSeqRef.current) {
              savedSeqRef.current = attempt.seq;
              lastSavedSignatureRef.current = attempt.stableSignature;
            }

            resolveFlushWaiters(attempt, nextVersion);

            setSaveStatus(attempt.seq >= editSeqRef.current ? 'saved' : 'dirty');
            // Only a receipt that covers the current edit (no newer edit
            // pending) is an ack: an older save's success must NOT clear the
            // sole write-ack watchdog while a newer edit is still unsaved.
            // The queued newer save drains right after and emits its own
            // saveSuccess when it lands.
            if (attempt.seq >= editSeqRef.current && !reloadInProgressRef.current) {
              eventBus.emit('saveSuccess');
              // The recovery slot is cleared only by a durable receipt that
              // covers the current edit. An older ACK must leave the newer
              // mutation's draft intact. IndexedDB is best-effort (private
              // mode/quota failures must never become unhandled rejections).
              void attempt.draftWrite
                .then(() => clearTimelineDraft(attempt.draftRecoveryKey, attempt.draftOwnerId))
                .catch(() => {});
            }
          },
        },
      );
    } catch (error) {
      // An obsolete request may settle after replacement/unmount. It cannot
      // reject a new session's waiters, update its state, or start a retry.
      if (!isMountedRef.current || activeTargetRef.current !== attempt.session) return;
      // Canonical composition writes use a typed stale-head error, while the
      // editor persistence state is deliberately transport-agnostic. Translate
      // it once into the terminal CAS-diverged error path; never retry/rebase.
      const persistenceError = error instanceof StaleWriteError
        ? new TimelineVersionConflictError(error.message)
        : error;
      if (isTimelineDiagnosticsEnabled()) {
        const diagnostic = persistenceError && typeof persistenceError === 'object'
          ? persistenceError as {
              name?: unknown;
              message?: unknown;
              code?: unknown;
              status?: unknown;
              failureKind?: unknown;
              causeCode?: unknown;
            }
          : {};
        console.error('[TimelineSave] save failed ' + JSON.stringify({
          name: diagnostic.name,
          message: diagnostic.message,
          code: diagnostic.code,
          status: diagnostic.status,
          failureKind: diagnostic.failureKind,
          causeCode: diagnostic.causeCode,
        }));
      }
      if (isTimelineNotFoundError(persistenceError)) {
        if (isTimelineDiagnosticsEnabled()) {
          console.log('[TimelineSave] timeline not found, cannot save');
        }
        handleConflictExhausted({
          expectedVersion: configVersionRef.current,
          retries: 0,
          reason: 'missing_local_data',
        });
        rejectFlushWaiters(persistenceError, attempt, true);
        return;
      }

      const retrySemanticUnknownOutcome = attempt.editCommands !== undefined
        && persistenceError !== null && typeof persistenceError === 'object'
        && 'code' in persistenceError && persistenceError.code === 'runtime_unavailable'
        && !('failureKind' in persistenceError && (persistenceError.failureKind === 'storage' || persistenceError.failureKind === 'admission'));
      if (isProviderUnavailableError(persistenceError) && !retrySemanticUnknownOutcome) {
        // A semantic commit may have been accepted before the transport failed.
        // Its exact reserved request must use the normal attempt retry below;
        // parking it here would let a newer edit deadlock behind its reservation.
        // A provider-wide outage is not a transient timeline transport error.
        // Keep the draft/recovery slot, surface the workspace banner, and wait
        // for an explicit Runtime reconnect instead of flooding the Runtime.
        cancelErrorRetryTimer();
        disarmWatchdog();
        setSaveStatus('error');
        rejectFlushWaiters(persistenceError);
        return;
      }

      if ((isTimelineVersionConflictError(persistenceError) || isTimelineSchemaIncompatibleError(error))
        && dataRef.current === attempt.data && attempt.generation === attempt.session.generation) {
        const before = manualTextBefore(attempt.data);
        if (before) {
          commitData(before.data, { save: false, skipHistory: true, selectedClipId: before.selectedClipId, selectedTrackId: before.selectedTrackId });
          eventBus.emit('nativeRegistrationAccepted', attempt.data, null);
        }
      }

      if (isTimelineVersionConflictError(persistenceError)) {
        if (options?.attemptKind === 'transport-retry') {
          const reconciliation = await inspectLostAck(attempt);
          if (!isMountedRef.current || activeTargetRef.current !== attempt.session) return;
          if (isTimelineDiagnosticsEnabled()) {
            console.log('[TimelineSave] retry conflict reconciliation', {
              expectedVersion: attempt.expectedVersion,
              reconciliation,
            });
          }
        }
        // Diverged: the document changed elsewhere. No version reload, no
        // re-POST of local state (that silently overwrote the other writer —
        // the incident's CAS-defeating bug). Enter diverged and let the banner
        // offer Reload / Save as copy.
        if (isTimelineDiagnosticsEnabled()) {
          console.log('[TimelineSave] version conflict — entering diverged state', {
            expectedVersion: attempt.expectedVersion,
          });
        }
        handleConflictExhausted({
          expectedVersion: configVersionRef.current,
          retries: 0,
          reason: 'max_retries',
        });
        rejectFlushWaiters(persistenceError, attempt, true);
        return;
      }

      if (isTimelineSchemaIncompatibleError(error)) {
        isSchemaIncompatibleRef.current = true;
        setSchemaIncompatible(error.issues);
        setSaveStatus('error');
        cancelErrorRetryTimer();
        disarmWatchdog();
        rejectFlushWaiters(error, attempt, true);
        return;
      }

      attempt.session.uncertainThroughSeq = Math.max(attempt.session.uncertainThroughSeq, attempt.seq);
      rejectFlushWaiters(error, attempt);

      if (attempt.data && !reloadInProgressRef.current) {
        // Recoverable transport failure (timeout, 5xx, dropped connection):
        // the retry backoff owns recovery, so this is not a destructive
        // error — the user sees a neutral `retrying` badge while the backend
        // recovers. `error` is reserved for 404/409/lost-edit/unrecoverable.
        setSaveStatus('retrying');
        retryScheduled = true;
        scheduleErrorRetry(attempt);
      } else {
        setSaveStatus('error');
      }
    } finally {
      attempt.session.activeAttempts.delete(attempt);
      if (!options?.bypassQueue) {
        isSavingRef.current = false;

        const pendingSave = pendingSaveRef.current;
        if (pendingSave && !retryScheduled) {
          pendingSaveRef.current = pendingSave.nextCommandSave ?? null;
          pendingSave.nextCommandSave = undefined;
          if (completedSeqRef.current === null || pendingSave.seq > completedSeqRef.current) {
            if (!reloadInProgressRef.current
              && !isConflictExhaustedRef.current
              && !isSchemaIncompatibleRef.current) {
              const queueGeneration = saveQueueGenerationRef.current;
              const startPendingSave = () => {
                if (
                  queueGeneration !== saveQueueGenerationRef.current
                  || reloadInProgressRef.current
                  || !isMountedRef.current
                  || activeTargetRef.current !== pendingSave.session
                ) return;
                doSaveRef.current?.(pendingSave);
              };
              startPendingSave();
            }
          }
        }
        resolveSaveDrainWaiters();
      }
    }
  }, [
    clearErrorRetry,
    enqueueSave,
    configVersionRef,
    disarmWatchdog,
    headRevisionRef,
    recoveryPendingRef,
    recoveryActiveRef,
    editSeqRef,
    handleConflictExhausted,
    lastSavedSignatureRef,
    logConfigVersionUpdate,
    eventBus,
    rejectFlushWaiters,
    resolveFlushWaiters,
    saveMutation,
    savedSeqRef,
    scheduleErrorRetry,
    inspectLostAck,
    provider,
    timelineId,
    resolveSaveDrainWaiters,
  ]);

  // `scheduleErrorRetry` fires `doSave` from a timer, and `doSave` schedules the
  // retry — the indirection keeps that cycle out of the dependency arrays.
  doSaveRef.current = (save, options) => { void doSave(save, options); };

  const createScheduledSave = useCallback((nextData: TimelineData, seq: number): ScheduledSave => {
    const draftOwnerId = generateUUID();
    const recoveryMetadata = provider.getTimelineDraftRecoveryMetadata?.(timelineId) ?? {};
    // Provider caches may contain a polled head. Only the editor's adopted
    // base (or its own acknowledged successor) belongs to this draft.
    const head = proposalSaveFor(nextData)?.base ?? headRevisionRef.current;
    const draftRecoveryKey = timelineDraftRecoveryKey(recoveryMetadata, timelineId);
    const draftBaseVersion = configVersionRef.current;
    const traceId = createShotTimelineTraceId(timelineId);
    const wireBundle = loadedBundleRef.current === null
      ? undefined
      : cloneAttemptValue(loadedBundleRef.current);
    const effectiveBundle: TimelineBundleEnvelope | null = loadedBundleRef.current !== null
      ? cloneAttemptValue(loadedBundleRef.current)
      : nextData.sourceItemsBySchemaRef
        ? {
            schema_version: 1,
            itemsBySchemaRef: cloneAttemptValue(nextData.sourceItemsBySchemaRef) as TimelineBundleEnvelope['itemsBySchemaRef'],
          }
        : null;
    const previous = latestScheduledSaveRef.current;
    const hasUnconvertedPredecessor = previous?.session === session
      && previous.seq > savedSeqRef.current && !previous.editCommands;
    const capturedCommands = gestureCommandsFor(nextData);
    const manualText = capturedCommands && (isManualTextBatch(capturedCommands) || isManualTextCreation(capturedCommands)
      || capturedCommands.length === 1 && isManualTextInverse(capturedCommands[0]));
    // A preceding compatibility edit cannot turn an already captured text
    // transaction into a whole-document fallback. Keep its exact base/receipt lane.
    const editCommands = provider.semanticCommandSaving && (!hasUnconvertedPredecessor || manualText || proposalSaveFor(nextData) !== undefined)
      ? capturedCommands : undefined;
    if (proposalSaveFor(nextData) && !editCommands) {
      throw new Error('Bound proposal commands cannot use a compatibility writer.');
    }
    const occurrenceContext = editCommands !== undefined ? gestureOccurrenceFor(nextData) : undefined;
    const draft = {
      ...(proposalCorrelationFor(nextData) ? { proposalTransactionId: proposalCorrelationFor(nextData) } : {}),
      ...(occurrenceContext ? { occurrenceContext: cloneAttemptValue(occurrenceContext) } : {}),
      ...(editCommands !== undefined ? { editCommands: cloneAttemptValue(editCommands) } : {}),
      config: cloneAttemptValue(nextData.config),
      registry: cloneAttemptValue(nextData.registry),
      bundle: effectiveBundle,
    };
    const draftWrite = draftWriteChainRef.current
      .catch(() => {})
      .then(() => saveTimelineDraft(
        timelineId,
        draft,
        draftBaseVersion,
        {
          ...recoveryMetadata,
          ...(provider.saveTimelineAtHead ? {
            baseHeadRevisionId: head?.headRevisionId,
            baseHeadProjectId: head?.projectId,
            baseHeadTimelineId: head?.timelineId,
          } : {}),
          ownerId: draftOwnerId,
          draftIdentity: recoveryMetadata.draftIdentity ?? draftOwnerId,
        },
      ));
    draftWriteChainRef.current = draftWrite;
    void draftWrite.catch(() => {});
    const scheduledSave: ScheduledSave = {
      session,
      generation: session.generation,
      data: nextData,
      ...(occurrenceContext ? { occurrenceContext: cloneAttemptValue(occurrenceContext) } : {}),
      ...(editCommands !== undefined ? { editCommands: cloneAttemptValue(editCommands) } : {}),
      seq,
      draftOwnerId,
      draftRecoveryKey,
      draftWrite,
      traceId,
      baseHead: head ? cloneAttemptValue(head) : undefined,
      effectiveBundle,
      wireBundle,
    };
    latestScheduledSaveRef.current = scheduledSave;
    return scheduledSave;
  }, [configVersionRef, headRevisionRef, provider, savedSeqRef, session, timelineId]);

  const scheduleSave = useCallback<ScheduleSaveFn>((nextData, options) => {
    // Recovery is an explicit CAS decision. Do not replace the recovered
    // record with a new-session edit before the user chooses Retry or Discard;
    // keep the edit in memory and resume it after that decision. The previous
    // ordering silently replaced the old recovery record and then returned,
    // leaving the UI looking saved even though no POST had happened.
    if (recoveryPendingRef?.current || recoveryActiveRef?.current) {
      deferredDuringRecoveryRef.current = {
        data: nextData,
        preserveStatus: options?.preserveStatus,
      };
      if (!options?.preserveStatus) setSaveStatus('dirty');
      return;
    }

    // Every mutation gets the latest coalesced recovery slot before any
    // debounce, interaction gate, or network attempt. Draft writes are
    // serialized so an older IndexedDB transaction cannot land after a newer
    // mutation, and each receipt can compare-and-delete only its own slot.
    const scheduledSave = createScheduledSave(nextData, editSeqRef.current);

    if (reloadInProgressRef.current) {
      // A user edit made while canonical Reload is pending supersedes that
      // reload. Keep it durably recoverable, then resume its normal autosave
      // path once the reload has stopped; never let the reload commit over it.
      reloadCancelledRef.current = true;
      deferredDuringReloadRef.current = { save: scheduledSave, preserveStatus: options?.preserveStatus };
      if (!options?.preserveStatus) setSaveStatus('dirty');
      return;
    }

    if (!persistenceEnabled) {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      pendingSaveRef.current = null;
      deferredSaveRef.current = null;
      clearErrorRetry();
      if (!options?.preserveStatus) {
        setSaveStatus('saved');
      }
      return;
    }

    // Gate on the shared interaction ref. If a drag or resize gesture is in
    // flight, stash the newest payload and defer scheduling the save timer
    // until the gesture ends. This prevents mid-gesture save round-trips from
    // triggering re-renders that drop pointer capture. The watchdog is armed
    // only after this gate passes: a long drag must not consume grace before
    // the POST even starts (the grace formula assumes the clock begins at the
    // debounce, not mid-gesture). The deferred payload is re-flushed through
    // this same path when the gesture ends, arming the watchdog then.
    if (isInteractionActive(getInteractionStateRef())) {
      const deferred = deferredSaveRef.current;
      if (provider.semanticCommandSaving && deferred) {
        let tail = deferred.save;
        while (tail.nextCommandSave) tail = tail.nextCommandSave;
        if (tail.seq !== scheduledSave.seq) tail.nextCommandSave = scheduledSave;
      } else {
        deferredSaveRef.current = { save: scheduledSave, preserveStatus: options?.preserveStatus };
      }
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      // The pending debounce was armed together with the write-ack watchdog
      // (see below). That watchdog must not keep consuming grace while no
      // POST is in flight: a long drag would trip a false on-page error
      // mid-interaction. Disarm it here; the deferred flush re-arms it via
      // `armWatchdog` below when the gesture ends and the save actually
      // starts. An already-tripped error is left intact — only a receipt
      // (saveSuccess) or an explicit retry clears it.
      disarmWatchdog();
      return;
    }

    // A mutation happened and a save is now pending (deferral has ended):
    // arm the write-ack watchdog. A durable receipt (saveSuccess) clears it;
    // if none arrives within the grace period the UI surfaces a persistent
    // error.
    armWatchdog('timeout');

    // Diverged (409): autosave and remote adoption are frozen. The mutation
    // was already coalesced into the one-slot recovery store above; the banner
    // offers Reload / Save as copy.
    if (isConflictExhausted) {
      return;
    }
    if (schemaIncompatible) {
      return;
    }

    if (!options?.preserveStatus) {
      setSaveStatus('dirty');
    }

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    if (isSavingRef.current) {
      enqueueSave(scheduledSave);
      return;
    }

    // An ambiguous transport attempt owns its retry tuple. A newer mutation
    // waits behind it instead of cancelling the retry and borrowing its seq.
    if (errorRetryTimer.current) {
      enqueueSave(scheduledSave);
      return;
    }

    if (provider.semanticCommandSaving && scheduledSave.editCommands) {
      if (pendingSaveRef.current) enqueueSave(scheduledSave);
      else void doSave(scheduledSave);
      return;
    }

    recordShotTimelinePhase(scheduledSave.traceId, 'local-commit', { saveDelayMs: SAVE_DEBOUNCE_MS });
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      recordShotTimelinePhase(scheduledSave.traceId, 'debounce-fired');
      void doSave(scheduledSave);
    }, SAVE_DEBOUNCE_MS);
  }, [provider, enqueueSave, armWatchdog, createScheduledSave, disarmWatchdog, doSave, editSeqRef, getInteractionStateRef, isConflictExhausted, persistenceEnabled, schemaIncompatible, recoveryPendingRef, recoveryActiveRef]);

  const resumeDeferredRecoverySave = useCallback(() => {
    if (recoveryPendingRef?.current || recoveryActiveRef?.current) return;
    const deferred = deferredDuringRecoveryRef.current;
    if (!deferred) return;
    deferredDuringRecoveryRef.current = null;
    scheduleSave(deferred.data, { preserveStatus: deferred.preserveStatus });
  }, [recoveryActiveRef, recoveryPendingRef, scheduleSave]);

  const clearDeferredRecoverySave = useCallback(() => {
    deferredDuringRecoveryRef.current = null;
  }, []);

  const flushSaveTarget = useCallback((target: TimelineSaveTarget, typed = true): Promise<number> => {
    if (recoveryPendingRef?.current || recoveryActiveRef?.current) return Promise.reject(makeBarrierError(target, new Error('Resolve the recovery draft before saving.'), true));
    const fail = (message: string, noWrite = true) => Promise.reject(typed ? makeBarrierError(target, new Error(message), noWrite) : new Error(message));
    if (target.session !== session.identity || target.timelineId !== timelineId || target.generation !== session.generation
      || !Number.isSafeInteger(target.targetSeq) || target.targetSeq < 0 || target.targetSeq > editSeqRef.current) {
      return fail('Timeline save target belongs to a different session or sequence.', false);
    }
    if (!isMountedRef.current || session !== activeTargetRef.current) {
      return fail('Timeline session is closed or replaced before durable acknowledgement.', false);
    }
    if (!isDataProviderPersistenceEnabled(provider) || typeof provider.saveTimeline !== 'function') {
      return fail('Durable timeline persistence is unavailable.');
    }
    if (errorRetryTimer.current && errorRetrySessionRef.current !== session) {
      clearErrorRetry();
    }
    if (reloadInProgressRef.current) {
      return fail('Timeline is reloading before durable acknowledgement.');
    }
    if (isInteractionActive(getInteractionStateRef())) {
      return fail('Finish the current timeline interaction before rendering.');
    }
    if (isConflictExhaustedRef.current || isConflictExhausted) {
      return fail('Resolve the timeline version conflict before rendering.');
    }
    if (isSchemaIncompatibleRef.current) {
      return fail('Resolve the incompatible timeline schema before saving.');
    }
    if (isSchemaIncompatibleRef.current) {
      return Promise.reject(new Error('Resolve the incompatible timeline schema before saving.'));
    }

    const latest = getDataRef().current ?? dataRef.current;
    if (!latest) {
      return fail('Timeline data is not loaded, so it cannot be saved for rendering.');
    }
    const targetSeq = target.targetSeq;
    const saveSeq = editSeqRef.current;
    if (
      session.acknowledgedSeq >= targetSeq
      && !isSavingRef.current
      && !saveTimer.current
      && !pendingSaveRef.current
      && !errorRetryTimer.current
    ) {
      return Promise.resolve(configVersionRef.current);
    }

    return new Promise<number>((resolve, reject) => {
      flushWaitersRef.current.push({ session, targetSeq, target, typed, resolve, reject });
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (isSavingRef.current) {
        enqueueSave(createScheduledSave(latest, saveSeq));
        return;
      }
      if (errorRetryTimer.current) {
        enqueueSave(createScheduledSave(latest, saveSeq));
        return;
      }
      const latestScheduled = latestScheduledSaveRef.current;
      const save = latestScheduled?.session === session
        && latestScheduled.seq === saveSeq
        && latestScheduled.data.stableSignature === latest.stableSignature
        ? latestScheduled
        : createScheduledSave(latest, saveSeq);
      void doSave(save);
    });
  }, [
    clearErrorRetry,
    enqueueSave,
    configVersionRef,
    recoveryPendingRef,
    recoveryActiveRef,
    createScheduledSave,
    dataRef,
    doSave,
    editSeqRef,
    getDataRef,
    getInteractionStateRef,
    isConflictExhausted,
    isConflictExhaustedRef,
    provider,
    session,
    timelineId,
    makeBarrierError,
  ]);

  const flushPendingSave = useCallback((): Promise<number> => {
    // Capturing legacy callers here keeps the existing latest-document barrier.
    return flushSaveTarget(Object.freeze({ session: session.identity, timelineId, targetSeq: editSeqRef.current, generation: session.generation }), false);
  }, [editSeqRef, flushSaveTarget, session, timelineId]);

  const discardUncommittedSaveTarget = useCallback((target: TimelineSaveTarget, error: unknown) => {
    if (!(error instanceof TimelineSaveBarrierError) || !issuedFailuresRef.current.has(error)
      || error.target !== target || error.certainty !== 'definitely-uncommitted'
      || target.session !== activeTargetRef.current.identity || target.generation !== session.generation || !isMountedRef.current
      || session.uncertainThroughSeq >= target.targetSeq
      || [...session.activeAttempts].some((attempt) => attempt.seq >= target.targetSeq)) return false;
    const range = { from: target.targetSeq, through: editSeqRef.current };
    session.cancelledRanges.push(range);
    const cancelled = (save: ScheduledSave | null | undefined) => Boolean(save && save.session === session
      && save.seq >= range.from && save.seq <= range.through);
    if (cancelled(latestScheduledSaveRef.current)) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      latestScheduledSaveRef.current = null;
    }
    if (cancelled(pendingSaveRef.current)) pendingSaveRef.current = null;
    if (cancelled(deferredSaveRef.current?.save)) deferredSaveRef.current = null;
    if (cancelled(deferredDuringReloadRef.current?.save)) deferredDuringReloadRef.current = null;
    if (cancelled(errorRetryAttemptRef.current)) clearErrorRetry();
    // The commit owner synchronously schedules corrected current data next;
    // old timer/finally/unmount closures are also fenced by doSave's range check.
    return true;
  }, [clearErrorRetry, editSeqRef, session]);

  const retryWatchdog = useCallback(() => {
    const reason = watchdogReason;
    clearWatchdog();
    if (reason === 'timeout') {
      // Re-attempt the save from the latest data. Lost edits have nothing to
      // re-send — the notice is the signal to reload the timeline.
      const latest = getDataRef().current ?? dataRef.current;
      if (latest) {
        scheduleSave(latest, { preserveStatus: true });
      }
    }
  }, [clearWatchdog, dataRef, getDataRef, scheduleSave, watchdogReason]);

  // When a gesture ends, flush the latest deferred payload (if any) through
  // the normal scheduleSave path, which will now proceed past the gate.
  useEffect(() => {
    return onInteractionEnd(getInteractionStateRef(), () => {
      const deferred = deferredSaveRef.current;
      if (!deferred) {
        return;
      }
      deferredSaveRef.current = null;
      if (provider.semanticCommandSaving) {
        armWatchdog('timeout');
        let save: ScheduledSave | undefined = deferred.save;
        while (save) {
          const next = save.nextCommandSave;
          save.nextCommandSave = undefined;
          void doSave(save);
          save = next;
        }
      } else {
        scheduleSave(deferred.save.data, { preserveStatus: deferred.preserveStatus });
      }
    });
  }, [armWatchdog, doSave, getInteractionStateRef, provider, scheduleSave]);

  const reloadFromServer = useCallback((options?: { clearDraft?: boolean; preserveDraft?: boolean }) => {
    // Recovery Retry may still be in its asynchronous read/build phase, outside
    // the save queue. Invalidate it for every canonical reload entry point,
    // including the internal Save-as-copy path below.
    onCanonicalReloadStart?.();
    if (reloadPromiseRef.current) return reloadPromiseRef.current;

    reloadInProgressRef.current = true;
    saveQueueGenerationRef.current += 1;
    rejectFlushWaiters(new Error('Timeline reloaded before durable acknowledgement.'));
    reloadCancelledRef.current = false;
    deferredDuringReloadRef.current = null;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSaveRef.current = null;
    deferredSaveRef.current = null;
    clearErrorRetry();
    clearWatchdog();

    const reloadTask = (async () => {
      try {
        // Cancel not-yet-started work above, then wait for any transport that
        // already crossed the write boundary. Its acknowledgement (including
        // an ambiguous/lost-ack retry) must settle before canonical is read.
        await waitForSaveDrain();
        await waitForRecoveryDraftWrites();
        if (reloadCancelledRef.current) {
          throw new Error('Canonical reload was superseded by a new timeline edit.');
        }

        const loaded = provider.saveTimelineAtHead && provider.loadReferencedTimeline
          ? await provider.loadReferencedTimeline(timelineId)
          : {
              timeline: await (provider.loadCanonicalTimeline ?? provider.loadTimeline).call(provider, timelineId),
              registry: await provider.loadAssetRegistry(timelineId),
              resolveAssetUrl: undefined,
            };
        const { timeline: loadedTimeline, registry } = loaded;
        const bundle = loadedTimeline.bundle ?? null;
        const reloadedData = assetResolver
          ? await buildTimelineDataWithResolver(
              loadedTimeline.config,
              registry,
              assetResolver,
              loadedTimeline.configVersion,
              timelineId,
              bundle?.itemsBySchemaRef,
              loadedTimeline.head,
            )
          : await buildTimelineData(
              loadedTimeline.config,
              registry,
              resolveAssetUrl ?? loaded.resolveAssetUrl ?? ((file) => provider.resolveAssetUrl(file)),
              loadedTimeline.configVersion,
              bundle?.itemsBySchemaRef,
              loadedTimeline.head,
            );

        if (reloadCancelledRef.current) {
          throw new Error('Canonical reload was superseded by a new timeline edit.');
        }

        // Clear only the exact durable draft snapshot the user chose to
        // discard. IndexedDB compares and deletes in one transaction, so a
        // newer edit written concurrently cannot be erased by this reload.
        const shouldClearDraft = options?.clearDraft ?? !options?.preserveDraft;
        if (shouldClearDraft) {
          await waitForRecoveryDraftWrites();
          if (reloadCancelledRef.current) {
            throw new Error('Canonical reload was superseded by a new timeline edit.');
          }
          const recoveryKey = timelineDraftRecoveryKey(provider.getTimelineDraftRecoveryMetadata?.(timelineId), timelineId);
          const recoverySnapshot = await loadTimelineDraft(recoveryKey);
          if (reloadCancelledRef.current) {
            throw new Error('Canonical reload was superseded by a new timeline edit.');
          }
          if (recoverySnapshot) {
            const cleared = await clearTimelineDraftIfSnapshotMatches(recoveryKey, recoverySnapshot);
            if (!cleared) {
              throw new Error('The recovery draft changed during reload; it was kept for safety.');
            }
          }
          if (reloadCancelledRef.current) {
            throw new Error('Canonical reload was superseded by a new timeline edit.');
          }
        }

        clearErrorRetry();
        clearWatchdog();
        setIsConflictExhausted(false);
        isConflictExhaustedRef.current = false;
        setSchemaIncompatible(null);
        isSchemaIncompatibleRef.current = false;
        // Canonical replacement can reuse sequence numbers. Fence captured
        // old payloads/targets without poisoning future edits at the same seq.
        session.generation += 1;
        session.cancelledRanges = [];
        session.uncertainThroughSeq = -1;
        latestScheduledSaveRef.current = null;
        editSeqRef.current = savedSeqRef.current;
        session.acknowledgedSeq = savedSeqRef.current;
        logConfigVersionUpdate('reload', loadedTimeline.configVersion);
        configVersionRef.current = loadedTimeline.configVersion;
        headRevisionRef.current = loadedTimeline.head;
        store?.getState().setConfigVersion(loadedTimeline.configVersion);
        // Keep a reloaded assembly bundle reachable downstream so the next
        // save cannot silently drop the server-owned source items.
        loadedBundleRef.current = bundle;
        commitData(reloadedData, {
          save: false,
          skipHistory: true,
          updateLastSavedSignature: true,
          selectedClipId: selectedClipIdRef.current,
          selectedTrackId: selectedTrackIdRef.current,
        });
        setSaveStatus('saved');
      } catch (error) {
        if (!reloadCancelledRef.current) setSaveStatus('error');
        throw error;
      } finally {
        const wasCancelled = reloadCancelledRef.current;
        reloadInProgressRef.current = false;
        reloadCancelledRef.current = false;
        const deferred = deferredDuringReloadRef.current;
        deferredDuringReloadRef.current = null;
        if (wasCancelled && deferred) {
          scheduleSave(deferred.save.data, { preserveStatus: deferred.preserveStatus });
        }
      }
    })();
    reloadPromiseRef.current = reloadTask;
    void reloadTask.then(
      () => { if (reloadPromiseRef.current === reloadTask) reloadPromiseRef.current = null; },
      () => { if (reloadPromiseRef.current === reloadTask) reloadPromiseRef.current = null; },
    );
    return reloadTask;
  }, [
    assetResolver,
    clearErrorRetry,
    clearWatchdog,
    commitData,
    configVersionRef,
    headRevisionRef,
    editSeqRef,
    logConfigVersionUpdate,
    provider,
    resolveAssetUrl,
    scheduleSave,
    savedSeqRef,
    session,
    selectedClipIdRef,
    selectedTrackIdRef,
    onCanonicalReloadStart,
    rejectFlushWaiters,
    store,
    timelineId,
    waitForRecoveryDraftWrites,
    waitForSaveDrain,
  ]);

  /**
   * "Save as copy" (diverged banner action): the local work is stashed in the
   * one-slot recovery draft, then the server state is loaded. The local edits
   * are never silently re-POSTed over the other writer (the CAS-defeating bug
   * is gone); the copy survives for Retry / Save-as-copy on the next load.
   */
  const retrySaveAfterConflict = useCallback(async () => {
    const latest = getDataRef().current ?? dataRef.current;
    if (!latest) {
      setIsConflictExhausted(false);
      return;
    }

    try {
      await createScheduledSave(latest, editSeqRef.current).draftWrite;
    } catch {
      // IndexedDB unavailable (private mode etc.) — the copy can't persist.
      // Keep the diverged state so the user knows local edits are at risk.
      return;
    }
    setIsConflictExhausted(false);
    await reloadFromServer({ preserveDraft: true });
  }, [createScheduledSave, dataRef, editSeqRef, getDataRef, reloadFromServer]);

  useEffect(() => {
    // A durable save receipt acknowledges the edit: clear the watchdog.
    const offSuccess = eventBus.on('saveSuccess', clearWatchdog);
    // An edit was dropped on the null-data path: surface it immediately.
    const offLost = eventBus.on('lostEdit', () => armWatchdog('lost-edit'));
    return () => {
      offSuccess();
      offLost();
      if (watchdogTimer.current) {
        clearTimeout(watchdogTimer.current);
        watchdogTimer.current = null;
      }
    };
  }, [armWatchdog, clearWatchdog, eventBus]);

  useEffect(() => {
    isConflictExhaustedRef.current = isConflictExhausted;
  }, [isConflictExhausted]);

  useEffect(() => {
    if (!persistenceEnabled) rejectFlushWaiters(new Error('Durable timeline persistence is unavailable.'));
  }, [persistenceEnabled, rejectFlushWaiters]);

  useEffect(() => {
    const remaining: typeof flushWaitersRef.current = [];
    for (const waiter of flushWaitersRef.current) {
      if (waiter.session === session) remaining.push(waiter);
      else waiter.reject(waiter.typed ? makeBarrierError(waiter.target, new Error('Timeline session replaced before durable acknowledgement.')) : new Error('Timeline session replaced before durable acknowledgement.'));
    }
    flushWaitersRef.current = remaining;
    if (errorRetrySessionRef.current && errorRetrySessionRef.current !== session) clearErrorRetry();
    if (latestScheduledSaveRef.current?.session !== session && saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingSaveRef.current?.session !== session) pendingSaveRef.current = null;
    if (deferredSaveRef.current?.save.session !== session) deferredSaveRef.current = null;
  }, [clearErrorRetry, makeBarrierError, session]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      // Without this the transport-retry chain outlives the editor: the timer is
      // this hook's, but nothing else stops the doSave -> retry -> doSave loop.
      isMountedRef.current = false;
      clearErrorRetry();
      rejectFlushWaiters(new Error('Timeline closed before durable acknowledgement.'));
      const hadPendingSave = Boolean(saveTimer.current || deferredSaveRef.current);
      const deferred = deferredSaveRef.current;
      deferredSaveRef.current = null;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (hadPendingSave) {
        // A navigation can unmount the editor before the debounce fires, or
        // while a drag has deferred its save. Flush the latest pending payload
        // so neither path silently loses the final edit.
        // `doSave` bypasses the interaction gate because the editor is closing;
        // transport retries remain mounted-gated by isMountedRef.
        const pendingSave = deferred?.save ?? latestScheduledSaveRef.current;
        if (pendingSave) {
          void doSaveRef.current?.(pendingSave);
        }
      }
    };
  }, [clearErrorRetry, dataRef, editSeqRef, rejectFlushWaiters]);

  return {
    scheduleSave,
    resumeDeferredRecoverySave,
    clearDeferredRecoverySave,
    flushPendingSave,
    captureSaveTarget,
    flushSaveTarget,
    discardUncommittedSaveTarget,
    saveStatus,
    isConflictExhausted,
    schemaIncompatible,
    reloadFromServer,
    retrySaveAfterConflict,
    isSavingRef,
    isConflictExhaustedRef,
    watchdogTripped,
    watchdogReason,
    retryWatchdog,
    canonicalReloadInProgressRef: reloadInProgressRef,
    /** Bundle from the last server reload; consumed downstream ([V2-B4]). */
    loadedBundleRef,
  };
}
