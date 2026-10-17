import { webcrypto } from 'node:crypto';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimelineData } from '../../lib/timeline-data.ts';
import { createExtensionContext } from '../../runtime/extensionContextFactory.ts';
import { createDataKindRegistrationService } from '../../runtime/dataKindRegistrationService.ts';
import { createDataKindRegistry } from '../../data-kinds/DataKindRegistry.ts';
import { attachGestureCommands, gestureCommandsFor, gestureOccurrenceFor } from '../../commands/semanticGestures.ts';
import { transcriptCaptionFoundryExtension } from './extension.ts';
import { chooseTranscriptSource, createTranscriptCaptionProjectHost, type TranscriptChoice } from './projectHost.ts';
import type { PinnedTranscriptRead } from './consumer.ts';

const media = `sha256:${'a'.repeat(64)}`;
const pin: PinnedTranscriptRead = {
  document: { id: 'producer-owned-document', version: 2, content_digest: `sha256:${'b'.repeat(64)}` },
  snapshot: { object_id: `sha256:${'b'.repeat(64)}`, sha256: 'b'.repeat(64) },
  subject: { media_object_id: media, media_sha256: 'a'.repeat(64) },
  source: { producer_id: 'synthetic-producer', source_id: 'take', lineage_id: 'line', revision_id: 'rev', producer_digest: 'c'.repeat(64) },
  clock: { kind: 'media', unit: 'seconds', origin_seconds: 0 },
  words: [{ id: 'opaque-word', text: 'Hello', start_s: 0.2, end_s: 0.5 }],
};

function fixture(occurrence = false) {
  vi.stubGlobal('crypto', webcrypto);
  const sourceClip = { id: 'clip', clipType: 'media', track: 'video', asset: 'media', at: 0, hold: 1 };
  let current = { configVersion: 7, registry: { assets: { media: { file: media, media_id: media } } }, config: {
    clips: [{ ...sourceClip, ...(occurrence ? { id: 'projected', app: { canonical: {
      projectId: 'project', parentDocumentId: 'parent', headRevisionId: 'head', occurrenceId: 'occ', shotId: 'shot',
      revisionId: 'shot-rev', internalTimelineRevisionId: 'internal', outputIdentity: 'out', sourceClipId: 'clip', sourceClip,
    } } } : {}) }], tracks: [{ id: 'type', kind: 'visual' }],
  } } as unknown as TimelineData;
  const document = { project_id: 'project', document_id: pin.document.id, version: 2, kind: 'media.transcript/v1',
    content: { subject: pin.subject, source: pin.source }, created_at: '', updated_at: '' };
  const reader = { projectId: 'project', list: vi.fn(async () => [document]), read: vi.fn(async () => structuredClone(pin)) };
  const choose = vi.fn(async (choices: readonly TranscriptChoice[]) => choices[0]!);
  const host = createTranscriptCaptionProjectHost({ projectId: 'project', reader, data: () => current, choose });
  return { host, reader, choose, data: () => current, setData: (next: TimelineData) => { current = next; } };
}

