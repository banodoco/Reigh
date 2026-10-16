import { shotSettingsValue } from './canonicalShotMetadata.ts';
import type { Shot } from '@/domains/generation/types/index.ts';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import type { PreparedShotComposition } from './shotCompositionAdapter.ts';

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function mediaKind(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'unknown';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'image' || normalized.startsWith('image/')) return 'image';
  if (normalized === 'video' || normalized.startsWith('video/')) return 'video';
  if (normalized === 'audio' || normalized.startsWith('audio/')) return 'audio';
  return 'unknown';
}

/**
 * The editor host consumes the legacy `Shot` shape, but its rows are entirely
 * projected from the prepared canonical graph. It intentionally has no
 * relational read fallback.
 */
export function selectCanonicalShotViewModels(composition: PreparedShotComposition | null | undefined): Shot[] {
  return composition?.occurrences.map((occurrence) => {
    const provenance = record(occurrence.revision.provenance);
    const metadata = record(occurrence.revision.metadata);
    const timing = record(occurrence.revision.timing);
    const settings = record(composition.semanticCommandSaving ? shotSettingsValue(occurrence.revision) : occurrence.revision.settings);
    const images = (Array.isArray(occurrence.revision.assets) ? occurrence.revision.assets : [])
      .flatMap((asset, index) => {
        const value = record(asset);
        const objectId = text(value.object_id);
        // The legacy editor `images` collection feeds image counts and image
        // selection. Keep audio, video and future/unknown assets in the
        // canonical asset bag, but never project them as images.
        if (!objectId || mediaKind(value.media_type) !== 'image') return [];
        const location = bridgeMediaUrl(composition.projectId, objectId);
        return [{
          id: `${occurrence.occurrenceId}:asset:${index}`,
          generation_id: objectId,
          location,
          imageUrl: location,
          thumbUrl: location,
          // Runtime managed-media metadata is authoritative. Payload aliases
          // such as role/type/media_kind are preserved but never guessed here.
          type: 'image',
          createdAt: new Date(0).toISOString(),
          metadata: { source: 'canonical-shot-composition', occurrenceId: occurrence.occurrenceId },
        }];
      });
    return {
      id: occurrence.occurrenceId,
      name: (composition.semanticCommandSaving ? text(provenance.name) : undefined)
        ?? text(occurrence.revision.name)
        ?? text(provenance.name)
        ?? text(provenance.title)
        ?? text(metadata.name)
        ?? text(metadata.title)
        ?? occurrence.shotId,
      project_id: composition.projectId,
      position: occurrence.ordinal,
      settings: Object.keys(settings).length > 0
        ? { [TOOL_IDS.TRAVEL_BETWEEN_IMAGES]: settings }
        : {},
      images,
      imageCount: images.length,
      positionedImageCount: images.length,
      unpositionedImageCount: 0,
      hasUnpositionedImages: false,
      canonicalOccurrenceId: occurrence.occurrenceId,
      canonicalShotId: occurrence.shotId,
      canonicalRevisionId: occurrence.revisionId,
      canonicalParentDocumentId: occurrence.parentDocumentId,
      canonicalTiming: timing,
      canonicalAudio: occurrence.revision.audio,
      canonicalGenerationInputs: occurrence.revision.generation_inputs,
      canonicalAssets: occurrence.revision.assets,
      canonicalDependencies: occurrence.revision.dependencies,
      canonicalProvenance: provenance,
    } as Shot;
  }) ?? [];
}
