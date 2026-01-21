import React, { useState } from 'react';
import { Play, ImageIcon, ExternalLink, FolderOpen } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { Task } from '@/types/tasks';
import { GenerationRow } from '@/types/shots';

// Orchestrator task types don't have their own video output - they spawn subtasks
const ORCHESTRATOR_TASK_TYPES = [
  'travel_orchestrator',
  'wan_2_2_i2v', // This is also an orchestrator that spawns individual segments
] as const;

interface TaskItemActionsProps {
  task: Task;
  isMobile: boolean;
  // Task type info
  isCompletedVideoTask: boolean;
  isImageTask: boolean;
  // Data availability
  generationData: GenerationRow | null;
  // Loading states
  isLoadingVideoGen: boolean;
  waitingForVideoToOpen: boolean;
  // Handlers
  onViewVideo: (e: React.MouseEvent) => void;
  onViewImage: (e: React.MouseEvent) => void;
  onVisitShot: (e: React.MouseEvent) => void;
  // Project indicator
  showProjectIndicator?: boolean;
  projectName?: string;
  selectedProjectId?: string;
  onSwitchProject?: (projectId: string) => void;
  // Shot ID for visit shot button
  shotId: string | null;
}

export const TaskItemActions: React.FC<TaskItemActionsProps> = ({
  task,
  isMobile,
  isCompletedVideoTask,
  isImageTask,
  generationData,
  isLoadingVideoGen,
  waitingForVideoToOpen,
  onViewVideo,
  onViewImage,
  onVisitShot,
  showProjectIndicator = false,
  projectName,
  selectedProjectId,
  onSwitchProject,
  shotId,
}) => {
  const [idCopied, setIdCopied] = useState(false);

  return (
    <div className={cn("flex items-center flex-shrink-0 ml-auto", isMobile ? "gap-1" : "gap-0.5")}>
      {/* ID copy button - always visible */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(task.id);
              setIdCopied(true);
              setTimeout(() => setIdCopied(false), 2000);
            }}
            className={cn(
              "text-xs rounded transition-colors",
              isMobile ? "px-2 py-1" : "px-1 py-0.5",
              idCopied
                ? "text-green-400"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
            )}
          >
            {idCopied ? 'copied' : 'id'}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {idCopied ? 'Copied!' : 'Copy task ID'}
        </TooltipContent>
      </Tooltip>
      
      {/* Project indicator - shown in "All Projects" mode (except current project) */}
      {showProjectIndicator && projectName && task.projectId !== selectedProjectId && onSwitchProject && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSwitchProject(task.projectId);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSwitchProject(task.projectId);
              }}
              className={cn(
                "rounded transition-colors text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700",
                isMobile ? "p-1.5" : "p-1"
              )}
              title={`Go to project: ${projectName}`}
            >
              <FolderOpen className={cn(isMobile ? "w-4 h-4" : "w-3 h-3")} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {projectName}
          </TooltipContent>
        </Tooltip>
      )}
      
      {/* Open Video button - hidden for orchestrator tasks that don't have their own video */}
      {isCompletedVideoTask && !ORCHESTRATOR_TASK_TYPES.includes(task.taskType as any) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onViewVideo}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!(isLoadingVideoGen && waitingForVideoToOpen)) {
                  onViewVideo(e as unknown as React.MouseEvent);
                }
              }}
              className={cn(
                "rounded transition-colors text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700",
                isMobile ? "p-1.5" : "p-1"
              )}
              disabled={isLoadingVideoGen && waitingForVideoToOpen}
            >
              <Play className={cn(isMobile ? "w-4 h-4" : "w-3 h-3", isLoadingVideoGen && waitingForVideoToOpen && "animate-pulse")} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isLoadingVideoGen && waitingForVideoToOpen ? 'Loading...' : 'Open Video'}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Open Image button */}
      {isImageTask && generationData && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onViewImage}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onViewImage(e as unknown as React.MouseEvent);
              }}
              className={cn(
                "rounded transition-colors text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700",
                isMobile ? "p-1.5" : "p-1"
              )}
            >
              <ImageIcon className={isMobile ? "w-4 h-4" : "w-3 h-3"} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Open Image
          </TooltipContent>
        </Tooltip>
      )}

      {/* Visit Shot button */}
      {shotId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onVisitShot}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onVisitShot(e as unknown as React.MouseEvent);
              }}
              className={cn(
                "rounded transition-colors text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700",
                isMobile ? "p-1.5" : "p-1"
              )}
            >
              <ExternalLink className={isMobile ? "w-4 h-4" : "w-3 h-3"} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Visit Shot
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export default TaskItemActions;



