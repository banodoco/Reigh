import { isManualTextClip } from '../../commands/manualText.ts';
import type { AstridElementDescriptor } from '@/tools/video-editor/runtime/astrid-element-host.ts';
import type { TimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';

export type AstridElementParamDescriptor = AstridElementDescriptor & {
  schema: object;
};

type SchemaWithProperties = object & {
  properties: Record<string, unknown>;
};

function hasEditableSchema(schema: object | undefined): schema is SchemaWithProperties {
  if (!schema || Array.isArray(schema)) return false;
  const properties = (schema as { properties?: unknown }).properties;
  return Boolean(
    properties
    && typeof properties === 'object'
    && !Array.isArray(properties)
    && Object.keys(properties).length > 0,
  );
}

/** Resolve only the host-provided schema for a clip's exact pinned identity. */
export function resolveAstridElementParamDescriptor(
  clip: Pick<ResolvedTimelineClip, 'id' | 'track' | 'elementRef' | 'clipType' | 'text'> | null,
  descriptors: readonly AstridElementDescriptor[],
  readOnly: boolean | undefined,
  timelineEditability: TimelineEditability | undefined,
): AstridElementParamDescriptor | undefined {
  const reference = clip?.elementRef;
  // The existing inline text inspector owns this carrier. Binding am-type must
  // not introduce a second text/params authoring surface.
  if (!clip || !reference || readOnly || isManualTextClip(clip)) return undefined;

  const timelinePermission = timelineEditability?.checkTimeline?.();
  const clipPermission = timelineEditability?.check({
    clipId: clip.id,
    sourceTrackId: clip.track,
    targetTrackId: clip.track,
  });
  if (timelinePermission?.allowed === false || clipPermission?.allowed === false) return undefined;

  const descriptor = descriptors.find((candidate) => (
    candidate.id === reference.id
    && candidate.kind === reference.kind
    && candidate.revision === reference.revision
    && candidate.packId === reference.packId
  ));
  if (!descriptor || !hasEditableSchema(descriptor.schema)) return undefined;
  return descriptor as AstridElementParamDescriptor;
}
