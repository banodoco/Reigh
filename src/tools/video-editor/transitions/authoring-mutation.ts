import {declareAppTransition, prepareDeclaredTrack} from '@banodoco/timeline-composition/evaluation';
import {getClipDurationInFrames, secondsToFrames} from '../lib/config-utils.ts';
import type {TimelineClip, ResolvedTimelineConfig} from '../types/index.ts';
import {canonicalJsonStringify} from '../data/typed/timelineBundle.ts';

const timing = (clip: TimelineClip, fps: number) =>
  [secondsToFrames(clip.at, fps), getClipDurationInFrames(clip, fps), clip.track];

export function admitTransitionRowsMutation(
  before: ResolvedTimelineConfig,
  materialized: ResolvedTimelineConfig,
  metaUpdates: Record<string, {transition?: TimelineClip['transition']}> | undefined,
  host?: string,
): void {
  const previous = new Map(before.clips.map(clip => [clip.id, clip]));
  admitTransitionMutation(before, {...materialized, clips: materialized.clips.map(clip => {
    const patch = metaUpdates?.[clip.id];
    return patch && Object.prototype.hasOwnProperty.call(patch, 'transition')
      ? {...clip, transition: patch.transition}
      : previous.has(clip.id) ? {...clip, transition: previous.get(clip.id)!.transition} : clip;
  })}, host);
}

/** Admission at the existing edit boundary, never on legacy load/repair.
 * Existing transitions are not reinterpreted merely because another property
 * changed. New/changed transitions and timing edits on transition tracks use
 * resolved own spans from the existing clock adapters and the single planner.
 */
export function admitTransitionMutation(
  before: ResolvedTimelineConfig,
  after: ResolvedTimelineConfig,
  host = 'timeline-composition',
): void {
  const old = new Map(before.clips.map(clip => [clip.id, clip]));
  const tracks = new Set<string>();
  const authored = new Set<string>();
  if (before.output.fps !== after.output.fps) {
    for (const clip of after.clips) if (clip.transition && clip.track) tracks.add(clip.track);
  }
  for (const clip of after.clips) {
    const previous = old.get(clip.id);
    if (clip.transition && canonicalJsonStringify(previous?.transition) !== canonicalJsonStringify(clip.transition)) {
      if (!clip.track) declareAppTransition('', clip.id, clip.transition, after.output.fps, host);
      authored.add(clip.id);
      if (clip.track) tracks.add(clip.track);
    }
    if (!previous || JSON.stringify(timing(previous, before.output.fps)) !== JSON.stringify(timing(clip, after.output.fps))) {
      for (const track of [previous?.track, clip.track]) {
        if (track && after.clips.some(item => item.track === track && item.transition)) tracks.add(track);
      }
    }
  }
  // Deleting an interval can change the owner boundary on a transition track.
  const remaining = new Set(after.clips.map(clip => clip.id));
  for (const clip of before.clips) {
    if (!remaining.has(clip.id) && clip.track && after.clips.some(item => item.track === clip.track && item.transition)) {
      tracks.add(clip.track);
    }
  }
  for (const trackId of tracks) {
    if (after.tracks.find(track => track.id === trackId)?.kind === 'audio') continue;
    const clips = after.clips.filter(clip => clip.track === trackId)
      .slice().sort((a, b) => a.at - b.at);
    const declarations = clips.filter(clip => authored.has(clip.id)).map(clip =>
      declareAppTransition(trackId, clip.id, clip.transition!, after.output.fps, host));
    prepareDeclaredTrack(trackId, clips.map(clip => ({
      id: clip.id,
      start: secondsToFrames(clip.at, after.output.fps),
      duration: getClipDurationInFrames(clip, after.output.fps),
    })), declarations, host);
  }
}
