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
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { getDisplayUrl } from '@/shared/lib/utils';

// Local definition for Json type to remove dependency on supabase client types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

interface TaskDetailsModalProps {
  generationId: string;
  children: React.ReactNode;
}

interface Task {
  id: string;
  params: Json;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ generationId, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTaskDetails = async () => {
      if (!isOpen || !generationId) return;

      setIsLoading(true);
      try {
        // Step 1: Fetch the task ID from the generation
        const taskIdResponse = await fetch(`/api/generations/${generationId}/task-id`);
        if (!taskIdResponse.ok) {
          const errorData = await taskIdResponse.json().catch(() => ({ message: `Generation not found or has no task.` }));
          throw new Error(errorData.message);
        }
        const { taskId } = await taskIdResponse.json();

        if (!taskId) {
            console.log(`[TaskDetailsModal] No task ID found for generation ID: ${generationId}`);
            setTask(null);
            return;
        }

        // Step 2: Fetch the task details using the task ID
        const taskDetailsResponse = await fetch(`/api/tasks/by-task-id/${taskId}`);
        if (!taskDetailsResponse.ok) {
            const errorData = await taskDetailsResponse.json().catch(() => ({ message: `Task with ID ${taskId} not found.` }));
            throw new Error(errorData.message);
        }
        
        const taskData = await taskDetailsResponse.json();
        setTask(taskData);

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
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-semibold">Generation Task Details</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="flex flex-col items-center space-y-3">
                <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-muted-foreground">Loading task details...</p>
              </div>
            </div>
          ) : task ? (
            <div className="overflow-y-auto pr-2 space-y-6" style={{ maxHeight: 'calc(80vh - 140px)' }}>
              {/* Input Images Section - Prominently displayed at top */}
              {inputImages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <h3 className="text-lg font-semibold text-foreground">Input Images</h3>
                    <span className="text-sm text-muted-foreground">({inputImages.length} image{inputImages.length !== 1 ? 's' : ''})</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-muted/30 rounded-lg border">
                    {inputImages.map((img: string, index: number) => (
                      <div key={index} className="relative group">
                        <img 
                          src={getDisplayUrl(img)} 
                          alt={`Input image ${index + 1}`} 
                          className="w-full aspect-square object-cover rounded-md border shadow-sm transition-transform group-hover:scale-105"
                        />
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {orchestratorDetails && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <h3 className="text-lg font-semibold text-foreground">Orchestrator Summary</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
                    {orchestratorDetails.model_name && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model</p>
                        <p className="text-sm font-medium">{orchestratorDetails.model_name}</p>
                      </div>
                    )}
                    {orchestratorDetails.seed_base && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seed</p>
                        <p className="text-sm font-medium">{orchestratorDetails.seed_base}</p>
                      </div>
                    )}
                    {orchestratorDetails.parsed_resolution_wh && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolution</p>
                        <p className="text-sm font-medium">{orchestratorDetails.parsed_resolution_wh}</p>
                      </div>
                    )}
                    {orchestratorDetails.num_new_segments_to_generate && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Segments</p>
                        <p className="text-sm font-medium">{orchestratorDetails.num_new_segments_to_generate}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <h3 className="text-lg font-semibold text-foreground">Task Parameters</h3>
                </div>
                <div className="bg-muted/30 rounded-lg border p-4">
                  <div className="max-h-96 overflow-y-auto">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                      {JSON.stringify(task.params, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center h-64">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">No task details available for this generation.</p>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailsModal; 