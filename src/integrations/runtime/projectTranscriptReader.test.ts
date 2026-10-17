import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectTranscriptReader } from './projectTranscriptReader.ts';

function fixture() {
  const content = { schema_version: 1, subject: { media_object_id: 'media', media_sha256: 'digest' },
    source: { producer_id: 'synthetic', source_id: 'take', lineage_id: 'line', revision_id: 'rev', producer_digest: 'producer' },
    clock: { kind: 'media', unit: 'seconds', origin_seconds: 0 }, words: [], opaque: { keep: true } };
  // Fixture bytes only. Production reads the publisher's bytes unchanged.
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const object = { object_id: `sha256:${digest}`, digest, media_type: 'application/json', size: bytes.byteLength, version: 1, created_at: '' };
  const document = { document_id: 'opaque-producer-document', project_id: 'project', kind: 'media.transcript/v1',
    content, version: 3, created_at: '', updated_at: '' };
  const client = {
    listDocuments: vi.fn(async () => ({ items: [document], next_cursor: null })),
    getDocument: vi.fn(async () => document),
    listProjectObjects: vi.fn(async () => ({ items: [object], next_cursor: null })),
    getProjectObjectLocation: vi.fn(async () => object),
    getObject: vi.fn(async () => ({ data: bytes })),
  };
  vi.stubGlobal('crypto', webcrypto);
  return { client, document, object, bytes, reader: createProjectTranscriptReader(client, 'project') };
}
afterEach(() => vi.unstubAllGlobals());

describe('project transcript read transport', () => {
  it('reads the selected project/version and verifies exact existing CAS bytes without source writes or receipts', async () => {
    const { client, document, object, reader } = fixture();
    expect(await reader.list()).toEqual([document]);
    const result = await reader.read(document);
    expect(result.document).toEqual({ id: document.document_id, version: 3, content_digest: object.object_id });
    expect(result.snapshot).toEqual({ object_id: object.object_id, sha256: object.digest });
    expect(result).not.toHaveProperty('source_receipt');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.source)).toBe(true);
    expect(client.getDocument).toHaveBeenCalledWith('project', document.document_id);
    expect(client.getProjectObjectLocation).toHaveBeenCalledWith('project', object.object_id);
    expect(Object.keys(reader).sort()).toEqual(['list', 'projectId', 'read']);
    document.content.source.source_id = 'mutated';
    expect(result.source.source_id).toBe('take');
  });

  it.each(['project', 'version', 'kind', 'id'] as const)('refuses a changed exact document %s before CAS reads', async (field) => {
    const { client, document, reader } = fixture();
    const selected = { document_id: document.document_id, version: document.version };
    if (field === 'project') document.project_id = 'foreign';
    if (field === 'version') document.version++;
    if (field === 'kind') document.kind = 'other/v1';
    if (field === 'id') document.document_id = 'another';
    await expect(reader.read(selected)).rejects.toThrow('advanced or mismatched');
    expect(client.getObject).not.toHaveBeenCalled();
  });

  it('refuses corrupt CAS and absent snapshots, including changed opaque document content', async () => {
    const { client, document, reader } = fixture();
    document.content.opaque.keep = false;
    await expect(reader.read(document)).rejects.toThrow('no verified project CAS snapshot');
    client.getObject.mockResolvedValue({ data: new Uint8Array([0]) });
    await expect(reader.read(document)).rejects.toThrow('failed verification');
  });

  it('follows project document pagination and rejects repeated cursors', async () => {
    const { client, document, reader } = fixture();
    client.listDocuments.mockResolvedValue({ items: [document], next_cursor: 'same' } as never);
    await expect(reader.list()).rejects.toThrow('repeated page cursor');
  });
});
