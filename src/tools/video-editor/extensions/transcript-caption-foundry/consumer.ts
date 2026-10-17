import type { EditCommand } from '@/integrations/runtime/generated.ts';
import type { DataLaneRenderItem } from '@/sdk/video/families/dataKind.ts';
import type { ExtensionContext } from '@/sdk/context.ts';
import type { TimelineOps } from '@/sdk/video/timeline/timelineOps.ts';

export const TRANSCRIPT_DOCUMENT_KIND = 'media.transcript/v1' as const;

export interface TranscriptSubject {
  readonly media_object_id: string;
  readonly media_sha256: string;
}

export interface TranscriptSourceKey {
  readonly producer_id: string;
  readonly source_id: string;
  readonly lineage_id: string;
  readonly revision_id: string;
  readonly producer_digest: string;
  readonly parent_revision_id?: string;
}

export interface TranscriptClock {
  readonly kind: 'media';
  readonly unit: 'seconds';
  readonly origin_seconds: 0;
}

export interface TranscriptWord {
  readonly id: string;
  readonly text: string;
  readonly start_s: number;
  readonly end_s: number;
}

export interface TranscriptWordCorrespondence {
  readonly from: { readonly lineage_id: string; readonly word_id: string };
  readonly to: { readonly lineage_id: string; readonly word_id: string };
}

export interface TranscriptBinding {
  readonly schema_version: 1;
  readonly document: {
    readonly id: string;
    readonly version: number;
    readonly content_digest: string;
  };
  readonly snapshot: {
    readonly object_id: string;
    readonly sha256: string;
  };
  readonly subject: TranscriptSubject;
  readonly source: TranscriptSourceKey;
  readonly clock: TranscriptClock;
  readonly occurrence_id: string | null;
  readonly word_ids: readonly string[];
}

export type BindingExpectation =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'present'; value: TranscriptBinding }>;

export interface ExplicitTranscriptSelection {
  /** Set only by the mounted project host after an explicit user choice. */
  readonly explicit: true;
  /** Stable request identity is reused if adoption is retried. */
  readonly request_id: string;
  readonly project_id: string;
  readonly document: {
    readonly id: string;
    readonly version: number;
    readonly content_digest: string;
  };
  readonly snapshot: {
    readonly object_id: string;
    readonly sha256: string;
  };
  readonly subject: TranscriptSubject;
  readonly source: TranscriptSourceKey;
  readonly clock: TranscriptClock;
  /** Optional legacy transport data; never grants source authority. */
  readonly source_receipt?: unknown;
  readonly target: {
    readonly clip_id: string;
    readonly occurrence_id: string | null;
    /** The host supplies the runner selector; the consumer never invents it. */
    readonly selector: string;
  };
  /** Source-ordered subset selected by the host for this occurrence. */
  readonly word_ids: readonly string[];
  /** Exact prior value or explicit absence from the current timeline reader. */
  readonly prior_binding: BindingExpectation;
}

export interface PinnedTranscriptRead {
  readonly document: {
    readonly id: string;
    readonly version: number;
    readonly content_digest: string;
  };
  readonly snapshot: {
    readonly object_id: string;
    readonly sha256: string;
  };
  readonly subject: TranscriptSubject;
  readonly source: TranscriptSourceKey;
  readonly clock: TranscriptClock;
  readonly words: readonly TranscriptWord[];
  /** Optional legacy transport data; the public resolver supplies authority. */
  readonly source_receipt?: unknown;
}

export interface TranscriptCaptionFoundryHost {
  /** Release the retry choice only after the ordinary save barrier acknowledges it. */
  readonly completeSelection?: (selection: ExplicitTranscriptSelection) => void;
  /** Selection and credentials are host-owned; item payloads are not authority. */
  readonly selectTranscript: (
    items: readonly DataLaneRenderItem[],
  ) => Promise<ExplicitTranscriptSelection | null>;
  /** Implemented by the authenticated per-kind Runtime document facade. */
  readonly documents: {
    readonly read: (
      request: Readonly<{
        project_id: string;
        kind: typeof TRANSCRIPT_DOCUMENT_KIND;
        document: ExplicitTranscriptSelection['document'];
        snapshot: ExplicitTranscriptSelection['snapshot'];
        subject: TranscriptSubject;
        source: TranscriptSourceKey;
        source_receipt: unknown;
      }>,
    ) => Promise<readonly PinnedTranscriptRead[]>;
  };
  /** Existing App caption edit producer; correspondence is forwarded unchanged to D. */
  readonly buildCaptionCommands: (input: Readonly<{
    selection: ExplicitTranscriptSelection;
    transcript: PinnedTranscriptRead;
    binding: TranscriptBinding;
  }>) => Readonly<{
    commands: readonly EditCommand[];
    correspondence: readonly TranscriptWordCorrespondence[];
  }>;
}

