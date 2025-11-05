import React from 'react';
import TaskDetailsPanel from '@/tools/travel-between-images/components/TaskDetailsPanel';
import { DerivedGenerationsGrid } from './DerivedGenerationsGrid';
import { GenerationRow } from '@/types/shots';

export interface TaskDetailsPanelWrapperProps {
  // Task details data
  taskDetailsData?: {
    task: any;
    isLoading: boolean;
    error: any;
    inputImages: string[];
    taskId: string | null;
    onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
    onClose?: () => void;
  };
  
  // Generation name
  generationName: string;
  onGenerationNameChange: (name: string) => void;
  isEditingGenerationName: boolean;
  onEditingGenerationNameChange: (editing: boolean) => void;
  
  // Derived generations
  derivedGenerations: GenerationRow[] | null;
  paginatedDerived: GenerationRow[];
  derivedPage: number;
  derivedTotalPages: number;
  onSetDerivedPage: (page: number | ((prev: number) => number)) => void;
  onNavigateToGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  currentMediaId: string;
  currentShotId?: string; // To check if derived items are in current shot
  
  // State
  replaceImages: boolean;
  onReplaceImagesChange: (replace: boolean) => void;
  
  // Close handler
  onClose: () => void;
  
  // Variant
  variant?: 'desktop' | 'mobile';
}

/**
 * TaskDetailsPanelWrapper Component
 * Wraps TaskDetailsPanel with all the standard props wiring
 * Includes the derived generations section
 */
export const TaskDetailsPanelWrapper: React.FC<TaskDetailsPanelWrapperProps> = ({
  taskDetailsData,
  generationName,
  onGenerationNameChange,
  isEditingGenerationName,
  onEditingGenerationNameChange,
  derivedGenerations,
  paginatedDerived,
  derivedPage,
  derivedTotalPages,
  onSetDerivedPage,
  onNavigateToGeneration,
  currentMediaId,
  currentShotId,
  replaceImages,
  onReplaceImagesChange,
  onClose,
  variant = 'desktop',
}) => {
  const isMobile = variant === 'mobile';
  const padding = isMobile ? 'p-3' : 'p-4';

  ,
    derivedGenerationsCount: derivedGenerations?.length || 0,
    variant
  });

  return (
    <TaskDetailsPanel
      task={taskDetailsData?.task}
      isLoading={taskDetailsData?.isLoading || false}
      error={taskDetailsData?.error}
      inputImages={taskDetailsData?.inputImages || []}
      taskId={taskDetailsData?.taskId || null}
      replaceImages={replaceImages}
      onReplaceImagesChange={onReplaceImagesChange}
      onApplySettingsFromTask={taskDetailsData?.onApplySettingsFromTask ? (taskId, replaceImages, inputImages) => {
        taskDetailsData.onApplySettingsFromTask?.(taskId, replaceImages, inputImages);
        onClose(); // Close lightbox after applying settings
      } : undefined}
      onClose={taskDetailsData?.onClose || onClose}
      className=""
      generationName={generationName}
      onGenerationNameChange={onGenerationNameChange}
      isEditingGenerationName={isEditingGenerationName}
      onEditingGenerationNameChange={onEditingGenerationNameChange}
      showUserImage={false}
      derivedSection={
        derivedGenerations && derivedGenerations.length > 0 && onNavigateToGeneration ? (
          <div className="space-y-3 mb-6">
            <div className={padding}>
              <DerivedGenerationsGrid
                derivedGenerations={derivedGenerations}
                paginatedDerived={paginatedDerived}
                derivedPage={derivedPage}
                derivedTotalPages={derivedTotalPages}
                onSetDerivedPage={onSetDerivedPage}
                onNavigate={onNavigateToGeneration}
                currentMediaId={currentMediaId}
                currentShotId={currentShotId}
                variant={variant}
                title={`Based on this (${derivedGenerations.length})`}
                showTopBorder={!!taskDetailsData?.task}
              />
            </div>
          </div>
        ) : null
      }
    />
  );
};

