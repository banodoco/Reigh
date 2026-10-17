import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
const clock = vi.hoisted(() => ({ frame: 0 }));
vi.mock('remotion', async (original) => ({
  ...await original<typeof import('remotion')>(),
  useCurrentFrame: () => clock.frame,
  useVideoConfig: () => ({ fps: 24, width: 320, height: 180 }),
}));
import {
  ClipAnimationPhase, composeAnimations, composeClipAnimationPhase, DEFAULT_THEME,
  normalizeAnimationRefs, resolveAnimationReferences,
} from '@banodoco/timeline-composition/theme-api';
import { continuousEffects, entranceEffects, exitEffects, wrapWithClipEffects } from './index';
import { EffectErrorBoundary } from './EffectErrorBoundary';
import { builtInEffectsToRegistryRecords, createEffectRegistry, type EffectRegistryRecord } from './registry';
import type { ResolvedTimelineClip } from '../types';

const clip: ResolvedTimelineClip = { id: 'canonical', at: 7, track: 'visual', hold: 2,
  from: 3, speed: 2, keyframeOrigin: .25, opacity: .4, cropLeft: .2 };
const content = <span data-testid="media" style={{ opacity: .4 }}>media</span>;
const theme = { ...DEFAULT_THEME, color: DEFAULT_THEME.visual.color, type: DEFAULT_THEME.visual.type,
  motion: DEFAULT_THEME.visual.motion };
const builtin = () => builtInEffectsToRegistryRecords({ fade: entranceEffects.fade })[0];
function snapshot(record: EffectRegistryRecord | undefined = builtin()) {
  const registry = createEffectRegistry();
  if (record) registry.register(record);
  return registry.getSnapshot();
}
function element(node: ReactNode): ReactElement<Record<string, unknown> & { children: ReactNode }> {
  expect(isValidElement(node)).toBe(true);
  return node as ReactElement<Record<string, unknown> & { children: ReactNode }>;
}
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);

for (const phase of ['entrance', 'exit'] as const) {
  for (const easing of ['in', 'linear'] as const) {
    for (const duration of [1, 0]) {
      const boundary = phase === 'entrance' ? 0 : 48 - duration * 24;
      const frames = duration === 0 ? [boundary - 1, boundary, boundary + 1]
        : [boundary - 1, boundary, boundary + 12, boundary + 24, boundary + 25];
      it(`${phase} ${easing} duration=${duration}: real caller agrees with shared resolver at ${frames}`, () => {
        const reference = Object.freeze({ type: 'fade', duration, params: Object.freeze({ easing }) });
        const authored = { ...clip, [phase]: reference };
        const captured = JSON.stringify(authored);
        const refs = normalizeAnimationRefs(reference, 24);
        const [resolved] = resolveAnimationReferences(refs, phase);
        expect(resolved).toMatchObject({ id: 'fade', phase, durationFrames: duration * 24, easing });
        for (const frame of frames) {
          clock.frame = frame;
          const actual = wrapWithClipEffects(content, authored, 48, 24, snapshot());
          expect(element(actual).type).toBe(ClipAnimationPhase);
          expect(element(actual).props.clip).toBe(authored);
          expect(element(actual).props.reference).toBe(reference);
          const elapsed = frame - boundary;
          const active = phase === 'entrance' ? frame < duration * 24 || duration === 0 && frame === 0
            : frame >= boundary;
          const expected = active ? composeAnimations({ clip: authored, refs, phase,
            content, theme, fps: 24, elapsedFrames: elapsed }) : content;
          expect(html(actual)).toBe(html(expected));
          const shared = composeClipAnimationPhase({ clip: authored, reference, phase, children: content,
            clipFrames: 48, fps: 24, theme }, frame);
          expect(html(actual)).toBe(html(shared));
          if (active) {
            const expectedProgress = duration === 0 ? elapsed < 0 ? 0 : 1
              : Math.max(0, Math.min(1, elapsed / (duration * 24))) ** (easing === 'in' ? 2 : 1);
            expect(element(expected).props.progress).toBe(expectedProgress);
            expect((html(actual).match(/opacity:/g) ?? []).length).toBe(2); // one phase + existing media
          } else expect(html(actual)).toBe(html(content));
          expect(html(actual)).not.toContain('clip-path');
        }
        expect(JSON.stringify(authored)).toBe(captured);
      });
    }
  }
}

