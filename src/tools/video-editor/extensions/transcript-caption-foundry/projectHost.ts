import type { ProjectTranscriptReader } from '@/integrations/runtime/projectTranscriptReader.ts';
import type { ProjectDocument } from '@/integrations/runtime/generated.ts';
import type { TimelineData } from '../../lib/timeline-data.ts';
import { occurrenceIdentityFor } from '../../commands/semanticGestures.ts';
import { buildTranscriptCaptionCommands } from '../../commands/transcriptCaptions.ts';
import type { ExplicitTranscriptSelection, PinnedTranscriptRead, TranscriptBinding, TranscriptCaptionFoundryHost } from './consumer.ts';

export interface TranscriptChoice {
  readonly label: string;
  readonly clipId: string;
  readonly trackId: string;
  readonly document: Pick<ProjectDocument, 'document_id' | 'version'>;
}

/** An explicit choice, including the single-candidate case; cancel writes nothing. */
export function chooseTranscriptSource(choices: readonly TranscriptChoice[], signal?: AbortSignal): Promise<TranscriptChoice | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Choose transcript source');
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'Transcript source, target clip and caption track';
    const select = document.createElement('select');
    select.setAttribute('aria-label', label.textContent);
    const placeholder = document.createElement('option');
    placeholder.textContent = 'Choose one source'; placeholder.value = '';
    select.append(placeholder);
    choices.forEach((choice, index) => {
      const option = document.createElement('option');
      option.value = String(index); option.textContent = choice.label;
      select.append(option);
    });
    label.append(select);
    const submit = document.createElement('button');
    submit.type = 'submit'; submit.textContent = 'Create captions'; submit.disabled = true;
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Cancel';
    const abort = () => finish(null);
    const finish = (choice: TranscriptChoice | null) => { signal?.removeEventListener('abort', abort); dialog.remove(); resolve(choice); };
    signal?.addEventListener('abort', abort, { once: true });
    select.onchange = () => { submit.disabled = select.value === ''; };
    cancel.onclick = () => finish(null);
    dialog.oncancel = (event) => { event.preventDefault(); finish(null); };
    form.onsubmit = (event) => {
      event.preventDefault();
      if (select.value !== '') finish(choices[Number(select.value)] ?? null);
    };
    form.append(label, submit, cancel); dialog.append(form); document.body.append(dialog);
    if (signal?.aborted) finish(null); else dialog.showModal();
  });
}

