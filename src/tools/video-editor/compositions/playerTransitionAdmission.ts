import {
  admitTransitionContribution,
  transitionContributionIdentity,
  TransitionAdmissionError,
  type AdmittedTransitionContribution,
  type TransitionContributionReference,
  type TransitionContributionResource,
} from '@banodoco/timeline-composition/evaluation';
import { isBuiltInTransition, resolveTransition } from '../transitions/catalog.ts';
import type { TransitionRegistryRecord, TransitionRegistrySnapshot } from '../transitions/registry/types.ts';
import type { RenderRoute } from '../runtime/renderability.ts';
import type { ResolvedTimelineClip } from '../types/index.ts';

export type PlayerTransitionContext = {
  snapshot?: TransitionRegistrySnapshot;
  route: RenderRoute;
  contributions?: ReadonlyMap<string, AdmittedTransitionContribution>;
};

export const refusePlayerTransition = (code: string, message: string): never => {
  throw new TransitionAdmissionError(code, message, 'Resolve the active pinned transition and supported host route before retrying.');
};

export const isSharedBuiltinTransition = (type: string): boolean =>
  ['crossfade', 'cross-fade', 'fade'].includes(type);

/** Read the existing provider snapshot, never activate a contribution in the consumer. */
export const requirePlayerTransitionRecord = (
  type: string, context: PlayerTransitionContext,
): TransitionRegistryRecord => {
  const record = resolveTransition(type, context.snapshot);
  if (!record) return refusePlayerTransition('transition/unknown-contribution', `Transition '${type}' is not registered.`);
  if (record.status !== 'active') {
    return refusePlayerTransition('transition/inactive-contribution', `Transition '${type}' is ${record.status}.`);
  }
  const capability = record.renderability.capabilities.find(item => item.route === context.route);
  if (capability?.status !== 'supported' || (context.route !== 'preview'
    && (record.renderability.determinism !== 'deterministic' || capability.determinism !== 'deterministic'))
    || record.renderability.blockers?.some(blocker => blocker.route === context.route)) {
    return refusePlayerTransition('transition/unsupported-route', `Transition '${type}' does not support ${context.route}.`);
  }
  return record;
};

/** Only serialized resource/reference data crosses the catalog boundary. */
export const playerTransitionProjection = (record: TransitionRegistryRecord): {
  resource: TransitionContributionResource; reference: TransitionContributionReference;
} => {
  const projection = 'implementationBinding' in record ? record.implementationBinding : undefined;
  if (!projection || typeof projection !== 'object' || !('resource' in projection) || !('reference' in projection)) {
    return refusePlayerTransition('transition/invalid-binding', `Transition '${record.transitionId}' has no exact resource/reference projection.`);
  }
  const {resource, reference} = projection as {
    resource: TransitionContributionResource; reference: TransitionContributionReference;
  };
  if (!resource || !reference || !record.ownerExtensionId || record.ownerExtensionId !== reference.owner
    || record.contributionId !== reference.id || record.transitionId !== reference.transitionId
    || resource.owner !== reference.owner || resource.id !== reference.id || resource.transitionId !== reference.transitionId) {
    return refusePlayerTransition('transition/reference-mismatch', `Transition '${record.transitionId}' differs from its registered owner or identity.`);
  }
  return {resource, reference};
};

export const requireCurrentPlayerTransitionBinding = (
  record: TransitionRegistryRecord, binding: AdmittedTransitionContribution | undefined,
): AdmittedTransitionContribution => {
  if (!binding) return refusePlayerTransition('transition/invalid-binding', `Transition '${record.transitionId}' has not been admitted.`);
  const {resource, reference} = playerTransitionProjection(record);
  if (binding.revision !== reference.revision
    || transitionContributionIdentity(binding.resource) !== transitionContributionIdentity(resource)) {
    return refusePlayerTransition('transition/reference-mismatch', `Transition '${record.transitionId}' admission is stale; explicitly repin the resource.`);
  }
  // declareAppTransition checks package-local admission provenance, including forged objects.
  return binding;
};

/** Transport data is re-admitted by this package instance. An admitted-looking object is never authority. */
export const admitPlayerTransitions = async (
  clips: readonly ResolvedTimelineClip[], context: PlayerTransitionContext,
): Promise<ReadonlyMap<string, AdmittedTransitionContribution>> => {
  const contributions = new Map<string, AdmittedTransitionContribution>();
  for (const clip of clips) {
    const type = clip.transition?.type;
    if (!type || isBuiltInTransition(type) || contributions.has(type)) continue;
    const record = requirePlayerTransitionRecord(type, context);
    const {resource, reference} = playerTransitionProjection(record);
    if (record.transitionId !== type) {
      refusePlayerTransition('transition/reference-mismatch', `Transition '${type}' differs from its registered transition ID.`);
    }
    if (!globalThis.crypto?.subtle) {
      refusePlayerTransition('transition/unsupported-host', 'This host cannot verify the transition resource SHA-256 revision.');
    }
    contributions.set(type, await admitTransitionContribution(resource, reference, record.status === 'active'));
  }
  return contributions;
};
