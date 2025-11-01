import React, { useState, useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { framesToSeconds } from './Timeline/utils/time-utils';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { getDisplayNameFromUrl } from '../utils/loraDisplayUtils';

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
  // Variant name editing (only for modal variant)
  generationName?: string;
  onGenerationNameChange?: (name: string) => void;
  isEditingGenerationName?: boolean;
  onEditingGenerationNameChange?: (editing: boolean) => void;
  // Available LoRAs for proper name display
  availableLoras?: LoraModel[];
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
  generationName,
  onGenerationNameChange,
  isEditingGenerationName = false,
  onEditingGenerationNameChange,
  availableLoras,
}) => {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [characterVideoLoaded, setCharacterVideoLoaded] = useState(false);
  
  // Helper to safely access orchestrator payload from multiple possible locations (memoized)
  const orchestratorPayload = useMemo(() => task?.params?.full_orchestrator_payload as any, [task?.params?.full_orchestrator_payload]);
  const orchestratorDetails = useMemo(() => task?.params?.orchestrator_details as any, [task?.params?.orchestrator_details]);
  
  // Check if this is a character animate task
  const isCharacterAnimateTask = task?.taskType === 'animate_character';
  
  // Check if this is a join clips task
  const isJoinClipsTask = task?.taskType === 'join_clips';
  
  // Get LoRAs from the correct location (try all possible paths)
  const additionalLoras = (
    orchestratorPayload?.additional_loras || 
    orchestratorDetails?.additional_loras || 
    task?.params?.additional_loras
  ) as Record<string, any> | undefined;

  // Get phase_config for phase-by-phase LoRA display (memoized to prevent random changes)
  const phaseConfig = useMemo(() => {
    return (
      orchestratorPayload?.phase_config || 
      orchestratorDetails?.phase_config || 
      task?.params?.phase_config
    ) as any;
  }, [orchestratorPayload?.phase_config, orchestratorDetails?.phase_config, task?.params?.phase_config]);

  // Memoize computed phase values to prevent flickering
  const phaseStepsDisplay = useMemo(() => {
    if (!phaseConfig?.steps_per_phase || !Array.isArray(phaseConfig.steps_per_phase)) return null;
    const stepsArray = phaseConfig.steps_per_phase;
    const total = stepsArray.reduce((a: number, b: number) => a + b, 0);
    return `${stepsArray.join(' → ')} (${total} total)`;
  }, [phaseConfig?.steps_per_phase]);

  // Memoize phases with LoRAs to prevent array recreation
  const phasesWithLoras = useMemo(() => {
    if (!phaseConfig?.phases || !Array.isArray(phaseConfig.phases)) return [];
    return phaseConfig.phases.filter((phase: any) => phase.loras && phase.loras.length > 0);
  }, [phaseConfig?.phases]);

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

  // Character Animate specific data
  const characterAnimateMode = isCharacterAnimateTask ? (
    task?.params?.mode || 
    orchestratorDetails?.mode || 
    orchestratorPayload?.mode
  ) : null;
  
  const characterImageUrl = isCharacterAnimateTask ? (
    task?.params?.character_image_url || 
    orchestratorDetails?.character_image_url || 
    orchestratorPayload?.character_image_url
  ) : null;
  
  const motionVideoUrl = isCharacterAnimateTask ? (
    task?.params?.motion_video_url || 
    orchestratorDetails?.motion_video_url || 
    orchestratorPayload?.motion_video_url
  ) : null;
  
  const characterPrompt = isCharacterAnimateTask ? (
    task?.params?.prompt || 
    orchestratorDetails?.prompt || 
    orchestratorPayload?.prompt
  ) : null;

  const characterResolution = isCharacterAnimateTask ? (
    task?.params?.resolution || 
    orchestratorDetails?.resolution || 
    orchestratorPayload?.resolution
  ) : null;

  // Join Clips specific data
  const startingVideoPath = isJoinClipsTask ? (
    task?.params?.starting_video_path || 
    orchestratorDetails?.starting_video_path || 
    orchestratorPayload?.starting_video_path
  ) : null;
  
  const endingVideoPath = isJoinClipsTask ? (
    task?.params?.ending_video_path || 
    orchestratorDetails?.ending_video_path || 
    orchestratorPayload?.ending_video_path
  ) : null;
  
  const joinClipsPrompt = isJoinClipsTask ? (
    task?.params?.prompt || 
    orchestratorDetails?.prompt || 
    orchestratorPayload?.prompt
  ) : null;
  
  const contextFrameCount = isJoinClipsTask ? (
    task?.params?.context_frame_count || 
    orchestratorDetails?.context_frame_count || 
    orchestratorPayload?.context_frame_count
  ) : null;
  
  const gapFrameCount = isJoinClipsTask ? (
    task?.params?.gap_frame_count || 
    orchestratorDetails?.gap_frame_count || 
    orchestratorPayload?.gap_frame_count
  ) : null;
  
  const [startingVideoLoaded, setStartingVideoLoaded] = useState(false);
  const [endingVideoLoaded, setEndingVideoLoaded] = useState(false);

  // Check if this is a video travel task (not character animate or join clips)
  const isVideoTravelTask = !isCharacterAnimateTask && !isJoinClipsTask;

  // Check if we should show Advanced Phase Settings and LoRAs in right column
  const showPhaseContentInRightColumn = isVideoTravelTask && phaseConfig?.phases;

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border ${showPhaseContentInRightColumn ? 'w-full' : variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[360px]'} ${showPhaseContentInRightColumn ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}`}>
      {/* Main Content Column */}
      <div className={showPhaseContentInRightColumn ? 'space-y-3 min-w-0' : 'contents'}>
      {/* Variant Name Section - Only for Video Travel tasks in modal or panel variant */}
      {isVideoTravelTask && (variant === 'modal' || variant === 'panel') && (generationName !== undefined || onGenerationNameChange) && (
        <div className="space-y-1 pb-3 border-b border-muted-foreground/20">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Variant Name</p>
          {isEditingGenerationName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={generationName || ''}
                onChange={(e) => onGenerationNameChange?.(e.target.value)}
                onBlur={() => onEditingGenerationNameChange?.(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onEditingGenerationNameChange?.(false);
                  } else if (e.key === 'Escape') {
                    onEditingGenerationNameChange?.(false);
                  }
                }}
                autoFocus
                placeholder="Enter variant name..."
                className="flex-1 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ) : (
            <div 
              className="flex items-center justify-between group cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors"
              onClick={() => onEditingGenerationNameChange?.(true)}
            >
              <p className={`${config.textSize} ${config.fontWeight} text-foreground ${!generationName && 'text-muted-foreground italic'}`}>
                {generationName || 'Click to add variant name...'}
              </p>
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                Edit
              </span>
            </div>
          )}
        </div>
      )}

      {/* Character Animate Task Details */}
      {isCharacterAnimateTask && (
        <>
          {/* Mode Display */}
          {characterAnimateMode && (
            <div className="space-y-1 pb-2 border-b border-muted-foreground/20">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Mode</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground capitalize`}>
                {characterAnimateMode}
              </p>
            </div>
          )}

          {/* Character Image */}
          {characterImageUrl && (
            <div className="space-y-2">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>
                {characterAnimateMode === 'animate' ? '✨ Character to animate' : '✨ Character to insert'}
              </p>
              <div className="relative group flex-shrink-0" style={{ width: '160px' }}>
                <img 
                  src={characterImageUrl} 
                  alt="Character" 
                  className="w-full object-cover rounded border shadow-sm transition-transform group-hover:scale-105"
                />
              </div>
            </div>
          )}

          {/* Motion Video */}
          {motionVideoUrl && (
            <div className="space-y-2">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>
                {characterAnimateMode === 'animate' ? '🎬 Source of movement' : '🎬 Video to replace character in'}
              </p>
              <div className="relative group flex-shrink-0 cursor-pointer" style={{ width: '160px' }}>
                {!characterVideoLoaded ? (
                  <div 
                    className="w-full aspect-video bg-black rounded border shadow-sm flex items-center justify-center"
                    onClick={() => setCharacterVideoLoaded(true)}
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
                      src={motionVideoUrl}
                      className="w-full object-cover rounded border shadow-sm"
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
            </div>
          )}

          {/* Character Prompt */}
          {characterPrompt && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                {characterPrompt}
              </p>
            </div>
          )}

          {/* Character Resolution */}
          {characterResolution && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Resolution</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                {characterResolution}
              </p>
            </div>
          )}
        </>
      )}

      {/* Join Clips Task Details */}
      {isJoinClipsTask && (
        <>
          {/* Video Clips Side by Side */}
          {(startingVideoPath || endingVideoPath) && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                {/* Starting Video */}
                {startingVideoPath && (
                  <div className="space-y-1">
                    <p className={`${config.textSize} text-muted-foreground text-center`}>Starting Clip</p>
                    <div className="relative group cursor-pointer">
                      {!startingVideoLoaded ? (
                        <div 
                          className="w-full aspect-video bg-black rounded border shadow-sm flex items-center justify-center"
                          onClick={() => setStartingVideoLoaded(true)}
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
                            src={startingVideoPath}
                            className="w-full object-cover rounded border shadow-sm"
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
                  </div>
                )}

                {/* Ending Video */}
                {endingVideoPath && (
                  <div className="space-y-1">
                    <p className={`${config.textSize} text-muted-foreground text-center`}>Ending Clip</p>
                    <div className="relative group cursor-pointer">
                      {!endingVideoLoaded ? (
                        <div 
                          className="w-full aspect-video bg-black rounded border shadow-sm flex items-center justify-center"
                          onClick={() => setEndingVideoLoaded(true)}
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
                            src={endingVideoPath}
                            className="w-full object-cover rounded border shadow-sm"
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
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Frame Configuration */}
          {(contextFrameCount !== null || gapFrameCount !== null) && (
            <div className="space-y-2 pt-2 border-t border-muted-foreground/20">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Frame Configuration</p>
              <div className="grid grid-cols-2 gap-3">
                {contextFrameCount !== null && (
                  <div className="space-y-1">
                    <p className={`${config.textSize} text-muted-foreground`}>Context Duration</p>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                      {framesToSeconds(contextFrameCount)} ({contextFrameCount} frames)
                    </p>
                  </div>
                )}
                {gapFrameCount !== null && (
                  <div className="space-y-1">
                    <p className={`${config.textSize} text-muted-foreground`}>Gap Duration</p>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                      {framesToSeconds(gapFrameCount)} ({gapFrameCount} frames)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Join Clips Prompt */}
          {joinClipsPrompt && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Transition Prompt</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                {joinClipsPrompt}
              </p>
            </div>
          )}
        </>
      )}

      {/* Guidance Images Section (for non-character-animate and non-join-clips tasks) */}
      {!isCharacterAnimateTask && !isJoinClipsTask && inputImages.length > 0 && (
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

      {/* Advanced Phase Settings - Only show here when NOT in right column layout */}
      {!isCharacterAnimateTask && !isJoinClipsTask && phaseConfig?.phases && !showPhaseContentInRightColumn && (
        <div className="pt-3 border-t border-muted-foreground/20">
          <div className="space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground mb-2`}>Advanced Phase Settings</p>
            <div className={`grid gap-2 ${config.gridCols}`}>
              <div className="space-y-1">
                <p className={`${config.textSize} font-medium text-muted-foreground`}>Phases</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {phaseConfig?.num_phases || phaseConfig?.phases?.length}
                </p>
              </div>
              {phaseConfig?.flow_shift !== undefined && (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Flow Shift</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {phaseConfig.flow_shift}
                  </p>
                </div>
              )}
              {phaseConfig?.sample_solver && (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Solver</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground capitalize`}>
                    {phaseConfig.sample_solver}
                  </p>
                </div>
              )}
              {phaseConfig?.model_switch_phase !== undefined && (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Model Switch</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    Phase {phaseConfig.model_switch_phase}
                  </p>
                </div>
              )}
            </div>
            {phaseStepsDisplay && (
              <div className="space-y-1 pt-1">
                <p className={`${config.textSize} font-medium text-muted-foreground`}>Steps per Phase</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {phaseStepsDisplay}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video Guidance Section (for non-character-animate and non-join-clips tasks) */}
      {!isCharacterAnimateTask && !isJoinClipsTask && (() => {
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
        const videoWidth = 80;
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
                    <div className="bg-white/20 group-hover:bg-white/30 rounded-full p-2 transition-colors">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
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
                      <div className="bg-black/50 rounded-full p-1.5">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
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

      {/* Style Reference Image Section (for non-character-animate and non-join-clips tasks) */}
      {!isCharacterAnimateTask && !isJoinClipsTask && (() => {
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
      
      {/* Prompts and Technical Settings (for non-character-animate and non-join-clips tasks) */}
      {!isCharacterAnimateTask && !isJoinClipsTask && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prompts Section */}
        <div className="space-y-3">
          {/* Prompt */}
          {(() => {
            const prompt = orchestratorDetails?.base_prompts_expanded?.[0] || 
                          orchestratorPayload?.base_prompts_expanded?.[0] || 
                          orchestratorDetails?.base_prompt ||
                          orchestratorPayload?.base_prompt ||
                          task?.params?.prompt;
            const enhancePrompt = orchestratorDetails?.enhance_prompt || 
                                 orchestratorPayload?.enhance_prompt || 
                                 task?.params?.enhance_prompt;
            if (prompt) {
              const shouldTruncate = prompt.length > config.promptLength;
              const displayText = showFullPrompt || !shouldTruncate ? prompt : prompt.slice(0, config.promptLength) + '...';
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>
                    Prompt{enhancePrompt ? ' (enhanced)' : ''}
                  </p>
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
          
          {/* Text Before Prompts */}
          {(() => {
            const textBeforePrompts = orchestratorDetails?.text_before_prompts || orchestratorPayload?.text_before_prompts || task?.params?.text_before_prompts;
            if (textBeforePrompts) {
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Before Each Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                    {textBeforePrompts}
                  </p>
                </div>
              );
            }
            return null;
          })()}
          
          {/* Text After Prompts */}
          {(() => {
            const textAfterPrompts = orchestratorDetails?.text_after_prompts || orchestratorPayload?.text_after_prompts || task?.params?.text_after_prompts;
            if (textAfterPrompts) {
              return (
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>After Each Prompt</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
                    {textAfterPrompts}
                  </p>
                </div>
              );
            }
            return null;
          })()}
        </div>
        
        {/* Technical Settings */}
        <div className="space-y-3">
          {/* Hide basic Steps when phase_config is present (shown in detail above) */}
          {!phaseConfig?.phases && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Steps</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                {orchestratorDetails?.steps || orchestratorPayload?.steps || task?.params?.num_inference_steps || 'N/A'}
              </p>
            </div>
          )}
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
      )}

      {/* LoRAs Section (for non-character-animate and non-join-clips tasks) - Only show here when NOT in right column */}
      {!isCharacterAnimateTask && !isJoinClipsTask && !showPhaseContentInRightColumn && (() => {
        // Check if we have phase_config with phases
        const hasPhaseConfig = phasesWithLoras.length > 0;
        
        if (hasPhaseConfig) {
          // Display phase-by-phase LoRAs using memoized phasesWithLoras
          return (
            <div className="pt-2 border-t border-muted-foreground/20">
              <div className="space-y-3">
                <p className={`${config.textSize} font-medium text-muted-foreground`}>LoRAs by Phase</p>
                {phasesWithLoras.map((phase: any) => {
                  const stepsPerPhase = phaseConfig.steps_per_phase?.[phase.phase - 1];
                  return (
                    <div key={phase.phase} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <p className={`${config.textSize} font-medium text-foreground`}>
                          Phase {phase.phase}
                        </p>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          {stepsPerPhase && (
                            <span className={`${config.textSize} ${config.fontWeight}`}>
                              {stepsPerPhase} step{stepsPerPhase !== 1 ? 's' : ''}
                            </span>
                          )}
                          {phase.guidance_scale !== undefined && (
                            <>
                              <span className={`${config.textSize}`}>•</span>
                              <span className={`${config.textSize} ${config.fontWeight}`}>
                                CFG: {phase.guidance_scale}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1 ml-2">
                        {phase.loras.map((lora: any, idx: number) => {
                          const displayName = getDisplayNameFromUrl(lora.url, availableLoras);
                          return (
                            <div key={idx} className={`flex items-center justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                              <div className="flex-1 min-w-0">
                                <p className={`${config.fontWeight} truncate`} title={displayName}>
                                  {displayName.length > config.loraNameLength ? displayName.slice(0, config.loraNameLength) + '...' : displayName}
                                </p>
                              </div>
                              <div className={`${config.fontWeight} text-muted-foreground ml-1`}>
                                {lora.multiplier}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        } else if (additionalLoras && Object.keys(additionalLoras).length > 0) {
          // Fall back to non-phase LoRA display
          return (
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
          );
        }
        
        return null;
      })()}
      </div>

      {/* Right Column: Advanced Phase Settings and LoRAs by Phase (only when showPhaseContentInRightColumn is true) */}
      {showPhaseContentInRightColumn && (
        <div className="space-y-3 lg:border-l lg:border-muted-foreground/20 lg:pl-4 min-w-0">
          {/* Advanced Phase Settings */}
          {phaseConfig?.phases && (
            <div className="space-y-2">
              <p className={`${config.textSize} font-medium text-muted-foreground mb-2`}>Advanced Phase Settings</p>
              <div className={`grid gap-2 ${config.gridCols}`}>
                <div className="space-y-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Phases</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {phaseConfig?.num_phases || phaseConfig?.phases?.length}
                  </p>
                </div>
                {phaseConfig?.flow_shift !== undefined && (
                  <div className="space-y-1">
                    <p className={`${config.textSize} font-medium text-muted-foreground`}>Flow Shift</p>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                      {phaseConfig.flow_shift}
                    </p>
                  </div>
                )}
                {phaseConfig?.sample_solver && (
                  <div className="space-y-1">
                    <p className={`${config.textSize} font-medium text-muted-foreground`}>Solver</p>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground capitalize`}>
                      {phaseConfig.sample_solver}
                    </p>
                  </div>
                )}
                {phaseConfig?.model_switch_phase !== undefined && (
                  <div className="space-y-1">
                    <p className={`${config.textSize} font-medium text-muted-foreground`}>Model Switch</p>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                      Phase {phaseConfig.model_switch_phase}
                    </p>
                  </div>
                )}
              </div>
              {phaseStepsDisplay && (
                <div className="space-y-1 pt-1">
                  <p className={`${config.textSize} font-medium text-muted-foreground`}>Steps per Phase</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {phaseStepsDisplay}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* LoRAs by Phase */}
          {phasesWithLoras.length > 0 && (
            <div className="pt-3 border-t border-muted-foreground/20">
              <p className={`${config.textSize} font-medium text-muted-foreground mb-2`}>LoRAs by Phase</p>
              {phasesWithLoras.map((phase: any) => {
                const stepsPerPhase = phaseConfig.steps_per_phase?.[phase.phase - 1];
                return (
                  <div key={phase.phase} className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2">
                      <p className={`${config.textSize} font-medium text-foreground`}>
                        Phase {phase.phase}
                      </p>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {stepsPerPhase && (
                          <span className={`${config.textSize} ${config.fontWeight}`}>
                            {stepsPerPhase} step{stepsPerPhase !== 1 ? 's' : ''}
                          </span>
                        )}
                        {phase.guidance_scale !== undefined && (
                          <>
                            <span className={`${config.textSize}`}>•</span>
                            <span className={`${config.textSize} ${config.fontWeight}`}>
                              CFG: {phase.guidance_scale}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1 ml-2">
                      {phase.loras.map((lora: any, idx: number) => {
                        const displayName = getDisplayNameFromUrl(lora.url, availableLoras);
                        return (
                          <div key={idx} className={`flex items-center justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                            <div className="flex-1 min-w-0">
                              <p className={`${config.fontWeight} truncate`} title={displayName}>
                                {displayName.length > config.loraNameLength ? displayName.slice(0, config.loraNameLength) + '...' : displayName}
                              </p>
                            </div>
                            <div className={`${config.fontWeight} text-muted-foreground ml-1`}>
                              {lora.multiplier}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SharedTaskDetails;
