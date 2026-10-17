import { describe, expect, it } from 'vitest';
import { buildSelectedProjectMediaAddCommand, selectedMediaRegistryExpectationPath } from './selectedProjectMedia.ts';

const selection = { asset: 'selected', generation_id: 'g', variant_id: 'v', object_id: `sha256:${'a'.repeat(64)}`, catalog_digest: `sha256:${'b'.repeat(64)}` };
const input = { selection, assetKey: 'selected', mediaType: 'video' as const, trackId: 'V1', trackKind: 'visual' as const,
  clipId: 'allocated', at: 1, durationSeconds: 2, intrinsicDurationSeconds: 4, existingTrackIds: ['V1'], existingClipIds: ['old'] };

describe('exact selected-media add producer', () => {
  it('binds the existing allocated identity and tagged registry absence without a trusted media_record', () => {
    const command = buildSelectedProjectMediaAddCommand(input)!;
    expect(command.args).toEqual({ media: selection, clip_id: 'allocated', at: 1, duration: 2 });
    expect(command.created).toEqual(['parent/clip:allocated']);
    expect(command.expect).toEqual({ 'parent/clip:allocated::': { state: 'absent' }, 'parent::registry.assets.selected': { state: 'absent' } });
  });
  it('captures a detached exact existing entry and preserves opaque nested values', () => {
    const entry = { media_id: selection.object_id, authoring_metadata: { generation: { opaque: null }, variant: { op: 'clear' } } };
    const command = buildSelectedProjectMediaAddCommand({ ...input, existingRegistryEntry: entry })!;
    expect(command.expect!['parent::registry.assets.selected']).toEqual({ state: 'present', value: entry });
    expect(command.expect!['parent::registry.assets.selected'].value).not.toBe(entry);
  });
  it.each(['asset.with.dot', '123-leading', 'quoted"asset', 'bracket]asset'])('encodes %s as one exact registry member', asset => {
    const command = buildSelectedProjectMediaAddCommand({ ...input, assetKey: asset, selection: { ...selection, asset } })!;
    expect(selectedMediaRegistryExpectationPath(asset)).toBe(`parent::registry.assets[${JSON.stringify(asset)}]`);
    expect(command.expect![selectedMediaRegistryExpectationPath(asset)]).toEqual({ state: 'absent' });
  });
  it.each(['foreign asset', 'missing digest', 'allocated collision', 'missing track', 'range overflow'])('refuses %s without a partial command', kind => {
    const value = kind === 'foreign asset' ? { ...input, assetKey: 'other' }
      : kind === 'missing digest' ? { ...input, selection: { ...selection, catalog_digest: '' } }
      : kind === 'allocated collision' ? { ...input, existingClipIds: ['allocated'] }
      : kind === 'missing track' ? { ...input, existingTrackIds: [] }
      : { ...input, durationSeconds: 5 };
    expect(buildSelectedProjectMediaAddCommand(value)).toBeUndefined();
  });
});
