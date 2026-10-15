import {describe, expect, it} from 'vitest';
import {interpolateKeyframeInterval} from '@banodoco/timeline-composition/evaluation';
import {applyAutomationOverrides, resolveAnimatedParams, validateKeyframes} from './index';
import type {ClipKeyframe, ParameterSchema} from '../types';

const schema: ParameterSchema = [{name: 'x', label: 'X', description: 'Value', type: 'number', default: 0}];
const pair = (easing?: string, interpolation: 'linear' | 'hold' = 'linear'): ClipKeyframe[] => [
  {time: 2, value: 10, interpolation, ...(easing === undefined ? {} : {easing})},
  {time: 6, value: 26, interpolation: 'linear'},
];
const animated = (keys: ClipKeyframe[], time: number) => resolveAnimatedParams({x: keys}, schema, time)[0].value;
const automated = (keys: ClipKeyframe[], time: number) => applyAutomationOverrides([
  {clipType: 'automation', params: {
    target: {contributionId: 'effect', parameterPath: 'nested.x'}, keyframes: keys, enabled: true,
  }},
], 'effect', {nested: {x: -1, other: true}}, time).nested as {x: number | string | boolean; other: boolean};

// Both cases invoke actual host consumers, including automation's nested-path merge.
describe.each([
  ['animated params', animated],
  ['automation overrides', (keys: ClipKeyframe[], time: number) => automated(keys, time).x],
] as const)('%s outgoing easing', (_name, evaluate) => {
  it.each([
    ['in', [.0625, .25, .5625]],
    ['out', [.4375, .75, .9375]],
    ['in-out', [.125, .5, .875]],
  ] as const)('evaluates canonical %s vectors at .25/.5/.75', (easing, expected) => {
    for (const [i, time] of [3, 4, 5].entries()) {
      expect(evaluate(pair(easing), time)).toBe(10 + 16 * expected[i]);
    }
  });

  it('clamps to exact endpoints and holds step until the exact end', () => {
    for (const easing of ['linear', 'in', 'out', 'in-out', 'step']) {
      for (const time of [-10, 0, 2]) expect(evaluate(pair(easing), time)).toBe(10);
      for (const time of [6, 20]) expect(evaluate(pair(easing), time)).toBe(26);
    }
    expect(evaluate(pair('step'), 5.999999)).toBe(10);
  });

  it('uses the outgoing key and applies the shared curve exactly once', () => {
    const keys = pair('in');
    keys[1].easing = 'out';
    keys.push({time: 10, value: 42, interpolation: 'linear'});
    expect(evaluate(keys, 3)).toBe(interpolateKeyframeInterval(10, 26, 3, 2, 6, 'linear', 'in'));
    expect(evaluate(keys, 3)).toBe(11); // double in would produce 10.0625
    expect(evaluate(keys, 7)).toBe(33);
    expect(evaluate(keys, 6)).toBe(26);
  });

  it('preserves absent linear/hold and lets explicit linear override hold', () => {
    expect(evaluate(pair(), 3)).toBe(14);
    expect(evaluate(pair(undefined, 'hold'), 3)).toBe(10);
    expect(evaluate(pair('linear', 'hold'), 3)).toBe(14);
    expect(evaluate(pair('in', 'hold'), 3)).toBe(11);
  });

  it.each(['inOut', 'inout', 'in_out', 'ease-in-out', 'ease-in', 'ease-out'])(
    'normalizes %s through the shared resolver', easing => {
      const canonical = easing === 'ease-in' ? 'in' : easing === 'ease-out' ? 'out' : 'in-out';
      expect(evaluate(pair(easing), 3)).toBe(evaluate(pair(canonical), 3));
    },
  );

  it.each([['before', 'after'], [false, true]] as const)('holds nonnumeric %s → %s', (a, b) => {
    for (const easing of [undefined, 'linear', 'step']) {
      const keys = pair(easing, 'hold');
      keys[0].value = a; keys[1].value = b;
      expect(evaluate(keys, 3)).toBe(a);
      expect(evaluate(keys, 6)).toBe(b);
    }
    for (const easing of ['in', 'out', 'in-out']) {
      const keys = pair(easing); keys[0].value = a; keys[1].value = b;
      expect(() => evaluate(keys, 3)).toThrow(/numeric/);
    }
  });

  it('rejects a nonlinear numeric-to-string interval', () => {
    const keys = pair('in'); keys[1].value = 'end';
    for (const time of [0, 3, 6, 20]) expect(() => evaluate(keys, time)).toThrow(/numeric/);
  });

  it.each(['unknown', 'constructor', '__proto__', ''])('refuses unknown name %j even at a clamp boundary', easing => {
    expect(() => evaluate(pair(easing), 3)).toThrow(/unknown motion easing/);
    expect(() => evaluate(pair(easing), 20)).toThrow(/unknown motion easing/);
  });

  it.each([NaN, Infinity, -Infinity])('refuses nonfinite time and values %s for explicit easing', value => {
    expect(() => evaluate(pair('in'), value)).toThrow(/finite/);
    const badTime = pair('in'); badTime[0].time = value;
    expect(() => evaluate(badTime, 3)).toThrow(/finite/);
    const badValue = pair('in'); badValue[0].value = value;
    expect(() => evaluate(badValue, 3)).toThrow(/finite/);
    const badEnd = pair('in'); badEnd[1].value = value;
    for (const time of [0, 3, 6, 20]) expect(() => evaluate(badEnd, time)).toThrow(/finite/);
    const badEndTime = pair('in'); badEndTime[1].time = value;
    // Legacy invalid-time filtering still drops absent-easing entries.
    expect(evaluate(badEndTime, 3)).toBe(10);
  });

  it('refuses invalid easing and interpolation without silently linearizing', () => {
    for (const easing of [null, 3, {}, undefined]) {
      const keys = pair('in'); Object.assign(keys[0], {easing});
      expect(() => evaluate(keys, 3)).toThrow(/named string/);
    }
    const keys = pair('in'); Object.assign(keys[0], {interpolation: 'bezier'});
    expect(() => evaluate(keys, 3)).toThrow(/linear\|hold/);
  });

  it('retains stable sorting, first duplicate, zero-length/single-key behavior and input identity', () => {
    const keys = [pair('in')[1], pair('in')[0], {...pair('out')[0], value: 99}];
    const before = structuredClone(keys);
    expect(evaluate(keys, 3)).toBe(11);
    expect(evaluate(keys, 2)).toBe(10);
    expect(evaluate([keys[1]], 3)).toBe(10);
    expect(keys).toEqual(before);
  });
});

