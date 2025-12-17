import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { Shot } from '@/types/shots';
import { RefObject } from 'react';

interface ShotFilterProps {
  shots: Shot[];
  selectedShotId: string;
  onShotChange: (shotId: string) => void;
  excludePositioned: boolean;
  onExcludePositionedChange: (exclude: boolean) => void;
  showPositionFilter?: boolean;
  className?: string;
  triggerClassName?: string;
  triggerWidth?: string;
  labelText?: string;
  positionFilterLabel?: string;
  checkboxId?: string;
  size?: 'sm' | 'md';
  whiteText?: boolean;
  isMobile?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentRef?: RefObject<HTMLDivElement>;
}

export const ShotFilter: React.FC<ShotFilterProps> = ({
  shots,
  selectedShotId,
  onShotChange,
  excludePositioned = true,
  onExcludePositionedChange,
  showPositionFilter = true,
  className = "flex items-center space-x-3",
  triggerClassName,
  triggerWidth = "w-[180px]",
  labelText,
  positionFilterLabel = "Exclude items with a position",
  checkboxId = "exclude-positioned",
  size = 'md',
  whiteText = false,
  isMobile = false,
  open,
  onOpenChange,
  contentRef,
}) => {
  const heightClass = size === 'sm' ? 'h-8' : 'h-10';
  const textSizeClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const labelSizeClass = size === 'sm' ? 'text-xs' : 'text-sm';
  
  const defaultTriggerClassName = `${triggerWidth} ${heightClass} ${textSizeClass}`;

  // Adjust layout for mobile
  const containerClassName = isMobile 
    ? "flex flex-col space-y-2" 
    : className;

  return (
    <div className={containerClassName}>
      <div className={isMobile ? "flex items-center space-x-3" : "contents"}>
        {labelText && (
          <Label className={`${labelSizeClass} font-light ${whiteText ? 'text-white' : 'text-foreground'}`}>
            {labelText}
          </Label>
        )}
        
        <Select value={selectedShotId} onValueChange={onShotChange} open={open} onOpenChange={onOpenChange}>
          <SelectTrigger 
            variant={whiteText ? "retro-dark" : "default"} 
            colorScheme={whiteText ? "zinc" : "default"}
            size={size === 'sm' ? 'sm' : 'default'}
            className={triggerClassName || defaultTriggerClassName}
          >
            <SelectValue placeholder="Filter by shot..." />
          </SelectTrigger>
          <SelectContent
            variant={whiteText ? "zinc" : "default"}
            className="w-[var(--radix-select-trigger-width)] max-h-60 overflow-y-auto"
            ref={contentRef}
          >
            <SelectItem variant={whiteText ? "zinc" : "default"} value="all">All Shots</SelectItem>
            <SelectItem variant={whiteText ? "zinc" : "default"} value="no-shot">Items without shots</SelectItem>
            {shots?.map(shot => (
              <SelectItem variant={whiteText ? "zinc" : "default"} key={shot.id} value={shot.id}>
                {shot.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Position filter checkbox - only show when a specific shot is selected (not 'all' or 'no-shot') */}
      {showPositionFilter && selectedShotId !== 'all' && selectedShotId !== 'no-shot' && onExcludePositionedChange && (
        <div className="flex items-center space-x-2 mt-2">
          <Checkbox 
            id={checkboxId}
            checked={excludePositioned}
            onCheckedChange={(checked) => onExcludePositionedChange(!!checked)}
            className={whiteText ? "border-zinc-600 data-[state=checked]:bg-zinc-600" : undefined}
          />
          <Label 
            htmlFor={checkboxId} 
            className={`${labelSizeClass} cursor-pointer ${whiteText ? 'text-zinc-300' : 'text-foreground'}`}
          >
            {positionFilterLabel}
          </Label>
        </div>
      )}
    </div>
  );
};

export default React.memo(ShotFilter); 