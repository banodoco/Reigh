import React from 'react';

export const PaintParticles: React.FC = () => {
  return (
    <div className="absolute left-4 z-0 pointer-events-none" style={{ bottom: '1px' }}>
      {/* Straight diagonal line going up and to the right */}
<div className="absolute bg-foreground rounded-full opacity-0 group-hover:animate-paint-particle-1" style={{ bottom: '-2px', left: '2px', width: '2px', height: '2px' }}></div>

      {/* Second particle in straight trajectory */}
      <div className="absolute bg-foreground/80 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-1" style={{ bottom: '0px', left: '4px', width: '1.5px', height: '1.5px' }}></div>

      {/* Third particle continuing straight trajectory */}
      <div className="absolute bg-foreground/60 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-2" style={{ bottom: '2px', left: '6px', width: '1px', height: '1px' }}></div>
    </div>
  );
}; 