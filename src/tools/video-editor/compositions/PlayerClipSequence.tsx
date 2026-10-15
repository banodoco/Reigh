import {createContext, useContext, type ComponentProps, type FC, type PropsWithChildren, type ReactNode} from 'react';
import {AbsoluteFill, Freeze, Sequence, useCurrentFrame} from 'remotion';
import {queryDrawFrame, type DrawPlan, type SceneLayer} from '@banodoco/timeline-composition/evaluation';

type ClipEvaluation = {clipId: string; plan: DrawPlan; layer?: SceneLayer};
export const PlayerClipEvaluationContext = createContext<ClipEvaluation | null>(null);

const EvaluatedContent: FC<PropsWithChildren<{evaluation: ClipEvaluation}>> = ({evaluation, children}) => {
  const drawLocalFrame = useCurrentFrame();
  const evaluated = evaluation.layer ?? queryDrawFrame(evaluation.plan, drawLocalFrame);
  const opacity = 'transitionOpacity' in evaluated ? evaluated.transitionOpacity : evaluated.opacity;
  const body = evaluation.plan.drawDuration > evaluation.plan.ownDuration
    ? <Freeze frame={evaluated.ownFrame}>{children}</Freeze> : children;
  return <AbsoluteFill style={{opacity}}>{body}</AbsoluteFill>;
};

/** Keep premount/asset readiness in the injected host; the shared plan owns visible timing. */
export const PlayerClipSequence: FC<ComponentProps<typeof Sequence> & {clipId: string; audio?: ReactNode}> = ({clipId, children, audio, ...props}) => {
  const evaluation = useContext(PlayerClipEvaluationContext);
  if (!evaluation || evaluation.clipId !== clipId) return <Sequence {...props}>{children}</Sequence>;
  const {plan} = evaluation;
  const hasTransition = plan.ownOffset !== 0 || plan.drawDuration !== plan.ownDuration || plan.fadeIn || plan.fadeOut;
  return <><Sequence {...props} from={plan.drawStart} durationInFrames={plan.drawDuration}>
    {hasTransition ? <EvaluatedContent evaluation={evaluation}>{children}</EvaluatedContent> : children}
  </Sequence>{audio}</>;
};
