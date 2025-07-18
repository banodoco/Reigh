import React, { useMemo } from 'react';
import { useProject } from "@/shared/contexts/ProjectContext";
import { AlertTriangle, Settings } from "lucide-react";
import { useListTasks } from '@/shared/hooks/useTasks';

const WARNING_TASK_STATUSES = ['In Progress', 'Failed', 'Cancelled'];

interface TasksPaneProcessingWarningProps {
  onOpenSettings: () => void;
}

export const TasksPaneProcessingWarning: React.FC<TasksPaneProcessingWarningProps> = ({ onOpenSettings }) => {
  const { selectedProjectId } = useProject();
  const { data: tasks, isLoading } = useListTasks({ 
    projectId: selectedProjectId, 
    status: WARNING_TASK_STATUSES
  });

  const hasFailedOrCancelledTasks = useMemo(() => 
    tasks?.some(task => WARNING_TASK_STATUSES.includes(task.status)),
    [tasks]
  );

  if (isLoading || !hasFailedOrCancelledTasks) {
    return null;
  }
  
  return (
    <div className="p-2 border-b border-zinc-800 bg-yellow-900/30">
      <div className="flex items-center text-yellow-300">
        <AlertTriangle className="h-5 w-5 mr-3 flex-shrink-0" />
        <div className="flex-grow text-sm">
          <p>Some generations have failed or were cancelled. This may be due to exhausted credits or worker settings.</p>
        </div>
        <button 
          onClick={onOpenSettings} 
          className="ml-2 p-1 rounded-md hover:bg-yellow-400/20 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}; 