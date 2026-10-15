import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { defineExtension } from '@/sdk/index.ts';
import { createTransitionRegistrationService } from '@/tools/video-editor/runtime/transitionRegistrationService.ts';
import { createExtensionDiagnosticsService } from '@/tools/video-editor/runtime/extensionLifecycle.ts';
import { createExtensionContext } from '@/tools/video-editor/runtime/extensionContextFactory.ts';
import { buildTransitionDescriptors } from '@/tools/video-editor/runtime/families/projectors/transitionProjector.ts';
import { createTransitionRegistry } from '@/tools/video-editor/transitions/registry/TransitionRegistry.ts';
import type { TransitionRegistryRecord } from '@/tools/video-editor/transitions/registry/types.ts';
import { createTransitionSnapshot, resolveTransition, normalizeClipTransition } from '@/tools/video-editor/transitions/catalog.ts';
import { validateClipTransition } from '@/tools/video-editor/transitions/validation.ts';
import { serializeClipForDisk } from '@/tools/video-editor/lib/serialize.ts';
import { declareRegisteredTransition } from '@/tools/video-editor/transitions/declaredTransition.ts';
import {
  createTransitionImplementationResource,
  validateTransitionImplementationBinding,
} from '@/tools/video-editor/transitions/implementationBinding.ts';
import type { TransitionContribution, TransitionImplementationResource } from '@reigh/editor-sdk';
import {
  declareAppTransition as assignedWorktreeProducer,
  prepareDeclaredTrack as assignedWorktreePrepareDeclaredTrack,
} from '../../../../vendor/timeline-composition/typescript/src/evaluation.ts';

const OWNER = 'com.reigh.test.transition-owner';
const CONTRIBUTION_ID = 'cross-fade-v1';
const TRANSITION_ID = 'com.reigh.test.transition.cross-fade';
const IMPLEMENTATION = {
  host: 'timeline-composition' as const,
  id: 'cross-fade' as const,
};

function resourceFor(declaration: TransitionContribution): TransitionImplementationResource {
  return {
    owner: OWNER,
    id: String(declaration.id),
    kind: 'transition',
    transitionId: declaration.transitionId,
    implementation: {
      host: declaration.implementation!.host,
      id: declaration.implementation!.id,
    },
    supportedParams: [...(declaration.supportedParams ?? [])],
    defaults: { ...(declaration.defaults ?? {}) },
  };
}

function resourceRevision(resource: TransitionImplementationResource): string {
  const identity = JSON.stringify({
    owner: resource.owner,
    id: resource.id,
    kind: resource.kind,
    transitionId: resource.transitionId,
    implementation: { host: resource.implementation.host, id: resource.implementation.id },
    supportedParams: [...resource.supportedParams].sort(),
    defaults: { ...resource.defaults },
  });
  return `sha256:${createHash('sha256').update(identity, 'utf8').digest('hex')}`;
}

function contribution(overrides: Partial<TransitionContribution> = {}): TransitionContribution {
  const result: TransitionContribution = {
    id: CONTRIBUTION_ID as any,
    kind: 'transition',
    transitionId: TRANSITION_ID,
    implementation: IMPLEMENTATION,
    supportedParams: [],
    defaults: {},
    allowBrowserExport: false,
    allowWorkerExport: false,
    ...overrides,
  };
  if (!result.implementation) return result;
  const resource = resourceFor(result);
  return Object.prototype.hasOwnProperty.call(overrides, 'resourceRevision')
    ? result
    : { ...result, resourceRevision: resourceRevision(resource) };
}

function bindingFor(
  record: TransitionRegistryRecord,
  revision = record.implementationRevision!,
) {
  if (!record.implementationResource) throw new Error('registration did not produce an implementation resource');
  return Object.freeze({ resource: record.implementationResource, revision });
}

