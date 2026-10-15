import { PlayerAudioSource } from './PlayerAudioSource.tsx';
import { memo, useState, type FC } from 'react';
import { Audio as Html5Audio, Sequence, useRemotionEnvironment } from 'remotion';
import { Audio as MediaAudio } from '@remotion/media';
import {
  getClipDurationInFrames,
  getSanitizedMediaSrc,
  getSanitizedMediaTrimProps,
  getSanitizedPlaybackRate,
  getSanitizedVolume,
  secondsToFrames,
} from '@/tools/video-editor/lib/config-utils.ts';
import { MediaErrorBoundary } from '@/tools/video-editor/compositions/MediaErrorBoundary.tsx';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types/index.ts';
import { boundCanonicalClipToOccurrence } from '@/tools/video-editor/lib/canonicalRenderBounds.ts';

const PreviewAudio: FC<{
  src: string;
  trimBefore: number;
  trimAfter?: number;
  playbackRate: number;
  volume: number;
}> = (props) => {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <div
        role="alert"
        data-media-state="error"
        style={{ position: 'absolute', bottom: 8, left: 8, padding: '4px 8px', background: '#18181b', color: '#fff', fontSize: 14 }}
      >
        Audio unavailable.{' '}
        <button type="button" onClick={() => {
          setAttempt((previous) => previous + 1);
          setFailed(false);
        }}>Retry audio</button>
      </div>
    );
  }

  return (
    <Html5Audio
      key={attempt}
      {...props}
      // Keep underruns non-blocking in the interactive player.
      pauseWhenBuffering={false}
      onErrorCapture={() => setFailed(true)}
    />
  );
};

const AudioTrackComponent: FC<{
  track: TrackDefinition;
  clips: ResolvedTimelineClip[];
  fps: number;
}> = ({ track, clips, fps }) => {
  const environment = useRemotionEnvironment();
  const isRendering = environment.isRendering || environment.isClientSideRendering;

  return (
    <>
      {clips.map((clip) => {
        const boundedClip = boundCanonicalClipToOccurrence(clip);
        if (!boundedClip) return null;
        const renderClip = boundedClip;
        const mediaSrc = getSanitizedMediaSrc(renderClip.assetEntry?.src);
        const assetType = renderClip.assetEntry?.type?.toLowerCase() ?? '';
        // Astrid's registry uses both MIME types (for example audio/mpeg) and
        // the canonical media-family values (audio/video). Treat both forms
        // as playable here; otherwise generic `audio` entries silently vanish
        // while later clips with MIME metadata still play.
        const isPlayableAudio = assetType === 'audio'
          || assetType === 'video'
          || assetType.startsWith('audio/')
          || assetType.startsWith('video/');
        const effectiveVolume = track.muted ? 0 : getSanitizedVolume(track.volume) * getSanitizedVolume(renderClip.volume);
        const playbackRate = getSanitizedPlaybackRate(renderClip.speed);
        const trimProps = getSanitizedMediaTrimProps(renderClip, fps);

        return (
          <Sequence
            // Remotion's Sequence + Audio timing is not fully updated by prop changes during playback,
            // so audio clips need a remount whenever timing or playback-rate inputs change.
            key={`${renderClip.id}-${renderClip.at}-${renderClip.from ?? 0}-${renderClip.to ?? ''}-${renderClip.speed ?? 1}`}
            from={secondsToFrames(renderClip.at, fps)}
            durationInFrames={getClipDurationInFrames(renderClip, fps)}
            premountFor={renderClip.app?.canonicalTiming ? 0 : fps}
          >
            {mediaSrc && isPlayableAudio ? (
              <PlayerAudioSource src={mediaSrc} clip={renderClip} fps={fps}>{(audioSrc) => (
                <MediaErrorBoundary
                  clipId={renderClip.id}
                  resetKey={`${renderClip.id}:${audioSrc}:${trimProps.trimBefore}:${trimProps.trimAfter ?? 'none'}:${playbackRate}:${effectiveVolume}:audio`}
                  fallback={null}
                >
                  {isRendering ? (
                    <MediaAudio
                      src={audioSrc}
                      trimBefore={trimProps.trimBefore}
                      trimAfter={trimProps.trimAfter}
                      playbackRate={playbackRate}
                      volume={effectiveVolume}
                      pauseWhenBuffering={false}
                    />
                  ) : (
                    <PreviewAudio
                      key={JSON.stringify([
                        renderClip.id,
                        audioSrc,
                        renderClip.at,
                        trimProps.trimBefore,
                        trimProps.trimAfter,
                        playbackRate,
                        getClipDurationInFrames(renderClip, fps),
                        fps,
                      ])}
                      src={audioSrc}
                      trimBefore={trimProps.trimBefore}
                      trimAfter={trimProps.trimAfter}
                      playbackRate={playbackRate}
                      volume={effectiveVolume}
                    />
                  )}
                </MediaErrorBoundary>
              )}</PlayerAudioSource>
            ) : null}
          </Sequence>
        );
      })}
    </>
  );
};

export const AudioTrack = memo(AudioTrackComponent);
AudioTrack.displayName = 'AudioTrack';
