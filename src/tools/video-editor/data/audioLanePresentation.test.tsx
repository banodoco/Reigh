import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  audioLanePresentationRevisionMatches,
  readAudioLanePresentation,
  type AudioLanePresentation,
} from './audioLanePresentation.ts';
import { AudioLanePresentationList } from '@/tools/video-editor/components/TimelineEditor/AudioLanePresentationList.tsx';

// This exact file was generated through I013's authoring-bundle adapter and
// Astrid's canonical music-lane producer. The run-owned original is selected
// for assigned verification; this copy keeps local runs reproducible.
const PRODUCER_FIXTURE_PATH = process.env.R4_AUDIO_LANE_PRODUCER_FIXTURE
  ?? path.resolve(process.cwd(), 'tests/fixtures/audio-lane-from-0a797.json');
const producerLane = JSON.parse(readFileSync(PRODUCER_FIXTURE_PATH, 'utf8')) as Record<string, unknown>;
const PROJECT_ID = 'project:opaque-audio-lane';
const TIMELINE_ID = 'timeline:opaque-audio-lane';
const REVISION_ID = 'revision:opaque-audio-lane';
const SNAPSHOT_DIGEST = 'snapshot:opaque-audio-lane';

function inspection(presentation?: unknown, includePresentation = true) {
  return {
    project_id: PROJECT_ID,
    timeline_id: TIMELINE_ID,
    revision_id: REVISION_ID,
    head_revision_id: REVISION_ID,
    snapshot_digest: SNAPSHOT_DIGEST,
    next_cursor: 'page-2',
    ...(includePresentation ? { presentation } : {}),
  };
}

const expected = { projectId: PROJECT_ID, timelineId: TIMELINE_ID, revisionId: REVISION_ID };

