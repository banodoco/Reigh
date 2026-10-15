import { createContext, useContext, type ReactNode } from 'react';
import {
  composeModifiers,
  ModifierAdmissionError,
  spriteKeyframeFrame,
  timelineKeyframeTime,
  type ModifierBounds,
  type ModifierFinding,
  type ModifierRegistry,
  type RuntimeTheme,
} from '@banodoco/timeline-composition/theme-api';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';

export type AppModifierHost = {
  registry: ModifierRegistry;
  theme: RuntimeTheme;
  /** Existing root composition frame, outside the media Sequence. */
  globalFrame: number;
  onFinding?: (finding: ModifierFinding) => void;
};

const AppModifierHostContext = createContext<AppModifierHost | undefined>(undefined);
export const AppModifierHostProvider = AppModifierHostContext.Provider;
export const useAppModifierHost = () => useContext(AppModifierHostContext);

export function admitAppModifierTarget(clip: ResolvedTimelineClip, nativeMedia: boolean): void {
  if (clip.modifiers?.length && !nativeMedia) {
    throw new ModifierAdmissionError('unsupported-app-target',
      `App modifier geometry/placement is unavailable for clip ${clip.id} (${clip.clipType ?? 'media'})`);
  }
}

/** Wrap already cropped native content. Frame comes from the owning renderer;
 * this adapter creates no clock and never applies trim, speed or global remaps.
 * Bounds use the native content's coordinates before its outer track transform.
 */
export function composeAppClipModifiers({ clip, content, frame, fps, bounds, host }: {
  clip: ResolvedTimelineClip;
  content: ReactNode;
  frame: number;
  fps: number;
  bounds: ModifierBounds;
  host: AppModifierHost | undefined;
}): ReactNode {
  if (!clip.modifiers?.length) return content;
  if (!host) throw new ModifierAdmissionError('missing-app-host', 'App clip modifiers require an explicit modifier host');
  return composeModifiers({
    instances: clip.modifiers,
    registry: host.registry,
    context: {
      clip, fps, frame,
      keyframeFrame: spriteKeyframeFrame(clip, frame, fps),
      keyframeTime: timelineKeyframeTime(clip, clip.at + frame / fps),
      globalFrame: host.globalFrame,
      bounds,
      theme: host.theme,
    },
    content,
    host: 'app',
    onFinding: host.onFinding,
  });
}
