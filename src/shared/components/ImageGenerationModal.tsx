import React, { useState, useRef, useCallback } from 'react';
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
        }}
        {...modal.props}
      >
        <DialogHeader className={modal.headerClass}>
          <DialogTitle className="text-xl font-light">Generate Images</DialogTitle>
        </DialogHeader>
        
        <div className={`${modal.scrollClass} -mx-6 px-6`}>
          <ImageGenerationForm
            ref={formRef}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            hasApiKey={true}
            apiKey={falApiKey}
            openaiApiKey={openaiApiKey}
            justQueued={justQueued}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageGenerationModal;

