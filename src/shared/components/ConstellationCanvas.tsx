import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

export const ConstellationCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas to full viewport size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      const starCount = Math.floor((canvas.width * canvas.height) / 8000);
      starsRef.current = [];

      // Create regular stars
      for (let i = 0; i < starCount; i++) {
        starsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          twinklePhase: Math.random() * Math.PI * 2,
        });
      }

      // Add the Claude Star - positioned in upper-right quadrant
      // Slightly larger, orange-coral colored, with a gentle pulse
      starsRef.current.push({
        x: canvas.width * 0.75 + (Math.random() - 0.5) * 100,
        y: canvas.height * 0.25 + (Math.random() - 0.5) * 100,
        size: 2.5, // Noticeably larger
        opacity: 0.9, // Brighter
        twinkleSpeed: 0.0008, // Slower, more deliberate pulse (2.6 second cycle)
        twinklePhase: 0,
      });
    };

    const drawStars = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      starsRef.current.forEach((star, index) => {
        const isClaudeStar = index === starsRef.current.length - 1;
        
        // Calculate pulsing opacity
        const pulseOpacity = star.opacity + Math.sin(time * star.twinkleSpeed + star.twinklePhase) * 0.3;

        ctx.beginPath();
        
        if (isClaudeStar) {
          // Claude Star: warm orange-coral with subtle glow
          const glowSize = star.size + Math.sin(time * star.twinkleSpeed) * 0.5;
          
          // Outer glow
          const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowSize * 3);
          gradient.addColorStop(0, `rgba(255, 126, 95, ${pulseOpacity})`); // Orange-coral core
          gradient.addColorStop(0.3, `rgba(255, 146, 115, ${pulseOpacity * 0.6})`);
          gradient.addColorStop(1, 'rgba(255, 166, 135, 0)');
          
          ctx.fillStyle = gradient;
          ctx.arc(star.x, star.y, glowSize * 3, 0, Math.PI * 2);
          ctx.fill();
          
          // Bright center
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 126, 95, ${pulseOpacity})`;
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Regular stars: soft white/blue
          ctx.fillStyle = `rgba(255, 255, 255, ${pulseOpacity})`;
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      animationFrameRef.current = requestAnimationFrame(drawStars);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    animationFrameRef.current = requestAnimationFrame(drawStars);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ 
        mixBlendMode: 'screen',
        opacity: 0.6 
      }}
    />
  );
};