describe('selected contribution and unchanged legacy routing', () => {
  it('keeps the exact absent-easing components, params, durations and stack', () => {
    const authored = { ...clip, entrance: { type: 'fade', duration: 1, params: { distance: 60 } },
      exit: { type: 'fade-out', duration: .5 }, continuous: { type: 'float', intensity: .7 } };
    const exitBoundary = element(wrapWithClipEffects(content, authored, 48, 24));
    expect(exitBoundary.type).toBe(EffectErrorBoundary);
    const exit = element(exitBoundary.props.children);
    expect(exit.type).toBe(exitEffects['fade-out']);
    expect(exit.props.effectFrames).toBe(12);
    const entranceBoundary = element(exit.props.children);
    const entrance = element(entranceBoundary.props.children);
    expect(entrance.type).toBe(entranceEffects.fade);
    expect(entrance.props.params).toEqual({ distance: 60 });
    expect(entrance.props.effectFrames).toBe(24);
    const continuous = element(element(entrance.props.children).props.children);
    expect(continuous.type).toBe(continuousEffects.float);
    expect(continuous.props.intensity).toBe(.7);
    expect(continuous.props.children).toBe(content);
    const linear = element(wrapWithClipEffects(content, { ...clip,
      entrance: { type: 'fade', duration: 1, easing: 'linear' } }, 48, 24));
    expect(linear.type).toBe(ClipAnimationPhase);
  });

  it('preserves both phase adapters around the existing continuous tree without remapping clocks', () => {
    const reference = { type: 'fade', duration: 1, params: { easing: 'in' } };
    const authored = { ...clip, entrance: reference, exit: reference, continuous: { type: 'float' } };
    const exit = element(wrapWithClipEffects(content, authored, 48, 24));
    const entrance = element(exit.props.children);
    expect(exit.props.phase).toBe('exit');
    expect(entrance.props.phase).toBe('entrance');
    expect(element(entrance.props.children).type).toBe(EffectErrorBoundary);
    expect(exit.props.clip).toBe(authored);
    expect(entrance.props.clip).toBe(authored);
  });

  it.each(['inactive', 'error', 'missing', 'custom-component', 'custom-provenance', 'custom-contribution', 'owned', 'code'])(
    'refuses %s same-ID selections', (kind) => {
      let record: EffectRegistryRecord = builtin();
      const Custom = ({ children }: { children: ReactNode }) => <aside>{children}</aside>;
      if (kind === 'inactive' || kind === 'error') record = { ...record, status: kind };
      if (kind === 'custom-component') record = { ...record, component: Custom };
      if (kind === 'custom-provenance') record = { ...record, provenance: 'bundled-extension' };
      if (kind === 'custom-contribution') record = { ...record, contributionId: 'extension:fade' };
      if (kind === 'owned') record = { ...record, ownerExtensionId: 'extension' };
      if (kind === 'code') record = { ...record, code: 'custom' };
      const selected = kind === 'missing' ? createEffectRegistry().getSnapshot() : snapshot(record);
      for (const phase of ['entrance', 'exit']) expect(() => wrapWithClipEffects(content,
        { ...clip, [phase]: { type: 'fade', duration: 1, easing: 'in' } }, 48, 24, selected))
        .toThrow(/selected .* cannot consume/);
    });

  it('honors provider precedence without inventing fallback after override disposal', () => {
    const registry = createEffectRegistry();
    registry.register(builtin());
    const Custom = ({ children }: { children: ReactNode }) => <aside>{children}</aside>;
    const override = registry.register({ ...builtin(), component: Custom, contributionId: 'extension:fade',
      provenance: 'bundled-extension', ownerExtensionId: 'extension' });
    const authored = { ...clip, entrance: { type: 'fade', duration: 1, easing: 'in' } };
    expect(() => wrapWithClipEffects(content, authored, 48, 24, registry.getSnapshot())).toThrow(/selected entrance/);
    const legacy = element(wrapWithClipEffects(content, { ...clip, entrance: { type: 'fade', duration: 1 } },
      48, 24, registry.getSnapshot()));
    expect(element(legacy.props.children).type).toBe(Custom);
    override.dispose();
    expect(() => wrapWithClipEffects(content, authored, 48, 24, registry.getSnapshot())).toThrow(/selected entrance/);
    registry.register(builtin());
    expect(element(wrapWithClipEffects(content, authored, 48, 24, registry.getSnapshot())).type).toBe(ClipAnimationPhase);
  });
});

it.each([
  { easing: undefined }, { params: { easing: undefined } },
  { id: 'fade-up', easing: 'in' }, { id: 'slide-up', easing: 'in' },
  { params: { easing: 'bogus' } }, { easing: 'bogus' }, { easing: 'in', params: { easing: 'out' } },
  { params: { easing: null } }, { easing: 3 }, { duration: -1, easing: 'in' },
  { duration: NaN, easing: 'in' }, { duration: Infinity, easing: 'in' }, { duration: '1', easing: 'in' },
])('refuses malformed/conflicting canonical input %j before rendering', (patch) => {
  for (const phase of ['entrance', 'exit']) {
    const authored = { ...clip, [phase]: { type: 'fade', duration: 1, ...patch } };
    const captured = JSON.stringify(authored);
    expect(() => wrapWithClipEffects(content, authored, 48, 24, snapshot())).toThrow();
    expect(JSON.stringify(authored)).toBe(captured);
  }
});
it.each(['fade-out', 'custom:fade', 'slide-left', 'unknown'])('does not enable undeclared App progress for %s', (type) => {
  for (const phase of ['entrance', 'exit', 'continuous']) expect(() => wrapWithClipEffects(content,
    { ...clip, [phase]: { type, duration: 1, params: { easing: 'in' } } }, 48, 24, snapshot())).toThrow(/cannot consume/);
});
it('retains continuous easing refusal and shared wrong-phase/unsupported adapter anchors', () => {
  expect(() => wrapWithClipEffects(content, { ...clip, continuous: { type: 'fade', params: { easing: 'linear' } } }, 48, 24))
    .toThrow(/native effects cannot consume/);
  expect(() => resolveAnimationReferences(normalizeAnimationRefs({ type: 'fade-up', duration: 1, easing: 'in' }, 24), 'exit'))
    .toThrow(/not 'exit'/);
  expect(() => resolveAnimationReferences(normalizeAnimationRefs({ type: 'fade-out', duration: 1, easing: 'in' }, 24), 'exit'))
    .toThrow(/Unknown animation id/);
});

it.each(['in', 'out', 'in-out', 'step', 'linear'])('accepts agreeing reference/params easing %s without changing authored data', (easing) => {
  const reference = Object.freeze({ type: 'fade', duration: 1, easing, params: Object.freeze({ easing }) });
  for (const phase of ['entrance', 'exit'] as const) {
    clock.frame = phase === 'entrance' ? 12 : 36;
    const authored = { ...clip, [phase]: reference };
    const actual = element(wrapWithClipEffects(content, authored, 48, 24, snapshot()));
    expect(actual.type).toBe(ClipAnimationPhase);
    expect(actual.props.reference).toBe(reference);
    expect(html(actual)).toContain('media');
  }
});
