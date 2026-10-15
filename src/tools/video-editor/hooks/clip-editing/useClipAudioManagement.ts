import { detachAudioGestureCommands, propertyGestureCommands } from '../../commands/semanticGestures.ts';
import { useCallback } from 'react';
import { detachAudioFromVideo } from '@/tools/video-editor/lib/editor-utils.ts';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data.ts';
import type { ClipEditingContext } from './types.ts';

export function useClipAudioManagement(ctx: ClipEditingContext) {
  const {
    applyRowsEdit,
    applyConfigEdit,
    dataRef,
    resolvedConfig,
    selectedClipId,
    getValidClipIds,
  } = ctx;

  const handleToggleMuteClips = useCallback((clipIds: string[]) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const validClipIds = getValidClipIds(clipIds);
    if (validClipIds.length === 0) {
      return;
    }

    const metaUpdates = Object.fromEntries(
      validClipIds.map((clipId) => {
        const volume = current.meta[clipId]?.volume ?? 1;
        return [clipId, { volume: volume <= 0 ? 1 : 0 }];
      }),
    ) as Record<string, Partial<ClipMeta>>;

    const groups = Object.entries(metaUpdates).map(([id, patch]) => propertyGestureCommands(current, id, patch));
    applyRowsEdit(current.rows, metaUpdates, undefined, undefined, {
      editCommands: groups.every((commands) => commands !== undefined) ? groups.flat() : undefined,
    });
  }, [applyRowsEdit, dataRef, getValidClipIds]);

  const handleToggleMute = useCallback(() => {
    if (!selectedClipId || !resolvedConfig) {
      return;
    }

    handleToggleMuteClips([selectedClipId]);
  }, [handleToggleMuteClips, resolvedConfig, selectedClipId]);

  const handleDetachAudioClip = useCallback((clipId: string) => {
    if (!resolvedConfig) {
      return;
    }

    let nextConfig = detachAudioFromVideo(resolvedConfig, clipId);
    if (nextConfig === resolvedConfig) {
      return;
    }

    const current = dataRef.current;
    const source = current?.config.clips.find((clip) => clip.id === clipId);
    const child = nextConfig.clips.find((clip) => !resolvedConfig.clips.some((before) => before.id === clip.id));
    const editCommands = current && child
      ? detachAudioGestureCommands(current, clipId, child.id, child.track) : undefined;
    if (source && child && editCommands) {
      // Match clip.detach-audio: clone the authored source, retaining its anchor,
      // range, gain, and opaque siblings; only cut/sequence ownership is removed.
      const astrid = { ...(source.app?.astrid as Record<string, unknown> | undefined) };
      for (const key of ['cut', 'layer', 'sequence', 'sequence_index']) delete astrid[key];
      const detached = {
        ...source, id: child.id, track: child.track,
        ...(source.app ? { app: { ...source.app, ...(source.app.astrid ? { astrid } : {}) } } : {}),
      };
      nextConfig = { ...nextConfig, clips: nextConfig.clips.map((clip) => clip.id === child.id ? detached : clip) };
    }
    applyConfigEdit(nextConfig, { selectedClipId: clipId, semantic: true, editCommands });
  }, [applyConfigEdit, dataRef, resolvedConfig]);

  return { handleToggleMuteClips, handleToggleMute, handleDetachAudioClip };
}
