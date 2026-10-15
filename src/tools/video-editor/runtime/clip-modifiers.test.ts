import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement, isValidElement, type ReactNode } from 'react';
import {
  declareModifier, DEFAULT_THEME, ModifierAdmissionError,
  type ModifierContext, type ModifierProps,
} from '@banodoco/timeline-composition/theme-api';
import { admitAppModifierTarget, composeAppClipModifiers, type AppModifierHost } from './clip-modifiers';
import { wrapWithClipEffects } from '../effects/index';
import { applyAutomationOverrides, resolveAnimatedParams, validateKeyframes } from '../keyframes/index';
import { sanitizeTimelineClipSnapshot } from '../lib/timeline-domain';
import { configToRows, rowsToConfig } from '../lib/timeline-data';
import type { ResolvedTimelineClip, TimelineConfig, ParameterSchema } from '../types/index';

const theme = { ...DEFAULT_THEME, color: DEFAULT_THEME.visual.color, type: DEFAULT_THEME.visual.type,
  motion: DEFAULT_THEME.visual.motion };
const clip: ResolvedTimelineClip = { id: 'occurrence', at: 2, track: 'v', clipType: 'media',
  hold: 2, from: 7, speed: 2, keyframeOrigin: .25 };
const content = createElement('div', { style: { overflow: 'hidden' } }, 'cropped-media');
const bounds = { status: 'known', rect: { x: 15, y: 20, width: 75, height: 60 } } as const;
const element = 'fixture.modifier.trace';
const calls: ModifierContext[] = [];
const Trace = ({ children }: ModifierProps<{ strength: number }>): ReactNode => children;
const declaration = declareModifier({ kind: 'modifier', element, hosts: ['app'], bounds: 'preserve',
  alpha: 'preserve', support: 'preserve', component: Trace,
  resolveParams(params, context) {
    calls.push(context);
    if (typeof params.strength !== 'number') throw new Error('Fixture strength must be numeric');
    return { strength: params.strength };
  } });
const host: AppModifierHost = { registry: { [element]: declaration }, theme, globalFrame: 50 };
const instances = [{ id: 'A', element, params: { strength: .2 } }, { id: 'B', element, params: { strength: .8 } }];
const run = (target = { ...clip, modifiers: instances }, frame = 10, suppliedHost: AppModifierHost | undefined = host) =>
  composeAppClipModifiers({ clip: target, content, frame, fps: 20, bounds, host: suppliedHost });

test('actual App adapter wraps one cropped subtree in authored stable order with one supplied context', () => {
  calls.length = 0;
  const b = run();
  assert.ok(isValidElement<ModifierProps<{ strength: number }>>(b));
  const a = b.props.children;
  assert.ok(isValidElement<ModifierProps<{ strength: number }>>(a));
  assert.equal(b.key, 'B'); assert.equal(a.key, 'A'); assert.strictEqual(a.props.children, content);
  assert.strictEqual(a.props.context, b.props.context);
  assert.strictEqual(a.props.context.bounds, bounds);
  assert.equal(calls.length, 2);
  assert.equal(a.props.context.frame, 10);
  assert.equal(a.props.context.keyframeFrame, 5);
  assert.equal(a.props.context.keyframeTime, .25);
  assert.equal(a.props.context.globalFrame, 50);
});

test('App adapter reuses supplied frozen and transition-handle frames without trim or speed remapping', () => {
  for (const frame of [-3, 0, 10, 39]) {
    const output = run({ ...clip, from: 100, speed: .5, modifiers: instances }, frame);
    assert.ok(isValidElement<ModifierProps<{ strength: number }>>(output));
    assert.equal(output.props.context.frame, frame);
    assert.equal(output.props.context.keyframeFrame, frame - 5);
    assert.equal(output.props.context.globalFrame, 50);
  }
});

test('legacy App adapter leaves absent modifier content identical without a host', () => {
  assert.strictEqual(composeAppClipModifiers({ clip, content, frame: 10, fps: 20, bounds, host: undefined }), content);
});

test('App adapter explicitly refuses missing admission, unsupported targets and unknown target bounds', () => {
  assert.throws(() => composeAppClipModifiers({ clip: { ...clip, modifiers: instances }, content,
    frame: 10, fps: 20, bounds, host: undefined }), /explicit modifier host/);
  assert.throws(() => run(undefined, 10, { ...host, registry: {} }), /No declared modifier/);
  assert.throws(() => admitAppModifierTarget({ ...clip, modifiers: instances }, false),
    (error: unknown) => error instanceof ModifierAdmissionError && error.code === 'unsupported-app-target');
  const findings: unknown[] = [];
  assert.throws(() => composeAppClipModifiers({ clip: { ...clip, modifiers: instances }, content, frame: 10, fps: 20,
    bounds: { status: 'unknown', reason: 'no intrinsic size' }, host: { ...host, onFinding: f => findings.push(f) } }), /no intrinsic size/);
  assert.deepEqual(findings, [{ code: 'unknown-modifier-bounds', clipId: clip.id, reason: 'no intrinsic size' }]);
});

