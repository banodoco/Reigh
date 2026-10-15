// @vitest-environment node
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {declareAppTransition, prepareDeclaredTrack, querySceneFrame, transitionContributionIdentity,
  type AdmittedTransitionContribution, type TransitionContributionResource, type TransitionContributionReference} from '@banodoco/timeline-composition/evaluation';
import {createTransitionRegistry} from '../transitions/registry/TransitionRegistry.ts';
import type {TransitionRegistryRecord} from '../transitions/registry/types.ts';
import type {ResolvedTimelineClip, TrackDefinition} from '../types/index.ts';
import type {RenderRoute} from '../runtime/renderability.ts';
import {admitPlayerTransitions, type PlayerTransitionContext} from './playerTransitionAdmission.ts';
import {preparePlayerTrack} from './playerEvaluation.ts';
import {serializeClipForDisk} from '../lib/serialize.ts';
import {resolveTimelineConfig} from '../lib/config-utils.ts';

const track: TrackDefinition = {id: 'V1', kind: 'visual', label: 'Picture', scale: .5};
const resource = (id: 'cross-fade' | 'fade' = 'cross-fade'): TransitionContributionResource => ({
  owner: 'pack:consumer-test', id: 'consumer-test.transition.soft', kind: 'transition', transitionId: 'consumer-test:soft',
  implementation: {host: 'timeline-composition', id}, supportedParams: ['easing'], defaults: {easing: 'linear'},
});
const reference = (r: TransitionContributionResource): TransitionContributionReference => ({owner: r.owner, id: r.id,
  transitionId: r.transitionId, revision: 'sha256:' + createHash('sha256').update(transitionContributionIdentity(r)).digest('hex')});
type ProjectedRecord = Omit<TransitionRegistryRecord, 'renderability'> & {renderability: TransitionRegistryRecord['renderability']; implementationBinding: {
  resource: TransitionContributionResource; reference: TransitionContributionReference;
}};
const record = (r = resource()): ProjectedRecord => ({transitionId: r.transitionId, contributionId: r.id,
  ownerExtensionId: r.owner, renderer: () => {throw new Error('Contributed renderer must never run');}, provenance: 'bundled-extension', status: 'active',
  implementationBinding: {resource: r, reference: reference(r)},
  renderability: {determinism: 'deterministic', capabilities: ['preview', 'browser-export', 'worker-export'].map(route => ({
    route: route as RenderRoute, status: 'supported', determinism: 'deterministic'}))},
});
const clips = (rec = record()): ResolvedTimelineClip[] => [{id: 'out', track: 'V1', at: 0, hold: 2, clipType: 'media'},
  {id: 'in', track: 'V1', at: 2, hold: 2, clipType: 'media', transition: {type: rec.transitionId,
    revision: rec.implementationBinding.reference.revision, duration: 1, params: {easing: 'linear'}}}];
const context = (rec: TransitionRegistryRecord, route: RenderRoute = 'preview'): PlayerTransitionContext => {
  const registry = createTransitionRegistry();
  registry.register(rec);
  return {snapshot: registry.getSnapshot(), route};
};
const prepare = async (cs = clips(), ctx = context(record())) => {
  const contributions = await admitPlayerTransitions(cs, ctx);
  return preparePlayerTrack(track, cs, 30, 1280, 720, {...ctx, contributions});
};

