/**
 * Core generation CRUD operations
 * Basic database operations for generations and variants
 */

// ===== HELPERS =====

/**
 * Helper to safely extract value from array by index
 */
export function extractFromArray(arr: any[], index: number): any | undefined {
  if (Array.isArray(arr) && index >= 0 && index < arr.length) {
    return arr[index];
  }
  return undefined;
}

// ===== GENERATION LOOKUP =====

/**
 * Check for existing generation referencing this task_id
 */
export async function findExistingGeneration(supabase: any, taskId: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .contains('tasks', JSON.stringify([taskId]))
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error(`[GenMigration] Error finding existing generation:`, error);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`[GenMigration] Exception finding existing generation:`, error);
    return null;
  }
}

/**
 * Find source generation by image URL (for magic edit tracking)
 */
export async function findSourceGenerationByImageUrl(supabase: any, imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;

  try {
    console.log(`[BasedOn] Looking for source generation with image URL: ${imageUrl}`);
    const { data, error } = await supabase
      .from('generations')
      .select('id')
      .eq('location', imageUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[BasedOn] Error finding source generation:`, error);
      return null;
    }

    if (data) {
      console.log(`[BasedOn] Found source generation: ${data.id}`);
      return data.id;
    }

    console.log(`[BasedOn] No source generation found for image URL`);
    return null;
  } catch (error) {
    console.error(`[BasedOn] Exception finding source generation:`, error);
    return null;
  }
}

// ===== GENERATION/VARIANT CREATION =====

/**
 * Insert generation record
 */
export async function insertGeneration(supabase: any, record: any): Promise<any> {
  const { data, error } = await supabase
    .from('generations')
    .insert(record)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert generation: ${error.message}`);
  }

  return data;
}

/**
 * Create a generation variant
 * @param viewedAt - Optional: if provided, marks the variant as already viewed (for single-segment cases)
 */
export async function createVariant(
  supabase: any,
  generationId: string,
  location: string,
  thumbnailUrl: string | null,
  params: any,
  isPrimary: boolean,
  variantType: string | null,
  name?: string | null,
  viewedAt?: string | null
): Promise<any> {
  const variantRecord: Record<string, any> = {
    generation_id: generationId,
    location,
    thumbnail_url: thumbnailUrl,
    params,
    is_primary: isPrimary,
    variant_type: variantType,
    name: name || null,
    created_at: new Date().toISOString()
  };

  // If viewedAt is provided, mark the variant as already viewed
  if (viewedAt) {
    variantRecord.viewed_at = viewedAt;
  }

  console.log(`[Variant] Creating variant for generation ${generationId}: type=${variantType}, isPrimary=${isPrimary}, viewed=${!!viewedAt}`);

  const { data, error } = await supabase
    .from('generation_variants')
    .insert(variantRecord)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create variant: ${error.message}`);
  }

  console.log(`[Variant] Created variant ${data.id} for generation ${generationId}`);
  return data;
}

/**
 * Link generation to shot using the existing RPC
 */
export async function linkGenerationToShot(
  supabase: any,
  shotId: string,
  generationId: string,
  addInPosition: boolean
): Promise<void> {
  try {
    const { error } = await supabase.rpc('add_generation_to_shot', {
      p_shot_id: shotId,
      p_generation_id: generationId,
      p_with_position: addInPosition
    });

    if (error) {
      console.error(`[ShotLink] Failed to link generation ${generationId} to shot ${shotId}:`, error);
    } else {
      console.log(`[ShotLink] Successfully linked generation ${generationId} to shot ${shotId}`);
    }
  } catch (error) {
    console.error(`[ShotLink] Exception linking generation to shot:`, error);
  }
}
