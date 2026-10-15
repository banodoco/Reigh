import { describe, expect, it, vi } from 'vitest';
import { AstridElementOperationAdapter, createElementTimelineRoutes } from './element-adapter.ts';
import { buildReighAgentElementContext } from './element-contract.ts';
import { ASTRID_EFFECT_CATALOG } from './astrid-element-catalog.ts';
import { configToRows, rowsToConfig } from '../lib/timeline-data.ts';
import type { TimelineConfig } from '../types/index.ts';

function context() {
  return buildReighAgentElementContext({
    astridTransitions: [{ transitionId: 'cross-fade', provenance: 'astrid-catalog' }],
    effects: [{ id: 'glow', name: 'Glow', is_public: true }],
    clips: [
      { id: 'a', trackId: 'picture', at: 0, duration: 2 },
      { id: 'b', trackId: 'picture', at: 2, duration: 2 },
    ],
  });
}

function documentPayload() {
  return {
    config: {
      output: { resolution: '1280x720', fps: 30, file: 'out.mp4' },
      clips: [
        { id: 'a', at: 0, track: 'picture', hold: 2 },
        { id: 'b', at: 2, track: 'picture', hold: 2 },
      ],
    },
    registry: {},
    config_version: 7,
  };
}

describe('Astrid element operation adapter', () => {
  it('uses the active data provider CAS path to apply and reload an element', async () => {
    const ownedContext = buildReighAgentElementContext({ astridEffects: ASTRID_EFFECT_CATALOG });
    const payload = documentPayload();
    const registry = { assets: { source: { type: 'image/png', file: 'managed:source' } } };
    let config = payload.config as TimelineConfig;
    let configVersion = payload.config_version;
    let storedRegistry = registry;
    const provider = {
      loadTimeline: vi.fn(async () => ({ config, configVersion })),
      loadAssetRegistry: vi.fn(async () => storedRegistry),
      saveTimeline: vi.fn(async (_timelineId, nextConfig, expectedVersion, nextRegistry) => {
        if (expectedVersion !== configVersion) throw new Error('stale timeline version');
        config = nextConfig;
        storedRegistry = nextRegistry ?? storedRegistry;
        configVersion += 1;
        return configVersion;
      }),
    };
    const adapter = new AstridElementOperationAdapter(
      ownedContext,
      createElementTimelineRoutes(provider),
      'astrid-intro',
    );
    const entry = ownedContext.catalog.find((candidate) => candidate.id === 'text-card' && candidate.packId === 'rendering')!;
    const element = { id: entry.id, kind: entry.kind, revision: entry.revision, packId: entry.packId };

    const applied = await adapter.execute({
      name: 'timeline.apply_element', project: 'astrid-intro', timeline: 'main', expected_version: 7,
      clip_id: 'a', placement: 'overlay', element,
    });

    expect(provider.loadTimeline).toHaveBeenCalledWith('main');
    expect(provider.loadAssetRegistry).toHaveBeenCalledWith('main');
    expect(provider.saveTimeline).toHaveBeenCalledWith('main', expect.objectContaining({
      clips: expect.arrayContaining([expect.objectContaining({ elementRef: element })]),
    }), 7, registry);
    expect(applied.config_version).toBe(8);

    const reloaded = await createElementTimelineRoutes(provider).get('main');
    expect((reloaded.config as TimelineConfig).clips.some((clip) => clip.elementRef?.revision === entry.revision)).toBe(true);
    await expect(adapter.execute({
      name: 'timeline.apply_element', project: 'astrid-intro', timeline: 'main', expected_version: 7,
      clip_id: 'a', placement: 'overlay', element,
    })).rejects.toThrow('Stale timeline version');
    expect(provider.saveTimeline).toHaveBeenCalledTimes(1);
  });

  it('preserves owner and revision through editor serialization and save/reload', async () => {
    const ownedContext = buildReighAgentElementContext({ astridEffects: ASTRID_EFFECT_CATALOG });
    for (const packId of ['local', 'rendering']) {
      let payload = { ...documentPayload(), config: {
        ...documentPayload().config, tracks: [{ id: 'picture', kind: 'visual' }],
      } };
      const save = vi.fn(async (_ref, input) => {
        const config = input.config as TimelineConfig;
        const rows = configToRows(config);
        const serialized = rowsToConfig(rows.rows, rows.meta, config.output, rows.clipOrder, rows.tracks);
        payload = JSON.parse(JSON.stringify({ ...payload, config: serialized, config_version: 8 }));
        return payload;
      });
      const adapter = new AstridElementOperationAdapter(ownedContext, { get: vi.fn(async () => payload), save }, 'astrid-intro');
      const entry = ownedContext.catalog.find((candidate) => candidate.id === 'text-card' && candidate.packId === packId)!;
      const element = { id: entry.id, kind: entry.kind, revision: entry.revision, packId };
      await adapter.execute({ name: 'timeline.apply_element', project: 'astrid-intro', timeline: 'main', expected_version: 7, clip_id: 'a', placement: 'overlay', element });
      expect((payload.config as TimelineConfig).clips.find((clip) => clip.elementRef)?.elementRef).toEqual(element);
      const reloaded = new AstridElementOperationAdapter(ownedContext, { get: vi.fn(async () => payload), save }, 'astrid-intro');
      await expect(reloaded.execute({ name: 'timeline.apply_element', project: 'astrid-intro', timeline: 'main', expected_version: 8, clip_id: 'a', placement: 'overlay', element: { ...element, packId: 'unknown' } })).rejects.toThrow('not registered');
      await expect(reloaded.execute({ name: 'timeline.apply_element', project: 'astrid-intro', timeline: 'main', expected_version: 8, clip_id: 'a', placement: 'overlay', element: { ...element, packId: packId === 'local' ? 'rendering' : 'local' } })).rejects.toThrow('revision is stale');
      expect(save).toHaveBeenCalledTimes(1);
    }
  });
  it('applies a pinned transition through one expected-version CAS save', async () => {
    const payload = documentPayload();
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => payload),
      save,
    }, 'astrid-intro');

    const result = await adapter.execute({
      name: 'timeline.apply_transition',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      from_clip: 'a',
      to_clip: 'b',
      transition: {
        id: 'cross-fade',
        kind: 'transition',
        revision: context().catalog.find((entry) => entry.id === 'cross-fade')?.revision,
      },
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1].expectedVersion).toBe(7);
    expect(result.config?.clips[1].elementRef?.id).toBe('cross-fade');
    expect(result.config?.clips[1].transition).toMatchObject({ type: 'cross-fade', duration: 8 / 30 });
  });

  it('uses visible hold duration when testing transition adjacency', async () => {
    const payload = documentPayload();
    payload.config.clips[0].hold = 4;
    (payload.config.clips[0] as Record<string, unknown>).speed = 2;
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => payload),
      save,
    }, 'astrid-intro');

    await expect(adapter.execute({
      name: 'timeline.apply_transition',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      from_clip: 'a',
      to_clip: 'b',
      transition: {
        id: 'cross-fade',
        kind: 'transition',
        revision: context().catalog.find((entry) => entry.id === 'cross-fade')?.revision,
      },
    })).resolves.toBeDefined();
  });

  it('rejects an operation against a stale loaded document before writing', async () => {
    const payload = documentPayload();
    const save = vi.fn();
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => ({ ...payload, config_version: 8 })),
      save,
    }, 'astrid-intro');

    await expect(adapter.execute({
      name: 'timeline.set_clip_fade',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      fade_in: 0.5,
    })).rejects.toThrow('Stale timeline version');
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps a validated draft previewable by pinning its source in the element registry', async () => {
    const payload = documentPayload();
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => payload),
      save,
    }, 'astrid-intro');
    const source = 'export default function Draft({ clip }) { return <div data-testid="draft-preview">{clip.id}</div>; }';

    const draft = await adapter.execute({
      name: 'elements.create_draft',
      id: 'draft-glow',
      kind: 'effect',
      label: 'Draft glow',
      source,
    });
    const revision = draft.draft?.revision ?? '';
    expect(revision).toBeTruthy();

    const validation = await adapter.execute({
      name: 'elements.validate',
      draft_id: 'draft-glow',
      target: ['browser_preview'],
    });
    expect(validation.validation?.valid).toBe(true);
    expect(validation.draft?.capabilities.browserPreview).toBe('supported');

    const applied = await adapter.execute({
      name: 'timeline.apply_element',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      placement: 'overlay',
      element: { id: 'draft-glow', kind: 'effect', revision },
    });

    const appliedClip = applied.config?.clips.find((clip) => clip.elementRef?.id === 'draft-glow');
    expect(appliedClip?.generation?.sequence_lane).toBeUndefined();
    expect(appliedClip?.elementRef).toEqual({
      id: 'draft-glow',
      kind: 'effect',
      revision,
    });
    expect(applied.config?.app?.elements).toMatchObject({
      'draft-glow': { kind: 'effect', revision, source },
    });
  });

  it('rejects a draft before validation when its Remotion source is broken', async () => {
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => documentPayload()),
      save: vi.fn(),
    }, 'astrid-intro');
    await adapter.execute({
      name: 'elements.create_draft',
      id: 'broken-glow',
      kind: 'effect',
      label: 'Broken glow',
      source: 'export default function Broken(',
    });
    const validation = await adapter.execute({ name: 'elements.validate', draft_id: 'broken-glow' });
    expect(validation.validation?.valid).toBe(false);
    await expect(adapter.execute({
      name: 'timeline.apply_element',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      placement: 'overlay',
      element: { id: 'broken-glow', kind: 'effect', revision: 'draft-broken-glow' },
    })).rejects.toThrow('must pass elements.validate');
  });

  it('creates a deterministic overlay clip when placement is overlay', async () => {
    const payload = documentPayload();
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const adapter = new AstridElementOperationAdapter(context(), { get: vi.fn(async () => payload), save }, 'astrid-intro');
    const element = context().catalog.find((entry) => entry.id === 'glow');
    const result = await adapter.execute({
      name: 'timeline.apply_element',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      at: 0.5,
      duration: 1.25,
      placement: 'overlay',
      element: { id: 'glow', kind: 'effect', revision: element?.revision },
    });
    expect(result.config?.clips).toContainEqual(expect.objectContaining({
      id: 'element-glow-500',
      at: 0.5,
      clipType: 'glow',
      hold: 1.25,
      elementRef: { id: 'glow', kind: 'effect', revision: element?.revision },
    }));
  });

  it('projects an animation application into the backend animation reference field', async () => {
    const payload = documentPayload();
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const animationContext = buildReighAgentElementContext({
      effects: [{ id: 'glow', name: 'Glow', is_public: true }],
      astridTransitions: [{ transitionId: 'cross-fade', provenance: 'astrid-catalog' }],
      astridAnimations: [{ id: 'fade-up', name: 'Fade Up', revision: 'rev-animation', provenance: 'astrid-catalog' }],
      clips: [
        { id: 'a', trackId: 'picture', at: 0, duration: 2 },
        { id: 'b', trackId: 'picture', at: 2, duration: 2 },
      ],
    });
    const adapter = new AstridElementOperationAdapter(animationContext, { get: vi.fn(async () => payload), save }, 'astrid-intro');
    const result = await adapter.execute({
      name: 'timeline.apply_element',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      placement: 'clip',
      element: { id: 'fade-up', kind: 'animation', revision: 'rev-animation' },
    });

    expect(result.config?.clips[0]).toMatchObject({
      elementRef: { id: 'fade-up', kind: 'animation', revision: 'rev-animation' },
      entrance: { type: 'fade-up', duration: 0.4 },
    });
  });

  it('rejects an explicit non-adjacent transition target', async () => {
    const payload = documentPayload();
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => payload),
      save: vi.fn(),
    }, 'astrid-intro');
    await expect(adapter.execute({
      name: 'timeline.apply_transition',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      from_clip: 'a',
      to_clip: 'a',
      transition: {
        id: 'cross-fade',
        kind: 'transition',
        revision: context().catalog.find((entry) => entry.id === 'cross-fade')?.revision,
      },
    })).rejects.toThrow('Transitions require adjacent clips');
  });
});


