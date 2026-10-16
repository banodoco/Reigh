import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtensionContext } from '@/tools/video-editor/runtime/extensionContextFactory.ts';
import { createDataKindRegistry } from '@/tools/video-editor/data-kinds/DataKindRegistry.ts';
import { createDataKindRegistrationService } from '@/tools/video-editor/runtime/dataKindRegistrationService.ts';
import { validateManifest, type DataLaneRenderItem, type ExtensionContext } from '@reigh/editor-sdk';
import type { EditCommand } from '@/integrations/runtime/generated.ts';
import {
  TRANSCRIPT_DOCUMENT_KIND,
  type ExplicitTranscriptSelection,
  type PinnedTranscriptRead,
  type TranscriptCaptionFoundryHost,
} from './consumer.ts';
import {
  TRANSCRIPT_CAPTION_FOUNDRY_KIND_ID,
  transcriptCaptionFoundryExtension,
} from './extension.ts';

const selection: ExplicitTranscriptSelection = {
  explicit: true,
  request_id: 'adopt-001',
  project_id: 'synthetic-project',
  document: { id: 'doc-from-facade', version: 4, content_digest: 'sha256:content-4' },
  snapshot: { object_id: 'cas://synthetic/transcript-4', sha256: 'sha256:snapshot-4' },
  subject: { media_object_id: 'media-object-1', media_sha256: 'sha256:media-1' },
  source: {
    producer_id: 'synthetic-asr',
    source_id: 'take-2',
    lineage_id: 'lineage-2',
    revision_id: 'revision-4',
    producer_digest: 'sha256:producer-4',
  },
  clock: { kind: 'media', unit: 'seconds', origin_seconds: 0 },
  source_receipt: { receipt_id: 'publish-receipt-2' },
  target: {
    clip_id: 'clip-1',
    occurrence_id: 'occurrence-1',
    selector: 'parent/clip:clip-1',
  },
  word_ids: ['word-2', 'word-3'],
  prior_binding: { state: 'absent' },
};

const pinnedRead: PinnedTranscriptRead = {
  document: selection.document,
  snapshot: selection.snapshot,
  subject: selection.subject,
  source: {
    ...selection.source,
  },
  clock: { kind: 'media', unit: 'seconds', origin_seconds: 0 },
  words: [
    { id: 'word-1', text: 'Hello', start_s: 0, end_s: 0.2 },
    { id: 'word-2', text: 'synthetic', start_s: 0.2, end_s: 0.5 },
    { id: 'word-3', text: 'words', start_s: 0.5, end_s: 0.8 },
  ],
  source_receipt: { receipt_id: 'resolved-receipt-4' },
};

const laneItems: readonly DataLaneRenderItem[] = [
  {
    id: 'occurrence-1:segment-1',
    sourceItemId: 'segment-1',
    timelineStart: 1,
    timelineEnd: 2,
    clipId: 'clip-1',
    payload: { text: 'synthetic words' },
  },
];

function mountedAction(host: TranscriptCaptionFoundryHost) {
  const validation = validateManifest(transcriptCaptionFoundryExtension.manifest);
  expect(validation.errors).toEqual([]);

  const registry = createDataKindRegistry();
  const diagnostics = { report: vi.fn(), get diagnostics() { return []; } };
  const dataKinds = createDataKindRegistrationService({
    extension: transcriptCaptionFoundryExtension,
    dataKindRegistry: registry,
    diagnosticsService: diagnostics as never,
  });
  const submitCommandTransaction = vi.fn(async (
    _commands: readonly EditCommand[],
    _options: Readonly<{ transactionId: string; semantic: true }>,
  ) => undefined);
  const timeline = {
    validate: vi.fn(() => ({ valid: true, diagnostics: [] })),
    preview: vi.fn(),
    apply: vi.fn(),
    flush: vi.fn(async () => ({ version: 1 })),
    checkpoint: vi.fn(() => 'checkpoint-1'),
    rollback: vi.fn(() => null),
    setAllTracksMuted: vi.fn(),
    submitCommandTransaction,
  };
  const context = createExtensionContext(
    transcriptCaptionFoundryExtension,
    { project: host, timeline } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dataKinds,
  );
  const dispose = transcriptCaptionFoundryExtension.activate?.(context);
  const record = registry.resolve(TRANSCRIPT_CAPTION_FOUNDRY_KIND_ID);
  const action = record?.laneActions?.find(({ id }) => id === 'adopt-selected-transcript');
  if (!action) throw new Error('Caption Foundry callback was not registered.');
  return {
    action,
    context,
    submitCommandTransaction,
    dispose: () => {
      dispose?.dispose();
      registry.dispose();
    },
  };
}

