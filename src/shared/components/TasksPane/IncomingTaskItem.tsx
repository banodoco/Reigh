import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { IncomingTask } from '@/shared/contexts/IncomingTasksContext';
import { getTaskDisplayName } from '@/shared/lib/taskConfig';

interface IncomingTaskItemProps {
  task: IncomingTask;
}

/**
 * A "filler" task item that appears in the task list while actual tasks
 * are being created in the background. Matches the visual style of TaskItem
 * but shows a loading state instead of real task data.
 */
const IncomingTaskItem: React.FC<IncomingTaskItemProps> = ({ task }) => {
  // Get display name for task type, with fallback
  const displayTaskType = getTaskDisplayName(task.taskType) || 'Task';

  // Truncate label if too long
  const truncatedLabel = task.label.length > 60
    ? `${task.label.substring(0, 60)}...`
    : task.label;

  return (
    <div
      className={cn(
        "relative p-3 mb-2 bg-zinc-800/95 rounded-md shadow border transition-colors overflow-hidden",
        "border-blue-500/50 animate-pulse"
      )}
    >
      {/* Header row: task type + loading indicator */}
      <div className="flex justify-between items-center mb-1 gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400 flex-shrink-0" />
          <span className="text-sm font-light text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis">
            Creating {displayTaskType}...
          </span>
        </div>
        {task.expectedCount && task.expectedCount > 1 && (
          <span className="text-xs text-zinc-400 flex-shrink-0">
            {task.expectedCount} tasks
          </span>
        )}
      </div>

      {/* Label/prompt display */}
      <div className="mt-2">
        <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5">
          <div className="text-xs text-zinc-300 italic">
            "{truncatedLabel}"
          </div>
        </div>
      </div>

      {/* Timestamp row */}
      <div className="flex items-center mt-2 text-[11px] text-zinc-500">
        <span>Preparing...</span>
      </div>
    </div>
  );
};

export default IncomingTaskItem;
