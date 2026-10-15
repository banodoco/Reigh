import {
  declareAppTransition,
  prepareScene,
  type PreparedScene,
  type TransitionSpec,
} from '@banodoco/timeline-composition/evaluation';
import { getClipTimelineDuration, getSanitizedPlaybackRate } from '../lib/config-utils.ts';
import type { ResolvedTimelineClip, TrackDefinition } from '../types/index.ts';

type EvaluationClip = Parameters<typeof prepareScene>[0][number]['clips'][number];

/** Adapt the App's sanitized media clock, without changing the host clip or its source identity. */
export const playerEvaluationClip = (clip: ResolvedTimelineClip): EvaluationClip => ({
  ...clip,
  speed: getSanitizedPlaybackRate(clip.speed),
  hold: getClipTimelineDuration(clip) * getSanitizedPlaybackRate(clip.speed),
  // Runtime audio is admitted by compileAudioEnvelope, never coerced here.
  audio: (clip as ResolvedTimelineClip & Pick<EvaluationClip, 'audio'>).audio,
});

export type PlayerTrackEvaluation = {
  scene: PreparedScene;
  clips: ResolvedTimelineClip[];
  /** The producer has no custom transition renderer/params or legacy gap-preroll contract. */
  legacyTiming: ReadonlySet<number>;
};

/** App transitions live on the incoming clip; the shared planner owns the outgoing boundary. */
export const preparePlayerTrack = (
  track: TrackDefinition,
  clips: readonly ResolvedTimelineClip[],
  fps: number,
  width: number,
  height: number,
): PlayerTrackEvaluation => {
  const sorted = [...clips].sort((a, b) => a.at - b.at);
  const transitions: (TransitionSpec | null)[] = sorted.slice(1).map(() => null);
  const legacyTiming = new Set<number>();
  for (let index = 0; index < sorted.length; index++) {
    const incoming = sorted[index];
    if (!incoming.transition) continue;
    const outgoing = sorted[index - 1];
    const type = incoming.transition.type;
    const nativeMedia = (clip: ResolvedTimelineClip) => !clip.elementRef
      && (!clip.clipType || ['media', 'image', 'hold'].includes(clip.clipType));
    // Injected components have no declared audible subtree/clock interface.
    // Keep their existing transition path rather than freezing hidden sound.
    if (!outgoing || !nativeMedia(incoming) || !nativeMedia(outgoing) || !['crossfade', 'cross-fade', 'fade'].includes(type)
      || !Number.isFinite(incoming.transition.duration) || incoming.transition.duration <= 0
      || Math.round(incoming.transition.duration * fps) <= 0) {
      legacyTiming.add(index);
      if (outgoing) legacyTiming.add(index - 1);
      continue;
    }
    transitions[index - 1] = declareAppTransition(track.id, outgoing.id,
      incoming.transition, fps, 'timeline-composition').spec;
  }
  const assets = Object.fromEntries(sorted.flatMap(clip => clip.asset && clip.assetEntry
    ? [[clip.asset, {...clip.assetEntry, file: clip.assetEntry.src}]] : []));
  const scene = prepareScene([{track, clips: sorted.map(playerEvaluationClip), transitions}],
    {assets}, fps, width, height, {
      // Components keep their injected host. Their unknown internals must never cull a draw.
      elements: new Set(sorted.filter(clip => clip.clipType && !['media', 'image', 'hold'].includes(clip.clipType))
        .map(clip => clip.clipType!)),
    });
  // The admitted planner only supports adjacent transitions that fit both own spans.
  // Keep the existing host path for legacy gaps/overlaps/oversized transitions.
  scene.tracks[0].prepared.plans.forEach((plan, index) => {
    if (index > 0 && transitions[index - 1] && !plan.fadeIn) {
      legacyTiming.add(index - 1);
      legacyTiming.add(index);
    }
  });
  // A custom incoming renderer can coexist with a supported transition elsewhere.
  // Do not let a neighboring shared fade partly execute across a legacy endpoint.
  let changed = true;
  while (changed) {
    changed = false;
    transitions.forEach((transition, index) => {
      if (transition && (legacyTiming.has(index) || legacyTiming.has(index + 1))) {
        transitions[index] = null;
        legacyTiming.add(index);
        legacyTiming.add(index + 1);
        changed = true;
      }
    });
  }
  if (legacyTiming.size) {
    return {...preparePlayerSceneWithoutLegacyTransitions(scene, transitions), clips: sorted, legacyTiming};
  }
  return {scene, clips: sorted, legacyTiming};
};

const preparePlayerSceneWithoutLegacyTransitions = (
  scene: PreparedScene, transitions: readonly (TransitionSpec | null)[],
): {scene: PreparedScene} => ({scene: prepareScene(scene.tracks.map(input => ({...input, transitions})),
  scene.assets, scene.fps, scene.width, scene.height, {elements: scene.elements})});
