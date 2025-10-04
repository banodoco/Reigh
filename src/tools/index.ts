// Centralized tool settings exports - automatically registers defaults in toolSettingsService
export { videoTravelSettings } from './travel-between-images/settings';
export { imageGenerationSettings } from './image-generation/settings';
export { editTravelSettings } from './edit-travel/settings';
export { characterAnimateSettings } from './character-animate/settings';
export { userPreferencesSettings } from '../shared/settings/userPreferences';

// Tool manifest for UI discovery and automatic registration
import { videoTravelSettings } from './travel-between-images/settings';
import { imageGenerationSettings } from './image-generation/settings';
import { editTravelSettings } from './edit-travel/settings';
import { characterAnimateSettings } from './character-animate/settings';
import { userPreferencesSettings } from '../shared/settings/userPreferences';
import { AppEnv, LOCAL_ENVS, type AppEnvValue } from '../types/env';
import { Paintbrush, Video, Edit, Users } from 'lucide-react';

export const toolsManifest = [
  videoTravelSettings,
  imageGenerationSettings,
  editTravelSettings,
  characterAnimateSettings,
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
    id: editTravelSettings.id,
    name: 'Edit Travel (Image Edit)',
    path: '/tools/edit-travel',
    description: 'Transform existing images using poetic text prompts with the sophisticated Fal Kontext model, reimagining reality with artistic precision.',
    environments: [AppEnv.DEV],
    icon: Edit,
    gradient: 'from-wes-yellow via-wes-salmon to-wes-pink',
    accent: 'wes-yellow',
    ornament: '✧',
    badge: 'New',
  },
  {
    id: characterAnimateSettings.id,
    name: 'Character Animate',
    path: '/tools/character-animate',
    description: 'Bring characters to life by mapping motion from reference videos onto static images with natural expressions and movements.',
    environments: [AppEnv.LOCAL, AppEnv.WEB],
    icon: Users,
    gradient: 'from-wes-sage via-wes-mint to-wes-lavender',
    accent: 'wes-sage',
    ornament: '◉',
    badge: 'New',
  },
]; 