import {describe, expect, it} from 'vitest';
import {declareKeyframeOrigin, resolveAnimatedParams, timelineKeyframeTime} from './index';
import {sanitizeTimelineClipSnapshot} from '../lib/timeline-domain';
import type {ClipKeyframe, ParameterSchema} from '../types';
const schema: ParameterSchema = [{name:'x',label:'x',description:'position',type:'number',default:0}];
const keys: Record<string, ClipKeyframe[]> = {x:[{time:10,value:2,interpolation:'linear'},{time:12,value:8,interpolation:'hold'},{time:14,value:20,interpolation:'linear'}]};

describe('declared clip keyframe origin', () => {
  it('preserves legacy timeline keys and linear/hold values exactly at keys and between keys', () => {
    const legacy = {at:10.1234567, keyframes:keys};
    const declared = declareKeyframeOrigin(legacy, 'app-seconds');
    expect(declared.keyframes).toBe(keys);
    for (const t of [0,10,11,12,13,14,20]) expect(resolveAnimatedParams(keys,schema,t,declared)).toEqual(resolveAnimatedParams(keys,schema,t));
  });
  it('samples clip-local seconds through the existing interpolation for an explicit zero origin', () => {
    const local = {x:keys.x.map(k=>({...k,time:k.time-10}))};
    const clip = {at:10,keyframeOrigin:0};
    for (const t of [10,11,12,13,14]) expect(resolveAnimatedParams(local,schema,t,clip)).toEqual(resolveAnimatedParams(keys,schema,t));
    expect(timelineKeyframeTime(clip,11)).toBe(1);
  });
  it('does not clamp negative declared key time or introduce media trim/speed into the clock', () => {
    const local = {x:[{time:-1,value:0,interpolation:'linear' as const},{time:1,value:10,interpolation:'linear' as const}]};
    const clip = {at:10,keyframeOrigin:1,from:3,to:9,speed:2};
    expect(resolveAnimatedParams(local,schema,10.5,clip)[0].value).toBe(2.5);
    expect(resolveAnimatedParams(local,schema,10.5,{...clip,from:5,speed:0.5})).toEqual(resolveAnimatedParams(local,schema,10.5,clip));
  });
});

it('retains a declared origin and all keys in the existing disk sanitizer', () => {
  const clip = {id:'clip',at:3.125,track:'v',hold:3,keyframeOrigin:-3.125,keyframes:keys};
  expect(sanitizeTimelineClipSnapshot(clip)).toEqual(clip);
});
