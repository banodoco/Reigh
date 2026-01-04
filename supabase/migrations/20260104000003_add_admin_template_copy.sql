-- Add admin version of template copy that skips auth check (for service role only)
-- This allows testing and manual population of template content

CREATE OR REPLACE FUNCTION copy_onboarding_template_admin(
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
  -- Admin function - no auth check, only callable by service role
  -- (RLS on the function itself restricts who can call it)

  -- Get template config
  SELECT value INTO template_config
  FROM onboarding_config
  WHERE key = 'template';

  IF template_config IS NULL THEN
    RAISE EXCEPTION 'No template config found';
  END IF;

  template_project_id := (template_config->>'project_id')::UUID;
  template_shot_id := (template_config->>'shot_id')::UUID;
  featured_video_id := (template_config->>'featured_video_id')::UUID;

  -- Copy starred images from template project to new user's gallery
  FOR starred_gen IN
    SELECT type, location, thumbnail_url, params
    FROM generations
    WHERE project_id = template_project_id
      AND starred = true
      AND type = 'image'
  LOOP
    INSERT INTO generations (project_id, type, location, thumbnail_url, params, starred)
    VALUES (
      target_project_id,
      starred_gen.type,
      starred_gen.location,
      starred_gen.thumbnail_url,
      COALESCE(starred_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb,
      true
    );
  END LOOP;

  -- Copy template shot settings to new shot
  SELECT settings, aspect_ratio INTO template_shot
  FROM shots
  WHERE id = template_shot_id;

  IF template_shot IS NOT NULL THEN
    UPDATE shots
    SET settings = template_shot.settings,
        aspect_ratio = template_shot.aspect_ratio
    WHERE id = target_shot_id;
  END IF;

  -- Copy timeline images from template shot
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
    INSERT INTO generations (project_id, type, location, thumbnail_url, params)
    VALUES (
      target_project_id,
      shot_gen.type,
      shot_gen.location,
      shot_gen.thumbnail_url,
      COALESCE(shot_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb
    )
    RETURNING id INTO new_gen_id;

    INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
    VALUES (target_shot_id, new_gen_id, shot_gen.timeline_frame, shot_gen.metadata);
  END LOOP;

  -- Copy featured video if specified
  IF featured_video_id IS NOT NULL THEN
    FOR shot_gen IN
      SELECT type, location, thumbnail_url, params
      FROM generations
      WHERE id = featured_video_id
    LOOP
      INSERT INTO generations (project_id, type, location, thumbnail_url, params)
      VALUES (
        target_project_id,
        shot_gen.type,
        shot_gen.location,
        shot_gen.thumbnail_url,
        COALESCE(shot_gen.params, '{}'::jsonb) || '{"is_sample": true}'::jsonb
      )
      RETURNING id INTO new_gen_id;

      INSERT INTO shot_generations (shot_id, generation_id)
      VALUES (target_shot_id, new_gen_id);
    END LOOP;
  END IF;

  RAISE NOTICE 'Template content copied successfully to project % shot %', target_project_id, target_shot_id;
END;
$$;

-- Only service role can call this function (no grant to authenticated)
REVOKE ALL ON FUNCTION copy_onboarding_template_admin(UUID, UUID) FROM PUBLIC;

COMMENT ON FUNCTION copy_onboarding_template_admin IS 'Admin version of template copy - no auth check, for testing and manual population.';
