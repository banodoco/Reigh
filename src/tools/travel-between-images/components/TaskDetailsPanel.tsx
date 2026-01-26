import React, { useState, ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Separator } from '@/shared/components/ui/separator';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Label } from '@/shared/components/ui/label';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Task } from '@/types/tasks';
import { Check, Copy, CornerDownLeft, ImageIcon } from 'lucide-react';
import { SharedTaskDetails } from './SharedTaskDetails';
import SharedMetadataDetails from '@/shared/components/SharedMetadataDetails';
import { useTaskType } from '@/shared/hooks/useTaskType';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { isVideoTaskType } from '@/shared/lib/taskTypeUtils';

interface TaskDetailsPanelProps {
  task: Task | null;
  isLoading: boolean;
  error: any;
  inputImages: string[];
  replaceImages: boolean;
  onReplaceImagesChange: (checked: boolean) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  taskId: string | null;
  className?: string;
  basedOnSection?: ReactNode;
  derivedSection?: ReactNode;
  // Variant name editing
  generationName?: string;
  onGenerationNameChange?: (name: string) => void;
  isEditingGenerationName?: boolean;
  onEditingGenerationNameChange?: (editing: boolean) => void;
  // Control whether to show user-provided source images
  showUserImage?: boolean;
  // Hide the header (title is shown in parent component)
  hideHeader?: boolean;
}

