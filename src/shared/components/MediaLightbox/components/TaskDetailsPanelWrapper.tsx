import React from 'react';
import TaskDetailsPanel from '@/tools/travel-between-images/components/TaskDetailsPanel';
import { DerivedGenerationsGrid } from './DerivedGenerationsGrid';
import { GenerationRow } from '@/types/shots';
import { DerivedItem } from '@/shared/hooks/useGenerations';

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
  
  // Derived items (unified: generations + variants)
  derivedItems?: DerivedItem[] | null;
  paginatedDerived: DerivedItem[];
  derivedPage: number;
  derivedTotalPages: number;
  onSetDerivedPage: (page: number | ((prev: number) => number)) => void;
  onNavigateToGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  /** Callback to switch to a variant (for variant items) */
  onVariantSelect?: (variantId: string) => void;
  currentMediaId: string;
  currentShotId?: string; // To check if derived items are in current shot
  
  /** @deprecated Use derivedItems instead */
  derivedGenerations?: GenerationRow[] | null;
  
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
  derivedItems,
  derivedGenerations, // Legacy prop
  paginatedDerived,
  derivedPage,
  derivedTotalPages,
  onSetDerivedPage,
  onNavigateToGeneration,
  onVariantSelect,
  currentMediaId,
  currentShotId,
  replaceImages,
  onReplaceImagesChange,
  onClose,
  variant = 'desktop',
}) => {
  const isMobile = variant === 'mobile';
  const padding = isMobile ? 'p-3' : 'p-4';

  // Use derivedItems if provided, otherwise fall back to legacy derivedGenerations
  const effectiveDerivedItems = derivedItems || derivedGenerations;
  const totalCount = effectiveDerivedItems?.length || 0;

  console.log('[DerivedItems] 📄 TaskDetailsPanelWrapper rendering:', {
    hasTaskDetailsData: !!taskDetailsData,
    taskDetailsData: taskDetailsData ? {
      hasTask: !!taskDetailsData.task,
      isLoading: taskDetailsData.isLoading,
      hasError: !!taskDetailsData.error,
      taskId: taskDetailsData.taskId,
      inputImagesCount: taskDetailsData.inputImages?.length
    } : null,
    currentMediaId: currentMediaId.substring(0, 8),
    derivedItemsCount: totalCount,
    hasVariantSelect: !!onVariantSelect,
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
        effectiveDerivedItems && totalCount > 0 && onNavigateToGeneration ? (
          <div className="space-y-3 mb-6">
            <div className={padding}>
              <DerivedGenerationsGrid
                derivedItems={derivedItems || undefined}
                derivedGenerations={derivedGenerations || undefined}
                paginatedDerived={paginatedDerived}
                derivedPage={derivedPage}
                derivedTotalPages={derivedTotalPages}
                onSetDerivedPage={onSetDerivedPage}
                onNavigate={onNavigateToGeneration}
                onVariantSelect={onVariantSelect}
                currentMediaId={currentMediaId}
                currentShotId={currentShotId}
                variant={variant}
                title={`Based on this (${totalCount})`}
                showTopBorder={!!taskDetailsData?.task}
              />
            </div>
          </div>
        ) : null
      }
    />
  );
};

