// Character Animate Tool Settings
export const characterAnimateSettings = {
  id: 'character-animate',
  scope: ['project', 'shot'] as const,
  defaults: {
    mode: 'animate' as 'replace' | 'animate',
    resolution: '720p' as '480p' | '720p',
    defaultPrompt: 'natural expression; preserve outfit details',
    autoMatchAspectRatio: true,
    randomSeed: true,
    seed: undefined as number | undefined,
    inputImageUrl: undefined as string | undefined,
    inputVideoUrl: undefined as string | undefined,
  },
};

// TypeScript type for settings
export type CharacterAnimateSettings = typeof characterAnimateSettings.defaults;

