import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

// Helper function to map model names to display names
const getModelDisplayName = (modelName: string | undefined): string => {
  if (!modelName) return 'Unknown';
  
  switch (modelName) {
    case 'vace_14B':
      return 'Wan 2.1';
    case 'vace_14B_fake_cocktail_2_2':
      return 'Wan 2.2';
    default:
      return modelName;
  }
};

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
    <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
      {/* Input Images Section */}
      {inputImages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-2">
              <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>
                Input Images
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
      
      {/* Prompts and Technical Settings */}
      <div className={`grid gap-3 ${variant === 'hover' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {/* Prompts Section */}
        <div className="space-y-3">
          {/* Prompt */}
          {(() => {
            const prompt = orchestratorPayload?.base_prompts_expanded?.[0] || task?.params?.prompt;
            if (prompt) {
              const shouldTruncate = prompt.length > config.promptLength;
              const displayText = showFullPrompt || !shouldTruncate ? prompt : prompt.slice(0, config.promptLength) + '...';
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} break-words whitespace-pre-wrap leading-relaxed`}>
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
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} break-words whitespace-pre-wrap leading-relaxed`}>
                    None
                  </p>
                </div>
              );
            }
          })()}
          
          {/* Negative Prompt */}
          {(() => {
            const negativePrompt = orchestratorPayload?.negative_prompts_expanded?.[0] || task?.params?.negative_prompt;
            if (negativePrompt && negativePrompt !== 'N/A') {
              const shouldTruncate = negativePrompt.length > config.negativePromptLength;
              const displayText = showFullNegativePrompt || !shouldTruncate ? negativePrompt : negativePrompt.slice(0, config.negativePromptLength) + '...';
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Negative Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} break-words whitespace-pre-wrap leading-relaxed`}>
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
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Negative Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} break-words whitespace-pre-wrap leading-relaxed`}>
                    None
                  </p>
                </div>
              );
            }
          })()}

          {/* Model - placed below negative prompt */}
          <div className="space-y-1">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Model</p>
            <p className={`${config.textSize} ${config.fontWeight}`}>
              {getModelDisplayName(orchestratorPayload?.model_name || task?.params?.model_name)}
            </p>
          </div>
        </div>
        
        {/* Technical Settings */}
        <div className={`grid gap-2 ${config.gridCols}`}>
          <div className="space-y-1">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Steps</p>
            <p className={`${config.textSize} ${config.fontWeight}`}>
              {orchestratorPayload?.steps || task?.params?.num_inference_steps || 'N/A'}
            </p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Resolution</p>
            <p className={`${config.textSize} ${config.fontWeight}`}>{task?.params?.parsed_resolution_wh || 'N/A'}</p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Frames / Segment</p>
            <p className={`${config.textSize} ${config.fontWeight}`}>
              {orchestratorPayload?.segment_frames_expanded?.[0] || task?.params?.segment_frames_expanded || 'N/A'}
            </p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Context Frames</p>
            <p className={`${config.textSize} ${config.fontWeight}`}>
              {task?.params?.frame_overlap_settings_expanded?.[0] || orchestratorPayload?.frame_overlap_expanded?.[0] || task?.params?.frame_overlap_expanded || 'N/A'}
            </p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Accelerated</p>
            <div className="flex items-center space-x-1">
              {(orchestratorPayload?.accelerated_mode || task?.params?.accelerated_mode) === true ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Check className={config.iconSize} />
                  <span className={`${config.textSize} ${config.fontWeight}`}>True</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-red-500">
                  <X className={config.iconSize} />
                  <span className={`${config.textSize} ${config.fontWeight}`}>False</span>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>StyleBoost</p>
            <div className="flex items-center space-x-1">
              {(orchestratorPayload?.use_styleboost_loras || task?.params?.use_styleboost_loras) === true ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Check className={config.iconSize} />
                  <span className={`${config.textSize} ${config.fontWeight}`}>True</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-red-500">
                  <X className={config.iconSize} />
                  <span className={`${config.textSize} ${config.fontWeight}`}>False</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* LoRAs Section */}
      {additionalLoras && Object.keys(additionalLoras).length > 0 && (
        <div className="pt-2 border-t border-muted-foreground/20">
          <div className="space-y-2">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>LoRAs Used</p>
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
