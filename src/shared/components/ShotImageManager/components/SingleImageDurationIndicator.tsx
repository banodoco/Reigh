import React from 'react';
import { Clock, Settings2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SingleImageDurationIndicatorProps {
  /** Duration in frames */
  frames: number;
  /** Frame rate for display calculation */
  fps?: number;
  /** Click handler to open settings modal */
  onClick?: () => void;
  /** Read-only mode */
  readOnly?: boolean;
  /** Aspect ratio for sizing */
  projectAspectRatio?: string;
}

/**
 * SingleImageDurationIndicator - Shows duration info for single-image batch mode
 *
 * When there's only one image in batch mode, this component provides a clickable
 * interface to open the SegmentSettingsModal for configuring the video duration.
 */
export const SingleImageDurationIndicator: React.FC<SingleImageDurationIndicatorProps> = ({
  frames,
  fps = 16,
  onClick,
  readOnly = false,
  projectAspectRatio,
}) => {
  const durationSeconds = (frames / fps).toFixed(1);

  return (
    <button
      onClick={onClick}
      disabled={readOnly || !onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5",
        "px-4 py-3 rounded-xl",
        "bg-blue-50 dark:bg-blue-950/40",
        "border border-blue-200 dark:border-blue-800",
        "text-blue-700 dark:text-blue-300",
        "transition-all duration-200",
        onClick && !readOnly && "hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:shadow-sm cursor-pointer",
        (readOnly || !onClick) && "opacity-60 cursor-default"
      )}
    >
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Duration</span>
      </div>
      <span className="text-lg font-light">{durationSeconds}s</span>
      {onClick && !readOnly && (
        <div className="flex items-center gap-1 text-[10px] opacity-70 mt-0.5">
          <Settings2 className="h-3 w-3" />
          <span>Click to edit</span>
        </div>
      )}
    </button>
  );
};