it('preserves the selected target clock, origin and negative local key time', () => {
  const keys = pair('in').map(k => ({...k, time: k.time - 3}));
  const clip = {at: 10, keyframeOrigin: 1, from: 50, speed: 9};
  // Already-selected target time 11 -> key time 0 -> progress .25.
  expect(resolveAnimatedParams({x: keys}, schema, 11, clip)[0].value).toBe(11);
  const retimedMedia = {...clip, from: 0, speed: .5};
  expect(resolveAnimatedParams({x: keys}, schema, 11, retimedMedia)).toEqual(
    resolveAnimatedParams({x: keys}, schema, 11, clip),
  );
  expect(resolveAnimatedParams({x: keys}, schema, 10.5, clip)[0].value).toBe(10.25);
});

it('preserves automation targeting, disabled curves and unrelated nested params', () => {
  expect(automated(pair('out'), 3)).toEqual({x: 17, other: true});
  const current = {x: 7};
  expect(applyAutomationOverrides([{clipType: 'automation', params: {
    target: {contributionId: 'other', parameterPath: 'x'}, keyframes: pair('invalid'),
  }}], 'effect', current, 3)).toBe(current);
  expect(applyAutomationOverrides([{clipType: 'automation', params: {
    target: {contributionId: 'effect', parameterPath: 'x'}, enabled: false, keyframes: pair('invalid'),
  }}], 'effect', current, 3)).toBe(current);
});

it('validates admitted names and aliases and reports invalid/nonlinear nonnumeric easing', () => {
  for (const easing of ['linear', 'in', 'out', 'in-out', 'step', 'inOut', 'ease-in']) {
    expect(validateKeyframes(pair(easing), schema[0])).toEqual([]);
  }
  expect(validateKeyframes(pair('bogus'), schema[0]).some(d => d.code === 'keyframes/invalid-easing')).toBe(true);
  const mixed = pair('in'); mixed[1].value = 'end';
  expect(validateKeyframes(mixed, schema[0]).some(d => d.code === 'keyframes/invalid-number-value')).toBe(true);
});
