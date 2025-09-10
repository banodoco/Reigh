-- Enforce RLS on core tables and add ownership guards to RPCs
-- Tables: shots, generations, shot_generations
-- RPCs: add_generation_to_shot, insert_shot_at_position, create_shot_with_image

BEGIN;

-- =============================
-- 1) Enable RLS
-- =============================
ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shot_generations ENABLE ROW LEVEL SECURITY;

-- =============================
-- 2) Shots policies
-- =============================
CREATE POLICY "shots: user select"
  ON public.shots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "shots: user insert"
  ON public.shots FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "shots: user update"
  ON public.shots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "shots: user delete"
  ON public.shots FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "shots: service role"
  ON public.shots FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================
-- 3) Generations policies
-- =============================
CREATE POLICY "generations: user select"
  ON public.generations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "generations: user insert"
  ON public.generations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "generations: user update"
  ON public.generations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "generations: user delete"
  ON public.generations FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "generations: service role"
  ON public.generations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================
-- 4) Shot_generations policies (strict: both sides and same-project)
-- =============================
CREATE POLICY "sg: user select"
  ON public.shot_generations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shots s
      JOIN public.projects p ON p.id = s.project_id
      WHERE s.id = shot_generations.shot_id AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.generations g
      JOIN public.projects p2 ON p2.id = g.project_id
      WHERE g.id = shot_generations.generation_id AND p2.user_id = auth.uid()
    )
  );

CREATE POLICY "sg: user insert"
  ON public.shot_generations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shots s
      JOIN public.projects p ON p.id = s.project_id
      WHERE s.id = shot_generations.shot_id AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.generations g
      JOIN public.projects p2 ON p2.id = g.project_id
      WHERE g.id = shot_generations.generation_id AND p2.user_id = auth.uid()
    )
    AND (
      SELECT s.project_id FROM public.shots s WHERE s.id = shot_generations.shot_id
    ) = (
      SELECT g.project_id FROM public.generations g WHERE g.id = shot_generations.generation_id
    )
  );

CREATE POLICY "sg: user update"
  ON public.shot_generations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.shots s
      JOIN public.projects p ON p.id = s.project_id
      WHERE s.id = shot_generations.shot_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shots s
      JOIN public.projects p ON p.id = s.project_id
      WHERE s.id = shot_generations.shot_id AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.generations g
      JOIN public.projects p2 ON p2.id = g.project_id
      WHERE g.id = shot_generations.generation_id AND p2.user_id = auth.uid()
    )
    AND (
      SELECT s.project_id FROM public.shots s WHERE s.id = shot_generations.shot_id
    ) = (
      SELECT g.project_id FROM public.generations g WHERE g.id = shot_generations.generation_id
    )
  );

CREATE POLICY "sg: user delete"
  ON public.shot_generations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.shots s
      JOIN public.projects p ON p.id = s.project_id
      WHERE s.id = shot_generations.shot_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "sg: service role"
  ON public.shot_generations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================
-- 5) Supporting indexes (safe if exist)
-- =============================
CREATE INDEX IF NOT EXISTS idx_shots_project_id ON public.shots(project_id);
CREATE INDEX IF NOT EXISTS idx_generations_project_id ON public.generations(project_id);
CREATE INDEX IF NOT EXISTS idx_sg_shot_id ON public.shot_generations(shot_id);
CREATE INDEX IF NOT EXISTS idx_sg_generation_id ON public.shot_generations(generation_id);

-- =============================
-- 6) RPC ownership guards (SECURITY DEFINER preserved)
-- =============================
-- Guard: insert_shot_at_position
CREATE OR REPLACE FUNCTION insert_shot_at_position(
  p_project_id UUID,
  p_shot_name TEXT,
  p_position INTEGER
) RETURNS TABLE (
  shot_id UUID,
  shot_name TEXT,
  shot_position INTEGER,
  success BOOLEAN
) AS $$
DECLARE
  v_shot_id UUID;
BEGIN
  -- Ownership check
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to insert shot into this project';
  END IF;

  UPDATE shots SET position = position + 1 
  WHERE project_id = p_project_id AND position >= p_position;

  INSERT INTO shots (name, project_id, position)
  VALUES (p_shot_name, p_project_id, p_position)
  RETURNING id INTO v_shot_id;

  RETURN QUERY SELECT v_shot_id, p_shot_name, p_position, TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::INTEGER, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION insert_shot_at_position(UUID, TEXT, INTEGER) TO authenticated;

