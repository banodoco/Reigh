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
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  contextFrames,
  onContextFramesChange,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToStart,
}) => {
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-5 w-5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="mb-1 font-light">Timeline Drag Shortcuts</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li><kbd className="font-mono">⌘</kbd> – <span className="font-light">push/pull frames to the right</span></li>
                <li><kbd className="font-mono">⌥</kbd> – <span className="font-light">push/pull frames to the left</span></li>
                <li><kbd className="font-mono">⌘ + ⌥</kbd> – shift the <span className="font-light">entire timeline</span></li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">Push when dragging away, pull when dragging towards</p>
            </TooltipContent>
          </Tooltip>
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
