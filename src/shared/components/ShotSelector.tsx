import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { PlusCircle, Check, ArrowRight, ChevronsUpDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/shared/components/ui/command";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { cn } from "@/shared/lib/utils";

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
  /** Select variant - defaults to retro-dark for dark contexts */
  variant?: "default" | "retro" | "retro-dark";
  
  // Add Shot functionality
  showAddShot?: boolean;
  onCreateShot?: (shotName?: string) => void;
  isCreatingShot?: boolean;
  
  // Quick create success state
  quickCreateSuccess?: {
    isSuccessful: boolean;
    shotId: string | null;
    shotName: string | null;
    isLoading?: boolean; // True when shot is created but still syncing/loading
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
  variant = "retro-dark",
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
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Search query state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Ref for auto-focusing the search input
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use controlled state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = useCallback((newOpen: boolean) => {
    console.log('[ShotDropdownDebug] setIsOpen called:', { newOpen, wasOpen: open !== undefined ? open : internalOpen });
    if (open === undefined) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
    // Reset search when closing
    if (!newOpen) {
      setSearchQuery('');
    }
  }, [open, onOpenChange, internalOpen]);
  
  // Auto-focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the popover content is rendered
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Get the selected shot
  const selectedShot = useMemo(() => {
    if (!value) return null;
    return shots.find(s => s.id === value) || null;
  }, [value, shots]);

  // Get the display name for the selected shot
  const selectedShotName = selectedShot?.name || null;
  
  // Check if search query matches any shot
  const hasMatchingShot = useMemo(() => {
    if (!searchQuery.trim()) return true;
    return shots.some(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, shots]);
  
  // Handle Enter key to create shot with search query
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim() && !hasMatchingShot && onCreateShot) {
      e.preventDefault();
      onCreateShot(searchQuery.trim());
    }
  }, [searchQuery, hasMatchingShot, onCreateShot]);

  // Variant-specific styles (memoized to avoid recalculating on every render)
  const styles = useMemo(() => {
    switch (variant) {
      case "retro":
        return {
          trigger: cn(
            "bg-background hover:bg-[#6a8a8a]/10 rounded-sm border-2 border-[#6a8a8a]/30 hover:border-[#6a8a8a]/45",
            "dark:border-[#6a7a7a] dark:hover:bg-transparent text-[#5a7a7a] dark:text-[#c8c4bb]",
            "font-heading font-light tracking-wide transition-all duration-200"
          ),
          content: "rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] bg-background",
          command: "retro" as const,
        };
      case "retro-dark":
        return {
          trigger: cn(
            "bg-zinc-800/90 hover:bg-zinc-700/90 rounded-sm border border-zinc-600",
            "text-zinc-200 font-heading font-light tracking-wide transition-all duration-200"
          ),
          content: "rounded-sm border border-zinc-600 bg-zinc-800",
          command: "retro" as const,
        };
      default:
        return {
          trigger: "border border-input bg-background",
          content: "rounded-md border bg-popover",
          command: "default" as const,
        };
    }
  }, [variant]);

  console.log('[ShotDropdownDebug] ShotSelector render:', {
    isOpen,
    shotsCount: shots.length,
    showAddShot,
    hasOnCreateShot: !!onCreateShot,
    hasOnNavigateToShot: !!onNavigateToShot,
    value,
    isMobile
  });

  return (
    <div
      className={`flex items-center gap-1 ${className || ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            role="combobox"
            aria-expanded={isOpen}
            className={cn(
              "flex items-center justify-between px-2 py-1 text-xs",
              "focus:outline-none focus:ring-1 focus:ring-zinc-500",
              "disabled:cursor-not-allowed disabled:opacity-50",
              styles.trigger,
              triggerClassName
            )}
          >
            <span className="truncate">
              {selectedShotName 
                ? (selectedShotName.length > 10 ? `${selectedShotName.substring(0, 10)}...` : selectedShotName)
                : (value ? "Loading..." : placeholder)}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className={cn(
            "p-0 z-[10000]",
            styles.content,
            contentClassName
          )}
          style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '160px' }}
          side={side}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={8}
          container={container}
          onKeyDown={handleKeyDown}
          // Stop events from bubbling to parent (prevents lightbox closes, etc.)
          // Use bubble phase so events reach child buttons first
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Add Shot Header */}
          {showAddShot && onCreateShot && (
            <div className="bg-zinc-900 border-b border-zinc-700 p-1" data-shot-selector-header>
              {quickCreateSuccess?.isSuccessful ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full h-8 text-xs justify-center bg-zinc-600 hover:bg-zinc-500 text-white border-zinc-500"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (quickCreateSuccess.isLoading) return;
                    setIsOpen(false);
                    if (onQuickCreateSuccess) {
                      onQuickCreateSuccess();
                    }
                  }}
                  disabled={quickCreateSuccess.isLoading}
                >
                  {quickCreateSuccess.isLoading ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white mr-1"></div>
                      Preparing {quickCreateSuccess.shotName}...
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Visit {quickCreateSuccess.shotName}
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full h-8 text-xs justify-center bg-zinc-600 hover:bg-zinc-500 text-white border-zinc-500"
                  onClick={(e) => {
                    console.log('[ShotDropdownDebug] Add Shot button clicked');
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
          )}
          
          <Command variant={styles.command} className="rounded-none">
            <CommandInput 
              ref={searchInputRef}
              placeholder="Search shots..." 
              className="h-8 text-xs border-none"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList className="max-h-48">
              <CommandEmpty>
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">No shots found.</p>
                  {searchQuery.trim() && onCreateShot && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Press <kbd className="px-1 py-0.5 text-[9px] bg-muted rounded border">Enter</kbd> to create "{searchQuery.trim()}"
                    </p>
                  )}
                </div>
              </CommandEmpty>
              <CommandGroup>
                {shots.map(shot => (
                  <CommandItem
                    key={shot.id}
                    value={shot.name}
                    variant={styles.command}
                    className="text-xs group/shot relative"
                    onSelect={() => {
                      onValueChange(shot.id);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={cn(
                        "truncate",
                        value === shot.id && "font-medium"
                      )}>
                        {shot.name}
                      </span>
                      {value === shot.id && (
                        <Check className="h-3 w-3 shrink-0 ml-1" />
                      )}
                    </div>
                    {/* Jump arrow - appears on hover, hidden on mobile */}
                    {onNavigateToShot && !isMobile && (
                      <button
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/shot:opacity-100 transition-opacity p-1 rounded bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-600/50"
                        onClick={(e) => {
                          console.log('[ShotDropdownDebug] Jump arrow clicked for shot:', shot.name);
                          e.preventDefault();
                          e.stopPropagation();
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
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ShotSelector;
