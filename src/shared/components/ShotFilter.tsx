import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { Shot } from '@/types/shots';

interface ShotFilterProps {
  shots: Shot[];
  selectedShotId: string;
  onShotChange: (shotId: string) => void;
  excludePositioned?: boolean;
  onExcludePositionedChange?: (exclude: boolean) => void;
  showPositionFilter?: boolean;
  className?: string;
  triggerClassName?: string;
  triggerWidth?: string;
  labelText?: string;
  positionFilterLabel?: string;
  checkboxId?: string;
  size?: 'sm' | 'md';
  whiteText?: boolean;
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
}) => {
  const heightClass = size === 'sm' ? 'h-8' : 'h-10';
  const textSizeClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const labelSizeClass = size === 'sm' ? 'text-xs' : 'text-sm';
  
  const defaultTriggerClassName = whiteText 
    ? `${triggerWidth} ${heightClass} ${textSizeClass} bg-zinc-800 border-zinc-700 text-white`
    : `${triggerWidth} ${heightClass} ${textSizeClass}`;

  return (
    <div className={className}>
      {labelText && (
        <Label className={`${labelSizeClass} font-medium ${whiteText ? 'text-white' : 'text-foreground'}`}>
          {labelText}
        </Label>
      )}
      
      <Select value={selectedShotId} onValueChange={onShotChange}>
        <SelectTrigger className={triggerClassName || defaultTriggerClassName}>
          <SelectValue placeholder="Filter by shot..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Shots</SelectItem>
          {shots?.map(shot => (
            <SelectItem key={shot.id} value={shot.id}>
              {shot.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* Position filter checkbox - only show when a specific shot is selected */}
      {showPositionFilter && selectedShotId !== 'all' && onExcludePositionedChange && (
        <div className="flex items-center space-x-2">
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