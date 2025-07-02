export interface EditTravelSettings {
  prompts: Array<{ id: string; fullPrompt: string; shortPrompt?: string }>;
  imagesPerPrompt: number;
  generationMode: 'kontext' | 'flux';
  fluxSoftEdgeStrength: number; // 0..1
  fluxDepthStrength: number; // 0..1
  reconstructVideo: boolean;
}

export const editTravelSettings = {
  id: 'edit-travel',
  scope: ['project'] as const, // persist at project level by default
  defaults: {
    prompts: [],
    imagesPerPrompt: 1,
    generationMode: 'kontext' as const,
    fluxSoftEdgeStrength: 0.2,
    fluxDepthStrength: 0.6,
    reconstructVideo: true,
  } satisfies EditTravelSettings,
}; 