import { rightResizeGestureCommands } from '../commands/semanticGestures.ts';
import type { ApplyEditOptions, TimelineEditMutation } from '../hooks/useTimelineCommit.ts';
import type { ClipMeta, TimelineData } from './timeline-data.ts';

/** Shared context-menu handler for both editor shells. */
export function expandTinyClip(
  dataRef: { current: TimelineData | null },
  applyEdit: (mutation: TimelineEditMutation, options?: ApplyEditOptions) => void,
  clipId: string,
): void {
  const current = dataRef.current;
  if (!current) return;
  const row = current.rows.find((candidate) => candidate.actions.some((action) => action.id === clipId));
  const action = row?.actions.find((candidate) => candidate.id === clipId);
  if (!row || !action || action.end - action.start >= 0.5) return;
  const clipMeta = current.meta[clipId];
  const metaUpdates: Record<string, Partial<ClipMeta>> = {};
  if (clipMeta && typeof clipMeta.hold === 'number') metaUpdates[clipId] = { hold: 0.5 };
  // Media changes and tied ends keep their existing explicit fallback; this
  // action has only the ordinary hold-duration command producer.
  const editCommands = typeof clipMeta?.hold === 'number'
    ? rightResizeGestureCommands(current, clipId, 0.5, {}) : undefined;
  applyEdit({
    type: 'rows',
    rows: current.rows.map((candidate) => candidate.id !== row.id ? candidate : {
      ...candidate,
      actions: candidate.actions.map((item) => item.id !== clipId ? item : { ...item, end: action.start + 0.5 }),
    }),
    ...(Object.keys(metaUpdates).length > 0 ? { metaUpdates } : {}),
  }, { editCommands });
}
