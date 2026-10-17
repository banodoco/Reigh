import { applyManualTextWrites } from '../commands/manualText.ts';
import { isManualTextBatch, isManualTextCreation, isManualTextInverse } from '../commands/manualTextHistory.ts';
import { isFadeHistoryBatch, isFadeHistoryInverse } from '../commands/fadeHistory.ts';
import { isClipLookStyleInverse } from '../commands/clipLookStyleHistory.ts';
import { isClipParamsHistoryBatch, isClipParamsHistoryInverse } from '../commands/clipParamsHistory.ts';
import { isTransitionAssignmentBatch, isTransitionAssignmentInverse } from '../commands/transitionAssignmentHistory.ts';
import { isTrackHistoryBatch, isTrackHistoryInverse } from '../commands/trackHistory.ts';
import { isSelectedMediaCreation, isClipStructureBatch, isClipStructureInverse } from '../commands/clipStructureHistory.ts';
import { isClipPlacementBatch, isClipPlacementInverse } from '../commands/clipPlacementHistory.ts';
import { isTranscriptCaptionBatch } from '../commands/transcriptCaptions.ts';
import { isTranscriptCaptionInverse } from '../commands/transcriptCaptionHistory.ts';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  createTimelineCommandRunner,
  MEDIA_COMMAND_DESCRIPTORS,
  type AddMediaCommand,
  type PlacePreparedMediaCommand,
  type SwapMediaCommand,
  type TimelineCommandHistoryMetadata,
} from '@/tools/video-editor/commands/index.ts';
import type { TimelineEventBus } from './useTimelineEventBus.ts';
import { isAssetRegistrationInverse } from '../commands/assetRegistration.ts';
import { isTiedHoldExpansionCommand, isTiedHoldExpansionInverse } from '../commands/tiedHoldExpansionHistory.ts';
import { isOverlapTrimBatch, isOverlapTrimInverse } from '../commands/overlapTrimHistory.ts';
import { gestureCommandsFor } from '../commands/semanticGestures.ts';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { isDataProviderPersistenceEnabled } from '@/tools/video-editor/data/DataProvider.ts';
import type {
  CommandHistoryCommitMetadata,
  CommitDataOptions,
  CommitHistoryOptions,
} from '@/tools/video-editor/hooks/useTimelineCommit.ts';
import {
  isInteractionActive,
  type InteractionStateRef,
} from '@/tools/video-editor/lib/interaction-state.ts';
import {
  buildDataFromCurrentRegistry,
  buildDataFromSnapshot,
} from '@/tools/video-editor/lib/timeline-save-utils.ts';
import { preserveUploadingClips, type TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { TimelineConfig } from '@/tools/video-editor/types/index.ts';
import type { TimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';
import type {
  Checkpoint,
  CheckpointTriggerType,
  UndoEntry,
  UndoSnapshot,
} from '@/tools/video-editor/types/history.ts';
import type { CanonicalShotCompositionHistoryEntry } from '@/tools/video-editor/data/shotCompositionAdapter.ts';

const UNDO_STACK_LIMIT = 100;
const CHECKPOINT_LIMIT = 30;
const CHECKPOINT_RETENTION_MS = 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 5 * 60 * 1000;
const EDIT_DISTANCE_CHECKPOINT_THRESHOLD = 30;
const UNTRANSACTED_COLLAPSE_WINDOW_MS = 300;
const historyCommandRunner = createTimelineCommandRunner<AddMediaCommand | PlacePreparedMediaCommand | SwapMediaCommand>(MEDIA_COMMAND_DESCRIPTORS);

export interface UseTimelineHistoryArgs {
  eventBus?: TimelineEventBus;
  dataRef: MutableRefObject<TimelineData | null>;
  commitData: (nextData: TimelineData, options?: CommitDataOptions) => void;
  interactionStateRef: InteractionStateRef;
  /**
   * In-flight upload counter (drops, asset panel uploads). While it is > 0,
   * undo/redo are paused: a history snapshot's registry predates the upload's
   * `patchRegistry` (which is save:false/no-history), so restoring one
   * mid-upload would strand the upload — delete its skeleton clip and its
   * registry patch, leaving an orphaned asset. `preserveUploadingClips`
   * protects the skeleton but nothing can rebase the registry, so the safe
   * semantics is to wait out the window.
   */
  pendingOpsRef: MutableRefObject<number>;
  editability?: TimelineEditability;
}

export interface UseTimelineHistoryResult {
  canUndo: boolean;
  canRedo: boolean;
  /** True while undo/redo are paused because media uploads are in flight. */
  historyPausedForUploads: boolean;
  checkpoints: Checkpoint[];
  canonicalHistory: readonly CanonicalShotCompositionHistoryEntry[];
  canonicalHistorySupported: boolean;
  canonicalHistoryError: string | null;
  refreshCanonicalHistory: () => Promise<void>;
  restoringCanonicalRevisionId: string | null;
  restoreCanonicalRevision: (revisionId: string) => Promise<void>;
  onBeforeCommit: (currentData: TimelineData, options: CommitHistoryOptions) => void;
  onRemoteData: (currentData: TimelineData, nextData: TimelineData) => void;
  undo: () => void;
  redo: () => void;
  jumpToCheckpoint: (checkpointId: string) => void;
  createManualCheckpoint: (label?: string) => Promise<void>;
  createCheckpoint: (label?: string) => Promise<void>;
}

function cloneConfig(config: TimelineConfig): TimelineConfig {
  return structuredClone(config);
}

function buildSnapshot(currentData: TimelineData): UndoSnapshot {
  return {
    config: cloneConfig(currentData.config),
    registry: structuredClone(currentData.registry),
    signature: currentData.signature,
  };
}

function isCheckpointFresh(checkpoint: Checkpoint, now: number): boolean {
  return now - new Date(checkpoint.createdAt).getTime() <= CHECKPOINT_RETENTION_MS;
}

function trimCheckpoints(checkpoints: Checkpoint[], now = Date.now()): Checkpoint[] {
  const manual = checkpoints.filter((c) => c.triggerType === 'manual');
  const auto = checkpoints
    .filter((c) => c.triggerType !== 'manual' && isCheckpointFresh(c, now))
    .slice(0, CHECKPOINT_LIMIT);
  return [...manual, ...auto].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function defaultCheckpointLabel(triggerType: CheckpointTriggerType): string {
  switch (triggerType) {
    case 'session_boundary':
      return 'Session checkpoint';
    case 'edit_distance':
      return 'Auto checkpoint';
    case 'semantic':
      return 'Before destructive edit';
    case 'manual':
      return 'Manual checkpoint';
  }
}

const buildCommandHistoryEntry = (
  commandHistory: CommandHistoryCommitMetadata | undefined,
) => {
  if (
    !commandHistory
    || commandHistory.history.strategy !== 'inverse_transaction'
    || commandHistory.history.inverseTransaction === null
    || commandHistory.history.inverseTransaction.commands.length === 0
    || commandHistory.transaction.commands.length === 0
  ) {
    return undefined;
  }

  return {
    history: {
      ...commandHistory.history,
      inverseTransaction: structuredClone(commandHistory.history.inverseTransaction),
    },
    undoTransaction: structuredClone(commandHistory.history.inverseTransaction),
    redoTransaction: structuredClone(commandHistory.transaction),
  };
};

const mergeCommandHistoryMetadata = (
  previous: TimelineCommandHistoryMetadata,
  next: TimelineCommandHistoryMetadata,
  undoTransaction: NonNullable<UndoEntry['command']>['undoTransaction'],
): TimelineCommandHistoryMetadata => ({
  ...next,
  commandTypes: [...previous.commandTypes, ...next.commandTypes],
  commandIds: [...previous.commandIds, ...next.commandIds],
  inverseTransaction: structuredClone(undoTransaction),
  appliedCount: previous.appliedCount + next.appliedCount,
  failedCount: previous.failedCount + next.failedCount,
  partial: previous.partial || next.partial,
});

const mergeCollapsedEntry = (
  previous: UndoEntry,
  next: UndoEntry,
): UndoEntry => {
  if (!previous.command || !next.command) {
    return previous.command
      ? { ...previous, command: undefined }
      : previous;
  }

  const undoTransaction = {
    ...(next.command.undoTransaction.transactionId
      ? { transactionId: next.command.undoTransaction.transactionId }
      : previous.command.undoTransaction.transactionId
        ? { transactionId: previous.command.undoTransaction.transactionId }
        : {}),
    commands: [
      ...next.command.undoTransaction.commands,
      ...previous.command.undoTransaction.commands,
    ],
  };
  const redoTransaction = {
    ...(previous.command.redoTransaction.transactionId
      ? { transactionId: previous.command.redoTransaction.transactionId }
      : next.command.redoTransaction.transactionId
        ? { transactionId: next.command.redoTransaction.transactionId }
        : {}),
    commands: [
      ...previous.command.redoTransaction.commands,
      ...next.command.redoTransaction.commands,
    ],
  };

  return {
    ...previous,
    command: {
      history: mergeCommandHistoryMetadata(previous.command.history, next.command.history, undoTransaction),
      undoTransaction,
      redoTransaction,
    },
  };
};

export function useTimelineHistory({
  eventBus,
  dataRef,
  commitData,
  interactionStateRef,
  pendingOpsRef,
  editability,
}: UseTimelineHistoryArgs): UseTimelineHistoryResult {
  const { provider, timelineId, project, toast } = useVideoEditorRuntime();
  const historyProjectId = project.projectId;
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const lastEditTimestampRef = useRef<number | null>(null);
  const editsSinceLastCheckpointRef = useRef(0);
  const lastUntransactedEditAtRef = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [canonicalHistory, setCanonicalHistory] = useState<readonly CanonicalShotCompositionHistoryEntry[]>([]);
  const [canonicalHistoryError, setCanonicalHistoryError] = useState<string | null>(null);
  const [restoringCanonicalRevisionId, setRestoringCanonicalRevisionId] = useState<string | null>(null);
  const canonicalHistoryRequestRef = useRef(0);
  const canonicalHistorySupported = Boolean(provider.shotComposition?.listHistory && provider.shotComposition?.restoreHistory);

  const syncHistoryState = useCallback(() => {
    const pendingNative = [...undoStackRef.current, ...redoStackRef.current]
      .some((entry) => entry.nativeRegistration && !entry.nativeRegistration.inverse);
    const nextCanUndo = !pendingNative && undoStackRef.current.length > 0;
    const nextCanRedo = !pendingNative && redoStackRef.current.length > 0;
    setCanUndo((current) => (current === nextCanUndo ? current : nextCanUndo));
    setCanRedo((current) => (current === nextCanRedo ? current : nextCanRedo));
  }, []);

  useEffect(() => eventBus?.on('nativeRegistrationAccepted', (owner, inverse) => {
    if (inverse === null) {
      // A no-change receipt creates no publication to undo. Remove only its exact owner.
      undoStackRef.current = undoStackRef.current.filter((entry) => entry.nativeRegistration?.owner !== owner);
      redoStackRef.current = redoStackRef.current.filter((entry) => entry.nativeRegistration?.owner !== owner);
      syncHistoryState();
      return;
    }
    if (!isTransitionAssignmentInverse(inverse) && !isAssetRegistrationInverse(inverse) && !isOverlapTrimInverse(inverse) && !isTiedHoldExpansionInverse(inverse) && !isTranscriptCaptionInverse(inverse) && !isClipPlacementInverse(inverse) && !isClipStructureInverse(inverse) && !isTrackHistoryInverse(inverse) && !isFadeHistoryInverse(inverse) && !isClipLookStyleInverse(inverse) && !isClipParamsHistoryInverse(inverse) && !isManualTextInverse(inverse)) return;
    for (const entry of [...undoStackRef.current, ...redoStackRef.current]) {
      if (entry.nativeRegistration?.owner === owner) entry.nativeRegistration.inverse = structuredClone(inverse);
    }
    syncHistoryState();
  }), [eventBus, syncHistoryState]);

  const appendCheckpoint = useCallback((checkpoint: Checkpoint) => {
    setCheckpoints((current) => {
      const deduped = [checkpoint, ...current.filter((entry) => entry.id !== checkpoint.id)];
      return trimCheckpoints(deduped);
    });
  }, []);

  const clearRedoStack = useCallback(() => {
    if (redoStackRef.current.length === 0) {
      return;
    }

    redoStackRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const persistCheckpoint = useCallback(async (
    currentData: TimelineData,
    triggerType: CheckpointTriggerType,
    editsSinceLastCheckpoint: number,
    label?: string,
  ) => {
    if (!isDataProviderPersistenceEnabled(provider) || !provider.saveCheckpoint) {
      return;
    }

    const createdAt = new Date().toISOString();
    const checkpointInput = {
      timelineId,
      config: cloneConfig(currentData.config),
      createdAt,
      triggerType,
      label: label?.trim() || defaultCheckpointLabel(triggerType),
      editsSinceLastCheckpoint,
    };

    try {
      const checkpointId = await provider.saveCheckpoint(timelineId, checkpointInput);
      appendCheckpoint({
        id: checkpointId,
        ...checkpointInput,
      });
    } catch {
      // Checkpoint persistence is best-effort and should not interrupt editing.
    }
  }, [appendCheckpoint, provider, timelineId]);

  const applyHistoryEntry = useCallback((
    current: TimelineData,
    entry: UndoEntry,
    direction: 'undo' | 'redo',
  ) => {
    if (entry.command) {
      const transaction = direction === 'undo'
        ? entry.command.undoTransaction
        : entry.command.redoTransaction;
      const result = historyCommandRunner.apply(current, transaction);
      if (result.status === 'ok') {
        return result.nextData;
      }
    }

    const nextConfig = cloneConfig(entry.snapshot.config);
    return entry.snapshot.registry
      ? buildDataFromSnapshot(nextConfig, entry.snapshot.registry, current)
      : buildDataFromCurrentRegistry(nextConfig, current);
  }, []);

  const restoreHistoryEntry = useCallback((entry: UndoEntry, direction: 'undo' | 'redo') => {
    const current = dataRef.current;
    if (!current) {
      return false;
    }

    // Native registration history is owned by the accepted Runtime receipt.
    // Never turn an unacknowledged edit or missing receipt into a snapshot publication.
    const inverse = entry.nativeRegistration?.inverse;
    if (entry.nativeRegistration && !inverse) return false;
    const textClips = isManualTextInverse(inverse) ? applyManualTextWrites(current.config.clips, inverse.args.writes) : undefined;
    const nextData = textClips ? buildDataFromCurrentRegistry({ ...current.config, clips: textClips }, current) : entry.nativeRegistration && (isTransitionAssignmentInverse(inverse) || isOverlapTrimInverse(inverse) || isTiedHoldExpansionInverse(inverse) || isTranscriptCaptionInverse(inverse) || isClipPlacementInverse(inverse) || isClipStructureInverse(inverse) || isTrackHistoryInverse(inverse) || isFadeHistoryInverse(inverse) || isClipLookStyleInverse(inverse) || isClipParamsHistoryInverse(inverse) || isManualTextInverse(inverse))
      ? { ...current } : preserveUploadingClips(current, applyHistoryEntry(current, entry, direction));
    const transitionReplay = entry.nativeRegistration?.transitionReplay;
    const mediaReplay = entry.nativeRegistration?.mediaReplay;
    const reorderReplay = entry.nativeRegistration?.reorderReplay;
    const paramsReplay = entry.nativeRegistration?.paramsReplay;
    const replay = mediaReplay ?? reorderReplay;
    const historyCommands = direction === 'redo' && paramsReplay ? structuredClone(paramsReplay)
      : direction === 'redo' && transitionReplay ? structuredClone(transitionReplay)
      : direction === 'redo' && replay ? [structuredClone(replay)] : inverse ? [inverse] : undefined;
    if (entry.nativeRegistration) entry.nativeRegistration = { owner: nextData, ...(transitionReplay ? { transitionReplay } : {}), ...(mediaReplay ? { mediaReplay } : {}), ...(reorderReplay ? { reorderReplay } : {}), ...(paramsReplay ? { paramsReplay } : {}) };
    // Same protection every applyEdit path has: history snapshots never contain
    // transient `uploading-*` skeletons (rowsToConfig drops them from config),
    // so a restore during an in-flight upload would silently delete the
    // upload's placeholder. Carry it over from the live rows instead.
    commitData(
      nextData,
      { save: true, skipHistory: true, ...(historyCommands ? { editCommands: historyCommands } : {}) },
    );
    lastEditTimestampRef.current = Date.now();
    lastUntransactedEditAtRef.current = null;
    return true;
  }, [applyHistoryEntry, commitData, dataRef]);

  const pushUndoEntry = useCallback((entry: UndoEntry) => {
    undoStackRef.current = [...undoStackRef.current, entry].slice(-UNDO_STACK_LIMIT);
    syncHistoryState();
  }, [syncHistoryState]);

  const onBeforeCommit = useCallback((currentData: TimelineData, options: CommitHistoryOptions) => {
    const now = Date.now();
    const topUndoEntry = undoStackRef.current[undoStackRef.current.length - 1] ?? null;
    const hasMatchingTransaction = Boolean(
      options.transactionId
      && topUndoEntry?.transactionId
      && topUndoEntry.transactionId === options.transactionId,
    );
    const isDebouncedUntransactedEdit = Boolean(
      !options.transactionId
      && !topUndoEntry?.transactionId
      && lastUntransactedEditAtRef.current !== null
      && now - lastUntransactedEditAtRef.current <= UNTRANSACTED_COLLAPSE_WINDOW_MS,
    );
    const isSessionBoundary = Boolean(
      lastEditTimestampRef.current !== null
      && now - lastEditTimestampRef.current > SESSION_IDLE_MS,
    );
    const shouldCreateDistanceCheckpoint =
      editsSinceLastCheckpointRef.current >= EDIT_DISTANCE_CHECKPOINT_THRESHOLD;

    let checkpointTrigger: CheckpointTriggerType | null = null;
    if (isSessionBoundary) {
      checkpointTrigger = 'session_boundary';
    } else if (options.semantic) {
      checkpointTrigger = 'semantic';
    } else if (shouldCreateDistanceCheckpoint) {
      checkpointTrigger = 'edit_distance';
    }

    if (checkpointTrigger) {
      void persistCheckpoint(
        currentData,
        checkpointTrigger,
        editsSinceLastCheckpointRef.current,
      );
      editsSinceLastCheckpointRef.current = 1;
    } else {
      editsSinceLastCheckpointRef.current += 1;
    }

    clearRedoStack();

    const commands = options.nativeRegistrationOwner && gestureCommandsFor(options.nativeRegistrationOwner);
    const transitionReplay = commands && isTransitionAssignmentBatch(commands) ? structuredClone([...commands]) : undefined;
    const mediaReplay = commands?.length === 1 && isSelectedMediaCreation(commands[0]) ? structuredClone(commands[0]) : undefined;
    const reorderReplay = commands?.length === 1 && commands[0].op === 'timeline.reorder' && isTrackHistoryBatch(commands)
      ? structuredClone(commands[0]) : undefined;
    const paramsReplay = commands && isClipParamsHistoryBatch(commands) ? structuredClone([...commands]) : undefined;
    const nextEntry: UndoEntry = {
      snapshot: buildSnapshot(currentData),
      timestamp: new Date(now).toISOString(),
      transactionId: options.transactionId,
      command: buildCommandHistoryEntry(options.commandHistory),
      ...(options.nativeRegistrationOwner ? { nativeRegistration: { owner: options.nativeRegistrationOwner, ...(transitionReplay ? { transitionReplay } : {}), ...(mediaReplay ? { mediaReplay } : {}), ...(reorderReplay ? { reorderReplay } : {}), ...(paramsReplay ? { paramsReplay } : {}) } } : {}),
    };

    if (!options.nativeRegistrationOwner && !topUndoEntry?.nativeRegistration
      && (hasMatchingTransaction || isDebouncedUntransactedEdit)) {
      if (topUndoEntry) {
        undoStackRef.current = [
          ...undoStackRef.current.slice(0, -1),
          mergeCollapsedEntry(topUndoEntry, nextEntry),
        ];
      }
    } else {
      pushUndoEntry(nextEntry);
    }

    lastEditTimestampRef.current = now;
    if (!options.transactionId) {
      lastUntransactedEditAtRef.current = now;
    } else {
      lastUntransactedEditAtRef.current = null;
    }
  }, [clearRedoStack, persistCheckpoint, pushUndoEntry]);

  /**
   * Server-authoritative data replaced local state (accepted poll, conflict
   * reload, registry refresh). Every stacked snapshot predates that boundary:
   * restoring one would revert the remote client's persisted work and save the
   * result — silent multi-client data loss with both UIs reading "saved".
   * Rebasing snapshots over remote changes is a merge problem this history
   * model does not attempt, so the safe semantics is to invalidate the stacks
   * at the boundary. Echoes (same stableSignature, e.g. a URL re-resolution
   * refresh) keep the stacks.
   */
  const onRemoteData = useCallback((currentData: TimelineData, nextData: TimelineData) => {
    if (currentData.stableSignature === nextData.stableSignature) {
      return;
    }

    if (undoStackRef.current.length === 0 && redoStackRef.current.length === 0) {
      return;
    }

    // These relation edits have no optimistic snapshot to restore. Their native
    // inverses carry Runtime expectations and remain safe over a poll
    // or another head: Runtime alone accepts or refuses that inverse.
    const nativeRelation = (entry: UndoEntry) => {
      const nativeCommands = entry.nativeRegistration && gestureCommandsFor(entry.nativeRegistration.owner);
      const command = nativeCommands?.[0];
      return isManualTextBatch(nativeCommands ?? []) || isManualTextCreation(nativeCommands ?? []) || isManualTextInverse(command) || isManualTextInverse(entry.nativeRegistration?.inverse) || isTransitionAssignmentBatch(nativeCommands ?? []) || isTransitionAssignmentInverse(command) || isTransitionAssignmentInverse(entry.nativeRegistration?.inverse) || isClipParamsHistoryBatch(nativeCommands ?? []) || isClipParamsHistoryInverse(command) || isClipParamsHistoryInverse(entry.nativeRegistration?.inverse) || isFadeHistoryBatch(nativeCommands ?? []) || isFadeHistoryInverse(command) || isFadeHistoryInverse(entry.nativeRegistration?.inverse) || isTrackHistoryBatch(nativeCommands ?? []) || isTrackHistoryInverse(command) || isTrackHistoryInverse(entry.nativeRegistration?.inverse) || isClipStructureBatch(nativeCommands ?? []) || isClipStructureInverse(command) || isClipStructureInverse(entry.nativeRegistration?.inverse) || isClipPlacementBatch(nativeCommands ?? []) || isClipPlacementInverse(command) || isOverlapTrimBatch(nativeCommands ?? []) || isOverlapTrimInverse(command)
        || isTiedHoldExpansionCommand(command) || isTiedHoldExpansionInverse(command)
        || isTranscriptCaptionBatch(nativeCommands ?? []) || isTranscriptCaptionInverse(command)
        || isTranscriptCaptionInverse(entry.nativeRegistration?.inverse) || isClipPlacementInverse(entry.nativeRegistration?.inverse);
    };
    undoStackRef.current = undoStackRef.current.filter(nativeRelation);
    redoStackRef.current = redoStackRef.current.filter(nativeRelation);
    // A subsequent untransacted edit must start a fresh entry rather than try
    // to collapse into a top-of-stack entry that no longer exists.
    lastUntransactedEditAtRef.current = null;
    syncHistoryState();
  }, [syncHistoryState]);

  const undo = useCallback(() => {
    if ([...undoStackRef.current, ...redoStackRef.current]
      .some((entry) => entry.nativeRegistration && !entry.nativeRegistration.inverse)) return;
    if (editability?.checkTimeline && !editability.checkTimeline().allowed) return;
    if (pendingOpsRef.current > 0) {
      // Dev-only diagnostic (stripped in prod); the toolbar communicates the
      // pause to the user via disabled state + title.
      console.log('[TimelineHistory] undo ignored: paused while media uploads finish', {
        pendingOps: pendingOpsRef.current,
      });
      return;
    }

    const current = dataRef.current;
    const entry = undoStackRef.current[undoStackRef.current.length - 1];
    if (!current || !entry || isInteractionActive(interactionStateRef)) {
      return;
    }

    if (!restoreHistoryEntry(entry, 'undo')) {
      return;
    }

    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      ...redoStackRef.current,
      {
        ...entry,
        snapshot: buildSnapshot(current),
        timestamp: new Date().toISOString(),
      },
    ].slice(-UNDO_STACK_LIMIT);
    syncHistoryState();
  }, [dataRef, editability, interactionStateRef, pendingOpsRef, restoreHistoryEntry, syncHistoryState]);

  const redo = useCallback(() => {
    if ([...undoStackRef.current, ...redoStackRef.current]
      .some((entry) => entry.nativeRegistration && !entry.nativeRegistration.inverse)) return;
    if (editability?.checkTimeline && !editability.checkTimeline().allowed) return;
    if (pendingOpsRef.current > 0) {
      console.log('[TimelineHistory] redo ignored: paused while media uploads finish', {
        pendingOps: pendingOpsRef.current,
      });
      return;
    }

    const current = dataRef.current;
    const entry = redoStackRef.current[redoStackRef.current.length - 1];
    if (!current || !entry || isInteractionActive(interactionStateRef)) {
      return;
    }

    if (!restoreHistoryEntry(entry, 'redo')) {
      return;
    }

    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [
      ...undoStackRef.current,
      {
        ...entry,
        snapshot: buildSnapshot(current),
        timestamp: new Date().toISOString(),
      },
    ].slice(-UNDO_STACK_LIMIT);
    syncHistoryState();
  }, [dataRef, editability, interactionStateRef, pendingOpsRef, restoreHistoryEntry, syncHistoryState]);

  const jumpToCheckpoint = useCallback((checkpointId: string) => {
    if (editability?.checkTimeline && !editability.checkTimeline().allowed) return;
    const current = dataRef.current;
    const checkpoint = checkpoints.find((entry) => entry.id === checkpointId);
    if (!current || !checkpoint) {
      return;
    }

    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState();
    restoreHistoryEntry({
      snapshot: {
        config: cloneConfig(checkpoint.config),
        signature: checkpoint.id,
      },
      timestamp: new Date().toISOString(),
    }, 'undo');
    editsSinceLastCheckpointRef.current = 0;
  }, [checkpoints, dataRef, editability, restoreHistoryEntry, syncHistoryState]);

  const createManualCheckpoint = useCallback(async (label?: string) => {
    if (editability?.checkTimeline && !editability.checkTimeline().allowed) return;
    const current = dataRef.current;
    if (!current) {
      return;
    }

    await persistCheckpoint(
      current,
      'manual',
      editsSinceLastCheckpointRef.current,
      label,
    );
    editsSinceLastCheckpointRef.current = 0;
  }, [dataRef, editability, persistCheckpoint]);

  useEffect(() => {
    if (!isDataProviderPersistenceEnabled(provider) || !provider.loadCheckpoints) {
      return;
    }

    let cancelled = false;

    void provider.loadCheckpoints(timelineId)
      .then((loadedCheckpoints) => {
        if (cancelled) {
          return;
        }

        setCheckpoints(trimCheckpoints(loadedCheckpoints));
      })
      .catch(() => {
        if (!cancelled) {
          setCheckpoints([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provider, timelineId]);

  const refreshCanonicalHistory = useCallback(async () => {
    const requestId = ++canonicalHistoryRequestRef.current;
    const listHistory = provider.shotComposition?.listHistory;
    if (!listHistory || !timelineId || !historyProjectId) {
      setCanonicalHistory([]);
      setCanonicalHistoryError(null);
      return;
    }

    setCanonicalHistoryError(null);
    try {
      const entries = await listHistory({ projectId: historyProjectId, parentDocumentId: timelineId });
      if (requestId === canonicalHistoryRequestRef.current) setCanonicalHistory(entries);
    } catch (error: unknown) {
      if (requestId === canonicalHistoryRequestRef.current) {
        setCanonicalHistory([]);
        setCanonicalHistoryError(error instanceof Error ? error.message : String(error));
      }
    }
  }, [historyProjectId, provider, timelineId]);

  useEffect(() => {
    void refreshCanonicalHistory();
    return () => {
      canonicalHistoryRequestRef.current += 1;
    };
  }, [refreshCanonicalHistory]);

  const restoreCanonicalRevision = useCallback(async (revisionId: string) => {
    const restoreHistory = provider.shotComposition?.restoreHistory;
    if (!restoreHistory || !timelineId || !historyProjectId) return;
    if (editability?.checkTimeline && !editability.checkTimeline().allowed) return;
    if (pendingOpsRef.current > 0 || isInteractionActive(interactionStateRef)) {
      setCanonicalHistoryError('History restore is paused while an edit or media upload is active.');
      return;
    }

    setCanonicalHistoryError(null);
    setRestoringCanonicalRevisionId(revisionId);
    try {
      await restoreHistory({ projectId: historyProjectId, parentDocumentId: timelineId, revisionId });
      const entries = await provider.shotComposition?.listHistory?.({
        projectId: historyProjectId,
        parentDocumentId: timelineId,
      });
      if (entries) setCanonicalHistory(entries);
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryState();
      toast.success('Timeline history restored', { description: `Restored revision ${revisionId.slice(0, 16)}.` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setCanonicalHistoryError(message);
      toast.error('Could not restore timeline history', { description: message });
    } finally {
      setRestoringCanonicalRevisionId(null);
    }
  }, [editability, historyProjectId, interactionStateRef, pendingOpsRef, provider, syncHistoryState, timelineId, toast]);

  // Read at render time. Every pendingOps transition is bracketed by a data
  // commit (skeleton insert on increment; skeleton removal / failure cleanup
  // before the `finally` decrement), so the tree re-renders right after each
  // transition and this value cannot go stale for longer than that commit.
  const historyPausedForUploads = pendingOpsRef.current > 0;

  return {
    canUndo: canUndo && !historyPausedForUploads,
    canRedo: canRedo && !historyPausedForUploads,
    historyPausedForUploads,
    checkpoints,
    canonicalHistory,
    canonicalHistorySupported,
    canonicalHistoryError,
    refreshCanonicalHistory,
    restoringCanonicalRevisionId,
    restoreCanonicalRevision,
    onBeforeCommit,
    onRemoteData,
    undo,
    redo,
    jumpToCheckpoint,
    createManualCheckpoint,
    createCheckpoint: createManualCheckpoint,
  };
}
