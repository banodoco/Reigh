// Centralized tool settings exports - automatically registers defaults in toolSettingsService
export { videoTravelSettings } from './travel-between-images/settings';
export { imageGenerationSettings } from './image-generation/settings';
export { characterAnimateSettings } from './character-animate/settings';
export { joinClipsSettings } from './join-clips/settings';
export { editImagesSettings } from './edit-images/settings';
export { editVideoSettings } from './edit-video/settings';
export { trainingDataHelperSettings } from './training-data-helper/settings';
export { userPreferencesSettings } from '../shared/settings/userPreferences';

// Tool manifest for UI discovery and automatic registration
import { videoTravelSettings } from './travel-between-images/settings';
import { imageGenerationSettings } from './image-generation/settings';
import { characterAnimateSettings } from './character-animate/settings';
import { joinClipsSettings } from './join-clips/settings';
import { editImagesSettings } from './edit-images/settings';
import { editVideoSettings } from './edit-video/settings';
import { trainingDataHelperSettings } from './training-data-helper/settings';
import { userPreferencesSettings } from '../shared/settings/userPreferences';
import { AppEnv, LOCAL_ENVS, type AppEnvValue } from '../types/env';
import { Paintbrush, Video, Edit, Users, Link2, Film, Database } from 'lucide-react';

export const toolsManifest = [
  videoTravelSettings,
  imageGenerationSettings,
  characterAnimateSettings,
  joinClipsSettings,
  editImagesSettings,
  editVideoSettings,
  trainingDataHelperSettings,
  userPreferencesSettings,
] as const;

// UI-specific tool definitions that extend the settings with display properties
export interface ToolUIDefinition {
  id: string;
  name: string;
  path: string;
  description: string;
  environments: AppEnvValue[];
  icon: React.ComponentType<any>;
  gradient: string;
  accent: string;
  ornament: string;
  badge?: string;
}

export const toolsUIManifest: ToolUIDefinition[] = [
  {
    id: imageGenerationSettings.id,
    name: 'Generate Images with Structure',
    path: '/tools/image-generation',
    description: 'Craft and generate intricate images using a structured approach with precision and artistic flair, bringing your creative visions to life.',
    environments: [AppEnv.LOCAL, AppEnv.WEB],
    icon: Paintbrush,
    gradient: 'from-wes-pink via-wes-lavender to-wes-dusty-blue',
    accent: 'wes-pink',
    ornament: '❋',
    badge: 'Featured',
  },
  {
    id: videoTravelSettings.id,
    name: 'Travel Between Images',
    path: '/tools/travel-between-images',
    description: 'Create mesmerizing video sequences by defining elegant paths between existing images, weaving stories through visual transitions.',
    environments: [AppEnv.LOCAL, AppEnv.WEB],
    icon: Video,
    gradient: 'from-wes-mint via-wes-sage to-wes-dusty-blue',
    accent: 'wes-mint',
    ornament: '◆',
    badge: 'Popular',
  },
  {
    id: characterAnimateSettings.id,
    name: 'Animate Characters',
    path: '/tools/character-animate',
    description: 'Bring characters to life by mapping motion from reference videos onto static images with natural expressions and movements.',
    environments: [AppEnv.LOCAL, AppEnv.WEB],
    icon: Users,
    gradient: 'from-wes-sage via-wes-mint to-wes-lavender',
    accent: 'wes-sage',
    ornament: '◉',
    badge: 'New',
  },
  {
    id: joinClipsSettings.id,
    name: 'Join Clips',
    path: '/tools/join-clips',
    description: 'Seamlessly join two video clips with AI-generated transitions, creating smooth connections between scenes.',
    environments: [AppEnv.LOCAL, AppEnv.WEB],
    icon: Link2,
    gradient: 'from-wes-dusty-blue via-wes-lavender to-wes-pink',
    accent: 'wes-dusty-blue',
    ornament: '◆',
    badge: 'New',
  },
  {
    id: 'edit-images', // Hardcoded to avoid import issues
    name: 'Edit Images',
    path: '/tools/edit-images',
    description: 'Transform, reimagine, and enhance images using text prompts or inpainting brushes.',
    environments: [AppEnv.LOCAL, AppEnv.WEB],
    icon: Edit,
    gradient: 'from-wes-yellow via-wes-salmon to-wes-pink',
    accent: 'wes-yellow',
    ornament: '✦',
    badge: 'New',
  },
  {
    id: editVideoSettings.id,
    name: 'Edit Videos',
    path: '/tools/edit-video',
    description: 'Regenerate portions of videos with AI to fix issues or create variations.',
    environments: [AppEnv.LOCAL, AppEnv.WEB],
    icon: Film,
    gradient: 'from-wes-coral via-wes-salmon to-wes-pink',
    accent: 'wes-coral',
    ornament: '◇',
    badge: 'New',
  },
]; 