function registerContribution(
  declaration: TransitionContribution = contribution(),
  options?: { parameterSchema?: readonly any[] },
): {
  record: TransitionRegistryRecord;
  registry: ReturnType<typeof createTransitionRegistry>;
  diagnostics: ReturnType<typeof createExtensionDiagnosticsService>;
} {
  const extension = defineExtension({
    manifest: {
      id: OWNER as any,
      version: '1.0.0',
      label: 'Transition fixture',
      contributions: [declaration],
    },
    activate(ctx) {
      return ctx.transitions.registerRenderer(TRANSITION_ID, () => ({ opacity: 1 }), options);
    },
  });
  const registry = createTransitionRegistry();
  const diagnostics = createExtensionDiagnosticsService(OWNER);
  const service = createTransitionRegistrationService({
    extension,
    transitionRegistry: registry,
    diagnosticsService: diagnostics,
  });
  const context = createExtensionContext(extension, undefined, undefined, undefined, service);
  extension.activate?.(context);
  const record = registry.resolve(TRANSITION_ID);
  if (!record) throw new Error('registration did not produce a registry record');
  return { record, registry, diagnostics };
}

function captureError(run: () => unknown): any {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected transition admission to refuse');
}

describe('admitted App transition binding', () => {
  it('activates the declared contribution, freezes its resource and reaches the assigned producer and planner', () => {
    const { record, registry } = registerContribution();
    const binding = bindingFor(record);
    expect(record.status).toBe('active');
    expect(record.implementationResource).toMatchObject({
      owner: OWNER,
      id: CONTRIBUTION_ID,
      kind: 'transition',
      transitionId: TRANSITION_ID,
      implementation: { host: 'timeline-composition', id: 'cross-fade' },
      supportedParams: [],
      defaults: {},
    });
    expect(binding.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(binding.revision).toBe(resourceRevision(binding.resource));
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.resource)).toBe(true);
    expect(Object.isFrozen(binding.resource.implementation)).toBe(true);
    expect(Object.isFrozen(binding.resource.supportedParams)).toBe(true);
    expect(Object.isFrozen(binding.resource.defaults)).toBe(true);
    expect(record.renderability.capabilities.find((entry) => entry.route === 'browser-export')?.status).toBe('blocked');
    expect(record.renderability.capabilities.find((entry) => entry.route === 'worker-export')?.status).toBe('blocked');

    const descriptor = buildTransitionDescriptors([{
      contribution: contribution() as any,
      extensionId: OWNER,
      scopedKey: `transition:${OWNER}:${CONTRIBUTION_ID}`,
      duplicateOrdinal: 0,
      projectionEligible: true,
    }])[0];
    expect(descriptor.implementationResource).toEqual(record.implementationResource);
    expect(descriptor.implementationRevision).toBe(binding.revision);

    const persisted = {
      id: 'outgoing',
      track: 'V1',
      volume: 0.7,
      asset: 'fixture.png',
      hold: 2,
      transition: { type: TRANSITION_ID, revision: binding.revision, duration: 0.5, params: {} },
    };
    const diskClip = serializeClipForDisk({
      id: persisted.id,
      at: 0,
      track: persisted.track,
      clipType: 'hold',
      asset: persisted.asset,
      hold: 2,
      volume: persisted.volume,
      elementRef: { id: TRANSITION_ID, kind: 'transition', packId: OWNER, revision: binding.revision },
      transition: persisted.transition,
    } as any);
    const roundTrip = JSON.parse(JSON.stringify(diskClip));
    expect(roundTrip.transition).toEqual(persisted.transition);
    expect(roundTrip.elementRef).toEqual({ id: TRANSITION_ID, kind: 'transition', packId: OWNER, revision: binding.revision });
    expect(roundTrip.volume).toBe(0.7);
    expect(roundTrip.asset).toBe('fixture.png');
    expect(roundTrip.hold).toBe(2);
    expect(Object.keys(roundTrip.transition).sort()).toEqual(['duration', 'params', 'revision', 'type']);
    expect(normalizeClipTransition(roundTrip.transition, record)).toBe(roundTrip.transition);
    expect(validateClipTransition(roundTrip.transition, createTransitionSnapshot(registry.getSnapshot())).isValid).toBe(true);

    // The assigned a96 App vendor carries the real five-argument producer API.
    // The adapter supplies its explicit implementation and retains the exact
    // I-shaped binding; A repins the App vendor before G uses I's sixth argument.
    const declaration = declareRegisteredTransition({
      record,
      transition: roundTrip.transition,
      owner: { trackId: 'V1', clipId: 'outgoing' },
      binding,
      elementRef: { id: TRANSITION_ID, kind: 'transition', packId: OWNER, revision: binding.revision },
      fps: 30,
      host: 'timeline-composition',
    }, assignedWorktreeProducer);
    expect(declaration.implementation).toEqual({ host: 'timeline-composition', id: 'cross-fade' });
    expect(declaration.spec).toEqual({ T: 15, kind: 'dissolve', align: 'end' });
    expect(declaration.params).toEqual({});
    expect(declaration.contribution).toBe(binding);

    const prepared = assignedWorktreePrepareDeclaredTrack('V1', [
      { id: 'outgoing', start: 0, duration: 30 },
      { id: 'incoming', start: 30, duration: 30 },
    ], [declaration], 'timeline-composition');
    expect(prepared.plans).toHaveLength(2);
    expect(prepared.plans[0].fadeIn).toBeNull();
    expect(prepared.plans[1].fadeIn).toEqual({ from: 0, to: 15, kind: 'dissolve' });
  });

  it('keeps protected built-ins ahead of conflicting contributions', () => {
    const { record, registry } = registerContribution();
    registry.register({
      ...record,
      transitionId: 'cross-fade',
      contributionId: 'contributed-collision',
    } as TransitionRegistryRecord);
    expect(resolveTransition('cross-fade', createTransitionSnapshot(registry.getSnapshot()))?.provenance)
      .toBe('built-in');
  });

  it('normalizes persisted data while refusing a missing or mismatched resource revision and unsupported params', () => {
    const { record, registry } = registerContribution();
    const snapshot = createTransitionSnapshot(registry.getSnapshot());
    const valid = {
      type: TRANSITION_ID,
      revision: record.implementationRevision,
      duration: 0.5,
      params: {},
    };

    expect(validateClipTransition(valid, snapshot).isValid).toBe(true);
    expect(validateClipTransition({ ...valid, revision: undefined }, snapshot).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'transitions/validation/missing-revision' })]));
    expect(validateClipTransition({ ...valid, revision: `sha256:${'0'.repeat(64)}` }, snapshot).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'transitions/validation/mismatched-revision' })]));
    expect(validateClipTransition({ ...valid, params: { ignored: true } }, snapshot).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'transitions/validation/invalid-implementation-params' })]));
  });

  it('refuses missing and mismatched revisions, owners, host, IDs, and malformed or ignored params', () => {
    const { record } = registerContribution();
    const binding = bindingFor(record);
    const base = {
      record,
      transition: { type: TRANSITION_ID, duration: 0.5, revision: binding.revision, params: {} },
      owner: { trackId: 'V1', clipId: 'outgoing' },
      binding,
      fps: 30,
      host: 'timeline-composition',
    } as const;

    expect(captureError(() => declareRegisteredTransition({
      ...base,
      transition: { type: TRANSITION_ID, duration: 0.5, params: {} },
    }, assignedWorktreeProducer)).code).toBe('transition/missing-revision');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      transition: { ...base.transition, revision: `sha256:${'0'.repeat(64)}` },
    }, assignedWorktreeProducer)).code).toBe('transition/mismatched-revision');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      host: 'unsupported-host',
    }, assignedWorktreeProducer)).code).toBe('transition/unsupported-host');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      owner: { trackId: '', clipId: 'outgoing' },
    }, assignedWorktreeProducer)).code).toBe('transition/invalid-owner');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      elementRef: { id: TRANSITION_ID, kind: 'transition', packId: 'other.owner', revision: binding.revision },
    }, assignedWorktreeProducer)).code).toBe('transition/invalid-owner');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      transition: { ...base.transition, type: 'unknown:transition' },
    }, assignedWorktreeProducer)).code).toBe('transition/unknown-id');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      transition: { ...base.transition, params: [] as any },
    }, assignedWorktreeProducer)).code).toBe('transition/malformed-params');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      transition: { ...base.transition, params: { ignored: true } },
    }, assignedWorktreeProducer)).code).toBe('transition/unsupported-params');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      binding: { ...binding, resource: { ...binding.resource, owner: 'other.owner' } },
    }, assignedWorktreeProducer)).code).toBe('transition/invalid-binding');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      binding: { ...binding, extraWritableImplementation: 'fade' },
    }, assignedWorktreeProducer)).code).toBe('transition/invalid-binding');
    expect(captureError(() => declareRegisteredTransition({
      ...base,
      record: { ...record, status: 'inactive' },
    }, assignedWorktreeProducer)).code).toBe('transition/inactive-contribution');
  });

  it('marks unsupported host, implementation, revision, and parameter claims as errors on the real registration route', () => {
    const unsupportedHost = registerContribution(contribution({
      implementation: { ...IMPLEMENTATION, host: 'other-host' } as any,
    }));
    expect(unsupportedHost.record.status).toBe('error');
    expect(unsupportedHost.record.implementationResource).toBeUndefined();
    expect(unsupportedHost.record.diagnostics?.some((diag) => diag.code === 'transitions/invalid-implementation-binding')).toBe(true);

    const unsupportedImplementation = registerContribution(contribution({
      implementation: { ...IMPLEMENTATION, id: 'wipe' } as any,
    }));
    expect(unsupportedImplementation.record.status).toBe('error');
    expect(unsupportedImplementation.record.implementationResource).toBeUndefined();

    const malformedImplementation = registerContribution(contribution({
      implementation: { ...IMPLEMENTATION, alias: 'crossfade' } as any,
    }));
    expect(malformedImplementation.record.status).toBe('error');

    const unsupportedParameters = registerContribution(contribution({
      supportedParams: ['direction'],
      defaults: { direction: 'left' },
    }));
    expect(unsupportedParameters.record.status).toBe('error');
    expect(unsupportedParameters.record.diagnostics?.some((diag) => diag.code === 'transitions/unsupported-implementation-parameters')).toBe(true);

    const mismatchedSchema = registerContribution(contribution(), {
      parameterSchema: [{ name: 'direction', label: 'Direction', description: 'Unused', type: 'select', options: [{ label: 'Left', value: 'left' }] }],
    });
    expect(mismatchedSchema.record.status).toBe('error');
    expect(mismatchedSchema.record.diagnostics?.some((diag) => diag.code === 'transitions/unsupported-implementation-parameters')).toBe(true);

    const missingRevision = registerContribution(contribution({ resourceRevision: undefined }));
    expect(missingRevision.record.status).toBe('error');
    expect(missingRevision.record.diagnostics?.some((diag) => diag.code === 'transitions/invalid-implementation-binding')).toBe(true);
  });

  it('requires a binding on the composition route and verifies the exact resource revision', () => {
    const { record } = registerContribution(contribution({ implementation: undefined }));
    const error = captureError(() => declareRegisteredTransition({
      record,
      transition: { type: TRANSITION_ID, duration: 0.5, revision: 'legacy' },
      owner: { trackId: 'V1', clipId: 'outgoing' },
      binding: {} as any,
      fps: 30,
      host: 'timeline-composition',
    }, assignedWorktreeProducer));
    expect(error).toMatchObject({ code: 'transition/binding-required' });

    const { record: active } = registerContribution();
    const binding = bindingFor(active);
    expect(validateTransitionImplementationBinding({
      ...binding,
      revision: `sha256:${'0'.repeat(64)}`,
    }, {
      ownerExtensionId: active.ownerExtensionId,
      contributionId: active.contributionId,
      transitionId: active.transitionId,
      revision: active.implementationRevision,
      resource: active.implementationResource,
    })).toContain('implementation binding revision does not match the pinned registry revision');
    expect(validateTransitionImplementationBinding({
      ...binding,
      writableImplementation: 'fade',
    })).toContain('admitted implementation binding has unexpected fields');
    expect(validateTransitionImplementationBinding({
      ...binding,
      revision: 'fnv1a-deadbeef',
    })).toContain('admitted implementation binding revision must be a lowercase SHA-256 digest');
    expect(createTransitionImplementationResource(OWNER, contribution())).toEqual(active.implementationResource);
  });
});
