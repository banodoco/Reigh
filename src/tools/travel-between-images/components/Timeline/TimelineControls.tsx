import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Slider } from "@/shared/components/ui/slider";
import { Label } from "@/shared/components/ui/label";
import { Info, ZoomOut, ZoomIn, RotateCcw, MoveLeft } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { framesToSeconds, quantizeGap } from './utils/time-utils';
import type { VideoMetadata } from '@/shared/lib/videoUploader';

interface TimelineControlsProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomToStart: () => void;
  onResetFrames?: (gap: number) => void;
  // Structure video props
  shotId?: string;
  projectId?: string;
  structureVideoPath?: string | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number
  ) => void;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToStart,
  onResetFrames,
  shotId,
  projectId,
  structureVideoPath,
  structureVideoTreatment = 'adjust',
  structureVideoMotionStrength = 1.0,
  onStructureVideoChange,
}) => {
  // Default to 9 (valid 4N+1 value: 4*2+1)
  const [resetGap, setResetGap] = React.useState<number>(9);
  
  // Fixed max gap of 81 (valid 4N+1 value: 4*20+1)
  const maxGap = 81;
  React.useEffect(() => {
    // Ensure gap is quantized to 4N+1 format
    const quantizedGap = quantizeGap(resetGap, 5);
    if (quantizedGap !== resetGap || resetGap > maxGap) {
      setResetGap(Math.min(quantizedGap, maxGap));
    }
  }, [maxGap, resetGap]);
  return (
    <div className="flex flex-col gap-3 mb-3">
      {/* Timeline controls */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-64">
            <Label htmlFor="resetGap" className="text-sm font-light">
              Gap to reset to: {resetGap} frames ({framesToSeconds(resetGap)})
            </Label>
            {/* Gap values are quantized to 4N+1 format for Wan model compatibility */}
            <Slider
              id="resetGap"
              min={5}
              max={maxGap}
              step={4}
              value={[quantizeGap(resetGap, 5)]}
              onValueChange={(value) => setResetGap(quantizeGap(value[0], 5))}
              className="w-full mt-1"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onResetFrames?.(resetGap)}
                  disabled={!onResetFrames}
                  className="mt-4"
                >
                  Reset
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>This will reset to a {framesToSeconds(resetGap)} gap</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">{zoomLevel.toFixed(1)}x zoom</span>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onZoomReset} 
                  disabled={zoomLevel <= 1}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom Out Fully</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onZoomOut} 
                  disabled={zoomLevel <= 1}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom Out</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onZoomIn} 
                  disabled={zoomLevel >= 10}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom In</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onZoomToStart}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <MoveLeft className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom to Start</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default TimelineControls;