function mount(host: ReturnType<typeof fixture>['host']) {
  const registry = createDataKindRegistry();
  const dataKinds = createDataKindRegistrationService({ extension: transcriptCaptionFoundryExtension,
    dataKindRegistry: registry, diagnosticsService: { report: vi.fn(), diagnostics: [] } as never });
  const submit = vi.fn();
  const flush = vi.fn(async () => ({ version: 8 }));
  const context = createExtensionContext(transcriptCaptionFoundryExtension, { project: host,
    timeline: { submitCommandTransaction: submit, flush } } as never, undefined, undefined, undefined,
  undefined, undefined, undefined, undefined, undefined, dataKinds);
  const lifecycle = transcriptCaptionFoundryExtension.activate!(context);
  const invoke = () => registry.resolve('media.transcript')!.laneActions![0]!.invoke([]);
  return { context, invoke, submit, flush, dispose: () => lifecycle?.dispose() };
}

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('mounted project transcript host', () => {
  it.each([false, true])('uses explicit selection and one bind/caption transaction with exact occurrence=%s', async (occurrence) => {
    const f = fixture(occurrence);
    const mounted = mount(f.host);
    try {
      await mounted.invoke();
      expect(f.choose).toHaveBeenCalledOnce();
      const [commands, options] = mounted.submit.mock.calls[0]!;
      const owner = occurrence ? 'occurrence:occ' : 'parent';
      expect(commands).toHaveLength(3);
      expect(commands[0]).toMatchObject({ op: 'transcript.bind', select: null,
        args: { target: { clip_id: 'clip', occurrence_id: occurrence ? 'occ' : null }, next: { word_ids: ['opaque-word'] } } });
      expect(commands[0].args).not.toHaveProperty('source_receipt');
      expect(commands[1]).toMatchObject({ op: 'timeline.add', select: null, args: { element: 'am-type', track: 'type', params: { text: 'Hello' } } });
      expect(commands[1].args.at).toContain(`"${owner}/clip:clip"`);
      expect(commands[1].args.at).toContain('"opaque-word"');
      expect(mounted.flush).toHaveBeenCalledOnce();
      const draft = structuredClone(f.data());
      attachGestureCommands(draft, commands, f.data());
      expect(gestureCommandsFor(draft)).toEqual(commands);
      expect(gestureOccurrenceFor(draft)?.occurrenceId).toBe(occurrence ? 'occ' : undefined);
      expect(options.semantic).toBe(true);
    } finally { mounted.dispose(); }
  });

  it('retains the same pin/request and caption IDs after durable refusal; exposes no document writes', async () => {
    const f = fixture(); const mounted = mount(f.host);
    mounted.flush.mockRejectedValueOnce(new Error('public COMMIT refused'));
    try {
      await expect(mounted.invoke()).rejects.toThrow('public COMMIT refused');
      await mounted.invoke();
      expect(mounted.submit.mock.calls[1]).toEqual(mounted.submit.mock.calls[0]);
      expect(f.choose).toHaveBeenCalledOnce();
      expect(Object.keys(f.host.documents)).toEqual(['read']);
      expect(Object.keys(f.host).sort()).toEqual(['buildCaptionCommands', 'documents', 'selectTranscript']);
    } finally { mounted.dispose(); }
  });

  it('refuses foreign projects, ambiguous clips, stale versions, cancel and changed context before submission', async () => {
    const f = fixture(); const mounted = mount(f.host);
    try {
      await expect(f.host.selectTranscript([{ clipId: 'one' }, { clipId: 'two' }] as never)).rejects.toThrow('ambiguous');
      f.reader.list.mockResolvedValueOnce([{ ...(await f.reader.list())[0]!, project_id: 'foreign' }]);
      await expect(mounted.invoke()).rejects.toThrow('no project transcript');
      f.choose.mockResolvedValueOnce(null as never);
      await expect(mounted.invoke()).rejects.toThrow('explicit transcript source');
      f.reader.read.mockRejectedValueOnce(new Error('selected version advanced'));
      await expect(mounted.invoke()).rejects.toThrow('version advanced');
      f.choose.mockImplementationOnce(async (choices) => { f.setData(structuredClone(f.data())); return choices[0]!; });
      await expect(mounted.invoke()).rejects.toThrow('timeline changed');
      expect(mounted.submit).not.toHaveBeenCalled();
    } finally { mounted.dispose(); }
  });

  it('does not expose the project host or command port to a wrong contribution', () => {
    const f = fixture();
    const extension = { ...transcriptCaptionFoundryExtension, manifest: { ...transcriptCaptionFoundryExtension.manifest,
      contributions: [{ id: 'wrong', kind: 'dataKind', kindId: 'other', schemaRef: 'other/v1' }] } };
    const context = createExtensionContext(extension as never, { project: f.host,
      timeline: { submitCommandTransaction: vi.fn() } } as never);
    expect(context.creative.project).not.toBe(f.host);
    expect(context.creative.timeline).not.toHaveProperty('submitCommandTransaction');
  });

  it('refuses retained callbacks after the project host is disposed', async () => {
    const f = fixture();
    await f.host.selectTranscript([]);
    f.host.dispose();
    await expect(f.host.selectTranscript([])).rejects.toThrow('active project reader');
  });

  it('requires a user choice even for one source and supports cancel', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.setAttribute('open', ''); } });
    const choice = { label: 'source v2 / clip / type', clipId: 'clip', trackId: 'type', document: { document_id: 'doc', version: 2 } };
    const selected = chooseTranscriptSource([choice]);
    expect(screen.getByRole('button', { name: 'Create captions' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create captions' }));
    expect(await selected).toBe(choice);
    const cancelled = chooseTranscriptSource([choice]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await cancelled).toBeNull();
  });
});
