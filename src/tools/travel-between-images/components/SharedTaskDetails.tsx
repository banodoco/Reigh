import React from 'react';
import { isJoinClipsTaskType, isCharacterAnimateTaskType } from '@/shared/lib/taskTypeUtils';
import {
  TaskDetailsProps,
  isImageEditTaskType,
  ImageEditTaskDetails,
  CharacterAnimateDetails,
  JoinClipsDetails,
  VideoTravelDetails,
} from './TaskDetails';

/**
 * SharedTaskDetails - Task type router
 * 
 * Dispatches to the appropriate focused renderer based on task type.
 * Each renderer is self-contained and handles only its task type's parameters.
 */
export const SharedTaskDetails: React.FC<TaskDetailsProps> = (props) => {
  const taskType = props.task?.taskType;

  // Route to appropriate renderer based on task type
  if (isImageEditTaskType(taskType)) {
    return <ImageEditTaskDetails {...props} />;
  }
  
  if (isCharacterAnimateTaskType(taskType)) {
    return <CharacterAnimateDetails {...props} />;
  }
  
  if (isJoinClipsTaskType(taskType)) {
    return <JoinClipsDetails {...props} />;
  }
  
  // Default: video travel tasks
  return <VideoTravelDetails {...props} />;
};

export default SharedTaskDetails;
