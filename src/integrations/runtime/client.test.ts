import { types } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { Transport } from './generated.ts';
import { ReighRuntimeClient, RuntimeCompatibilityError } from './client.ts';
import {
  RUNTIME_SCHEMA_DIGEST,
  RUNTIME_TARGETED_EXECUTION_CAPABILITY,
} from './contract-metadata.ts';

const PROJECT_ID = 'project/r2';
const CAPABILITY_ID = 'astrid.image_generation';
const CAPABILITY_DIGEST = `sha256:${'a'.repeat(64)}`;
const INPUT_OBJECT_ID = `sha256:${'1'.repeat(64)}`;
const MEDIA_OBJECT_ID = 'object-r4-media';
const MEDIA_OBJECT_DIGEST = `sha256:${'c'.repeat(64)}`;
const MANAGED_OUTPUT_ASSOCIATION_ID = 'managed-output-r3';
const MANAGED_OUTPUT_OBJECT_ID = `sha256:${'d'.repeat(64)}`;
const EXPECTED_IDENTITY = {
  actorId: 'astrid-product-r3',
  realmId: 'realm-r2',
  runtimeInstanceId: 'runtime-instance-r2',
};

const exactGenTaskInput = {
  project: PROJECT_ID,
  capability_id: CAPABILITY_ID,
  capability_digest: CAPABILITY_DIGEST,
  schema_version: '1' as const,
  input_object_ids: [INPUT_OBJECT_ID],
  spec: {
    family: 'image_generation',
    params: { prompt: 'a lighthouse' },
    output_policy: {},
  },
  storage_estimate: { scratch_bytes: 0, output_bytes: 0 },
  generation_intent: {
    version: 1,
    modality: 'video',
    partial_success_policy: 'allow',
    groups: [
      {
        group_key: 'main',
        selectors: [
          { selector: 'video', ordinal: 0, variant_key: 'original' },
        ],
      },
    ],
  },
  settlement_effect: {},
};

const generation = {
  generation_id: 'generation-r2',
  project_id: PROJECT_ID,
  source_task_id: 'task-r3',
  type: 'image',
  status: 'created',
  metadata: { tool_type: 'image-gen' },
  version: 4,
  created_at: '2026-09-11T00:00:00Z',
  updated_at: '2026-09-11T00:01:00Z',
};

const variant = {
  variant_id: 'variant-r2',
  generation_id: generation.generation_id,
  object_id: `sha256:${'2'.repeat(64)}`,
  variant_type: 'original',
  metadata: { is_primary: true },
  created_at: '2026-09-11T00:00:30Z',
};

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function receipt(commandKind: string, key: string, projectId = PROJECT_ID) {
  return {
    receipt_id: `${commandKind}:${key}`,
    command_kind: commandKind,
    idempotency_key: key,
    request_hash: `sha256:${'b'.repeat(64)}`,
    project_id: projectId,
    project_seq: [1, 1],
    event_ids: [],
    result: {},
    created_at: '2026-09-11T00:00:00Z',
  };
}

