import { isTranscriptCaptionInverse } from './transcriptCaptionHistory.ts';
import { isTranscriptCaptionBatch, transcriptBindTarget } from './transcriptCaptions.ts';
import type { EditCommand } from '@/integrations/runtime/generated.ts';
import type { TimelineOccurrenceContext } from '../data/DataProvider.ts';
import type { CanonicalClipIdentity } from '../data/shotCompositionProjection.ts';
import type { ClipEditorPatch, ClipMeta, TimelineData } from '../lib/timeline-data.ts';
import type { TrackDefinition } from '../types/index.ts';
import { getClipTimelineDuration } from '../lib/config-utils.ts';
import type { AstridElementHost } from '../runtime/astrid-element-host.ts';
import { addTrackGestureCommands } from './trackGestures.ts';
import { isAssetRegistrationCommand, isAssetRegistrationInverse } from './assetRegistration.ts';
import { isTiedHoldExpansionInverse } from './tiedHoldExpansionHistory.ts';
import { isOverlapTrimInverse } from './overlapTrimHistory.ts';

/** Intent is attached by the handler, never inferred from the resulting document. */
const authoredCommands = new WeakMap<TimelineData, readonly EditCommand[]>();
const authoredOccurrences = new WeakMap<TimelineData, TimelineOccurrenceContext>();
const occurrenceOps = new Set(['clip.nudge', 'clip.set-track', 'clip.set-look', 'clip.set-param', 'clip.set-fade', 'clip.set-transition', 'clip.clear', 'transcript.bind']);
const selectedMediaFields = ['asset', 'generation_id', 'variant_id', 'object_id', 'catalog_digest'];
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => (
  Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
);
const isScopedGroupClipId = (value: unknown): value is string => (
  typeof value === 'string' && /^(?:parent|occurrence:[^/]+)\/clip:[^/]+$/.test(value)
);

/** Parent aggregate commands stay in the parent request even when their exact members are occurrence clips. */
function isShotGroupAggregateCommand(command: EditCommand): boolean {
  if (command.select !== null || !hasExactKeys(command as unknown as Record<string, unknown>, ['op', 'select', 'args'])) return false;
  const args = command.args;
  if (!isRecord(args) || !isRecord(args.group)
    || !hasExactKeys(args.group, ['shotId', 'trackId'])
    || ![args.group.shotId, args.group.trackId].every((value) => typeof value === 'string' && value.length > 0)) return false;

  if (command.op === 'shot-group.remove') {
    return hasExactKeys(args, ['group', 'remove_clip_ids'])
      && Array.isArray(args.remove_clip_ids)
      && args.remove_clip_ids.every(isScopedGroupClipId)
      && new Set(args.remove_clip_ids).size === args.remove_clip_ids.length;
  }
  if (command.op !== 'shot-group.set' || typeof args.intent !== 'string') return false;

  if (args.intent === 'pin') {
    const keys = args.name === undefined ? ['group', 'intent', 'members'] : ['group', 'intent', 'members', 'name'];
    return hasExactKeys(args, keys)
      && Array.isArray(args.members) && args.members.length > 0
      && args.members.every(isScopedGroupClipId)
      && new Set(args.members).size === args.members.length
      && (args.name === undefined || (typeof args.name === 'string' && args.name.length > 0));
  }
  if (args.intent === 'images') return hasExactKeys(args, ['group', 'intent']);
  if (args.intent === 'video' || args.intent === 'replace-video') {
    const video = args.intent === 'video';
    const expectedKeys = video ? ['group', 'intent', 'media', 'identities'] : ['group', 'intent', 'media'];
    const media = args.media;
    if (!hasExactKeys(args, expectedKeys) || !isRecord(media)
      || !hasExactKeys(media, selectedMediaFields)
      || selectedMediaFields.some((field) => typeof media[field] !== 'string' || media[field].length === 0)) return false;
    if (!video) return true;
    return isRecord(args.identities)
      && hasExactKeys(args.identities, ['clip_id'])
      && typeof args.identities.clip_id === 'string'
      && args.identities.clip_id.length > 0
      && !args.identities.clip_id.includes('/');
  }
  return false;
}

export function occurrenceIdentityFor(data: Pick<TimelineData, 'config'>, id: string): CanonicalClipIdentity | undefined {
  const clips = data.config.clips.filter((clip) => clip.id === id);
  if (clips.length !== 1) return undefined;
  const identity = clips[0].app?.canonical as CanonicalClipIdentity | undefined;
  if (!identity || ![identity.projectId, identity.parentDocumentId, identity.headRevisionId,
    identity.occurrenceId, identity.shotId, identity.revisionId, identity.internalTimelineRevisionId,
    identity.sourceClipId, identity.outputIdentity].every((value) => typeof value === 'string' && value.length > 0)
    || identity.occurrenceId.includes('/') || identity.sourceClipId!.includes('/')
    || identity.sourceClip?.id !== identity.sourceClipId) return undefined;
  return identity;
}
function contextFor(identity: CanonicalClipIdentity): TimelineOccurrenceContext {
  return { projectId: identity.projectId, parentDocumentId: identity.parentDocumentId,
    headRevisionId: identity.headRevisionId!, occurrenceId: identity.occurrenceId,
    shotId: identity.shotId, shotRevisionId: identity.revisionId,
    internalRevisionId: identity.internalTimelineRevisionId };
}
export function attachGestureCommands(data: TimelineData, commands: readonly EditCommand[], source: TimelineData = data): void {
  authoredCommands.delete(data);
  authoredOccurrences.delete(data);
  let context: TimelineOccurrenceContext | undefined;
  let parent = false;
  const aggregateBatch = commands.length > 0 && commands.every((command) =>
    isShotGroupAggregateCommand(command) || isAssetRegistrationCommand(command) || isAssetRegistrationInverse(command) || isOverlapTrimInverse(command) || isTiedHoldExpansionInverse(command) || isTranscriptCaptionInverse(command));
  const captionTarget = isTranscriptCaptionBatch(commands) ? transcriptBindTarget(commands[0]) : undefined;
  // Routing reads the handler's explicit args.target. The submitted registered
  // timeline-level bind retains select:null; this local view only captures custody.
  const captionSelector = captionTarget && `${captionTarget.occurrence_id === null ? 'parent' : `occurrence:${captionTarget.occurrence_id}`}/clip:${captionTarget.clip_id}`;
  const scopedCommands = captionSelector ? [{ ...commands[0]!, select: captionSelector, resolved: [captionSelector] }] : commands;
  for (const command of scopedCommands) {
    if (typeof command.select !== 'string') {
      if (command.select !== null || (!aggregateBatch && source.config.clips.some((clip) => clip.app?.canonical))) return;
      parent = true;
      continue;
    }
    if (command.select.startsWith('occurrence:')) {
      const relationChoices = command.args.relation_choices;
      const endChoice = command.op === 'clip.set-duration' && Array.isArray(command.args.relation_choices)
        && command.args.relation_choices.length === 1
        && command.args.relation_choices[0]?.target === command.select
        && command.args.relation_choices[0]?.edge === 'end'
        && ['detach', 'adjust-offset', 're-anchor'].includes(command.args.relation_choices[0]?.choice);
      const overlapTrim = command.op === 'clip.trim' && Array.isArray(relationChoices)
        && relationChoices.length === 1
        && relationChoices[0]?.edge === 'start'
        && ['keep', 'detach', 'adjust-offset', 're-anchor'].includes(relationChoices[0]?.choice)
        && source.config.clips.filter((clip) => {
          const identity = occurrenceIdentityFor(source, clip.id);
          return identity && `occurrence:${identity.occurrenceId}/clip:${identity.sourceClipId}` === relationChoices[0]?.target
            && command.select!.startsWith(`occurrence:${identity.occurrenceId}/clip:`);
        }).length === 1;
      if ((!occurrenceOps.has(command.op) && !endChoice && !overlapTrim) || command.resolved?.length !== 1
        || command.resolved[0] !== command.select) return;
      const matches = source.config.clips.flatMap((clip) => {
        const identity = occurrenceIdentityFor(source, clip.id);
        return identity && `occurrence:${identity.occurrenceId}/clip:${identity.sourceClipId}` === command.select ? [identity] : [];
      });
      if (matches.length !== 1) return;
      const next = contextFor(matches[0]);
      if (context && JSON.stringify(context) !== JSON.stringify(next)) return;
      context = next;
    } else {
      if (source.config.clips.some((clip) => clip.app?.canonical && command.select === `parent/clip:${clip.id}`)) return;
      parent = true;
    }
  }
  if (context && parent) return;
  if (context) authoredOccurrences.set(data, structuredClone(context));
  authoredCommands.set(data, structuredClone(commands));
}
export function gestureCommandsFor(data: TimelineData): readonly EditCommand[] | undefined {
  return authoredCommands.get(data);
}
export function gestureOccurrenceFor(data: TimelineData): TimelineOccurrenceContext | undefined {
  return authoredOccurrences.get(data);
}

