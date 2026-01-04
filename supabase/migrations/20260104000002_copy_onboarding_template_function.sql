-- Function to copy onboarding template content to a new user's project
-- Uses SECURITY DEFINER to bypass RLS and read from template project

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
  template_shot RECORD;
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
      AND is_starred = true
      AND type = 'image'
  LOOP
    INSERT INTO generations (project_id, type, location, thumbnail_url, params, is_starred)
    VALUES (
      target_project_id,
      starred_gen.type,
      starred_gen.location,
      starred_gen.thumbnail_url,
      COALESCE(starred_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb,
      true
    );
  END LOOP;

  -- 4. Copy template shot settings to new shot
  SELECT settings, aspect_ratio INTO template_shot
  FROM shots
  WHERE id = template_shot_id;

  IF template_shot IS NOT NULL THEN
    UPDATE shots
    SET settings = template_shot.settings,
        aspect_ratio = template_shot.aspect_ratio
    WHERE id = target_shot_id;
  END IF;

  -- 5. Copy timeline images from template shot
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
    -- Create new generation record
    INSERT INTO generations (project_id, type, location, thumbnail_url, params)
    VALUES (
      target_project_id,
      shot_gen.type,
      shot_gen.location,
      shot_gen.thumbnail_url,
      COALESCE(shot_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb
    )
    RETURNING id INTO new_gen_id;

    -- Link to new shot with same position and metadata
    INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
    VALUES (target_shot_id, new_gen_id, shot_gen.timeline_frame, shot_gen.metadata);
  END LOOP;

  -- 6. Copy featured video if specified
  IF featured_video_id IS NOT NULL THEN
    FOR shot_gen IN
      SELECT type, location, thumbnail_url, params
      FROM generations
      WHERE id = featured_video_id
    LOOP
      -- Create new video generation record
      INSERT INTO generations (project_id, type, location, thumbnail_url, params)
      VALUES (
        target_project_id,
        shot_gen.type,
        shot_gen.location,
        shot_gen.thumbnail_url,
        COALESCE(shot_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb
      )
      RETURNING id INTO new_gen_id;

      -- Link video to shot (no timeline_frame for videos)
      INSERT INTO shot_generations (shot_id, generation_id)
      VALUES (target_shot_id, new_gen_id);
    END LOOP;
  END IF;

  RAISE NOTICE 'Template content copied successfully to project % shot %', target_project_id, target_shot_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION copy_onboarding_template(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION copy_onboarding_template IS 'Copies onboarding template content (starred images, timeline, video) to a new user''s project. Uses SECURITY DEFINER to read from template project.';
