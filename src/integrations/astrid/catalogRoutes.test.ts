import { describe, expect, it, vi } from 'vitest';

import {
  AstridCapabilityBindingError,
  AstridLocalCatalogRoutes,
} from './catalogRoutes';
import type { AstridBridgeTransport } from './transport';
import type { RuntimeCapability } from '@/tools/video-editor/data/bridgeContract';

function capability(overrides: Partial<RuntimeCapability> = {}): RuntimeCapability {
  return {
    capability_id: 'astrid.image_generation',
    definition_digest: `sha256:${'a'.repeat(64)}`,
    status: 'ready',
    required_resource_keys: [],
    estimated_scratch_bytes: 0,
    estimated_output_bytes: 0,
    ...overrides,
  };
}

function catalog(pages: Array<{ items: RuntimeCapability[]; next_cursor: string | null }>) {
  let pageIndex = 0;
  const requestJson = vi.fn(async (
    _path: string,
    _options: unknown,
    schema: { parse(value: unknown): unknown },
  ) => schema.parse(pages[Math.min(pageIndex++, pages.length - 1)]));
  return {
    routes: new AstridLocalCatalogRoutes({ requestJson } as unknown as AstridBridgeTransport),
    requestJson,
  };
}

describe('Astrid capability catalog binding', () => {
  it('parses chiptune capability metadata without inventing an action declaration projection', async () => {
    const { routes } = catalog([{
      items: [capability({ capability_id: 'chiptune.compose' })],
      next_cursor: null,
    }]);

    const admitted = await routes.get('chiptune.compose');
    expect(admitted).toEqual(expect.objectContaining({
      capability_id: 'chiptune.compose',
      definition_digest: `sha256:${'a'.repeat(64)}`,
      status: 'ready',
      required_resource_keys: [],
      estimated_scratch_bytes: 0,
      estimated_output_bytes: 0,
    }));
    expect(admitted).not.toHaveProperty('actions');
    expect(admitted).not.toHaveProperty('declaration');
    expect(admitted).not.toHaveProperty('action_declaration');
  });

  it('parses the source-backed optional action_declaration projection on the capability row', async () => {
    const projection: NonNullable<RuntimeCapability['action_declaration']> = {
      kind: 'generator',
      name: 'Chiptune Compose',
      short_description: 'Compose a short chiptune track.',
      description: 'Compose a tempo-locked NES-style cue.',
      keywords: ['music', 'chiptune'],
      inputs: [
        { name: 'duration_s', type: 'number', required: true, description: 'Exact cue length in seconds.' },
        { name: 'bpm', type: 'integer', required: false, default: 132, description: 'Tempo.' },
        { name: 'sections', type: 'json', required: true, description: 'Cue sections.' },
      ],
      outputs: [
        { name: 'music', type: 'file', artifact_type: 'audio', description: 'Rendered music.' },
        { name: 'beats', type: 'file', artifact_type: 'application/json', description: 'Beat data.' },
      ],
    };
    const { routes } = catalog([{
      items: [capability({ capability_id: 'chiptune.compose', action_declaration: projection })],
      next_cursor: null,
    }]);

    const admitted = await routes.get('chiptune.compose');
    expect(admitted.action_declaration).toEqual(projection);
    expect(admitted).not.toHaveProperty('invocation');
    expect(admitted.action_declaration?.outputs?.[0]).not.toHaveProperty('path_template');
  });

  it('rejects execution and output-routing fields outside the source-backed projection contract', async () => {
    const invalid = capability({
      capability_id: 'chiptune.compose',
      action_declaration: {
        kind: 'generator',
        inputs: [{ name: 'duration_s', type: 'number', required: true }],
        outputs: [{ name: 'music', type: 'file', path_template: '$OUT/music.wav' }],
        invocation: { kind: 'command' },
      },
    } as unknown as Partial<RuntimeCapability>);
    const { routes } = catalog([{ items: [invalid], next_cursor: null }]);

    await expect(routes.get('chiptune.compose')).rejects.toThrow();
  });

  it('rejects a non-ready capability before a producer can admit', async () => {
    const { routes, requestJson } = catalog([{
      items: [capability({ status: 'unavailable', unavailable_reason: 'model_missing' })],
      next_cursor: null,
    }]);

    await expect(routes.get('astrid.image_generation'))
      .rejects.toThrow('capability is not ready');
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate capability IDs across catalog pages', async () => {
    const first = capability();
    const { routes, requestJson } = catalog([
      { items: [first], next_cursor: 'page-2' },
      { items: [first], next_cursor: null },
    ]);

    await expect(routes.get(first.capability_id))
      .rejects.toThrow('duplicate ID');
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('rejects a catalog cursor cycle before returning a capability', async () => {
    const { routes, requestJson } = catalog([
      { items: [capability()], next_cursor: 'page-2' },
      { items: [], next_cursor: 'page-2' },
    ]);

    const error = await routes.get('missing.capability').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AstridCapabilityBindingError);
    expect(error).toMatchObject({ message: 'capability catalog cursor cycle detected' });
    expect(requestJson).toHaveBeenCalledTimes(2);
  });
});
