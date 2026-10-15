// @vitest-environment jsdom
import {createHash} from 'node:crypto';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {TimelineRenderer} from './TimelineRenderer.tsx';
import TextCard from '@astrid/packs/rendering/rendering/elements/effects/text-card/component';
import type {ResolvedTimelineConfig} from '../types/index.ts';
import type {AstridElementHost} from '../runtime/astrid-element-host.ts';

const clock = vi.hoisted(() => ({frame:0}));
vi.mock('remotion', async () => {
  const React = await import('react');
  const Frame = React.createContext<number | null>(null);
  const useCurrentFrame = () => React.useContext(Frame) ?? clock.frame;
  return {
    AbsoluteFill: ({children, style, ...props}: any) => <div {...props} style={style}>{children}</div>,
    Sequence: ({children, from=0, durationInFrames}: any) => {
      const frame = useCurrentFrame() - from;
      return frame >= 0 && frame < durationInFrames ? <Frame.Provider value={frame}>{children}</Frame.Provider> : null;
    },
    Freeze: ({children, frame}: any) => <Frame.Provider value={frame}>{children}</Frame.Provider>,
    useCurrentFrame,
    useRemotionEnvironment: () => ({isRendering:false,isClientSideRendering:false}),
    useVideoConfig: () => ({fps:30,width:1280,height:720}),
    interpolate: (value: number, xs: number[], ys: number[], options: any = {}) => {
      let u = (value-xs[0])/(xs[1]-xs[0]);
      if(options.extrapolateLeft==='clamp') u=Math.max(0,u);
      if(options.extrapolateRight==='clamp') u=Math.min(1,u);
      return ys[0]+u*(ys[1]-ys[0]);
    },
    Img: ({src,style}: any) => <img src={src} style={style}/>,
    Easing: {},
  };
});
vi.mock('./AudioAnalysisProvider.tsx', () => ({AudioAnalysisProvider: ({children}: any) => children}));
const host: AstridElementHost = {
  descriptors:[], sequenceRegistry:{},
  resolveComponent: (id, kind) => id==='text-card' && kind==='effect' ? TextCard as any : undefined,
  resolveSequenceClipEntry: () => undefined,
  describeClipCapability: () => undefined,
};
const config: ResolvedTimelineConfig = {
  output:{fps:30,resolution:'1280x720',file:'out.mp4'},theme:'2rp', registry:{},
  tracks:[{id:'V1',kind:'visual',label:'Text and card',scale:.5}],
  clips:[
    {id:'legacy-text',clipType:'text',track:'V1',at:0,hold:2,x:80,y:50,width:500,height:160,
      text:{content:'Legacy text\nSecond line',fontSize:48,bold:true,color:'#fefefe',align:'left'}},
    {id:'legacy-card',clipType:'text-card',track:'V1',at:0,hold:2,x:100,y:300,width:600,height:180,
      params:{content:'Name\nTitle\n@handle',fontSize:36,align:'left'},
      elementRef:{id:'text-card',kind:'effect',packId:'rendering',revision:'fixture'}},
  ],
};

describe('Player legacy text and card preservation', () => {
  it.each([0,12,30,59])('retains exact pre-consumer markup at frame %s', frame => {
    clock.frame=frame;
    const markup=renderToStaticMarkup(<TimelineRenderer config={config} astridElementHost={host}/>);
    // Captured on the assigned d4f09 base with the same injected host and source.
    expect(createHash('sha256').update(markup).digest('hex')).toMatchSnapshot();
    expect((markup.match(/scale\(0.5\)/g) ?? []).length).toBe(1);
    expect(markup).toContain('Legacy text');
    expect(markup).toContain('Name');
  });
});


describe('Player component transition preservation', () => {
  it('retains injected component transition metadata when its audio internals are undeclared', () => {
    const Probe = ({clip}: any) => <span data-clip={clip.id} data-transition={clip.transition?.type}/>;
    const injected: AstridElementHost = {...host,resolveComponent: () => Probe};
    clock.frame=75;
    const input: ResolvedTimelineConfig = {...config,clips:[
      {...config.clips[1],id:'outgoing',at:0},
      {...config.clips[1],id:'incoming',at:2,transition:{type:'crossfade',duration:1}},
    ]};
    const markup=renderToStaticMarkup(<TimelineRenderer config={input} astridElementHost={injected}/>);
    expect(markup).toContain('data-clip="incoming" data-transition="crossfade"');
  });
});


describe('Player shared native transition drawing', () => {
  it('uses scene opacity once, one track transform and the half-open own boundary', () => {
    const input: ResolvedTimelineConfig = {...config,clips:[0,1].map(index => ({
      id:`occurrence-${index}/picture`,track:'V1',clipType:'media',at:index*2,hold:2,asset:`media-${index}`,
      assetEntry:{file:`private-${index}.jpg`,src:`https://assets.test/resolved-${index}.jpg`,type:'image/jpeg'},
      ...(index===1 ? {transition:{type:'crossfade',duration:1}} : {}),
    }))};
    clock.frame=45;
    const overlap=renderToStaticMarkup(<TimelineRenderer config={input} astridElementHost={host}/>);
    expect(overlap).toContain('https://assets.test/resolved-0.jpg');
    expect(overlap).toContain('https://assets.test/resolved-1.jpg');
    expect((overlap.match(/opacity:0.5/g) ?? []).length).toBe(1);
    expect((overlap.match(/scale\(0.5\)/g) ?? []).length).toBe(1);
    clock.frame=60;
    const boundary=renderToStaticMarkup(<TimelineRenderer config={input} astridElementHost={host}/>);
    expect(boundary).not.toContain('resolved-0.jpg');
    expect(boundary).toContain('resolved-1.jpg');
    clock.frame=120;
    const end=renderToStaticMarkup(<TimelineRenderer config={input} astridElementHost={host}/>);
    expect(end).not.toContain('resolved-1.jpg');
  });
});
