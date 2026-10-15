import {
  declareAppTransition,
  type TransitionDeclaration,
} from '@banodoco/timeline-composition/evaluation';
import type { ClipTransition, TimelineElementRef } from '@/tools/video-editor/types/index.ts';
import type { TransitionRegistryRecord } from '@/tools/video-editor/transitions/registry/types.ts';
import {
  transitionImplementationResourcesEqual,
  validateTransitionImplementationBinding,
  type TransitionImplementationBinding,
} from '@/tools/video-editor/transitions/implementationBinding.ts';

type ContributionAwareDeclaration = TransitionDeclaration & {
  readonly contribution?: TransitionImplementationBinding;
};

type ContributionAwareProducer = (
  trackId: string,
  clipId: string,
  transition: { type: string; duration: number; params?: Record<string, unknown> },
  fps: number,
  host: string,
  contribution?: TransitionImplementationBinding,
) => ContributionAwareDeclaration;

export type RegisteredTransitionDeclaration = TransitionDeclaration & {
  /** Exact admitted resource identity retained beside planner implementation/spec. */
  readonly contribution: TransitionImplementationBinding;
};

export class ContributedTransitionAdmissionError extends Error {
  readonly code: string;
  readonly nextStep: string;

  constructor(code: string, message: string, nextStep: string) {
    super(`${message} Next step: ${nextStep}`);
    this.name = 'ContributedTransitionAdmissionError';
    this.code = code;
    this.nextStep = nextStep;
  }
}

function refuse(code: string, message: string, nextStep: string): never {
  throw new ContributedTransitionAdmissionError(code, message, nextStep);
}

const defaultProducer = declareAppTransition as unknown as ContributionAwareProducer;

/**
 * Turn the registry's exact contribution into the existing Composition
 * declaration. G supplies the package-instance binding returned by I's
 * admitTransitionContribution; this adapter passes that same object through.
 * The pinned App d4 producer has the legacy five-argument API, so its explicit
 * implementation is selected only for that verified compatibility boundary.
 */
export function declareRegisteredTransition(
  input: {
    readonly record: TransitionRegistryRecord;
    readonly transition: ClipTransition;
    readonly owner: { readonly trackId: string; readonly clipId: string };
    readonly binding: TransitionImplementationBinding;
    readonly fps: number;
    readonly host: string;
    readonly elementRef?: TimelineElementRef;
  },
  producer: ContributionAwareProducer = defaultProducer,
): RegisteredTransitionDeclaration {
  const { record, transition, owner, binding, fps, host, elementRef } = input;
  if (record.status !== 'active') {
    refuse('transition/inactive-contribution', `Transition "${record.transitionId}" is not active.`,
      'Activate the exact contribution resource before preparing the track.');
  }
  if (record.provenance === 'built-in') {
    refuse('transition/binding-required', `Built-in transition "${record.transitionId}" has no contributed implementation binding.`,
      'Keep built-ins on their legacy path.');
  }
  const resource = record.implementationResource;
  if (!resource || !record.implementationRevision) {
    refuse('transition/binding-required', `Transition "${record.transitionId}" has no admitted implementation resource and revision.`,
      'Use a contribution with an explicit timeline-composition resource and SHA-256 revision.');
  }

  const bindingErrors = validateTransitionImplementationBinding(binding, {
    ownerExtensionId: record.ownerExtensionId,
    contributionId: record.contributionId,
    transitionId: record.transitionId,
    revision: record.implementationRevision,
    resource,
  });
  if (bindingErrors.length > 0) {
    refuse('transition/invalid-binding', bindingErrors.join('; '),
      'Resolve the active resource through timeline-composition admission and repin changed resources.');
  }
  if (!record.ownerExtensionId || binding.resource.owner !== record.ownerExtensionId) {
    refuse('transition/invalid-owner', 'Transition implementation binding owner does not match its registry record.',
      'Resolve the contribution from its owning extension registry.');
  }
  if (transition.type !== record.transitionId || transition.type !== binding.resource.transitionId) {
    refuse('transition/unknown-id', `Transition "${transition.type}" does not match the admitted contribution.`,
      'Resolve the exact transition ID from the active registry.');
  }
  if (!transition.revision) {
    refuse('transition/missing-revision', `Transition "${transition.type}" is missing its resource revision.`,
      'Pin the selected contribution revision on the clip.');
  }
  if (transition.revision !== binding.revision
    || transition.revision !== record.implementationRevision) {
    refuse('transition/mismatched-revision', `Transition "${transition.type}" pins a different contribution revision.`,
      'Repin the clip to the exact active contribution resource.');
  }
  if (elementRef) {
    if (elementRef.kind !== 'transition'
      || elementRef.id !== binding.resource.transitionId
      || elementRef.revision !== binding.revision
      || (elementRef.packId !== undefined && elementRef.packId !== binding.resource.owner)) {
      refuse('transition/invalid-owner', 'Clip element reference does not identify the admitted transition owner and revision.',
        'Use the element reference returned for this exact contribution resource.');
    }
  }
  if (!owner.trackId || !owner.clipId) {
    refuse('transition/invalid-owner', 'A transition needs one track and outgoing clip owner.',
      'Supply the owning track and outgoing clip IDs.');
  }
  if (host !== binding.resource.implementation.host) {
    refuse('transition/unsupported-host', `Transition host "${host}" does not match the admitted implementation host.`,
      `Use the ${binding.resource.implementation.host} host.`);
  }
  const params = transition.params;
  const isPlainParams = params === undefined
    || (typeof params === 'object'
      && params !== null
      && !Array.isArray(params)
      && (Object.getPrototypeOf(params) === Object.prototype || Object.getPrototypeOf(params) === null));
  if (!isPlainParams) {
    refuse('transition/malformed-params', 'Transition params must be a plain object.',
      'Remove malformed params and retry.');
  }
  const supportedParams = new Set(binding.resource.supportedParams);
  const unsupportedParams = Object.keys(params ?? {}).filter((name) => !supportedParams.has(name));
  if (unsupportedParams.length > 0) {
    refuse('transition/unsupported-params', `Transition params are not supported by "${binding.resource.implementation.id}": ${unsupportedParams.join(', ')}.`,
      'Use only parameters declared by the admitted implementation.');
  }
  if (!transitionImplementationResourcesEqual(binding.resource, resource)) {
    refuse('transition/invalid-binding', 'The admitted contribution resource changed after registry resolution.',
      'Resolve and admit the current resource, then explicitly repin the clip.');
  }

  // I's current producer accepts the unique clip type plus the exact binding.
  // The assigned a96 producer predates that optional argument, so select its
  // implementation ID from the already-validated resource at that boundary.
  const bindingAwareProducer = producer.length >= 6;
  const declaration = producer(
    owner.trackId,
    owner.clipId,
    {
      type: bindingAwareProducer ? transition.type : binding.resource.implementation.id,
      ...(bindingAwareProducer ? { revision: transition.revision } : {}),
      duration: transition.duration,
      ...(params !== undefined ? { params } : {}),
    },
    fps,
    binding.resource.implementation.host,
    binding,
  );
  if (declaration.contribution !== undefined && declaration.contribution !== binding) {
    refuse('transition/invalid-binding', 'The producer returned a different contribution binding.',
      'Pass the exact active binding returned by timeline-composition admission.');
  }
  return Object.freeze({ ...declaration, contribution: binding });
}
