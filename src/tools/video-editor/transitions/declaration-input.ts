import type { ClipTransition, TimelineClip } from '@/tools/video-editor/types/index.ts';

/** Input to the shared declaration converter, before host/package admission.
 * Keep type/duration/params in App units; Composition owns conversion and policy.
 */
export function transitionDeclarationInput(
  clip: Pick<TimelineClip, 'id' | 'track' | 'transition'>,
): {trackId: string; clipId: string; transition: ClipTransition} | null {
  if (clip.transition === undefined || clip.transition === null) return null;
  if (!clip.id || !clip.track) {
    throw new Error('Transition needs an outgoing clip and track owner. Next step: supply the clip and track IDs.');
  }
  return {
    trackId: clip.track,
    clipId: clip.id,
    transition: structuredClone(clip.transition),
  };
}