-- Guard: create_shot_with_image
CREATE OR REPLACE FUNCTION create_shot_with_image(
  p_project_id UUID,
  p_shot_name TEXT,
  p_generation_id UUID
) RETURNS TABLE (
  shot_id UUID,
  shot_name TEXT,
  shot_generation_id UUID,
  success BOOLEAN
) AS $$
DECLARE
  v_shot_id UUID;
  v_shot_generation_id UUID;
  v_gen_project_id UUID;
BEGIN
  -- Ownership of project
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to create shot in this project';
  END IF;

  -- If generation is provided, ensure it belongs to the same user and same project
  IF p_generation_id IS NOT NULL THEN
    SELECT project_id INTO v_gen_project_id FROM public.generations WHERE id = p_generation_id;
    IF v_gen_project_id IS NULL THEN
      RAISE EXCEPTION 'Generation not found';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = v_gen_project_id AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not authorized to link this generation';
    END IF;
    IF v_gen_project_id <> p_project_id THEN
      RAISE EXCEPTION 'Shot and generation must be in the same project';
    END IF;
  END IF;

  INSERT INTO shots (name, project_id)
  VALUES (p_shot_name, p_project_id)
  RETURNING id INTO v_shot_id;

  IF p_generation_id IS NOT NULL THEN
    INSERT INTO shot_generations (shot_id, generation_id, position)
    VALUES (v_shot_id, p_generation_id, 1)
    RETURNING id INTO v_shot_generation_id;
  END IF;

  RETURN QUERY SELECT v_shot_id, p_shot_name, COALESCE(v_shot_generation_id, NULL), TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::UUID, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION create_shot_with_image(UUID, TEXT, UUID) TO authenticated;

-- Guard: add_generation_to_shot (latest signature includes p_with_position default true)
CREATE OR REPLACE FUNCTION add_generation_to_shot(
  p_shot_id uuid,
  p_generation_id uuid,
  p_with_position boolean DEFAULT true
)
RETURNS TABLE(id uuid, shot_id uuid, generation_id uuid, "position" integer) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_pos integer;
  result_record record;
  v_shot_project_id uuid;
  v_gen_project_id uuid;
BEGIN
  -- Ownership checks
  SELECT s.project_id INTO v_shot_project_id FROM public.shots s WHERE s.id = p_shot_id;
  IF v_shot_project_id IS NULL THEN
    RAISE EXCEPTION 'Shot not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = v_shot_project_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to modify this shot';
  END IF;

  SELECT g.project_id INTO v_gen_project_id FROM public.generations g WHERE g.id = p_generation_id;
  IF v_gen_project_id IS NULL THEN
    RAISE EXCEPTION 'Generation not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = v_gen_project_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to link this generation';
  END IF;
  IF v_shot_project_id <> v_gen_project_id THEN
    RAISE EXCEPTION 'Shot and generation must belong to the same project';
  END IF;

  IF p_with_position THEN
    SELECT COALESCE(MAX(sg."position") + 1, 0) INTO next_pos
    FROM shot_generations sg
    WHERE sg.shot_id = p_shot_id AND sg."position" IS NOT NULL;

    UPDATE shot_generations
    SET "position" = next_pos
    WHERE shot_generations.shot_id = p_shot_id 
      AND shot_generations.generation_id = p_generation_id 
      AND shot_generations."position" IS NULL
    RETURNING * INTO result_record;

    IF NOT FOUND THEN
      INSERT INTO shot_generations (shot_id, generation_id, "position")
      VALUES (p_shot_id, p_generation_id, next_pos)
      RETURNING * INTO result_record;
    END IF;
  ELSE
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, NULL)
    RETURNING * INTO result_record;
  END IF;

  RETURN QUERY SELECT 
    result_record.id,
    result_record.shot_id,
    result_record.generation_id,
    result_record."position";
END;
$$;
GRANT EXECUTE ON FUNCTION add_generation_to_shot(uuid, uuid, boolean) TO authenticated;

COMMIT;