interface TranscriptCommandTimeline extends TimelineOps {
  /** App host-only extension over TimelineOps, gated to the admitted consumer. */
  submitCommandTransaction?: (
    commands: readonly EditCommand[],
    options: Readonly<{ transactionId: string; semantic: true }>,
  ) => void | Promise<void>;
}

export interface TranscriptCaptionFoundryResult {
  readonly binding: TranscriptBinding;
  readonly commands: readonly EditCommand[];
  readonly transactionId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Transcript consumer refused: ${label} is missing.`);
  }
}

function validateSelection(value: ExplicitTranscriptSelection | null): ExplicitTranscriptSelection {
  if (!value || value.explicit !== true) {
    throw new Error('Transcript consumer refused: choose one explicit transcript source first.');
  }
  requireText(value.request_id, 'request identity');
  requireText(value.project_id, 'project');
  requireText(value.document?.id, 'selected document ID');
  requireText(value.document?.content_digest, 'selected document content digest');
  requireText(value.snapshot?.object_id, 'selected snapshot object ID');
  requireText(value.snapshot?.sha256, 'selected snapshot digest');
  if (!Number.isSafeInteger(value.document.version) || value.document.version < 1) {
    throw new Error('Transcript consumer refused: selection is missing its exact document pin.');
  }
  requireText(value.subject?.media_object_id, 'media object identity');
  requireText(value.subject?.media_sha256, 'media digest');
  requireText(value.source?.producer_id, 'producer identity');
  requireText(value.source?.source_id, 'source identity');
  requireText(value.source?.lineage_id, 'source lineage');
  requireText(value.source?.revision_id, 'source revision');
  requireText(value.source?.producer_digest, 'producer digest');
  if (value.source.parent_revision_id !== undefined) {
    requireText(value.source.parent_revision_id, 'parent source revision');
  }
  if (value.clock?.kind !== 'media' || value.clock?.unit !== 'seconds' || value.clock?.origin_seconds !== 0) {
    throw new Error('Transcript consumer refused: selection is missing its exact media clock.');
  }
  requireText(value.target?.clip_id, 'target clip');
  if (value.target?.occurrence_id !== null) requireText(value.target?.occurrence_id, 'target occurrence');
  requireText(value.target?.selector, 'runner selector');
  const scope = value.target.occurrence_id === null ? 'parent' : `occurrence:${value.target.occurrence_id}`;
  if (value.target.selector !== `${scope}/clip:${value.target.clip_id}`) {
    throw new Error('Transcript consumer refused: selector does not match its exact clip/occurrence target.');
  }
  if (!Array.isArray(value.word_ids) || value.word_ids.length === 0
    || value.word_ids.some((id) => typeof id !== 'string' || id.trim() === '')
    || new Set(value.word_ids).size !== value.word_ids.length) {
    throw new Error('Transcript consumer refused: selected word IDs must be a nonempty ordered unique list.');
  }
  if (!isRecord(value.prior_binding)
    || (value.prior_binding.state !== 'absent' && value.prior_binding.state !== 'present')
    || (value.prior_binding.state === 'present' && !isRecord(value.prior_binding.value))) {
    throw new Error('Transcript consumer refused: prior binding expectation is not presence-aware.');
  }
  return value;
}

function validatePinnedRead(
  value: PinnedTranscriptRead,
  selection: ExplicitTranscriptSelection,
): TranscriptBinding {
  requireText(value.document?.id, 'document ID');
  requireText(value.document?.content_digest, 'document content digest');
  requireText(value.snapshot?.object_id, 'snapshot object ID');
  requireText(value.snapshot?.sha256, 'snapshot digest');
  if (!Number.isSafeInteger(value.document.version) || value.document.version < 1
    || !Array.isArray(value.words)) {
    throw new Error('Transcript consumer refused: read did not return a complete pinned source.');
  }
  if (value.subject.media_object_id !== selection.subject.media_object_id
    || value.subject.media_sha256 !== selection.subject.media_sha256
    || value.source.producer_id !== selection.source.producer_id
    || value.source.source_id !== selection.source.source_id
    || value.source.lineage_id !== selection.source.lineage_id
    || value.source.revision_id !== selection.source.revision_id
    || value.source.producer_digest !== selection.source.producer_digest
    || value.source.parent_revision_id !== selection.source.parent_revision_id) {
    throw new Error('Transcript consumer refused: the read does not match the explicit media/source revision selection.');
  }
  if (value.document.id !== selection.document.id
    || value.document.version !== selection.document.version
    || value.document.content_digest !== selection.document.content_digest
    || value.snapshot.object_id !== selection.snapshot.object_id
    || value.snapshot.sha256 !== selection.snapshot.sha256) {
    throw new Error('Transcript consumer refused: the read is stale or does not match the selected immutable pin.');
  }
  if (value.clock.kind !== selection.clock.kind
    || value.clock.unit !== selection.clock.unit
    || value.clock.origin_seconds !== selection.clock.origin_seconds) {
    throw new Error('Transcript consumer refused: the read does not match the selected transcript clock.');
  }

  const orderedWordIds = value.words.map((word) => word.id);
  if (value.words.some((word) => typeof word.text !== 'string'
      || !Number.isFinite(word.start_s) || !Number.isFinite(word.end_s)
      || word.start_s < 0 || word.end_s < word.start_s)
    || orderedWordIds.some((id) => typeof id !== 'string' || id.trim() === '')
    || new Set(orderedWordIds).size !== orderedWordIds.length) {
    throw new Error('Transcript consumer refused: malformed transcript word identity or interval.');
  }
  const selectedSet = new Set(selection.word_ids);
  const expectedSelectedOrder = orderedWordIds.filter((id) => selectedSet.has(id));
  if (expectedSelectedOrder.length !== selectedSet.size
    || expectedSelectedOrder.some((id, index) => id !== selection.word_ids[index])) {
    throw new Error('Transcript consumer refused: selected words are absent or not in source order.');
  }

  return {
    schema_version: 1,
    document: value.document,
    snapshot: value.snapshot,
    subject: value.subject,
    source: value.source,
    clock: value.clock,
    occurrence_id: selection.target.occurrence_id,
    word_ids: [...selection.word_ids],
  };
}

function transcriptBindCommand(
  selection: ExplicitTranscriptSelection,
  binding: TranscriptBinding,
  sourceReceipt: unknown,
  correspondence: readonly TranscriptWordCorrespondence[],
): EditCommand {
  return {
    op: 'transcript.bind',
    select: null,
    args: {
      target: {
        clip_id: selection.target.clip_id,
        occurrence_id: selection.target.occurrence_id,
      },
      expect: { binding: selection.prior_binding },
      next: binding,
      correspondence,
      ...(sourceReceipt !== undefined ? { source_receipt: sourceReceipt } : {}),
    },
  };
}

/**
 * Run the mounted Caption Foundry callback. Its document port is read-only;
 * the only write leaves through the existing timeline command transaction.
 */
export async function runTranscriptCaptionFoundry(
  context: ExtensionContext,
  items: readonly DataLaneRenderItem[],
): Promise<TranscriptCaptionFoundryResult> {
  const host = context.creative.project as Partial<TranscriptCaptionFoundryHost> | undefined;
  const commandTimeline = context.creative.timeline as TranscriptCommandTimeline;
  if (!host?.selectTranscript || !host.documents?.read || !host.buildCaptionCommands
    || !commandTimeline.submitCommandTransaction) {
    throw new Error('Transcript consumer refused: authenticated project host is not joined.');
  }

  const selection = validateSelection(await host.selectTranscript(items));
  const matches = await host.documents.read({
    project_id: selection.project_id,
    kind: TRANSCRIPT_DOCUMENT_KIND,
    document: selection.document,
    snapshot: selection.snapshot,
    subject: selection.subject,
    source: selection.source,
    source_receipt: selection.source_receipt,
  });
  if (matches.length !== 1) {
    throw new Error(`Transcript consumer refused: expected one exact source, received ${matches.length}.`);
  }

  const transcript = matches[0]!;
  const binding = validatePinnedRead(transcript, selection);
  const captionBatch = host.buildCaptionCommands({ selection, transcript, binding });
  const captionCommands = captionBatch.commands;
  if (!Array.isArray(captionCommands) || captionCommands.length === 0 || captionCommands.some((command) => (
    command.op === 'transcript.bind' || command.op.startsWith('transcript.')
  )) || !Array.isArray(captionBatch.correspondence)) {
    throw new Error('Transcript consumer refused: caption producer returned no ordinary caption commands.');
  }
  const bind = transcriptBindCommand(selection, binding, transcript.source_receipt, captionBatch.correspondence);
  const commands = [bind, ...captionCommands];
  await commandTimeline.submitCommandTransaction(commands, {
    transactionId: selection.request_id,
    semantic: true,
  });
  await commandTimeline.flush();
  host.completeSelection?.(selection);
  return { binding, commands, transactionId: selection.request_id };
}
