import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { DisplayableMetadata, MetadataLora } from './ImageGallery';

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

interface SharedMetadataDetailsProps {
  metadata: DisplayableMetadata;
  variant: 'hover' | 'modal' | 'panel';
  isMobile?: boolean;
  showFullPrompt?: boolean;
  onShowFullPromptChange?: (show: boolean) => void;
  showFullNegativePrompt?: boolean;
  onShowFullNegativePromptChange?: (show: boolean) => void;
  showUserImage?: boolean;
}

export const SharedMetadataDetails: React.FC<SharedMetadataDetailsProps> = ({
  metadata,
  variant,
  isMobile = false,
  showFullPrompt = false,
  onShowFullPromptChange,
  showFullNegativePrompt = false,
  onShowFullNegativePromptChange,
  showUserImage = true,
}) => {
  // Size configuration based on variant
  const config = {
    hover: {
      textSize: 'text-xs',
      fontWeight: 'font-light',
      iconSize: 'h-2.5 w-2.5',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-1',
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
      promptLength: isMobile ? 100 : 150,
      negativePromptLength: isMobile ? 100 : 150,
      loraNameLength: 40,
      maxLoras: 10,
    },
  }[variant];

  // Extract data from metadata
  const prompt = metadata.prompt || 
                 (metadata as any).originalParams?.orchestrator_details?.prompt;
  
  const negativePrompt = (metadata as any).originalParams?.orchestrator_details?.negative_prompt || 
                        metadata.negative_prompt;
  
  const model = (metadata as any).originalParams?.orchestrator_details?.model || metadata.model;
  const seed = metadata.seed || (metadata as any).originalParams?.orchestrator_details?.seed;
  const resolution = (metadata as any).originalParams?.orchestrator_details?.resolution;
  const dimensions = metadata.width && metadata.height ? `${metadata.width}×${metadata.height}` : resolution;

  // Get LoRAs from multiple possible locations
  const additionalLoras = (metadata as any).originalParams?.orchestrator_details?.additional_loras;
  const activeLoras = metadata.activeLoras;

  // Determine which LoRAs to display
  const lorasToDisplay = activeLoras && activeLoras.length > 0 
    ? activeLoras.map(lora => ({
        name: lora.name || lora.id || 'Unknown',
        strength: `${lora.strength}%`
      }))
    : additionalLoras && Object.keys(additionalLoras).length > 0
    ? Object.entries(additionalLoras).map(([url, strength]) => {
        const urlParts = url.split('/');
        const filename = urlParts[urlParts.length - 1] || url;
        const displayName = filename.replace(/\.(safetensors|ckpt|pt).*$/i, '').replace(/_/g, ' ');
        return {
          name: displayName,
          strength: `${((strength as number) * 100).toFixed(0)}%`
        };
      })
    : [];

  // Additional settings
  const hasAdditionalSettings = metadata.depthStrength !== undefined || 
                               metadata.softEdgeStrength !== undefined || 
                               metadata.userProvidedImageUrl;

  // Check if this is a qwen_image_edit task with source image
  // Check both top-level (for ImageGalleryItem) and originalParams (for TasksPane)
  const isQwenImageEdit = (metadata as any).tool_type === 'qwen_image_edit' || 
                          (metadata as any).qwen_endpoint === 'qwen-image-edit' ||
                          (metadata as any).originalParams?.qwen_endpoint === 'qwen-image-edit';
  const qwenSourceImage = (metadata as any).image || 
                          (metadata as any).originalParams?.image;

  return (
    <div className={`space-y-3 p-3 bg-muted/30 rounded-lg border ${variant === 'panel' ? '' : 'w-[360px]'}`}>
      {/* Qwen Image Edit Source Image */}
      {showUserImage && isQwenImageEdit && qwenSourceImage && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Source Image
          </p>
          <div>
            <img 
              src={qwenSourceImage} 
              alt="Source image for edit"
              className="h-auto max-h-24 object-contain object-left rounded-sm border"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* User Provided Image */}
      {showUserImage && metadata.userProvidedImageUrl && !isQwenImageEdit && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Reference Image
          </p>
          <div className="flex justify-center">
            <img 
              src={metadata.userProvidedImageUrl} 
              alt="User provided image preview"
              className="w-full h-auto max-h-24 object-contain rounded-sm border"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Style Reference Image Section */}
      {(() => {
        // Check multiple possible locations for style reference data
        // metadata.originalParams is the task params (when passed from TaskItem)
        // metadata itself might have the params directly (from ImageGallery generations.params)
        const styleImage = (metadata as any).style_reference_image || 
                          (metadata as any).originalParams?.style_reference_image;
        const styleStrength = (metadata as any).style_reference_strength ?? 
                             (metadata as any).originalParams?.style_reference_strength;
        const subjectStrength = (metadata as any).subject_strength ?? 
                               (metadata as any).originalParams?.subject_strength;
        
        const hasStyleReference = styleImage && styleImage !== '';
        
        if (!hasStyleReference) return null;
        
        // Calculate aspect ratio from dimensions - check multiple sources
        let aspectRatio = 1; // Default to square
        
        // Try to get resolution from metadata.resolution field first (for image generation tasks)
        const metadataResolution = (metadata as any).resolution || 
                                   (metadata as any).originalParams?.resolution;
        
        if (metadata.width && metadata.height) {
          aspectRatio = metadata.width / metadata.height;
        } else if (metadataResolution) {
          // Parse resolution like "1152x864"
          const match = metadataResolution.match(/(\d+)[×x](\d+)/);
          if (match) {
            const [, width, height] = match;
            aspectRatio = parseInt(width) / parseInt(height);
          }
        } else if (dimensions) {
          // Parse dimensions like "1152×864" or "1152x864"
          const match = dimensions.match(/(\d+)[×x](\d+)/);
          if (match) {
            const [, width, height] = match;
            aspectRatio = parseInt(width) / parseInt(height);
          }
        } else if (resolution) {
          // Parse resolution like "1152x864"
          const match = resolution.match(/(\d+)[×x](\d+)/);
          if (match) {
            const [, width, height] = match;
            aspectRatio = parseInt(width) / parseInt(height);
          }
        }
        const imageWidth = 120;
        const imageHeight = imageWidth / aspectRatio;
        
        return (
          <div className="space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>
              Reference
            </p>
            <div className="flex items-center gap-3">
              <div className="relative group flex-shrink-0" style={{ width: `${imageWidth}px`, height: `${imageHeight}px` }}>
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
      
      {/* Prompts and Generation Settings */}
      <div className={`grid gap-3 ${variant === 'hover' ? 'grid-cols-1' : 'grid-cols-1'}`}>
        {/* Prompts Section */}
        <div className="space-y-3">
          {/* Prompt */}
          {prompt ? (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
              {(() => {
                const shouldTruncate = prompt.length > config.promptLength;
                const displayText = showFullPrompt || !shouldTruncate ? prompt : prompt.slice(0, config.promptLength) + '...';
                return (
                  <div>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                      "{displayText}"
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
              })()}
            </div>
          ) : (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>None</p>
            </div>
          )}
          
          {/* Negative Prompt */}
          {negativePrompt && negativePrompt !== 'N/A' ? (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Negative Prompt</p>
              {(() => {
                const shouldTruncate = negativePrompt.length > config.negativePromptLength;
                const displayText = showFullNegativePrompt || !shouldTruncate ? negativePrompt : negativePrompt.slice(0, config.negativePromptLength) + '...';
                return (
                  <div>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                      "{displayText}"
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
              })()}
            </div>
          ) : negativePrompt ? (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Negative Prompt</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>None</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Additional Settings Section */}
      {hasAdditionalSettings && (
        <div className="pt-2 border-t border-muted-foreground/20">
          <div className="space-y-2">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Additional Settings</p>
            <div className={`grid gap-2 ${config.gridCols}`}>
              {metadata.depthStrength !== undefined && (
                <div className="space-y-1">
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Depth Strength</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {(metadata.depthStrength * 100).toFixed(0)}%
                  </p>
                </div>
              )}
              {metadata.softEdgeStrength !== undefined && (
                <div className="space-y-1">
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Soft Edge Strength</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {(metadata.softEdgeStrength * 100).toFixed(0)}%
                  </p>
                </div>
              )}
              {metadata.userProvidedImageUrl && (
                <div className="space-y-1">
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Reference Image</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {(() => {
                      const urlParts = metadata.userProvidedImageUrl.split('/');
                      return urlParts[urlParts.length - 1] || 'Image provided';
                    })()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LoRAs Section */}
      {lorasToDisplay.length > 0 && (
        <div className="pt-2 border-t border-muted-foreground/20">
          <div className="space-y-2">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>LoRAs Used</p>
            <div className="space-y-1">
              {lorasToDisplay.slice(0, config.maxLoras).map((lora, index) => (
                <div key={index} className={`flex items-center justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`${config.fontWeight} truncate`} title={lora.name}>
                      {lora.name.length > config.loraNameLength ? lora.name.slice(0, config.loraNameLength) + '...' : lora.name}
                    </p>
                  </div>
                  <div className={`${config.fontWeight} text-muted-foreground ml-1`}>
                    {lora.strength}
                  </div>
                </div>
              ))}
              {lorasToDisplay.length > config.maxLoras && (
                <p className={`${config.textSize} text-muted-foreground`}>
                  +{lorasToDisplay.length - config.maxLoras} more
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedMetadataDetails;
