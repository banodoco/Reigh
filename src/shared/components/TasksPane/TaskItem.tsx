import React from 'react';
import { Task } from '@/types/tasks';
import { Button } from '@/shared/components/ui/button';
import { useCancelTask, useListTasks } from '@/shared/hooks/useTasks';
import { useToast } from '@/shared/hooks/use-toast'; // For user feedback
import { formatDistanceToNow, isValid } from 'date-fns';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { getTaskDisplayName, taskSupportsProgress } from '@/shared/lib/taskConfig';

interface TaskItemProps {
  task: Task;
  isNew?: boolean;
}

// Helper to abbreviate distance strings (e.g., "5 minutes ago" -> "5 mins ago")
const abbreviateDistance = (str: string) => {
  // Handle "less than a minute ago" special case
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

const TaskItem: React.FC<TaskItemProps> = ({ task, isNew = false }) => {
  const { toast } = useToast();
  const cancelTaskMutation = useCancelTask();

  // Access all tasks for project (used for orchestrator logic)
  const { selectedProjectId } = useProject();
  const { data: allProjectTasks, refetch: refetchAllTasks } = useListTasks({ projectId: selectedProjectId });

  // Map certain task types to more user-friendly names for display purposes
  const displayTaskType = getTaskDisplayName(task.taskType);

  // Extract prompt for Image Generation tasks (single_image)
  const promptText: string = React.useMemo(() => {
    if (task.taskType !== 'single_image') return '';
    const params = typeof task.params === 'string' ? JSON.parse(task.params) : task.params || {};
    return params?.orchestrator_details?.prompt || '';
  }, [task]);

  // Extract image URLs for Travel Between Images tasks (travel_orchestrator)
  const imageUrls: string[] = React.useMemo(() => {
    if (task.taskType !== 'travel_orchestrator') return [];
    const resolved = (task.params as any)?.orchestrator_details?.input_image_paths_resolved;
    return Array.isArray(resolved) ? resolved as string[] : [];
  }, [task]);
  const imagesToShow = imageUrls.slice(0, 5);
  const extraImageCount = Math.max(0, imageUrls.length - imagesToShow.length);

  // Local state to show progress percentage temporarily
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  const handleCancel = () => {
    // Cancel main task first
    cancelTaskMutation.mutate(task.id, {
      onSuccess: () => {
        toast({
          title: 'Task Cancelled',
          description: `Task ${displayTaskType} (${task.id.substring(0, 8)}) has been cancelled.`,
          variant: 'default',
        });
      },
      onError: (error) => {
        toast({
          title: 'Cancellation Failed',
          description: error.message || 'Could not cancel the task.',
          variant: 'destructive',
        });
      },
    });

    // If this is an orchestrator task, also cancel its subtasks
    if (task.taskType === 'travel_orchestrator' && allProjectTasks) {
      const pRoot: any = typeof task.params === 'string' ? JSON.parse(task.params) : task.params || {};
      const orchestratorDetails = pRoot.orchestrator_details || {};
      const orchestratorId = orchestratorDetails.orchestrator_task_id || pRoot.orchestrator_task_id || pRoot.task_id || task.id;
      const orchestratorRunId = orchestratorDetails.run_id || pRoot.orchestrator_run_id;
      const subtasks = allProjectTasks.filter((t) => {
        const p: any = typeof t.params === 'string' ? JSON.parse(t.params) : t.params || {};
        return (p.orchestrator_task_id_ref === orchestratorId || p.orchestrator_task_id === orchestratorId) && ['Queued', 'In Progress'].includes(t.status);
      });
      subtasks.forEach((sub) => {
        cancelTaskMutation.mutate(sub.id);
      });
    }
  };

  // Handler wrapper
  const handleCheckProgress = () => {
    if (!allProjectTasks) {
      refetchAllTasks().then(({ data }) => {
        if (data) computeAndShowProgress(data);
      });
    } else {
      computeAndShowProgress(allProjectTasks);
    }
  };

  const computeAndShowProgress = (tasksData: Task[]) => {
    const pRoot: any = typeof task.params === 'string' ? JSON.parse(task.params) : task.params || {};
    const orchestratorDetails = pRoot.orchestrator_details || {};
    const orchestratorId = orchestratorDetails.orchestrator_task_id || pRoot.orchestrator_task_id || pRoot.task_id || task.id;
    const orchestratorRunId = orchestratorDetails.run_id || pRoot.orchestrator_run_id;
    console.log('[TravelProgressIssue] Orchestrator ID:', orchestratorId);
    console.log('[TravelProgressIssue] Orchestrator RunID:', orchestratorRunId);
    console.log('[TravelProgressIssue] Task list size:', tasksData.length);
    const subtasks = tasksData.filter((t) => {
      const p: any = typeof t.params === 'string' ? JSON.parse(t.params) : t.params || {};
      return (
        (p.orchestrator_task_id_ref === orchestratorId || p.orchestrator_task_id === orchestratorId || p.orchestrator_task_id_ref === task.id || p.orchestrator_task_id === task.id || (orchestratorRunId && p.orchestrator_run_id === orchestratorRunId))
        && t.id !== task.id
      );
    });
    console.log('[TravelProgressIssue] Found subtasks:', subtasks.map(t => ({ id: t.id, status: t.status })));
    if (subtasks.length === 0) {
      toast({ title: 'Progress', description: 'No subtasks found yet.', variant: 'default' });
      return;
    }
    const completed = subtasks.filter((t) => t.status === 'Complete').length;
    const percent = Math.round((completed / subtasks.length) * 100);
    console.log('[TravelProgressIssue] Completed:', completed, 'Total:', subtasks.length, 'Percent:', percent);
    toast({ title: 'Progress', description: `${percent}% Complete`, variant: 'default' });

    // Show inline for 5s
    setProgressPercent(percent);
    setTimeout(() => setProgressPercent(null), 5000);
  };

  const containerClass = cn(
    "p-3 mb-2 bg-zinc-800/95 rounded-md shadow border transition-colors",
    isNew ? "border-teal-400 animate-[flash_3s_ease-in-out]" : "border-zinc-600 hover:border-zinc-400"
  );

  return (
    <div className={containerClass}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-semibold text-zinc-200">{displayTaskType}</span>
        <span
          className={`px-2 py-0.5 text-xs rounded-full ${
            task.status === 'In Progress' ? 'bg-blue-500 text-blue-100' :
            task.status === 'Complete' ? 'bg-green-500 text-green-100' :
            task.status === 'Failed' ? 'bg-red-500 text-red-100' :
            task.status === 'Queued' ? 'bg-purple-500 text-purple-100' :
            task.status === 'Cancelled' ? 'bg-orange-500 text-orange-100' : 'bg-gray-500 text-gray-100'
          }`}
        >
          {task.status}
        </span>
      </div>
      {/* Image previews for Travel Between Images task */}
      {imagesToShow.length > 0 && (
        <div className="flex items-center overflow-x-auto mb-1 mt-2">
          {imagesToShow.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`input-${idx}`}
              className="w-12 h-12 object-cover rounded mr-1 border border-zinc-700"
            />
          ))}
          {extraImageCount > 0 && (
            <span className="text-xs text-zinc-400 ml-1">+ {extraImageCount}</span>
          )}
        </div>
      )}
      {/* Show prompt for Image Generation tasks */}
      {promptText && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5">
            <div className="text-xs text-zinc-200">
              "{promptText.length > 50 ? `${promptText.substring(0, 50)}...` : promptText}"
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>
          Created: {(() => {
            // Handle both createdAt and created_at field names from database
            const dateStr = task.createdAt || (task as any).created_at;
            if (!dateStr) return 'Unknown';
            
            const date = new Date(dateStr);
            if (!isValid(date)) return 'Unknown';
            
            return abbreviateDistance(formatDistanceToNow(date, { addSuffix: true }));
          })()}
        </span>
        {(task.status === 'Queued' || task.status === 'In Progress') && (
          <div className="flex items-center gap-2">
            {taskSupportsProgress(task.taskType) && task.status === 'In Progress' && (
              progressPercent === null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCheckProgress}
                  className="px-2 py-0.5 text-blue-400 hover:bg-blue-900/20 hover:text-blue-300"
                >
                  Check Progress
                </Button>
              ) : (
                <span className="text-blue-300 text-xs">{progressPercent}% Complete</span>
              )
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={cancelTaskMutation.isPending}
              className="px-2 py-0.5 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            >
              {cancelTaskMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </Button>
          </div>
        )}
      </div>
      {/* Add more task details as needed, e.g., from task.params */}
      {/* <pre className="text-xs text-zinc-500 whitespace-pre-wrap break-all">{JSON.stringify(task.params, null, 2)}</pre> */}
    </div>
  );
};

export default TaskItem; 