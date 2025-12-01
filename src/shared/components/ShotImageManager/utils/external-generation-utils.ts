import { GenerationRow } from '@/types/shots';

/**
 * Build shot associations array from shot_generations relation
 */
export const buildShotAssociations = (shotGenerations: any[]) => {
  return shotGenerations.map((sg: any) => ({
    shot_id: sg.shot_id,
    timeline_frame: sg.timeline_frame,
    position: sg.timeline_frame,
  }));
};

/**
 * Transform database generation data to GenerationRow format
 */
export const transformExternalGeneration = (
  data: any,
  shotGenerations: any[]
): GenerationRow => {
  const allAssociations = buildShotAssociations(shotGenerations);
  
  const transformedData: GenerationRow = {
    id: data.id,
    shotImageEntryId: data.id,
    imageUrl: data.location,
    thumbUrl: data.thumbnail_url || data.location,
    location: data.location,
    type: data.type,
    createdAt: data.created_at,
    timeline_frame: shotGenerations.length > 0 ? shotGenerations[0].timeline_frame : undefined,
    metadata: (typeof data.params === 'object' && data.params !== null && !Array.isArray(data.params)) 
      ? data.params as Record<string, unknown> 
      : {},
    starred: data.starred ?? false,
    all_shot_associations: allAssociations,
    ...(shotGenerations.length > 0 ? {
      shot_id: shotGenerations[0].shot_id,
      position: shotGenerations[0].timeline_frame,
    } : {})
  } as any;
  
  // Add based_on for lineage tracking
  (transformedData as any).based_on = data.based_on;
  
  return transformedData;
};

