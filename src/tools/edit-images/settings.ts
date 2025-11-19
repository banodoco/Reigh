export const editImagesSettings = {
  id: 'edit-images',
  scope: ['project'] as const,
  defaults: {
    // No specific settings defaults needed yet
  },
};

export type EditImagesSettings = typeof editImagesSettings.defaults;