it('refuses a retired editor authority across separate registry reads and before CAS save', async () => {
  let admitted = true;
  const provider = {
    loadTimeline: vi.fn(async () => ({configVersion: 3, config: {clips: []}})),
    loadAssetRegistry: vi.fn(async () => { admitted = false; return {assets: {}}; }),
    saveTimeline: vi.fn(async () => 4),
  };
  const routes = createElementTimelineRoutes(provider as never, () => {
    if (!admitted) throw new Error('captured editor retired');
  });
  await expect(routes.get('owned-timeline')).rejects.toThrow('captured editor retired');
  expect(provider.loadTimeline).toHaveBeenCalledTimes(1);
  await expect(routes.save('owned-timeline', {config: {clips: []}, registry: {}, expectedVersion: 3})).rejects.toThrow('captured editor retired');
  expect(provider.saveTimeline).not.toHaveBeenCalled();
});

describe('catalog captured head provenance', () => {
  it('rejects a changed head during registry loading even when the numeric version is equal', async () => {
    let reads = 0;
    const saveTimelineAtHead = vi.fn();
    const payload = documentPayload();
    const routes = createElementTimelineRoutes({
      loadTimeline: async () => ({ config: payload.config as TimelineConfig, configVersion: 7,
        head: { projectId: 'project', timelineId: 'main', headRevisionId: ++reads === 1 ? 'r1' : 'r2' } }),
      loadAssetRegistry: async () => ({ assets: {} }), saveTimeline: vi.fn(), saveTimelineAtHead,
    });
    await expect(routes.get('main')).rejects.toThrow('changed while loading');
    expect(saveTimelineAtHead).not.toHaveBeenCalled();
  });
  it('refuses a head-based save without its captured head rather than reading a newer base', async () => {
    const saveTimelineAtHead = vi.fn();
    const saveTimeline = vi.fn();
    const routes = createElementTimelineRoutes({ loadTimeline: vi.fn(), loadAssetRegistry: vi.fn(), saveTimeline, saveTimelineAtHead });
    await expect(routes.save('main', { config: documentPayload().config, registry: {}, expectedVersion: 7 }))
      .rejects.toThrow('captured timeline head');
    expect(saveTimelineAtHead).not.toHaveBeenCalled();
    expect(saveTimeline).not.toHaveBeenCalled();
  });
});
