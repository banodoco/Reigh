import { describe, expect, it } from 'vitest';
import { sanitizeAssetRegistryEntry } from './timeline-domain.ts';

describe('selected media registry projection', () => {
  it('retains exact admitted detached format and authoring metadata while rejecting unknown top-level fields', () => {
    const entry = { media_id: `sha256:${'a'.repeat(64)}`, type: 'audio/wav',
      format: { object_id: `sha256:${'a'.repeat(64)}`, media_type: 'audio/wav', duration_seconds: 2, opaque: null },
      authoring_metadata: { generation: { metadata: { opaque: { op: 'clear' } } }, variant: { metadata: null } },
      unadmittedSibling: { secret: 'must not be admitted' },
    };
    const actual = sanitizeAssetRegistryEntry(entry);
    expect(actual).toEqual({ media_id: entry.media_id, type: entry.type, format: entry.format, authoring_metadata: entry.authoring_metadata });
    expect(actual).not.toBe(entry); expect(actual.format).not.toBe(entry.format); expect(actual.authoring_metadata).not.toBe(entry.authoring_metadata);
  });
});