test('actual App row projection and sanitizer preserve modifier ids, order and params through JSON roundtrip', () => {
  const config: TimelineConfig = { clips: [{ ...clip, modifiers: instances }], tracks: [{ id: 'v', kind: 'visual', label: 'Visual' }],
    output: { fps: 20, resolution: '200x100', file: 'test.mp4' } };
  const rows = configToRows(JSON.parse(JSON.stringify(config)));
  const loaded = rowsToConfig(rows.rows, rows.meta, config.output, rows.clipOrder, rows.tracks);
  assert.deepEqual(sanitizeTimelineClipSnapshot(loaded.clips[0]).modifiers, instances);
  assert.deepEqual(config.clips[0].modifiers, instances);
  assert.deepEqual(sanitizeTimelineClipSnapshot(clip), clip);
  const ordinaryRows = configToRows({ ...config, clips: [clip] });
  const ordinary = rowsToConfig(ordinaryRows.rows, ordinaryRows.meta, config.output, ordinaryRows.clipOrder, ordinaryRows.tracks);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitizeTimelineClipSnapshot(ordinary.clips[0]), 'modifiers'), false);
});

test('actual native effect wrapper refuses explicit easing and preserves ordinary content and params', () => {
  assert.strictEqual(wrapWithClipEffects(content, clip, 40, 20), content);
  for (const easing of ['linear', 'in', 'out', 'in-out', 'step', 'inOut']) {
    assert.throws(() => wrapWithClipEffects(content, { ...clip, entrance: { type: 'fade', duration: .5, params: { easing } } }, 40, 20), /cannot consume explicit animation easing/);
  }
  for (const phase of ['entrance', 'exit', 'continuous']) {
    const stored = JSON.parse(JSON.stringify({ ...clip, [phase]: { type: 'fade', duration: .5, easing: 'out' } }));
    assert.throws(() => wrapWithClipEffects(content, stored, 40, 20), /cannot consume explicit animation easing/);
  }
  const ordinary = wrapWithClipEffects(content, { ...clip, entrance: { type: 'fade', duration: .5, params: { distance: 60 } } }, 40, 20);
  assert.ok(isValidElement<{ children: ReactNode }>(ordinary));
  const effect = ordinary.props.children;
  assert.ok(isValidElement<{ params: unknown }>(effect));
  assert.deepEqual(effect.props.params, { distance: 60 });
});

test('actual App keyframe validation and evaluators refuse untyped named easing without altering legacy linear or hold', () => {
  const schema: ParameterSchema = [{ name: 'x', label: 'x', description: 'x', type: 'number', default: 0 }];
  const ordinary = [{ time: 0, value: 0, interpolation: 'linear' }, { time: 1, value: 10, interpolation: 'hold' }];
  const keys = JSON.parse(JSON.stringify(ordinary));
  assert.deepEqual(resolveAnimatedParams({ x: keys }, schema, .5), [{ name: 'x', value: 5 }]);
  keys[0].easing = 'in';
  assert.ok(validateKeyframes(keys, schema[0]).some(d => d.code === 'keyframes/unsupported-easing'));
  assert.throws(() => resolveAnimatedParams({ x: keys }, schema, .5), /named easing is not supported/);
  assert.throws(() => applyAutomationOverrides([{ clipType: 'automation', params: { enabled: true,
    target: { contributionId: 'target', parameterPath: 'x' }, keyframes: keys } }], 'target', { x: 0 }, .5), /named easing is not supported/);
  delete keys[0].easing;
  keys[0].interpolation = 'hold';
  assert.deepEqual(resolveAnimatedParams({ x: keys }, schema, .5), [{ name: 'x', value: 0 }]);
});

test('native media source structure keeps crop inside modifiers and alpha, effects and transitions outside', () => {
  const source = readFileSync(new URL('../compositions/VisualClip.tsx', import.meta.url), 'utf8');
  const adapter = readFileSync(new URL('./clip-modifiers.ts', import.meta.url), 'utf8');
  assert.match(source, /composeAppClipModifiers\(\{ clip, content, frame: evaluatedFrame/);
  assert.match(source, /<AbsoluteFill style=\{\{ opacity: clip.opacity \?\? 1 \}\}>\{modified\}<\/AbsoluteFill>/);
  assert.match(source, /wrapSpatialContent\(\(\s*<div style=\{viewportStyle\}>/);
  assert.match(source, /opacity: hasModifiers \? 1 : clip.opacity \?\? 1/);
  assert.match(source, /<VisualAsset clip=\{clip\} track=\{track\} fps=\{fps\} evaluatedFrame=\{frame\}/);
  assert.match(source, /overflow: 'hidden', \.\.\.transitionStyle/);
  assert.match(source, /wrapWithClipEffects\(content, clip/);
  assert.equal(adapter.includes('useCurrentFrame'), false);
});
