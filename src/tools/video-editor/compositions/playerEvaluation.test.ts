import {describe, expect, it} from 'vitest';
import {querySceneFrame} from '@banodoco/timeline-composition/evaluation';
import {preparePlayerTrack} from './playerEvaluation.ts';
import {boundCanonicalConfigClips} from '../lib/canonicalRenderBounds.ts';
import {projectOutputTimelineConfig} from '../data/timelineOutputProjection.ts';
import type {ResolvedTimelineClip, ResolvedTimelineConfig, TrackDefinition} from '../types/index.ts';

const track: TrackDefinition = {id: 'V1', kind: 'visual', label: 'Picture', scale: .5};
const clip = (id: string, at: number, extra: Partial<ResolvedTimelineClip> = {}): ResolvedTimelineClip => ({
  id, track: track.id, at, hold: 2, clipType: 'media', asset: id,
  assetEntry: {file: `${id}.jpg`, src: `https://assets.test/${id}.jpg`, type: 'image/jpeg'}, ...extra,
});
const prepare = (clips: ResolvedTimelineClip[]) => preparePlayerTrack(track, clips, 30, 1280, 720);

describe('Player shared scene boundary', () => {
  it('uses half-open shared cuts with stable painter identity and sanitized source URLs', () => {
    const a = clip('occurrence-A/layer', 0), b = clip('occurrence-B/layer', 2);
    const {scene, clips} = prepare([b, a]);
    expect(clips).toEqual([a, b]);
    expect(querySceneFrame(scene, 59).layers.map(layer => layer.clipId)).toEqual([a.id]);
    expect(querySceneFrame(scene, 60).layers.map(layer => layer.clipId)).toEqual([b.id]);
    expect(querySceneFrame(scene, 120).layers).toEqual([]);
    expect(scene.assets.assets[a.id].file).toBe(a.assetEntry!.src);
    expect(scene.tracks[0].track.scale).toBe(.5);
    expect(a.assetEntry!.file).toBe(`${a.id}.jpg`);
  });

  it.each(['crossfade', 'cross-fade', 'fade'])('converts incoming %s to one outgoing shared boundary', type => {
    const a = clip('outgoing', 0), b = clip('incoming', 2, {transition: {type, duration: 1}});
    const {scene, legacyTiming} = prepare([b, a]);
    expect(legacyTiming.size).toBe(0);
    const plans = scene.tracks[0].prepared.plans;
    expect(plans[0].fadeIn).toBeNull();
    expect(plans[1]).toMatchObject({drawStart: 30, drawDuration: 90, ownOffset: 30});
    const layers = querySceneFrame(scene, 45).layers;
    expect(layers.map(layer => [layer.clipId, layer.ownFrame])).toEqual([['outgoing',45],['incoming',0]]);
    expect(layers[1].transitionOpacity).toBe(type === 'fade' ? 0 : .5);
    expect(plans[0].fadeOut !== null).toBe(type === 'fade');
    expect(b.transition).toEqual({type, duration: 1});
  });

  it.each(['wipe', 'extension-missing'])('preserves %s host semantics without a dissolve substitution', type => {
    const {scene, legacyTiming} = prepare([clip('a', 0), clip('b', 2, {transition: {type, duration: 1}})]);
    expect([...legacyTiming]).toEqual([1,0]);
    expect(scene.tracks[0].prepared.plans.every(plan => !plan.fadeIn && !plan.fadeOut)).toBe(true);
  });

  it.each([4, 1])('preserves legacy gap/overlap transition timing at %ss', at => {
    const {legacyTiming} = prepare([clip('a', 0), clip('b', at, {transition: {type: 'crossfade', duration: 1}})]);
    expect(legacyTiming.has(0)).toBe(true);
    expect(legacyTiming.has(1)).toBe(true);
  });

  it('preserves unsupported neighboring transition chains as one legacy host path', () => {
    const {scene, legacyTiming} = prepare([clip('a',0),
      clip('b',2,{transition:{type:'crossfade',duration:1}}),
      clip('c',4,{transition:{type:'wipe',duration:1}})]);
    expect(legacyTiming.size).toBe(3);
    expect(scene.tracks[0].prepared.plans.every(plan => !plan.fadeIn && !plan.fadeOut)).toBe(true);
  });

  it('applies the element/media speed once and retains source mapping in the host', () => {
    const source = clip('speed', 1, {hold: undefined, from: 11, to: 15, speed: 2, source_uuid: 'source',
      params: {opaque: true}, app: {canonicalTiming: {occurrenceStartMs: 1000, occurrenceDurationMs: 2000}}});
    const {scene, clips} = prepare([source]);
    expect(scene.tracks[0].prepared.plans[0].ownDuration).toBe(60);
    expect(clips[0]).toBe(source);
    expect(clips[0]).toMatchObject({from:11,to:15,speed:2,source_uuid:'source',params:{opaque:true}});
    expect(prepare([clip('invalid-speed', 0, {speed:0})]).scene.tracks[0].prepared.plans[0].ownDuration).toBe(60);
  });

  it('projects output roles before evaluation and clamps canonical occurrences before draw planning', () => {
    const config: ResolvedTimelineConfig = {output:{resolution:'1280x720',fps:30,file:'out.mp4'},
      tracks:[track,{id:'source',kind:'visual',label:'Source',role:'source'}],registry:{},clips:[
        clip('hidden-source',0,{track:'source'}), clip('occurrence/layer',0,{hold:10,
          app:{canonicalTiming:{occurrenceStartMs:0,occurrenceDurationMs:1000}}}),
      ]};
    const output = projectOutputTimelineConfig(config).config;
    const {scene} = prepare(boundCanonicalConfigClips(output.clips));
    expect(querySceneFrame(scene,29).layers.map(layer => layer.clipId)).toEqual(['occurrence/layer']);
    expect(querySceneFrame(scene,30).layers).toEqual([]);
    expect(config.clips).toHaveLength(2);
  });

  it('keeps text and card identities and unknown component support separate', () => {
    const {scene, clips} = prepare([clip('text',0,{clipType:'text',text:{content:'Legacy'}}),
      clip('card',0,{clipType:'text-card',params:{content:'Card'}})]);
    expect(clips.map(clip => clip.clipType)).toEqual(['text','text-card']);
    const layers = querySceneFrame(scene,10).layers;
    expect(layers.map(layer => layer.clipId)).toEqual(['text','card']);
    expect(layers.every(layer => layer.visible === 'unknown')).toBe(true);
  });
});
