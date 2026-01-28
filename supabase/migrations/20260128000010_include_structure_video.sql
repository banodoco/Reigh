-- Include structure video settings in RPC output
-- Structure video is stored under 'travel-structure-video' key, NOT under 'travel-between-images'
-- This allows share pages to display the camera guidance video

CREATE OR REPLACE FUNCTION get_shared_shot_data(share_slug_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_record RECORD;
  shot_record RECORD;
  shot_generations_data JSONB;
  segment_children_data JSONB;
  all_generations JSONB;
  shared_generation JSONB;
  travel_settings JSONB;
  structure_video_settings JSONB;
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

  -- 4. Get ALL shot_generations in GenerationRow format (same as mapShotGenerationToRow)
  -- IMPORTANT: Include parent_generation_id for video parent/child detection
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sg.id,
      'generation_id', g.id,
      'shotImageEntryId', sg.id,
      'shot_generation_id', sg.id,
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
      'parent_generation_id', g.parent_generation_id,
      'child_order', g.child_order,
      'pair_shot_generation_id', g.pair_shot_generation_id,
      'timeline_frame', sg.timeline_frame,
      'metadata', COALESCE(sg.metadata, '{}'::jsonb),
      'position', CASE WHEN sg.timeline_frame IS NOT NULL THEN floor(sg.timeline_frame / 50) ELSE NULL END
    ) ORDER BY sg.timeline_frame ASC NULLS LAST
  ), '[]'::jsonb)
  INTO shot_generations_data
  FROM shot_generations sg
  JOIN generations g ON sg.generation_id = g.id
  LEFT JOIN generation_variants pv ON g.primary_variant_id = pv.id
  WHERE sg.shot_id = share_record.shot_id;

  -- 5. Get CHILDREN of parent video generations
  -- Parent videos have type='video', no parent_generation_id, and either orchestrator_details or children
  -- Children are segment videos with parent_generation_id pointing to a parent in shot_generations
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', child.id,  -- Use child.id as both id and generation_id (no shot_generation entry)
      'generation_id', child.id,
      'shotImageEntryId', NULL,
      'shot_generation_id', NULL,
      'location', COALESCE(cpv.location, child.location),
      'imageUrl', COALESCE(cpv.location, child.location),
      'thumbUrl', COALESCE(cpv.thumbnail_url, child.thumbnail_url, cpv.location, child.location),
      'type', COALESCE(child.type, 'video'),
      'created_at', child.created_at,
      'createdAt', child.created_at,
      'starred', COALESCE(child.starred, false),
      'name', child.name,
      'based_on', child.based_on,
      'params', COALESCE(child.params, '{}'::jsonb),
      'parent_generation_id', child.parent_generation_id,
      'child_order', child.child_order,
      'pair_shot_generation_id', child.pair_shot_generation_id,
      'timeline_frame', NULL,  -- Children don't have timeline positions
      'metadata', '{}'::jsonb,
      'position', NULL
    ) ORDER BY child.child_order ASC NULLS LAST, child.created_at ASC
  ), '[]'::jsonb)
  INTO segment_children_data
  FROM generations child
  LEFT JOIN generation_variants cpv ON child.primary_variant_id = cpv.id
  WHERE child.parent_generation_id IN (
    -- Find all parent video generation IDs from shot_generations
    SELECT g.id
    FROM shot_generations sg
    JOIN generations g ON sg.generation_id = g.id
    WHERE sg.shot_id = share_record.shot_id
      AND g.type = 'video'
      AND g.parent_generation_id IS NULL
  );

  -- 6. Combine shot_generations + segment children
  -- Use jsonb array concatenation
  all_generations := shot_generations_data || segment_children_data;

  -- 7. Get shared generation (the specific video being shared)
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

  IF shared_generation IS NULL THEN
    shared_generation := share_record.cached_generation_data;
  END IF;

  -- 8. Get settings from both keys
  -- Main travel settings
  travel_settings := COALESCE(shot_record.settings->'travel-between-images', '{}'::jsonb);

  -- Structure video settings (stored under separate key 'travel-structure-video')
  structure_video_settings := shot_record.settings->'travel-structure-video';

  -- Merge structure video into travel settings for frontend consumption
  -- Include FULL array of structure_videos with all their settings (start_frame, end_frame, etc.)
  -- Also provide legacy 'structureVideo' format for backwards compatibility
  IF structure_video_settings IS NOT NULL AND structure_video_settings != 'null'::jsonb THEN
    -- Check for new array format first
    IF structure_video_settings->'structure_videos' IS NOT NULL
       AND jsonb_array_length(structure_video_settings->'structure_videos') > 0 THEN
      -- Include the full array of structure videos (for multi-video support)
      travel_settings := travel_settings || jsonb_build_object(
        'structureVideos', structure_video_settings->'structure_videos'
      );
      -- Also provide legacy format using first video for backwards compat
      travel_settings := travel_settings || jsonb_build_object(
        'structureVideo', jsonb_build_object(
          'path', structure_video_settings->'structure_videos'->0->>'path',
          'metadata', structure_video_settings->'structure_videos'->0->'metadata',
          'treatment', COALESCE(structure_video_settings->'structure_videos'->0->>'treatment', 'adjust'),
          'motionStrength', COALESCE((structure_video_settings->'structure_videos'->0->>'motion_strength')::numeric, 1.0),
          'structureType', COALESCE(structure_video_settings->'structure_videos'->0->>'structure_type', 'uni3c'),
          'startFrame', COALESCE((structure_video_settings->'structure_videos'->0->>'start_frame')::integer, 0),
          'endFrame', (structure_video_settings->'structure_videos'->0->>'end_frame')::integer
        )
      );
    -- Legacy single-video format
    ELSIF structure_video_settings->>'structure_video_path' IS NOT NULL THEN
      travel_settings := travel_settings || jsonb_build_object(
        'structureVideo', jsonb_build_object(
          'path', structure_video_settings->>'structure_video_path',
          'metadata', structure_video_settings->'metadata',
          'treatment', COALESCE(structure_video_settings->>'structure_video_treatment', 'adjust'),
          'motionStrength', COALESCE((structure_video_settings->>'structure_video_motion_strength')::numeric, 1.0),
          'structureType', COALESCE(structure_video_settings->>'structure_video_type', 'uni3c')
        )
      );
    -- Even older camelCase format
    ELSIF structure_video_settings->>'path' IS NOT NULL THEN
      travel_settings := travel_settings || jsonb_build_object(
        'structureVideo', jsonb_build_object(
          'path', structure_video_settings->>'path',
          'metadata', structure_video_settings->'metadata',
          'treatment', COALESCE(structure_video_settings->>'treatment', 'adjust'),
          'motionStrength', COALESCE((structure_video_settings->>'motionStrength')::numeric, 1.0),
          'structureType', COALESCE(structure_video_settings->>'structureType', 'uni3c')
        )
      );
    END IF;
  END IF;

  -- 9. Return data
  RETURN jsonb_build_object(
    'shot_id', share_record.shot_id,
    'shot_name', shot_record.name,
    'generation', shared_generation,
    'images', all_generations,
    'settings', travel_settings,
    'creator_id', share_record.creator_id,
    'view_count', share_record.view_count,
    'creator_username', share_record.creator_username,
    'creator_name', share_record.creator_name,
    'creator_avatar_url', share_record.creator_avatar_url
  );
END;
$$;