function gestureTarget(data: Pick<TimelineData, 'config'>, id: string): string | undefined {
  const clips = data.config.clips.filter((clip) => clip.id === id);
  if (clips.length !== 1) return undefined;
  if (!clips[0].app?.canonical) return id.startsWith('occurrence:') ? undefined : id;
  const identity = occurrenceIdentityFor(data, id);
  return identity ? `occurrence:${identity.occurrenceId}/clip:${identity.sourceClipId}` : undefined;
}
function gestureSource(data: Pick<TimelineData, 'config'>, id: string) {
  return (occurrenceIdentityFor(data, id)?.sourceClip ?? originalClip(data, id)) as ReturnType<typeof originalClip>;
}

export function scopedGestureClipId(id: string): string {
  if (/^(?:parent|shot:[^/]+|occurrence:[^/]+)\/clip:[^/]+$/.test(id)) return id;
  if (!id || id.includes('/')) throw new Error('Gesture clip requires an exact scoped identity.');
  // Main-editor clips come from canonical parent.clips. Do not guess an occurrence.
  return `parent/clip:${id}`;
}
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
function state(value: unknown, present: boolean): NonNullable<EditCommand['expect']>[string] {
  return present && value !== undefined ? { state: 'present', value: structuredClone(value) } : { state: 'absent' };
}
function command(id: string, op: string, args: EditCommand['args'], expect: EditCommand['expect']): EditCommand {
  const select = scopedGestureClipId(id);
  return { op, select, resolved: [select], args, expect };
}
function originalClip(data: Pick<TimelineData, 'config'>, id: string) {
  const clip = data.config.clips.find((candidate) => candidate.id === id);
  if (!clip) throw new Error(`Gesture clip '${id}' is not in its captured base.`);
  return clip;
}

export type FadeGestureArgs = {
  fade_in?: number | null;
  fade_out?: number | null;
  clear?: Array<'fade_in' | 'fade_out'>;
};

export type CompositeGestureResult = {
  handled: boolean;
  commands?: EditCommand[];
  localPatch?: ClipEditorPatch;
};

function validFadeArgs(args: FadeGestureArgs): boolean {
  const keys = Object.keys(args);
  if (!keys.length || keys.some((key) => !['fade_in', 'fade_out', 'clear'].includes(key))) return false;
  for (const key of ['fade_in', 'fade_out'] as const) {
    if (!hasOwn(args, key)) continue;
    const value = args[key];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return false;
  }
  if (hasOwn(args, 'clear')) {
    const clear = args.clear;
    if (!Array.isArray(clear) || clear.length === 0
      || clear.some((field) => field !== 'fade_in' && field !== 'fade_out')
      || new Set(clear).size !== clear.length
      || clear.some((field) => hasOwn(args, field))) return false;
  }
  return true;
}

/** Build only the producer's coupled fade command; callers keep this boundary
 * narrower than generic effect/proposal writers. */
export function fadeGestureCommand(
  data: Pick<TimelineData, 'config'>,
  id: string,
  args: FadeGestureArgs,
): EditCommand | undefined {
  if (!validFadeArgs(args)) return undefined;
  const target = gestureTarget(data, id);
  if (!target) return undefined;
  const clip = gestureSource(data, id);
  if (Array.isArray(clip.effects)) return undefined;
  return command(target, 'clip.set-fade', structuredClone(args), {
    entrance: state(clip.entrance, hasOwn(clip, 'entrance')),
    effects: state(clip.effects, hasOwn(clip, 'effects')),
    exit: state(clip.exit, hasOwn(clip, 'exit')),
  });
}

function exactElementDescriptor(
  reference: unknown,
  host: AstridElementHost | null | undefined,
) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference) || !host) return undefined;
  const ref = reference as Record<string, unknown>;
  if (typeof ref.id !== 'string' || !ref.id || typeof ref.revision !== 'string' || !ref.revision
    || (ref.kind !== undefined && ref.kind !== 'transition' && ref.kind !== 'transitions')) return undefined;
  const matches = host.descriptors.filter((descriptor) => descriptor.kind === 'transition'
    && descriptor.id === ref.id && descriptor.revision === ref.revision
    && (ref.packId === undefined || descriptor.packId === ref.packId)
    && Boolean(descriptor.componentPath)
    && Boolean(host.resolveComponent(descriptor.id, 'transition', descriptor.packId)));
  return matches.length === 1 ? matches[0] : undefined;
}

