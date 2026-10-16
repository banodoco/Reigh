import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, WorkspaceClient, type Transport } from './generated.ts';
import { ReighRuntimeClient, RUNTIME_CLIENT_SCOPES } from './client.ts';
import { RuntimeDataProvider } from './dataProvider.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from './contract-metadata.ts';
import type { SelectedProjectMediaIdentity } from '@/shared/contracts/selectedProjectMedia.ts';

type OutputSelectionDelegate = (
  project: string,
  selectors: { association_id: string; object_id: string; version: number },
) => Promise<SelectedProjectMediaIdentity>;
const prototype: { getProjectMediaSelectionForOutput?: OutputSelectionDelegate } = WorkspaceClient.prototype as unknown as {
  getProjectMediaSelectionForOutput?: OutputSelectionDelegate;
};
const original = Object.getOwnPropertyDescriptor(prototype, 'getProjectMediaSelectionForOutput');
const hasGeneratedSelection = typeof prototype.getProjectMediaSelectionForOutput === 'function';
const selection = {
  asset: 'asset-from-output',
  generation_id: 'generation-from-output',
  variant_id: 'variant-from-output',
  object_id: `sha256:${'a'.repeat(64)}`,
  catalog_digest: `sha256:${'b'.repeat(64)}`,
};
const project = 'project /?&é';
const selectors = {
  association_id: 'association /?&é',
  object_id: selection.object_id,
  version: 17,
};
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

function setDelegate(delegate: OutputSelectionDelegate | undefined) {
  Object.defineProperty(prototype, 'getProjectMediaSelectionForOutput', {
    configurable: true,
    writable: true,
    value: delegate,
  });
}

afterEach(() => {
  if (original) Object.defineProperty(prototype, 'getProjectMediaSelectionForOutput', original);
  else delete prototype.getProjectMediaSelectionForOutput;
});

describe('output-bound Runtime media selection', () => {
  it('passes the captured association, object, and version through unchanged', async () => {
    const f = fixture();
    const delegate = vi.fn(async function (this: WorkspaceClient) {
      expect(this).toBeInstanceOf(WorkspaceClient);
      return selection;
    });
    setDelegate(delegate);
    const client = new ReighRuntimeClient({ transport: f.transport, token: 'disposable-token' });

    expect(await client.getProjectMediaSelectionForOutput(project, selectors)).toBe(selection);
    expect(delegate).toHaveBeenCalledExactlyOnceWith(project, selectors);
    expect(f.requests.map((request) => request.path)).toEqual(['/v1/health', '/v1/handshake', '/v1/realm']);
  });

  it('binds the provider project before IO and carries the exact output version', async () => {
    const f = fixture();
    const delegate = vi.fn().mockResolvedValue(selection);
    setDelegate(delegate);
    const provider = new RuntimeDataProvider({ projectId: project, transport: f.transport });
    const request = { projectId: project, ...selectors };

    await expect(provider.getProjectMediaSelectionForOutput({ ...request, projectId: 'other-project' }))
      .rejects.toThrow('different project');
    expect(f.requests).toHaveLength(0);
    expect(await provider.getProjectMediaSelectionForOutput(request)).toBe(selection);
    expect(delegate).toHaveBeenCalledExactlyOnceWith(project, selectors);
  });

  it('refuses a missing generated output-selection method without a substitute route', async () => {
    setDelegate(undefined);
    const f = fixture();
    const client = new ReighRuntimeClient({ transport: f.transport });

    await expect(client.getProjectMediaSelectionForOutput(project, selectors))
      .rejects.toThrow('generated client has no getProjectMediaSelectionForOutput (E069)');
    expect(f.requests).toHaveLength(3);
  });

  it('retries authentication with the same captured output tuple', async () => {
    const f = fixture();
    const delegate = vi.fn()
      .mockRejectedValueOnce(new ApiError(401, 'unauthorized', 'revoked', '', {}))
      .mockResolvedValue(selection);
    setDelegate(delegate);
    const client = new ReighRuntimeClient({ transport: f.transport });

    await expect(client.getProjectMediaSelectionForOutput(project, selectors)).rejects.toThrow('authentication failed');
    expect(await client.getProjectMediaSelectionForOutput(project, selectors)).toBe(selection);
    expect(delegate).toHaveBeenNthCalledWith(1, project, selectors);
    expect(delegate).toHaveBeenNthCalledWith(2, project, selectors);
    expect(f.requests.filter((request) => request.path === '/v1/handshake')).toHaveLength(2);
  });

  it.skipIf(!hasGeneratedSelection)('generated successor encodes the exact selectors in the request', async () => {
    const f = fixture();
    const client = new ReighRuntimeClient({ transport: f.transport, token: 'disposable-token' });

    expect(await client.getProjectMediaSelectionForOutput(project, selectors)).toEqual(selection);
    expect(f.requests.at(-1)).toEqual({
      method: 'GET',
      path: `/v1/projects/${encodeURIComponent(project)}/media-selection?association_id=${encodeURIComponent(selectors.association_id)}&object_id=${encodeURIComponent(selectors.object_id)}&version=${selectors.version}`,
      headers: expect.objectContaining({ Authorization: 'Bearer disposable-token' }),
    });
  });
});
