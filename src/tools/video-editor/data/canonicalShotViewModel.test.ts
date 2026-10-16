import { describe, expect, it } from 'vitest';

import fixture from './shotComposition.fixture.json';
import { createShotCompositionAdapter } from './shotCompositionAdapter.ts';
import { selectCanonicalShotViewModels } from './canonicalShotViewModel.ts';

const cloneFixture = () => JSON.parse(JSON.stringify(fixture)) as typeof fixture;

describe('canonical shot view model', () => {
  it('prefers canonical names, reads legacy aliases, and never guesses missing media as image', () => {
    const graph = cloneFixture();
    const canonical = graph.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha')! as typeof graph.shot_revisions[number] & Record<string, unknown>;
    canonical.name = 'Canonical top-level name';
    canonical.provenance = { name: 'Legacy provenance name' };
    canonical.assets = [
      { asset_id: 'image', object_id: 'object-image', digest: 'sha256:' + '1'.repeat(64), media_type: 'image/png' },
      { asset_id: 'video', object_id: 'object-video', digest: 'sha256:' + '2'.repeat(64), media_type: 'video/mp4' },
      { asset_id: 'audio', object_id: 'object-audio', digest: 'sha256:' + '3'.repeat(64), media_type: 'audio/mpeg' },
      { asset_id: 'unknown', object_id: 'object-unknown', digest: 'sha256:' + '4'.repeat(64), media_type: 'application/x-future' },
      { asset_id: 'missing-kind', object_id: 'object-missing-kind', digest: 'sha256:' + '5'.repeat(64) },
    ];
    const composition = createShotCompositionAdapter({ load: async () => graph }).prepare(graph);
    const models = selectCanonicalShotViewModels(composition);
    const first = models[0]!;

    expect(first.name).toBe('Canonical top-level name');
    expect(first.images.map((item) => item.type)).toEqual(['image']);
    expect(first.imageCount).toBe(1);
    expect(first.positionedImageCount).toBe(1);
    expect(first.canonicalAssets).toHaveLength(5);
    expect(first.canonicalProvenance).toEqual({ name: 'Legacy provenance name' });
  });

  it('normalizes legacy provenance and metadata titles before falling back to stable identity', () => {
    const graph = cloneFixture();
    const revision = graph.shot_revisions.find((item) => item.shot_id === 'shot-alpha')! as typeof graph.shot_revisions[number] & Record<string, unknown>;
    delete revision.name;
    revision.provenance = { title: 'Legacy provenance title' };
    const prepared = createShotCompositionAdapter({ load: async () => graph }).prepare(graph);
    expect(selectCanonicalShotViewModels(prepared)[0]?.name).toBe('Legacy provenance title');

    delete revision.provenance;
    revision.metadata = { title: 'Legacy metadata title' };
    const metadataPrepared = createShotCompositionAdapter({ load: async () => graph }).prepare(graph);
    expect(selectCanonicalShotViewModels(metadataPrepared)[0]?.name).toBe('Legacy metadata title');
  });
});


it('canonical semantic read model displays D012 provenance name and metadata settings on the semantic read model without changing compatibility precedence', () => {
  const graph = cloneFixture();
  const revision = graph.shot_revisions.find((item) => item.shot_id === 'shot-alpha')! as unknown as Record<string, unknown>;
  revision.name = 'Legacy top-level name';
  revision.provenance = { name: 'D012 name' };
  revision.settings = { prompt: 'Legacy settings' };
  revision.metadata = { settings: { prompt: 'D012 settings', opaque: null } };
  const compatibility = createShotCompositionAdapter({ load: async () => graph }).prepare(graph);
  const semantic = createShotCompositionAdapter({ load: async () => graph, semanticCommandSaving: true }).prepare(graph);
  expect(selectCanonicalShotViewModels(compatibility)[0]?.name).toBe('Legacy top-level name');
  expect(selectCanonicalShotViewModels(compatibility)[0]?.settings).toMatchObject({ 'travel-between-images': { prompt: 'Legacy settings' } });
  expect(selectCanonicalShotViewModels(semantic)[0]?.name).toBe('D012 name');
  expect(selectCanonicalShotViewModels(semantic)[0]?.settings).toMatchObject({ 'travel-between-images': { prompt: 'D012 settings', opaque: null } });
  expect(graph.shot_revisions.find((item) => item.shot_id === 'shot-alpha')?.provenance).toEqual({ name: 'D012 name' });
});
