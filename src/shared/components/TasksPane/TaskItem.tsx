import React from 'react';
import { Task } from '@/types/tasks';
import { Button } from '@/shared/components/ui/button';
import { useCancelTask } from '@/shared/hooks/useTasks';
import { useToast } from '@/shared/hooks/use-toast'; // For user feedback

interface TaskItemProps {
  task: Task;
}

const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
  const { toast } = useToast();
  const cancelTaskMutation = useCancelTask();

  const handleCancel = () => {
    cancelTaskMutation.mutate(task.id, {
      onSuccess: () => {
        toast({
          title: 'Task Cancelled',
          description: `Task ${task.taskType} (${task.id.substring(0, 8)}) has been cancelled.`,
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
  };

  return (
    <div className="p-3 mb-2 bg-zinc-800 rounded-md shadow">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-semibold text-zinc-200">{task.taskType}</span>
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
      <p className="text-xs text-zinc-400 mb-1">ID: {task.id.substring(0, 8)}...</p>
      <p className="text-xs text-zinc-400 mb-2">Created: {new Date(task.createdAt).toLocaleString()}</p>
      {/* Add more task details as needed, e.g., from task.params */}
      {/* <pre className="text-xs text-zinc-500 whitespace-pre-wrap break-all">{JSON.stringify(task.params, null, 2)}</pre> */}

      {(task.status === 'Queued' || task.status === 'In Progress') && (
        <Button 
          variant="destructive"
          size="sm" 
          onClick={handleCancel} 
          disabled={cancelTaskMutation.isPending}
          className="w-full mt-1"
        >
          {cancelTaskMutation.isPending ? 'Cancelling...' : 'Cancel Task'}
        </Button>
      )}
    </div>
  );
};

export default TaskItem; 