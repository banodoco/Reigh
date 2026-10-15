// @vitest-environment jsdom
import {render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {VisualClip, VisualClipSequence} from './VisualClip.tsx';
import {PlayerClipEvaluationContext} from './PlayerClipSequence.tsx';
import {preparePlayerTrack} from './playerEvaluation.ts';
import {PlayerAudioSource} from './PlayerAudioSource.tsx';
import type {ResolvedTimelineClip} from '../types/index.ts';

const host = vi.hoisted(() => ({rendering:false, unblock:vi.fn(), delay:vi.fn()}));
vi.mock('remotion', () => ({
  useRemotionEnvironment: () => ({isRendering:host.rendering,isClientSideRendering:false}),
  useBufferState: () => buffer,
  Sequence: ({children}: any) => <>{children}</>,
  Freeze: ({children}: any) => <div data-frozen="true">{children}</div>,
  AbsoluteFill: ({children, style}: any) => <div style={style}>{children}</div>,
  Audio: ({src, volume, trimBefore, playbackRate}: any) => <audio data-testid="video-sound" src={src} data-volume={volume} data-trim={trimBefore} data-speed={playbackRate}/>,
  useVideoConfig: () => ({width:1280,height:720,fps:30}),
  useCurrentFrame: () => 0,
  interpolate: () => 1,
  Easing: {},
}));
vi.mock('./ReadinessVideo.tsx', () => ({ReadinessVideo: ({src, volume, muted, trimBefore, playbackRate}: any) =>
  <video data-testid="video-picture" src={src} data-volume={volume} data-muted={String(muted)} data-trim={trimBefore} data-speed={playbackRate}/>}));
const buffer = {delayPlayback: () => {host.delay();return {unblock:host.unblock};}};
const clip: ResolvedTimelineClip = {id:'sound',track:'A1',clipType:'media',at:2,from:1,to:5,speed:2,
  params:{fadeIn:1,fadeOut:1}};
let pcm: Float32Array;
let wav: Blob | undefined;
const BrowserURL = URL;
const close=vi.fn();
const revoke=vi.fn();
const create=vi.fn((blob: Blob) => {wav=blob;return 'blob:sample-gain';});

beforeEach(() => {
  host.rendering=false;host.unblock.mockClear();host.delay.mockClear();close.mockClear();revoke.mockClear();create.mockClear();
  pcm=new Float32Array(40).fill(1);wav=undefined;
  vi.stubGlobal('fetch',vi.fn(async () => ({ok:true,arrayBuffer:async () => new ArrayBuffer(0)})));
  vi.stubGlobal('AudioContext',class {
    close=close;
    async decodeAudioData() {return {sampleRate:8,numberOfChannels:1,getChannelData:() => pcm};}
  });
  vi.stubGlobal('URL',Object.assign(class extends BrowserURL {},{createObjectURL:create,revokeObjectURL:revoke}));
});
afterEach(() => vi.unstubAllGlobals());
const renderAudio = (input=clip) => render(<PlayerAudioSource src="https://assets.test/voice.mp4" clip={input} fps={30}>
  {src => <audio data-testid="sound" src={src}/>}
</PlayerAudioSource>);

describe('Player sample audio consumer', () => {
  it('uses real shared sample gain with source trim and speed, then revokes the local WAV', async () => {
    const view=renderAudio();
    expect(screen.queryByTestId('sound')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('sound')).toHaveAttribute('src','blob:sample-gain'));
    expect(pcm[8]).toBe(0); // source 1s = timeline own 0
    expect(pcm[12]).toBeCloseTo(.25); // source 1.5s = own .25s
    expect(pcm[24]).toBe(1); // source 3s = own 1s
    expect(pcm[32]).toBeCloseTo(.5); // source 4s = own 1.5s
    expect(wav?.type).toBe('audio/wav');
    expect(wav?.size).toBe(44+pcm.length*4);
    expect(close).toHaveBeenCalledTimes(1);
    expect(host.delay).toHaveBeenCalledTimes(1);
    expect(host.unblock).toHaveBeenCalled();
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:sample-gain');
  });

  it('leaves plain audio sources and native base volume/trim semantics untouched', () => {
    renderAudio({...clip,params:{}});
    expect(screen.getByTestId('sound')).toHaveAttribute('src','https://assets.test/voice.mp4');
    expect(fetch).not.toHaveBeenCalled();
    expect(host.delay).not.toHaveBeenCalled();
  });

  it('does not re-decode an identical projected clip when its object identity changes', async () => {
    const view=renderAudio();
    await waitFor(() => expect(screen.getByTestId('sound')).toBeInTheDocument());
    view.rerender(<PlayerAudioSource src="https://assets.test/voice.mp4" clip={{...clip}} fps={30}>
      {src => <audio data-testid="sound" src={src}/>}
    </PlayerAudioSource>);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(host.delay).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sound')).toHaveAttribute('src','blob:sample-gain');
  });

  it('applies compiled envelopes rather than deriving a different params envelope', async () => {
    renderAudio({...clip,audio:{envelope:{keyframes:[{at:0,value:.2}]}}});
    await waitFor(() => expect(screen.getByTestId('sound')).toBeInTheDocument());
    expect(pcm.every(sample => Math.abs(sample-.2)<1e-6)).toBe(true);
  });

  it('cancels stale source decoding and never exposes a previous source URL', async () => {
    let complete: (value: unknown) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => {complete=resolve;}));
    const view=renderAudio();
    const signal=vi.mocked(fetch).mock.calls[0][1]?.signal;
    view.rerender(<PlayerAudioSource src="https://assets.test/replaced.mp3" clip={clip} fps={30}>
      {src => <audio data-testid="sound" src={src}/>}
    </PlayerAudioSource>);
    expect(signal?.aborted).toBe(true);
    complete({ok:true,arrayBuffer:async () => new ArrayBuffer(0)});
    await waitFor(() => expect(screen.getByTestId('sound')).toHaveAttribute('src','blob:sample-gain'));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    {audio:{envelope:{keyframes:[{at:0,value:1,curve:'unknown'}]}}},
    {app:{duck:{amount:.5}}},
  ])('refuses invalid or uncompiled audio rather than playing it unfaded', extra => {
    const consoleError=vi.spyOn(console,'error').mockImplementation(() => {});
    try {expect(() => renderAudio({...clip,...extra})).toThrow(/ENVELOPE_UNRENDERED|DUCK_UNRENDERED/);}
    finally {consoleError.mockRestore();}
  });

  it('refuses local PCM envelopes for external encoder rendering', () => {
    host.rendering=true;
    const consoleError=vi.spyOn(console,'error').mockImplementation(() => {});
    try {expect(() => renderAudio()).toThrow('sample envelopes require composition-player or ffmpeg');}
    finally {consoleError.mockRestore();}
    expect(fetch).not.toHaveBeenCalled();
  });
});


