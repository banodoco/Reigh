import React from 'react';
import { cn } from '@/shared/lib/utils';

interface FadeInSectionProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}

export const FadeInSection: React.FC<FadeInSectionProps> = ({ children, className, delayMs = 0 }) => (
  <div 
    className={cn('animate-in fade-in duration-300 ease-out', className)}
    style={{ animationDelay: `${delayMs}ms` }}
  >
    {children}
  </div>
); 