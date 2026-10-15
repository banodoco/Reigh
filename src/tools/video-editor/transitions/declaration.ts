import {
  declareAppTransition,
  prepareDeclaredTrack,
  TransitionAdmissionError,
  type TransitionDeclaration,
} from '@banodoco/timeline-composition/evaluation';
import type { TimelineClip } from '@/tools/video-editor/types/index.ts';
import { transitionDeclarationInput } from './declaration-input.ts';

export type TransitionAuthoringClip = Pick<TimelineClip, 'id' | 'track' | 'transition'> & {
  start: number;
  duration: number;
};

/** Convert the existing App shape with the admitted shared implementation. */
export function declareClipTransition(
  clip: Pick<TimelineClip, 'id' | 'track' | 'transition'>,
  fps: number,
  host: string,
): TransitionDeclaration | null {
  const input = transitionDeclarationInput(clip);
  return input ? declareAppTransition(input.trackId, input.clipId, input.transition, fps, host) : null;
}

/** Strict admission for new authoring, after the timing compiler resolves spans.
 * Legacy load/repair paths keep their original behavior. Do not resolve timing,
 * sort clips, clear transitions or repair overlaps in this admission path.
 */
export function prepareTransitionTrackForAuthoring(
  trackId: string,
  clips: readonly TransitionAuthoringClip[],
  fps: number,
  host: string,
) {
  if (clips.some(clip => clip.track !== trackId)) {
    throw new TransitionAdmissionError('transition/invalid-owner',
      'Transition clips must belong to the requested track.',
      'Supply only the clips owned by this track.');
  }
  const declarations: TransitionDeclaration[] = [];
  for (const clip of clips) {
    const declaration = declareClipTransition(clip, fps, host);
    if (declaration) declarations.push(declaration);
  }
  const prepared = prepareDeclaredTrack(trackId, clips, declarations, host);
  return {declarations, prepared};
}
