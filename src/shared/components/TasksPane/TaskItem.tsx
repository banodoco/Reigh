import React from 'react';
import { Task } from '@/types/tasks';
import { Button } from '@/shared/components/ui/button';
import { useCancelTask, useListTasks } from '@/shared/hooks/useTasks';
import { useToast } from '@/shared/hooks/use-toast'; // For user feedback
import { formatDistanceToNow, isValid } from 'date-fns';
import { useProject } from '@/shared/contexts/ProjectContext';

interface TaskItemProps {
  task: Task;
}

const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
  const { toast } = useToast();
  const cancelTaskMutation = useCancelTask();

  // Access all tasks for project (used for orchestrator logic)
  const { selectedProjectId } = useProject();
  const { data: allProjectTasks, refetch: refetchAllTasks } = useListTasks({ projectId: selectedProjectId });

  // Map certain task types to more user-friendly names for display purposes
  const displayTaskType = task.taskType === 'travel_orchestrator' ? 'Travel Between Images' : task.taskType;

  // Extract image URLs for Travel Between Images tasks (travel_orchestrator)
  const imageUrls: string[] = React.useMemo(() => {
    if (task.taskType !== 'travel_orchestrator') return [];
    const resolved = (task.params as any)?.orchestrator_details?.input_image_paths_resolved;
    return Array.isArray(resolved) ? resolved as string[] : [];
  }, [task]);
  const imagesToShow = imageUrls.slice(0, 5);
  const extraImageCount = Math.max(0, imageUrls.length - imagesToShow.length);

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
      const orchestratorId = (task.params as any)?.orchestrator_details?.orchestrator_task_id || task.id;
      const subtasks = allProjectTasks.filter(
        (t) => (t.params as any)?.orchestrator_task_id_ref === orchestratorId && ['Queued', 'In Progress'].includes(t.status)
      );
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
    const orchestratorId = (task.params as any)?.orchestrator_details?.orchestrator_task_id || task.id;
    const subtasks = tasksData.filter(
      (t) => (t.params as any)?.orchestrator_task_id_ref === orchestratorId && t.id !== task.id
    );
    if (subtasks.length === 0) {
      toast({ title: 'Progress', description: 'No subtasks found yet.', variant: 'default' });
      return;
    }
    const completed = subtasks.filter((t) => t.status === 'Complete').length;
    const percent = Math.round((completed / subtasks.length) * 100);
    toast({ title: 'Progress', description: `${percent}% Complete`, variant: 'default' });
  };

  return (
    <div className="p-3 mb-2 bg-zinc-800 rounded-md shadow">
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
        <div className="flex items-center overflow-x-auto mb-1">
          {imagesToShow.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`input-${idx}`}
              className="w-12 h-12 object-cover rounded mr-1 border border-zinc-700"
            />
          ))}
          {extraImageCount > 0 && (
            <span className="text-xs text-zinc-400 ml-1">+ {extraImageCount} more</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
        <span>
          Created: {isValid(new Date(task.createdAt)) ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true }) : 'Unknown'}
        </span>
        {(task.status === 'Queued' || task.status === 'In Progress') && (
          <div className="flex items-center gap-2">
            {task.taskType === 'travel_orchestrator' && task.status === 'In Progress' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCheckProgress}
                className="px-2 py-0.5 text-blue-400 hover:bg-blue-900/20 hover:text-blue-300"
              >
                Check Progress
              </Button>
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