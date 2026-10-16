import type { EditCommand } from '@/integrations/runtime/generated.ts';
import { ApiError } from '@/integrations/runtime/generated.ts';
import type { TimelineOccurrenceContext, TimelineSaveReceipt } from './DataProvider.ts';
import { isTimelineSchemaIncompatibleError, isTimelineVersionConflictError } from './DataProvider.ts';
import type { PreparedShotComposition, ShotCompositionAdapter } from './shotCompositionAdapter.ts';
import { StaleWriteError } from './shotComposition.ts';
import { withDefaultTimelineOutput } from '../lib/defaults.ts';

type JsonObject = Record<string, unknown>;
export type ShotMetadataEdit = {
  values?: { name?: string; settings?: JsonObject | null };
  clear?: ('name' | 'settings')[];
};
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const record = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as JsonObject : {};
const state = (object: JsonObject, key: string): NonNullable<EditCommand['expect']>[string] => own(object, key)
  ? { state: 'present', value: structuredClone(object[key]) } : { state: 'absent' };

/** Canonical metadata is authoritative when present, including present-null. */
export function shotSettingsValue(revision: JsonObject): unknown {
  const metadata = record(revision.metadata);
  return own(metadata, 'settings') ? metadata.settings : revision.settings;
}

/** UI settings are a partial view; retain stored unknown siblings at every object level. */
export function mergeShotSettings(before: unknown, values: JsonObject): JsonObject {
  let next = structuredClone(record(before));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) { delete next[key]; continue; }
    next = { ...next, [key]: value !== null && typeof value === 'object' && !Array.isArray(value)
      ? mergeShotSettings(next[key], value as JsonObject) : structuredClone(value) };
  }
  return next;
}

/** D012 request input, captured from the immutable closure, never from display defaults. */
export function captureShotMetadataEdit(composition: PreparedShotComposition, occurrenceId: string, edit: ShotMetadataEdit) {
  const matches = composition.occurrences.filter((item) => item.occurrenceId === occurrenceId);
  const occurrence = matches.length === 1 ? matches[0] : undefined;
  const internal = record(occurrence?.revision.internal_timeline_revision);
  const source = {
    parent_revision_id: composition.headRevisionId, occurrence_id: occurrenceId,
    shot_id: occurrence?.shotId, shot_revision_id: occurrence?.revisionId,
    internal_revision_id: internal.revision_id,
  };
  if (!occurrence || occurrence.projectId !== composition.projectId || occurrence.parentDocumentId !== composition.parentDocumentId
    || Object.values(source).some((value) => typeof value !== 'string' || !value)
    || occurrenceId.includes('/')) throw new Error('Shot metadata requires one captured occurrence and all five source pins.');
  const values = edit.values ?? {};
  const clear = edit.clear ?? [];
  const fields = [...Object.keys(values), ...clear];
  if (!fields.length || new Set(fields).size !== fields.length || fields.some((key) => !['name', 'settings'].includes(key))
    || (own(values, 'name') && typeof values.name !== 'string')
    || (own(values, 'settings') && values.settings !== null
      && (typeof values.settings !== 'object' || !values.settings || Array.isArray(values.settings)))) {
    throw new Error('Invalid closed shot.set values/clear.');
  }
  const select = `occurrence:${occurrenceId}/shot`;
  const expect: NonNullable<EditCommand['expect']> = {};
  for (const field of fields) {
    const path = field === 'name' ? 'provenance.name' : 'metadata.settings';
    expect[path] = state(record(occurrence.revision[field === 'name' ? 'provenance' : 'metadata']), field);
  }
  const command: EditCommand = { op: 'shot.set', select, resolved: [select], args: {
    source: structuredClone(source),
    ...(edit.values !== undefined ? { values: structuredClone(edit.values) } : {}),
    ...(edit.clear !== undefined ? { clear: [...edit.clear] } : {}),
  }, expect };
  const context: TimelineOccurrenceContext = {
    projectId: composition.projectId, parentDocumentId: composition.parentDocumentId,
    headRevisionId: composition.headRevisionId, occurrenceId,
    shotId: occurrence.shotId, shotRevisionId: occurrence.revisionId,
    internalRevisionId: internal.revision_id as string,
  };
  // The existing save API takes a snapshot as its attempt owner. Commands are
  // explicit: this config is never published or reconciled as a document.
  const config = withDefaultTimelineOutput(structuredClone(record(record(composition.contract.parent_composition).config)));
  return { command, context, config };
}