describe('canonical audio-lane presentation', () => {
  it('keeps the producer projection bound to opaque inspect identities and preserves the source object', () => {
    const input = structuredClone(producerLane);
    const before = structuredClone(input);
    const result = readAudioLanePresentation(inspection({ audio_lane: input }), expected);

    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected producer lane');
    expect(result.binding).toEqual({
      projectId: PROJECT_ID,
      timelineId: TIMELINE_ID,
      revisionId: REVISION_ID,
      snapshotDigest: SNAPSHOT_DIGEST,
    });
    expect(result.lane.arrangements.flatMap(({ spans }) => spans.map(({ id }) => id)))
      .toEqual((producerLane.arrangements as Array<{ spans: Array<{ id: string }> }>).flatMap(({ spans }) => spans.map(({ id }) => id)));
    expect(Object.isFrozen(result.lane)).toBe(true);
    expect(input).toEqual(before);
    expect(audioLanePresentationRevisionMatches(result, PROJECT_ID, TIMELINE_ID, REVISION_ID)).toBe(true);
    expect(audioLanePresentationRevisionMatches(result, PROJECT_ID, TIMELINE_ID, 'revision:later-head')).toBe(false);
  });

  it('distinguishes supported no-bed null from a missing projection', () => {
    expect(readAudioLanePresentation(inspection({ audio_lane: null }), expected)).toMatchObject({
      status: 'no-bed',
      lane: null,
    });
    expect(readAudioLanePresentation(inspection(undefined, false), expected)).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('did not provide'),
    });
    expect(readAudioLanePresentation(inspection({}), expected)).toMatchObject({
      status: 'unavailable',
    });
  });

  it('refuses malformed, mismatched, and unsupported adopted-bed responses visibly', () => {
    const malformed = structuredClone(producerLane) as {
      arrangements: Array<{ spans: Array<{ read_only: boolean }> }>;
    };
    malformed.arrangements[0]!.spans[0]!.read_only = false;
    expect(readAudioLanePresentation(inspection({ audio_lane: malformed }), expected)).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('malformed or unsupported'),
    });

    expect(readAudioLanePresentation({
      ...inspection({ audio_lane: producerLane }),
      revision_id: 'revision:other',
    }, expected)).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('does not match'),
    });

    expect(readAudioLanePresentation(inspection({
      audio_lane: { code: 'unsupported_capability', message: 'adopted-music-bed is unsupported' },
    }), expected)).toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('adopted-music-bed is unsupported'),
    });
  });

  it('renders producer spans, switches, source windows, gain, and seams in the shared timeline row', () => {
    const presentation = readAudioLanePresentation(inspection({ audio_lane: producerLane }), expected);
    const onOwnerEdit = vi.fn();
    render(<AudioLanePresentationList presentation={presentation} pixelsPerSecond={40} onEditOwnerGain={onOwnerEdit} />);

    const expectedSpans = (producerLane.arrangements as Array<{ spans: Array<{ id: string }> }>).flatMap(
      ({ spans }) => spans.map(({ id }) => id),
    );
    expect(screen.getAllByTestId('audio-lane-generated-span').map((node) => node.getAttribute('data-audio-lane-span-id')))
      .toEqual(expectedSpans);
    for (const span of screen.getAllByTestId('audio-lane-generated-span')) {
      expect(span).toHaveAttribute('aria-readonly', 'true');
      expect(span).toHaveAttribute('data-readonly', 'true');
    }
    expect(screen.getByTestId('audio-lane-span-details-a-music')).toHaveTextContent('source 0–2.125s');
    expect(screen.getByTestId('audio-lane-span-details-a-music')).toHaveTextContent('gain 1 / 0 dB');
    expect(screen.getByTestId('audio-lane-switch-switch-one')).toHaveTextContent('frame 192');
    expect(screen.getByTestId('audio-lane-switch-switch-one')).toHaveTextContent('center 6.4s');
    expect(screen.getByTestId('audio-lane-switch-switch-one')).toHaveTextContent('arrangement-716e02c049e940d1cf5e');
    expect(screen.getByTestId('audio-lane-switch-switch-one')).toHaveTextContent('"SwitchWord" in s1 #1');
    expect(screen.getByTestId('audio-lane-switch-switch-one')).toHaveTextContent('frames 162–222');
    expect(screen.getByTestId('audio-lane-switch-switch-one')).toHaveTextContent('equal-power');
    expect(screen.getByTestId('audio-lane-seam-60')).toHaveTextContent('repeat');
    expect(screen.queryByText(/python3 -m astrid/)).toBeNull();

    const firstOwner = (producerLane.arrangements as Array<{ owner: string }>)[0]!.owner;
    fireEvent.change(screen.getByRole('spinbutton', { name: `Chosen owner gain for ${firstOwner}` }), {
      target: { value: '0.42' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply owner gain' })[0]!);
    expect(onOwnerEdit).toHaveBeenCalledWith(expect.objectContaining({ value: 0.42 }));
    expect(onOwnerEdit.mock.calls[0]?.[0].operation.select).toBe(firstOwner);
  });

  it('shows missing-adapter refusal and explicit supported no-bed status', () => {
    const unavailable = readAudioLanePresentation(inspection(undefined, false), expected);
    const { rerender } = render(<AudioLanePresentationList presentation={unavailable} pixelsPerSecond={40} />);
    expect(screen.getByTestId('audio-lane-unavailable')).toHaveTextContent('Unavailable:');

    const noBed = readAudioLanePresentation(inspection({ audio_lane: null }), expected);
    rerender(<AudioLanePresentationList presentation={noBed} pixelsPerSecond={40} />);
    expect(screen.getByTestId('audio-lane-no-bed')).toHaveTextContent('No adopted audio bed in this revision');
    expect(screen.queryByTestId('audio-lane-generated-span')).toBeNull();
    expect(screen.queryByTestId('audio-lane-unavailable')).toBeNull();
  });

  it('accepts a complete projection on the same inspected revision even when the response is paginated', () => {
    const result: AudioLanePresentation = readAudioLanePresentation(
      inspection({ audio_lane: producerLane }),
      expected,
    );
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    expect(result.binding.revisionId).toBe(REVISION_ID);
    // `next_cursor` belongs to inspect summary rows; the complete lane remains
    // the independent producer output and is not derived from those pages.
    expect(result.lane.arrangements.flatMap(({ spans }) => spans)).toHaveLength(4);
  });

  it('retains an explicitly historical projection when its opaque revision still matches', () => {
    const historical = {
      ...inspection({ audio_lane: producerLane }),
      representation: 'canonical_revision',
      head_revision_id: 'revision:advanced-head',
      is_current_head: false,
    };
    const result = readAudioLanePresentation(historical, expected);
    expect(result.status).toBe('available');
    expect(audioLanePresentationRevisionMatches(result, PROJECT_ID, TIMELINE_ID, REVISION_ID)).toBe(true);
    expect(audioLanePresentationRevisionMatches(result, PROJECT_ID, TIMELINE_ID, 'revision:advanced-head')).toBe(false);
  });
});
