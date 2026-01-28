-- Fix field names in get_shared_shot_data function
-- ALWAYS return normalized data in the same format (even for fallback cases)
-- This eliminates complex frontend extraction logic

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
  cached_shot_data JSONB;
  fallback_settings JSONB;
  fallback_images JSONB;
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
    SELECT DISTINCT sg.shot_id INTO share_record.shot_id
    FROM shot_generations sg
    WHERE sg.generation_id = share_record.generation_id
    LIMIT 1;
  END IF;

  -- 3. If we have a shot_id, try to fetch live data
  IF share_record.shot_id IS NOT NULL THEN
    SELECT id, name, settings
    INTO shot_record
    FROM shots
    WHERE id = share_record.shot_id;
  END IF;

  -- 4. If we have live shot data, use it
  IF shot_record.id IS NOT NULL THEN
    travel_settings := COALESCE(shot_record.settings->'travel_between_images', '{}'::jsonb);

    -- Fetch shot images
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', sg.id,
        'generation_id', g.id,
        'timeline_frame', sg.timeline_frame,
        'metadata', sg.metadata,
        'imageUrl', COALESCE(pv.location, g.location),
        'thumbUrl', COALESCE(pv.thumbnail_url, g.thumbnail_url),
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

    -- Fetch shared generation
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

    -- If generation exists, return live data
    IF shared_generation IS NOT NULL THEN
      RETURN jsonb_build_object(
        'fallback', false,
        'shot_id', share_record.shot_id,
        'shot_name', shot_record.name,
        'generation', shared_generation,
        'images', shot_images,
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
    END IF;
  END IF;

  -- 5. FALLBACK: Extract normalized data from cached_task_data
  -- Try to extract from cached_shot_data first (newer format)
  cached_shot_data := share_record.cached_task_data->'cached_shot_data';

  IF cached_shot_data IS NOT NULL AND cached_shot_data->>'shot_id' IS NOT NULL THEN
    -- Use cached_shot_data (standardized format from newer shares)
    fallback_settings := jsonb_build_object(
      'generation_mode', COALESCE(cached_shot_data->>'generation_mode', 'batch'),
      'prompt', COALESCE(cached_shot_data->'settings'->>'prompt', ''),
      'negative_prompt', COALESCE(cached_shot_data->'settings'->>'negative_prompt', ''),
      'frames', COALESCE((cached_shot_data->'settings'->>'frames')::int, 61),
      'steps', COALESCE((cached_shot_data->'settings'->>'steps')::int, 6),
      'motion', COALESCE((cached_shot_data->'settings'->>'motion')::int, 50),
      'enhance_prompt', COALESCE((cached_shot_data->'settings'->>'enhance_prompt')::boolean, false),
      'phase_config', cached_shot_data->'settings'->'phase_config',
      'context_frames', COALESCE((cached_shot_data->'settings'->>'context_frames')::int, 0),
      'motion_mode', 'basic',
      'advanced_mode', false,
      'turbo_mode', false,
      'loras', '[]'::jsonb
    );

    -- Convert cached images to normalized format
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', 'cached-' || (row_number() OVER ())::text,
        'generation_id', null,
        'timeline_frame', (img->>'timeline_frame')::int,
        'metadata', null,
        'imageUrl', img->>'url',
        'thumbUrl', img->>'thumbnail_url',
        'location', img->>'url',
        'thumbnail_url', img->>'thumbnail_url',
        'type', 'image',
        'created_at', null,
        'starred', false,
        'name', null,
        'based_on', null,
        'params', null
      )
    ), '[]'::jsonb)
    INTO fallback_images
    FROM jsonb_array_elements(cached_shot_data->'images') AS img;
  ELSE
    -- Extract from legacy task params (oldest format)
    fallback_settings := jsonb_build_object(
      'generation_mode', COALESCE(
        share_record.cached_task_data->'params'->'orchestrator_details'->>'generation_mode',
        share_record.cached_task_data->'params'->'full_orchestrator_payload'->>'generation_mode',
        share_record.cached_task_data->'params'->>'generation_mode',
        'batch'
      ),
      'prompt', COALESCE(
        share_record.cached_task_data->'params'->'orchestrator_details'->>'base_prompt',
        share_record.cached_task_data->'params'->'full_orchestrator_payload'->>'base_prompt',
        share_record.cached_task_data->'params'->>'prompt',
        ''
      ),
      'negative_prompt', COALESCE(
        share_record.cached_task_data->'params'->'orchestrator_details'->>'negative_prompt',
        share_record.cached_task_data->'params'->'full_orchestrator_payload'->>'negative_prompt',
        share_record.cached_task_data->'params'->>'negative_prompt',
        ''
      ),
      'frames', COALESCE(
        (share_record.cached_task_data->'params'->'full_orchestrator_payload'->>'frames')::int,
        (share_record.cached_task_data->'params'->'orchestrator_details'->>'frames')::int,
        (share_record.cached_task_data->'params'->>'frames')::int,
        61
      ),
      'steps', COALESCE(
        (share_record.cached_task_data->'params'->'full_orchestrator_payload'->>'steps')::int,
        (share_record.cached_task_data->'params'->'orchestrator_details'->>'steps')::int,
        (share_record.cached_task_data->'params'->>'steps')::int,
        6
      ),
      'motion', COALESCE(
        (share_record.cached_task_data->'params'->'full_orchestrator_payload'->>'amount_of_motion')::int,
        (share_record.cached_task_data->'params'->'orchestrator_details'->>'amount_of_motion')::int,
        (share_record.cached_task_data->'params'->>'amount_of_motion')::int,
        50
      ),
      'enhance_prompt', COALESCE(
        (share_record.cached_task_data->'params'->'orchestrator_details'->>'enhance_prompt')::boolean,
        (share_record.cached_task_data->'params'->'full_orchestrator_payload'->>'enhance_prompt')::boolean,
        false
      ),
      'phase_config', COALESCE(
        share_record.cached_task_data->'params'->'orchestrator_details'->'phase_config',
        share_record.cached_task_data->'params'->'full_orchestrator_payload'->'phase_config',
        share_record.cached_task_data->'params'->'phase_config'
      ),
      'context_frames', COALESCE(
        (share_record.cached_task_data->'params'->'full_orchestrator_payload'->>'context_frames')::int,
        (share_record.cached_task_data->'params'->'orchestrator_details'->>'context_frames')::int,
        0
      ),
      'motion_mode', 'basic',
      'advanced_mode', false,
      'turbo_mode', false,
      'loras', '[]'::jsonb
    );

    -- Extract images from legacy format
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', 'legacy-' || (row_number() OVER ())::text,
        'generation_id', null,
        'timeline_frame', null,
        'metadata', null,
        'imageUrl', trim(both '"' from img::text),
        'thumbUrl', null,
        'location', trim(both '"' from img::text),
        'thumbnail_url', null,
        'type', 'image',
        'created_at', null,
        'starred', false,
        'name', null,
        'based_on', null,
        'params', null
      )
    ), '[]'::jsonb)
    INTO fallback_images
    FROM jsonb_array_elements(
      COALESCE(
        share_record.cached_task_data->'params'->'orchestrator_details'->'input_image_paths_resolved',
        share_record.cached_task_data->'params'->'full_orchestrator_payload'->'input_image_paths_resolved',
        share_record.cached_task_data->'params'->'input_image_paths_resolved',
        share_record.cached_task_data->'params'->'input_images',
        '[]'::jsonb
      )
    ) AS img;
  END IF;

  -- Return normalized fallback data
  RETURN jsonb_build_object(
    'fallback', true,
    'shot_id', null,
    'shot_name', null,
    'generation', share_record.cached_generation_data,
    'images', COALESCE(fallback_images, '[]'::jsonb),
    'settings', fallback_settings,
    'creator_id', share_record.creator_id,
    'view_count', share_record.view_count,
    'creator_username', share_record.creator_username,
    'creator_name', share_record.creator_name,
    'creator_avatar_url', share_record.creator_avatar_url
  );
END;
$$;
