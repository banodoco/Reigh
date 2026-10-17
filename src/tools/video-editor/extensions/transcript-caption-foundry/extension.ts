import { createElement } from 'react';
import {
  defineExtension,
  type ContributionId,
  type DataLaneRenderItem,
  type DataLaneRendererProps,
  type DisposeHandle,
  type ExtensionContext,
  type ExtensionId,
} from '@reigh/editor-sdk';
import { runTranscriptCaptionFoundry } from './consumer.ts';

export const TRANSCRIPT_CAPTION_FOUNDRY_EXTENSION_ID = 'com.reigh.transcript-lane' as ExtensionId;
export const TRANSCRIPT_CAPTION_FOUNDRY_KIND_ID = 'media.transcript';
export const TRANSCRIPT_CAPTION_FOUNDRY_SCHEMA_REF = 'media.transcript/v1';

function transcriptLabel(item: DataLaneRenderItem): string {
  if (item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)) {
    const text = (item.payload as Record<string, unknown>).text;
    if (typeof text === 'string') return text;
  }
  return item.sourceItemId ?? item.id;
}

function renderTranscriptLane(props: DataLaneRendererProps) {
  return createElement(
    'ol',
    { className: 'transcript-caption-foundry-lane', 'aria-label': 'Transcript words' },
    ...props.items.map((item) => createElement(
      'li',
      { key: item.id, 'data-source-item-id': item.sourceItemId },
      transcriptLabel(item),
    )),
  );
}

export const transcriptCaptionFoundryExtension = defineExtension({
  manifest: {
    id: TRANSCRIPT_CAPTION_FOUNDRY_EXTENSION_ID,
    version: '2.0.0',
    apiVersion: 1,
    license: 'MIT',
    label: 'Transcript Caption Foundry',
    description: 'Read a pinned transcript source and add editable caption clips.',
    contributions: [
      { id: 'create-captions-command' as ContributionId, kind: 'command',
        command: 'com.reigh.transcript-lane.create-captions', label: 'Create captions from transcript', category: 'Transcript' },
      {
        id: 'media-transcript-kind' as ContributionId,
        kind: 'dataKind',
        kindId: TRANSCRIPT_CAPTION_FOUNDRY_KIND_ID,
        schemaRef: TRANSCRIPT_CAPTION_FOUNDRY_SCHEMA_REF,
        shape: 'interval',
        domain: 'source_seconds',
        label: 'Transcript',
        order: 10,
      },
    ],
  },

  activate(context: ExtensionContext): DisposeHandle {
    const command = context.commands.registerCommand('com.reigh.transcript-lane.create-captions', async () => {
      await runTranscriptCaptionFoundry(context, []);
    });
    const registration = context.dataKinds.register(
      TRANSCRIPT_CAPTION_FOUNDRY_KIND_ID,
      renderTranscriptLane,
      undefined,
      {
        supportsSparseItemWindows: true,
        actions: [
          {
            id: 'adopt-selected-transcript',
            label: 'Create captions',
            ariaLabel: 'Read the selected transcript and create editable captions',
            title: 'Use one pinned transcript source and save its binding with the caption edits',
            invoke: async (items) => {
              await runTranscriptCaptionFoundry(context, items);
            },
          },
        ],
      },
    );
    return { dispose: () => { registration.dispose(); command.dispose(); } };
  },
});
