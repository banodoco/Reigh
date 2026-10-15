import type {
  TransitionContribution,
  TransitionImplementationResource,
} from '@reigh/editor-sdk';

/** Exact binding shape returned by timeline-composition admission. */
export interface TransitionImplementationBinding {
  readonly resource: TransitionImplementationResource;
  readonly revision: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

export function transitionImplementationResourcesEqual(
  left: unknown,
  right: unknown,
): boolean {
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function validateTransitionImplementationRevision(value: unknown): string[] {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
    ? []
    : ['implementation resource revision must be a lowercase SHA-256 digest'];
}

/**
 * Snapshot the exact immutable resource whose SHA-256 revision is admitted by
 * timeline-composition. The package's `resourceRevision` is kept separately
 * on its manifest/registry reference and on each persisted clip transition.
 */
export function createTransitionImplementationResource(
  ownerExtensionId: string,
  contribution: Pick<
    TransitionContribution,
    'id' | 'transitionId' | 'implementation' | 'supportedParams' | 'defaults'
  >,
): TransitionImplementationResource | undefined {
  if (!contribution.implementation) return undefined;
  const candidate = {
    owner: ownerExtensionId,
    id: contribution.id,
    kind: 'transition' as const,
    transitionId: contribution.transitionId,
    implementation: contribution.implementation,
    supportedParams: contribution.supportedParams ?? [],
    defaults: contribution.defaults ?? {},
  };
  if (validateTransitionImplementationResource(candidate).length > 0) return undefined;
  const resource: TransitionImplementationResource = {
    ...candidate,
    implementation: { host: candidate.implementation.host, id: candidate.implementation.id },
    supportedParams: [...candidate.supportedParams],
    defaults: { ...candidate.defaults },
  };
  return deepFreeze(resource);
}

export function validateTransitionImplementationResource(value: unknown): string[] {
  if (!isPlainRecord(value)) return ['implementation resource must be an object'];
  const errors: string[] = [];
  if (!hasOnlyKeys(value, [
    'owner', 'id', 'kind', 'transitionId', 'implementation', 'supportedParams', 'defaults',
  ])) errors.push('implementation resource has unexpected fields');
  if (typeof value.owner !== 'string' || value.owner.trim() === '') {
    errors.push('implementation resource owner is missing');
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    errors.push('implementation resource contribution id is missing');
  }
  if (value.kind !== 'transition') errors.push('implementation resource kind must be transition');
  if (typeof value.transitionId !== 'string' || value.transitionId.trim() === '') {
    errors.push('implementation resource transition id is missing');
  }

  if (!isPlainRecord(value.implementation)
    || !hasOnlyKeys(value.implementation, ['host', 'id'])) {
    errors.push('implementation declaration is malformed');
  } else {
    if (value.implementation.host !== 'timeline-composition') {
      errors.push('implementation host must be timeline-composition');
    }
    if (value.implementation.id !== 'cross-fade' && value.implementation.id !== 'fade') {
      errors.push('implementation id must be cross-fade or fade');
    }
  }

  if (!Array.isArray(value.supportedParams)
    || value.supportedParams.some((name) => typeof name !== 'string' || name.trim() === '')
    || new Set(value.supportedParams).size !== value.supportedParams.length) {
    errors.push('implementation supportedParams must be an array of unique names');
  }
  if (!isPlainRecord(value.defaults)) {
    errors.push('implementation defaults must be an object');
  }

  if (Array.isArray(value.supportedParams) && isPlainRecord(value.defaults)) {
    const supported = [...value.supportedParams].sort();
    const defaultNames = Object.keys(value.defaults).sort();
    if (JSON.stringify(supported) !== JSON.stringify(defaultNames)) {
      errors.push('implementation defaults must match its supported parameter names');
    }
    const currentImplementation = isPlainRecord(value.implementation) ? value.implementation.id : undefined;
    const onlySupportedSurface = supported.length === 0
      ? defaultNames.length === 0
      : supported.length === 1
        && supported[0] === 'easing'
        && currentImplementation === 'cross-fade'
        && value.defaults.easing === 'linear';
    if (!onlySupportedSurface) {
      errors.push('cross-fade and fade currently support no params except cross-fade easing=linear');
    }
  }
  return errors;
}

export function validateTransitionImplementationBinding(
  value: unknown,
  expected?: {
    ownerExtensionId?: string;
    contributionId?: string;
    transitionId?: string;
    revision?: string;
    resource?: unknown;
  },
): string[] {
  if (!isPlainRecord(value)) return ['admitted implementation binding is missing'];
  const errors: string[] = [];
  if (!hasOnlyKeys(value, ['resource', 'revision'])) {
    errors.push('admitted implementation binding has unexpected fields');
  }
  errors.push(...validateTransitionImplementationResource(value.resource));
  errors.push(...validateTransitionImplementationRevision(value.revision)
    .map((message) => message.replace('implementation resource revision', 'admitted implementation binding revision')));
  const resource = isPlainRecord(value.resource) ? value.resource : undefined;
  if (expected?.ownerExtensionId !== undefined && resource?.owner !== expected.ownerExtensionId) {
    errors.push('implementation binding owner does not match the registry owner');
  }
  if (expected?.contributionId !== undefined && resource?.id !== expected.contributionId) {
    errors.push('implementation binding contribution id does not match the registry record');
  }
  if (expected?.transitionId !== undefined && resource?.transitionId !== expected.transitionId) {
    errors.push('implementation binding transition id does not match the registry record');
  }
  if (expected?.revision !== undefined && value.revision !== expected.revision) {
    errors.push('implementation binding revision does not match the pinned registry revision');
  }
  if (expected?.resource !== undefined
    && !transitionImplementationResourcesEqual(resource, expected.resource)) {
    errors.push('implementation binding resource does not match the active registry resource');
  }
  return errors;
}
