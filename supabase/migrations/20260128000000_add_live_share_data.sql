-- Add shot_id column to shared_generations for live data lookups
-- This enables fetching live shot data (images, settings) instead of cached data

-- Add shot_id column (nullable for backwards compatibility with existing shares)
ALTER TABLE shared_generations ADD COLUMN IF NOT EXISTS shot_id UUID REFERENCES shots(id) ON DELETE SET NULL;

-- Create index for shot_id lookups
CREATE INDEX IF NOT EXISTS idx_shared_generations_shot_id ON shared_generations(shot_id);

-- Backfill existing shares by looking up shot_id from shot_generations
-- This finds the shot that contains the shared generation
UPDATE shared_generations sg
SET shot_id = (
  SELECT DISTINCT shot_gen.shot_id
  FROM shot_generations shot_gen
  WHERE shot_gen.generation_id = sg.generation_id
  LIMIT 1
)
WHERE sg.shot_id IS NULL;

-- Create function to get live shared shot data
-- This function returns live data for share pages, bypassing RLS for public access
CREATE OR REPLACE FUNCTION get_shared_shot_data(share_slug_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_record RECORD;
  shot_record RECORD;
  shot_images JSONB;
  shared_generation JSONB;
  travel_settings JSONB;
  result JSONB;
BEGIN
  -- 1. Validate share exists and get share data
  SELECT
    id,
    share_slug,
    generation_id,
    task_id,
    creator_id,
    view_count,
    shot_id,
    cached_generation_data,
    cached_task_data,
    creator_username,
    creator_name,
    creator_avatar_url
  INTO share_record
  FROM shared_generations
  WHERE share_slug = share_slug_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Share not found');
  END IF;

  -- 2. Try to look up shot_id if not stored directly
  IF share_record.shot_id IS NULL THEN
    -- Derive shot_id from shot_generations join
    SELECT DISTINCT sg.shot_id INTO share_record.shot_id
    FROM shot_generations sg
    WHERE sg.generation_id = share_record.generation_id
    LIMIT 1;
  END IF;

  -- 3. If we still don't have a shot_id, return cached data as fallback
  IF share_record.shot_id IS NULL THEN
    RETURN jsonb_build_object(
      'fallback', true,
      'generation', share_record.cached_generation_data,
      'task', share_record.cached_task_data,
      'creator_id', share_record.creator_id,
      'view_count', share_record.view_count,
      'creator_username', share_record.creator_username,
      'creator_name', share_record.creator_name,
      'creator_avatar_url', share_record.creator_avatar_url
    );
  END IF;

  -- 4. Fetch live shot data
  SELECT id, name, settings
  INTO shot_record
  FROM shots
  WHERE id = share_record.shot_id;

  -- If shot was deleted, return cached data as fallback
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'fallback', true,
      'generation', share_record.cached_generation_data,
      'task', share_record.cached_task_data,
      'creator_id', share_record.creator_id,
      'view_count', share_record.view_count,
      'creator_username', share_record.creator_username,
      'creator_name', share_record.creator_name,
      'creator_avatar_url', share_record.creator_avatar_url
    );
  END IF;

  -- 5. Extract travel_between_images settings
  travel_settings := COALESCE(shot_record.settings->'travel_between_images', '{}'::jsonb);

  -- 6. Fetch shot images (same format as useAllShotGenerations)
  -- Only images, not videos (for the input images display)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sg.id,
      'generation_id', g.id,
      'timeline_frame', sg.timeline_frame,
      'metadata', sg.metadata,
      'imageUrl', COALESCE(
        pv.location,
        g.location
      ),
      'thumbUrl', COALESCE(
        pv.thumbnail_url,
        g.thumbnail_url
      ),
      'location', g.location,
      'thumbnail_url', g.thumbnail_url,
      'type', g.type,
      'created_at', g.created_at,
      'starred', g.starred,
      'name', g.name,
      'based_on', g.based_on,
      'params', g.params
    ) ORDER BY sg.timeline_frame ASC NULLS LAST
  ), '[]'::jsonb)
  INTO shot_images
  FROM shot_generations sg
  JOIN generations g ON sg.generation_id = g.id
  LEFT JOIN generation_variants pv ON g.primary_variant_id = pv.id
  WHERE sg.shot_id = share_record.shot_id
    AND g.type = 'image';

  -- 7. Fetch the shared generation (the video output)
  SELECT jsonb_build_object(
    'id', g.id,
    'location', g.location,
    'thumbnail_url', g.thumbnail_url,
    'type', g.type,
    'created_at', g.created_at,
    'name', g.name,
    'params', g.params
  )
  INTO shared_generation
  FROM generations g
  WHERE g.id = share_record.generation_id;

  -- If generation was deleted, fall back to cached data
  IF shared_generation IS NULL THEN
    RETURN jsonb_build_object(
      'fallback', true,
      'generation', share_record.cached_generation_data,
      'task', share_record.cached_task_data,
      'creator_id', share_record.creator_id,
      'view_count', share_record.view_count,
      'creator_username', share_record.creator_username,
      'creator_name', share_record.creator_name,
      'creator_avatar_url', share_record.creator_avatar_url
    );
  END IF;

  -- 8. Build and return result
  result := jsonb_build_object(
    'fallback', false,
    'shot_id', share_record.shot_id,
    'shot_name', shot_record.name,
    'generation', shared_generation,
    'images', shot_images,
    'settings', jsonb_build_object(
      'generation_mode', COALESCE(travel_settings->>'generationMode', 'batch'),
      'prompt', COALESCE(travel_settings->>'batchVideoPrompt', ''),
      'negative_prompt', COALESCE(travel_settings->>'negativePrompt', ''),
      'frames', COALESCE((travel_settings->>'batchVideoFrames')::int, 38),
      'steps', COALESCE((travel_settings->>'batchVideoSteps')::int, 6),
      'motion', COALESCE((travel_settings->>'amountOfMotion')::int, 50),
      'enhance_prompt', COALESCE((travel_settings->>'enhancePrompt')::boolean, false),
      'phase_config', travel_settings->'phaseConfig',
      'context_frames', COALESCE((travel_settings->>'contextFrames')::int, 0)
    ),
    'creator_id', share_record.creator_id,
    'view_count', share_record.view_count,
    'creator_username', share_record.creator_username,
    'creator_name', share_record.creator_name,
    'creator_avatar_url', share_record.creator_avatar_url
  );

  RETURN result;
