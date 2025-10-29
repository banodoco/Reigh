import React, { useMemo } from "react";
import { PlusCircle, Check } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

export interface ShotOption {
  id: string;
  name: string;
}

export interface ShotSelectorProps {
  // Core selection props
  value: string;
  onValueChange: (value: string) => void;
  shots: ShotOption[];
  placeholder?: string;
  
  // Styling props
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  
  // Add Shot functionality
  showAddShot?: boolean;
  onCreateShot?: () => void;
  isCreatingShot?: boolean;
  
  // Quick create success state
  quickCreateSuccess?: {
    isSuccessful: boolean;
    shotId: string | null;
    shotName: string | null;
  };
  onQuickCreateSuccess?: () => void;
  
  // Additional props for SelectContent
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  
  // Event handlers
  onOpenChange?: (open: boolean) => void;
  container?: HTMLElement | null;
}

export const ShotSelector: React.FC<ShotSelectorProps> = ({
  value,
  onValueChange,
  shots,
  placeholder = "Select shot",
  className,
  triggerClassName,
  contentClassName,
  showAddShot = false,
  onCreateShot,
  isCreatingShot = false,
  quickCreateSuccess,
  onQuickCreateSuccess,
  side = "top",
  align = "start",
  sideOffset = 4,
  onOpenChange,
  container,
}) => {
  
  // Create the "Add Shot" header if needed
  const addShotHeader = useMemo(() => {
    if (!showAddShot || !onCreateShot) return null;
    
    return (
      <div className="bg-zinc-900 border-b border-zinc-700 p-1">
        {quickCreateSuccess?.isSuccessful ? (
          <Button
            variant="secondary"
            size="sm"
            className="w-full h-8 text-xs justify-center bg-zinc-600 hover:bg-zinc-500 text-white border-zinc-500"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[VisitShotDebug] 1. ShotSelector button clicked', {
                quickCreateSuccess,
                hasOnQuickCreateSuccess: !!onQuickCreateSuccess,
                timestamp: Date.now()
              });
              if (onQuickCreateSuccess) {
                onQuickCreateSuccess();
              }
            }}
          >
            <Check className="h-3 w-3 mr-1" />
            Visit {quickCreateSuccess.shotName}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="w-full h-8 text-xs justify-center bg-zinc-600 hover:bg-zinc-500 text-white border-zinc-500"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCreateShot();
            }}
            disabled={isCreatingShot}
          >
            {isCreatingShot ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white mr-1"></div>
                Creating...
              </>
            ) : (
              <>
                <PlusCircle className="h-3 w-3 mr-1" />
                Add Shot
              </>
            )}
          </Button>
        )}
      </div>
    );
  }, [showAddShot, onCreateShot, quickCreateSuccess, onQuickCreateSuccess, isCreatingShot]);

  // Get the display name for the selected shot
  const selectedShotName = useMemo(() => {
    if (!value) return null;
    const shot = shots.find(s => s.id === value);
    return shot?.name || null;
  }, [value, shots]);

  console.log('[ShotSelectorDebug] ShotSelector render:', {
    value,
    selectedShotName,
    shotsCount: shots.length,
    container: container ? 'provided' : 'none'
  });

  return (
    <Select
      value={value}
      onValueChange={(newValue) => {
        console.log('[ShotSelectorDebug] 🎯 Shot selected:', newValue);
        onValueChange(newValue);
      }}
      onOpenChange={(open) => {
        console.log('[ShotSelectorDebug] Dropdown open state changed:', open);
        onOpenChange?.(open);
      }}
    >
      <SelectTrigger
        className={triggerClassName}
        aria-label="Select target shot"
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          console.log('[ShotSelectorDebug] SelectTrigger onPointerDown');
          e.stopPropagation();
        }}
        onClick={(e) => {
          console.log('[ShotSelectorDebug] SelectTrigger onClick');
        }}
      >
        <SelectValue placeholder={placeholder}>
          {selectedShotName && selectedShotName.length > 10 
            ? `${selectedShotName.substring(0, 10)}...` 
            : selectedShotName || placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent 
        header={addShotHeader}
        className={`z-[9999] bg-zinc-900 border-zinc-700 text-white max-h-60 ${contentClassName || ''}`}
        style={{ zIndex: 10000 }}
        position="popper"
        side={side}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        container={container}
      >
        {shots.map(shot => (
          <SelectItem 
            key={shot.id} 
            value={shot.id} 
            className="text-xs"
            onPointerDown={(e) => {
              console.log('[ShotSelectorDebug] SelectItem onPointerDown:', shot.name);
            }}
            onClick={(e) => {
              console.log('[ShotSelectorDebug] SelectItem onClick:', shot.name);
            }}
          >
            {shot.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ShotSelector;
export type { ShotOption, ShotSelectorProps };
