import type { TimelineApplyEdit, TimelineDataRef } from '../hooks/timeline-state-types.ts';
import { clampClipToMediaDuration } from './overhang.ts';
import { mediaEndTrimGestureCommands } from '../commands/semanticGestures.ts';

/** Shared production context-menu handler; one explicit trim intent. */
export function trimClipToMediaEnd(dataRef: TimelineDataRef, applyEdit: TimelineApplyEdit, clipId: string): void {
  const current = dataRef.current;
  if (!current) {
    return;
  }

  const clipMeta = current.meta[clipId];
  const assetKey = clipMeta?.asset;
  const assetEntry = assetKey ? current.registry.assets[assetKey] : undefined;
  if (!clipMeta || !assetEntry?.type?.startsWith('video') || typeof assetEntry.duration !== 'number') {
    return;
  }

  const sourceRow = current.rows.find((row) => row.actions.some((action) => action.id === clipId));
  const sourceAction = sourceRow?.actions.find((action) => action.id === clipId);
  if (!sourceRow || !sourceAction) {
    return;
  }

  const clamped = clampClipToMediaDuration({
    action: sourceAction,
    clipMeta,
    sourceDurationSeconds: assetEntry.duration,
  });
  if (!clamped) {
    return;
  }

  applyEdit({
    type: 'rows',
    rows: current.rows.map((row) => {
      if (row.id !== sourceRow.id) {
        return row;
      }

      return {
        ...row,
        actions: row.actions.map((action) => (
          action.id === clipId ? clamped.nextAction : action
        )),
      };
    }),
    metaUpdates: {
      [clipId]: clamped.metaPatch,
    },
  }, {
    selectedClipId: clipId,
    selectedTrackId: clipMeta.track,
    semantic: true,
    editCommands: mediaEndTrimGestureCommands(current, clipId, clamped.metaPatch.to!),
  });
}
