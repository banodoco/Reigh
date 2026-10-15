import {
  declareAppTransition,
  prepareScene,
  prepareDeclaredTrack,
  type TransitionDeclaration,
  type PreparedScene,
  type TransitionSpec,
} from '@banodoco/timeline-composition/evaluation';
import { getClipTimelineDuration, getSanitizedPlaybackRate } from '../lib/config-utils.ts';
import { isBuiltInTransition } from '../transitions/catalog.ts';
import { isSharedBuiltinTransition, requirePlayerTransitionRecord, requireCurrentPlayerTransitionBinding, refusePlayerTransition, type PlayerTransitionContext } from './playerTransitionAdmission.ts';
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
  /** Exact declarations retained for both preview and export, including admitted contribution identity. */
  declarations: readonly TransitionDeclaration[];
};

/** App transitions live on the incoming clip; the shared planner owns the outgoing boundary. */
export const preparePlayerTrack = (
  track: TrackDefinition,
  clips: readonly ResolvedTimelineClip[],
  fps: number,
  width: number,
  height: number,
  context: PlayerTransitionContext = {route: 'preview'},
): PlayerTrackEvaluation => {
  const sorted = [...clips].sort((a, b) => a.at - b.at);
  const transitions: (TransitionSpec | null)[] = sorted.slice(1).map(() => null);
  const legacyTiming = new Set<number>();
  const declarations: TransitionDeclaration[] = [];
  const contributedIndices = new Set<number>();
  for (let index = 0; index < sorted.length; index++) {
    const incoming = sorted[index];
    if (!incoming.transition) continue;
    const outgoing = sorted[index - 1];
    const type = incoming.transition.type;
    const contributed = !isBuiltInTransition(type);
    const record = contributed || context.route !== 'preview'
      ? requirePlayerTransitionRecord(type, context) : undefined;
    const binding = contributed
      ? requireCurrentPlayerTransitionBinding(record!, context.contributions?.get(type)) : undefined;
    if (contributed) {
      contributedIndices.add(index);
      const ref = incoming.elementRef;
      if (ref && (ref.kind !== 'transition' || ref.id !== type || ref.revision !== binding!.revision
        || (ref.packId !== undefined && ref.packId !== binding!.resource.owner))) {
        refusePlayerTransition('transition/invalid-owner', `Transition '${type}' has a mismatched element owner or revision.`);
      }
      if (!outgoing || incoming.track !== track.id || outgoing.track !== track.id
        || !incoming.id || !outgoing.id || incoming.id === outgoing.id) {
        refusePlayerTransition('transition/invalid-owner', `Transition '${type}' requires distinct incoming and outgoing clips on '${track.id}'.`);
      }
    }
    const nativeMedia = (clip: ResolvedTimelineClip) => (!clip.elementRef || clip.elementRef.kind === 'transition')
      && (!clip.clipType || ['media', 'image', 'hold'].includes(clip.clipType));
    // Injected components have no declared audible subtree/clock interface.
    // Keep their existing transition path rather than freezing hidden sound.
    if (!outgoing || !nativeMedia(incoming) || !nativeMedia(outgoing) || (!isSharedBuiltinTransition(type) && !contributed)
      || !Number.isFinite(incoming.transition.duration) || incoming.transition.duration <= 0
      || Math.round(incoming.transition.duration * fps) <= 0) {
      if (contributed) refusePlayerTransition('transition/unsupported-target', `Transition '${type}' cannot use the shared media boundary.`);
      legacyTiming.add(index);
      if (outgoing) legacyTiming.add(index - 1);
      continue;
    }
    const declaration = declareAppTransition(track.id, outgoing.id,
      incoming.transition, fps, 'timeline-composition', binding);
    declarations.push(declaration);
    transitions[index - 1] = declaration.spec;
  }
  const assets = Object.fromEntries(sorted.flatMap(clip => clip.asset && clip.assetEntry
    ? [[clip.asset, {...clip.assetEntry, file: clip.assetEntry.src}]] : []));
  const scene = prepareScene([{track, clips: sorted.map(playerEvaluationClip), transitions}],
    {assets}, fps, width, height, {
      // Components keep their injected host. Their unknown internals must never cull a draw.
      elements: new Set(sorted.filter(clip => clip.clipType && !['media', 'image', 'hold'].includes(clip.clipType))
        .map(clip => clip.clipType!)),
    });
  if (contributedIndices.size) {
    if (legacyTiming.size) refusePlayerTransition('transition/unsupported-target', 'A contributed boundary touches a legacy transition track.');
    const prepared = prepareDeclaredTrack(track.id, sorted.map(clip => ({id: clip.id,
      start: Math.round(clip.at * fps), duration: Math.round(getClipTimelineDuration(clip) * fps)})),
    declarations, 'timeline-composition');
    scene.tracks[0].prepared = prepared;
  }
  // The admitted planner only supports adjacent transitions that fit both own spans.
  // Keep the existing host path for legacy gaps/overlaps/oversized transitions.
  scene.tracks[0].prepared.plans.forEach((plan, index) => {
    if (index > 0 && transitions[index - 1] && !plan.fadeIn) {
      if (contributedIndices.size) refusePlayerTransition('transition/unsupported-boundary', 'The declared transition does not fit its adjacent clip spans.');
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
    return {...preparePlayerSceneWithoutLegacyTransitions(scene, transitions), clips: sorted, legacyTiming, declarations};
  }
  return {scene, clips: sorted, legacyTiming, declarations};
};

const preparePlayerSceneWithoutLegacyTransitions = (
  scene: PreparedScene, transitions: readonly (TransitionSpec | null)[],
): {scene: PreparedScene} => ({scene: prepareScene(scene.tracks.map(input => ({...input, transitions})),
  scene.assets, scene.fps, scene.width, scene.height, {elements: scene.elements})});
