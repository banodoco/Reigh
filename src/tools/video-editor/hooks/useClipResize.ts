import { leftResizeGestureCommands, groupRightResizeGestureCommands, rightResizeGestureCommands, tiedEndResizeGesture, legacyTiedEndResizeGesture, overlapTrimGesture } from '../commands/semanticGestures.ts';
import { useCallback, useContext, useRef } from 'react';
import { VideoEditorRuntimeContext } from '../contexts/VideoEditorRuntimeContext.tsx';
import { buildRowTrackPatches } from '@/tools/video-editor/lib/coordinate-utils.ts';
import type {
  ClipEdgeResizeContext,
  ClipEdgeResizeUpdate,
  ResizeDir,
} from '@/tools/video-editor/lib/resize-math.ts';
import { getSourceTime, type ClipMeta, type TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { resolveOverlaps } from '@/tools/video-editor/lib/resolve-overlaps.ts';
import { snapToFrameGrid } from '@/tools/video-editor/lib/time-grid.ts';
import { ensureGroupContiguity } from '@/tools/video-editor/lib/shot-group-contiguity.ts';
import type { TimelineApplyEdit } from '@/tools/video-editor/hooks/timeline-state-types.ts';
import type { TrackKind } from '@/tools/video-editor/types/index.ts';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas.ts';
import { allowTimelineEdits, type TimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';

interface ResizeStartTarget {
  action: TimelineAction;
  row: TimelineRow;
  dir: ResizeDir;
}

export interface ClipEdgeResizeSession {
  pointerId: number;
  rowId: string;
  clipId: string;
  edge: ResizeDir;
  cursorOffsetPx: number;
  initialBoundaryTime: number;
  context: ClipEdgeResizeContext;
  siblingTimes: number[];
}

export interface ClipEdgeResizeEndTarget {
  session: ClipEdgeResizeSession;
  updates: ClipEdgeResizeUpdate[];
  cancelled: boolean;
}

interface ResizeStartState {
  start: number;
  from: number;
  to: number;
  speed: number;
  trackKind: TrackKind;
  assetDuration?: number;
}

export interface UseClipResizeArgs {
  dataRef: React.MutableRefObject<TimelineData | null>;
  applyEdit: TimelineApplyEdit;
  editability?: TimelineEditability;
  /** Explicit host/test capability; otherwise use the mounted provider. */
  semanticCommandSaving?: boolean;
}

export interface UseClipResizeResult {
  onActionResizeStart: (params: ResizeStartTarget) => void;
  onClipEdgeResizeEnd: (params: ClipEdgeResizeEndTarget) => void;
}

const getTrackKind = (
  current: TimelineData,
  rowId: string,
  fallbackTrackId?: string,
): TrackKind => {
  return current.tracks.find((track) => track.id === rowId)?.kind
    ?? current.tracks.find((track) => track.id === fallbackTrackId)?.kind
    ?? 'visual';
};

const getAssetDuration = (
  current: TimelineData,
  clipMeta: ClipMeta,
): number | undefined => {
  if (!clipMeta.asset) return undefined;
  return current.resolvedConfig.registry[clipMeta.asset]?.duration
    ?? current.registry.assets[clipMeta.asset]?.duration;
};

const getResolvedAction = (
  rows: TimelineRow[],
  rowId: string,
  actionId: string,
): TimelineAction | undefined => {
  return rows
    .find((candidate) => candidate.id === rowId)
    ?.actions.find((candidate) => candidate.id === actionId);
};

const getResizeStartState = (
  current: TimelineData,
  action: TimelineAction,
  rowId: string,
  clipMeta: ClipMeta,
): ResizeStartState => {
  const from = clipMeta.from ?? 0;
  const speed = clipMeta.speed ?? 1;
  return {
    start: action.start,
    from,
    to: getSourceTime({ from, start: action.start, speed }, action.end),
    speed,
    trackKind: getTrackKind(current, rowId, clipMeta.track),
    assetDuration: getAssetDuration(current, clipMeta),
  };
};

const mergeMetaUpdates = (
  ...patchSets: Array<Record<string, Partial<ClipMeta>>>
): Record<string, Partial<ClipMeta>> => {
  const merged: Record<string, Partial<ClipMeta>> = {};
  for (const patchSet of patchSets) {
    for (const [clipId, patch] of Object.entries(patchSet)) {
      merged[clipId] = { ...merged[clipId], ...patch };
    }
  }
  return merged;
};

function computeClipResizeMetaPatch(
  clipMeta: ClipMeta,
  origin: ResizeStartState,
  newStart: number,
  newEnd: number,
  dir: ResizeDir,
): Partial<ClipMeta> {
  const resolvedDuration = newEnd - newStart;
  if (resolvedDuration <= 0) return {};

  if (typeof clipMeta.hold === 'number') {
    return { hold: resolvedDuration };
  }

  if (origin.trackKind === 'visual') {
    if (dir === 'left') {
      const from = Math.max(0, origin.from + (newStart - origin.start) * origin.speed);
      return {
        from,
        to: origin.to,
        speed: (origin.to - from) / resolvedDuration,
      };
    }
    return {
      from: origin.from,
      to: origin.to,
      speed: (origin.to - origin.from) / resolvedDuration,
    };
  }

  const from = Math.max(0, origin.from + (newStart - origin.start) * origin.speed);
  const unclampedTo = from + resolvedDuration * origin.speed;
  return {
    from,
    to: typeof origin.assetDuration === 'number'
      ? Math.min(origin.assetDuration, unclampedTo)
      : unclampedTo,
  };
}

const applyActionUpdates = (
  rows: TimelineRow[],
  rowId: string,
  updates: ClipEdgeResizeUpdate[],
): TimelineRow[] => {
  const updatesByClipId = new Map(updates.map((update) => [update.clipId, update]));
  return rows.map((row) => {
    if (row.id !== rowId) return row;
    return {
      ...row,
      actions: row.actions.map((action) => {
        const update = updatesByClipId.get(action.id);
        return update ? { ...action, start: update.start, end: update.end } : action;
      }),
    };
  });
};

const getUpdateByClipId = (
  updates: ClipEdgeResizeUpdate[],
  clipId: string,
): ClipEdgeResizeUpdate | undefined => updates.find((update) => update.clipId === clipId);

const getResizeOrigin = (
  current: TimelineData,
  resizeStartRef: Record<string, ResizeStartState>,
  rowId: string,
  clipId: string,
): { action: TimelineAction; clipMeta: ClipMeta; origin: ResizeStartState } | null => {
  const action = getResolvedAction(current.rows, rowId, clipId);
  const clipMeta = current.meta[clipId];
  if (!action || !clipMeta) {
    return null;
  }

  return {
    action,
    clipMeta,
    origin: resizeStartRef[clipId] ?? getResizeStartState(current, action, rowId, clipMeta),
  };
};

export function useClipResize({
  dataRef,
  applyEdit,
  editability = allowTimelineEdits,
  semanticCommandSaving,
}: UseClipResizeArgs): UseClipResizeResult {
  const runtime = useContext(VideoEditorRuntimeContext);
  const semanticEndChoices = semanticCommandSaving ?? runtime?.provider.semanticCommandSaving === true;
  const resizeStartRef = useRef<Record<string, ResizeStartState>>({});
  const resizeBaseRef = useRef<Record<string, { config: string; head: string; fps: number }>>({});
  const resizeTransactionIdRef = useRef<Record<string, string>>({});

  const clearResizeTracking = useCallback((clipId: string) => {
    delete resizeStartRef.current[clipId];
    delete resizeBaseRef.current[clipId];
    delete resizeTransactionIdRef.current[clipId];
  }, []);

  const onActionResizeStart = useCallback(({ action, row, dir }: ResizeStartTarget) => {
    if (action.id.startsWith('uploading-')) return;
    const current = dataRef.current;
    if (current && !editability.check({ clipId: action.id, sourceTrackId: row.id, targetTrackId: row.id }).allowed) return;
    const clipMeta = current?.meta[action.id];
    if (current) resizeBaseRef.current[action.id] = { config: JSON.stringify(current.config),
      head: JSON.stringify(current.head), fps: current.output.fps };
    if (!current || !clipMeta || typeof clipMeta.hold === 'number') {
      resizeTransactionIdRef.current[action.id] = crypto.randomUUID();
      if (current && clipMeta) {
        resizeStartRef.current[action.id] = {
          start: action.start,
          from: 0,
          to: action.end - action.start,
          speed: 1,
          trackKind: getTrackKind(current, row.id, clipMeta.track),
        };
      }
      return;
    }

    resizeStartRef.current[action.id] = getResizeStartState(current, action, row.id, clipMeta);
    resizeTransactionIdRef.current[action.id] = crypto.randomUUID();
    void dir;
  }, [dataRef, editability]);

  const onClipEdgeResizeEnd = useCallback(({
    session,
    updates,
    cancelled,
  }: ClipEdgeResizeEndTarget) => {
    if (session.clipId.startsWith('uploading-')) {
      clearResizeTracking(session.clipId);
      return;
    }
    const current = dataRef.current;
    if (!current) {
      clearResizeTracking(session.clipId);
      return;
    }
    if (!editability.check({ clipId: session.clipId, sourceTrackId: session.rowId, targetTrackId: session.rowId }).allowed) {
      clearResizeTracking(session.clipId);
      return;
    }

    const transactionId = resizeTransactionIdRef.current[session.clipId] ?? crypto.randomUUID();
    if (cancelled) {
      clearResizeTracking(session.clipId);
      return;
    }

    // The gesture layer hands over raw pixel-derived times. Snap them to the
    // frame grid *before* deriving `from`/`to`/`speed` below, so the media
    // trim math starts from the same grid instants the commit funnel persists
    // (policy: `lib/time-grid.ts`).
    const fps = current.output.fps;
    const snappedUpdates = updates.map((update) => ({
      ...update,
      start: snapToFrameGrid(update.start, fps),
      end: snapToFrameGrid(update.end, fps),
    }));

    const primaryUpdate = getUpdateByClipId(snappedUpdates, session.clipId);
    const primary = getResizeOrigin(current, resizeStartRef.current, session.rowId, session.clipId);
    if (!primaryUpdate || !primary) {
      clearResizeTracking(session.clipId);
      return;
    }

    const multiRightOverlap = semanticEndChoices && session.edge === 'right'
      && (current.rows.find((row) => row.id === session.rowId)?.actions.filter((other) =>
        other.id !== session.clipId && primaryUpdate.start < other.end && primaryUpdate.end > other.start).length ?? 0) > 1;
    if (multiRightOverlap && (session.context.kind === 'group' || snappedUpdates.length !== 1)) {
      clearResizeTracking(session.clipId);
      return;
    }

    // Left overlap commands use the requested frame delta, before legacy geometry
    // clamping. Unsupported overlap cases retain the no-command refusal.
    if (semanticEndChoices && session.edge === 'left' && current.rows.find((row) => row.id === session.rowId)?.actions.some(
      (other) => other.id !== session.clipId && primaryUpdate.start < other.end && primaryUpdate.end > other.start)) {
      const captured = resizeBaseRef.current[session.clipId];
      const isCapturedBase = () => captured && captured.config === JSON.stringify(dataRef.current?.config)
        && captured.head === JSON.stringify(dataRef.current?.head) && captured.fps === dataRef.current?.output.fps;
      if (session.context.kind !== 'group' && snappedUpdates.length === 1 && isCapturedBase()) {
        const overlap = overlapTrimGesture(current, session.clipId, session.rowId, primaryUpdate.start, primaryUpdate.end, primaryUpdate.end, 'left');
        if (overlap && isCapturedBase()) applyEdit({ type: 'commands' }, {
          transactionId, semantic: true, editCommands: overlap.commands,
        });
      }
      clearResizeTracking(session.clipId);
      return;
    }

    if (session.context.kind === 'group') {
      const updatedRows = applyActionUpdates(current.rows, session.rowId, snappedUpdates);
      let nextRows = ensureGroupContiguity(updatedRows, current.config.pinnedShotGroups);

      // Resolve overlaps between group clips and non-group siblings on the same row.
      // The resized group clip may extend into non-group clips; resolveOverlaps trims it to fit.
      const groupClipIds = new Set(session.context.groupClipIds);
      let overlapMetaPatches: Record<string, Partial<ClipMeta>> = {};
      for (const update of snappedUpdates) {
        if (!groupClipIds.has(update.clipId)) continue;
        const { rows: resolved, metaPatches } = resolveOverlaps(
          nextRows,
          session.rowId,
          update.clipId,
          current.meta,
        );
        nextRows = resolved;
        overlapMetaPatches = { ...overlapMetaPatches, ...metaPatches };
      }

      const perClipMetaUpdates: Record<string, Partial<ClipMeta>> = {};
      for (const update of snappedUpdates) {
        const clip = getResizeOrigin(current, resizeStartRef.current, session.rowId, update.clipId);
        if (!clip) {
          continue;
        }
        // Use resolved positions for meta calculation
        const resolvedAction = getResolvedAction(nextRows, session.rowId, update.clipId);
        const effectiveStart = resolvedAction?.start ?? update.start;
        const effectiveEnd = resolvedAction?.end ?? update.end;
        // The dragged clip is actually resized; other clips are just shifted
        const clipEdge = update.clipId === session.clipId ? session.edge : session.edge;
        perClipMetaUpdates[update.clipId] = {
          track: session.rowId,
          ...computeClipResizeMetaPatch(
            clip.clipMeta,
            clip.origin,
            effectiveStart,
            effectiveEnd,
            clipEdge,
          ),
        };
      }

      applyEdit({
        type: 'rows',
        rows: nextRows,
        metaUpdates: mergeMetaUpdates(
          {
            ...buildRowTrackPatches(nextRows),
          },
          overlapMetaPatches,
          perClipMetaUpdates,
        ),
      }, { transactionId,
        editCommands: session.edge === 'right' && Object.keys(overlapMetaPatches).length === 0
          ? groupRightResizeGestureCommands(current, session.context.groupClipIds, nextRows, perClipMetaUpdates)
          : undefined,
      });

      clearResizeTracking(session.clipId);
      return;
    }

    const nextRows = applyActionUpdates(current.rows, session.rowId, [primaryUpdate]);
    const { rows: resolvedRows, metaPatches: overlapPatches } = resolveOverlaps(
      nextRows,
      session.rowId,
      session.clipId,
      current.meta,
    );
    const resolvedAction = getResolvedAction(resolvedRows, session.rowId, session.clipId);
    const effectiveStart = resolvedAction?.start ?? primaryUpdate.start;
    const effectiveEnd = resolvedAction?.end ?? primaryUpdate.end;
    const primaryPatch = computeClipResizeMetaPatch(
      primary.clipMeta,
      primary.origin,
      effectiveStart,
      effectiveEnd,
      session.edge,
    );

    const captured = resizeBaseRef.current[session.clipId];
    if (semanticEndChoices && session.edge === 'right' && (multiRightOverlap || effectiveEnd !== primaryUpdate.end)) {
      const isCapturedBase = () => captured && captured.config === JSON.stringify(dataRef.current?.config)
        && captured.head === JSON.stringify(dataRef.current?.head) && captured.fps === dataRef.current?.output.fps;
      if (!isCapturedBase()) {
        clearResizeTracking(session.clipId);
        return;
      }
      const overlap = overlapTrimGesture(current, session.clipId, session.rowId, primaryUpdate.start, primaryUpdate.end, effectiveEnd);
      if (multiRightOverlap || overlap !== undefined) {
        // A prompt can yield to canonical head/permission updates. Recheck the
        // captured base before handing the sole transaction to the commit port.
        if (overlap && isCapturedBase()) applyEdit({ type: 'commands' }, {
          transactionId, semantic: true, editCommands: overlap.commands,
        });
        clearResizeTracking(session.clipId);
        return;
      }
    }
    if (semanticEndChoices && primary.clipMeta.app?.astrid && (primary.clipMeta.app.astrid as Record<string, unknown>).until
      && (!captured || captured.config !== JSON.stringify(current.config)
        || captured.head !== JSON.stringify(current.head) || captured.fps !== current.output.fps)) {
      clearResizeTracking(session.clipId);
      return;
    }
    const tiedEnd = session.edge === 'right' && effectiveStart === primary.origin.start
      ? (semanticEndChoices ? tiedEndResizeGesture : legacyTiedEndResizeGesture)(current, session.clipId, effectiveEnd - effectiveStart) : undefined;
    if (tiedEnd === null) {
      clearResizeTracking(session.clipId);
      return;
    }
    if (tiedEnd && semanticEndChoices) {
      // A relation can resolve beyond pointer geometry. Submit the chosen intent
      // atomically, retaining authored data until canonical poll/reload. Definite
      // refusal and uncertain transport cannot leave an optimistic partial trim.
      applyEdit({ type: 'commands' }, { transactionId, semantic: true, editCommands: tiedEnd.commands });
      clearResizeTracking(session.clipId);
      return;
    }

    const literalLeft = session.edge === 'left' && Object.keys(overlapPatches).length === 0
      ? leftResizeGestureCommands(current, session.clipId, effectiveStart, effectiveEnd, primaryPatch) : undefined;
    if (literalLeft && semanticEndChoices && (!captured || captured.config !== JSON.stringify(current.config)
      || captured.head !== JSON.stringify(current.head) || captured.fps !== current.output.fps)) {
      clearResizeTracking(session.clipId);
      return;
    }
    if (tiedEnd && 'astrid' in tiedEnd) primaryPatch.app = { ...primary.clipMeta.app, astrid: tiedEnd.astrid };
    applyEdit({
      type: 'rows',
      rows: resolvedRows,
      metaUpdates: mergeMetaUpdates(
        {
          ...buildRowTrackPatches(resolvedRows),
          [session.clipId]: { track: session.rowId, ...primaryPatch },
        },
        overlapPatches,
      ),
    }, {
      transactionId,
      editCommands: tiedEnd?.commands ?? literalLeft ?? (session.edge === 'right' && effectiveStart === primary.origin.start
        && Object.keys(overlapPatches).length === 0
        ? rightResizeGestureCommands(current, session.clipId, effectiveEnd - effectiveStart, primaryPatch)
        : undefined),
    });

    clearResizeTracking(session.clipId);
  }, [applyEdit, clearResizeTracking, dataRef, editability, semanticEndChoices]);

  return {
    onActionResizeStart,
    onClipEdgeResizeEnd,
  };
}
