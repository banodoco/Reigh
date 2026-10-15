import { useEffect, useState } from 'react';
import type {
  AudioLaneOwnerOperation,
  AudioLanePresentation,
} from '@/tools/video-editor/data/audioLanePresentation.ts';
import { LABEL_WIDTH } from '@/tools/video-editor/lib/coordinate-utils.ts';

const HEADER_HEIGHT = 30;
const ARRANGEMENT_HEADER_HEIGHT = 28;
const SPAN_BAR_HEIGHT = 30;
const SPAN_DETAIL_HEIGHT = 20;
const MARKER_ROW_HEIGHT = 28;

export interface AudioLaneOwnerGainEdit {
  readonly operation: AudioLaneOwnerOperation;
  readonly value: number;
}

export interface AudioLanePresentationListProps {
  readonly presentation?: AudioLanePresentation;
  readonly pixelsPerSecond: number;
  readonly onEditOwnerGain?: (edit: AudioLaneOwnerGainEdit) => void;
}

export function getAudioLanePresentationHeight(presentation?: AudioLanePresentation): number {
  if (!presentation) return 0;
  if (presentation.status === 'no-bed') return MARKER_ROW_HEIGHT;
  if (presentation.status === 'unavailable') return MARKER_ROW_HEIGHT;
  const arrangementHeight = presentation.lane.arrangements.reduce(
    (height, arrangement) => height + ARRANGEMENT_HEADER_HEIGHT + SPAN_BAR_HEIGHT
      + arrangement.spans.length * SPAN_DETAIL_HEIGHT,
    0,
  );
  return HEADER_HEIGHT + arrangementHeight
    + (presentation.lane.switches.length > 0 ? presentation.lane.switches.length * MARKER_ROW_HEIGHT : 0)
    + (presentation.lane.seams.length > 0 ? presentation.lane.seams.length * MARKER_ROW_HEIGHT : 0);
}

export function getAudioLanePresentationEnd(presentation?: AudioLanePresentation): number {
  if (!presentation || presentation.status !== 'available') return 0;
  const spanEnd = presentation.lane.arrangements.flatMap(({ spans }) => spans)
    .reduce((end, span) => Math.max(end, span.timeline.end_s), 0);
  const switchEnd = presentation.lane.switches
    .reduce((end, value) => Math.max(end, value.window.end_s), 0);
  const seamEnd = presentation.lane.seams
    .reduce((end, value) => Math.max(end, value.at_s), 0);
  return Math.max(spanEnd, switchEnd, seamEnd);
}

function isEditableGainOperation(
  operation: AudioLaneOwnerOperation,
  owner: string,
): boolean {
  return operation.op === 'clip.set-look'
    && operation.select === owner
    && typeof operation.args.volume === 'number';
}

