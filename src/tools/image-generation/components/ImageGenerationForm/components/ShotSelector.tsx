import React, { useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { PlusCircle, X } from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import { SectionHeader } from "./SectionHeader";

interface Shot {
  id: string;
  name: string;
  created_at?: string;
}

interface ShotSelectorProps {
  shots: Shot[] | undefined;
  associatedShotId: string | null;
  isGenerating: boolean;
  hasApiKey: boolean;
  onChangeShot: (value: string) => void;
  onClearShot: () => void;
  onOpenCreateShot: () => void;
  onJumpToShot?: (shot: Shot) => void;
}

export const ShotSelector: React.FC<ShotSelectorProps> = ({
  shots,
  associatedShotId,
  isGenerating,
  hasApiKey,
  onChangeShot,
  onClearShot,
  onOpenCreateShot,
  onJumpToShot,
}) => {
  // Sort shots by newest first (by created_at descending)
  const sortedShots = useMemo(() => {
    if (!shots) return [];
    return [...shots].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA; // Newest first
    });
  }, [shots]);

  return (
    <div className="space-y-2 mt-6">
      <div className="flex items-center gap-2">
        <SectionHeader title="Shot" theme="green" htmlFor="associatedShot" />
      </div>
      {/* Select dropdown and create button with aligned jump link */}
      <div className="flex items-center gap-2">
        {associatedShotId && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClearShot}
                  disabled={!hasApiKey || isGenerating}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  aria-label="Clear shot selection"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Clear selection</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="relative flex-1">
          <Select
            value={associatedShotId || "none"}
            onValueChange={(value) => {
              console.log('[ShotChangeDebug] 🎯 ShotSelector onValueChange triggered:', {
                newValue: value,
                currentAssociatedShotId: associatedShotId,
                hasOnChangeShot: !!onChangeShot,
                timestamp: Date.now()
              });
              onChangeShot(value);
              console.log('[ShotChangeDebug] ✅ onChangeShot called with:', value);
            }}
            disabled={!hasApiKey || isGenerating}
          >
            <SelectTrigger variant="retro" id="associatedShot" className="inline-flex w-full min-w-[200px]">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent variant="retro">
              <SelectItem variant="retro" value="none">None</SelectItem>
              {sortedShots.map((shot) => (
                <SelectItem variant="retro" key={shot.id} value={shot.id} className="preserve-case">
                  {shot.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Visit shot link - positioned at top right of Select dropdown */}
          {associatedShotId && shots && onJumpToShot && (() => {
            const selectedShot = shots.find(shot => shot.id === associatedShotId);
            return selectedShot ? (
              <button
                type="button"
                onClick={() => onJumpToShot(selectedShot)}
                className="absolute top-0 right-[35px] text-xs font-light text-gray-500 hover:text-gray-700 hover:underline transition-colors duration-200 px-2 py-1 rounded-md hover:bg-gray-50 -translate-y-1/2"
                style={{ top: '50%' }}
              >
                Visit →
              </button>
            ) : null;
          })()}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenCreateShot}
          disabled={!hasApiKey || isGenerating}
          className="gap-1"
        >
          <PlusCircle className="h-4 w-4" />
          <span className="hidden sm:inline">New Shot</span>
        </Button>
      </div>
    </div>
  );
};
