import React, { useState, useMemo, useEffect } from 'react';
import { useListTasks } from '@/shared/hooks/useTasks';
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

// Use all statuses from the enum directly
const ALL_POSSIBLE_STATUSES = [...taskStatusEnum] as TaskStatus[];

const TaskList: React.FC = () => {
  const { selectedProjectId } = useProject();
  // Default selected statuses: Queued and In Progress
  const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>(['Queued', 'In Progress']);

  const { data: tasks, isLoading, error, refetch } = useListTasks({
    projectId: selectedProjectId,
    // If all selectable statuses are selected or no status is selected, fetch all (undefined).
    // Otherwise, fetch tasks matching the selected statuses.
    status: selectedStatuses.length === 0 || selectedStatuses.length === ALL_POSSIBLE_STATUSES.length 
            ? undefined 
            : selectedStatuses,
  });

  // State to track tasks that have just been added for flash effect
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const prevTaskIdsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!tasks) return;
    const currentIds = new Set(tasks.map(t => t.id));
    const newlyAddedIds = tasks
      .filter(t => !prevTaskIdsRef.current.has(t.id))
      .map(t => t.id);

    if (newlyAddedIds.length > 0) {
      setNewTaskIds(new Set(newlyAddedIds));
      const timer = setTimeout(() => setNewTaskIds(new Set()), 3000);
      return () => clearTimeout(timer);
    }

    // Update previous IDs ref after processing
    prevTaskIdsRef.current = currentIds;
  }, [tasks]);

  // Filter out travel_segment and travel_stitch tasks so they do not appear in the sidebar
  const filteredTasks = useMemo(() => {
    if (!tasks) return [] as Task[];
    const withoutHidden = tasks.filter(task => !['travel_segment', 'travel_stitch'].includes(task.taskType));
    // Sort: In Progress first, then by createdAt desc
    return withoutHidden.sort((a, b) => {
      const aInProgress = a.status === 'In Progress';
      const bInProgress = b.status === 'In Progress';
      if (aInProgress && !bInProgress) return -1;
      if (!aInProgress && bInProgress) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
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



  const availableStatuses: (TaskStatus | 'All')[] = ['All', ...taskStatusEnum];

  return (
    <div className="p-4 h-full flex flex-col text-zinc-200">
      <div className="mb-4">
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
      
      {!isLoading && !error && filteredTasks.length === 0 && (
        <p className="text-zinc-400">No tasks found for the selected criteria.</p>
      )}

      {!isLoading && !error && filteredTasks.length > 0 && (
        <ScrollArea className="flex-grow pr-3">
            {filteredTasks.map((task: Task, idx: number) => (
                <React.Fragment key={task.id}>
                  <TaskItem task={task} isNew={newTaskIds.has(task.id)} />
                  {idx < filteredTasks.length - 1 && (
                    <hr className="my-2 border-zinc-700" />
                  )}
                </React.Fragment>
            ))}
        </ScrollArea>
      )}
    </div>
  );
};

export default TaskList; 