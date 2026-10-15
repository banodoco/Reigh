import {
  prepareTrack,
  queryDrawFrame,
  type DrawPlan,
} from '@banodoco/timeline-composition/evaluation';

// Inputs are the App's already-resolved frame span. This adapter owns no
// seconds, speed, source mapping, or incoming-transition conversion.
// Only cut sequences are admitted here: App media transition mounting and
// registry styles do not yet have equivalent shared evaluation semantics.
export const preparePlayerCut = (start: number, duration: number): DrawPlan => (
  prepareTrack([{ start, duration }], []).plans[0]
);

// The extension host evaluates parameters in composition time, including
// outside its mounted span. Retain its boundary clamp without moving source
// time or applying the evaluator's transition opacity to component output.
export const queryPlayerCutFrame = (plan: DrawPlan, frame: number): number => (
  plan.drawStart + queryDrawFrame(plan, frame - plan.drawStart).ownFrame
);
