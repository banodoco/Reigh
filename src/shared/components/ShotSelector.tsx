import React, { useMemo } from "react";
import { PlusCircle, Check, ArrowRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useIsMobile } from "@/shared/hooks/use-mobile";

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
  
  // Controlled open state
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  container?: HTMLElement | null;
  
  // Navigation
  onNavigateToShot?: (shot: ShotOption) => void;
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
  open,
  onOpenChange,
  container,
  onNavigateToShot,
}) => {
  const isMobile = useIsMobile();
  
  // Internal state for uncontrolled mode
  const [internalOpen, setInternalOpen] = React.useState(false);
  
  // Ref to track the trigger element for click-outside detection
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  
  // Use controlled state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = React.useCallback((newOpen: boolean) => {
    if (open === undefined) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [open, onOpenChange]);
  
  // Global click handler to close dropdown when clicking outside
  // This is needed because Radix Select's outside click detection
  // doesn't work properly when nested inside a Dialog
  React.useEffect(() => {
    if (!isOpen) return;
    
    const handleGlobalPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      
      console.log('[ShotSelectorDebug] Global pointerdown detected:', {
        tagName: target.tagName,
        className: target.className,
        hasRadixContent: !!target.closest('[data-radix-select-content]'),
        hasRadixViewport: !!target.closest('[data-radix-select-viewport]'),
        hasRadixItem: !!target.closest('[data-radix-select-item]'),
        hasHeader: !!target.closest('[data-shot-selector-header]'),
        hasTrigger: triggerRef.current?.contains(target),
      });
      
      // Don't close if clicking on the trigger
      if (triggerRef.current?.contains(target)) {
        console.log('[ShotSelectorDebug] Click on trigger - not closing');
        return;
      }
      
      // Don't close if clicking on select content (including portal)
      // Check for data-radix-select attributes to identify select elements
      if (
        target.closest('[data-radix-select-content]') ||
        target.closest('[data-radix-select-viewport]') ||
        target.closest('[data-radix-select-item]')
      ) {
        console.log('[ShotSelectorDebug] Click on select content - not closing');
        return;
      }
      
      // Don't close if clicking on the header (like "Add Shot" button)
      // The header is marked with data-shot-selector-header
      if (target.closest('[data-shot-selector-header]')) {
        console.log('[ShotSelectorDebug] Click on header - not closing');
        return;
      }
      
      // Click was outside - close the dropdown
      console.log('[ShotSelectorDebug] Global pointerdown outside - closing dropdown');
      setIsOpen(false);
    };
    
    // Use pointerdown instead of click, and add a longer delay
    // to avoid closing immediately when opening (the opening click might still be processing)
    const timeoutId = setTimeout(() => {
      document.addEventListener('pointerdown', handleGlobalPointerDown, true);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('pointerdown', handleGlobalPointerDown, true);
    };
  }, [isOpen, setIsOpen]);
  
  // Create the "Add Shot" header if needed
  const addShotHeader = useMemo(() => {
    if (!showAddShot || !onCreateShot) return null;
    
    return (
      <div className="bg-zinc-900 border-b border-zinc-700 p-1" data-shot-selector-header>
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
              // Close dropdown before navigating
              setIsOpen(false);
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
              // Don't close dropdown - let it show the success state with "Visit Shot" button
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
  }, [showAddShot, onCreateShot, quickCreateSuccess, onQuickCreateSuccess, isCreatingShot, setIsOpen]);

  // Get the selected shot
  const selectedShot = useMemo(() => {
    if (!value) return null;
    return shots.find(s => s.id === value) || null;
  }, [value, shots]);

  // Get the display name for the selected shot
  const selectedShotName = selectedShot?.name || null;

  console.log('[ShotSelectorDebug] ShotSelector render:', {
    value,
    selectedShotName,
    shotsCount: shots.length,
    container: container ? 'provided' : 'none'
  });

  return (
    <div className={`flex items-center gap-1 ${className || ''}`}>
      <Select
        value={value}
        open={isOpen}
        onValueChange={(newValue) => {
          console.log('[ShotSelectorDebug] 🎯 Shot selected:', newValue);
          onValueChange(newValue);
          // Close the dropdown after selection
          setIsOpen(false);
        }}
        onOpenChange={(newOpen) => {
          console.log('[ShotSelectorDebug] Dropdown open state changed:', newOpen);
          setIsOpen(newOpen);
        }}
      >
        <SelectTrigger
          ref={triggerRef}
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
            e.stopPropagation();
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
            <div key={shot.id} className="group relative flex items-center">
              <SelectItem 
                value={shot.id} 
                className="text-xs flex-1 pr-8"
                onPointerDown={(e) => {
                  console.log('[ShotSelectorDebug] SelectItem onPointerDown:', shot.name);
                }}
                onClick={(e) => {
                  console.log('[ShotSelectorDebug] SelectItem onClick:', shot.name);
                }}
              >
                {shot.name}
              </SelectItem>
              {/* Jump arrow - appears on hover, visible on both dark and highlighted backgrounds, hidden on mobile */}
              {onNavigateToShot && !isMobile && (
                <button
                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-600/50"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Close dropdown before navigating
                    setIsOpen(false);
                    onNavigateToShot(shot);
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  title={`Jump to ${shot.name}`}
                >
                  <ArrowRight className="h-3 w-3 text-white" />
                </button>
              )}
            </div>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ShotSelector;
