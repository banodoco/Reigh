// @vitest-environment jsdom
import {createHash, webcrypto} from 'node:crypto';
import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {transitionContributionIdentity, type TransitionContributionResource} from '@banodoco/timeline-composition/evaluation';
import {createTransitionRegistry} from '../transitions/registry/TransitionRegistry.ts';
import type {TransitionRegistryRecord} from '../transitions/registry/types.ts';
import type {ResolvedTimelineClip, TrackDefinition} from '../types/index.ts';
import {usePlayerTrackEvaluation} from './usePlayerTrackEvaluation.ts';
const host = vi.hoisted(() => ({worker: false, browser: false, delay: vi.fn(() => 42), resume: vi.fn(), cancel: vi.fn()}));
vi.mock('remotion', () => ({useRemotionEnvironment: () => ({isRendering:host.worker,isClientSideRendering:host.browser}),
  delayRender: host.delay, continueRender: host.resume, cancelRender: host.cancel}));
const track: TrackDefinition = {id:'V1', kind:'visual',label:'Picture'};
function fixture() {
  const resource: TransitionContributionResource = {owner:'pack:hook',id:'hook.soft',kind:'transition',transitionId:'hook:soft',
    implementation:{host:'timeline-composition',id:'cross-fade'},supportedParams:[],defaults:{}};
  const revision = 'sha256:' + createHash('sha256').update(transitionContributionIdentity(resource)).digest('hex');
  const registry = createTransitionRegistry();
  const rec: TransitionRegistryRecord & {implementationBinding: unknown} = {transitionId:resource.transitionId,
    contributionId:resource.id, ownerExtensionId:resource.owner, renderer:()=>({}),provenance:'bundled-extension',status:'active',
    implementationBinding: {resource,reference:{owner:resource.owner,id:resource.id,transitionId:resource.transitionId,revision}},
    renderability:{determinism:'deterministic',capabilities:['preview','browser-export','worker-export'].map(route=>({
      route:route as 'preview'|'browser-export'|'worker-export',status:'supported',determinism:'deterministic'}))}};
  registry.register(rec);
  const clips: ResolvedTimelineClip[] = [{id:'a',track:'V1',at:0,hold:2,clipType:'media'},
    {id:'b',track:'V1',at:2,hold:2,clipType:'media',transition:{type:'hook:soft',revision,duration:1}}];
  return {registry,rec,clips};
}
beforeEach(() => {host.worker=false;host.browser=false;vi.clearAllMocks();vi.stubGlobal('crypto', webcrypto);});
afterEach(() => vi.unstubAllGlobals());

describe('shared Player/export admission lifecycle', () => {
  it.each(['preview','browser','worker'] as const)('admits before exposing a %s plan', async route => {
    host.browser=route==='browser'; host.worker=route==='worker';
    const {registry,clips}=fixture(); const snapshot=registry.getSnapshot();
    const {result}=renderHook(()=>usePlayerTrackEvaluation(track,clips,30,1280,720,snapshot));
    expect(result.current.status).toBe('pending');
    await waitFor(()=>expect(result.current.status).toBe('ready'));
    if(result.current.status==='ready') expect(result.current.evaluation.declarations[0].contribution!.resource.transitionId).toBe('hook:soft');
    expect(host.delay).toHaveBeenCalledTimes(route==='preview'?0:1);
    if(route!=='preview') expect(host.resume).toHaveBeenCalledWith(42);
    expect(host.cancel).not.toHaveBeenCalled();
  });
  it('exposes refusal in preview instead of a fallback plan', async () => {
    const {registry,clips}=fixture(); registry.unregister('hook:soft'); const snapshot=registry.getSnapshot();
    const {result}=renderHook(()=>usePlayerTrackEvaluation(track,clips,30,1280,720,snapshot));
    await waitFor(()=>expect(result.current.status).toBe('refused'));
    if(result.current.status==='refused') expect(result.current.error.message).toMatch(/not registered/);
    expect(result.current).not.toHaveProperty('evaluation');
    expect(host.cancel).not.toHaveBeenCalled();
  });
  it('reports a host without SHA-256 admission support explicitly', async () => {
    vi.stubGlobal('crypto', {});
    const {registry,clips}=fixture(); const snapshot=registry.getSnapshot();
    const {result}=renderHook(()=>usePlayerTrackEvaluation(track,clips,30,1280,720,snapshot));
    await waitFor(()=>expect(result.current.status).toBe('refused'));
    if(result.current.status==='refused') expect(result.current.error).toMatchObject({code:'transition/unsupported-host'});
    expect(result.current).not.toHaveProperty('evaluation');
  });
  it.each(['browser','worker'] as const)('cancels %s export when an otherwise preview-capable record blocks the route', async route => {
    host.browser=route==='browser';host.worker=route==='worker';
    const {registry,rec,clips}=fixture(); registry.updateRecord('hook:soft',()=>({...rec,
      renderability:{determinism:'preview-only',capabilities:[{route:'preview',status:'supported',determinism:'preview-only'}]}}));
    const snapshot=registry.getSnapshot();
    const {result}=renderHook(()=>usePlayerTrackEvaluation(track,clips,30,1280,720,snapshot));
    await waitFor(()=>expect(result.current.status).toBe('refused'));
    expect(host.cancel).toHaveBeenCalledWith(expect.objectContaining({code:'transition/unsupported-route'}));
    expect(result.current).not.toHaveProperty('evaluation');
  });
  it('invalidates a ready admission immediately when the registry becomes inactive', async () => {
    const {registry,clips}=fixture();
    const {result,rerender}=renderHook(({snapshot})=>usePlayerTrackEvaluation(track,clips,30,1280,720,snapshot),
      {initialProps:{snapshot:registry.getSnapshot()}});
    await waitFor(()=>expect(result.current.status).toBe('ready'));
    registry.updateRecord('hook:soft',rec=>({...rec,status:'inactive'}));
    rerender({snapshot:registry.getSnapshot()});
    expect(result.current.status).toBe('pending');
    await waitFor(()=>expect(result.current.status).toBe('refused'));
    expect(result.current).not.toHaveProperty('evaluation');
  });
  it('discards late admission from an obsolete snapshot and balances the export delay on unmount', async () => {
    host.browser=true;
    const {registry,clips}=fixture();
    let finish: (()=>void)|undefined;
    vi.stubGlobal('crypto',{subtle:{digest: async (...args: Parameters<typeof webcrypto.subtle.digest>) => {
      await new Promise<void>(resolve=>{finish=resolve;});
      return webcrypto.subtle.digest(...args);
    }}});
    const {result,rerender,unmount}=renderHook(({snapshot})=>usePlayerTrackEvaluation(track,clips,30,1280,720,snapshot),
      {initialProps:{snapshot:registry.getSnapshot()}});
    expect(result.current.status).toBe('pending');
    registry.unregister('hook:soft');rerender({snapshot:registry.getSnapshot()});
    await waitFor(()=>expect(result.current.status).toBe('refused'));
    await act(async()=>{finish!();await new Promise(resolve=>setTimeout(resolve,0));});
    expect(result.current.status).toBe('refused');
    unmount();expect(host.resume).toHaveBeenCalledWith(42);
  });
  it('keeps builtin-only planning synchronous without async admission delays', () => {
    const {registry,clips}=fixture(); clips[1].transition={type:'crossfade',duration:1}; const snapshot=registry.getSnapshot();
    const {result}=renderHook(()=>usePlayerTrackEvaluation(track,clips,30,1280,720,snapshot));
    expect(result.current.status).toBe('ready');expect(host.delay).not.toHaveBeenCalled();
  });
});
