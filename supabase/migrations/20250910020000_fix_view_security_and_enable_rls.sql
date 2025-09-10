-- Fix view security to use invoker rights and enable RLS on public tables
-- This migration addresses Supabase lints 0010 (security_definer_view) and 0013 (rls_disabled_in_public)

-- =============================
-- 1) Make views SECURITY INVOKER
-- =============================
-- Note: ALTER VIEW ... SET (security_invoker=true) will ensure views respect caller RLS

-- Monitoring / analytics views
ALTER VIEW IF EXISTS public.orchestrator_status SET (security_invoker=true);
ALTER VIEW IF EXISTS public.active_workers_health SET (security_invoker=true);
ALTER VIEW IF EXISTS public.recent_task_activity SET (security_invoker=true);
ALTER VIEW IF EXISTS public.worker_performance SET (security_invoker=true);
ALTER VIEW IF EXISTS public.task_queue_analysis SET (security_invoker=true);

-- Application views
ALTER VIEW IF EXISTS public.shot_statistics SET (security_invoker=true);
ALTER VIEW IF EXISTS public.task_types_with_billing SET (security_invoker=true);
ALTER VIEW IF EXISTS public.normalized_task_status SET (security_invoker=true);
ALTER VIEW IF EXISTS public.user_credit_balance SET (security_invoker=true);
ALTER VIEW IF EXISTS public.referral_stats SET (security_invoker=true);

-- Optional: preserve grants where previously applied (idempotent if already granted)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'shot_statistics'
  ) THEN
    GRANT SELECT ON public.shot_statistics TO authenticated;
  END IF;
END $$;

-- =============================================
-- 2) Enable RLS and add least-privilege policies
-- =============================================
-- Covers: projects, shots, shot_generations, generations, task_types

-- Projects: rows owned by user_id
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projects: owner can select"
  ON public.projects
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Projects: owner can insert"
  ON public.projects
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Projects: owner can update"
  ON public.projects
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Projects: owner can delete"
  ON public.projects
  FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Projects: service role full access"
  ON public.projects
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Shots: scoped via owning project
ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shots: owner can select"
  ON public.shots
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Shots: owner can insert"
  ON public.shots
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Shots: owner can update"
  ON public.shots
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Shots: owner can delete"
  ON public.shots
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = shots.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Shots: service role full access"
  ON public.shots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Generations: scoped via owning project
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Generations: owner can select"
  ON public.generations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Generations: owner can insert"
  ON public.generations
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Generations: owner can update"
  ON public.generations
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Generations: owner can delete"
  ON public.generations
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generations.project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Generations: service role full access"
  ON public.generations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Shot generations join table: ensure both shot and generation belong to the owner's projects
ALTER TABLE public.shot_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ShotGenerations: owner can select"
  ON public.shot_generations
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM public.shots s
    JOIN public.projects p ON p.id = s.project_id
    WHERE s.id = shot_generations.shot_id
      AND p.user_id = auth.uid()
  ));

CREATE POLICY "ShotGenerations: owner can insert"
  ON public.shot_generations
  FOR INSERT
  WITH CHECK (
    -- Shot must belong to owner's project
    EXISTS (
      SELECT 1
      FROM public.shots s
      JOIN public.projects p ON p.id = s.project_id
      WHERE s.id = shot_generations.shot_id
        AND p.user_id = auth.uid()
    )
    AND
    -- Generation must also belong to owner's project
    EXISTS (
      SELECT 1
      FROM public.generations g
      JOIN public.projects p2 ON p2.id = g.project_id
      WHERE g.id = shot_generations.generation_id
        AND p2.user_id = auth.uid()
    )
  );

CREATE POLICY "ShotGenerations: owner can update"
  ON public.shot_generations
  FOR UPDATE
  USING (EXISTS (
    SELECT 1
    FROM public.shots s
    JOIN public.projects p ON p.id = s.project_id
    WHERE s.id = shot_generations.shot_id
      AND p.user_id = auth.uid()
  ))
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shots s
      JOIN public.projects p ON p.id = s.project_id
      WHERE s.id = shot_generations.shot_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "ShotGenerations: owner can delete"
  ON public.shot_generations
  FOR DELETE
  USING (EXISTS (
    SELECT 1
    FROM public.shots s
    JOIN public.projects p ON p.id = s.project_id
    WHERE s.id = shot_generations.shot_id
      AND p.user_id = auth.uid()
  ));

CREATE POLICY "ShotGenerations: service role full access"
  ON public.shot_generations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Task types: read-only for authenticated users
ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TaskTypes: authenticated can select"
  ON public.task_types
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "TaskTypes: service role full access"
  ON public.task_types
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