function host(overrides: Partial<TranscriptCaptionFoundryHost> = {}) {
  const buildCaptionCommands = vi.fn(() => ({
    commands: [
      { op: 'clip.set-look', select: 'parent/clip:caption-1', args: { opacity: 1 } },
    ] as readonly EditCommand[],
    correspondence: [],
  }));
  const read = vi.fn(async () => [pinnedRead]);
  const createDocument = vi.fn();
  const updateDocument = vi.fn();
  const result: TranscriptCaptionFoundryHost & {
    readonly createDocument: typeof createDocument;
    readonly updateDocument: typeof updateDocument;
  } = {
    selectTranscript: vi.fn(async () => selection),
    documents: { read },
    buildCaptionCommands,
    createDocument,
    updateDocument,
    ...overrides,
  };
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe('mounted read-only transcript consumer', () => {
  it('scopes the creative.project host override to the exact declared contribution', () => {
    const projectHost = host();
    const admitted = createExtensionContext(
      transcriptCaptionFoundryExtension,
      { project: projectHost } as never,
    );
    expect(admitted.creative.project).toBe(projectHost);

    const unrelatedExtension = {
      ...transcriptCaptionFoundryExtension,
      manifest: {
        ...transcriptCaptionFoundryExtension.manifest,
        id: 'com.reigh.unrelated',
      },
    } as unknown as typeof transcriptCaptionFoundryExtension;
    const wrongKindExtension = {
      ...transcriptCaptionFoundryExtension,
      manifest: {
        ...transcriptCaptionFoundryExtension.manifest,
        contributions: transcriptCaptionFoundryExtension.manifest.contributions.map((item) => ({
          ...item,
          kindId: 'media.other',
        })),
      },
    } as unknown as typeof transcriptCaptionFoundryExtension;
    const wrongSchemaExtension = {
      ...transcriptCaptionFoundryExtension,
      manifest: {
        ...transcriptCaptionFoundryExtension.manifest,
        contributions: transcriptCaptionFoundryExtension.manifest.contributions.map((item) => ({
          ...item,
          schemaRef: 'media.transcript/v2',
        })),
      },
    } as unknown as typeof transcriptCaptionFoundryExtension;

    for (const extension of [unrelatedExtension, wrongKindExtension, wrongSchemaExtension]) {
      const context = createExtensionContext(extension, { project: projectHost } as never);
      expect(() => context.creative.project).toThrow();
    }
  });

  it('reads one exact pinned source and submits bind then captions in one command transaction', async () => {
    const correspondence = [{
      from: { lineage_id: 'old-lineage', word_id: 'word-old' },
      to: { lineage_id: 'lineage-2', word_id: 'word-2' },
    }];
    const captionCommands: readonly EditCommand[] = [
      { op: 'clip.set-look', select: 'parent/clip:caption-1', args: { opacity: 1 } },
    ];
    const project = host({
      buildCaptionCommands: vi.fn(() => ({ commands: captionCommands, correspondence })),
    });
    const mounted = mountedAction(project);
    try {
      await mounted.action.invoke(laneItems);

      expect(project.documents.read).toHaveBeenCalledOnce();
      expect(project.documents.read).toHaveBeenCalledWith({
        project_id: selection.project_id,
        kind: TRANSCRIPT_DOCUMENT_KIND,
        document: selection.document,
        snapshot: selection.snapshot,
        subject: selection.subject,
        source: selection.source,
        source_receipt: selection.source_receipt,
      });
      expect(mounted.submitCommandTransaction).toHaveBeenCalledOnce();
      const [commands, transaction] = mounted.submitCommandTransaction.mock.calls[0]!;
      expect(commands.map(({ op }) => op)).toEqual(['transcript.bind', 'clip.set-look']);
      expect(transaction).toEqual({ transactionId: selection.request_id, semantic: true });
      expect(commands[0]).toMatchObject({
        op: 'transcript.bind',
        select: selection.target.selector,
        args: {
          target: { clip_id: selection.target.clip_id, occurrence_id: selection.target.occurrence_id },
          expect: { binding: { state: 'absent' } },
          next: {
            document: selection.document,
            snapshot: selection.snapshot,
            subject: selection.subject,
            source: selection.source,
            clock: { kind: 'media', unit: 'seconds', origin_seconds: 0 },
            occurrence_id: selection.target.occurrence_id,
            word_ids: selection.word_ids,
          },
          source_receipt: pinnedRead.source_receipt,
          correspondence,
        },
      });
      expect(project.buildCaptionCommands).toHaveBeenCalledWith(expect.objectContaining({
        transcript: expect.objectContaining({
          words: pinnedRead.words,
          clock: selection.clock,
        }),
      }));
      expect(project.createDocument).not.toHaveBeenCalled();
      expect(project.updateDocument).not.toHaveBeenCalled();
    } finally {
      mounted.dispose();
    }
  });

  it('refuses an ambiguous source, a stale pin, a mismatched subject, and a non-explicit selection', async () => {
    const ambiguous = host({ documents: { read: vi.fn(async () => [pinnedRead, pinnedRead]) } });
    const ambiguousMount = mountedAction(ambiguous);
    await expect(ambiguousMount.action.invoke(laneItems)).rejects.toThrow('expected one exact source');
    expect(ambiguousMount.submitCommandTransaction).not.toHaveBeenCalled();
    ambiguousMount.dispose();

    const staleRead = { ...pinnedRead, document: { ...pinnedRead.document, version: 3 } };
    const stale = host({ documents: { read: vi.fn(async () => [staleRead]) } });
    const staleMount = mountedAction(stale);
    await expect(staleMount.action.invoke(laneItems)).rejects.toThrow('stale or does not match');
    expect(staleMount.submitCommandTransaction).not.toHaveBeenCalled();
    staleMount.dispose();

    const mismatchedRead = { ...pinnedRead, subject: { ...pinnedRead.subject, media_sha256: 'sha256:wrong' } };
    const mismatched = host({ documents: { read: vi.fn(async () => [mismatchedRead]) } });
    const mismatchMount = mountedAction(mismatched);
    await expect(mismatchMount.action.invoke(laneItems)).rejects.toThrow('does not match the explicit');
    expect(mismatchMount.submitCommandTransaction).not.toHaveBeenCalled();
    mismatchMount.dispose();

    const unselected = host({ selectTranscript: vi.fn(async () => null) });
    const unselectedMount = mountedAction(unselected);
    await expect(unselectedMount.action.invoke(laneItems)).rejects.toThrow('one explicit transcript source');
    expect(unselected.documents.read).not.toHaveBeenCalled();
    unselectedMount.dispose();

    const wrongRevision = { ...pinnedRead, source: { ...pinnedRead.source, revision_id: 'revision-3' } };
    const revisionMismatch = host({ documents: { read: vi.fn(async () => [wrongRevision]) } });
    const revisionMount = mountedAction(revisionMismatch);
    await expect(revisionMount.action.invoke(laneItems)).rejects.toThrow('source revision selection');
    expect(revisionMount.submitCommandTransaction).not.toHaveBeenCalled();
    revisionMount.dispose();

    const wrongClock = { ...pinnedRead, clock: { kind: 'media', unit: 'seconds', origin_seconds: 1 } as const };
    const clockMismatch = host({ documents: { read: vi.fn(async () => [wrongClock]) } });
    const clockMount = mountedAction(clockMismatch);
    await expect(clockMount.action.invoke(laneItems)).rejects.toThrow('selected transcript clock');
    expect(clockMount.submitCommandTransaction).not.toHaveBeenCalled();
    clockMount.dispose();
  });

  it('preserves the exact prior binding expectation and reuses the pinned receipt and request on retry', async () => {
    const prior = {
      ...pinnedRead,
      clock: { kind: 'media', unit: 'seconds', origin_seconds: 0 } as const,
      occurrence_id: selection.target.occurrence_id,
      word_ids: ['word-1'],
    };
    const retrySelection: ExplicitTranscriptSelection = {
      ...selection,
      prior_binding: { state: 'present', value: prior },
    };
    const project = host({ selectTranscript: vi.fn(async () => retrySelection) });
    const mounted = mountedAction(project);
    try {
      await mounted.action.invoke(laneItems);
      await mounted.action.invoke(laneItems);

      expect(project.documents.read).toHaveBeenCalledTimes(2);
      expect(project.documents.read).toHaveBeenNthCalledWith(1, expect.objectContaining({
        document: selection.document,
        snapshot: selection.snapshot,
        source_receipt: selection.source_receipt,
      }));
      expect(project.documents.read).toHaveBeenNthCalledWith(2, expect.objectContaining({
        document: selection.document,
        snapshot: selection.snapshot,
        source_receipt: selection.source_receipt,
      }));
      expect(mounted.submitCommandTransaction).toHaveBeenNthCalledWith(1, expect.any(Array), {
        transactionId: selection.request_id,
        semantic: true,
      });
      expect(mounted.submitCommandTransaction).toHaveBeenNthCalledWith(2, expect.any(Array), {
        transactionId: selection.request_id,
        semantic: true,
      });
      const first = mounted.submitCommandTransaction.mock.calls[0]![0][0]!;
      const retry = mounted.submitCommandTransaction.mock.calls[1]![0][0]!;
      expect(first.args.expect).toEqual({ binding: { state: 'present', value: prior } });
      expect(retry.args.source_receipt).toBe(pinnedRead.source_receipt);
      expect(project.createDocument).not.toHaveBeenCalled();
      expect(project.updateDocument).not.toHaveBeenCalled();
    } finally {
      mounted.dispose();
    }
  });

  it('does not expose transcript source mutation methods on the consumer port', () => {
    const project = host();
    const consumerContext = {
      creative: { project },
    } as unknown as ExtensionContext;
    expect(consumerContext.creative.project).toBe(project);
    expect(Object.keys(project.documents).sort()).toEqual(['read']);
  });
});
