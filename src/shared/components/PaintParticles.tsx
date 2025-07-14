import React from 'react';

export const PaintParticles: React.FC = () => {
  return (
    <div className="absolute left-4 z-0" style={{ bottom: '1px' }}>
      {/* Clockwise circle starting from bottom (6 o'clock) - smaller start */}
      <div className="absolute bg-white rounded-full opacity-0 group-hover:animate-paint-particle-1" style={{ bottom: '-2px', left: '2px', width: '2px', height: '2px' }}></div>
      
      {/* Bottom-right (4:30) - slightly smaller */}
      <div className="absolute bg-white/80 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-1" style={{ bottom: '0px', left: '4px', width: '3px', height: '3px' }}></div>
      
      {/* Right (3 o'clock) - getting smaller */}
      <div className="absolute bg-white/75 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-2" style={{ bottom: '3px', left: '6px', width: '3px', height: '3px' }}></div>
      
      {/* Top-right (1:30) - smaller */}
      <div className="absolute bg-white/70 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-3" style={{ bottom: '6px', left: '4px', width: '2px', height: '2px' }}></div>
      
      {/* Top (12 o'clock) - tiny */}
      <div className="absolute bg-white/65 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-4" style={{ bottom: '8px', left: '2px', width: '2px', height: '2px' }}></div>
      
      {/* Top-left (10:30) - very tiny */}
      <div className="absolute bg-white/60 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-5" style={{ bottom: '6px', left: '0px', width: '2px', height: '2px' }}></div>
      
      {/* Left (9 o'clock) - tiniest */}
      <div className="absolute bg-white/55 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-6" style={{ bottom: '3px', left: '-2px', width: '1px', height: '1px' }}></div>
      
      {/* Bottom-left (7:30) - smallest */}
      <div className="absolute bg-white/50 rounded-full opacity-0 group-hover:animate-paint-particle-2" style={{ bottom: '0px', left: '0px', width: '1px', height: '1px' }}></div>
      
      {/* Additional inner circle particles for more complexity - tiny sizes */}
      <div className="absolute bg-white/45 rounded-full opacity-0 group-hover:animate-paint-particle-3" style={{ bottom: '1px', left: '3px', width: '2px', height: '2px' }}></div>
      <div className="absolute bg-white/40 rounded-full opacity-0 group-hover:animate-paint-particle-fractal-1" style={{ bottom: '4px', left: '1px', width: '1px', height: '1px' }}></div>
    </div>
  );
}; 