const record = (value: unknown): Record<string, unknown> | undefined => value !== null
  && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function createTranscriptCaptionProjectHost(options: {
  projectId: string;
  reader: ProjectTranscriptReader;
  data: () => TimelineData | null;
  choose?: typeof chooseTranscriptSource;
}): TranscriptCaptionFoundryHost & { dispose(): void } {
  const lifetime = new AbortController();
  const selections = new WeakMap<ExplicitTranscriptSelection, { transcript: PinnedTranscriptRead; trackId: string }>();
  let pending: { version: number; clips: string; selection: ExplicitTranscriptSelection } | undefined;
  const data = () => {
    const current = options.data();
    if (lifetime.signal.aborted || !current || options.reader.projectId !== options.projectId) {
      throw new Error('Transcript consumer refused: active project reader is unavailable or mismatched.');
    }
    return current;
  };
  const host: TranscriptCaptionFoundryHost = {
    completeSelection(selection) {
      if (pending?.selection === selection) pending = undefined;
    },
    async selectTranscript(items) {
      const before = data();
      const clipIds = [...new Set(items.map((item) => item.clipId).filter(Boolean))];
      if (clipIds.length > 1) throw new Error('Transcript consumer refused: ambiguous target clips.');
      const itemKey = JSON.stringify(clipIds);
      if (pending?.version === before.configVersion && pending.clips === itemKey) return pending.selection;
      const documents = await options.reader.list();
      const choices: TranscriptChoice[] = [];
      for (const clip of before.config.clips) {
        if (clipIds.length && clip.id !== clipIds[0]) continue;
        const asset = clip.asset ? before.registry.assets[clip.asset] : undefined;
        const mediaId = asset?.media_id ?? asset?.file;
        if (typeof mediaId !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(mediaId)) continue;
        for (const document of documents) {
          const content = record(document.content);
          const subject = record(content?.subject);
          const source = record(content?.source);
          if (document.project_id !== options.projectId || document.kind !== 'media.transcript/v1'
            || subject?.media_object_id !== mediaId
            || String(subject.media_sha256).replace(/^sha256:/, '') !== mediaId.slice(7)) continue;
          for (const track of before.config.tracks ?? []) {
            if (track.kind === 'audio' || track.role === 'source') continue;
            choices.push({ clipId: clip.id, trackId: track.id, document,
              label: `${clip.id} · ${String(source?.producer_id)}/${String(source?.source_id)} · ${String(source?.revision_id)} · v${document.version} · ${track.label ?? track.id}` });
          }
        }
      }
      if (!choices.length) throw new Error('Transcript consumer refused: no project transcript matches the selected immutable media.');
      const choice = await (options.choose ?? chooseTranscriptSource)(choices, lifetime.signal);
      if (!choice) return null;
      if (!choices.includes(choice)) throw new Error('Transcript consumer refused: selection is outside the active context.');
      const current = data();
      if (current !== before) throw new Error('Transcript consumer refused: timeline changed while choosing the source.');
      const transcript = await options.reader.read(choice.document);
      if (data() !== before) throw new Error('Transcript consumer refused: timeline changed while reading the source.');
      const clip = before.config.clips.find((item) => item.id === choice.clipId)!;
      const identity = occurrenceIdentityFor(before, clip.id);
      if (clip.app?.canonical && (!identity || identity.projectId !== options.projectId)) {
        throw new Error('Transcript consumer refused: exact occurrence context is unavailable.');
      }
      const clipId = identity?.sourceClipId ?? clip.id;
      const occurrenceId = identity?.occurrenceId ?? null;
      const sourceClip = identity?.sourceClip ?? clip;
      const ns = record(record(sourceClip.app)?.transcript);
      if (ns?.v !== undefined && ns.v !== 1) throw new Error('Transcript consumer refused: unsupported transcript namespace.');
      const selection: ExplicitTranscriptSelection = {
        explicit: true, request_id: crypto.randomUUID(), project_id: options.projectId,
        document: transcript.document, snapshot: transcript.snapshot, subject: transcript.subject,
        source: transcript.source, clock: transcript.clock,
        target: { clip_id: clipId, occurrence_id: occurrenceId,
          selector: `${occurrenceId === null ? 'parent' : `occurrence:${occurrenceId}`}/clip:${clipId}` },
        word_ids: transcript.words.map((word) => word.id),
        prior_binding: ns && Object.prototype.hasOwnProperty.call(ns, 'binding')
          ? { state: 'present', value: structuredClone(ns.binding) as TranscriptBinding } : { state: 'absent' },
      };
      selections.set(selection, { transcript, trackId: choice.trackId });
      pending = { version: before.configVersion, clips: itemKey, selection };
      return selection;
    },
    documents: Object.freeze({
      async read(request) {
        const selection = pending?.selection;
        if (!selection || data().configVersion !== pending?.version || request.project_id !== options.projectId || request.kind !== 'media.transcript/v1'
          || request.document !== selection.document || request.snapshot !== selection.snapshot
          || request.subject !== selection.subject || request.source !== selection.source) {
          throw new Error('Transcript consumer refused: read is outside the host selection.');
        }
        // Refresh only the explicit exact pin; an advanced document refuses.
        let fresh: PinnedTranscriptRead;
        try {
          fresh = await options.reader.read({ document_id: selection.document.id, version: selection.document.version });
        } catch (error) {
          // A source read failed before submission. A new invocation must offer
          // an explicit choice instead of trapping the user on an invalid pin.
          if (pending?.selection === selection) pending = undefined;
          throw error;
        }
        const saved = selections.get(selection)!;
        if (fresh.snapshot.object_id !== saved.transcript.snapshot.object_id) {
          throw new Error('Transcript consumer refused: selected snapshot changed.');
        }
        return [saved.transcript];
      },
    }),
    buildCaptionCommands(input) {
      if (data().configVersion !== pending?.version) throw new Error('Transcript consumer refused: timeline changed before submission.');
      const saved = selections.get(input.selection);
      if (!saved || input.transcript !== saved.transcript) throw new Error('Transcript consumer refused: foreign source projection.');
      return buildTranscriptCaptionCommands({ ...input, trackId: saved.trackId });
    },
  };
  return Object.freeze(Object.defineProperty(host, 'dispose', { value: () => lifetime.abort() })) as TranscriptCaptionFoundryHost & { dispose(): void };
}
