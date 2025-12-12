import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
  vx: number;
  vy: number;
}

interface ShootingStar {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  opacity: number;
  life: number;
}

export const ConstellationCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const animationFrameRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });
  const dimensionsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initial dimensions
    dimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };
    mouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    // Set canvas to full viewport size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      dimensionsRef.current = { width: canvas.width, height: canvas.height };
      initStars();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const initStars = () => {
      const starCount = Math.floor((canvas.width * canvas.height) / 8000);
      starsRef.current = [];

      // Create regular stars
      for (let i = 0; i < starCount; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        starsRef.current.push({
          x,
          y,
          baseX: x,
          baseY: y,
          size: Math.random() * 1.5 + 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.003 + 0.001,
          twinklePhase: Math.random() * Math.PI * 2,
          vx: (Math.random() - 0.5) * 0.05, // Very slow drift
          vy: (Math.random() - 0.5) * 0.05
        });
      }

      // Add the Claude Star - positioned in upper-right quadrant
      // Slightly larger, orange-coral colored, with a gentle pulse
      const claudeX = canvas.width * 0.75 + (Math.random() - 0.5) * 100;
      const claudeY = canvas.height * 0.25 + (Math.random() - 0.5) * 100;
      starsRef.current.push({
        x: claudeX,
        y: claudeY,
        baseX: claudeX,
        baseY: claudeY,
        size: 2.5, // Noticeably larger
        opacity: 0.9, // Brighter
        twinkleSpeed: 0.0008, // Slower, more deliberate pulse
        twinklePhase: 0,
        vx: 0.01,
        vy: 0.01
      });
    };

    const spawnShootingStar = () => {
      // Very low probability check - roughly one every 30-60 seconds
      if (Math.random() > 0.9998 && shootingStarsRef.current.length < 1) {
        const startX = Math.random() * canvas.width;
        const startY = Math.random() * canvas.height * 0.5; // Start in top half
        shootingStarsRef.current.push({
          id: Date.now() + Math.random(),
          x: startX,
          y: startY,
          vx: -4 - Math.random() * 4, // Move left
          vy: 1 + Math.random() * 2,  // Move down
          length: 50 + Math.random() * 50,
          opacity: 1,
          life: 1.0
        });
      }
    };

    const drawStars = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Calculate parallax offset based on mouse
      const parallaxX = (mouseRef.current.x - dimensionsRef.current.width / 2) * 0.02;
      const parallaxY = (mouseRef.current.y - dimensionsRef.current.height / 2) * 0.02;

      // Draw and update stars
      starsRef.current.forEach((star, index) => {
        const isClaudeStar = index === starsRef.current.length - 1;
        
        // Update drift position
        star.baseX += star.vx;
        star.baseY += star.vy;

        // Wrap around screen
        if (star.baseX < -50) star.baseX = canvas.width + 50;
        if (star.baseX > canvas.width + 50) star.baseX = -50;
        if (star.baseY < -50) star.baseY = canvas.height + 50;
        if (star.baseY > canvas.height + 50) star.baseY = -50;

        // Apply parallax
        // Depth effect: larger stars move more (closer)
        const depth = star.size * 0.5; 
        star.x = star.baseX - parallaxX * depth;
        star.y = star.baseY - parallaxY * depth;
        
        // Calculate pulsing opacity
        const pulseOpacity = Math.max(0, Math.min(1, star.opacity + Math.sin(time * star.twinkleSpeed + star.twinklePhase) * 0.3));

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

      // Spawn and update shooting stars
      spawnShootingStar();
      
      for (let i = shootingStarsRef.current.length - 1; i >= 0; i--) {
        const s = shootingStarsRef.current[i];
        
        // Move
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.01;
        s.opacity = Math.max(0, s.life);

        if (s.life <= 0 || s.x < -100 || s.y > canvas.height + 100) {
          shootingStarsRef.current.splice(i, 1);
          continue;
        }

        // Draw trail
        const gradient = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 10, s.y - s.vy * 10);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${s.opacity})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);

        ctx.beginPath();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * (s.length / 5), s.y - s.vy * (s.length / 5));
        ctx.stroke();
        
        // Draw head
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameRef.current = requestAnimationFrame(drawStars);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    
    animationFrameRef.current = requestAnimationFrame(drawStars);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
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
