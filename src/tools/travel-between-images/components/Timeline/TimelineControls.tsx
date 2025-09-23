import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Slider } from "@/shared/components/ui/slider";
import { Label } from "@/shared/components/ui/label";
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

interface TimelineControlsProps {
  contextFrames: number;
  onContextFramesChange: (context: number) => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomToStart: () => void;
  onResetFrames?: (gap: number) => void;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  contextFrames,
  onContextFramesChange,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToStart,
  onResetFrames,
}) => {
  const [resetGap, setResetGap] = React.useState<number>(10);
  
  // Ensure resetGap doesn't exceed the max allowed value when contextFrames changes
  const maxGap = 81 - contextFrames;
  React.useEffect(() => {
    if (resetGap > maxGap) {
      setResetGap(maxGap);
    }
  }, [contextFrames, maxGap, resetGap]);
  return (
    <div className="flex items-center justify-between mb-3 gap-6">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-1/2">
            <div className="flex items-center gap-2 mb-1">
              <Label htmlFor="contextFrames" className="text-sm font-light">
                Context Frames: {contextFrames}
              </Label>
            </div>
            <Slider
              id="contextFrames"
              min={1}
              max={24}
              step={1}
              value={[contextFrames]}
              onValueChange={(value) => onContextFramesChange(value[0])}
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-32">
              <Label htmlFor="resetGap" className="text-sm font-light">
                Gap to reset to:
              </Label>
              <Slider
                id="resetGap"
                min={1}
                max={maxGap}
                step={1}
                value={[resetGap]}
                onValueChange={(value) => setResetGap(value[0])}
                className="w-full mt-1"
              />
              <div className="text-xs text-muted-foreground mt-1 text-center">
                {resetGap} frames
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onResetFrames?.(resetGap)}
              disabled={!onResetFrames}
              className="mt-4"
            >
              Reset Frames
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onZoomReset} disabled={zoomLevel <= 1}>
            <span className="text-xs">⤺</span> Zoom Out Fully
          </Button>
          <Button variant="outline" size="sm" onClick={onZoomOut} disabled={zoomLevel <= 1}>
            <span className="text-xs">−</span> Zoom Out
          </Button>
          <Button variant="outline" size="sm" onClick={onZoomIn} disabled={zoomLevel >= 10}>
            <span className="text-xs">+</span> Zoom In
          </Button>
          <Button variant="outline" size="sm" onClick={onZoomToStart}>
            <span className="text-xs">⟵</span> Zoom to Start
          </Button>
          <span className="text-sm text-muted-foreground ml-2">{zoomLevel.toFixed(1)}x zoom</span>
        </div>
    </div>
  );
};

export default TimelineControls;
