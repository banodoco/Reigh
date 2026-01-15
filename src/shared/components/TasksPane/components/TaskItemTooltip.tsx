import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { Task } from '@/types/tasks';
import { GenerationRow } from '@/types/shots';
import { SharedTaskDetails } from '@/tools/travel-between-images/components/SharedTaskDetails';
import { isImageEditTaskType } from '@/tools/travel-between-images/components/TaskDetails';
import SharedMetadataDetails from '@/shared/components/SharedMetadataDetails';

interface TaskItemTooltipProps {
  task: Task;
  taskParams: { parsed: Record<string, any>; promptText: string };
  isVideoTask: boolean;
  isCompletedVideoTask: boolean;
  showsTooltip: boolean;
  isMobile: boolean;
  // Data
  travelImageUrls: string[];
  videoOutputs: GenerationRow[] | null;
  generationData: GenerationRow | null;
  actualGeneration: any;
  // Callbacks
  onOpenVideoLightbox?: (task: Task, media: GenerationRow[], videoIndex: number, initialVariantId?: string) => void;
  onOpenImageLightbox?: (task: Task, media: GenerationRow) => void;
  onResetHoverState: () => void;
  // The content to wrap
  children: React.ReactNode;
}

export const TaskItemTooltip: React.FC<TaskItemTooltipProps> = ({
  task,
  taskParams,
  isVideoTask,
  isCompletedVideoTask,
  showsTooltip,
  isMobile,
  travelImageUrls,
  videoOutputs,
  generationData,
  actualGeneration,
  onOpenVideoLightbox,
  onOpenImageLightbox,
  onResetHoverState,
  children,
}) => {
  // Don't show tooltips on mobile to improve performance and UX
  if (!showsTooltip || isMobile) {
    return <>{children}</>;
  }

  const hasClickableContent = isVideoTask 
    ? (isCompletedVideoTask && videoOutputs && videoOutputs.length > 0) 
    : !!generationData;
  
  const handleTooltipClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Reset hover state immediately when clicking tooltip
    onResetHoverState();
    
    if (isVideoTask && hasClickableContent && onOpenVideoLightbox && videoOutputs && videoOutputs.length > 0) {
      const initialVariantId = (videoOutputs[0] as any)?._variant_id;
      onOpenVideoLightbox(task, videoOutputs, 0, initialVariantId);
    } else if (!isVideoTask && hasClickableContent && onOpenImageLightbox && generationData) {
      onOpenImageLightbox(task, generationData);
    }
  };

  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="left" 
        className={cn(
          "p-0 border-0 bg-background/95 backdrop-blur-sm z-[100001]",
          isVideoTask ? "max-w-lg" : "max-w-md"
        )}
        sideOffset={15}
        collisionPadding={10}
      >
        <div 
          className="relative cursor-pointer hover:bg-background/90 transition-colors rounded-lg group"
          onClick={handleTooltipClick}
        >
          {(isVideoTask || isImageEditTaskType(task.taskType)) ? (
            <SharedTaskDetails
              task={task}
              inputImages={isVideoTask ? travelImageUrls : []}
              variant="hover"
              isMobile={false}
            />
          ) : (
            <SharedMetadataDetails
              metadata={{
                prompt: taskParams.promptText,
                tool_type: task.taskType,
                originalParams: task.params,
                ...actualGeneration?.metadata
              }}
              variant="hover"
              isMobile={false}
              showUserImage={true}
            />
          )}
          
          {/* Click to view indicator */}
          {hasClickableContent && (
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-zinc-900/90 via-zinc-800/60 to-transparent p-2 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="text-xs text-zinc-100 text-center font-medium drop-shadow-md">
                {isVideoTask ? "Click to view video" : "Click to view image"}
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default TaskItemTooltip;


