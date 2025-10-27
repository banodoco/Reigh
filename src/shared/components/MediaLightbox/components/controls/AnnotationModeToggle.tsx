import React from 'react';
import { Square } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface AnnotationModeToggleProps {
  mode: 'rectangle' | null;
  onChange: (mode: 'rectangle' | null) => void;
  variant: 'tablet' | 'mobile';
}

export const AnnotationModeToggle: React.FC<AnnotationModeToggleProps> = ({
  mode,
  onChange,
  variant,
}) => {
  const textSize = variant === 'tablet' ? 'text-xs' : 'text-[10px]';
  
  return (
    <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
      <button
        className={cn(
          "flex-1 flex items-center justify-center py-1 rounded transition-all",
          textSize,
          "bg-primary text-primary-foreground shadow-sm"
        )}
        disabled
      >
        <Square className="h-3 w-3" />
      </button>
    </div>
  );
};

