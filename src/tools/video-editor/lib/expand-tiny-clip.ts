import { rightResizeGestureCommands, tiedEndResizeGesture, tinyMediaExpansionGestureCommands } from '../commands/semanticGestures.ts';
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
  // This menu action admits only an exact parent clip. Never reinterpret a
  // projected occurrence or an ambiguous row as a parent duration edit.
  const sources = current.config.clips.filter((clip) => clip.id === clipId);
  if (!clipId || clipId.startsWith('occurrence:') || /[/\s]/.test(clipId) || sources.length !== 1 || sources[0].app?.canonical
    || current.rows.flatMap((candidate) => candidate.actions).filter((item) => item.id === clipId).length !== 1) return;
  const row = current.rows.find((candidate) => candidate.actions.some((action) => action.id === clipId));
  const action = row?.actions.find((candidate) => candidate.id === clipId);
  if (!row || !action || !Number.isFinite(action.start) || !Number.isFinite(action.end)
    || action.end <= action.start || action.end - action.start >= 0.5) return;
  const source = sources[0];
  if (source.clipType === 'hold' && source.asset === undefined && source.from === undefined && source.to === undefined) {
    if ((source.app?.astrid as Record<string, unknown> | undefined)?.until
      && (!current.head?.projectId || !current.head.timelineId || !current.head.headRevisionId)) return;
    // Prompts may yield to a canonical update. Capture before asking, then
    // refuse a stale base rather than publishing a row computed from it.
    const captured = JSON.stringify([current.config, current.head, current.output.fps]);
    const tiedEnd = tiedEndResizeGesture(current, clipId, 0.5);
    if (tiedEnd !== undefined) {
      if (tiedEnd && captured === JSON.stringify([dataRef.current?.config, dataRef.current?.head, dataRef.current?.output.fps])) {
        applyEdit({ type: 'commands' }, { semantic: true, transactionId: crypto.randomUUID(), editCommands: tiedEnd.commands });
      }
      return;
    }
  }
  const clipMeta = current.meta[clipId];
  const metaUpdates: Record<string, Partial<ClipMeta>> = {};
  if (clipMeta && typeof clipMeta.hold === 'number') metaUpdates[clipId] = { hold: 0.5 };
  // Literal media extends its source out point; unsupported relations retain their existing fallback.
  const editCommands = typeof clipMeta?.hold === 'number'
    ? rightResizeGestureCommands(current, clipId, 0.5, {}) : tinyMediaExpansionGestureCommands(current, clipId);
  applyEdit({
    type: 'rows',
    rows: current.rows.map((candidate) => candidate.id !== row.id ? candidate : {
      ...candidate,
      actions: candidate.actions.map((item) => item.id !== clipId ? item : { ...item, end: action.start + 0.5 }),
    }),
    ...(Object.keys(metaUpdates).length > 0 ? { metaUpdates } : {}),
  }, { editCommands });
}