function sameRecord(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function capturedTransitionIsBound(
  clip: ReturnType<typeof originalClip>,
  host: AstridElementHost | null | undefined,
) {
  const transition = clip.transition as (Record<string, unknown> | null | undefined);
  const reference = clip.elementRef as (Record<string, unknown> | null | undefined);
  if (!transition || typeof transition !== 'object' || !reference || typeof reference !== 'object'
    || transition.type !== reference.id || transition.revision !== reference.revision) return undefined;
  return exactElementDescriptor(reference, host);
}

function scopedPrefix(target: string): string {
  return target.slice(0, target.lastIndexOf('/clip:'));
}

function exactAdjacentPredecessor(
  data: Pick<TimelineData, 'config' | 'tracks'>,
  id: string,
  duration: number,
) {
  const rawDestinationTarget = gestureTarget(data, id);
  const destinationTarget = rawDestinationTarget ? scopedGestureClipId(rawDestinationTarget) : undefined;
  const destination = gestureSource(data, id);
  if (!destinationTarget || !Number.isFinite(destination.at) || typeof destination.track !== 'string') return undefined;
  const tracks = data.tracks.filter((track) => track.id === destination.track);
  if (tracks.length !== 1 || tracks[0].kind !== 'visual') return undefined;
  const destinationDuration = getClipTimelineDuration(destination);
  if (!(destinationDuration > 0) || duration > destinationDuration) return undefined;

  const scopedClips = data.config.clips.flatMap((clip) => {
    const rawTarget = gestureTarget(data, clip.id);
    if (!rawTarget) return [];
    const target = scopedGestureClipId(rawTarget);
    if (scopedPrefix(target) !== scopedPrefix(destinationTarget)) return [];
    const source = gestureSource(data, clip.id);
    return source.track === destination.track ? [{ clip, source, target }] : [];
  });
  const predecessors = scopedClips.filter(({ source }) => {
    if (source.id === destination.id || !Number.isFinite(source.at)) return false;
    const sourceDuration = getClipTimelineDuration(source);
    return sourceDuration > 0 && Math.abs(source.at + sourceDuration - destination.at) <= 1e-7;
  });
  if (predecessors.length !== 1) return undefined;
  const predecessor = predecessors[0];
  const predecessorDuration = getClipTimelineDuration(predecessor.source);
  if (duration > predecessorDuration) return undefined;

  // The predecessor must be the only clip covering the interval immediately
  // before the destination. An overlap or a second exact candidate is ambiguous.
  const overlapping = scopedClips.filter(({ source }) => {
    if (source.id === predecessor.source.id || source.id === destination.id) return false;
    const end = source.at + getClipTimelineDuration(source);
    return source.at < destination.at && end > predecessor.source.at;
  });
  if (overlapping.length) return undefined;
  return predecessor;
}

function transitionExpectation(
  data: Pick<TimelineData, 'config' | 'tracks'>,
  target: string,
  clip: ReturnType<typeof originalClip>,
  predecessor?: { target: string; source: ReturnType<typeof originalClip> },
): NonNullable<EditCommand['expect']> {
  const expected: Record<string, NonNullable<EditCommand['expect']>[string]> = {};
  for (const field of ['track', 'at', 'hold', 'from', 'to', 'speed', 'clipType'] as const) {
    expected[field] = state(clip[field], hasOwn(clip, field));
  }
  const astrid = clip.app?.astrid as Record<string, unknown> | undefined;
  for (const field of ['on', 'until', 'for'] as const) {
    expected[`app.astrid.${field}`] = state(astrid?.[field], Boolean(astrid && hasOwn(astrid, field)));
  }
  expected.transition = state(clip.transition, hasOwn(clip, 'transition'));
  expected.elementRef = state(clip.elementRef, hasOwn(clip, 'elementRef'));
  const trackPrefix = scopedPrefix(scopedGestureClipId(target));
  const track = data.tracks.find((candidate) => candidate.id === clip.track);
  if (track) expected[`${trackPrefix}/track:${clip.track}::kind`] = state(track.kind, true);
  if (predecessor) {
    for (const field of ['track', 'at', 'hold', 'from', 'to', 'speed', 'clipType'] as const) {
      expected[`${predecessor.target}::${field}`] = state(
        predecessor.source[field], hasOwn(predecessor.source, field),
      );
    }
    const predecessorAstrid = predecessor.source.app?.astrid as Record<string, unknown> | undefined;
    for (const field of ['on', 'until', 'for'] as const) {
      expected[`${predecessor.target}::app.astrid.${field}`] = state(
        predecessorAstrid?.[field], Boolean(predecessorAstrid && hasOwn(predecessorAstrid, field)),
      );
    }
  }
  return expected;
}

/** Catalog actions name the pair explicitly, including updates of an existing
 * binding. Keep those read dependencies even when the reference is unchanged. */
export function catalogTransitionGestureCommands(
  data: Pick<TimelineData, 'config' | 'tracks'>,
  fromId: string,
  toId: string,
  patch: ClipEditorPatch,
  elementHost: AstridElementHost,
): EditCommand[] | undefined {
  if ([fromId, toId].some((id) => !id || id.includes('/')) || fromId === toId) return undefined;
  const pair = [fromId, toId].map((id) => data.config.clips.filter((clip) => clip.id === id));
  // This catalog route saves the parent document. Occurrence mutations require
  // the occurrence commit context and must never masquerade as parent edits.
  if (pair.some((clips) => clips.length !== 1 || clips[0].app?.canonical)) return undefined;
  const destination = pair[1][0];
  const predecessor = exactAdjacentPredecessor(data, toId,
    patch.transition && typeof patch.transition === 'object' ? patch.transition.duration : 0);
  if (!predecessor || predecessor.clip.id !== fromId) return undefined;
  const successors = data.config.clips.filter((clip) => clip.track === destination.track
    && clip.id !== fromId && Math.abs(clip.at - destination.at) <= 1e-7);
  if (successors.length !== 1) return undefined;
  const result = compositeEffectGestureCommands(data, toId, patch, { elementHost });
  if (result.commands?.length !== 1) return undefined;
  const value = result.commands[0];
  return [{ ...value,
    args: { ...value.args, ...(patch.transition ? { from_clip: predecessor.target } : {}) },
    expect: transitionExpectation(data, toId, destination, predecessor),
  }];
}

/** Convert only the mounted clip-inspector fade and transition edits. Generic
 * patch/proposal writers continue using propertyGestureCommands unchanged. */
export function compositeEffectGestureCommands(
  data: Pick<TimelineData, 'config' | 'tracks'>,
  id: string,
  patch: ClipEditorPatch,
  options: { elementHost?: AstridElementHost | null } = {},
): CompositeGestureResult {
  const entries = Object.entries(patch);
  const hasTransition = entries.some(([key]) => key === 'transition' || key === 'elementRef');
  if (hasTransition) {
    if (!hasOwn(patch, 'transition') || entries.some(([key]) => !['transition', 'elementRef'].includes(key))) {
      return { handled: true };
    }
    const target = gestureTarget(data, id);
    if (!target) return { handled: true };
    const clip = gestureSource(data, id);
    const currentBinding = capturedTransitionIsBound(clip, options.elementHost);
    const currentTransition = clip.transition as Record<string, unknown> | null | undefined;
    const currentReference = clip.elementRef as Record<string, unknown> | null | undefined;
    const expected = transitionExpectation(data, target, clip);
    if (patch.transition === undefined || patch.transition === null) {
      if (!currentBinding || !currentTransition || !currentReference) return { handled: true };
      const args = patch.transition === null ? { transition: null } : { clear: true };
      return { handled: true, commands: [command(target, 'clip.set-transition', args, expected)],
        localPatch: patch.transition === null
          ? { transition: null, elementRef: null }
          : { transition: undefined, elementRef: undefined } };
    }
    if (!patch.transition || typeof patch.transition !== 'object' || Array.isArray(patch.transition)) {
      return { handled: true };
    }
    const transition = structuredClone(patch.transition) as Record<string, unknown>;
    if (typeof transition.type !== 'string' || !transition.type
      || typeof transition.revision !== 'string' || !transition.revision
      || typeof transition.duration !== 'number' || !Number.isFinite(transition.duration) || transition.duration <= 0
      || (hasOwn(transition, 'params') && transition.params !== undefined && transition.params !== null
        && (typeof transition.params !== 'object' || Array.isArray(transition.params)))) return { handled: true };
    if (transition.params === undefined) delete transition.params;

    const sameCapturedTransition = Boolean(currentBinding && currentTransition && currentReference
      && transition.type === currentTransition.type && transition.revision === currentTransition.revision);
    let reference: unknown;
    let predecessor: ReturnType<typeof exactAdjacentPredecessor>;
    if (sameCapturedTransition) {
      if (hasOwn(patch, 'elementRef') && !sameRecord(patch.elementRef, currentReference)) return { handled: true };
      reference = structuredClone(currentReference);
    } else {
      if (!hasOwn(patch, 'elementRef')) return { handled: true };
      const descriptor = exactElementDescriptor(patch.elementRef, options.elementHost);
      const supplied = patch.elementRef as Record<string, unknown> | null | undefined;
      if (!descriptor || !supplied || transition.type !== descriptor.id || transition.revision !== descriptor.revision
        || supplied.id !== descriptor.id || supplied.revision !== descriptor.revision
        || (supplied.kind !== undefined && supplied.kind !== descriptor.kind && supplied.kind !== 'transitions')
        || (supplied.packId !== undefined && supplied.packId !== descriptor.packId)) return { handled: true };
      reference = structuredClone(supplied);
      predecessor = exactAdjacentPredecessor(data, id, transition.duration);
      if (!predecessor) return { handled: true };
    }
    const args: Record<string, unknown> = {
      transition,
      elementRef: reference,
      ...(predecessor ? { from_clip: predecessor.target } : {}),
    };
    const nextExpected = transitionExpectation(data, target, clip, predecessor
      ? { target: predecessor.target, source: predecessor.source }
      : undefined);
    return { handled: true, commands: [command(target, 'clip.set-transition', args, nextExpected)],
      localPatch: { transition: transition as ClipMeta['transition'], elementRef: reference as ClipMeta['elementRef'] } };
  }

  const fadeKeys = entries.filter(([key]) => key === 'entrance' || key === 'exit');
  if (!fadeKeys.length) return { handled: false };
  if (entries.some(([key]) => key !== 'entrance' && key !== 'exit')) return { handled: true };
  const clip = gestureSource(data, id);
  const args: FadeGestureArgs = {};
  for (const [key, value] of fadeKeys) {
    const entrance = key === 'entrance';
    const arg = entrance ? 'fade_in' : 'fade_out';
    const expectedType = entrance ? 'fade' : 'fade-out';
    const captured = entrance ? clip.entrance : clip.exit;
    const fadeValue = isRecord(value) ? value as Record<string, unknown> : undefined;
    if (value === null) {
      args[arg] = null;
    } else if (value === undefined) {
      if (captured?.type !== expectedType) return { handled: false };
      (args.clear ??= []).push(arg);
    } else if (fadeValue?.type === expectedType) {
      if (typeof fadeValue.duration !== 'number' || !Number.isFinite(fadeValue.duration) || fadeValue.duration < 0) {
        return { handled: true };
      }
      args[arg] = fadeValue.duration;
    } else if (typeof value === 'object' && value !== null && (value as { type?: unknown }).type === expectedType) {
      return { handled: true };
    } else {
      return { handled: false };
    }
  }
  const commandValue = fadeGestureCommand(data, id, args);
  if (!commandValue) return { handled: true };
  const effects = clip.effects;
  const effectValues: Record<string, unknown> = effects && !Array.isArray(effects)
    ? structuredClone(effects)
    : {};
  const localPatch: ClipEditorPatch = {};
  const clearSet = new Set(args.clear ?? []);
  for (const [key, value] of fadeKeys) {
    const entrance = key === 'entrance';
    const field = entrance ? 'fade_in' : 'fade_out';
    if (clearSet.has(field)) {
      delete effectValues[field];
      if (entrance) localPatch.entrance = undefined;
      else localPatch.exit = undefined;
    } else if (value === null) {
      effectValues[field] = null;
      if (entrance) localPatch.entrance = null;
      else localPatch.exit = null;
    } else if (value && typeof value === 'object') {
      const duration = (value as { duration: number }).duration;
      effectValues[field] = duration;
      if (entrance) localPatch.entrance = { type: 'fade', duration };
      else localPatch.exit = { type: 'fade-out', duration };
    }
  }
  if (effects === null && clearSet.size > 0 && clearSet.size === fadeKeys.length) {
    localPatch.effects = null as unknown as ClipMeta['effects'];
  } else if (!hasOwn(clip, 'effects') && clearSet.size === fadeKeys.length) {
    localPatch.effects = undefined;
  } else {
    localPatch.effects = effectValues as ClipMeta['effects'];
  }
  return { handled: true, commands: [commandValue], localPatch };
}

// These are the admitted clip_fields.yaml names and their persisted App paths.
// Other App properties retain the temporary unconverted-writer route.
const lookFields: Record<string, string> = {
  opacity: 'opacity', volume: 'volume', speed: 'speed',
  cropTop: 'crop_top', cropBottom: 'crop_bottom', cropLeft: 'crop_left', cropRight: 'crop_right',
  entrance: 'entrance', exit: 'exit', transition: 'transition',
};
export function propertyGestureCommands(data: Pick<TimelineData, 'config'>, id: string, patch: Partial<ClipMeta>, options?: { mergeParams: boolean }): EditCommand[] | undefined {
  const entries = Object.entries(patch);
  if (entries.some(([key, value]) => key !== 'params' && (!lookFields[key] || value === null || (key === 'transition' && value !== undefined)))) return undefined;
  const target = gestureTarget(data, id);
  if (!target) return undefined;
  const clip = gestureSource(data, id);
  if (typeof clip.hold === 'number' && 'speed' in patch) return undefined;
  const result: EditCommand[] = [];
  for (const [key, value] of entries) {
    if (key === 'params') {
      // A params object is a value map. {op:'clear'} and {$absent:true} are values.
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      // Nested keys require the typed path producer; a literal dotted key must
      // never be mistaken for a nested path. Omitted keys in a replacement map
      // likewise do not express an explicit clear.
      if (Object.keys(value).some((key) => /[.[\]]/.test(key))
        || (!options?.mergeParams && Object.keys(clip.params ?? {}).some((key) => !hasOwn(value, key)))) return undefined;
      for (const [param, next] of Object.entries(value)) {
        const before = clip.params ?? {};
        result.push(command(target, next === undefined ? 'clip.clear' : 'clip.set-param',
          next === undefined ? { keys: [param] } : { path: param, value: next },
          { [`params.${param}`]: state(before[param], hasOwn(before, param)) }));
      }
    } else {
      result.push(command(target, value === undefined ? 'clip.clear' : 'clip.set-look',
        value === undefined ? { keys: [lookFields[key]] } : { [lookFields[key]]: value },
        { [key]: state(clip[key as keyof typeof clip], hasOwn(clip, key)) }));
    }
  }
  return result;
}
export function deleteGestureCommands(data: TimelineData, ids: string[]): EditCommand[] {
  return ids.map((id) => {
    const clip = originalClip(data, id);
    return command(id, 'clip.remove', {}, { '': state(clip, true) });
  });
}

/** The existing runner allocates this exact child via OpCall.created. */
export function detachAudioGestureCommands(data: TimelineData, id: string, childId: string, track: string, newTrack?: TrackDefinition): EditCommand[] | undefined {
  const sources = data.config.clips.filter((clip) => clip.id === id);
  const clip = sources[0];
  if (sources.length !== 1 || !id || id.includes('/') || clip.clipType !== 'media'
    || !childId || childId.includes('/') || data.config.clips.some((clip) => clip.id === childId)
    || !track || track.includes('/')) return undefined;
  const additions = newTrack ? addTrackGestureCommands(data, newTrack) : [];
  if (!additions || (newTrack ? newTrack.id !== track || newTrack.kind !== 'audio'
    : data.config.tracks?.filter((candidate) => candidate.id === track).length !== 1
      || !data.config.tracks.some((candidate) => candidate.id === track && candidate.kind === 'audio'))) return undefined;
  const source = scopedGestureClipId(id);
  const created = `${source.slice(0, source.lastIndexOf('/'))}/clip:${childId}`;
  return [...additions, { ...command(id, 'clip.detach-audio', { track }, { '': state(clip, true) }), created: [created] }];
}

// Characterized compatibility provider behavior stays on its original save path.
/** Only a hold's authored end relation has the admitted duration/until choices.
 * Moment parsing and resolving remain with Astrid. Its TimeRef grammar accepts
 * successive offsets, so appending frames preserves the exact original anchor.
 */
export function legacyTiedEndResizeGesture(data: TimelineData, id: string, duration: number): {
  commands: EditCommand[]; astrid: Record<string, unknown>;
} | null | undefined {
  const clip = originalClip(data, id);
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  if (typeof clip.hold !== 'number' || typeof intent?.until !== 'string' || !intent.until) return undefined;
  const action = data.rows.flatMap((row) => row.actions).find((candidate) => candidate.id === id);
  if (!action) return undefined;
  if (Math.abs(duration - (action.end - action.start)) < 1e-7) return null;
  const choice = window.prompt(`The end of ${id} is tied to ${intent.until}. Choose keep to leave it unchanged, detach for a fixed duration, adjust-offset to keep the anchor, or re-anchor to choose another end anchor. Cancel leaves the clip unchanged.`, 'keep');
  if (choice === null || choice === 'keep') return null;
  const expect = {
    at: state(clip.at, hasOwn(clip, 'at')),
    hold: state(clip.hold, true),
    'app.astrid.on': state(intent.on, hasOwn(intent, 'on')),
    'app.astrid.until': state(intent.until, true),
    'app.astrid.for': state(intent.for, hasOwn(intent, 'for')),
  };
  if (choice === 'detach') {
    const { until: _until, ...astrid } = intent;
    return { commands: [command(id, 'clip.set-duration', { seconds: duration }, expect)], astrid: { ...astrid, for: duration } };
  }
  let moment: string;
  if (choice === 'adjust-offset') {
    const frames = Math.round((duration - (action.end - action.start)) * data.output.fps);
    moment = `${intent.until} ${frames < 0 ? '' : '+'}${frames}f`;
  } else if (choice === 're-anchor') {
    const answer = window.prompt('New end anchor (for example "hello", beat 4, or end of c2)', intent.until);
    if (!answer?.trim()) return null;
    moment = answer.trim();
  } else return null;
  const { for: _for, ...astrid } = intent;
  return { commands: [command(id, 'clip.until', { moment }, expect)], astrid: { ...astrid, until: moment } };
}

/** One ordinary audio right trim, clamped by one adjacent sibling whose sole
 * authored timing relation is a start anchored to this clip's end. This is a UI
 * eligibility check, not an affected-set/rebase planner: Astrid records and
 * guards the complete dependency set. No projected rows are persisted here.
 */
export function overlapTrimGesture(data: TimelineData, id: string, rowId: string,
  requestedStart: number, requestedEnd: number, end: number): { commands: EditCommand[] } | null | undefined {
  const row = data.rows.find((candidate) => candidate.id === rowId);
  const actions = row?.actions.filter((action) => action.id === id) ?? [];
  if (actions.length !== 1 || data.tracks.find((track) => track.id === rowId)?.kind !== 'audio') return undefined;
  const action = actions[0];
  const overlaps = row!.actions.filter((other) => other.id !== id && requestedStart < other.end && requestedEnd > other.start);
  if (overlaps.length !== 1 || requestedStart !== action.start || end !== overlaps[0].start
    || end <= action.start || end === action.end || end >= requestedEnd) return undefined;
  const neighbour = overlaps[0];
  const target = gestureTarget(data, id);
  const adjacentTarget = gestureTarget(data, neighbour.id);
  // Ambiguous/stale identities must never turn this candidate into a row write.
  if (!target || !adjacentTarget || [id, neighbour.id].some((clipId) =>
    data.rows.flatMap((candidate) => candidate.actions).filter((candidate) => candidate.id === clipId).length !== 1)
    || ![target, adjacentTarget].every((value) => /^(?:parent|occurrence:[^/\s]+)\/clip:[^/\s]+$/.test(value)
      || /^[^/\s]+$/.test(value))) return null;
  const select = scopedGestureClipId(target);
  const adjacentSelect = scopedGestureClipId(adjacentTarget);
  if (![select, adjacentSelect].every((value) => /^(?:parent|occurrence:[^/\s]+)\/clip:[^/\s]+$/.test(value))) return null;
  if (select.split('/')[0] !== adjacentSelect.split('/')[0]) return undefined;
  for (const clipId of [id, neighbour.id]) {
    const identity = occurrenceIdentityFor(data, clipId);
    if (identity && (identity.headRevisionId !== data.head?.headRevisionId
      || identity.projectId !== data.head?.projectId || identity.parentDocumentId !== data.head?.timelineId
      || JSON.stringify(contextFor(identity)) !== JSON.stringify(contextFor(occurrenceIdentityFor(data, id)!)))) return null;
  }
  const source = gestureSource(data, id);
  const adjacent = gestureSource(data, neighbour.id);
  const intent = adjacent.app?.astrid as Record<string, unknown> | undefined;
  // Admit only this exact authored clip-end grammar; do not interpret offsets.
  const relation = intent?.on;
  const anchor = `clip-end "${select}"`;
  if (typeof relation !== 'string' || !relation.startsWith(anchor)
    || !/^(?:\s+[+-](?:\d+(?:\.\d+)?s|\d+f))*$/.test(relation.slice(anchor.length))) return undefined;
  const blocked = ['on', 'until', 'for', 'cut', 'sequence', 'sequence_fit', 'segment', 'formulas', 'loop', 'orphan'];
  if (data.config.pinnedShotGroups?.some((group) => group.clipIds.some((member) => member === id || member === neighbour.id))
    || (data.config.app?.astrid as Record<string, unknown> | undefined)?.music_beds != null
    || data.config.clips.some((clip) => {
      const authored = gestureSource(data, clip.id);
      const timing = authored.app?.astrid as Record<string, unknown> | undefined;
      return blocked.some((key) => (key !== 'on' || clip.id !== neighbour.id)
        && (hasOwn(timing ?? {}, key) || hasOwn(authored.app ?? {}, key)));
    })) return undefined;
  const from = source.from ?? 0;
  const speed = source.speed ?? 1;
  const to = source.to;
  const out = from + (end - action.start) * speed;
  const limit = source.asset ? data.resolvedConfig.registry[source.asset]?.duration ?? data.registry.assets[source.asset]?.duration : undefined;
  if (source.clipType !== 'media' || ![from, to, speed, out, limit].every((value) => typeof value === 'number' && Number.isFinite(value))
    || from < 0 || speed <= 0 || out <= from || out > limit!
    || Math.abs((to! - from) / speed - (action.end - action.start)) > 1e-7) return undefined;
  const choice = window.prompt(`The start of ${neighbour.id} is tied to ${relation}. This trim changes its anchor. Choose keep to preserve the relation (the edit may be refused), detach to freeze its start, adjust-offset, or re-anchor. Cancel leaves everything unchanged.`, 'keep');
  if (!choice || !['keep', 'detach', 'adjust-offset', 're-anchor'].includes(choice)) return null;
  const selected: Record<string, unknown> = { target: adjacentSelect, edge: 'start', choice };
  if (choice === 're-anchor') {
    const answer = window.prompt('New start anchor without an offset (for example clip-end "parent/clip:other")');
    if (!answer?.trim()) return null;
    selected.anchor = answer.trim();
  }
  if (choice === 'adjust-offset' || choice === 're-anchor') {
    const seconds = window.prompt('New absolute anchor offset in seconds (kept separately from frames)', '0');
    const frames = window.prompt('New absolute anchor offset in whole frames (added to seconds)', '0');
    if (seconds === null || !seconds.trim() || !Number.isFinite(Number(seconds))
      || frames === null || !frames.trim() || !Number.isSafeInteger(Number(frames))) return null;
    selected.offset_seconds = Number(seconds);
    selected.offset_frames = Number(frames);
  }
  return { commands: [command(target, 'clip.trim', { out_s: out, relation_choices: [selected] }, { '': state(source, true) })] };
}

/** Existing hold-end choice UI. Astrid alone parses/resolves Moments and discovers
 * dependencies. The App asks for absolute offset components, never parses an
 * authored Moment or guesses an offset from pointer geometry.
 */
export function tiedEndResizeGesture(data: TimelineData, id: string, duration: number): {
  commands: EditCommand[];
} | null | undefined {
  const target = gestureTarget(data, id);
  if (!target) return undefined;
  const select = scopedGestureClipId(target);
  if (!/^(?:parent|occurrence:[^/\s]+)\/clip:[^/\s]+$/.test(select)) return undefined;
  const clip = gestureSource(data, id);
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  const occurrence = occurrenceIdentityFor(data, id);
  const beds = (data.config.app?.astrid as Record<string, unknown> | undefined)?.music_beds;
  if (typeof clip.hold !== 'number' || typeof intent?.until !== 'string' || !intent.until.trim()
    || (clip.speed !== undefined && clip.speed !== 1)
    || ['sequence', 'sequence_fit', 'segment', 'formulas', 'loop', 'orphan'].some((key) => hasOwn(intent, key) || hasOwn(clip.app ?? {}, key))
    || data.config.pinnedShotGroups?.some((group) => group.clipIds.includes(id))
    || (beds != null && (typeof beds !== 'object' || Array.isArray(beds) || hasOwn(beds, select)))
    || (occurrence && (occurrence.headRevisionId !== data.head?.headRevisionId
      || occurrence.projectId !== data.head?.projectId || occurrence.parentDocumentId !== data.head?.timelineId))) return undefined;
  const actions = data.rows.flatMap((row) => row.actions).filter((candidate) => candidate.id === id);
  if (actions.length !== 1 || !Number.isFinite(duration) || duration <= 0
    || Math.abs(clip.hold - (actions[0].end - actions[0].start)) > 1e-7) return undefined;
  if (Math.abs(duration - clip.hold) < 1e-7) return null;
  const choice = window.prompt(`The end of ${id} is tied to ${intent.until}. Choose keep to leave it unchanged, detach for a fixed duration, adjust-offset to keep the anchor, or re-anchor to choose another end anchor. Cancel leaves the clip unchanged.`, 'keep');
  // Keep means abandoning this resize in the existing UI, not asking Astrid to
  // promise contradictory geometry. Cancel never reaches applyEdit or a draft.
  if (!choice || choice === 'keep' || !['detach', 'adjust-offset', 're-anchor'].includes(choice)) return null;
  const relation: Record<string, unknown> = { target: select, edge: 'end', choice };
  if (choice === 're-anchor') {
    const anchor = window.prompt('New end anchor without an offset (for example beat 8 or clip-end "parent/clip:clip-2")');
    if (!anchor?.trim()) return null;
    relation.anchor = anchor.trim();
  }
  if (choice !== 'detach') {
    const seconds = window.prompt('New absolute anchor offset in seconds (kept separately from frames)', '0');
    if (seconds === null || !seconds.trim() || !Number.isFinite(Number(seconds))) return null;
    const frames = window.prompt('New absolute anchor offset in whole frames (added to seconds)', '0');
    if (frames === null || !frames.trim() || !Number.isSafeInteger(Number(frames))) return null;
    relation.offset_seconds = Number(seconds);
    relation.offset_frames = Number(frames);
  }
  const expect = {
    '': state(clip, true),
    at: state(clip.at, hasOwn(clip, 'at')),
    hold: state(clip.hold, true),
    'app.astrid.on': state(intent.on, hasOwn(intent, 'on')),
    'app.astrid.until': state(intent.until, true),
    'app.astrid.for': state(intent.for, hasOwn(intent, 'for')),
    'app.astrid.fixed_start': state(intent.fixed_start, hasOwn(intent, 'fixed_start')),
  };
  return { commands: [command(target, 'clip.set-duration', {
    seconds: duration, relation_choices: [relation],
  }, expect)] };
}
export function moveGestureCommands(data: TimelineData, id: string, start: number, track?: string): EditCommand[] | undefined {
  const target = gestureTarget(data, id);
  if (!target) return undefined;
  const clip = gestureSource(data, id);
  if (occurrenceIdentityFor(data, id) && typeof clip.at !== 'number') return undefined;
  const action = data.rows.flatMap((row) => row.actions).find((candidate) => candidate.id === id);
  if (!action) return undefined;
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  // Moving both tied edges needs the relation-sensitive choice producer.
  if (intent?.until) return undefined;
  const commands: EditCommand[] = [];
  const deltaFrames = Math.round((start - action.start) * data.output.fps);
  if (deltaFrames) commands.push(command(target, 'clip.nudge', { frames: deltaFrames }, {
    at: state(clip.at, hasOwn(clip, 'at')),
    'app.astrid.on': state(intent?.on, Boolean(intent && hasOwn(intent, 'on'))),
    'app.astrid.until': state(intent?.until, Boolean(intent && hasOwn(intent, 'until'))),
  }));
  if (track && track !== clip.track) commands.push(command(target, 'clip.set-track', { track }, {
    track: state(clip.track, true),
  }));
  return commands;
}

/** A declined tied-start drag stays on compatibility; never normalize its anchor
 * through a generic nudge. Presence matters, including null/empty/legacy values.
 */
export function fallbackDragGestureCommands(data: TimelineData, id: string, start: number, track: string): EditCommand[] | undefined {
  const commands = moveGestureCommands(data, id, start, track);
  if (commands?.some((command) => command.op === 'clip.nudge') && data.config.clips.some((clip) => clip.id === id && (
    hasOwn(clip.app ?? {}, 'on') || hasOwn((clip.app?.astrid as object | undefined) ?? {}, 'on')
  ))) return undefined;
  // A track-only command does not touch timing or normalize the authored on.
  return commands;
}

/** Plain, same-track drag only. D's clip.nudge parses then formats a TimeRef;
 * admit only the canonical word / word-relative music subset whose anchor bytes
 * survive that round trip. This is an eligibility check, never an anchor resolver.
 * In particular c2 means a cut in D, not a neighbouring clip.
 */
export function tiedStartDragGesture(data: TimelineData, id: string, start: number, track: string): {
  commands: EditCommand[]; meta: Partial<ClipMeta>;
} | undefined {
  const clips = data.config.clips.filter((clip) => clip.id === id);
  const actions = data.rows.flatMap((row) => row.actions).filter((action) => action.id === id);
  if (clips.length !== 1 || actions.length !== 1 || !id || id.includes('/')
    || clips[0].app?.canonical) return undefined;
  const clip = clips[0];
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  if (!intent || typeof intent.on !== 'string' || track !== clip.track
    || (typeof clip.hold !== 'number' && !(typeof clip.from === 'number' && typeof clip.to === 'number'))
    || (typeof clip.hold === 'number' && (hasOwn(clip, 'from') || hasOwn(clip, 'to')))
    || data.config.pinnedShotGroups?.some((group) => group.clipIds.includes(id))
    || ['until', 'sequence', 'cut', 'segment', 'formulas', 'loop', 'orphan'].some((key) => hasOwn(intent, key) || hasOwn(clip.app ?? {}, key))
    || ['keyframes', 'modifiers', 'keyframeOrigin'].some((key) => hasOwn(clip, key) || hasOwn(clip.params ?? {}, key))) return undefined;
  // Canonical format_moment: optional beat/downbeat prefix, quoted word,
  // optional exact line/occurrence, and one nonzero signed integer frame offset.
  const match = /^(?<anchor>(?:(?:beat|downbeat) [1-9]\d* (?:after|before) )?(?:after )?"(?<word>[^"\n]+)"(?: in [A-Za-z0-9_-]+)?(?: #[1-9]\d*)?)(?: (?<offset>[+-][1-9]\d*)f)?$/.exec(intent.on);
  if (!match?.groups?.word.trim()) return undefined;
  const fps = data.output.fps;
  const delta = (start - actions[0].start) * fps;
  const frames = Math.round(delta);
  const previousOffset = Number(match.groups.offset ?? 0);
  const offset = previousOffset + frames;
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isSafeInteger(previousOffset) || !Number.isSafeInteger(frames) || !Number.isSafeInteger(offset)
    || !frames || Math.abs(delta - frames) > 1e-6
    || Math.abs(start * fps - Math.round(start * fps)) > 1e-6) return undefined;
  const on = `${match.groups.anchor}${offset ? ` ${offset > 0 ? '+' : ''}${offset}f` : ''}`;
  const commands = moveGestureCommands(data, id, start, track)!;
  // Retrying/rebasing cannot silently acquire sequence/animation/other ownership.
  commands[0].expect![''] = state(clip, true);
  return { commands,
    meta: { app: { ...clip.app, astrid: { ...intent, on } } } };
}

