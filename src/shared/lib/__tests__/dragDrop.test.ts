import { describe, it, expect } from 'vitest';

// Mock errorHandler to avoid pulling in toast/Supabase dependencies
import {
  getDragType,
  setGenerationDragData,
  setMultiGenerationDragData,
  setShotDragData,
  getGenerationDropData,
  getMultiGenerationDropData,
  getShotDropData,
  isValidDropTarget,
  isFileDrag,
  NEW_GROUP_DROPPABLE_ID,
  GENERATION_MULTI_DRAG_TYPE,
} from '../dnd/dragDrop';
import type { GenerationDropData, ShotDropData } from '../dnd/dragDrop';

/**
 * Create a minimal mock of React.DragEvent for testing
 */
function createMockDragEvent(overrides: {
  types?: string[];
  data?: Record<string, string>;
} = {}): React.DragEvent {
  const storedData: Record<string, string> = overrides.data ?? {};
  const types = overrides.types ?? Object.keys(storedData);

  return {
    dataTransfer: {
      types,
      effectAllowed: 'none',
      setData: (type: string, value: string) => {
        storedData[type] = value;
      },
      getData: (type: string) => storedData[type] ?? '',
    },
  } as unknown as React.DragEvent;
}

describe('getDragType', () => {
  it('returns "generation" for generation MIME type', () => {
    const event = createMockDragEvent({ types: ['application/x-generation'] });
    expect(getDragType(event)).toBe('generation');
  });

  it('returns "file" for Files type', () => {
    const event = createMockDragEvent({ types: ['Files'] });
    expect(getDragType(event)).toBe('file');
  });

  it('returns "generation-multi" for multi-generation MIME type', () => {
    const event = createMockDragEvent({ types: [GENERATION_MULTI_DRAG_TYPE] });
    expect(getDragType(event)).toBe('generation-multi');
  });

  it('returns "shot" for shot MIME type', () => {
    const event = createMockDragEvent({ types: ['application/x-shot'] });
    expect(getDragType(event)).toBe('shot');
  });

  it('returns "none" for plain text without generation payload', () => {
    const event = createMockDragEvent({
      types: ['text/plain'],
      data: { 'text/plain': 'hello world' },
    });
    expect(getDragType(event)).toBe('none');
  });

  it('returns "none" for empty types', () => {
    const event = createMockDragEvent({ types: [] });
    expect(getDragType(event)).toBe('none');
  });

  it('prefers generation over file when both present', () => {
    const event = createMockDragEvent({ types: ['application/x-generation', 'Files'] });
    expect(getDragType(event)).toBe('generation');
  });
});

describe('isFileDrag', () => {
  it('returns true when Files type present', () => {
    const event = createMockDragEvent({ types: ['Files'] });
    expect(isFileDrag(event)).toBe(true);
  });

  it('returns false when no Files type', () => {
    const event = createMockDragEvent({ types: ['text/plain'] });
    expect(isFileDrag(event)).toBe(false);
  });
});

