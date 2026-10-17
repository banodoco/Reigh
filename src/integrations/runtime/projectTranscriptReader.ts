import type { ManagedObject, Page, ProjectDocument } from './generated.ts';
import { canonicalJsonStringify } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import type { PinnedTranscriptRead } from '@/tools/video-editor/extensions/transcript-caption-foundry/consumer.ts';

/** Read-only, project-bound transport. Python owns the per-kind codec and validation. */
export interface ProjectTranscriptReader {
  readonly projectId: string;
  list(): Promise<readonly ProjectDocument[]>;
  read(document: Pick<ProjectDocument, 'document_id' | 'version'>): Promise<PinnedTranscriptRead>;
}

interface TranscriptReadClient {
  listDocuments(projectId: string, cursor?: string): Promise<Page<ProjectDocument>>;
  getDocument(projectId: string, documentId: string): Promise<ProjectDocument>;
  listProjectObjects(projectId: string, cursor?: string): Promise<Page<ManagedObject>>;
  getProjectObjectLocation(projectId: string, objectId: string): Promise<{ object_id: string; digest: string; size: number }>;
  getObject(objectId: string): Promise<{ data: Uint8Array }>;
}

function freezeProjection<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeProjection);
    Object.freeze(value);
  }
  return value;
}

async function allPages<T>(fetch: (cursor?: string) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await fetch(cursor);
    items.push(...page.items);
    cursor = page.next_cursor ?? undefined;
    if (cursor && seen.has(cursor)) throw new Error('Transcript read refused: repeated page cursor.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}

export function createProjectTranscriptReader(client: TranscriptReadClient, projectId: string): ProjectTranscriptReader {
  const exact = (row: ProjectDocument) => row.project_id === projectId && row.kind === 'media.transcript/v1';
  return Object.freeze({
    projectId,
    async list() {
      return (await allPages((cursor) => client.listDocuments(projectId, cursor))).filter(exact);
    },
    async read(pin: Pick<ProjectDocument, 'document_id' | 'version'>) {
      const row = await client.getDocument(projectId, pin.document_id);
      if (!exact(row) || row.document_id !== pin.document_id || row.version !== pin.version) {
        throw new Error('Transcript read refused: selected project/document/version advanced or mismatched.');
      }
      // Locate the producer's existing project CAS bytes, never serialize the
      // record to invent a snapshot hash. Equality includes opaque content.
      // The public COMMIT resolver validates the canonical Python bytes, stable
      // document ID, schema, media and source again before atomic acceptance.
      const objects = await allPages((cursor) => client.listProjectObjects(projectId, cursor));
      for (const object of objects) {
        if (object.media_type !== 'application/json') continue;
        const location = await client.getProjectObjectLocation(projectId, object.object_id);
        if (location.object_id !== object.object_id || location.digest !== object.digest || location.size !== object.size) {
          throw new Error('Transcript read refused: project CAS location changed.');
        }
        const { data } = await client.getObject(object.object_id);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data))),
          (byte) => byte.toString(16).padStart(2, '0')).join('');
        if (data.byteLength !== location.size || object.object_id !== `sha256:${digest}`
          || object.digest.replace(/^sha256:/, '') !== digest) {
          throw new Error('Transcript read refused: project CAS bytes failed verification.');
        }
        let record: Record<string, unknown>;
        try { record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); } catch { continue; }
        if (canonicalJsonStringify(record) !== canonicalJsonStringify(row.content)) continue;
        // This DTO is only a read projection, never a source receipt or grant.
        const frozen = JSON.parse(JSON.stringify({
          document: { id: row.document_id, version: row.version, content_digest: object.object_id },
          snapshot: { object_id: object.object_id, sha256: digest },
          subject: record.subject, source: record.source, clock: record.clock, words: record.words,
        })) as PinnedTranscriptRead;
        return freezeProjection(frozen);
      }
      throw new Error('Transcript read refused: selected document has no verified project CAS snapshot.');
    },
  });
}