const TaskDetailsPanel: React.FC<TaskDetailsPanelProps> = ({
  task,
  isLoading,
  error,
  inputImages,
  replaceImages,
  onReplaceImagesChange,
  onApplySettingsFromTask,
  taskId,
  className = "",
  basedOnSection,
  derivedSection,
  generationName,
  onGenerationNameChange,
  isEditingGenerationName,
  onEditingGenerationNameChange,
  showUserImage = true,
  hideHeader = false
}) => {
  const isMobile = useIsMobile();
  const [showDetailedParams, setShowDetailedParams] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);
  const [paramsCopied, setParamsCopied] = useState(false);
  
  // Get task type info from database to check content_type
  const { data: taskTypeInfo } = useTaskType(task?.taskType || null);
  
  // Fetch public LoRAs for proper name display
  const { data: availableLoras } = usePublicLoras();

  const handleApplySettingsFromTask = () => {
    if (taskId && onApplySettingsFromTask && task) {
      onApplySettingsFromTask(taskId, replaceImages, inputImages);
    }
  };

  const handleCopyParams = async () => {
    if (!task?.params) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(task.params, null, 2));
      setParamsCopied(true);
      setTimeout(() => setParamsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy parameters:', err);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex justify-center items-center h-64 ${className}`}>
        <div className="flex flex-col items-center space-y-3">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm text-muted-foreground">Loading task details...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className={`flex flex-col ${className}`}>
        {/* Based On Section - show even without task details */}
        {basedOnSection}
        
        {/* Derived Generations Section - show even without task details */}
        {derivedSection}
        
        {/* No task message - only show if there's also no based on or derived sections */}
        {!basedOnSection && !derivedSection && (
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
    );
  }

  // When hideHeader is true, we're embedded in a parent scroll container (like InfoPanel)
  // so don't force height or add our own ScrollArea
  const wrapperClass = hideHeader
    ? `flex flex-col ${className}`
    : `flex flex-col h-full ${className}`;

  // Match EditPanelLayout padding: p-6 desktop, p-3 mobile
  const padding = isMobile ? 'p-3' : 'p-6';

  const contentWrapper = (content: React.ReactNode) => {
    if (hideHeader) {
      // No scroll wrapper - parent handles scrolling
      return <div className={padding}>{content}</div>;
    }
    // Use ScrollArea for standalone usage
    return <ScrollArea className={`flex-1 ${padding} overflow-y-auto`}>{content}</ScrollArea>;
  };

  return (
    <div className={wrapperClass}>
      {!hideHeader && (
        <div className="flex-shrink-0 p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-light">Generation Task Details</h3>
            {taskId && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(taskId);
                  setIdCopied(true);
                  setTimeout(() => setIdCopied(false), 2000);
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  idCopied
                    ? "text-green-400"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {idCopied ? 'copied' : 'id'}
              </button>
            )}
          </div>
        </div>
      )}

      {contentWrapper(
        <div className="space-y-6">
          {/* Generation Summary Section */}
          <div className="space-y-3">
            {(() => {
              // Use content_type from database to determine if this is a video task
              // This automatically handles all video task types including animate_character
              const contentType = taskTypeInfo?.content_type;
              const isVideoTask = contentType === 'video';
              
              // Legacy fallback for tasks before content_type was added
              // Uses centralized isVideoTaskType utility
              const isLegacyVideoTask = isVideoTaskType(task.taskType) || inputImages.length > 0;
              
              // Image edit tasks should also use SharedTaskDetails
              const isImageEditTask = [
                'z_image_turbo_i2i',
                'image_inpaint',
                'qwen_image_edit',
                'magic_edit',
                'kontext_image_edit',
                'flux_image_edit',
              ].includes(task.taskType);

              const shouldShowVideoDetails = isVideoTask || isLegacyVideoTask || isImageEditTask;
              
              if (shouldShowVideoDetails) {
                return (
                  <SharedTaskDetails
                    task={task}
                    inputImages={inputImages}
                    variant="panel"
                    isMobile={isMobile}
                    showAllImages={showAllImages}
                    onShowAllImagesChange={setShowAllImages}
                    showFullPrompt={showFullPrompt}
                    onShowFullPromptChange={setShowFullPrompt}
                    generationName={generationName}
                    onGenerationNameChange={onGenerationNameChange}
                    isEditingGenerationName={isEditingGenerationName}
                    onEditingGenerationNameChange={onEditingGenerationNameChange}
                    showFullNegativePrompt={showFullNegativePrompt}
                    onShowFullNegativePromptChange={setShowFullNegativePrompt}
                    availableLoras={availableLoras}
                  />
                );
              } else {
                // Image generation task
                return (
                  <SharedMetadataDetails
                    metadata={{
                      prompt: task.params?.prompt,
                      tool_type: task.taskType,
                      originalParams: task.params,
                      ...(task.params as any)
                    }}
                    variant="panel"
                    isMobile={isMobile}
                    showFullPrompt={showFullPrompt}
                    onShowFullPromptChange={setShowFullPrompt}
                    showFullNegativePrompt={showFullNegativePrompt}
                    onShowFullNegativePromptChange={setShowFullNegativePrompt}
                    showUserImage={showUserImage}
                  />
                );
              }
            })()}
          </div>
          
          {/* Detailed Parameters - Show ABOVE "Based on this" list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyParams}
                  className="h-7 px-2 -ml-2"
                  title="Copy all parameters"
                >
                  {paramsCopied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
                <h4 className="text-sm font-medium text-muted-foreground">Detailed Task Parameters</h4>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetailedParams(!showDetailedParams)}
                className="h-7 px-2 flex items-center space-x-1 text-muted-foreground hover:text-foreground"
              >
                <svg 
                  className={`h-3.5 w-3.5 transition-transform ${showDetailedParams ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-xs">
                  {showDetailedParams ? 'Hide' : 'Show'}
                </span>
              </Button>
            </div>
            {showDetailedParams && (
              <div className="bg-muted/30 rounded-lg border p-4 overflow-hidden">
                <div className="overflow-x-auto">
                  <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed min-w-0" style={{ wordBreak: 'break-all', overflowWrap: 'break-word' }}>
                    {(() => {
                      return JSON.stringify(task?.params ?? {}, null, 2);
                    })()}
                  </pre>
                </div>
              </div>
            )}
          </div>
          
          {/* Based On Section */}
          {basedOnSection}
          
          {/* Derived Generations Section - Show AFTER detailed parameters */}
          {derivedSection}
        </div>
      )}

      {/* Footer with controls - Sticky to bottom - only show when Apply Settings is available */}
      {onApplySettingsFromTask && task && taskId && (
        <div className="flex-shrink-0 border-t bg-gradient-to-t from-background via-background to-background/95 sticky bottom-0">
          <div className="p-4 flex items-center gap-3">
            {/* Checkbox toggle for including images */}
            {inputImages.length > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground">Include</span>
                <label 
                  htmlFor="replaceImages"
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all
                    border
                    ${replaceImages 
                      ? 'bg-primary/10 border-primary/30 text-foreground' 
                      : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'
                    }
                  `}
                >
                  <Checkbox 
                    id="replaceImages"
                    checked={replaceImages}
                    onCheckedChange={(checked) => onReplaceImagesChange(checked as boolean)}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium whitespace-nowrap">
                    {inputImages.length} image{inputImages.length !== 1 ? 's' : ''}
                  </span>
                </label>
              </div>
            )}
            
            {/* Apply button */}
            <Button 
              variant="retro"
              size="retro-sm"
              onClick={handleApplySettingsFromTask}
              className="flex-1 gap-2"
            >
              <CornerDownLeft className="h-4 w-4" />
              Apply Settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetailsPanel;
