import React, { useState, useMemo, useEffect } from 'react';
import { useListTasks, useCancelAllPendingTasks } from '@/shared/hooks/useTasks';
import { useProject } from '@/shared/contexts/ProjectContext';
import TaskItem from './TaskItem';
import { TaskStatus, Task } from '@/types/tasks';
import { taskStatusEnum } from '../../../../db/schema/schema'; // Corrected relative path
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from "@/shared/components/ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator 
} from "@/shared/components/ui/dropdown-menu";
import { ScrollArea } from "@/shared/components/ui/scroll-area"
import { useToast } from '@/shared/hooks/use-toast'; // For user feedback

// Use all statuses from the enum directly
const ALL_POSSIBLE_STATUSES = [...taskStatusEnum] as TaskStatus[];

const TaskList: React.FC = () => {
  const { selectedProjectId } = useProject();
  // Default selected statuses: Queued and In Progress
  const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>(['Queued', 'In Progress']);
  const { toast } = useToast(); // Initialize toast

  const { data: tasks, isLoading, error, refetch } = useListTasks({
    projectId: selectedProjectId,
    // If all selectable statuses are selected or no status is selected, fetch all (undefined).
    // Otherwise, fetch tasks matching the selected statuses.
    status: selectedStatuses.length === 0 || selectedStatuses.length === ALL_POSSIBLE_STATUSES.length 
            ? undefined 
            : selectedStatuses,
  });

  const cancelAllPendingMutation = useCancelAllPendingTasks();

  const pendingTasksCount = useMemo(() => {
    if (!tasks) return 0;
    // If current filter is 'Pending', we can use tasks.length directly if it's accurate
    // Otherwise, or to be safe, filter all tasks to find pending ones for the count.
    // This count is for the button's disabled state, not for the displayed list.
    // For an accurate count of all pending tasks irrespective of current filter:
    // We would need to fetch all tasks or have a specific hook for just pending tasks count.
    // For simplicity, let's assume 'tasks' reflects the current filter.
    // If statusFilter is 'Pending', tasks are pending tasks. If 'All', we need to filter.
    if (selectedStatuses.includes('Queued')) return tasks.length;
    if (selectedStatuses.length === ALL_POSSIBLE_STATUSES.length) return tasks.filter(t => t.status === 'Queued').length;
    return 0; // Not showing pending tasks, so button might be less relevant or show 0
  }, [tasks, selectedStatuses]);
  
  // More accurate pending tasks count by filtering the *currently fetched* tasks if filter is 'All'
  // or by relying on the length if filter is 'Pending'.
  // This relies on `tasks` variable containing the data based on `selectedStatuses`.
  const actualPendingTasksInView = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(task => task.status === 'Queued');
  }, [tasks]);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedStatuses([...ALL_POSSIBLE_STATUSES]);
    } else {
      setSelectedStatuses([]);
    }
  };

  const handleStatusToggle = (status: TaskStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };
  
  const getSelectedStatusText = () => {
    if (selectedStatuses.length === 0) return "None selected";
    if (selectedStatuses.length === ALL_POSSIBLE_STATUSES.length) return "All statuses";
    if (selectedStatuses.length <= 2) return selectedStatuses.join(', ');
    return `${selectedStatuses.length} statuses selected`;
  };

  // Effect to refetch tasks when selectedStatuses changes
  useEffect(() => {
    refetch();
  }, [selectedStatuses, refetch]);

  const handleCancelAllPending = () => {
    if (!selectedProjectId) {
      toast({ title: 'Error', description: 'No project selected.', variant: 'destructive' });
      return;
    }
    cancelAllPendingMutation.mutate({ projectId: selectedProjectId }, {
      onSuccess: (data) => {
        toast({
          title: 'Tasks Cancellation Initiated',
          description: data.message || `Attempting to cancel all pending tasks.`,
          variant: 'default'
        });
        refetch(); // Refetch the current list
      },
      onError: (error) => {
        toast({
          title: 'Cancellation Failed',
          description: error.message || 'Could not cancel all pending tasks.',
          variant: 'destructive'
        });
      }
    });
  };

  const availableStatuses: (TaskStatus | 'All')[] = ['All', ...taskStatusEnum];

  return (
    <div className="p-4 h-full flex flex-col text-zinc-200">
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          {/* Display this button only if there are pending tasks based on the current view or a more specific check */}
          {actualPendingTasksInView.length > 0 && (
             <Button 
                variant="destructive"
                size="sm"
                onClick={handleCancelAllPending}
                disabled={cancelAllPendingMutation.isPending || isLoading}
             >
                {cancelAllPendingMutation.isPending ? 'Cancelling All...' : `Cancel All Pending (${actualPendingTasksInView.length})`}
             </Button>
          )}
        </div>
        <div className="flex gap-2 items-center">
            {/* Multi-select Dropdown for Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[200px] justify-between bg-zinc-700 border-zinc-600 hover:bg-zinc-600">
                  {getSelectedStatusText()}
                  <span className="ml-2">▼</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[200px] bg-zinc-700 text-zinc-200 border-zinc-600 z-[70]">
                <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()} // Prevent menu closing on item click
                  className="hover:bg-zinc-600"
                >
                  <Checkbox
                    id="select-all-status"
                    checked={selectedStatuses.length === ALL_POSSIBLE_STATUSES.length ? true : selectedStatuses.length === 0 ? false : 'indeterminate'}
                    onCheckedChange={handleSelectAll}
                    className="mr-2"
                  />
                  <label htmlFor="select-all-status" className="cursor-pointer flex-grow">All</label>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-600"/>
                {ALL_POSSIBLE_STATUSES.map(status => (
                  <DropdownMenuItem
                    key={status}
                    onSelect={(e) => e.preventDefault()} // Prevent menu closing
                    className="hover:bg-zinc-600"
                  >
                    <Checkbox
                      id={`status-${status}`}
                      checked={selectedStatuses.includes(status)}
                      onCheckedChange={() => handleStatusToggle(status)}
                      className="mr-2"
                    />
                    <label htmlFor={`status-${status}`} className="cursor-pointer flex-grow">{status}</label>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          <Button onClick={() => refetch()} variant="outline" size="sm" className="bg-zinc-700 border-zinc-600 hover:bg-zinc-600">
            Refresh
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-zinc-400">Loading tasks...</p>}
      {error && <p className="text-red-500">Error loading tasks: {error.message}</p>}
      
      {!isLoading && !error && tasks?.length === 0 && (
        <p className="text-zinc-400">No tasks found for the selected criteria.</p>
      )}

      {!isLoading && !error && tasks && tasks.length > 0 && (
        <ScrollArea className="flex-grow pr-3">
            {tasks.map((task: Task) => (
                <TaskItem key={task.id} task={task} />
            ))}
        </ScrollArea>
      )}
    </div>
  );
};

export default TaskList; 