describe('setGenerationDragData / getGenerationDropData round-trip', () => {
  it('round-trips generation data through set and get', () => {
    const data: GenerationDropData = {
      generationId: 'gen-123',
      imageUrl: 'https://example.com/img.png',
      thumbUrl: 'https://example.com/thumb.png',
      metadata: { prompt: 'a cat' },
    };

    const storedData: Record<string, string> = {};
    const setEvent = createMockDragEvent({ data: storedData });
    setGenerationDragData(setEvent, data);

    // Verify data was stored
    expect(storedData['application/x-generation']).toBeTruthy();
    expect(storedData['text/plain']).toContain('__reigh_generation__:');

    const getEvent = createMockDragEvent({
      types: ['application/x-generation'],
      data: storedData,
    });
    const result = getGenerationDropData(getEvent);

    expect(result).toEqual(data);
  });

  it('round-trips a Runtime selected-media tuple without rebuilding its identities', () => {
    const data: GenerationDropData = {
      generationId: 'generation-selected',
      variantId: 'variant-selected',
      mediaId: `sha256:${'a'.repeat(64)}`,
      selectedMedia: {
        asset: 'asset-selected',
        generation_id: 'generation-selected',
        variant_id: 'variant-selected',
        object_id: `sha256:${'a'.repeat(64)}`,
        catalog_digest: `sha256:${'b'.repeat(64)}`,
      },
      imageUrl: 'https://example.com/selected.mp4',
    };
    const storedData: Record<string, string> = {};
    setGenerationDragData(createMockDragEvent({ data: storedData }), data);
    const result = getGenerationDropData(createMockDragEvent({
      types: ['application/x-generation'],
      data: storedData,
    }));
    expect(result?.selectedMedia).toEqual(data.selectedMedia);
  });

  it('returns null when no data in dataTransfer', () => {
    const event = createMockDragEvent({ data: {} });
    expect(getGenerationDropData(event)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const event = createMockDragEvent({
      data: { 'application/x-generation': 'not-json' },
    });
    expect(getGenerationDropData(event)).toBeNull();
  });

  it('returns null when required fields missing', () => {
    const event = createMockDragEvent({
      data: { 'application/x-generation': JSON.stringify({ generationId: 'gen-1' }) }, // missing imageUrl
    });
    expect(getGenerationDropData(event)).toBeNull();
  });

  it('falls back to text/plain data', () => {
    const data: GenerationDropData = {
      generationId: 'gen-456',
      imageUrl: 'https://example.com/img.png',
    };

    const event = createMockDragEvent({
      data: { 'text/plain': `__reigh_generation__:${JSON.stringify(data)}` },
    });
    const result = getGenerationDropData(event);
    expect(result).toEqual(data);
  });

  it('trims whitespace-only URLs out of generation payloads', () => {
    const event = createMockDragEvent({
      data: {
        'application/x-generation': JSON.stringify({
          generationId: ' gen-123 ',
          imageUrl: '   ',
          thumbUrl: ' https://example.com/thumb.png ',
        }),
      },
    });

    expect(getGenerationDropData(event)).toBeNull();
  });

  it('normalizes trimmed generation URLs from the payload', () => {
    const event = createMockDragEvent({
      data: {
        'application/x-generation': JSON.stringify({
          generationId: ' gen-123 ',
          imageUrl: ' https://example.com/video.mp4 ',
          thumbUrl: ' https://example.com/thumb.png ',
        }),
      },
    });

    expect(getGenerationDropData(event)).toEqual({
      generationId: 'gen-123',
      imageUrl: 'https://example.com/video.mp4',
      thumbUrl: 'https://example.com/thumb.png',
    });
  });

  it('detects generation drags from prefixed text/plain payloads', () => {
    const event = createMockDragEvent({
      types: ['text/plain'],
      data: {
        'text/plain': '__reigh_generation__:{"generationId":"gen-789","imageUrl":"https://example.com/video.mp4"}',
      },
    });

    expect(getDragType(event)).toBe('generation');
    expect(isValidDropTarget(event)).toBe(true);
  });
});

describe('setMultiGenerationDragData / getMultiGenerationDropData round-trip', () => {
  it('round-trips multi-generation data through set and get', () => {
    const data: GenerationDropData[] = [
      {
        generationId: 'gen-123',
        imageUrl: 'https://example.com/img-1.png',
      },
      {
        generationId: 'gen-456',
        imageUrl: 'https://example.com/img-2.png',
        thumbUrl: 'https://example.com/thumb-2.png',
      },
    ];

    const storedData: Record<string, string> = {};
    const setEvent = createMockDragEvent({ data: storedData });
    setMultiGenerationDragData(setEvent, data);

    expect(storedData[GENERATION_MULTI_DRAG_TYPE]).toBeTruthy();
    expect(storedData['text/plain']).toContain('__reigh_generation_multi__:');

    const getEvent = createMockDragEvent({
      types: [GENERATION_MULTI_DRAG_TYPE],
      data: storedData,
    });

    expect(getMultiGenerationDropData(getEvent)).toEqual(data);
    expect(getDragType(getEvent)).toBe('generation-multi');
  });

  it('returns null for invalid multi-generation payloads', () => {
    const malformedEvent = createMockDragEvent({
      data: { [GENERATION_MULTI_DRAG_TYPE]: 'not-json' },
    });
    expect(getMultiGenerationDropData(malformedEvent)).toBeNull();

    const invalidShapeEvent = createMockDragEvent({
      data: {
        [GENERATION_MULTI_DRAG_TYPE]: JSON.stringify([{ generationId: 'gen-1' }]),
      },
    });
    expect(getMultiGenerationDropData(invalidShapeEvent)).toBeNull();
  });
});

describe('setShotDragData / getShotDropData round-trip', () => {
  it('round-trips shot data through set and get', () => {
    const data: ShotDropData = {
      shotId: 'shot-123',
      shotName: 'Shot 123',
      imageGenerationIds: ['gen-1', 'gen-2'],
    };

    const storedData: Record<string, string> = {};
    const setEvent = createMockDragEvent({ data: storedData });
    setShotDragData(setEvent, data);

    expect(storedData['application/x-shot']).toBeTruthy();
    expect(storedData['text/plain']).toContain('__reigh_shot__:');

    const getEvent = createMockDragEvent({
      types: ['application/x-shot'],
      data: storedData,
    });

    expect(getShotDropData(getEvent)).toEqual(data);
    expect(getDragType(getEvent)).toBe('shot');
  });

  it('returns null for invalid shot payloads', () => {
    const malformedEvent = createMockDragEvent({
      data: { 'application/x-shot': 'not-json' },
    });
    expect(getShotDropData(malformedEvent)).toBeNull();

    const invalidShapeEvent = createMockDragEvent({
      data: {
        'application/x-shot': JSON.stringify({ shotId: 'shot-1', shotName: 'Shot 1', imageGenerationIds: ['gen-1', 2] }),
      },
    });
    expect(getShotDropData(invalidShapeEvent)).toBeNull();
  });
});

describe('isValidDropTarget', () => {
  it('returns true for generation drag', () => {
    const event = createMockDragEvent({ types: ['application/x-generation'] });
    expect(isValidDropTarget(event)).toBe(true);
  });

  it('returns true for multi-generation drag', () => {
    const event = createMockDragEvent({ types: [GENERATION_MULTI_DRAG_TYPE] });
    expect(isValidDropTarget(event)).toBe(true);
  });

  it('returns true for file drag', () => {
    const event = createMockDragEvent({ types: ['Files'] });
    expect(isValidDropTarget(event)).toBe(true);
  });

  it('returns false for other drag types', () => {
    const event = createMockDragEvent({
      types: ['text/plain'],
      data: { 'text/plain': 'hello world' },
    });
    expect(isValidDropTarget(event)).toBe(false);
  });
});

describe('constants', () => {
  it('exports NEW_GROUP_DROPPABLE_ID', () => {
    expect(NEW_GROUP_DROPPABLE_ID).toBe('new-shot-group-dropzone');
  });
});