describe('Player/export exact declared transition consumption', () => {
  it.each(['cross-fade', 'fade'] as const)('retains %s contribution through admission, declaration and the real shared planner', async id => {
    const rec = record(resource(id)); const cs = clips(rec); const before = JSON.stringify(cs);
    const ctx = context(rec); const contributions = await admitPlayerTransitions(cs, ctx);
    const result = preparePlayerTrack(track, cs, 30, 1280, 720, {...ctx, contributions});
    const declaration = result.declarations[0]; const admitted = contributions.get(rec.transitionId)!;
    expect(declaration.contribution).toBe(admitted);
    expect(declaration.contribution!.resource).toEqual(rec.implementationBinding.resource);
    expect(declaration.implementation).toBe(admitted.resource.implementation);
    expect(Object.isFrozen(admitted.resource)).toBe(true);
    expect(result.legacyTiming.size).toBe(0);
    expect(result.scene.tracks[0].prepared).toEqual(prepareDeclaredTrack(track.id,
      cs.map(c => ({id: c.id, start: c.at * 30, duration: 60})), result.declarations, 'timeline-composition'));
    const layers = querySceneFrame(result.scene, 45).layers;
    expect(layers.map(l => [l.clipId, l.ownFrame])).toEqual([['out',45], ['in',0]]);
    expect(layers[1].transitionOpacity).toBe(id === 'fade' ? 0 : .5);
    expect(JSON.stringify(cs)).toBe(before);
  });

  it('reloads saved unique type/revision/duration/params and re-admits transported resources', async () => {
    const rec = record(); const cs = clips(rec); const first = await prepare(cs, context(rec));
    const loaded = JSON.parse(JSON.stringify({cs: cs.map(serializeClipForDisk), rec}));
    const resolved = await resolveTimelineConfig({output: {resolution: '1280x720', fps: 30, file: 'out.mp4'},
      tracks: [track], clips: loaded.cs}, {assets: {}}, async () => {throw new Error('No media lookup expected');});
    const second = await prepare(resolved.clips, context(loaded.rec));
    expect(resolved.clips[1].transition).toEqual(cs[1].transition);
    expect(resolved.clips[1].transition!.type).toBe('consumer-test:soft');
    expect(resolved.clips[1].transition).not.toHaveProperty('implementation');
    expect(second.declarations[0].contribution).not.toBe(first.declarations[0].contribution);
    expect(second.declarations[0].contribution).toEqual(first.declarations[0].contribution);
    expect(querySceneFrame(second.scene, 45)).toEqual(querySceneFrame(first.scene, 45));
  });

  it.each([undefined, {}, {easing: 'linear'}])('accepts supported params/defaults %j without rewriting saved fields', async params => {
    const cs = clips(); cs[1].transition!.params = params;
    const result = await prepare(cs);
    expect(result.declarations[0].params).toEqual({easing: 'linear'});
    expect(cs[1].transition!.params).toBe(params);
  });
  it('accepts empty parameter declarations without inventing defaults', async () => {
    const rec = record({...resource(), supportedParams: [], defaults: {}});
    const cs = clips(rec); cs[1].transition!.params = {};
    expect((await prepare(cs, context(rec))).declarations[0].params).toEqual({});
  });
  it.each(['preview', 'browser-export', 'worker-export'] as const)('uses the same declaration/planner for %s', async route => {
    const result = await prepare(clips(), context(record(), route));
    expect(result.declarations[0].contribution!.resource.transitionId).toBe('consumer-test:soft');
    expect(querySceneFrame(result.scene, 45).layers[1].transitionOpacity).toBe(.5);
  });
  it.each(['crossfade', 'cross-fade', 'fade'])('protects builtin %s even against a malicious inactive registry record', async type => {
    const rec = {...record(), transitionId: type, status: 'inactive' as const};
    const cs = clips(); cs[1].transition = {type, duration: 1};
    const result = await prepare(cs, context(rec, 'browser-export'));
    expect(result.declarations[0].contribution).toBeUndefined();
    expect(result.declarations[0].implementation.id).toBe(type === 'fade' ? 'fade' : 'cross-fade');
  });
  it.each(['inactive', 'error'] as const)('refuses %s contributions without fallback', async status => {
    await expect(prepare(clips(), context({...record(), status}))).rejects.toMatchObject({code: 'transition/inactive-contribution'});
  });
  it('refuses unknown contributions explicitly', async () => {
    await expect(prepare(clips(), {route: 'preview'})).rejects.toMatchObject({code: 'transition/unknown-contribution'});
  });
  it.each(['ownerExtensionId', 'contributionId', 'transitionId'] as const)('refuses registry %s mismatch', async key => {
    const rec = {...record(), [key]: 'wrong'};
    // For transitionId, present the mismatched record under the requested key.
    const ctx = context(rec); if (key === 'transitionId') ctx.snapshot = {...ctx.snapshot!, get: () => rec};
    await expect(prepare(clips(), ctx)).rejects.toMatchObject({code: 'transition/reference-mismatch'});
  });
  it.each(['owner', 'id', 'transitionId', 'revision'] as const)('refuses resource reference %s mismatch', async key => {
    const rec = record(); rec.implementationBinding.reference = {...rec.implementationBinding.reference, [key]: 'wrong'};
    await expect(prepare(clips(), context(rec))).rejects.toMatchObject({code: 'transition/reference-mismatch'});
  });
  it('refuses a resource change without an explicit revision repin', async () => {
    const rec = record(); rec.implementationBinding.resource = resource('fade');
    await expect(prepare(clips(), context(rec))).rejects.toMatchObject({code: 'transition/revision-mismatch'});
  });
  it('refuses a saved stale revision even after the current resource was repinned', async () => {
    await expect(prepare(clips(), context(record(resource('fade'))))).rejects.toMatchObject({code: 'transition/reference-mismatch'});
  });
  it('refuses a previously admitted binding after registry resource replacement', async () => {
    const cs = clips(); const old = context(record()); const contributions = await admitPlayerTransitions(cs, old);
    expect(() => preparePlayerTrack(track, cs, 30, 1280, 720, {...context(record(resource('fade'))), contributions}))
      .toThrow(/stale/);
  });
  it('refuses a serialized forged binding from the same exact resource', async () => {
    const cs = clips(); const ctx = context(record()); const admitted = (await admitPlayerTransitions(cs, ctx)).get('consumer-test:soft')!;
    const forged = JSON.parse(JSON.stringify(admitted)) as AdmittedTransitionContribution;
    expect(() => preparePlayerTrack(track, cs, 30, 1280, 720, {...ctx, contributions: new Map([['consumer-test:soft', forged]])}))
      .toThrow(/has not been admitted/);
    expect(() => declareAppTransition('V1','out', cs[1].transition!, 30, 'timeline-composition', forged)).toThrow(/has not been admitted/);
  });
  it.each(['host', 'id'] as const)('refuses unsupported implementation %s without fallback', async key => {
    const rec = record(); rec.implementationBinding.resource = {...resource(), implementation: {...resource().implementation, [key]: 'unsupported'}} as TransitionContributionResource;
    await expect(prepare(clips(), context(rec))).rejects.toMatchObject({code: key === 'host' ? 'transition/unsupported-host' : 'transition/unsupported-implementation'});
  });
  it.each(['browser-export', 'worker-export'] as const)('keeps preview support separate from blocked %s', async route => {
    const rec = record(); rec.renderability = {...rec.renderability, capabilities: rec.renderability.capabilities.map(c => c.route === route ? {...c, status: 'blocked'} : c)};
    expect((await prepare(clips(), context(rec))).legacyTiming.size).toBe(0);
    await expect(prepare(clips(), context(rec, route))).rejects.toMatchObject({code: 'transition/unsupported-route'});
  });
  it.each(['preview-only','unknown','live-unbaked','process-dependent'] as const)('refuses %s export determinism', async determinism => {
    const rec = record(); rec.renderability = {...rec.renderability, determinism};
    await expect(prepare(clips(), context(rec, 'browser-export'))).rejects.toMatchObject({code:'transition/unsupported-route'});
  });
  it.each([null, [], 'linear', {easing: 'ease-in'}, {easing: 1}, {strength: 1}])('refuses malformed or nonlinear saved params %j', async params => {
    const cs = clips(); cs[1].transition!.params = params as never;
    await expect(prepare(cs)).rejects.toMatchObject({code: 'transition/invalid-params'});
  });
  it.each(['incoming-track', 'outgoing-track', 'missing-outgoing', 'duplicate-id', 'empty-track', 'empty-incoming-id', 'gap', 'overlap', 'oversized', 'component', 'element'] as const)('refuses unsupported ownership/boundary %s', async problem => {
    const cs = clips();
    if (problem === 'incoming-track') cs[1].track = 'other';
    if (problem === 'outgoing-track') cs[0].track = 'other';
    if (problem === 'missing-outgoing') cs.shift();
    if (problem === 'duplicate-id') cs[1].id = cs[0].id;
    if (problem === 'empty-incoming-id') cs[1].id = '';
    if (problem === 'gap') cs[1].at = 4;
    if (problem === 'overlap') cs[1].at = 1;
    if (problem === 'oversized') cs[1].transition!.duration = 4;
    if (problem === 'component') cs[1].clipType = 'custom';
    if (problem === 'element') cs[0].elementRef = {id:'test',kind:'effect',revision:'1'};
    const ctx = context(record()); const contributions = await admitPlayerTransitions(cs, ctx);
    expect(() => preparePlayerTrack(problem === 'empty-track' ? {...track, id: ''} : track, cs, 30, 1280, 720, {...ctx, contributions})).toThrow();
  });
  it('accepts the saved exact transition element reference without turning the media into an injected target', async () => {
    const rec = record(); const cs = clips(rec);
    cs[1].elementRef = {kind: 'transition', id: rec.transitionId, packId: rec.ownerExtensionId,
      revision: rec.implementationBinding.reference.revision};
    expect((await prepare(cs, context(rec))).declarations[0].contribution!.resource.id).toBe(rec.contributionId);
  });
  it.each(['kind', 'id', 'packId', 'revision'] as const)('refuses mismatched incoming element reference %s', async key => {
    const rec = record(); const cs = clips(rec);
    cs[1].elementRef = {kind: 'transition', id: rec.transitionId, packId: rec.ownerExtensionId,
      revision: rec.implementationBinding.reference.revision, [key]: 'wrong'} as never;
    await expect(prepare(cs, context(rec))).rejects.toMatchObject({code: 'transition/invalid-owner'});
  });
  it.each([0, -1, NaN, Infinity])('refuses invalid contributed duration %s', async duration => {
    const cs = clips(); cs[1].transition!.duration = duration;
    await expect(prepare(cs)).rejects.toMatchObject({code: 'transition/unsupported-target'});
  });
  it('refuses undeclared easing even when its value is linear', async () => {
    const rec = record({...resource(), supportedParams: [], defaults: {}});
    await expect(prepare(clips(rec), context(rec))).rejects.toMatchObject({code: 'transition/invalid-params'});
  });
  it('refuses an unsupported declared resource default', async () => {
    const rec = record(); rec.implementationBinding.resource = {...resource(), defaults: {easing: 'ease-in'}} as never;
    await expect(prepare(clips(), context(rec))).rejects.toMatchObject({code: 'transition/invalid-params'});
  });
  it('refuses legacy implementation-only bindings explicitly', async () => {
    const rec = {...record(), implementationBinding: {implementation: {host:'timeline-composition',id:'cross-fade'},resourceDigest:'fnv1a-12345678'}};
    await expect(prepare(clips(), context(rec))).rejects.toMatchObject({code:'transition/invalid-binding'});
  });
});
