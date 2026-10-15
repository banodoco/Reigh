import {useEffect, useMemo, useState, type FC, type ReactNode} from 'react';
import {useBufferState, useRemotionEnvironment} from 'remotion';
import {
  applyAudioEnvelope, audioEnvelopeWav, AudioEnvelopeError, compileAudioEnvelope,
  type AudioEnvelope,
} from '@banodoco/timeline-composition/evaluation';
import {getSanitizedMediaTrimProps, getSanitizedPlaybackRate} from '../lib/config-utils.ts';
import type {ResolvedTimelineClip} from '../types/index.ts';
import {playerEvaluationClip} from './playerEvaluation.ts';

type Props = {src: string; clip: ResolvedTimelineClip; fps: number; children: (src: string) => ReactNode};

const EnvelopeSource: FC<Props & {envelope: AudioEnvelope}> = ({src, clip, fps, envelope, children}) => {
  const environment = useRemotionEnvironment();
  const buffer = useBufferState();
  const trimBefore = getSanitizedMediaTrimProps(clip, fps).trimBefore / fps;
  const speed = getSanitizedPlaybackRate(clip.speed);
  const key = JSON.stringify([src, envelope, trimBefore, speed]);
  const [state, setState] = useState<{key: string; url?: string; error?: Error}>();
  const rendering = environment.isRendering || environment.isClientSideRendering;
  useEffect(() => {
    if (rendering) return;
    const pending = buffer.delayPlayback();
    const abort = new AbortController();
    let cancelled = false;
    let url: string | undefined;
    const render = async () => {
      if (typeof AudioContext === 'undefined') throw new AudioEnvelopeError('Web Audio decoding is unavailable', envelope.duck);
      const response = await fetch(src, {signal: abort.signal});
      if (!response.ok) throw new Error(`audio fetch ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (cancelled) return;
      const context = new AudioContext();
      let decoded: AudioBuffer;
      try { decoded = await context.decodeAudioData(bytes); }
      finally { await context.close(); }
      if (cancelled) return;
      const channels = Array.from({length: decoded.numberOfChannels}, (_, index) => decoded.getChannelData(index));
      applyAudioEnvelope(channels, decoded.sampleRate, envelope, trimBefore, speed);
      url = URL.createObjectURL(new Blob([audioEnvelopeWav(channels, decoded.sampleRate)], {type: 'audio/wav'}));
      if (!cancelled) setState({key, url});
    };
    void render().catch((error: unknown) => {
      if (!cancelled) setState({key, error: new AudioEnvelopeError(String(error), envelope.duck)});
    }).finally(pending.unblock);
    return () => { cancelled = true; abort.abort(); pending.unblock(); if (url) URL.revokeObjectURL(url); };
  }, [src, envelope, trimBefore, speed, key, buffer, rendering]);
  // Local PCM URLs cannot be passed to the external encoder. Match the admitted producer's refusal.
  if (rendering) throw new AudioEnvelopeError('sample envelopes require composition-player or ffmpeg', envelope.duck);
  if (state?.key === key && state.error) throw state.error;
  return state?.key === key && state.url ? children(state.url) : null;
};

/** Shared sample gain, resolved browser source, unchanged trim/speed/base volume. */
export const PlayerAudioSource: FC<Props> = (props) => {
  const {clip, fps} = props;
  // Canonical bounds can produce a fresh clip object without changing its audio.
  // Depend on the fields consumed by the shared compiler so playback is not
  // repeatedly blocked/redecoded for identical projected clips.
  const envelope = useMemo(() => compileAudioEnvelope(playerEvaluationClip(clip), fps),
    [playerEvaluationClip(clip).audio, clip.app, clip.params, clip.hold, clip.from, clip.to, clip.speed, clip.clipType, fps]);
  return envelope ? <EnvelopeSource {...props} envelope={envelope} /> : props.children(props.src);
};
