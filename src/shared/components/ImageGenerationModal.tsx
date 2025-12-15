import React, { useState, useRef, useCallback, Suspense } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { ImageGenerationForm } from '@/tools/image-generation/components/ImageGenerationForm';
import { ImageGenerationFormHandles } from '@/tools/image-generation/components/ImageGenerationForm/types';
import { createBatchImageGenerationTasks, BatchImageGenerationTaskParams } from '@/shared/lib/tasks/imageGeneration';
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ImageGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImageGenerationModal: React.FC<ImageGenerationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const modal = useExtraLargeModal();
  const formRef = useRef<ImageGenerationFormHandles>(null);
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();
  const { getApiKey } = useApiKeys();
  const navigate = useNavigate();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [justQueued, setJustQueued] = useState(false);
  const justQueuedTimeoutRef = useRef<number | null>(null);
  
  const falApiKey = getApiKey('fal_api_key');
  const openaiApiKey = getApiKey('openai_api_key');

  const handleGenerate = useCallback(async (formData: any) => {
    if (!selectedProjectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return;
    }

    const { batchTaskParams } = formData;

    setIsGenerating(true);
    try {
      if (batchTaskParams) {
        console.log('[ImageGenerationModal] Creating batch image generation tasks');
        await createBatchImageGenerationTasks(batchTaskParams);
      } else {
        console.error('[ImageGenerationModal] Missing batchTaskParams');
        throw new Error('Missing batch task parameters');
      }

      // Invalidate generations to ensure they refresh when tasks complete
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId] });
      
      console.log('[ImageGenerationModal] Image generation tasks created successfully');
      setJustQueued(true);
      
      if (justQueuedTimeoutRef.current) {
        clearTimeout(justQueuedTimeoutRef.current);
      }
      justQueuedTimeoutRef.current = window.setTimeout(() => {
        setJustQueued(false);
        justQueuedTimeoutRef.current = null;
      }, 3000);
      
    } catch (error) {
      console.error('[ImageGenerationModal] Error creating tasks:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create tasks.');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedProjectId, queryClient]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (justQueuedTimeoutRef.current) {
        clearTimeout(justQueuedTimeoutRef.current);
      }
    };
  }, []);

  const handleNavigateToTool = useCallback(() => {
    onClose();
    navigate('/tools/image-generation');
  }, [onClose, navigate]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`${modal.className} gap-2 overflow-hidden flex flex-col`}
        style={{
          ...modal.style,
          maxWidth: '900px',
          width: 'calc(100vw - 2rem)',
        }}
        onPointerDownOutside={() => onClose()}
        onInteractOutside={() => onClose()}
        {...modal.props}
      >
        <DialogHeader className={modal.headerClass}>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-xl font-light">Generate Images</DialogTitle>
            <Button variant="secondary" size="sm" onClick={handleNavigateToTool} className="gap-1 flex-shrink-0 mr-2">
              <ExternalLink className="h-4 w-4" />
              Open Tool
            </Button>
          </div>
        </DialogHeader>
        
        <div className={`${modal.scrollClass} -mx-6 -mb-6 px-6 flex-1 min-h-0`}>
          <Suspense fallback={
            <div className="flex flex-col h-full">
              <div className="space-y-6 py-4 flex-1">
                {/* Main Content Layout - matches flex gap-6 flex-col md:flex-row */}
                <div className="flex gap-6 flex-col md:flex-row">
                  {/* Left Column - Prompts and Shot Selector */}
                  <div className="flex-1 space-y-6">
                    {/* PromptsSection skeleton */}
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-32" />
                      <div className="space-y-3">
                        <Skeleton className="h-24 w-full rounded-md" />
                        <Skeleton className="h-24 w-full rounded-md" />
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-9 flex-1 rounded-md" />
                        <Skeleton className="h-9 w-24 rounded-md" />
                      </div>
                    </div>
                    {/* ShotSelector skeleton */}
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                  </div>
                  
                  {/* Right Column - ModelSection */}
                  <div className="md:w-80 space-y-6">
                    {/* ModelSection skeleton */}
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-40" />
                      <div className="space-y-3">
                        <Skeleton className="h-32 w-full rounded-md" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-10 w-full rounded-md" />
                        </div>
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-10 w-full rounded-md" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Sticky GenerateControls skeleton */}
              <div className="sticky bottom-0 z-50 -mx-6 px-6 py-3 bg-background border-t border-zinc-700">
                <div className="flex justify-center">
                  <Skeleton className="h-11 w-full max-w-md rounded-md" />
                </div>
              </div>
            </div>
          }>
            <ImageGenerationForm
              ref={formRef}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              hasApiKey={true}
              apiKey={falApiKey}
              openaiApiKey={openaiApiKey}
              justQueued={justQueued}
              stickyFooter={true}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageGenerationModal;

