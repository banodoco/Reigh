import React, { useState, useRef, useCallback, Suspense } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { ImageGenerationForm } from '@/tools/image-generation/components/ImageGenerationForm';
import { ImageGenerationFormHandles } from '@/tools/image-generation/components/ImageGenerationForm/types';
import { createBatchImageGenerationTasks, BatchImageGenerationTaskParams } from '@/shared/lib/tasks/imageGeneration';
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Skeleton } from '@/shared/components/ui/skeleton';

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`${modal.className} gap-2 overflow-hidden`}
        style={{
          ...modal.style,
          maxWidth: '900px',
          width: 'calc(100vw - 2rem)',
          // On mobile, position modal higher to avoid overlapping with displayed images
          ...(modal.isMobile ? {
            top: '10%',
            transform: 'translateX(-50%) translateY(0)',
          } : {})
        }}
        {...modal.props}
      >
        <DialogHeader className={modal.headerClass}>
          <DialogTitle className="text-xl font-light">Generate Images</DialogTitle>
        </DialogHeader>
        
        <div className={`${modal.scrollClass} -mx-6 px-6`}>
          <Suspense fallback={
            <div className="space-y-6 py-4">
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
              
              {/* GenerateControls skeleton */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                  <Skeleton className="h-10 w-32 rounded-md" />
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
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageGenerationModal;

