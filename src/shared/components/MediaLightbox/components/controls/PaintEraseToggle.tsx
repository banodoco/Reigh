import React from 'react';
import { Paintbrush, Eraser } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

interface PaintEraseToggleProps {
  isEraseMode: boolean;
  onToggle: (isErasing: boolean) => void;
  variant: 'tablet' | 'mobile';
}

export const PaintEraseToggle: React.FC<PaintEraseToggleProps> = ({
  isEraseMode,
  onToggle,
  variant,
}) => {
  const isTablet = variant === 'tablet';
  
  if (isTablet) {
    // Tablet: Two-button toggle
    return (
      <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
        <button
          onClick={() => onToggle(false)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-all",
            !isEraseMode 
              ? "bg-primary text-primary-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Paintbrush className="h-3 w-3" />
          Paint
        </button>
        <button
          onClick={() => onToggle(true)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-all",
            isEraseMode 
              ? "bg-purple-600 text-white shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Eraser className="h-3 w-3" />
          Erase
        </button>
      </div>
    );
  }
  
  // Mobile: Single toggle button
  return (
    <Button
      variant={isEraseMode ? "default" : "secondary"}
      size="sm"
      onClick={() => onToggle(!isEraseMode)}
      className={cn(
        "w-full text-xs h-6",
        isEraseMode && "bg-purple-600 hover:bg-purple-700"
      )}
    >
      <Eraser className="h-3 w-3 mr-1" />
      {isEraseMode ? 'Erase' : 'Paint'}
    </Button>
  );
};