describe('Player embedded video sample audio', () => {
  it.each(['contain','manual'] as const)('keeps %s video pictures and applies one sample audio stream', async fit => {
    render(<VisualClip clip={{...clip,clipType:'media',volume:.5,
      assetEntry:{file:'private-original.mp4',src:'https://assets.test/resolved.mp4',type:'video/mp4'}}}
      track={{id:'V1',kind:'visual',label:'Video',fit,volume:.4}} fps={30}/>);
    await waitFor(() => expect(screen.getByTestId('video-picture')).toBeInTheDocument());
    expect(screen.getByTestId('video-picture')).toHaveAttribute('src','https://assets.test/resolved.mp4');
    expect(screen.getByTestId('video-picture')).toHaveAttribute('data-muted','true');
    expect(screen.getByTestId('video-picture')).toHaveAttribute('data-volume','0');
    expect(screen.getAllByTestId('video-sound')).toHaveLength(1);
    expect(screen.getByTestId('video-sound')).toHaveAttribute('src','blob:sample-gain');
    expect(screen.getByTestId('video-sound')).toHaveAttribute('data-volume','0.2');
    expect(screen.getByTestId('video-sound')).toHaveAttribute('data-trim','30');
    expect(screen.getByTestId('video-sound')).toHaveAttribute('data-speed','2');
  });
});


it('keeps native transition audio outside the frozen picture clock', async () => {
  const incoming={...clip,at:2,asset:'video',assetEntry:{src:'https://assets.test/voice.mp4',type:'video/mp4'},
    transition:{type:'crossfade',duration:1}};
  const track={id:'A1',kind:'visual' as const,label:'Picture',volume:.5};
  const prepared=preparePlayerTrack(track,[{...incoming,id:'outgoing',at:0,transition:undefined},incoming],30,1280,720);
  render(<PlayerClipEvaluationContext.Provider value={{clipId:incoming.id,plan:prepared.scene.tracks[0].prepared.plans[1]}}>
    <VisualClipSequence clip={{...incoming,transition:undefined}} track={track} fps={30}/>
  </PlayerClipEvaluationContext.Provider>);
  await waitFor(() => expect(screen.getByTestId('video-sound')).toBeInTheDocument());
  expect(screen.getByTestId('video-sound').closest('[data-frozen]')).toBeNull();
  expect(screen.getByTestId('video-picture').closest('[data-frozen]')).not.toBeNull();
  expect(screen.getByTestId('video-picture')).toHaveAttribute('data-muted','true');
  expect(fetch).toHaveBeenCalledTimes(1);
});