function createTransport(options: {
  revokeFirstMediaRead?: boolean;
  schemaDigest?: string;
  capabilities?: string[];
  actorId?: string;
  realmId?: string;
  runtimeInstanceId?: string;
  scopes?: string[];
  realmResponseId?: string;
} = {}) {
  const schemaDigest = options.schemaDigest ?? RUNTIME_SCHEMA_DIGEST;
  const capabilities = options.capabilities ?? [RUNTIME_TARGETED_EXECUTION_CAPABILITY];
  const requests: Array<{ method: string; path: string; headers: Record<string, string>; body?: unknown }> = [];
  let mediaReads = 0;
  const task = {
    task_id: 'task-r3',
    run_id: 'run-r3',
    project_id: PROJECT_ID,
    state: 'queued' as 'queued' | 'cancelled' | 'retrying',
    version: 1,
    capability_id: CAPABILITY_ID,
    capability_digest: CAPABILITY_DIGEST,
    idempotency_key: 'reigh.admit:r3',
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    attempt_id: null,
    runtime_epoch: 7,
    input_object_ids: [INPUT_OBJECT_ID],
    spec: exactGenTaskInput.spec,
    generation_intent: exactGenTaskInput.generation_intent,
    result: null,
  };

  const transport: Transport = async (method, path, headers, body) => {
    if (body !== undefined && !types.isUint8Array(body)) {
      throw new Error('JSON fixture expected a Uint8Array request body');
    }
    const parsedBody = body === undefined
      ? undefined
      : JSON.parse(new TextDecoder().decode(
        new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      )) as Record<string, unknown>;
    requests.push({ method, path, headers, ...(parsedBody ? { body: parsedBody } : {}) });

    if (path === '/v1/health') {
      return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: schemaDigest, runtime_epoch: 7, runtime_instance_id: options.runtimeInstanceId ?? EXPECTED_IDENTITY.runtimeInstanceId }) };
    }
    if (path === '/v1/handshake') {
      return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: schemaDigest, session_id: 'session-r2-r3', actor_id: options.actorId ?? EXPECTED_IDENTITY.actorId, realm_id: options.realmId ?? EXPECTED_IDENTITY.realmId, scopes: options.scopes ?? ['handshake', 'projects:read', 'projects:write', 'objects:read', 'objects:write', 'tasks:read', 'tasks:write'], capabilities }) };
    }
    if (path === '/v1/realm') {
      return { status: 200, headers: {}, body: json({ realm_id: options.realmResponseId ?? EXPECTED_IDENTITY.realmId, display_name: 'R2/R3 fixture', version: 1, created_at: '2026-09-11T00:00:00Z' }) };
    }
    if (path === '/v1/capabilities?limit=50') {
      return {
        status: 200,
        headers: {},
        body: json({
          items: [{
            capability_id: CAPABILITY_ID,
            definition_digest: CAPABILITY_DIGEST,
            status: 'ready',
            required_resource_keys: [],
            estimated_scratch_bytes: 0,
            estimated_output_bytes: 0,
          }],
          next_cursor: null,
        }),
      };
    }
    if (path === `/v1/projects/${encodeURIComponent(PROJECT_ID)}/generations?limit=2&cursor=generations-7`) {
      return { status: 200, headers: {}, body: json({ items: [generation], next_cursor: 'generations-8' }) };
    }
    if (path === `/v1/generations/${generation.generation_id}/variants?limit=2&cursor=variants-3`) {
      return { status: 200, headers: {}, body: json({ items: [variant], next_cursor: 'variants-4' }) };
    }
    if (path === `/v1/objects/${MEDIA_OBJECT_ID}` && (method === 'GET' || method === 'HEAD')) {
      if (options.revokeFirstMediaRead && mediaReads++ === 0) {
        return { status: 401, headers: {}, body: json({ code: 'unauthorized', message: 'credential revoked' }) };
      }
      const ranged = headers.Range !== undefined;
      return {
        status: ranged ? 206 : 200,
        headers: {
          ETag: `"${MEDIA_OBJECT_DIGEST}"`,
          'Accept-Ranges': 'bytes',
          ...(ranged ? { 'Content-Range': 'bytes 0-3/4' } : {}),
        },
        body: method === 'HEAD' ? new Uint8Array() : new Uint8Array([1, 2, 3, 4]),
      };
    }
    if (method === 'POST' && path === '/v1/tasks') {
      expect(headers['Idempotency-Key']).toBe('reigh.admit:r3');
      expect(parsedBody).toEqual(exactGenTaskInput);
      return { status: 201, headers: {}, body: json({ data: task, receipt: receipt('task.create', 'reigh.admit:r3') }) };
    }
    if (method === 'GET' && path === '/v1/tasks/task-r3') {
      return { status: 200, headers: {}, body: json(task) };
    }
    if (method === 'GET' && path === `/v1/projects/${encodeURIComponent(PROJECT_ID)}/tasks?limit=1&cursor=tasks-2`) {
      return { status: 200, headers: {}, body: json({ items: [task], next_cursor: 'tasks-3' }) };
    }
    if (method === 'POST' && path === `/v1/managed-outputs/${MANAGED_OUTPUT_ASSOCIATION_ID}/export`) {
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Idempotency-Key']).toBeTruthy();
      expect(parsedBody).toEqual({
        destination_filename: 'retained-output.mp4',
        expected: {
          project_id: PROJECT_ID,
          run_id: 'run-r3',
          task_id: 'task-r3',
          attempt_id: 'attempt-r3',
          association_id: MANAGED_OUTPUT_ASSOCIATION_ID,
          output_port: 'video',
          role: 'output',
          object_id: MANAGED_OUTPUT_OBJECT_ID,
          digest: MANAGED_OUTPUT_OBJECT_ID,
          size: 4,
          filename: 'retained-output.mp4',
          media_type: 'video/mp4',
          executor_id: 'executor-r3',
          lease_id: 'lease-r3',
          fence: 6,
          runtime_epoch: 7,
        },
      });
      return {
        status: 200,
        headers: {},
        body: json({
          data: {
            export_id: 'export-r3',
            association_id: MANAGED_OUTPUT_ASSOCIATION_ID,
            project_id: PROJECT_ID,
            run_id: 'run-r3',
            task_id: 'task-r3',
            attempt_id: 'attempt-r3',
            executor_id: 'executor-r3',
            lease_id: 'lease-r3',
            fence: 6,
            runtime_epoch: 7,
            output_port: 'video',
            role: 'output',
            object_id: MANAGED_OUTPUT_OBJECT_ID,
            digest: MANAGED_OUTPUT_OBJECT_ID,
            size: 4,
            filename: 'retained-output.mp4',
            media_type: 'video/mp4',
            producer: { capability_id: 'rendering.render' },
            destination: { root: '/runtime/export-root', filename: 'retained-output.mp4' },
            source_provenance: { task_id: 'task-r3', attempt_id: 'attempt-r3' },
            exported_at: '2026-09-11T00:02:00Z',
          },
          receipt: receipt('managed_output.export', headers['Idempotency-Key'] ?? ''),
        }),
      };
    }
    if (method === 'POST' && path === '/v1/tasks/task-r3/cancel') {
      expect(headers['Idempotency-Key']).toBe('reigh.cancel:r3');
      expect(parsedBody).toEqual({ expected_version: 1 });
      task.state = 'cancelled';
      task.version = 2;
      return { status: 200, headers: {}, body: json({ data: task, receipt: receipt('task.cancel', 'reigh.cancel:r3') }) };
    }
    if (method === 'POST' && path === '/v1/tasks/task-r3/retry') {
      expect(headers['Idempotency-Key']).toBe('reigh.retry:r3');
      expect(parsedBody).toEqual({ expected_version: 2 });
      task.state = 'retrying';
      task.version = 3;
      return { status: 200, headers: {}, body: json({ data: task, receipt: receipt('task.retry', 'reigh.retry:r3') }) };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };

  return { requests, task, transport };
}

