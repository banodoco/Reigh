import { useEffect, useMemo, useState } from 'react';
import { cancelRender, continueRender, delayRender, useRemotionEnvironment } from 'remotion';
import type { ResolvedTimelineClip, TrackDefinition } from '../types/index.ts';
import type { TransitionRegistrySnapshot } from '../transitions/registry/types.ts';
import { isBuiltInTransition } from '../transitions/catalog.ts';
import { admitPlayerTransitions, type PlayerTransitionContext } from './playerTransitionAdmission.ts';
import { preparePlayerTrack, type PlayerTrackEvaluation } from './playerEvaluation.ts';

export type PlayerTrackEvaluationState =
  | {status: 'pending'}
  | {status: 'ready'; evaluation: PlayerTrackEvaluation}
  | {status: 'refused'; error: Error};
const refused = (error: unknown): PlayerTrackEvaluationState => ({status: 'refused',
  error: error instanceof Error ? error : new Error(String(error))});

/** Async admission blocks exported frames; a new snapshot can never draw using an old admission. */
export function usePlayerTrackEvaluation(
  track: TrackDefinition, clips: readonly ResolvedTimelineClip[], fps: number,
  width: number, height: number, snapshot: TransitionRegistrySnapshot,
): PlayerTrackEvaluationState {
  const environment = useRemotionEnvironment();
  const route = environment.isRendering ? 'worker-export'
    : environment.isClientSideRendering ? 'browser-export' : 'preview';
  const request = useMemo(() => {
    const context: PlayerTransitionContext = {snapshot, route};
    const async = clips.some(clip => clip.transition && !isBuiltInTransition(clip.transition.type));
    if (!async) {
      try {
        return {context, immediate: {status: 'ready', evaluation:
          preparePlayerTrack(track, clips, fps, width, height, context)} as PlayerTrackEvaluationState};
      } catch (error) {
        return {context, immediate: refused(error)};
      }
    }
    const handle = route === 'preview' ? undefined : delayRender('Admitting pinned timeline transitions');
    let released = false;
    return {context, release: () => {
      if (!released && handle !== undefined) continueRender(handle);
      released = true;
    }};
  }, [track, clips, fps, width, height, snapshot, route]);
  const [settled, setSettled] = useState<{request: typeof request; state: PlayerTrackEvaluationState}>();
  useEffect(() => {
    if (request.immediate) return;
    let disposed = false;
    admitPlayerTransitions(clips, request.context).then(contributions => {
      if (disposed) return;
      return preparePlayerTrack(track, clips, fps, width, height, {...request.context, contributions});
    }).then(evaluation => {
      if (!disposed && evaluation) setSettled({request, state: {status: 'ready', evaluation}});
    }).catch(error => {
      if (!disposed) setSettled({request, state: refused(error)});
    });
    return () => {
      disposed = true;
      request.release?.();
    };
  }, [request, track, clips, fps, width, height]);
  const state = useMemo(() => request.immediate ?? (settled?.request === request
    ? settled.state : {status: 'pending'} as const), [request, settled]);
  useEffect(() => {
    if (state.status === 'pending') return;
    if (state.status === 'refused' && route !== 'preview') cancelRender(state.error);
    request.release?.();
  }, [state, request, route]);
  return state;
}
