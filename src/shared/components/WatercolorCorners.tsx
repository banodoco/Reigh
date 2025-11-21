import React from 'react';

interface LayerConfig {
  label: string; // Label for debugging/hover
  className: string;
  size: string; // Tailwind or arbitrary px
  position: React.CSSProperties;
  animation: string;
  delay: string;
  opacity?: number;
  blendMode?: React.CSSProperties['mixBlendMode'];
  labelPosition?: React.CSSProperties; // Override position for label
}

export const WatercolorCorners: React.FC = () => {
  // Configuration for Top Right Corner (Cool/Fresh)
  const topRightLayers: LayerConfig[] = [
    { 
      label: 'Mint Wash (Huge)',
      className: 'bg-wes-mint', 
      size: 'w-[900px] h-[900px]', 
      position: { top: '-450px', right: '-450px', transform: 'rotate(15deg)' }, 
      animation: 'animate-drift-slow', 
      delay: '0s',
      opacity: 0.4,
      labelPosition: { top: '20px', right: '20px' }
    },
    { 
      label: 'Lavender Wash (Secondary)',
      className: 'bg-wes-lavender', 
      size: 'w-[700px] h-[700px]', 
      position: { top: '-300px', right: '-300px', transform: 'rotate(10deg)' }, 
      animation: 'animate-drift-medium', 
      delay: '-5s',
      opacity: 0.3,
      labelPosition: { top: '60px', right: '20px' }
    },
    {
        label: 'Coral Tunnel Creator',
        className: 'bg-wes-coral',
        size: 'w-[600px] h-[600px]',
        position: { top: '-500px', right: '200px', transform: 'rotate(20deg)' },
        animation: 'animate-drift-slow', 
        delay: '-10s',
        opacity: 0.15,
        labelPosition: { top: '100px', right: '20px' }
    },
    { 
      label: 'Dark Teal Detail',
      className: 'bg-wes-mint/80', 
      size: 'w-[200px] h-[200px]', 
      position: { top: '50px', right: '50px' }, 
      animation: 'animate-drift-slow', 
      delay: '-2s',
      opacity: 0.4,
      labelPosition: { top: '140px', right: '20px' }
    },
    { 
      label: 'Cream Highlight',
      className: 'bg-wes-cream', 
      size: 'w-[300px] h-[300px]', 
      position: { top: '-50px', right: '-50px' }, 
      animation: 'animate-drift-medium', 
      delay: '-8s',
      opacity: 0.8,
      blendMode: 'overlay',
      labelPosition: { top: '180px', right: '20px' }
    }
  ];

  // Configuration for Bottom Left Corner (Warm/Earthy)
  const bottomLeftLayers: LayerConfig[] = [];

  // Configuration for Left Side (Vertical Edge)
  const leftSideLayers: LayerConfig[] = [];

  // Configuration for Right Side (Vertical Edge)
  const rightSideLayers: LayerConfig[] = [
    {
      label: 'Right Side Mint',
      className: 'bg-wes-mint',
      size: 'w-[600px] h-[600px]',
      position: { bottom: '5%', right: '-450px', transform: 'rotate(-25deg)' }, 
      animation: 'animate-drift-glacial',
      delay: '-14s',
      opacity: 0.18,
      labelPosition: { bottom: '20px', right: '20px' }
    }
  ];

  // Helper to render a layer with tooltip
  const renderLayer = (layer: LayerConfig, idx: number, prefix: string) => (
    // Wrapper Div: Positioning, Hover Target, Events
    <div
      key={`${prefix}-${idx}`}
      className={`absolute group ${layer.animation} pointer-events-auto z-10`}
      style={{
        ...layer.position,
        width: layer.size.split(' ')[0].replace('w-[', '').replace(']', ''),
        height: layer.size.split(' ')[1].replace('h-[', '').replace(']', ''),
        animationDelay: layer.delay,
      }}
    >
      {/* The Blob: Filtered, Colored, Blended */}
      <div 
        className={`w-full h-full watercolor-blob ${layer.className}`}
        style={{
          opacity: layer.opacity,
          mixBlendMode: layer.blendMode || 'multiply',
        }}
      />

      {/* The Label: Fixed position, always visible on screen */}
      <div 
        className="fixed z-[100]"
        style={layer.labelPosition}
      >
        <span className="bg-red-600 text-white text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap border-2 border-yellow-400 font-bold">
          {layer.label}
        </span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <svg className="hidden">
        <defs>
          <filter id="watercolor-complex" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="5" result="noiseWobble" />
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="4" result="noiseMid" />
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noiseGrain" />
            
            <feComposite operator="arithmetic" k1="0.5" k2="0.5" in="noiseWobble" in2="noiseMid" result="noiseMix" />
            
            <feDisplacementMap in="SourceGraphic" in2="noiseMix" scale="60" xChannelSelector="R" yChannelSelector="G" result="displacedSource" />
            <feComposite operator="in" in="noiseGrain" in2="displacedSource" result="texturedSource" />
            <feBlend mode="multiply" in="displacedSource" in2="texturedSource" result="blotchySource" />
            <feComponentTransfer in="blotchySource" result="hardEdge">
              <feFuncA type="linear" slope="3" intercept="-0.2" />
            </feComponentTransfer>
            <feComposite operator="in" in="hardEdge" in2="SourceGraphic" />
          </filter>
        </defs>
      </svg>

      <style>{`
        @keyframes drift-slow {
          0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
          50% { transform: translate(20px, -15px) scale(1.02) rotate(2deg); } 
        }
        @keyframes drift-medium {
          0%, 100% { transform: translate(0, 0) scale(1.05) rotate(0deg); } 
          33% { transform: translate(-15px, 25px) scale(1) rotate(-3deg); }
          66% { transform: translate(15px, -10px) scale(1.08) rotate(1deg); } 
        }
        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.95); }
        }
        @keyframes drift-glacial {
          0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
          50% { transform: translate(10px, 30px) scale(1.02) rotate(1deg); }
        }
        
        .watercolor-blob {
          filter: url(#watercolor-complex);
          /* Irregular organic shape base */
          border-radius: 50% 40% 30% 70% / 60% 30% 70% 40%;
        }

        .animate-drift-slow { animation: drift-slow 18s ease-in-out infinite; }
        .animate-drift-medium { animation: drift-medium 22s ease-in-out infinite; }
        .animate-pulse-organic { animation: pulse-subtle 8s ease-in-out infinite; }
        .animate-drift-glacial { animation: drift-glacial 45s ease-in-out infinite; }
      `}</style>

      {/* {topRightLayers.map((l, i) => renderLayer(l, i, 'tr'))} */}
      {/* {bottomLeftLayers.map((l, i) => renderLayer(l, i, 'bl'))} */}
      {/* {leftSideLayers.map((l, i) => renderLayer(l, i, 'ls'))} */}
      {/* {rightSideLayers.map((l, i) => renderLayer(l, i, 'rs'))} */}
    </div>
  );
};