END;
$$;

-- Grant execute permission to both authenticated and anonymous users
GRANT EXECUTE ON FUNCTION get_shared_shot_data(TEXT) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION get_shared_shot_data IS 'Returns live shot data for share pages, bypassing RLS for public access. Falls back to cached data if shot is deleted.';
COMMENT ON COLUMN shared_generations.shot_id IS 'Reference to the shot this generation belongs to, for live data lookups';

-- ============================================================================
-- COPY SHOT FROM SHARE
-- Allows users to copy a shared shot to their own project
-- ============================================================================

CREATE OR REPLACE FUNCTION copy_shot_from_share(
  share_slug_param TEXT,
  target_project_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share_record RECORD;
  v_source_shot_id UUID;
  v_new_shot_id UUID;
  v_shot_name TEXT;
  v_shot_settings JSONB;
  v_shot_aspect_ratio TEXT;
  v_next_position INTEGER;
  v_copied_count INTEGER := 0;
  v_calling_user_id UUID;
BEGIN
  -- Get the calling user's ID
  v_calling_user_id := auth.uid();

  IF v_calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify the user owns the target project
  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = target_project_id
    AND user_id = v_calling_user_id
  ) THEN
    RAISE EXCEPTION 'Target project not found or access denied';
  END IF;

  -- Get the share record
  SELECT shot_id, generation_id
  INTO v_share_record
  FROM shared_generations
  WHERE share_slug = share_slug_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Share not found';
  END IF;

  v_source_shot_id := v_share_record.shot_id;

  -- If no shot_id stored, try to derive it from shot_generations
  IF v_source_shot_id IS NULL THEN
    SELECT DISTINCT sg.shot_id INTO v_source_shot_id
    FROM shot_generations sg
    WHERE sg.generation_id = v_share_record.generation_id
    LIMIT 1;
  END IF;

  IF v_source_shot_id IS NULL THEN
    RAISE EXCEPTION 'Source shot not found for this share';
  END IF;

  -- Get source shot details
  SELECT name, settings, aspect_ratio
  INTO v_shot_name, v_shot_settings, v_shot_aspect_ratio
  FROM shots
  WHERE id = v_source_shot_id;

  IF v_shot_name IS NULL THEN
    RAISE EXCEPTION 'Source shot has been deleted';
  END IF;

  -- Calculate next position in target project
  SELECT COALESCE(MAX(position), 0) + 1
  INTO v_next_position
  FROM shots
  WHERE project_id = target_project_id;

  -- Create the new shot
  INSERT INTO shots (name, project_id, position, aspect_ratio, settings)
  VALUES (
    v_shot_name || ' (from share)',
    target_project_id,
    v_next_position,
    v_shot_aspect_ratio,
    v_shot_settings
  )
  RETURNING id INTO v_new_shot_id;

  -- Copy positioned images (same logic as duplicate_shot)
  -- Only copies timeline_frame >= 0, excludes videos
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
  SELECT
    v_new_shot_id,
    sg.generation_id,
    sg.timeline_frame,
    sg.metadata
  FROM shot_generations sg
  JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = v_source_shot_id
    AND sg.timeline_frame IS NOT NULL
    AND sg.timeline_frame >= 0
    AND (g.type IS NULL OR g.type NOT LIKE '%video%');

  GET DIAGNOSTICS v_copied_count = ROW_COUNT;

  RAISE LOG '[CopyShotFromShare] Created shot % with % images from share % (source shot %)',
    v_new_shot_id, v_copied_count, share_slug_param, v_source_shot_id;

  RETURN v_new_shot_id;

EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[CopyShotFromShare] Error: %', SQLERRM;
  RAISE;
END;
$$;

-- Grant execute to authenticated users only (need to be logged in to copy)
GRANT EXECUTE ON FUNCTION copy_shot_from_share(TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION copy_shot_from_share IS 'Copies a shared shot to the user''s project. Copies shot settings and positioned images (excludes videos).';
