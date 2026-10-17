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

  it('accepts Runtime declaration availability metadata alongside the declared action projection', async () => {
    const projection: NonNullable<RuntimeCapability['action_declaration']> = {
      kind: 'generator',
      name: 'Chiptune Compose',
      inputs: [{ name: 'duration_s', type: 'number', required: true }],
      outputs: [{ name: 'music', type: 'file' }],
    };
    const { routes } = catalog([{
      items: [capability({
        capability_id: 'chiptune.compose',
        action_declaration_status: 'available',
        action_declaration: projection,
      })],
      next_cursor: null,
    }]);

    const admitted = await routes.get('chiptune.compose');
    expect(admitted.action_declaration_status).toBe('available');
    expect(admitted.action_declaration).toEqual(projection);
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

describe('capability declaration reason codec', () => {
  it.each(['available', 'unsupported'] as const)('accepts a nonempty reason for %s declarations', async (status) => {
    const { routes } = catalog([{
      items: [capability({ action_declaration_status: status, action_declaration_reason: 'Producer declaration disposition' })],
      next_cursor: null,
    }]);
    expect((await routes.get('astrid.image_generation')).action_declaration_reason)
      .toBe('Producer declaration disposition');
  });

  it.each(['', null, 1, true, {}, []])('refuses an invalid declaration reason %s', async (reason) => {
    const invalid = { ...capability(), action_declaration_reason: reason };
    const { routes } = catalog([{ items: [invalid as RuntimeCapability], next_cursor: null }]);
    await expect(routes.get('astrid.image_generation')).rejects.toThrow();
  });

  it('still refuses unknown capability keys when a valid reason is present', async () => {
    const invalid = { ...capability(), action_declaration_reason: 'Unsupported declaration', unknown_field: true };
    const { routes } = catalog([{ items: [invalid], next_cursor: null }]);
    await expect(routes.get('astrid.image_generation')).rejects.toThrow();
  });
});

describe('catalog v2 exact storage contract', () => {
  const estimator = { id: 'example.plan', version: 1, implementation_digest: `sha256:${'b'.repeat(64)}` };
  const row = (storage_estimate: unknown) => {
    const { estimated_scratch_bytes: _scratch, estimated_output_bytes: _output, ...base } = capability();
    return { ...base, storage_estimate };
  };
  function v2(items: unknown[]) {
    const requestJson = vi.fn(async (_path, _options, schema) => schema.parse({ catalog_version: 2, items, next_cursor: null }));
    return { routes: new AstridLocalCatalogRoutes({ requestJson } as unknown as AstridBridgeTransport), requestJson };
  }
  it.each([
    { mode: 'static', scratch_bytes: 0, output_bytes: 0 },
    { mode: 'request_estimated', estimator },
    { mode: 'unavailable', reason: 'no supported estimator' },
  ])('decodes %s without numeric placeholders or downgrade', async (contract) => {
    const { routes, requestJson } = v2([row(contract)]);
    expect((await routes.getV2('astrid.image_generation')).storage_estimate).toEqual(contract);
    expect(requestJson.mock.calls[0][0]).toContain('catalog_version=2');
    expect(requestJson).toHaveBeenCalledTimes(1);
  });
  it.each([
    { mode: 'static', scratch_bytes: '0', output_bytes: 0 },
    { mode: 'static', scratch_bytes: Number.MAX_SAFE_INTEGER, output_bytes: 1 },
    { mode: 'static', scratch_bytes: null, output_bytes: 0 },
    { mode: 'request_estimated', estimator: { ...estimator, version: '1' } },
    { mode: 'request_estimated', estimator: { ...estimator, implementation_digest: null } },
    { mode: 'request_estimated' },
    { mode: 'unavailable', reason: '' },
    { mode: 'unknown' },
    { mode: 'request_estimated', estimator, scratch_bytes: 0 },
  ])('refuses malformed/unknown/conflicting descriptor %s', async (contract) => {
    const { routes } = v2([row(contract)]);
    await expect(routes.getV2('astrid.image_generation')).rejects.toThrow();
  });
  it('refuses mixed v1/v2 rows, duplicate IDs and wrong digest binding', async () => {
    await expect(v2([{ ...row({ mode: 'static', scratch_bytes: 0, output_bytes: 0 }), estimated_output_bytes: 0 }]).routes.getV2('astrid.image_generation')).rejects.toThrow();
    const record = row({ mode: 'request_estimated', estimator });
    await expect(v2([record, record]).routes.getV2('astrid.image_generation')).rejects.toThrow('duplicate ID');
    await expect(v2([record]).routes.bindV2('astrid.image_generation', `sha256:${'c'.repeat(64)}`)).rejects.toThrow('digest mismatch');
  });
  it('refuses unavailable v2 binding even if status says ready', async () => {
    await expect(v2([row({ mode: 'unavailable', reason: 'unknown' })]).routes.bindV2('astrid.image_generation', capability().definition_digest)).rejects.toThrow('not ready');
  });
});
