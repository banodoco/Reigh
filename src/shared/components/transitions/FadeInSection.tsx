import React, { useEffect, useRef } from 'react';
import { cn } from '@/shared/lib/utils';

interface FadeInSectionProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}

export const FadeInSection: React.FC<FadeInSectionProps> = ({ children, className, delayMs = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!ref.current) return;
    
    const timer = setTimeout(() => {
      if (ref.current) {
        ref.current.style.opacity = '1';
      }
    }, delayMs);
    
    return () => clearTimeout(timer);
  }, [delayMs]);
  
  return (
    <div 
      ref={ref}
      className={cn(className)}
      style={{ 
        opacity: 0,
        transition: 'opacity 300ms ease-out'
      }}
    >
      {children}
    </div>
  );
}; 