/** Right-edge resizing with unchanged source edges, no tied end, no overlap side effects. */
export function rightResizeGestureCommands(data: TimelineData, id: string, duration: number, patch: Partial<ClipMeta>): EditCommand[] | undefined {
  const clip = originalClip(data, id);
  const intent = clip.app?.astrid as Record<string, unknown> | undefined;
  if (intent?.until || intent?.for !== undefined) return undefined;
  if (typeof clip.hold === 'number') return [command(id, 'clip.set-duration', { seconds: duration }, {
    hold: state(clip.hold, true),
    'app.astrid.until': state(intent?.until, false),
    'app.astrid.for': state(intent?.for, false),
  })];
  if (typeof patch.speed !== 'number' || patch.from !== clip.from || patch.to !== clip.to) return undefined;
  const result = propertyGestureCommands(data, id, { speed: patch.speed });
  if (result) Object.assign(result[0].expect!, {
    from: state(clip.from, hasOwn(clip, 'from')),
    to: state(clip.to, hasOwn(clip, 'to')),
  });
  return result;
}

/** Map explicit planner moves; row comparison only refuses unsupported side effects. */
export function plannedMoveGestureCommands(
  data: TimelineData,
  moves: readonly { clipId: string; targetRowId: string }[],
  rows: TimelineData['rows'],
): EditCommand[] | undefined {
  const moved = new Set(moves.map((move) => move.clipId));
  const oldActions = new Map(data.rows.flatMap((row) => row.actions).map((action) => [action.id, action]));
  if (rows.some((row) => row.actions.some((action) => {
    const old = oldActions.get(action.id);
    return !moved.has(action.id) && old && (old.start !== action.start || old.end !== action.end);
  }))) return undefined;
  const groups = moves.map((move) => {
    const old = oldActions.get(move.clipId);
    const row = rows.find((candidate) => candidate.actions.some((action) => action.id === move.clipId));
    const actual = row?.actions.find((action) => action.id === move.clipId);
    if (!old || !actual || row?.id !== move.targetRowId
      || Math.abs((actual.end - actual.start) - (old.end - old.start)) > 1e-7) return undefined;
    return moveGestureCommands(data, move.clipId, actual.start, move.targetRowId);
  });
  return groups.every((commands) => commands !== undefined) ? groups.flat() : undefined;
}

