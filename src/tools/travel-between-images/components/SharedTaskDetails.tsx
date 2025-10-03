import React from 'react';
import { Button } from '@/shared/components/ui/button';

interface SharedTaskDetailsProps {
  task: any;
  inputImages: string[];
  variant: 'hover' | 'modal' | 'panel';
  isMobile?: boolean;
  showAllImages?: boolean;
  onShowAllImagesChange?: (show: boolean) => void;
  showFullPrompt?: boolean;
  onShowFullPromptChange?: (show: boolean) => void;
  showFullNegativePrompt?: boolean;
  onShowFullNegativePromptChange?: (show: boolean) => void;
}

export const SharedTaskDetails: React.FC<SharedTaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
  showAllImages = false,
  onShowAllImagesChange,
  showFullPrompt = false,
  onShowFullPromptChange,
  showFullNegativePrompt = false,
  onShowFullNegativePromptChange,
}) => {
  // Helper to safely access orchestrator payload from multiple possible locations
  const orchestratorPayload = task?.params?.full_orchestrator_payload as any;
  const orchestratorDetails = task?.params?.orchestrator_details as any;
  
  // Get LoRAs from the correct location (try all possible paths)
  const additionalLoras = (
    orchestratorPayload?.additional_loras || 
    orchestratorDetails?.additional_loras || 
    task?.params?.additional_loras
  ) as Record<string, any> | undefined;

  // Size configuration based on variant
  const config = {
    hover: {
      textSize: 'text-xs',
      fontWeight: 'font-light',
      iconSize: 'h-2.5 w-2.5',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: 'grid-cols-6',
      maxImages: 5,
      promptLength: 100,
      negativePromptLength: 80,
      loraNameLength: 25,
      maxLoras: 2,
    },
    modal: {
      textSize: 'text-sm',
      fontWeight: 'font-light',
      iconSize: 'h-3 w-3',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: 'grid-cols-6',
      maxImages: 5,
      promptLength: 150,
      negativePromptLength: 150,
      loraNameLength: 30,
      maxLoras: 10,
    },
    panel: {
      textSize: 'text-sm',
      fontWeight: 'font-light',
      iconSize: 'h-3 w-3',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: isMobile ? 'grid-cols-3' : inputImages.length <= 4 ? 'grid-cols-4' : inputImages.length <= 8 ? 'grid-cols-4' : 'grid-cols-6',
      maxImages: isMobile ? 6 : inputImages.length <= 4 ? 4 : inputImages.length <= 8 ? 8 : 11,
      promptLength: isMobile ? 100 : 150,
      negativePromptLength: isMobile ? 100 : 150,
      loraNameLength: 40,
      maxLoras: 10,
    },
  }[variant];

  return (
    <div className={`space-y-3 p-3 bg-muted/30 rounded-lg border ${variant === 'panel' ? '' : 'w-[360px]'}`}>
      {/* Header */}
      <div>
        <h3 className={`${config.textSize} font-semibold uppercase tracking-wide text-foreground`}>Video Travel</h3>
        <div className="border-t border-muted-foreground/20 mt-2"></div>
      </div>

      {/* Guidance Images Section */}
      {inputImages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>
                Guidance
              </p>
              <span className={`${config.textSize} text-muted-foreground`}>
                ({inputImages.length} image{inputImages.length !== 1 ? 's' : ''})
              </span>
            </div>
          </div>
          <div className={`grid gap-1 ${config.imageGridCols} justify-center`}>
            {(showAllImages ? inputImages : inputImages.slice(0, config.maxImages)).map((img: string, index: number) => (
              <div key={index} className="relative group">
                <img 
                  src={img} 
                  alt={`Input image ${index + 1}`} 
                  className="w-full aspect-square object-cover rounded border shadow-sm transition-transform group-hover:scale-105"
                />
                <div className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                  {index + 1}
                </div>
              </div>
            ))}
            {inputImages.length > config.maxImages && !showAllImages && (
              <div 
                className="relative group cursor-pointer"
                onClick={() => onShowAllImagesChange?.(true)}
              >
                <div className="w-full aspect-square bg-muted/50 hover:bg-muted/70 rounded border shadow-sm transition-all group-hover:scale-105 flex items-center justify-center">
                  <span className={`${config.textSize} text-muted-foreground font-medium text-center`}>
                    {inputImages.length - config.maxImages} more
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Style Reference Image Section */}
      {(() => {
        // Check multiple possible locations for style reference data
        const styleImage = task?.params?.style_reference_image || 
                          orchestratorDetails?.style_reference_image;
        const styleStrength = task?.params?.style_reference_strength ?? 
                             orchestratorDetails?.style_reference_strength;
        const subjectStrength = task?.params?.subject_strength ?? 
                               orchestratorDetails?.subject_strength;
        
        const hasStyleReference = styleImage && styleImage !== '';
        
        if (!hasStyleReference) return null;
        
        return (
          <div className="space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>
              Style Reference
            </p>
            <div className="flex items-center gap-3">
              <div className="relative group flex-shrink-0" style={{ width: '80px', height: '80px' }}>
                <img 
                  src={styleImage} 
                  alt="Style reference" 
                  className="w-full h-full object-cover rounded border shadow-sm transition-transform group-hover:scale-105"
                />
              </div>
              <div className="flex flex-col gap-1 text-left">
                {styleStrength !== undefined && styleStrength !== null && (
                  <div className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    Style: {Math.round(styleStrength * 100)}%
                  </div>
                )}
                {subjectStrength !== undefined && subjectStrength !== null && (
                  <div className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    Subject: {Math.round(subjectStrength * 100)}%
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* Prompts and Technical Settings */}
      <div className={`grid gap-3 ${variant === 'hover' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {/* Prompts Section */}
        <div className="space-y-3">
          {/* Prompt */}
          {(() => {
            const prompt = orchestratorDetails?.base_prompts_expanded?.[0] || orchestratorPayload?.base_prompts_expanded?.[0] || task?.params?.prompt;
            if (prompt) {
              const shouldTruncate = prompt.length > config.promptLength;
              const displayText = showFullPrompt || !shouldTruncate ? prompt : prompt.slice(0, config.promptLength) + '...';
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                    {displayText}
                  </p>
                  {shouldTruncate && onShowFullPromptChange && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onShowFullPromptChange(!showFullPrompt)}
                      className="h-6 px-0 text-xs text-primary mt-1"
                    >
                      {showFullPrompt ? 'Show Less' : 'Show More'}
                    </Button>
                  )}
                </div>
              );
            } else {
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                    None
                  </p>
                </div>
              );
            }
          })()}
          
          {/* Negative Prompt */}
          {(() => {
            const negativePrompt = orchestratorDetails?.negative_prompts_expanded?.[0] || orchestratorPayload?.negative_prompts_expanded?.[0] || task?.params?.negative_prompt;
            if (negativePrompt && negativePrompt !== 'N/A') {
              const shouldTruncate = negativePrompt.length > config.negativePromptLength;
              const displayText = showFullNegativePrompt || !shouldTruncate ? negativePrompt : negativePrompt.slice(0, config.negativePromptLength) + '...';
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Negative Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                    {displayText}
                  </p>
                  {shouldTruncate && onShowFullNegativePromptChange && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onShowFullNegativePromptChange(!showFullNegativePrompt)}
                      className="h-6 px-0 text-xs text-primary mt-1"
                    >
                      {showFullNegativePrompt ? 'Show Less' : 'Show More'}
                    </Button>
                  )}
                </div>
              );
            } else {
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Negative Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                    None
                  </p>
                </div>
              );
            }
          })()}
        </div>
        
        {/* Technical Settings */}
        <div className={`grid gap-2 ${config.gridCols}`}>
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Steps</p>
            <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
              {orchestratorDetails?.steps || orchestratorPayload?.steps || task?.params?.num_inference_steps || 'N/A'}
            </p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Resolution</p>
            <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>{orchestratorDetails?.parsed_resolution_wh || task?.params?.parsed_resolution_wh || 'N/A'}</p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Frames / Segment</p>
            <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
              {orchestratorDetails?.segment_frames_expanded?.[0] || orchestratorPayload?.segment_frames_expanded?.[0] || task?.params?.segment_frames_expanded || 'N/A'}
            </p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Amount of Motion</p>
            <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
              {(() => {
                const motion = orchestratorDetails?.amount_of_motion ?? orchestratorPayload?.amount_of_motion ?? task?.params?.amount_of_motion;
                return motion !== undefined && motion !== null ? `${Math.round(motion * 100)}%` : 'N/A';
              })()}
            </p>
          </div>
        </div>
      </div>

      {/* LoRAs Section */}
      {additionalLoras && Object.keys(additionalLoras).length > 0 && (
        <div className="pt-2 border-t border-muted-foreground/20">
          <div className="space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>LoRAs Used</p>
            <div className="space-y-1">
              {Object.entries(additionalLoras).slice(0, config.maxLoras).map(([url, strength]) => {
                const fileName = url.split('/').pop() || 'Unknown';
                const displayName = fileName.replace(/\.(safetensors|ckpt|pt)$/, '');
                return (
                  <div key={url} className={`flex items-center justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`${config.fontWeight} truncate`} title={displayName}>
                        {displayName.length > config.loraNameLength ? displayName.slice(0, config.loraNameLength) + '...' : displayName}
                      </p>
                    </div>
                    <div className={`${config.fontWeight} text-muted-foreground ml-1`}>
                      {strength}
                    </div>
                  </div>
                );
              })}
              {Object.keys(additionalLoras).length > config.maxLoras && (
                <p className={`${config.textSize} text-muted-foreground`}>
                  +{Object.keys(additionalLoras).length - config.maxLoras} more
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedTaskDetails;