function ArrangementRow({
  arrangement,
  pixelsPerSecond,
  onEditOwnerGain,
}: {
  arrangement: Extract<AudioLanePresentation, { status: 'available' }>['lane']['arrangements'][number];
  pixelsPerSecond: number;
  onEditOwnerGain?: AudioLanePresentationListProps['onEditOwnerGain'];
}) {
  const [gainValue, setGainValue] = useState(String(arrangement.gain.linear));
  const operation = arrangement.edit_source.operation;
  const canEdit = onEditOwnerGain !== undefined && isEditableGainOperation(operation, arrangement.owner);

  useEffect(() => {
    setGainValue(String(arrangement.gain.linear));
  }, [arrangement.gain.linear]);

  const applyGain = () => {
    const value = Number(gainValue);
    if (!Number.isFinite(value) || !canEdit || !onEditOwnerGain) return;
    onEditOwnerGain({ operation, value });
  };

  return (
    <section
      className="border-t border-border/40"
      data-audio-lane-arrangement={arrangement.id}
      aria-label={`Generated audio arrangement ${arrangement.id}`}
    >
      <div className="flex min-h-7 border-b border-border/20">
        <div
          className="sticky left-0 z-10 flex shrink-0 items-center gap-1 overflow-hidden border-r border-border/30 bg-card px-2 text-[10px] text-muted-foreground"
          style={{ width: LABEL_WIDTH }}
        >
          <span className="truncate" title={arrangement.owner}>{arrangement.owner}</span>
          <span className="truncate" title={arrangement.id}>{arrangement.id}</span>
          <span className="ml-auto shrink-0">read-only spans</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 text-[10px] text-muted-foreground">
          <span>rate {arrangement.rate}</span>
          <span>source offset {arrangement.source_offset_s}s</span>
          <span>gain {arrangement.gain.linear} / {arrangement.gain.db} dB</span>
          {canEdit && (
            <span className="ml-auto inline-flex items-center gap-1">
              <label className="sr-only" htmlFor={`audio-lane-gain-${arrangement.id}`}>
                Chosen owner gain for {arrangement.owner}
              </label>
              <input
                id={`audio-lane-gain-${arrangement.id}`}
                aria-label={`Chosen owner gain for ${arrangement.owner}`}
                type="number"
                step="any"
                value={gainValue}
                onChange={(event) => setGainValue(event.currentTarget.value)}
                className="h-6 w-20 rounded border border-border bg-background px-1 text-[10px] text-foreground"
              />
              <button
                type="button"
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground hover:bg-accent"
                onClick={applyGain}
                disabled={!Number.isFinite(Number(gainValue))}
              >
                Apply owner gain
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="flex border-b border-border/20" style={{ height: SPAN_BAR_HEIGHT }}>
        <div
          className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border/30 bg-card px-2 text-[10px] text-muted-foreground"
          style={{ width: LABEL_WIDTH }}
        >
          Supplied spans
        </div>
        <div className="relative min-w-0 flex-1">
          {arrangement.spans.map((span) => {
            const details = `ID ${span.id}; timeline ${span.timeline.start_s}–${span.timeline.end_s}s `
              + `(${span.timeline.start_frame}–${span.timeline.end_frame} frames); `
              + `source ${span.source.start_s}–${span.source.end_s}s; `
              + `gain ${span.gain.linear} / ${span.gain.db} dB; asset ${span.asset}; read-only`;
            return (
              <div
                key={span.id}
                role="img"
                aria-readonly="true"
                aria-label={details}
                title={details}
                data-testid="audio-lane-generated-span"
                data-audio-lane-span-id={span.id}
                data-readonly="true"
                className="absolute top-1 flex h-6 items-center overflow-hidden rounded border border-sky-300/60 bg-sky-500/25 px-1.5 text-[10px] text-sky-50"
                style={{
                  left: span.timeline.start_s * pixelsPerSecond,
                  width: Math.max(2, (span.timeline.end_s - span.timeline.start_s) * pixelsPerSecond),
                }}
              >
                <span className="truncate">{span.id}</span>
              </div>
            );
          })}
        </div>
      </div>

      {arrangement.spans.map((span) => (
        <div
          key={`${span.id}:details`}
          className="flex border-b border-border/20 text-[10px] leading-5 text-muted-foreground"
          style={{ minHeight: SPAN_DETAIL_HEIGHT }}
          data-audio-lane-span-details={span.id}
          data-testid={`audio-lane-span-details-${span.id}`}
        >
          <div
            className="sticky left-0 z-10 shrink-0 border-r border-border/30 bg-card"
            style={{ width: LABEL_WIDTH }}
          />
          <div className="min-w-0 flex-1 truncate px-2" title={span.id}>
            {span.id} · source {span.source.start_s}–{span.source.end_s}s · gain {span.gain.linear} / {span.gain.db} dB
          </div>
        </div>
      ))}
    </section>
  );
}

function SwitchRow({
  value,
  pixelsPerSecond,
}: {
  value: Extract<AudioLanePresentation, { status: 'available' }>['lane']['switches'][number];
  pixelsPerSecond: number;
}) {
  const details = `${value.id}: ${value.from_arrangement} → ${value.to_arrangement}; `
    + `center ${value.on.center_s}s (frame ${value.on.center_frame}) at ${value.on.time_ref}; `
    + `overlap ${value.window.start_s}–${value.window.end_s}s `
    + `(frames ${value.window.start_frame}–${value.window.end_frame}); curve ${value.curve}`;
  return (
    <div className="flex border-t border-border/20" style={{ height: MARKER_ROW_HEIGHT }} data-audio-lane-switch={value.id} data-testid={`audio-lane-switch-${value.id}`}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border/30 bg-card px-2 text-[10px] text-muted-foreground"
        style={{ width: LABEL_WIDTH }}
      >
        Switch
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden" title={details}>
        <div
          className="absolute inset-y-1 rounded border border-violet-300/60 bg-violet-500/20"
          style={{
            left: value.window.start_s * pixelsPerSecond,
            width: Math.max(2, (value.window.end_s - value.window.start_s) * pixelsPerSecond),
          }}
        />
        <span className="relative z-10 block truncate px-2 text-[10px] leading-7 text-foreground">{details}</span>
      </div>
    </div>
  );
}

function SeamRow({
  value,
  pixelsPerSecond,
}: {
  value: Extract<AudioLanePresentation, { status: 'available' }>['lane']['seams'][number];
  pixelsPerSecond: number;
}) {
  const details = `Seam frame ${value.frame} at ${value.at_s}s · ${value.action} · delta ${value.delta_s}s · duration ${value.duration_s}s`;
  return (
    <div className="flex border-t border-border/20" style={{ height: MARKER_ROW_HEIGHT }} data-audio-lane-seam={value.frame} data-testid={`audio-lane-seam-${value.frame}`}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border/30 bg-card px-2 text-[10px] text-muted-foreground"
        style={{ width: LABEL_WIDTH }}
      >
        Seam
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden" title={details}>
        <div
          className="absolute inset-y-1 w-px bg-amber-300"
          style={{ left: value.at_s * pixelsPerSecond }}
        />
        <span className="relative z-10 block truncate px-2 text-[10px] leading-7 text-foreground">{details}</span>
      </div>
    </div>
  );
}

export function AudioLanePresentationList({
  presentation,
  pixelsPerSecond,
  onEditOwnerGain,
}: AudioLanePresentationListProps) {
  if (!presentation) return null;

  if (presentation.status === 'no-bed') {
    return (
      <div
        role="status"
        data-testid="audio-lane-no-bed"
        className="flex border-t border-border/40 bg-card/40 text-[10px] text-muted-foreground"
        style={{ minHeight: MARKER_ROW_HEIGHT }}
      >
        <div
          className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border/30 bg-card px-2 font-medium"
          style={{ width: LABEL_WIDTH }}
        >
          Generated audio
        </div>
        <div className="flex min-w-0 flex-1 items-center px-2">No adopted audio bed in this revision</div>
      </div>
    );
  }

  if (presentation.status === 'unavailable') {
    return (
      <div
        role="status"
        data-testid="audio-lane-unavailable"
        className="flex border-t border-amber-400/40 bg-amber-500/5 text-[10px] text-amber-100"
        style={{ minHeight: MARKER_ROW_HEIGHT }}
      >
        <div
          className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border/30 bg-card px-2 font-medium"
          style={{ width: LABEL_WIDTH }}
        >
          Audio lane
        </div>
        <div className="flex min-w-0 flex-1 items-center truncate px-2" title={presentation.reason}>
          Unavailable: {presentation.reason}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="audio-lane-presentation" role="group" aria-label="Generated audio lane">
      <div className="flex border-t border-border/40 bg-card/70" style={{ height: HEADER_HEIGHT }}>
        <div
          className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border/30 bg-card px-2 text-[10px] font-medium text-foreground"
          style={{ width: LABEL_WIDTH }}
        >
          Generated audio
        </div>
        <div className="flex items-center gap-2 px-2 text-[10px] text-muted-foreground">
          <span>Read-only projection</span>
          <span>revision {presentation.binding.revisionId}</span>
          <span>snapshot {presentation.binding.snapshotDigest}</span>
        </div>
      </div>
      {presentation.lane.arrangements.map((arrangement) => (
        <ArrangementRow
          key={arrangement.id}
          arrangement={arrangement}
          pixelsPerSecond={pixelsPerSecond}
          onEditOwnerGain={onEditOwnerGain}
        />
      ))}
      {presentation.lane.switches.map((value) => (
        <SwitchRow key={value.id} value={value} pixelsPerSecond={pixelsPerSecond} />
      ))}
      {presentation.lane.seams.map((value, index) => (
        <SeamRow key={`${value.frame}:${index}`} value={value} pixelsPerSecond={pixelsPerSecond} />
      ))}
    </div>
  );
}
