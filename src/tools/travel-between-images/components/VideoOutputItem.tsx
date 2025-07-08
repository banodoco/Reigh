import React, { useState, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Info, Trash2 } from 'lucide-react';
import { formatDistanceToNow, isValid } from 'date-fns';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import TaskDetailsModal from './TaskDetailsModal';
import { GenerationRow } from '@/types/shots';

interface VideoOutputItemProps {
  video: GenerationRow;
  onDoubleClick: () => void;
  onDelete: (generationId: string) => void;
  isDeleting: boolean;
  onApplySettings?: (settings: {
    prompt?: string;
    prompts?: string[];
    negativePrompt?: string;
    negativePrompts?: string[];
    steps?: number;
    frame?: number;
    frames?: number[];
    context?: number;
    contexts?: number[];
    width?: number;
    height?: number;
    replaceImages?: boolean;
    inputImages?: string[];
  }) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
}

// Helper to abbreviate distance strings (e.g., "5 minutes ago" -> "5 mins ago")
const abbreviateDistance = (str: string) => {
  if (str.includes('less than a minute')) {
    return '<1 min ago';
  }

  return str
    .replace(/1 minutes ago/, '1 min ago')
    .replace(/1 hours ago/, '1 hr ago')
    .replace(/1 seconds ago/, '1 sec ago')
    .replace(/1 days ago/, '1 day ago')
    .replace(/minutes?/, 'mins')
    .replace(/hours?/, 'hrs')
    .replace(/seconds?/, 'secs')
    .replace(/days?/, 'days');
};

export const VideoOutputItem: React.FC<VideoOutputItemProps> = ({
  video,
  onDoubleClick,
  onDelete,
  isDeleting,
  onApplySettings,
  onApplySettingsFromTask,
}) => {
  // Accept both camelCase (createdAt) and snake_case (created_at) for
  // backwards-compatibility with data coming directly from Supabase.
  const creationDateStr: string | undefined = (video as any).createdAt ?? (video as any).created_at;
  
  // State to force re-render of time display
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Update current time every minute to refresh relative timestamps
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent lightbox from opening on delete
    onDelete(video.id);
  };

  return (
    <div
      className="rounded-lg overflow-hidden shadow-md bg-muted/30 aspect-video flex items-center justify-center relative group"
      onDoubleClick={onDoubleClick}
    >
      <div className="absolute top-2 left-2 flex items-center gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <TaskDetailsModal generationId={video.id} onApplySettings={onApplySettings} onApplySettingsFromTask={onApplySettingsFromTask}>
          <Button
            variant="ghost"
            size="icon"
            className="bg-black/20 backdrop-blur-sm hover:bg-white/20"
            aria-label="Show task details"
          >
            <Info className="h-5 w-5 text-white" />
          </Button>
        </TaskDetailsModal>
        {creationDateStr && isValid(new Date(creationDateStr)) && (
          <span className="text-xs text-white bg-black/50 px-1.5 py-0.5 rounded-md">
            {abbreviateDistance(formatDistanceToNow(new Date(creationDateStr), { addSuffix: true }))}
          </span>
        )}
      </div>
      {(video.location || video.imageUrl) ? (
        <HoverScrubVideo
          src={video.location || video.imageUrl}
          poster={video.thumbUrl}
          className="absolute inset-0"
          enableScrubbing={false}
        />
      ) : (
        <p className="text-xs text-muted-foreground p-2">Video URL not available.</p>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-destructive bg-black/20 hover:bg-destructive/20 backdrop-blur-sm"
        onClick={handleDelete}
        disabled={isDeleting}
        aria-label="Delete video"
      >
        {isDeleting ? (
          <svg className="animate-spin h-4 w-4 text-destructive" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}; 