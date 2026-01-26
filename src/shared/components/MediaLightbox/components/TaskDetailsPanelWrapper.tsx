import React from 'react';
import TaskDetailsPanel from '@/tools/travel-between-images/components/TaskDetailsPanel';

export interface VariantInfo {
  id: string;
  location: string;
  thumbnail_url: string | null;
  variant_type: string | null;
  is_primary: boolean;
}

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

  // State
  replaceImages: boolean;
  onReplaceImagesChange: (replace: boolean) => void;
  
  // Close handler
  onClose: () => void;
  
  // Variant
  variant?: 'desktop' | 'mobile';
  
  // Legacy props - kept for compatibility but no longer used
  derivedItems?: any[] | null;
  paginatedDerived?: any[];
  derivedPage?: number;
  derivedTotalPages?: number;
  onSetDerivedPage?: (page: number | ((prev: number) => number)) => void;
  onNavigateToGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  onVariantSelect?: (variantId: string) => void;
  currentMediaId?: string;
  currentShotId?: string;
  derivedGenerations?: any[] | null;
  activeVariant?: VariantInfo | null;
  primaryVariant?: VariantInfo | null;
  onSwitchToPrimary?: () => void;
}

/**
 * TaskDetailsPanelWrapper Component
 * Wraps TaskDetailsPanel with all the standard props wiring
 * Includes the derived generations section
 */
export const TaskDetailsPanelWrapper: React.FC<TaskDetailsPanelWrapperProps> = ({
  taskDetailsData,
  replaceImages,
  onReplaceImagesChange,
  onClose,
}) => {
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
      className=""
      showUserImage={false}
      derivedSection={null}
      hideHeader={true}
    />
  );
};

