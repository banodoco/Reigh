-- Simplify get_shared_shot_data to only return live data
-- No legacy fallback extraction - matches useAllShotGenerations format exactly

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
BEGIN
  -- 1. Get share record
  SELECT
    id, share_slug, generation_id, creator_id, view_count, shot_id,
    cached_generation_data, creator_username, creator_name, creator_avatar_url
  INTO share_record
  FROM shared_generations
  WHERE share_slug = share_slug_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Share not found');
  END IF;

  -- 2. Derive shot_id if not stored
  IF share_record.shot_id IS NULL THEN
    SELECT DISTINCT sg.shot_id INTO share_record.shot_id
    FROM shot_generations sg
    WHERE sg.generation_id = share_record.generation_id
    LIMIT 1;
  END IF;

  IF share_record.shot_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Shot not found');
  END IF;

  -- 3. Get live shot data
  SELECT id, name, settings
  INTO shot_record
  FROM shots
  WHERE id = share_record.shot_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Shot has been deleted');
  END IF;

  -- 4. Get travel settings
  travel_settings := COALESCE(shot_record.settings->'travel_between_images', '{}'::jsonb);

  -- 5. Get images - EXACT same format as mapShotGenerationToRow
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      -- Primary ID fields
      'id', sg.id,
      'generation_id', g.id,
      -- Deprecated (kept for backwards compat)
      'shotImageEntryId', sg.id,
      'shot_generation_id', sg.id,
      -- Generation data with primary variant URLs
      'location', COALESCE(pv.location, g.location),
      'imageUrl', COALESCE(pv.location, g.location),
      'thumbUrl', COALESCE(pv.thumbnail_url, g.thumbnail_url, pv.location, g.location),
      'type', COALESCE(g.type, 'image'),
      'created_at', g.created_at,
      'createdAt', g.created_at,
      'starred', COALESCE(g.starred, false),
      'name', g.name,
      'based_on', g.based_on,
      'params', COALESCE(g.params, '{}'::jsonb),
      -- From shot_generations
      'timeline_frame', sg.timeline_frame,
      'metadata', COALESCE(sg.metadata, '{}'::jsonb),
      -- Legacy support
      'position', CASE WHEN sg.timeline_frame IS NOT NULL THEN floor(sg.timeline_frame / 50) ELSE NULL END
    ) ORDER BY sg.timeline_frame ASC NULLS LAST
  ), '[]'::jsonb)
  INTO shot_images
  FROM shot_generations sg
  JOIN generations g ON sg.generation_id = g.id
  LEFT JOIN generation_variants pv ON g.primary_variant_id = pv.id
  WHERE sg.shot_id = share_record.shot_id
    AND g.type = 'image';

  -- 6. Get shared generation (video)
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

  -- Use cached if generation deleted
  IF shared_generation IS NULL THEN
    shared_generation := share_record.cached_generation_data;
  END IF;

  -- 7. Return normalized data
  -- Include raw_settings for debugging
  RETURN jsonb_build_object(
    'shot_id', share_record.shot_id,
    'shot_name', shot_record.name,
    'generation', shared_generation,
    'images', shot_images,
    'raw_settings', travel_settings,
    'settings', jsonb_build_object(
      'generation_mode', COALESCE(travel_settings->>'generationMode', 'batch'),
      'prompt', COALESCE(travel_settings->>'prompt', ''),
      'negative_prompt', COALESCE(travel_settings->>'negativePrompt', ''),
      'frames', COALESCE((travel_settings->>'batchVideoFrames')::int, 61),
      'steps', COALESCE((travel_settings->>'batchVideoSteps')::int, 6),
      'motion', COALESCE((travel_settings->>'amountOfMotion')::int, 50),
      'enhance_prompt', COALESCE((travel_settings->>'enhancePrompt')::boolean, false),
      'phase_config', travel_settings->'phaseConfig',
      'context_frames', COALESCE((travel_settings->>'contextFrames')::int, 0),
      'motion_mode', COALESCE(travel_settings->>'motionMode', 'basic'),
      'advanced_mode', COALESCE((travel_settings->>'advancedMode')::boolean, false),
      'turbo_mode', COALESCE((travel_settings->>'turboMode')::boolean, false),
      'loras', COALESCE(travel_settings->'loras', '[]'::jsonb)
    ),
    'creator_id', share_record.creator_id,
    'view_count', share_record.view_count,
    'creator_username', share_record.creator_username,
    'creator_name', share_record.creator_name,
    'creator_avatar_url', share_record.creator_avatar_url
  );
END;
$$;
