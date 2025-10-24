import React from 'react';
import { Circle, ArrowRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface AnnotationModeToggleProps {
  mode: 'circle' | 'arrow' | null;
  onChange: (mode: 'circle' | 'arrow' | null) => void;
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
        onClick={() => onChange('circle')}
        className={cn(
          "flex-1 flex items-center justify-center py-1 rounded transition-all",
          textSize,
          mode === 'circle'
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Circle className="h-3 w-3" />
      </button>
      <button
        onClick={() => onChange('arrow')}
        className={cn(
          "flex-1 flex items-center justify-center py-1 rounded transition-all",
          textSize,
          mode === 'arrow'
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
};

