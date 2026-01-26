import React, { useState, useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig, parseTaskParams } from './taskDetailsConfig';

/**
 * Task details for character animation tasks
 * Shows: mode, character image, motion video, prompt, resolution
 */
export const CharacterAnimateDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const [videoLoaded, setVideoLoaded] = useState(false);
  
  const parsedParams = useMemo(() => parseTaskParams(task?.params), [task?.params]);
  const orchestratorDetails = parsedParams?.orchestrator_details;
  const orchestratorPayload = parsedParams?.full_orchestrator_payload;

  // Extract character animate data
  const mode = parsedParams?.mode || orchestratorDetails?.mode || orchestratorPayload?.mode;
  const characterImageUrl = parsedParams?.character_image_url || orchestratorDetails?.character_image_url || orchestratorPayload?.character_image_url;
  const motionVideoUrl = parsedParams?.motion_video_url || orchestratorDetails?.motion_video_url || orchestratorPayload?.motion_video_url;
  const prompt = parsedParams?.prompt || orchestratorDetails?.prompt || orchestratorPayload?.prompt;
  const resolution = parsedParams?.resolution || orchestratorDetails?.resolution || orchestratorPayload?.resolution;

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border space-y-3 ${variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[360px]'}`}>
      {/* Mode Display */}
      {mode && (
        <div className="space-y-1 pb-2 border-b border-muted-foreground/20">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Mode</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground capitalize`}>
            {mode}
          </p>
        </div>
      )}

      {/* Character Image */}
      {characterImageUrl && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            {mode === 'animate' ? '✨ Character to animate' : '✨ Character to insert'}
          </p>
          <div className={`relative group flex-shrink-0 ${isMobile ? 'w-20' : 'w-40'}`}>
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
            {mode === 'animate' ? '🎬 Source of movement' : '🎬 Video to replace character in'}
          </p>
          <div className={`relative group flex-shrink-0 cursor-pointer ${isMobile ? 'w-20' : 'w-40'}`}>
            {!videoLoaded ? (
              <div 
                className="w-full aspect-video bg-black rounded border shadow-sm flex items-center justify-center"
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
                  src={motionVideoUrl}
                  className="w-full object-cover rounded border shadow-sm"
                  loop
                  muted
                  playsInline
                  autoPlay
                  onClick={(e) => {
                    const video = e.currentTarget;
                    video.paused ? video.play() : video.pause();
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

      {/* Prompt */}
      {prompt && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed preserve-case`}>
            {prompt}
          </p>
        </div>
      )}

      {/* Resolution */}
      {resolution && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Resolution</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
            {resolution}
          </p>
        </div>
      )}
    </div>
  );
};

export default CharacterAnimateDetails;

