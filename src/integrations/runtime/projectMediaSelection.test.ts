import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, WorkspaceClient, type Transport } from './generated.ts';
import { ReighRuntimeClient, RUNTIME_CLIENT_SCOPES } from './client.ts';
import { RuntimeDataProvider } from './dataProvider.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from './contract-metadata.ts';
import type { SelectedProjectMediaIdentity } from '@/shared/contracts/selectedProjectMedia.ts';

type SelectionDelegate = (project: string, asset: string, generation: string, variant: string) => Promise<SelectedProjectMediaIdentity>;
const prototype: WorkspaceClient & { getProjectMediaSelection?: SelectionDelegate } = WorkspaceClient.prototype;
const original = Object.getOwnPropertyDescriptor(prototype, 'getProjectMediaSelection');
const hasGeneratedSelection = typeof prototype.getProjectMediaSelection === 'function';
const selection = {
  asset: 'asset /?&é', generation_id: 'gen /?&é', variant_id: 'variant /?&é',
  object_id: `sha256:${'a'.repeat(64)}`, catalog_digest: `sha256:${'b'.repeat(64)}`,
};
const project = 'project /?&é';
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

function fixture() {
  const requests: Array<{ method: string; path: string; headers: Record<string, string> }> = [];
  const transport: Transport = async (method, path, headers) => {
    requests.push({ method, path, headers });
    const result = path === '/v1/health'
      ? { status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST }
      : path === '/v1/handshake'
        ? { protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, actor_id: 'product-connector', realm_id: 'realm', scopes: RUNTIME_CLIENT_SCOPES, capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }
        : path === '/v1/realm'
          ? { realm_id: 'realm' }
          : selection;
    return { status: 200, headers: {}, body: encode(result) };
  };
  return { requests, transport };
}

function setDelegate(delegate: SelectionDelegate | undefined) {
  Object.defineProperty(prototype, 'getProjectMediaSelection', { configurable: true, writable: true, value: delegate });
}

afterEach(() => {
  if (original) Object.defineProperty(prototype, 'getProjectMediaSelection', original);
  else delete prototype.getProjectMediaSelection;
});

describe('C007 optional authenticated delegate', () => {
  it('opens the existing authenticated session and passes raw selectors and the exact response unchanged', async () => {
    const f = fixture();
    const delegate = vi.fn(async function (this: WorkspaceClient) {
      expect(this).toBeInstanceOf(WorkspaceClient);
      expect(f.requests.map((r) => r.path)).toEqual(['/v1/health', '/v1/handshake', '/v1/realm']);
      return selection;
    });
    setDelegate(delegate);
    const client = new ReighRuntimeClient({ transport: f.transport, token: 'disposable-token' });
    expect(await client.getProjectMediaSelection(project, selection.asset, selection.generation_id, selection.variant_id)).toBe(selection);
    expect(delegate).toHaveBeenCalledExactlyOnceWith(project, selection.asset, selection.generation_id, selection.variant_id);
    expect(f.requests.every((r) => r.headers.Authorization === 'Bearer disposable-token')).toBe(true);
  });

  it('refuses a missing generated method without a substitute endpoint', async () => {
    setDelegate(undefined);
    const f = fixture();
    const client = new ReighRuntimeClient({ transport: f.transport });
    await expect(client.getProjectMediaSelection(project, 'asset', 'gen', 'variant')).rejects.toThrow('generated client has no getProjectMediaSelection (C007)');
    expect(f.requests).toHaveLength(3);
  });

  it('invalidates the same session on a revoked selection read and reauthenticates on retry', async () => {
    const f = fixture();
    const delegate = vi.fn().mockRejectedValueOnce(new ApiError(401, 'unauthorized', 'revoked', '', {})).mockResolvedValue(selection);
    setDelegate(delegate);
    const client = new ReighRuntimeClient({ transport: f.transport });
    await expect(client.getProjectMediaSelection(project, 'asset', 'gen', 'variant')).rejects.toThrow('authentication failed');
    expect(await client.getProjectMediaSelection(project, 'asset', 'gen', 'variant')).toBe(selection);
    expect(f.requests.filter((r) => r.path === '/v1/handshake')).toHaveLength(2);
  });

  it('binds the provider project before IO and reuses its existing client session', async () => {
    const f = fixture();
    const delegate = vi.fn().mockResolvedValue(selection);
    setDelegate(delegate);
    const provider = new RuntimeDataProvider({ projectId: project, transport: f.transport, token: 'disposable-token' });
    const request = { projectId: project, asset: selection.asset, generationId: selection.generation_id, variantId: selection.variant_id };
    await expect(provider.getProjectMediaSelection({ ...request, projectId: 'other' })).rejects.toThrow('different project');
    expect(f.requests).toHaveLength(0);
    expect(await provider.getProjectMediaSelection(request)).toBe(selection);
    expect(await provider.getProjectMediaSelection(request)).toBe(selection);
    expect(delegate).toHaveBeenNthCalledWith(1, project, selection.asset, selection.generation_id, selection.variant_id);
    expect(delegate).toHaveBeenNthCalledWith(2, project, selection.asset, selection.generation_id, selection.variant_id);
    expect(f.requests.filter((r) => r.path === '/v1/handshake')).toHaveLength(1);
  });

  // This runs against A's actual generated successor when admitted. No mock
  // route/encoder can establish transport evidence for a missing generated API.
  it.skipIf(!hasGeneratedSelection)('generated successor encodes every selector and passes through the exact five fields', async () => {
    const f = fixture();
    const client = new ReighRuntimeClient({ transport: f.transport, token: 'disposable-token' });
    expect(await client.getProjectMediaSelection(project, selection.asset, selection.generation_id, selection.variant_id)).toEqual(selection);
    expect(f.requests.at(-1)).toEqual({
      method: 'GET',
      path: `/v1/projects/${encodeURIComponent(project)}/media-selection?asset=${encodeURIComponent(selection.asset)}&generation_id=${encodeURIComponent(selection.generation_id)}&variant_id=${encodeURIComponent(selection.variant_id)}`,
      headers: expect.objectContaining({ Authorization: 'Bearer disposable-token' }),
    });
  });
});
