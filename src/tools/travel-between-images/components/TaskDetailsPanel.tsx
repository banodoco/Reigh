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
import { Check, X } from 'lucide-react';
import { SharedTaskDetails } from './SharedTaskDetails';
import SharedMetadataDetails from '@/shared/components/SharedMetadataDetails';
import { useTaskType } from '@/shared/hooks/useTaskType';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { LoraModel } from '@/shared/components/LoraSelectorModal';

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
  onClose?: () => void;
  basedOnSection?: ReactNode;
  derivedSection?: ReactNode;
  // Variant name editing
  generationName?: string;
  onGenerationNameChange?: (name: string) => void;
  isEditingGenerationName?: boolean;
  onEditingGenerationNameChange?: (editing: boolean) => void;
  // Control whether to show user-provided source images
  showUserImage?: boolean;
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
  onClose,
  basedOnSection,
  derivedSection,
  generationName,
  onGenerationNameChange,
  isEditingGenerationName,
  onEditingGenerationNameChange,
  showUserImage = true
}) => {
  const isMobile = useIsMobile();
  const [showDetailedParams, setShowDetailedParams] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);
  
  // Get task type info from database to check content_type
  const { data: taskTypeInfo } = useTaskType(task?.taskType || null);
  
  // Fetch public LoRAs for proper name display
  const publicLorasQuery = useListPublicResources('lora');
  const availableLoras = ((publicLorasQuery.data || []) as any[]).map(resource => resource.metadata || {}) as LoraModel[];

  const handleApplySettingsFromTask = () => {
    if (taskId && onApplySettingsFromTask && task) {
      onApplySettingsFromTask(taskId, replaceImages, inputImages);
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

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex-shrink-0 p-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-light">Generation Task Details</h3>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-6">
          {/* Generation Summary Section */}
          <div className="space-y-3">
            {(() => {
              // Use content_type from database to determine if this is a video task
              // This automatically handles all video task types including animate_character
              const contentType = taskTypeInfo?.content_type;
              const isVideoTask = contentType === 'video';
              
              // Legacy fallback for tasks before content_type was added
              const isLegacyVideoTask = task.taskType === 'travel_orchestrator' || 
                                       task.taskType?.includes('travel') ||
                                       inputImages.length > 0;
              
              const shouldShowVideoDetails = isVideoTask || isLegacyVideoTask;
              
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
          
          {/* Based On Section */}
          {basedOnSection}
          
          {/* Derived Generations Section */}
          {derivedSection}
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-light text-foreground">Detailed Task Parameters</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetailedParams(!showDetailedParams)}
                className="h-8 px-3 flex items-center space-x-1"
              >
                <svg 
                  className={`h-4 w-4 transition-transform ${showDetailedParams ? 'rotate-180' : ''}`}
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
                      // Custom JSON formatting that handles long strings better
                      const formatValue = (value: any, indent: number = 0): string => {
                        const spaces = '  '.repeat(indent);
                        
                        if (value === null) return 'null';
                        if (typeof value === 'boolean') return value.toString();
                        if (typeof value === 'number') return value.toString();
                        if (typeof value === 'string') {
                          // Break very long strings into multiple lines
                          if (value.length > 80) {
                            const chunks = value.match(/.{1,80}/g) || [value];
                            return `"${chunks.join('" +\n' + spaces + '  "')}"`;
                          }
                          return `"${value}"`;
                        }
                        
                        if (Array.isArray(value)) {
                          if (value.length === 0) return '[]';
                          const items = value.map(item => spaces + '  ' + formatValue(item, indent + 1)).join(',\n');
                          return `[\n${items}\n${spaces}]`;
                        }
                        
                        if (typeof value === 'object') {
                          const entries = Object.entries(value);
                          if (entries.length === 0) return '{}';
                          const items = entries.map(([key, val]) => 
                            `${spaces}  "${key}": ${formatValue(val, indent + 1)}`
                          ).join(',\n');
                          return `{\n${items}\n${spaces}}`;
                        }
                        
                        return String(value);
                      };
                      
                      return formatValue(task?.params ?? {});
                    })()}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
      
      {/* Footer with controls - Sticky to bottom */}
      <div className="flex-shrink-0 p-4 border-t bg-background sticky bottom-0">
        <div className="flex flex-col space-y-3">
          {inputImages.length > 0 && (
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="replaceImages"
                checked={replaceImages}
                onCheckedChange={(checked) => onReplaceImagesChange(checked as boolean)}
              />
              <Label htmlFor="replaceImages" className="text-sm font-light">
                Replace these images
              </Label>
            </div>
          )}
          
          {onApplySettingsFromTask && task && taskId && (
            <Button 
              variant="default" 
              onClick={handleApplySettingsFromTask}
              className="text-sm w-full"
            >
              Apply These Settings
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDetailsPanel;
