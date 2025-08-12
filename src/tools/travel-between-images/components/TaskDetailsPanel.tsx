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

interface TaskDetailsPanelProps {
  task: Task | null;
  isLoading: boolean;
  error: any;
  inputImages: string[];
  replaceImages: boolean;
  onReplaceImagesChange: (checked: boolean) => void;
  onApplySettings?: (settings: any) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  taskId: string | null;
  className?: string;
}

const TaskDetailsPanel: React.FC<TaskDetailsPanelProps> = ({ 
  task, 
  isLoading, 
  error, 
  inputImages, 
  replaceImages, 
  onReplaceImagesChange, 
  onApplySettings, 
  onApplySettingsFromTask, 
  taskId,
  className = ""
}) => {
  const isMobile = useIsMobile();
  const [showDetailedParams, setShowDetailedParams] = useState(true);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);

  // Helper to safely access orchestrator payload
  const orchestratorPayload = (task as any)?.params?.full_orchestrator_payload as any;
  
  // Get LoRAs from the correct location (orchestrator payload first, then fallback to params)
  const additionalLoras = (orchestratorPayload?.additional_loras || (task as any)?.params?.additional_loras) as Record<string, any> | undefined;

  const handleApplySettings = () => {
    if (task && onApplySettings) {
      onApplySettings(task.params);
    }
  };

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
      <div className={`flex justify-center items-center h-64 ${className}`}>
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">No task details available for this generation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex-shrink-0 p-4 border-b">
        <h3 className="text-lg font-semibold">Generation Task Details</h3>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* Generation Summary Section */}
          <div className="space-y-3">
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
              {/* Input Images Section - Inside Generation Summary */}
              {inputImages.length > 0 && (() => {
                const imagesPerRow = isMobile ? 3 : 6;
                const imagesToShow = showAllImages ? inputImages : inputImages.slice(0, imagesPerRow);
                const remainingCount = inputImages.length - imagesPerRow;
                
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Input Images</p>
                        <span className="text-xs text-muted-foreground">({inputImages.length} image{inputImages.length !== 1 ? 's' : ''})</span>
                      </div>
                      {inputImages.length > imagesPerRow && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAllImages(!showAllImages)}
                          className="h-6 px-2 text-xs"
                        >
                          {showAllImages ? 'Show Less' : `Show ${remainingCount} More`}
                        </Button>
                      )}
                    </div>
                    <div className={`grid gap-2 ${isMobile ? 'grid-cols-3' : 'grid-cols-6'}`}>
                      {imagesToShow.map((img: string, index: number) => (
                        <div key={index} className="relative group">
                          <img 
                            src={img} 
                            alt={`Input image ${index + 1}`} 
                            className="w-full aspect-square object-cover rounded-md border shadow-sm transition-transform group-hover:scale-105"
                          />
                          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                            {index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              
              {/* Prompts and Technical Settings Section */}
              <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                {/* Prompts Section */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
                    {(() => {
                      const prompt = orchestratorPayload?.base_prompts_expanded?.[0] || (task as any)?.params?.prompt || 'N/A';
                      const maxLength = isMobile ? 100 : 150;
                      const shouldTruncate = prompt.length > maxLength;
                      const displayText = showFullPrompt || !shouldTruncate ? prompt : prompt.slice(0, maxLength) + '...';
                      
                      return (
                        <div>
                          <p className="text-sm font-medium break-words whitespace-pre-wrap">
                            {displayText}
                          </p>
                          {shouldTruncate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowFullPrompt(!showFullPrompt)}
                              className="h-6 px-0 text-xs text-primary mt-1"
                            >
                              {showFullPrompt ? 'Show Less' : 'Show More'}
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Negative Prompt</p>
                    {(() => {
                      const negativePrompt = orchestratorPayload?.negative_prompts_expanded?.[0] || (task as any)?.params?.negative_prompt || 'N/A';
                      const maxLength = isMobile ? 100 : 150;
                      const shouldTruncate = negativePrompt.length > maxLength;
                      const displayText = showFullNegativePrompt || !shouldTruncate ? negativePrompt : negativePrompt.slice(0, maxLength) + '...';
                      
                      return (
                        <div>
                          <p className="text-sm font-medium break-words whitespace-pre-wrap">
                            {displayText}
                          </p>
                          {shouldTruncate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowFullNegativePrompt(!showFullNegativePrompt)}
                              className="h-6 px-0 text-xs text-primary mt-1"
                            >
                              {showFullNegativePrompt ? 'Show Less' : 'Show More'}
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                
                {/* Technical Settings */}
                {!isMobile && (
                  <div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Steps</p>
                        <p className="text-sm font-medium">
                          {orchestratorPayload?.steps || (task as any)?.params?.num_inference_steps || 'N/A'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolution</p>
                        <p className="text-sm font-medium">{(task as any)?.params?.parsed_resolution_wh || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Frames / Segment</p>
                        <p className="text-sm font-medium">
                          {orchestratorPayload?.segment_frames_expanded?.[0] || (task as any)?.params?.segment_frames_expanded || 'N/A'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Context Frames</p>
                        <p className="text-sm font-medium">
                          {(task as any)?.params?.frame_overlap_settings_expanded?.[0] || orchestratorPayload?.frame_overlap_expanded?.[0] || (task as any)?.params?.frame_overlap_expanded || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Technical Settings */}
              {isMobile && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Steps</p>
                    <p className="text-sm font-medium">
                      {orchestratorPayload?.steps || (task as any)?.params?.num_inference_steps || 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolution</p>
                    <p className="text-sm font-medium">{(task as any)?.params?.parsed_resolution_wh || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Frames / Segment</p>
                    <p className="text-sm font-medium">
                      {orchestratorPayload?.segment_frames_expanded?.[0] || (task as any)?.params?.segment_frames_expanded || 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Context Frames</p>
                    <p className="text-sm font-medium">
                      {(task as any)?.params?.frame_overlap_settings_expanded?.[0] || orchestratorPayload?.frame_overlap_expanded?.[0] || (task as any)?.params?.frame_overlap_expanded || 'N/A'}
                    </p>
                  </div>
                </div>
              )}

              {/* LoRAs Section */}
              {additionalLoras && Object.keys(additionalLoras).length > 0 && (
                <div className="pt-3 border-t border-muted-foreground/20">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LoRAs Used</p>
                    <div className="space-y-2">
                      {Object.entries(additionalLoras).map(([url, strength]) => {
                        const fileName = url.split('/').pop() || 'Unknown';
                        const displayName = fileName.replace(/\.(safetensors|ckpt|pt)$/, '');
                        return (
                          <div key={url} className="flex items-center justify-between p-2 bg-background/50 rounded border">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" title={displayName}>
                                {displayName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate" title={url}>
                                {url}
                              </p>
                            </div>
                            <div className="text-sm font-medium text-muted-foreground ml-2">
                              {strength}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold text-foreground">Detailed Task Parameters</h3>
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
              <div className="bg-muted/30 rounded-lg border p-4">
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {JSON.stringify(task?.params ?? {}, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
      
      {/* Footer with controls */}
      <div className="flex-shrink-0 p-4 border-t">
        <div className="flex flex-col space-y-3">
          {inputImages.length > 0 && (
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="replaceImages"
                checked={replaceImages}
                onCheckedChange={(checked) => onReplaceImagesChange(checked as boolean)}
              />
              <Label htmlFor="replaceImages" className="text-sm font-medium">
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
