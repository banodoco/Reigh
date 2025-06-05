import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';
import { Info } from 'lucide-react';

interface TaskDetailsModalProps {
  generationId: string;
  children: React.ReactNode;
}

interface Task {
  id: string;
  params: Json;
}

const getDisplayUrl = (relativePath: string | undefined | null): string => {
  const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';
  if (!relativePath) return '/placeholder.svg';
  if (relativePath.startsWith('http') || relativePath.startsWith('blob:') || relativePath.startsWith('data:')) {
    return relativePath;
  }
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanRelative = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  return `${cleanBase}/${cleanRelative}`;
};

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ generationId, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTaskDetails = async () => {
      if (!isOpen || !generationId) return;

      setIsLoading(true);
      try {
        // First, get the generation to find the associated task ID.
        const { data: generationData, error: generationError } = await supabase
          .from('generations')
          .select('tasks')
          .eq('id', generationId)
          .single();

        if (generationError || !generationData) {
          throw new Error(generationError?.message || 'Generation not found.');
        }
        
        const tasks = (generationData as any).tasks as string[];
        if (!tasks || tasks.length === 0) {
            // It's possible there are no tasks, so don't treat as an error
            console.log(`[TaskDetailsModal] No tasks found for generation ID: ${generationId}`);
            setTask(null); // Explicitly set task to null
            return;
        }

        const taskId = tasks[0]; 

        // Then, fetch the task details using the task ID.
        const { data: taskData, error: taskError } = await supabase
          .from('tasks')
          .select('id, params')
          .eq('task_id', taskId)
          .single();

        if (taskError) {
          throw new Error(taskError.message);
        }

        if (taskData) {
          setTask(taskData as unknown as Task);
        } else {
            throw new Error(`Task with ID ${taskId} not found.`)
        }
      } catch (error: any) {
        console.error('[TaskDetailsModal] Error fetching task details:', error);
        toast.error(`Failed to fetch task details: ${error.message}`);
        setTask(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTaskDetails();
  }, [isOpen, generationId]);

  const orchestratorDetails = task?.params && typeof task.params === 'object' && 'orchestrator_details' in task.params 
    ? task.params.orchestrator_details as any 
    : null;

  const inputImages = orchestratorDetails?.input_image_paths_resolved ?? [];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Generation Task Details</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : task ? (
          <div className="space-y-4">
            <div>
                <h3 className="text-md font-semibold mb-2">Input Images</h3>
                {inputImages.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {inputImages.map((img: string, index: number) => (
                        <img 
                            key={index}
                            src={getDisplayUrl(img)} 
                            alt={`Input image ${index + 1}`} 
                            className="rounded-md object-contain bg-muted"
                        />
                    ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">No input images found in task details.</p>
                )}
            </div>
            <div>
              <h3 className="text-md font-semibold mb-2">Task Parameters</h3>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                {JSON.stringify(task.params, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">No task details available for this generation.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailsModal; 