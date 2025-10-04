import React, { useState } from 'react';
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
  const [videoLoaded, setVideoLoaded] = useState(false);
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
    <div className={`space-y-3 p-3 bg-muted/30 rounded-lg border ${variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[360px]'}`}>
      {/* Guidance Images Section */}
      {inputImages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>
                Image Guidance
              </p>
              <span className={`${config.textSize} text-foreground`}>
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

      {/* Video Guidance Section */}
      {(() => {
        // Check for video guidance data in multiple locations
        // Priority: orchestratorDetails > orchestratorPayload > task.params
        const videoPath = orchestratorDetails?.structure_video_path || 
                         orchestratorPayload?.structure_video_path || 
                         task?.params?.structure_video_path;
        const videoType = orchestratorDetails?.structure_video_type || 
                         orchestratorPayload?.structure_video_type || 
                         task?.params?.structure_video_type;
        const videoTreatment = orchestratorDetails?.structure_video_treatment || 
                              orchestratorPayload?.structure_video_treatment || 
                              task?.params?.structure_video_treatment;
        const motionStrength = orchestratorDetails?.structure_video_motion_strength ?? 
                              orchestratorPayload?.structure_video_motion_strength ?? 
                              task?.params?.structure_video_motion_strength;
        const resolution = orchestratorDetails?.parsed_resolution_wh || 
                          orchestratorPayload?.parsed_resolution_wh || 
                          task?.params?.parsed_resolution_wh;
        
        const hasVideoGuidance = videoPath && videoPath !== '';
        
        if (!hasVideoGuidance) return null;
        
        // Calculate aspect ratio from resolution
        let aspectRatio = 1; // Default to square
        if (resolution) {
          const [width, height] = resolution.split('x').map(Number);
          if (width && height) {
            aspectRatio = width / height;
          }
        }
        const videoWidth = 160;
        const videoHeight = videoWidth / aspectRatio;
        
        return (
          <div className="space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>
              Video Guidance
            </p>
            <div className="flex items-start gap-3">
              <div className="relative group flex-shrink-0 cursor-pointer" style={{ width: `${videoWidth}px`, height: `${videoHeight}px` }}>
                {!videoLoaded ? (
                  <div 
                    className="w-full h-full bg-black rounded border shadow-sm flex items-center justify-center"
                    onClick={() => setVideoLoaded(true)}
                  >
                    <div className="bg-white/20 group-hover:bg-white/30 rounded-full p-3 transition-colors">
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                ) : (
                  <>
                    <video 
                      src={videoPath}
                      className="w-full h-full object-cover rounded border shadow-sm"
                      loop
                      muted
                      playsInline
                      autoPlay
                      onClick={(e) => {
                        const video = e.currentTarget;
                        if (video.paused) {
                          video.play();
                        } else {
                          video.pause();
                        }
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-black/50 rounded-full p-2">
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1 text-left">
                {videoType && (
                  <div className={`${config.textSize} ${config.fontWeight}`}>
                    <span className="text-muted-foreground">Type: </span>
                    <span className="text-foreground capitalize">{videoType}</span>
                  </div>
                )}
                {videoTreatment && (
                  <div className={`${config.textSize} ${config.fontWeight}`}>
                    <span className="text-muted-foreground">Treatment: </span>
                    <span className="text-foreground capitalize">{videoTreatment}</span>
                  </div>
                )}
                {motionStrength !== undefined && motionStrength !== null && (
                  <div className={`${config.textSize} ${config.fontWeight}`}>
                    <span className="text-muted-foreground">Guidance Strength: </span>
                    <span className="text-foreground">{Math.round(motionStrength * 100)}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Style Reference Image Section */}
      {(() => {
        // Check multiple possible locations for style reference data
        const styleImage = task?.params?.style_reference_image || 
                          orchestratorDetails?.style_reference_image;
        const styleStrength = task?.params?.style_reference_strength ?? 
                             orchestratorDetails?.style_reference_strength;
        const subjectStrength = task?.params?.subject_strength ?? 
                               orchestratorDetails?.subject_strength;
        const resolution = orchestratorDetails?.parsed_resolution_wh || task?.params?.parsed_resolution_wh;
        
        const hasStyleReference = styleImage && styleImage !== '';
        
        if (!hasStyleReference) return null;
        
        // Calculate aspect ratio from resolution
        let aspectRatio = 1; // Default to square
        if (resolution) {
          const [width, height] = resolution.split('x').map(Number);
          if (width && height) {
            aspectRatio = width / height;
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
