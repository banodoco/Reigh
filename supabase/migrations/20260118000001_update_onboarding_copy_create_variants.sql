-- Migration: Update copy_onboarding_template to create variants explicitly
--
-- Since we disabled the auto-variant trigger (trg_auto_create_variant_after_generation),
-- this function needs to create variants explicitly when copying generations.

CREATE OR REPLACE FUNCTION copy_onboarding_template(
  target_project_id UUID,
  target_shot_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template_config JSONB;
  template_project_id UUID;
  template_shot_id UUID;
  featured_video_id UUID;
  starred_gen RECORD;
  shot_gen RECORD;
  new_gen_id UUID;
  new_variant_id UUID;
  video_params JSONB;
  orchestrator_payload JSONB;
  structure_video_settings JSONB;
  travel_settings JSONB;
BEGIN
  -- 1. Verify caller owns the target project
  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = target_project_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized: you do not own this project';
  END IF;

  -- 2. Get template config
  SELECT value INTO template_config
  FROM onboarding_config
  WHERE key = 'template';

  IF template_config IS NULL THEN
    RAISE NOTICE 'No template config found, skipping onboarding content';
    RETURN;
  END IF;

  template_project_id := (template_config->>'project_id')::UUID;
  template_shot_id := (template_config->>'shot_id')::UUID;
  featured_video_id := (template_config->>'featured_video_id')::UUID;

  -- 3. Copy starred images from template project to new user's gallery
  FOR starred_gen IN
    SELECT type, location, thumbnail_url, params
    FROM generations
    WHERE project_id = template_project_id
      AND starred = true
      AND type = 'image'
  LOOP
    new_gen_id := gen_random_uuid();
    new_variant_id := gen_random_uuid();

    -- Insert generation without location (variant will provide it via sync trigger)
    INSERT INTO generations (id, project_id, type, params, starred)
    VALUES (
      new_gen_id,
      target_project_id,
      starred_gen.type,
      COALESCE(starred_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb,
      true
    );

    -- Create primary variant (sync trigger will update generation.location)
    INSERT INTO generation_variants (id, generation_id, location, thumbnail_url, params, is_primary, variant_type, created_at)
    VALUES (
      new_variant_id,
      new_gen_id,
      starred_gen.location,
      starred_gen.thumbnail_url,
      COALESCE(starred_gen.params, '{}'::jsonb) || '{"is_sample": true, "created_from": "onboarding_copy"}'::jsonb,
      true,
      'original',
      NOW()
    );
  END LOOP;

  -- 4. Copy timeline images from template shot
  FOR shot_gen IN
    SELECT
      sg.timeline_frame,
      sg.metadata,
      g.type,
      g.location,
      g.thumbnail_url,
      g.params
    FROM shot_generations sg
    JOIN generations g ON g.id = sg.generation_id
    WHERE sg.shot_id = template_shot_id
      AND sg.timeline_frame IS NOT NULL
      AND g.type != 'video'
    ORDER BY sg.timeline_frame
  LOOP
    new_gen_id := gen_random_uuid();
    new_variant_id := gen_random_uuid();

    -- Insert generation without location
    INSERT INTO generations (id, project_id, type, params)
    VALUES (
      new_gen_id,
      target_project_id,
      shot_gen.type,
      COALESCE(shot_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb
    );

    -- Create primary variant
    INSERT INTO generation_variants (id, generation_id, location, thumbnail_url, params, is_primary, variant_type, created_at)
    VALUES (
      new_variant_id,
      new_gen_id,
      shot_gen.location,
      shot_gen.thumbnail_url,
      COALESCE(shot_gen.params, '{}'::jsonb) || '{"is_sample": true, "created_from": "onboarding_copy"}'::jsonb,
      true,
      'original',
      NOW()
    );

    -- Link to new shot with same position and metadata
    INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
    VALUES (target_shot_id, new_gen_id, shot_gen.timeline_frame, shot_gen.metadata);
  END LOOP;

  -- 5. Copy featured video if specified and extract settings from its params
  IF featured_video_id IS NOT NULL THEN
    -- Get video params to extract settings
    SELECT params INTO video_params
    FROM generations
    WHERE id = featured_video_id;

    FOR shot_gen IN
      SELECT type, location, thumbnail_url, params
      FROM generations
      WHERE id = featured_video_id
    LOOP
      new_gen_id := gen_random_uuid();
      new_variant_id := gen_random_uuid();

      -- Insert generation without location
      INSERT INTO generations (id, project_id, type, params)
      VALUES (
        new_gen_id,
        target_project_id,
        shot_gen.type,
        COALESCE(shot_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb
      );

      -- Create primary variant
      INSERT INTO generation_variants (id, generation_id, location, thumbnail_url, params, is_primary, variant_type, created_at)
      VALUES (
        new_variant_id,
        new_gen_id,
        shot_gen.location,
        shot_gen.thumbnail_url,
        COALESCE(shot_gen.params, '{}'::jsonb) || '{"is_sample": true, "created_from": "onboarding_copy"}'::jsonb,
        true,
        'original',
        NOW()
      );

      -- Link video to shot (no timeline_frame for videos)
      INSERT INTO shot_generations (shot_id, generation_id)
      VALUES (target_shot_id, new_gen_id);
    END LOOP;

    -- 6. Extract settings from video's full_orchestrator_payload and apply to shot
    orchestrator_payload := video_params->'full_orchestrator_payload';

    IF orchestrator_payload IS NOT NULL THEN
      -- Build structure video settings (travel-structure-video)
      structure_video_settings := jsonb_build_object(
        'structure_video_path', orchestrator_payload->>'structure_video_path',
        'structure_video_treatment', COALESCE(orchestrator_payload->>'structure_video_treatment', 'adjust'),
        'structure_video_motion_strength', COALESCE((orchestrator_payload->>'structure_video_motion_strength')::numeric, 0.7),
        'structure_video_type', COALESCE(orchestrator_payload->>'structure_video_type', 'flow'),
        'metadata', null,
        'resource_id', null
      );

      -- Build travel-between-images settings
      travel_settings := jsonb_build_object(
        'phaseConfig', orchestrator_payload->'phase_config',
        'generationMode', COALESCE(orchestrator_payload->>'generation_mode', 'timeline'),
        'enhancePrompt', COALESCE((orchestrator_payload->>'enhance_prompt')::boolean, false),
        'generationTypeMode', 'vace',
        'advancedMode', false,
        'turboMode', false,
        'motionMode', 'basic',
        'selectedModel', 'wan-2.1',
        'amountOfMotion', 50,
        'batchVideoSteps', 6,
        'batchVideoFrames', 61,
        'dimensionSource', 'firstImage',
        'videoControlMode', 'batch',
        'textBeforePrompts', '',
        'textAfterPrompts', '',
        'batchVideoPrompt', '',
        'selectedLoras', '[]'::jsonb,
        'pairConfigs', '[]'::jsonb,
        'shotImageIds', '[]'::jsonb
      );

      -- Update shot settings with extracted values
      UPDATE shots
      SET settings = jsonb_build_object(
        'travel-between-images', travel_settings,
        'travel-structure-video', structure_video_settings
      )
      WHERE id = target_shot_id;

      RAISE NOTICE 'Extracted and applied settings from video params to shot %', target_shot_id;
    ELSE
      RAISE NOTICE 'No orchestrator_payload found in video params, skipping settings extraction';
    END IF;
  END IF;

  RAISE NOTICE 'Template content copied successfully to project % shot %', target_project_id, target_shot_id;
END;
$$;

COMMENT ON FUNCTION copy_onboarding_template IS 'Copies onboarding template content (starred images, timeline, video) to a new user''s project. Creates variants explicitly for all generations. Extracts settings from video params to ensure shot settings are properly initialized.';
