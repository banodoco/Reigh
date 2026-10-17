import { MANUAL_TEXT_REF, manualTextParams, geometryOf, tagged } from '../../commands/manualText.ts';
import { useCallback } from 'react';
import { createClipMetaFromDescriptor } from '@/tools/video-editor/clip-types/runtime.ts';
import { getVisualTracks } from '@/tools/video-editor/lib/editor-utils.ts';
import { updateClipOrder } from '@/tools/video-editor/lib/coordinate-utils.ts';
import { resolveOverlaps } from '@/tools/video-editor/lib/resolve-overlaps.ts';
import { getNextClipId } from '@/tools/video-editor/lib/timeline-data.ts';
import type { TimelineAction } from '@/tools/video-editor/types/timeline-canvas.ts';
import type { ClipEditingContext } from './types.ts';

export function useClipTextOverlay(ctx: ClipEditingContext) {
  const {
    applyRowsEdit,
    dataRef,
    selectedTrack,
    currentTimeRef,
    selectClip,
    setSelectedTrackId,
  } = ctx;

  const handleAddText = useCallback(() => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const visualTrack = selectedTrack?.kind === 'visual'
      ? selectedTrack
      : getVisualTracks(current.resolvedConfig)[0];
    if (!visualTrack) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const textDuration = 5;
    const action: TimelineAction = {
      id: clipId,
      start: currentTimeRef.current,
      end: currentTimeRef.current + textDuration,
      effectId: `effect-${clipId}`,
    };
    const rowsWithClip = current.rows.map((row) => (
      row.id === visualTrack.id
        ? { ...row, actions: [...row.actions, action] }
        : row
    ));
    // Resolve overlaps so the text clip doesn't land on top of existing clips
    const { rows: nextRows, metaPatches, adjustments: _adjustments } = resolveOverlaps(
      rowsWithClip, visualTrack.id, clipId, current.meta,
    );
    const nextClipOrder = updateClipOrder(current.clipOrder, visualTrack.id, (ids) => [...ids, clipId]);
    const clipMeta = createClipMetaFromDescriptor({
      clipType: 'text',
      trackId: visualTrack.id,
    });
    if (!clipMeta) {
      return;
    }
    const capturedAction = nextRows.flatMap(row => row.actions).find(row => row.id === clipId);
    if (!capturedAction || Object.keys(metaPatches).some(id => id !== clipId)) return;
    // These actions add to the parent film track. Projected occurrence rows are
    // view members, never parent clip identities or parent ordering authority.
    const parentClips = current.config.clips.filter(clip => !clip.app?.canonical);
    const expectedOrder = parentClips.filter(clip => clip.track === visualTrack.id).map(clip => clip.id);
    const params = manualTextParams(clipMeta.text, geometryOf(clipMeta));
    if (!params || !Number.isFinite(capturedAction.start) || capturedAction.start < 0) return;
    const select = `parent/clip:${clipId}`;
    const command = { op: 'timeline.add', select: null, created: [select], args: {
      element: 'am-type', elementRef: { ...MANUAL_TEXT_REF }, text: clipMeta.text!, geometry: geometryOf(clipMeta),
      opacity: clipMeta.opacity ?? 1, action: structuredClone(capturedAction), time_domain: 'timeline-seconds',
      clip_id: clipId, track: visualTrack.id, expected_order: expectedOrder, clip_order: [...expectedOrder, clipId],
    }, expect: { [`${select}::`]: tagged(undefined),
      [`${select}::clip_order`]: tagged(parentClips.map(clip => `parent/clip:${clip.id}`)),
      [`parent/track:${visualTrack.id}::`]: tagged(current.config.tracks?.find(track => track.id === visualTrack.id)),
    } };
    applyRowsEdit(nextRows, {
      ...metaPatches,
      [clipId]: { ...clipMeta, clipType: 'am-type', elementRef: { ...MANUAL_TEXT_REF }, params },
    }, undefined, nextClipOrder, { editCommands: [command] });
    selectClip(clipId);
    setSelectedTrackId(visualTrack.id);
  }, [applyRowsEdit, dataRef, selectedTrack, selectClip, setSelectedTrackId]);

  const handleAddTextAt = useCallback((trackId: string, time: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    // Ensure the target track is visual; fall back to first visual track
    const targetTrack = current.tracks.find((t) => t.id === trackId);
    const visualTrack = targetTrack?.kind === 'visual'
      ? targetTrack
      : getVisualTracks(current.resolvedConfig)[0];
    if (!visualTrack) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const textDuration = 5;
    const action: TimelineAction = {
      id: clipId,
      start: Math.max(0, time),
      end: Math.max(0, time) + textDuration,
      effectId: `effect-${clipId}`,
    };
    const rowsWithClip = current.rows.map((row) => (
      row.id === visualTrack.id
        ? { ...row, actions: [...row.actions, action] }
        : row
    ));
    const { rows: nextRows, metaPatches, adjustments: _adjustments } = resolveOverlaps(
      rowsWithClip, visualTrack.id, clipId, current.meta,
    );
    const nextClipOrder = updateClipOrder(current.clipOrder, visualTrack.id, (ids) => [...ids, clipId]);
    const clipMeta = createClipMetaFromDescriptor({
      clipType: 'text',
      trackId: visualTrack.id,
    });
    if (!clipMeta) {
      return;
    }
    const capturedAction = nextRows.flatMap(row => row.actions).find(row => row.id === clipId);
    if (!capturedAction || Object.keys(metaPatches).some(id => id !== clipId)) return;
    // These actions add to the parent film track. Projected occurrence rows are
    // view members, never parent clip identities or parent ordering authority.
    const parentClips = current.config.clips.filter(clip => !clip.app?.canonical);
    const expectedOrder = parentClips.filter(clip => clip.track === visualTrack.id).map(clip => clip.id);
    const params = manualTextParams(clipMeta.text, geometryOf(clipMeta));
    if (!params || !Number.isFinite(capturedAction.start) || capturedAction.start < 0) return;
    const select = `parent/clip:${clipId}`;
    const command = { op: 'timeline.add', select: null, created: [select], args: {
      element: 'am-type', elementRef: { ...MANUAL_TEXT_REF }, text: clipMeta.text!, geometry: geometryOf(clipMeta),
      opacity: clipMeta.opacity ?? 1, action: structuredClone(capturedAction), time_domain: 'timeline-seconds',
      clip_id: clipId, track: visualTrack.id, expected_order: expectedOrder, clip_order: [...expectedOrder, clipId],
    }, expect: { [`${select}::`]: tagged(undefined),
      [`${select}::clip_order`]: tagged(parentClips.map(clip => `parent/clip:${clip.id}`)),
      [`parent/track:${visualTrack.id}::`]: tagged(current.config.tracks?.find(track => track.id === visualTrack.id)),
    } };
    applyRowsEdit(nextRows, {
      ...metaPatches,
      [clipId]: { ...clipMeta, clipType: 'am-type', elementRef: { ...MANUAL_TEXT_REF }, params },
    }, undefined, nextClipOrder, { editCommands: [command] });
    selectClip(clipId);
    setSelectedTrackId(visualTrack.id);
  }, [applyRowsEdit, dataRef, selectClip, setSelectedTrackId]);

  return { handleAddText, handleAddTextAt };
}