/** Narrow admission alongside E017; this never admits placement/add or mixed clip batches. */
export function isCapturedShotMetadataCommand(command: EditCommand, context: TimelineOccurrenceContext): boolean {
  if (command.op !== 'shot.set' || command.select !== `occurrence:${context.occurrenceId}/shot`
    || command.resolved?.length !== 1 || command.resolved[0] !== command.select) return false;
  const args = command.args;
  if (!args || Object.keys(args).some((key) => !['source', 'values', 'clear'].includes(key))) return false;
  const source = record(args.source);
  const expected = { parent_revision_id: context.headRevisionId, occurrence_id: context.occurrenceId,
    shot_id: context.shotId, shot_revision_id: context.shotRevisionId, internal_revision_id: context.internalRevisionId };
  if (Object.keys(source).length !== 5 || Object.entries(expected).some(([key, value]) => source[key] !== value)) return false;
  if (args.values !== undefined && (args.values === null || typeof args.values !== 'object' || Array.isArray(args.values))) return false;
  if (args.clear !== undefined && (!Array.isArray(args.clear) || args.clear.some((key) => !['name', 'settings'].includes(String(key))))) return false;
  const values = record(args.values), clear = (args.clear ?? []) as string[];
  const fields = [...Object.keys(values), ...clear];
  return fields.length > 0 && new Set(fields).size === fields.length && fields.every((key) => ['name', 'settings'].includes(key))
    && (!own(values, 'name') || typeof values.name === 'string')
    && (!own(values, 'settings') || values.settings === null || (typeof values.settings === 'object' && !Array.isArray(values.settings)))
    && fields.every((field) => ['absent', 'present'].includes(command.expect?.[field === 'name' ? 'provenance.name' : 'metadata.settings']?.state ?? ''));
}

/** Retains the existing provider's request owner through unknown outcomes and exact-head read retries. */
export function createShotMetadataSaver(adapter: ShotCompositionAdapter) {
  const pending = new Map<string, { captured: ReturnType<typeof captureShotMetadataEdit>; receipt?: TimelineSaveReceipt;
    flight?: Promise<PreparedShotComposition> }>();
  return async (composition: PreparedShotComposition, occurrenceId: string, edit: ShotMetadataEdit): Promise<PreparedShotComposition> => {
    if (!adapter.semanticCommandSaving || !adapter.saveTimelineAtHead) return Promise.reject(new Error('Semantic shot metadata saving is unavailable.'));
    const key = JSON.stringify([composition.projectId, composition.parentDocumentId, occurrenceId, edit]);
    // Different edits retain independent owners and wait in the existing Runtime
    // provider queue. A failed intent retains its owner for an exact retry.
    let attempt = pending.get(key);
    if (!attempt) { attempt = { captured: captureShotMetadataEdit(composition, occurrenceId, edit) }; pending.set(key, attempt); }
    if (attempt.flight) return attempt.flight;
    const capturedAttempt = attempt;
    const { context, config, command } = capturedAttempt.captured;
    capturedAttempt.flight = (async () => {
      try {
        capturedAttempt.receipt ??= await adapter.saveTimelineAtHead!(context.parentDocumentId, config, {
          projectId: context.projectId, timelineId: context.parentDocumentId, headRevisionId: context.headRevisionId,
        }, undefined, undefined, [command], context);
        const acknowledged = await adapter.loadAtHead({ projectId: context.projectId, parentDocumentId: context.parentDocumentId,
          headRevisionId: capturedAttempt.receipt.head.headRevisionId! });
        pending.delete(key);
        return acknowledged;
      } catch (error) {
        if (!capturedAttempt.receipt && (isTimelineSchemaIncompatibleError(error) || isTimelineVersionConflictError(error)
          || error instanceof StaleWriteError || (error instanceof ApiError && error.status >= 400 && error.status < 500
            && error.status !== 408 && error.status !== 429))) pending.delete(key);
        throw error;
      } finally { capturedAttempt.flight = undefined; }
    })();
    return capturedAttempt.flight;
  };
}