/** Parent-only until the editor transports real recorded occurrence identities.
 * Match D gesture_producers._literal_source conservatively; no intent is detached.
 */
export function literalStructuralSource(data: TimelineData, id: string): boolean {
  if (!id || id.includes('/') || data.config.clips.filter((clip) => clip.id === id).length !== 1) return false;
  const clip = originalClip(data, id);
  const intent = { ...clip.app, ...(clip.app?.astrid as Record<string, unknown> | undefined) } as Record<string, unknown>;
  if (['on', 'until', 'for', 'cut', 'sequence', 'segment', 'formulas', 'loop', 'orphan'].some((key) => intent[key] !== undefined)
    || ['keyframes', 'modifiers', 'keyframeOrigin'].some((key) => hasOwn(clip, key))
    || (clip.hold != null && (hasOwn(clip, 'from') || hasOwn(clip, 'to')))) return false;
  const beds = (data.config.app?.astrid as Record<string, unknown> | undefined)?.music_beds;
  if (beds != null && (typeof beds !== 'object' || Array.isArray(beds) || hasOwn(beds, scopedGestureClipId(id)))) return false;
  return typeof clip.at === 'number' && Number.isFinite(clip.at);
}

/** Stable allocation, captured once with the command and reused on retry. */
export function structuralChildId(data: TimelineData, id: string): string {
  const used = new Set(data.config.clips.map((clip) => clip.id));
  let index = 1;
  while (used.has(`${id}-${String(index).padStart(2, '0')}`)) index++;
  return `${id}-${String(index).padStart(2, '0')}`;
}

