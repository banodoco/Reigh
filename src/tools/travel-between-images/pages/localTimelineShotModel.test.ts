import { describe, expect, it } from 'vitest';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { AssetRegistry } from '@/tools/video-editor/types/index.ts';
import type { LocalTimelineShot } from './localTimelineShotModel.ts';
import { selectCanonicalShotModels, selectCanonicalShotOccurrences, toCanonicalShotModel } from './localTimelineShotModel.ts';

const registry: AssetRegistry = {
  assets: {
    'alpha-image': { media_id: 'object-alpha-image', type: 'image/png', thumbnailUrl: 'thumb-alpha.png' },
    'alpha-copy-image': { media_id: 'object-alpha-image', type: 'image/png', thumbnailUrl: 'thumb-alpha.png' },
    'beta-image': { media_id: 'object-beta-image', type: 'image/png', thumbnailUrl: 'thumb-beta.png' },
  },
};

describe('canonical local timeline shot model', () => {
  it('prefers the canonical revision name over the legacy UUID fallback', async () => {
    const source = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    const revision = source.shot_revisions.find((candidate) => candidate.shot_id === 'shot-alpha' && candidate.revision_id === 'rev-a');
    if (!revision) throw new Error('fixture alpha revision is missing');
    revision.name = 'Canonical alpha name';

    const composition = await createShotCompositionAdapter({ load: async () => source }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const [shot] = selectCanonicalShotOccurrences(composition, registry, 'demo');

    expect(shot?.name).toBe('Canonical alpha name');
  });

  it('uses metadata names when provenance and canonical names are absent', async () => {
    const source = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    const revision = source.shot_revisions.find((candidate) => candidate.shot_id === 'shot-alpha' && candidate.revision_id === 'rev-a');
    if (!revision) throw new Error('fixture alpha revision is missing');
    delete revision.name;
    delete revision.provenance.name;
    delete revision.provenance.title;
    revision.metadata = { name: 'Metadata alpha name' };

    const composition = await createShotCompositionAdapter({ load: async () => source }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const [shot] = selectCanonicalShotOccurrences(composition, registry, 'demo');

    expect(shot?.name).toBe('Metadata alpha name');
  });

  it('projects only image-kind assets into the legacy image collection', async () => {
    const source = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    const revision = source.shot_revisions.find((candidate) => candidate.shot_id === 'shot-alpha' && candidate.revision_id === 'rev-a');
    if (!revision) throw new Error('fixture alpha revision is missing');
    revision.assets.push(
      { asset_id: 'alpha-audio', object_id: 'object-alpha-audio', media_type: 'audio/mpeg' },
      { asset_id: 'alpha-unknown', object_id: 'object-alpha-unknown', media_type: 'application/x-future' },
      { asset_id: 'alpha-conflicting-unknown', object_id: 'object-alpha-conflicting-unknown', media_type: 'application/x-future', type: 'image/png', role: 'image' },
    );
    revision.internal_timeline_revision.timeline.clips.push(
      { id: 'alpha-audio', clip_type: 'media', track: 'audio', at_ms: 0, duration_ms: 2000, asset_id: 'alpha-audio' },
      { id: 'alpha-unknown', clip_type: 'media', track: 'video', at_ms: 0, duration_ms: 2000, asset_id: 'alpha-unknown' },
      { id: 'alpha-conflicting-unknown', clip_type: 'media', track: 'video', at_ms: 0, duration_ms: 2000, asset_id: 'alpha-conflicting-unknown' },
    );

    const composition = await createShotCompositionAdapter({ load: async () => source }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const [model] = selectCanonicalShotModels(composition, registry, 'demo');

    expect(model?.images).toHaveLength(1);
    expect(model?.images[0]?.generation_id).toBe('object-alpha-image');
  });

  it.each([
    ['audio/mpeg', 'audio'],
    ['video/mp4', 'video'],
    ['application/x-future', 'video'],
  ])('keeps canonical %s from being overridden by registry image metadata', async (mediaType, track) => {
    const source = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    const revision = source.shot_revisions.find((candidate) => candidate.shot_id === 'shot-alpha' && candidate.revision_id === 'rev-a');
    if (!revision) throw new Error('fixture alpha revision is missing');
    revision.assets = [{ asset_id: 'canonical-only', object_id: 'object-canonical-only', media_type: mediaType }];
    revision.internal_timeline_revision.timeline.clips = [{
      id: 'canonical-only-clip',
      clip_type: 'media',
      track,
      at_ms: 0,
      duration_ms: 2000,
      asset_id: 'canonical-only',
    }];

    const composition = await createShotCompositionAdapter({ load: async () => source }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const conflictingRegistry: AssetRegistry = {
      assets: {
        'canonical-only': {
          media_id: 'object-canonical-only',
          type: 'image/png',
          thumbnailUrl: 'misleading-image-thumbnail.png',
        },
      },
    };
    const [model] = selectCanonicalShotModels(composition, conflictingRegistry, 'demo');

    expect(model?.images).toHaveLength(0);
  });

  it('does not infer a canonical image kind from registry display metadata alone', async () => {
    const source = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    const revision = source.shot_revisions.find((candidate) => candidate.shot_id === 'shot-alpha' && candidate.revision_id === 'rev-a');
    if (!revision) throw new Error('fixture alpha revision is missing');
    revision.assets = [];
    revision.internal_timeline_revision.timeline.clips = [{
      id: 'registry-only-clip',
      clip_type: 'media',
      track: 'video',
      at_ms: 0,
      duration_ms: 2000,
      asset_id: 'alpha-image',
    }];

    const composition = await createShotCompositionAdapter({ load: async () => source }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const [model] = selectCanonicalShotModels(composition, registry, 'demo');

    expect(model?.images).toHaveLength(0);
  });

  it.each([
    ['missing canonical kind with legacy image aliases', { type: 'image/png', role: 'image' }],
    ['nested authoritative audio kind with legacy image alias', { type: 'image/png', source: { media_type: 'audio/mpeg' } }],
    ['explicit unknown canonical kind with legacy image aliases', { media_type: 'application/x-future', type: 'image/png', role: 'image' }],
  ])('does not infer an image from %s', async (_description, mediaMetadata) => {
    const source = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    const revision = source.shot_revisions.find((candidate) => candidate.shot_id === 'shot-alpha' && candidate.revision_id === 'rev-a');
    if (!revision) throw new Error('fixture alpha revision is missing');
    revision.assets = [{ asset_id: 'alias-only', object_id: 'object-alias-only', ...mediaMetadata }];
    revision.internal_timeline_revision.timeline.clips = [{
      id: 'alias-only-clip',
      clip_type: 'media',
      track: 'video',
      at_ms: 0,
      duration_ms: 2000,
      asset_id: 'alias-only',
    }];

    const composition = await createShotCompositionAdapter({ load: async () => source }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const conflictingRegistry: AssetRegistry = {
      assets: {
        'alias-only': {
          media_id: 'object-alias-only',
          type: 'image/png',
          thumbnailUrl: 'misleading-image-thumbnail.png',
        },
      },
    };
    const [model] = selectCanonicalShotModels(composition, conflictingRegistry, 'demo');

    expect(model?.images).toHaveLength(0);
  });

  it('uses occurrence identity for overview rows while preserving linked revision identity', async () => {
    const composition = await createShotCompositionAdapter({ load: async () => fixture }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const shots = selectCanonicalShotOccurrences(composition, registry, 'demo');
    const models = selectCanonicalShotModels(composition, registry, 'demo');

    expect(shots).toHaveLength(5);
    expect(shots[0]).toMatchObject({
      id: 'occ-1',
      occurrenceId: 'occ-1',
      shotId: 'shot-alpha',
      revisionId: 'rev-a',
      stableDeepLink: 'project/project-001/document/document-primary/shot/shot-alpha/revision/rev-a/occurrence/occ-1',
      outputIdentity: 'project/project-001/document/document-primary/occurrence/occ-1/output/final-video',
    });
    expect(shots[0]?.id).not.toBe(shots[1]?.id);
    expect(shots[0]?.revisionId).toBe(shots[1]?.revisionId);
    expect(shots[4]?.shotId).toBe('shot-alpha-copy');
    expect(models[0]?.id).toBe('occ-1');
    expect(models[0]?.images[0]?.metadata).toMatchObject({ occurrenceId: 'occ-1', revisionId: 'rev-a' });
    expect(shots[0]).toMatchObject({
      timing: { duration_ms: 2000 },
      audio: { track_id: 'audio', object_id: 'object-alpha-audio' },
      assets: [{ asset_id: 'alpha-image', object_id: 'object-alpha-image' }],
      dependencies: [{ shot_id: 'shot-beta', revision_id: 'rev-a', required: true }],
      provenance: { source: 'travel-between-images' },
    });
    expect(shots[0]?.generationInputs[0]).toMatchObject({ input_id: 'alpha-input-0', ordinal: 0 });
    expect(models[0]).toMatchObject({
      timing: { duration_ms: 2000 },
      audio: { object_id: 'object-alpha-audio' },
      assets: [{ asset_id: 'alpha-image' }],
      dependencies: [{ shot_id: 'shot-beta' }],
      provenance: { source: 'travel-between-images' },
    });
    expect(models[0]?.generationInputs[0]).toMatchObject({ input_id: 'alpha-input-0' });
  });

  it('keeps a missing canonical dependency as a typed load failure', async () => {
    const invalid = JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
    const revisions = invalid.shot_revisions as Array<Record<string, unknown>>;
    revisions[0].dependencies = [{ shot_id: 'missing-shot', revision_id: 'missing-revision', required: true }];
    await expect(createShotCompositionAdapter({ load: async () => invalid }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    })).rejects.toThrow(/dependency revision is missing/);
  });

  it('projects editor-form asset and hold fields into nested shot images', async () => {
    const editorForm = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    const revision = editorForm.shot_revisions.find((candidate) => candidate.shot_id === 'shot-alpha' && candidate.revision_id === 'rev-a');
    if (!revision) throw new Error('fixture alpha revision is missing');
    revision.assets = [{ asset_id: 'beta-image', object_id: 'object-beta-image', media_type: 'image/png' }];
    const timeline = revision.internal_timeline_revision.timeline;
    const clip = timeline.clips[0] as Record<string, unknown>;
    delete clip.asset_id;
    clip.asset = 'beta-image';
    clip.at = 0.25;
    clip.hold = 1.5;
    delete clip.at_ms;
    delete clip.duration_ms;

    const composition = await createShotCompositionAdapter({ load: async () => editorForm }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const models = selectCanonicalShotModels(composition, registry, 'demo');

    expect(models[0]?.images).toHaveLength(1);
    expect(models[0]?.images[0]).toMatchObject({
      generation_id: 'object-beta-image',
      timeline_frame: 8,
      metadata: { clipId: 'alpha-video' },
    });
  });

  it('does not turn frame-level render primitives into independent legacy images', () => {
    const shot = {
      id: 'occ-1',
      occurrenceId: 'occ-1',
      shotId: 'shot-1',
      revisionId: 'rev-1',
      parentDocumentId: 'doc-1',
      stableDeepLink: '/project/p/timeline/doc-1/occurrence/occ-1',
      outputIdentity: 'output-1',
      name: 'One canonical shot',
      trackId: 'video',
      clips: Array.from({ length: 120 }, (_, index) => ({
        clipId: `clip-${index}`,
        clip: { id: `clip-${index}` },
        durationSeconds: 1 / 24,
        startSeconds: index / 24,
        relativeStartSeconds: index / 24,
        lane: 0,
        asset: { media_id: 'sha256:asset-1', type: 'image/png' },
        thumbnailUrl: 'https://example.test/thumb.jpg',
        missingAsset: false,
      })),
      nonVisualClipCount: 0,
      missingClipCount: 0,
      durationSeconds: 5,
      laneCount: 1,
      timing: {},
      audio: {},
      generationInputs: [],
      assets: [],
      dependencies: [],
      provenance: {},
      settings: {},
    } satisfies LocalTimelineShot;

    const model = toCanonicalShotModel(shot, 24, 'project-1');

    expect(model.images).toHaveLength(1);
    expect(model.images[0]?.name).toBe('One canonical shot');
    expect(model.images[0]?.metadata).toEqual(expect.objectContaining({ internalClipCount: 120 }));
  });

  it.each([
    ['duration-ms-fast', { at_ms: 1, duration_ms: 17, speed: 2 }, 0.0085],
    ['hold-slow', { at: 0, hold: 1, speed: 0.5 }, 2],
    ['trim-fast', { at: 0, from: 2, to: 6, speed: 2 }, 2],
  ] as const)('applies speed once in nested preview vector %s', async (_vectorId, timing, expectedDuration) => {
    const source = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    source.occurrences = [source.occurrences[0]!];
    source.occurrences[0]!.duration_ms = 3000;
    const revision = source.shot_revisions.find((candidate) => (
      candidate.shot_id === source.occurrences[0]!.shot_id
      && candidate.revision_id === source.occurrences[0]!.revision_id
    ));
    if (!revision) throw new Error('fixture revision is missing');
    revision.internal_timeline_revision.timeline.clips = [{
      ...revision.internal_timeline_revision.timeline.clips[0],
      id: _vectorId,
      ...timing,
    }];
    delete (revision.internal_timeline_revision.timeline.clips[0] as Record<string, unknown>).duration_ms;
    Object.assign(revision.internal_timeline_revision.timeline.clips[0], timing);

    const composition = await createShotCompositionAdapter({ load: async () => source }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const [shot] = selectCanonicalShotOccurrences(composition, registry, 'demo');

    expect(shot?.clips[0]?.durationSeconds).toBe(expectedDuration);
  });

  it('caps nested preview clips at the occurrence half-open end without rewriting source timing', async () => {
    const source = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    source.occurrences = [source.occurrences[0]!];
    source.occurrences[0]!.duration_ms = 750;
    const revision = source.shot_revisions.find((candidate) => (
      candidate.shot_id === source.occurrences[0]!.shot_id
      && candidate.revision_id === source.occurrences[0]!.revision_id
    ));
    if (!revision) throw new Error('fixture revision is missing');
    const sourceClip = {
      ...revision.internal_timeline_revision.timeline.clips[0],
      id: 'hold-fast-clipped',
      at: 0,
      hold: 4,
      speed: 2,
    };
    delete (sourceClip as Record<string, unknown>).at_ms;
    delete (sourceClip as Record<string, unknown>).duration_ms;
    revision.internal_timeline_revision.timeline.clips = [sourceClip];

    const composition = await createShotCompositionAdapter({ load: async () => source }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const [shot] = selectCanonicalShotOccurrences(composition, registry, 'demo');

    expect(shot?.clips[0]?.durationSeconds).toBe(0.75);
    expect(shot?.clips[0]?.clip).toMatchObject({ hold: 4, speed: 2 });
  });
});


it('reads D012 metadata fields only on the semantic shot read model', () => {
  const graph = structuredClone(fixture);
  const revision = graph.shot_revisions.find((item) => item.shot_id === 'shot-alpha')! as unknown as Record<string, unknown>;
  revision.name = 'Legacy name';
  revision.provenance = { name: 'Authored name' };
  revision.settings = { prompt: 'Legacy settings' };
  revision.metadata = { settings: { prompt: 'Authored settings', opaque: null } };
  const compatibility = createShotCompositionAdapter({ load: async () => graph }).prepare(graph);
  const semantic = createShotCompositionAdapter({ load: async () => graph, semanticCommandSaving: true }).prepare(graph);
  expect(selectCanonicalShotOccurrences(compatibility)[0]).toMatchObject({ name: 'Legacy name', settings: { prompt: 'Legacy settings' } });
  expect(selectCanonicalShotOccurrences(semantic)[0]).toMatchObject({ name: 'Authored name', settings: { prompt: 'Authored settings', opaque: null } });
  revision.metadata = { settings: null };
  const nullSettings = createShotCompositionAdapter({ load: async () => graph, semanticCommandSaving: true }).prepare(graph);
  expect(selectCanonicalShotOccurrences(nullSettings)[0]?.settings).toEqual({});
});