function clientFor(fixture: ReturnType<typeof createTransport>, options: { token?: boolean; expectedIdentity?: typeof EXPECTED_IDENTITY } = {}) {
  return new ReighRuntimeClient({
    baseUrl: 'http://runtime.test',
    ...(options.token ? { token: 'fixture-token' } : {}),
    expectedIdentity: options.expectedIdentity ?? EXPECTED_IDENTITY,
    transport: fixture.transport,
  });
}

describe('ReighRuntimeClient canonical Runtime reads and browser task seam', () => {
  it('rejects a replacement Runtime instance on reconnect without rebinding or writing', async () => {
    const options = { runtimeInstanceId: EXPECTED_IDENTITY.runtimeInstanceId };
    const fixture = createTransport(options);
    const client = clientFor(fixture);
    await client.ensureSession();
    options.runtimeInstanceId = 'replacement-runtime-same-realm';
    await expect(client.reconnect()).rejects.toMatchObject({
      name: 'RuntimeCompatibilityError',
      reason: expect.stringContaining('Runtime restarted—relaunch workspace'),
    });
    await expect(client.updateProject(PROJECT_ID, 'restart-no-write', 1, 'edited', {}))
      .rejects.toThrow('Runtime restarted—relaunch workspace');
    expect(fixture.requests.filter(({ method, path }) => method !== 'GET' && path !== '/v1/handshake'))
      .toEqual([]);
    expect(fixture.requests.filter(({ path }) => path === '/v1/realm')).toHaveLength(1);
  });

  it('accepts the selected Runtime contract digest during handshake', async () => {
    const selectedRuntimeDigest = 'sha256:a0aef27ca984208da810b49c95a6d70dbdbe78da8b05574999c9a0288efc651d';
    expect(RUNTIME_SCHEMA_DIGEST).toBe(selectedRuntimeDigest);
    const fixture = createTransport();
    const client = clientFor(fixture);

    const session = await client.ensureSession();

    expect(session.health.schema_digest).toBe(selectedRuntimeDigest);
    expect(session.handshake.schema_digest).toBe(selectedRuntimeDigest);
    expect(fixture.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/health',
      'POST /v1/handshake',
      'GET /v1/realm',
    ]);
  });

  it('rejects the previous Runtime singleton digest before loading the realm', async () => {
    const fixture = createTransport({
      schemaDigest: 'sha256:d2f5a6d546f5220b0e33b52dec114e502d1aa9be58f83a376d6efc9ede8d7860',
    });
    const client = clientFor(fixture);

    await expect(client.ensureSession()).rejects.toMatchObject({
      name: 'RuntimeCompatibilityError',
      code: 'runtime_incompatible',
    });
    expect(fixture.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/health',
      'POST /v1/handshake',
    ]);
  });

  it('rejects the stale pre-generator Runtime digest before loading the realm', async () => {
    const fixture = createTransport({
      schemaDigest: 'sha256:2170992517c98545d573222eef144580093e879fb3094b5bcb3f240008b5bb21',
    });
    const client = clientFor(fixture);

    await expect(client.ensureSession()).rejects.toMatchObject({
      name: 'RuntimeCompatibilityError',
      code: 'runtime_incompatible',
    });
    expect(fixture.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/health',
      'POST /v1/handshake',
    ]);
  });

  it('rejects the previous generated Runtime contract digest before loading the realm', async () => {
    const fixture = createTransport({
      schemaDigest: 'sha256:933561628ddec77faff19d5e90d5e804217ed6f78390e1e8c3f00f4b8ea7e683',
    });
    const client = clientFor(fixture);

    await expect(client.ensureSession()).rejects.toMatchObject({
      name: 'RuntimeCompatibilityError',
      code: 'runtime_incompatible',
    });
    expect(fixture.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/health',
      'POST /v1/handshake',
    ]);
  });

  it('rejects the superseded Runtime digest before loading the realm', async () => {
    const fixture = createTransport({
      schemaDigest: 'sha256:4f064bbac6563dacf2020ac6498f9acf6bd7fd912f332810dffcd51806ecb7a6',
    });
    const client = clientFor(fixture);

    await expect(client.ensureSession()).rejects.toMatchObject({
      name: 'RuntimeCompatibilityError',
      code: 'runtime_incompatible',
    });
    expect(fixture.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/health',
      'POST /v1/handshake',
    ]);
  });

  it('fails closed on a Runtime schema digest mismatch', async () => {
    const fixture = createTransport({ schemaDigest: `sha256:${'0'.repeat(64)}` });
    const client = clientFor(fixture);

    await expect(client.ensureSession()).rejects.toBeInstanceOf(RuntimeCompatibilityError);
    await expect(client.ensureSession()).rejects.toMatchObject({ code: 'runtime_incompatible' });
  });

  it('fails closed on a stale additive Runtime contract', async () => {
    const fixture = createTransport({
      schemaDigest: 'sha256:5da488052a7a281a4ce9c9336e19cdf0bf840ed211d244dd101e8326cb9d4f00',
    });
    const client = clientFor(fixture);

    await expect(client.ensureSession()).rejects.toMatchObject({
      name: 'RuntimeCompatibilityError',
      code: 'runtime_incompatible',
    });
  });

  it('fails closed when the targeted execution capability is absent', async () => {
    const fixture = createTransport({ capabilities: [] });
    const client = clientFor(fixture);

    await expect(client.ensureSession()).rejects.toMatchObject({
      name: 'RuntimeCompatibilityError',
      reason: expect.stringContaining('execution_binding.targeted.v1'),
    });
  });

  it('rejects owner, worker, wrong actor/realm/instance and non-exact connector scopes', async () => {
    const cases = [
      ['owner actor', { actorId: 'owner' }, /actor or granted scopes/],
      ['worker actor with reduced scopes', { actorId: 'astrid-pack-host', scopes: ['handshake', 'projects:read', 'tasks:read'] }, /actor or granted scopes/],
      ['unexpected product actor', { actorId: 'another-product-actor' }, /actor or realm/],
      ['unexpected realm', { realmId: 'another-realm' }, /actor or realm/],
      ['unexpected Runtime instance', { runtimeInstanceId: 'another-runtime' }, /Runtime restarted—relaunch workspace/],
      ['missing requested scope', { scopes: ['handshake', 'projects:read', 'projects:write', 'objects:read', 'tasks:read', 'tasks:write'] }, /actor or granted scopes/],
      ['additional admin scope', { scopes: ['handshake', 'projects:read', 'projects:write', 'objects:read', 'objects:write', 'tasks:read', 'tasks:write', 'admin'] }, /actor or granted scopes/],
      ['realm endpoint substitution', { realmResponseId: 'another-realm' }, /realm endpoint/],
    ] as const;

    for (const [label, transportOptions, expectedReason] of cases) {
      const fixture = createTransport(transportOptions);
      const client = clientFor(fixture);
      const error = await client.ensureSession().then(() => null, (failure) => failure);
      if (!error) throw new Error(`${label}: expected the Runtime identity check to fail`);
      expect(error).toMatchObject({
        name: 'RuntimeCompatibilityError',
        reason: expect.stringMatching(expectedReason),
      });
      expect(fixture.requests.some(({ path }) => path === '/v1/projects')).toBe(false);
      if (label !== 'realm endpoint substitution') {
        expect(fixture.requests.some(({ path }) => path === '/v1/realm')).toBe(false);
      }
    }
  });

  it('preserves generated generation/variant cursors and managed identities', async () => {
    const fixture = createTransport();
    const client = clientFor(fixture, { token: true });

    const generations = await client.listGenerations(PROJECT_ID, 'generations-7', 2);
    const variants = await client.listVariants(generation.generation_id, 'variants-3', 2);
    expect(generations).toEqual({ items: [generation], next_cursor: 'generations-8' });
    expect(variants).toEqual({ items: [variant], next_cursor: 'variants-4' });
    expect(generations.items[0]?.generation_id).toBe('generation-r2');
    expect(variants.items[0]?.object_id).toBe(`sha256:${'2'.repeat(64)}`);
    expect(fixture.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/health',
      'POST /v1/handshake',
      'GET /v1/realm',
      'GET /v1/projects/project%2Fr2/generations?limit=2&cursor=generations-7',
      'GET /v1/generations/generation-r2/variants?limit=2&cursor=variants-3',
    ]);
  });

  it('reopens the cached handshake and preserves generated Range/ETag media identity', async () => {
    const fixture = createTransport();
    const client = clientFor(fixture, { token: true });

    await client.ensureSession();
    const ranged = await client.getObject(MEDIA_OBJECT_ID, [0, 3]);
    const metadata = await client.headObject(MEDIA_OBJECT_ID);
    await client.reconnect();

    expect(ranged.status).toBe(206);
    expect(ranged.etag).toBe(`"${MEDIA_OBJECT_DIGEST}"`);
    expect(ranged.content_range).toBe('bytes 0-3/4');
    expect(metadata.status).toBe(200);
    expect(metadata.etag).toBe(`"${MEDIA_OBJECT_DIGEST}"`);
    expect(fixture.requests.filter(({ path }) => path === '/v1/handshake')).toHaveLength(2);
    expect(fixture.requests.find(({ method, path }) => method === 'GET' && path === `/v1/objects/${MEDIA_OBJECT_ID}`)?.headers.Range)
      .toBe('bytes=0-3');
    expect(fixture.requests.find(({ method, path }) => method === 'HEAD' && path === `/v1/objects/${MEDIA_OBJECT_ID}`)?.headers.Range)
      .toBeUndefined();
  });

  it('clears the cached session and reports a revoked credential truthfully', async () => {
    const fixture = createTransport({ revokeFirstMediaRead: true });
    const client = clientFor(fixture, { token: true });

    await expect(client.getObject(MEDIA_OBJECT_ID)).rejects.toMatchObject({
      name: 'RuntimeAuthenticationError',
      code: 'runtime_authentication',
      status: 401,
      recoveryAction: 'Provide an authenticated connector credential and retry.',
    });

    await expect(client.getObject(MEDIA_OBJECT_ID)).resolves.toMatchObject({
      status: 200,
      etag: `"${MEDIA_OBJECT_DIGEST}"`,
    });
    expect(fixture.requests.filter(({ path }) => path === '/v1/handshake')).toHaveLength(2);
  });

  it('exports one selected managed output with exact identity assertions and a durable receipt', async () => {
    const fixture = createTransport();
    const client = clientFor(fixture, { token: true });

    const exported = await client.exportManagedOutput(
      MANAGED_OUTPUT_ASSOCIATION_ID,
      'retained-output.mp4',
      {
        project_id: PROJECT_ID,
        run_id: 'run-r3',
        task_id: 'task-r3',
        attempt_id: 'attempt-r3',
        association_id: MANAGED_OUTPUT_ASSOCIATION_ID,
        output_port: 'video',
        role: 'output',
        object_id: MANAGED_OUTPUT_OBJECT_ID,
        digest: MANAGED_OUTPUT_OBJECT_ID,
        size: 4,
        filename: 'retained-output.mp4',
        media_type: 'video/mp4',
        executor_id: 'executor-r3',
        lease_id: 'lease-r3',
        fence: 6,
        runtime_epoch: 7,
      },
    );

    expect(exported).toMatchObject({
      export_id: 'export-r3',
      association_id: MANAGED_OUTPUT_ASSOCIATION_ID,
      object_id: MANAGED_OUTPUT_OBJECT_ID,
      digest: MANAGED_OUTPUT_OBJECT_ID,
      size: 4,
      filename: 'retained-output.mp4',
      runtime_epoch: 7,
    });
    expect(exported.receipt).toMatchObject({
      command_kind: 'managed_output.export',
      project_id: PROJECT_ID,
      event_ids: [],
    });
    expect(fixture.requests.at(-1)?.path).toBe(`/v1/managed-outputs/${MANAGED_OUTPUT_ASSOCIATION_ID}/export`);
  });

  it('uses the exact GEN/UE admission mapping and keeps task lifecycle browser-bounded', async () => {
    const fixture = createTransport();
    const client = clientFor(fixture, { token: true });

    const capabilities = await client.listCapabilities();
    expect(capabilities.items[0]).toMatchObject({
      capability_id: CAPABILITY_ID,
      definition_digest: CAPABILITY_DIGEST,
      status: 'ready',
    });
    expect(exactGenTaskInput.capability_digest).toBe(capabilities.items[0]?.definition_digest);

    const admitted = await client.admitTask(exactGenTaskInput, 'reigh.admit:r3');
    expect(admitted).toMatchObject({
      task_id: 'task-r3',
      project_id: PROJECT_ID,
      capability_id: CAPABILITY_ID,
      capability_digest: CAPABILITY_DIGEST,
      input_object_ids: [INPUT_OBJECT_ID],
      generation_intent: exactGenTaskInput.generation_intent,
      state: 'queued',
      version: 1,
    });
    expect(admitted.receipt.command_kind).toBe('task.create');

    await expect(client.getTask('task-r3')).resolves.toMatchObject({ task_id: 'task-r3', state: 'queued' });
    await expect(client.listProjectTasks(PROJECT_ID, 'tasks-2', 1)).resolves.toEqual({ items: [fixture.task], next_cursor: 'tasks-3' });

    const cancelled = await client.cancelTask('task-r3', 'reigh.cancel:r3', 1);
    expect(cancelled).toMatchObject({ task_id: 'task-r3', state: 'cancelled', version: 2 });
    const retried = await client.retryTask('task-r3', 'reigh.retry:r3', 2);
    expect(retried).toMatchObject({ task_id: 'task-r3', state: 'retrying', version: 3 });
    expect(retried.receipt.command_kind).toBe('task.retry');

    expect(fixture.requests.filter(({ path }) => path === '/v1/tasks').map(({ method }) => method)).toEqual(['POST']);
    expect(fixture.requests.some(({ path }) => path === '/v1/tasks/claim')).toBe(false);
    expect(fixture.requests.some(({ path }) => path.includes('/settle'))).toBe(false);
  });
});
