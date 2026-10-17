import type { EditCommand } from '@/integrations/runtime/generated.ts';
import type { SelectedProjectMediaIdentity } from '@/shared/contracts/selectedProjectMedia.ts';

const selectedMediaFields = [
  'asset',
  'generation_id',
  'variant_id',
  'object_id',
  'catalog_digest',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

/** Validate a Runtime selection without deriving or repairing any identity. */
export function readSelectedProjectMediaIdentity(value: unknown): SelectedProjectMediaIdentity | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== selectedMediaFields.length
    || selectedMediaFields.some((field) => !Object.prototype.hasOwnProperty.call(value, field))) return null;
  if (selectedMediaFields.some((field) => typeof value[field] !== 'string' || value[field].length === 0)) return null;
  if (!/^sha256:[0-9a-f]{64}$/.test(value.object_id as string)
    || !/^sha256:[0-9a-f]{64}$/.test(value.catalog_digest as string)) return null;
  return value as unknown as SelectedProjectMediaIdentity;
}

/** Match the admitted SDK property-path grammar without splitting asset keys. */
export const selectedMediaRegistryExpectationPath = (asset: string): string =>
  /^[A-Za-z_][\w-]*$/.test(asset) ? `parent::registry.assets.${asset}` : `parent::registry.assets[${JSON.stringify(asset)}]`;

export function buildSelectedProjectMediaAddCommand({
  selection: selectionValue,
  assetKey,
  mediaType,
  trackId,
  trackKind,
  clipId,
  at,
  durationSeconds,
  intrinsicDurationSeconds,
  existingTrackIds,
  existingClipIds,
  existingRegistryEntry,
}: {
  selection: unknown;
  assetKey: string;
  mediaType: 'image' | 'video' | 'audio';
  trackId: string;
  trackKind: 'audio' | 'visual';
  clipId: string;
  at: number;
  durationSeconds: number;
  intrinsicDurationSeconds: number | null;
  existingTrackIds: readonly string[];
  existingClipIds: readonly string[];
  existingRegistryEntry?: unknown;
}): EditCommand | undefined {
  const selection = readSelectedProjectMediaIdentity(selectionValue);
  if (!selection || selection.asset !== assetKey || !assetKey
    || !trackId || trackId.includes('/') || !clipId || clipId.includes('/')
    || existingTrackIds.filter((id) => id === trackId).length !== 1
    || existingClipIds.includes(clipId)
    || (trackKind === 'visual' && mediaType === 'audio')
    || (trackKind === 'audio' && mediaType === 'image')
    || !Number.isFinite(at) || at < 0
    || !Number.isFinite(durationSeconds) || durationSeconds <= 0
    || (mediaType === 'audio'
      && (!Number.isFinite(intrinsicDurationSeconds) || (intrinsicDurationSeconds ?? 0) <= 0))
    || (typeof intrinsicDurationSeconds === 'number' && durationSeconds > intrinsicDurationSeconds)) {
    return undefined;
  }

  const scopedClipId = `parent/clip:${clipId}`;
  return {
    op: 'timeline.add',
    select: `parent/track:${trackId}`,
    args: {
      media: selection,
      clip_id: clipId,
      at,
      duration: durationSeconds,
    },
    created: [scopedClipId],
    expect: {
      [`${scopedClipId}::`]: { state: 'absent' },
      [selectedMediaRegistryExpectationPath(selection.asset)]: existingRegistryEntry === undefined
        ? { state: 'absent' } : { state: 'present', value: structuredClone(existingRegistryEntry) },
    },
  };
}
