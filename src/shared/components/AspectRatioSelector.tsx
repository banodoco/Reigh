import React, { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { AspectRatioVisualizer } from './AspectRatioVisualizer';

// Create the aspect ratio options from the centralized object
const ASPECT_RATIOS = Object.keys(ASPECT_RATIO_TO_RESOLUTION)
    .filter(key => key !== 'Square') // Exclude 'Square' if '1:1' is preferred
    .map(key => ({
        value: key,
        label: `${key} (${ASPECT_RATIO_TO_RESOLUTION[key]})`
    }));

interface AspectRatioSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  showVisualizer?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
}

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  value,
  onValueChange,
  disabled = false,
  showVisualizer = true,
  className = '',
  id,
  placeholder = "Select aspect ratio"
}) => {
  const [hoveredAspectRatio, setHoveredAspectRatio] = useState<string>('');

  if (showVisualizer) {
    // Layout with visualizer (50% select, 50% visualizer)
    return (
      <TooltipProvider>
        <div className={`flex items-center gap-3 ${className}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-1/2">
                <Select value={value} onValueChange={onValueChange} disabled={disabled}>
                  <SelectTrigger className="w-full" id={id}>
                    <SelectValue placeholder={placeholder}>
                      {value ? value : placeholder}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIOS.map((ratio) => (
                      <SelectItem 
                        key={ratio.value} 
                        value={ratio.value}
                        onMouseEnter={() => setHoveredAspectRatio(ratio.value)}
                        onMouseLeave={() => setHoveredAspectRatio('')}
                      >
                        {ratio.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Shot dimensions</p>
            </TooltipContent>
          </Tooltip>
          <div className="flex-1 flex justify-center">
            <AspectRatioVisualizer aspectRatio={hoveredAspectRatio || value} />
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // Layout without visualizer (full width select)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={className}>
            <Select value={value} onValueChange={onValueChange} disabled={disabled}>
              <SelectTrigger className="w-full" id={id}>
                <SelectValue placeholder={placeholder}>
                  {value ? value : placeholder}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((ratio) => (
                  <SelectItem key={ratio.value} value={ratio.value}>
                    {ratio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Shot dimensions</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
