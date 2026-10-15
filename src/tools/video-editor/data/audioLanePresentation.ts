import { z } from 'zod';

const operationSchema = z.looseObject({
  op: z.string().min(1),
  select: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

const editSourceSchema = z.looseObject({
  operation: operationSchema,
  // Kept as producer data for diagnostics only. The App never executes it.
  command: z.string().optional(),
});

const gainSchema = z.looseObject({
  linear: z.number(),
  db: z.number(),
});

const timelineSpanSchema = z.looseObject({
  start_s: z.number(),
  end_s: z.number(),
  start_frame: z.number().int(),
  end_frame: z.number().int(),
});

const sourceWindowSchema = z.looseObject({
  start_s: z.number(),
  end_s: z.number(),
});

const generatedSpanSchema = z.looseObject({
  id: z.string().min(1),
  asset: z.string().min(1),
  timeline: timelineSpanSchema,
  source: sourceWindowSchema,
  gain: gainSchema,
  fade_in_s: z.number().nullable(),
  fade_out_s: z.number().nullable(),
  generated: z.literal(true),
  read_only: z.literal(true),
  edit_source: editSourceSchema,
});

const arrangementSchema = z.looseObject({
  id: z.string().min(1),
  owner: z.string().min(1),
  asset: z.string().min(1),
  rate: z.number(),
  gain: gainSchema,
  source_offset_s: z.number(),
  edit_source: editSourceSchema,
  spans: z.array(generatedSpanSchema),
});

const switchSchema = z.looseObject({
  id: z.string().min(1),
  from_arrangement: z.string().min(1),
  to_arrangement: z.string().min(1),
  on: z.looseObject({
    time_ref: z.string(),
    center_s: z.number(),
    center_frame: z.number().int(),
  }),
  window: z.looseObject({
    start_s: z.number(),
    end_s: z.number(),
    start_frame: z.number().int(),
    end_frame: z.number().int(),
  }),
  curve: z.string().min(1),
});

const seamSchema = z.looseObject({
  at_s: z.number(),
  frame: z.number().int(),
  action: z.string().min(1),
  delta_s: z.number(),
  duration_s: z.number(),
});

/** The exact read-only `astrid.audio-lane.v1` projection from the producer. */
export const audioLaneProjectionSchema = z.looseObject({
  schema: z.literal('astrid.audio-lane.v1'),
  capability: z.literal('adopted-music-bed'),
  owner: z.string().min(1),
  fps: z.number().positive(),
  arrangements: z.array(arrangementSchema),
  switches: z.array(switchSchema),
  seams: z.array(seamSchema),
});

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Value)[]
    ? readonly DeepReadonly<Value>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type AudioLaneProjection = DeepReadonly<z.infer<typeof audioLaneProjectionSchema>>;
export type AudioLaneOwnerOperation = AudioLaneProjection['arrangements'][number]['edit_source']['operation'];

export interface AudioLaneRevisionBinding {
  readonly projectId: string;
  readonly timelineId: string;
  /** Opaque Runtime revision identity. */
  readonly revisionId: string;
  /** Opaque Runtime snapshot identity. */
  readonly snapshotDigest: string;
}

export type AudioLanePresentation =
  | {
      readonly status: 'available';
      readonly binding: AudioLaneRevisionBinding;
      readonly lane: AudioLaneProjection;
    }
  | {
      readonly status: 'no-bed';
      readonly binding: AudioLaneRevisionBinding;
      readonly lane: null;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: string;
      readonly binding?: AudioLaneRevisionBinding;
    };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function refusalReason(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ['reason', 'message', 'detail'] as const) {
    if (nonEmptyString(value[key])) return value[key];
  }
  return undefined;
}

/**
 * Decode the optional projection from one canonical Runtime inspect response.
 * A missing projection and a supported `null` are deliberately distinct.
 */
export function readAudioLanePresentation(
  inspection: unknown,
  expected: { readonly projectId: string; readonly timelineId: string; readonly revisionId: string },
  requestUnavailableReason?: string,
): AudioLanePresentation {
  if (!isRecord(inspection)) {
    return { status: 'unavailable', reason: 'Runtime inspect returned no audio-lane revision binding.' };
  }

  const projectId = inspection.project_id;
  const timelineId = inspection.timeline_id;
  const revisionId = inspection.revision_id;
  const snapshotDigest = inspection.snapshot_digest;
  if (!nonEmptyString(projectId) || !nonEmptyString(timelineId)
    || !nonEmptyString(revisionId) || !nonEmptyString(snapshotDigest)) {
    return { status: 'unavailable', reason: 'Runtime inspect omitted the audio-lane revision binding.' };
  }

  const binding: AudioLaneRevisionBinding = {
    projectId,
    timelineId,
    revisionId,
    snapshotDigest,
  };
  if (projectId !== expected.projectId || timelineId !== expected.timelineId) {
    return {
      status: 'unavailable',
      reason: 'Runtime audio-lane projection belongs to a different project or timeline.',
      binding,
    };
  }
  if (revisionId !== expected.revisionId) {
    return {
      status: 'unavailable',
      reason: 'Runtime audio-lane projection does not match the inspected timeline revision.',
      binding,
    };
  }

  if (requestUnavailableReason) {
    return {
      status: 'unavailable',
      reason: `Runtime audio-lane projection is unavailable: ${requestUnavailableReason}`,
      binding,
    };
  }

  const presentation = inspection.presentation;
  if (!isRecord(presentation) || !Object.prototype.hasOwnProperty.call(presentation, 'audio_lane')) {
    return {
      status: 'unavailable',
      reason: 'Runtime did not provide an audio-lane projection for this inspected revision.',
      binding,
    };
  }
  const lane = presentation.audio_lane;
  if (lane === null) return { status: 'no-bed', binding, lane: null };

  const parsed = audioLaneProjectionSchema.safeParse(lane);
  if (!parsed.success) {
    const reason = refusalReason(lane);
    return {
      status: 'unavailable',
      reason: reason
        ? `Runtime refused the audio-lane projection: ${reason}`
        : 'Runtime returned a malformed or unsupported audio-lane projection.',
      binding,
    };
  }

  return {
    status: 'available',
    binding,
    lane: deepFreeze(parsed.data) as AudioLaneProjection,
  };
}

export function audioLanePresentationRevisionMatches(
  presentation: AudioLanePresentation | undefined,
  projectId: string,
  timelineId: string,
  revisionId: string | null,
): boolean {
  if (!presentation || presentation.status === 'unavailable' || revisionId === null) return false;
  return presentation.binding.projectId === projectId
    && presentation.binding.timelineId === timelineId
    && presentation.binding.revisionId === revisionId;
}