export function splitGestureCommands(data: TimelineData, id: string, at: number, childId: string): EditCommand[] | undefined {
  if (!literalStructuralSource(data, id) || !Number.isFinite(at)
    || Math.abs(at * data.output.fps - Math.round(at * data.output.fps)) > 1e-6) return undefined;
  const source = scopedGestureClipId(id);
  return [{ op: 'timeline.split', select: source, args: { at },
    created: [`parent/clip:${childId}`], expect: { [`${source}::`]: state(originalClip(data, id), true) } }];
}

export function duplicateGestureCommands(data: TimelineData, id: string, at: number, childId: string): EditCommand[] | undefined {
  if (!literalStructuralSource(data, id) || !Number.isFinite(at) || at < 0
    || Math.abs(at * data.output.fps - Math.round(at * data.output.fps)) > 1e-6) return undefined;
  const source = scopedGestureClipId(id);
  return [{ op: 'timeline.add', select: null, args: { from: source, at },
    created: [`parent/clip:${childId}`], expect: { [`${source}::`]: state(originalClip(data, id), true) } }];
}

export function emptyTrackGestureCommands(data: TimelineData, ids: readonly string[]): EditCommand[] | undefined {
  const beds = (data.config.app?.astrid as Record<string, unknown> | undefined)?.music_beds;
  if (beds != null && (typeof beds !== 'object' || Array.isArray(beds))) return undefined;
  const result: EditCommand[] = [];
  for (const id of ids) {
    const tracks = data.config.tracks?.filter((track) => track.id === id) ?? [];
    if (!id || id.includes('/') || tracks.length !== 1 || data.config.clips.some((clip) => clip.track === id)
      || Object.values(beds ?? {}).some((entry) => !entry || typeof entry !== 'object'
        || (entry as { source?: { track?: string } }).source?.track === id)) return undefined;
    result.push({ op: 'timeline.remove', select: `parent/track:${id}`, args: {}, expect: { '': state(tracks[0], true) } });
  }
  return result;
}


/** Declaration-driven modifier edits use the same scoped OpCall/save path. */
export function componentEditCommand(
  data: TimelineData, clipId: string,
  component: import('../runtime/astrid-components.ts').AdmittedComponent,
  instanceId: string, params: Record<string, unknown>, add: boolean,
): EditCommand {
  const target = gestureTarget(data, clipId);
  if (!target || !instanceId.trim()) throw new Error('Component requires an exact clip and stable instance identity');
  component.validateParams(params);
  const source = gestureSource(data, clipId);
  const previous = source.modifiers?.find(row => row.id === instanceId);
  if (add ? Boolean(previous) : (!previous || previous.element !== component.identity)) {
    throw new Error('Component instance collision or identity mismatch');
  }
  const path = `modifiers[${JSON.stringify(instanceId)}]`;
  return command(target, 'clip.set-param', {path, value: {id: instanceId, element: component.identity, params}},
    {[path]: state(previous, Boolean(previous))});
}
