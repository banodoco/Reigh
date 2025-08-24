

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."credit_ledger_type" AS ENUM (
    'stripe',
    'manual',
    'spend',
    'refund'
);


ALTER TYPE "public"."credit_ledger_type" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'Queued',
    'In Progress',
    'Complete',
    'Failed',
    'Cancelled'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "shot_id" "uuid", "generation_id" "uuid", "position" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  next_pos integer;
  new_record record;
BEGIN
  IF p_with_position THEN
    -- Get the next position for this shot (with fully qualified column name)
    SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
    FROM shot_generations
    WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
  ELSE
    -- Set position to NULL for unpositioned associations
    next_pos := NULL;
  END IF;
  
  -- Insert the new shot_generation record
  INSERT INTO shot_generations (shot_id, generation_id, "position")
  VALUES (p_shot_id, p_generation_id, next_pos)
  RETURNING * INTO new_record;
  
  -- Return the inserted record (only columns that exist)
  RETURN QUERY SELECT 
    new_record.id,
    new_record.shot_id,
    new_record.generation_id,
    new_record."position";
END;
$$;


ALTER FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) IS 'Primary function to link a generation to a shot with optional positioning. Replaces associate_generation_with_shot and position_existing_generation_in_shot.';



CREATE OR REPLACE FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_total_tasks INTEGER;
  v_eligible_tasks INTEGER;
  v_reasons JSONB := '{}';
  v_user_stats JSONB := '[]';
BEGIN
  -- Count total tasks in the requested scope
  IF p_include_active THEN
    -- Only include cloud-claimed In Progress tasks alongside Queued
    SELECT COUNT(*) INTO v_total_tasks 
    FROM tasks 
    WHERE status = 'Queued' 
       OR (status = 'In Progress' AND worker_id IS NOT NULL);
  ELSE
    SELECT COUNT(*) INTO v_total_tasks FROM tasks WHERE status = 'Queued';
  END IF;
  
  -- Count eligible tasks using the updated counting function
  SELECT count_eligible_tasks_service_role(p_include_active) INTO v_eligible_tasks;
  
  -- If no tasks are eligible but there are tasks, analyze why
  IF v_eligible_tasks = 0 AND v_total_tasks > 0 THEN
    -- Count rejection reasons
    WITH task_analysis AS (
      SELECT 
        t.id,
        t.status,
        p.user_id,
        u.credits,
        COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
        COUNT(ip.id) as in_progress_count,
        CASE 
          WHEN u.credits <= 0 THEN 'no_credits'
          WHEN NOT COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) THEN 'cloud_disabled'
          WHEN COUNT(ip.id) >= 5 THEN 'concurrency_limit'
          WHEN t.dependant_on IS NOT NULL AND dep.status != 'Complete' THEN 'dependency_blocked'
          ELSE 'unknown'
        END as rejection_reason
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN tasks ip ON ip.project_id = p.id AND ip.status = 'In Progress'
      LEFT JOIN tasks dep ON dep.id = t.dependant_on
      WHERE (
        p_include_active AND 
        (
          t.status = 'Queued' OR 
          (t.status = 'In Progress' AND t.worker_id IS NOT NULL)
        )
      )
      OR (
        NOT p_include_active AND t.status = 'Queued'
      )
      GROUP BY t.id, t.status, p.user_id, u.credits, u.settings, t.dependant_on, dep.status
    )
    SELECT jsonb_object_agg(rejection_reason, count)
    INTO v_reasons
    FROM (
      SELECT rejection_reason, COUNT(*) as count
      FROM task_analysis
      GROUP BY rejection_reason
    ) reason_counts;
    
    -- Get per-user statistics
    WITH user_analysis AS (
      SELECT 
        u.id as user_id,
        u.credits,
        COUNT(CASE WHEN t.status = 'Queued' THEN 1 END) as queued_tasks,
        COUNT(CASE WHEN t.status = 'In Progress' AND t.worker_id IS NOT NULL THEN 1 END) as in_progress_tasks,
        COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE EXISTS (
        SELECT 1 FROM tasks t2 
        JOIN projects p2 ON t2.project_id = p2.id 
        WHERE p2.user_id = u.id 
          AND (
            (p_include_active AND (t2.status = 'Queued' OR (t2.status = 'In Progress' AND t2.worker_id IS NOT NULL))) 
            OR (NOT p_include_active AND t2.status = 'Queued')
          )
      )
      GROUP BY u.id, u.credits, u.settings
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'user_id', user_id,
        'credits', credits,
        'queued_tasks', queued_tasks,
        'in_progress_tasks', in_progress_tasks,
        'allows_cloud', allows_cloud,
        'at_limit', in_progress_tasks >= 5
      )
    )
    INTO v_user_stats
    FROM user_analysis;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'total_tasks', v_total_tasks,
    'eligible_tasks', v_eligible_tasks,
    'include_active', p_include_active,
    'rejection_reasons', COALESCE(v_reasons, '{}'),
    'user_stats', COALESCE(v_user_stats, '[]')
  );
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean) IS 'Analyzes task availability for service role; include_active considers only cloud-claimed In Progress tasks (worker_id not null).';



CREATE OR REPLACE FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_user_info JSONB;
  v_projects JSONB;
  v_tasks JSONB;
BEGIN
  -- Get user information
  SELECT jsonb_build_object(
    'user_id', u.id,
    'credits', u.credits,
    'allows_local', COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
    'allows_cloud', COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true)
  )
  INTO v_user_info
  FROM users u
  WHERE u.id = p_user_id;
  
  -- Get user's projects
  SELECT jsonb_agg(
    jsonb_build_object(
      'project_id', p.id,
      'name', p.name,
      'created_at', p.created_at
    )
  )
  INTO v_projects
  FROM projects p
  WHERE p.user_id = p_user_id;
  
  -- Get user's tasks
  WITH user_tasks AS (
    SELECT 
      t.id,
      t.task_type,
      t.status,
      t.created_at,
      t.dependant_on,
      CASE WHEN t.dependant_on IS NOT NULL THEN dep.status END as dependency_status,
      p.name as project_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks dep ON dep.id = t.dependant_on
    WHERE p.user_id = p_user_id
      AND ((p_include_active AND t.status IN ('Queued', 'In Progress')) 
           OR (NOT p_include_active AND t.status = 'Queued'))
    ORDER BY t.created_at DESC
    LIMIT 10
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'task_id', id,
      'task_type', task_type,
      'status', status,
      'created_at', created_at,
      'project_name', project_name,
      'has_dependency', dependant_on IS NOT NULL,
      'dependency_status', dependency_status,
      'dependency_blocking', dependant_on IS NOT NULL AND dependency_status != 'Complete'
    )
  )
  INTO v_tasks
  FROM user_tasks;
  
  -- Build result
  v_result := jsonb_build_object(
    'user_info', COALESCE(v_user_info, '{}'),
    'projects', COALESCE(v_projects, '[]'),
    'recent_tasks', COALESCE(v_tasks, '[]'),
    'eligible_count', count_eligible_tasks_user(p_user_id, p_include_active)
  );
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean) IS 'Provides detailed analysis of task availability for a specific user';



CREATE OR REPLACE FUNCTION "public"."auto_create_user_before_project"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Use the secure function to create user if needed
  PERFORM create_user_record_if_not_exists();
  
  -- Double-check that user exists (should always pass now)
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
    RAISE EXCEPTION 'User record could not be created for user_id: %', NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_user_before_project"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auto_create_user_before_project"() IS 'Trigger function that automatically creates a user record when a project is created';



CREATE OR REPLACE FUNCTION "public"."broadcast_task_status_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    broadcast_channel text;
BEGIN
    -- Only broadcast for status changes on non-completed tasks
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
       OR (TG_OP = 'INSERT') THEN
        
        -- Skip completed tasks as they're handled by the processing trigger
        IF NEW.status IN ('Complete'::task_status, 'Failed'::task_status, 'Cancelled'::task_status) THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
        
        -- Get Supabase configuration
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
            -- Create broadcast channel name
            broadcast_channel := 'task-updates:' || NEW.project_id;
            
            -- Use Supabase Realtime broadcast for real-time updates
            -- This matches the existing useWebSocket hook expectations
            PERFORM supabase_realtime.broadcast(
                broadcast_channel,
                'task-update',
                json_build_object(
                    'type', 'TASKS_STATUS_UPDATE',
                    'payload', json_build_object(
                        'projectId', NEW.project_id,
                        'taskId', NEW.id,
                        'status', NEW.status::text,  -- Cast to text for JSON
                        'updated_at', NEW.updated_at
                    )
                )
            );
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."broadcast_task_status_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean DEFAULT false) RETURNS TABLE("task_id" "uuid", "params" "jsonb", "task_type" "text", "project_id" "uuid", "user_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_task_id UUID;
  v_params JSONB;
  v_task_type TEXT;
  v_project_id UUID;
  v_user_id UUID;
BEGIN
  -- NOTE: include_active is for COUNTING ONLY in dry_run mode
  -- In actual claiming mode, we ALWAYS only claim Queued tasks
  -- include_active just affects what gets counted in dry_run

  -- Single atomic query to find and claim the next eligible QUEUED task
  WITH eligible_users AS (
    -- Pre-filter users who meet all criteria for NEW task claiming
    SELECT 
      u.id as user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    -- Find QUEUED tasks that meet all dependency and user criteria
    SELECT 
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      eu.user_id,
      ROW_NUMBER() OVER (ORDER BY t.created_at ASC) as rn
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN eligible_users eu ON eu.user_id = p.user_id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR dep.status = 'Complete')
  )
  -- Atomically claim the first eligible QUEUED task
  UPDATE tasks 
  SET 
    status = 'In Progress'::task_status,
    worker_id = p_worker_id,
    updated_at = NOW(),
    generation_started_at = NOW()
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
    AND tasks.status = 'Queued'  -- Double-check it's still queued
  RETURNING 
    tasks.id,
    tasks.params,
    tasks.task_type,
    tasks.project_id,
    rt.user_id
  INTO v_task_id, v_params, v_task_type, v_project_id, v_user_id;

  -- Return the claimed task or nothing if no task was available
  IF v_task_id IS NOT NULL THEN
    task_id := v_task_id;
    params := v_params;
    task_type := v_task_type;
    project_id := v_project_id;
    user_id := v_user_id;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;


ALTER FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean) IS 'Claims next eligible QUEUED task for service role. include_active only affects dry_run counting.';



CREATE OR REPLACE FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false) RETURNS TABLE("task_id" "uuid", "params" "jsonb", "task_type" "text", "project_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_task_id UUID;
  v_params JSONB;
  v_task_type TEXT;
  v_project_id UUID;
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
BEGIN
  -- NOTE: include_active is for COUNTING ONLY in dry_run mode
  -- In actual claiming mode, we ALWAYS only claim Queued tasks

  -- Get user preferences and validate eligibility
  SELECT 
    u.credits,
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
    COUNT(in_progress_tasks.id)
  INTO v_user_credits, v_allows_local, v_in_progress_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
    AND in_progress_tasks.status = 'In Progress'
  WHERE u.id = p_user_id
  GROUP BY u.id, u.credits, u.settings;

  -- Early exit if user doesn't meet basic criteria
  IF NOT v_allows_local OR v_user_credits <= 0 OR v_in_progress_count >= 5 THEN
    RETURN;
  END IF;

  -- Single atomic query to find and claim the next eligible QUEUED task for this user
  WITH user_projects AS (
    SELECT id FROM projects WHERE user_id = p_user_id
  ),
  ready_tasks AS (
    -- Find QUEUED tasks that meet dependency criteria for this user
    SELECT 
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      ROW_NUMBER() OVER (ORDER BY t.created_at ASC) as rn
    FROM tasks t
    JOIN user_projects up ON t.project_id = up.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR dep.status = 'Complete')
  )
  -- Atomically claim the first eligible QUEUED task
  UPDATE tasks 
  SET 
    status = 'In Progress'::task_status,
    updated_at = NOW(),
    generation_started_at = NOW()
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
    AND tasks.status = 'Queued'  -- Double-check it's still queued
  RETURNING 
    tasks.id,
    tasks.params,
    tasks.task_type,
    tasks.project_id
  INTO v_task_id, v_params, v_task_type, v_project_id;

  -- Return the claimed task or nothing if no task was available
  IF v_task_id IS NOT NULL THEN
    task_id := v_task_id;
    params := v_params;
    task_type := v_task_type;
    project_id := v_project_id;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;


ALTER FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean) IS 'Claims next eligible QUEUED task for user. include_active only affects dry_run counting.';



CREATE OR REPLACE FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    rows_updated INTEGER;
    task_uuid UUID;
BEGIN
    -- Convert TEXT task_id to UUID for compatibility
    BEGIN
        task_uuid := p_task_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid task_id format: %', p_task_id;
    END;

    -- Complete the task with timing information
    UPDATE tasks
    SET
        status = 'Complete'::task_status,  -- Cast to enum type
        output_location = p_output_location,
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CURRENT_TIMESTAMP
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$;


ALTER FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count INTEGER;
  v_queued_count INTEGER;
  v_active_count INTEGER;
BEGIN
  -- Count eligible QUEUED tasks (with all filters applied)
  WITH eligible_users AS (
    SELECT 
      u.id as user_id
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  )
  SELECT COUNT(*)
  INTO v_queued_count
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  JOIN eligible_users eu ON eu.user_id = p.user_id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE t.status = 'Queued'
    AND (t.dependant_on IS NULL OR dep.status = 'Complete');

  IF p_include_active THEN
    -- Only count cloud-claimed In Progress tasks FOR ELIGIBLE USERS,
    -- excluding orchestrator tasks from the active portion
    WITH eligible_users AS (
      SELECT 
        u.id as user_id
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
        AND in_progress_tasks.status = 'In Progress'
      WHERE u.credits > 0
        AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
      GROUP BY u.id, u.credits, u.settings
      HAVING COUNT(in_progress_tasks.id) < 5
    )
    SELECT COUNT(*)
    INTO v_active_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN eligible_users eu ON eu.user_id = p.user_id
    WHERE t.status = 'In Progress'
      AND t.worker_id IS NOT NULL
      AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%';
    
    v_count := v_queued_count + v_active_count;
  ELSE
    v_count := v_queued_count;
  END IF;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean) IS 'Counts eligible queued tasks for service role; if include_active=true, adds only cloud-claimed In Progress tasks for eligible users, excluding orchestrator tasks from the active portion.';



CREATE OR REPLACE FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
  v_queued_count INTEGER;
BEGIN
  -- Aggregate per-user counts; exclude orchestrator tasks from the active
  -- portion when include_active=true, but keep full in-progress counts when
  -- computing capacity for queued-only mode.
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    u.credits,
    COUNT(CASE 
      WHEN t.status = 'In Progress' AND (
        NOT p_include_active OR 
        COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      ) THEN 1 
    END) AS in_progress_count,
    COUNT(CASE WHEN t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete') THEN 1 END) AS queued_count
  INTO v_allows_local, v_user_credits, v_in_progress_count, v_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings, u.credits;

  IF NOT v_allows_local OR v_user_credits <= 0 THEN
    RETURN 0;
  END IF;

  IF p_include_active THEN
    RETURN LEAST(5, COALESCE(v_in_progress_count, 0) + COALESCE(v_queued_count, 0));
  ELSE
    RETURN GREATEST(0, LEAST(5 - COALESCE(v_in_progress_count, 0), COALESCE(v_queued_count, 0)));
  END IF;
END;
$$;


ALTER FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean) IS 'Counts tasks for a user with per-user cap of 5 total (Queued + In Progress). When include_active=true, adds In Progress tasks excluding orchestrators.';



CREATE OR REPLACE FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COUNT(*)::integer
  FROM shot_generations sg
  JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = p_shot_id
    AND sg.position IS NULL
    AND (g.type IS NULL OR g.type NOT LIKE '%video%');
$$;


ALTER FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_generation_on_task_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    new_generation_id uuid;
    generation_type text;
    generation_params jsonb;
    normalized_params jsonb;
    shot_id uuid;
    output_location text;
    thumbnail_url text;
BEGIN
    -- Process ANY completed task that doesn't have a generation yet
    IF NEW.status = 'Complete'::task_status 
       AND NEW.generation_created = FALSE
       AND NEW.task_type IN ('travel_stitch', 'single_image') THEN
        
        RAISE LOG '[ProcessTask] Processing completed % task %', NEW.task_type, NEW.id;
        
        -- Normalize image paths in params
        normalized_params := normalize_image_paths_in_jsonb(NEW.params);
        
        -- Generate a new UUID for the generation
        new_generation_id := gen_random_uuid();
        
        -- Process travel_stitch tasks
        IF NEW.task_type = 'travel_stitch' THEN
            generation_type := 'video';
            
            -- SAFE: Extract shot_id from params with exception handling
            BEGIN
                shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;
            EXCEPTION 
                WHEN invalid_text_representation OR data_exception THEN
                    shot_id := NULL; -- Continue without shot linking
                    RAISE LOG '[ProcessTask] Invalid shot_id format in travel_stitch task %, continuing without shot link', NEW.id;
            END;
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params.full_orchestrator_payload.thumbnail_url
            thumbnail_url := normalized_params->'full_orchestrator_payload'->>'thumbnail_url';
            
            -- Validate required fields
            IF output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for task %: shot_id=%, output_location=%, project_id=%', 
                    NEW.id, shot_id, output_location, NEW.project_id;
                RETURN NEW;
            END IF;
            
            -- Build generation params for video
            generation_params := jsonb_build_object(
                'type', 'travel_stitch',
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', 'travel-between-images'
            );
            
            -- Add shot_id only if it's valid
            IF shot_id IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('shotId', shot_id);
            END IF;
            
            -- Add thumbnail_url to params if available
            IF thumbnail_url IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
                RAISE LOG '[ProcessTask] Found thumbnail_url for travel_stitch task %: %', NEW.id, thumbnail_url;
            END IF;
            
        -- Process single_image tasks
        ELSIF NEW.task_type = 'single_image' THEN
            generation_type := 'image';
            
            -- SAFE: Extract shot_id if present with exception handling
            BEGIN
                shot_id := (normalized_params->>'shot_id')::uuid;
            EXCEPTION 
                WHEN invalid_text_representation OR data_exception THEN
                    shot_id := NULL; -- Continue without shot linking
                    RAISE LOG '[ProcessTask] Invalid shot_id format in single_image task %, continuing without shot link', NEW.id;
            END;
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params.shot_id.thumbnail_url (if shot_id is object) 
            -- or params.thumbnail_url as fallback
            thumbnail_url := COALESCE(
                normalized_params->'shot_id'->>'thumbnail_url',
                normalized_params->>'thumbnail_url'
            );
            
            -- Validate required fields
            IF output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for task %: output_location=%, project_id=%', 
                    NEW.id, output_location, NEW.project_id;
                RETURN NEW;
            END IF;
            
            -- Build generation params for image
            generation_params := jsonb_build_object(
                'type', 'single_image',
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', 'image-generation'
            );
            
            -- Add shot_id if present and valid
            IF shot_id IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('shotId', shot_id);
            END IF;
            
            -- Add thumbnail_url to params if available
            IF thumbnail_url IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
                RAISE LOG '[ProcessTask] Found thumbnail_url for single_image task %: %', NEW.id, thumbnail_url;
            END IF;
        END IF;
        
        -- Insert the generation record with thumbnail_url
        INSERT INTO generations (
            id,
            tasks,
            params,
            location,
            type,
            project_id,
            thumbnail_url,
            created_at
        ) VALUES (
            new_generation_id,
            to_jsonb(ARRAY[NEW.id]),  -- Store as JSONB array
            generation_params,
            output_location,
            generation_type,
            NEW.project_id,
            thumbnail_url,
            NOW()
        );
        
        -- Link generation to shot if shot_id exists and is valid
        IF shot_id IS NOT NULL THEN
            -- Use the RPC function to handle positioning
            PERFORM add_generation_to_shot(shot_id, new_generation_id, true);
        END IF;
        
        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;
        
        RAISE LOG '[ProcessTask] Created generation % for task % with thumbnail_url: %', 
            new_generation_id, NEW.id, COALESCE(thumbnail_url, 'none');
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_generation_on_task_complete"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_generation_on_task_complete"() IS 'Creates generation records for ANY completed task without a generation (not just status transitions). This handles both new completions and existing completed tasks.';



CREATE OR REPLACE FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") RETURNS TABLE("shot_id" "uuid", "shot_name" "text", "shot_generation_id" "uuid", "success" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_shot_id UUID;
  v_shot_generation_id UUID;
  v_next_position INTEGER;
BEGIN
  -- Create the shot first
  INSERT INTO shots (name, project_id)
  VALUES (p_shot_name, p_project_id)
  RETURNING id INTO v_shot_id;
  
  -- Add the generation to the shot with position 1
  INSERT INTO shot_generations (shot_id, generation_id, position)
  VALUES (v_shot_id, p_generation_id, 1)
  RETURNING id INTO v_shot_generation_id;
  
  -- Return the results
  RETURN QUERY SELECT 
    v_shot_id,
    p_shot_name,
    v_shot_generation_id,
    TRUE;
    
EXCEPTION WHEN OTHERS THEN
  -- Return error information
  RETURN QUERY SELECT 
    NULL::UUID,
    NULL::TEXT,
    NULL::UUID,
    FALSE;
END;
$$;


ALTER FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user_record_if_not_exists"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_name text;
  jwt_claims jsonb;
  user_metadata jsonb;
  default_settings jsonb;
BEGIN
  -- Get the current authenticated user ID
  current_user_id := auth.uid();
  
  -- Exit if no authenticated user
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check if user record already exists
  IF EXISTS (SELECT 1 FROM users WHERE id = current_user_id) THEN
    RETURN;
  END IF;
  
  -- Get JWT claims with proper type casting
  jwt_claims := auth.jwt();
  
  -- Extract user metadata safely
  user_metadata := COALESCE((jwt_claims ->> 'user_metadata')::jsonb, '{}'::jsonb);
  
  -- Get user info from auth metadata with explicit type casting
  user_email := COALESCE(jwt_claims ->> 'email', '');
  user_name := COALESCE(
    user_metadata ->> 'full_name',
    user_metadata ->> 'name', 
    jwt_claims ->> 'email',
    'User'
  );
  
  -- Set default settings with paneLocks
  default_settings := jsonb_build_object(
    'ui', jsonb_build_object(
      'paneLocks', jsonb_build_object(
        'gens', false,
        'shots', false,
        'tasks', true
      )
    ),
    'user-preferences', jsonb_build_object()
  );
  
  -- Create user record with SECURITY DEFINER privileges
  -- No automatic credits - will be handled by grant-credits function
  INSERT INTO users (id, name, email, credits, given_credits, settings, onboarding)
  VALUES (current_user_id, user_name, user_email, 0, false, default_settings, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  
END;
$$;


ALTER FUNCTION "public"."create_user_record_if_not_exists"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_user_record_if_not_exists"() IS 'Manually create a user record for the authenticated user if it does not exist';



CREATE OR REPLACE FUNCTION "public"."func_claim_available_task"("worker_id_param" "text") RETURNS TABLE("id" "uuid", "status" "text", "attempts" integer, "worker_id" "text", "generation_started_at" timestamp with time zone, "task_data" "jsonb", "created_at" timestamp with time zone, "task_type" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- First check if worker is marked for termination
    IF EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_id_param AND w.status = 'terminating') THEN
        RETURN; -- Don't assign new tasks to terminating workers
    END IF;
    
    -- Atomically claim the oldest queued task
    RETURN QUERY
    UPDATE tasks 
    SET 
        status = 'In Progress'::task_status,  -- Cast to enum
        worker_id = worker_id_param,
        generation_started_at = NOW()
    WHERE tasks.id = (
        SELECT t.id FROM tasks t
        WHERE t.status = 'Queued'::task_status  -- Cast to enum
          AND (t.worker_id IS NULL OR t.worker_id = '')
        ORDER BY t.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING 
        tasks.id,
        tasks.status::text,  -- Cast back to text for compatibility
        COALESCE(tasks.attempts, 0),
        tasks.worker_id,
        tasks.generation_started_at,
        tasks.params as task_data,
        tasks.created_at,
        tasks.task_type;
END;
$$;


ALTER FUNCTION "public"."func_claim_available_task"("worker_id_param" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."func_claim_available_task"("worker_id_param" "text") IS 'Primary function for workers to claim tasks from the queue. Replaces func_claim_task and func_claim_user_task.';



CREATE OR REPLACE FUNCTION "public"."func_get_tasks_by_status"("status_filter" "text"[]) RETURNS TABLE("id" "uuid", "status" "text", "attempts" integer, "worker_id" "text", "created_at" timestamp with time zone, "generation_started_at" timestamp with time zone, "generation_processed_at" timestamp with time zone, "task_data" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.status::text,  -- Cast enum to text for output
        COALESCE(t.attempts, 0),
        t.worker_id,
        t.created_at,
        t.generation_started_at,
        t.generation_processed_at,
        t.params as task_data
    FROM tasks t
    WHERE t.status::text = ANY(status_filter)  -- Compare as text
    ORDER BY t.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."func_get_tasks_by_status"("status_filter" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."func_get_tasks_by_status"("status_filter" "text"[]) IS 'Get tasks filtered by status array';



CREATE OR REPLACE FUNCTION "public"."func_initialize_tasks_table"("p_table_name" "text" DEFAULT 'tasks'::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    table_exists BOOLEAN;
    result_message TEXT;
BEGIN
    -- Check if tasks table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
    ) INTO table_exists;
    
    IF table_exists THEN
        result_message := 'Table ' || p_table_name || ' already exists and is ready';
    ELSE
        result_message := 'Table ' || p_table_name || ' does not exist - would need to be created manually';
    END IF;
    
    RETURN result_message;
END;
$$;


ALTER FUNCTION "public"."func_initialize_tasks_table"("p_table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."func_mark_task_complete"("task_id_param" "uuid", "result_data_param" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE tasks
    SET 
        status = 'Complete'::task_status,  -- Cast to enum
        generation_processed_at = NOW(),
        result_data = COALESCE(result_data_param, result_data),
        updated_at = NOW()
    WHERE id = task_id_param;
END;
$$;


ALTER FUNCTION "public"."func_mark_task_complete"("task_id_param" "uuid", "result_data_param" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."func_mark_task_complete"("task_id_param" "uuid", "result_data_param" "jsonb") IS 'Primary function to mark a task as completed with results. Replaces complete_task_with_timing.';



CREATE OR REPLACE FUNCTION "public"."func_mark_task_failed"("p_task_id" "text", "p_error_message" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    rows_updated INTEGER;
    task_uuid UUID;
BEGIN
    -- Convert TEXT task_id to UUID for compatibility
    BEGIN
        task_uuid := p_task_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid task_id format: %', p_task_id;
    END;

    -- Mark the task as failed with error message
    UPDATE tasks
    SET
        status = 'Failed'::task_status,  -- Cast to enum type
        error_message = p_error_message,
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CURRENT_TIMESTAMP
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$;


ALTER FUNCTION "public"."func_mark_task_failed"("p_task_id" "text", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."func_mark_task_failed"("task_id_param" "uuid", "error_message_param" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE tasks
    SET 
        attempts = COALESCE(attempts, 0) + 1,
        status = CASE WHEN COALESCE(attempts, 0) + 1 >= 3 THEN 'Failed' ELSE 'Error' END,
        generation_processed_at = NOW(),
        error_message = error_message_param,
        worker_id = NULL,  -- Clear worker assignment for retry
        updated_at = NOW()
    WHERE id = task_id_param;
END;
$$;


ALTER FUNCTION "public"."func_mark_task_failed"("task_id_param" "uuid", "error_message_param" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."func_mark_task_failed"("task_id_param" "uuid", "error_message_param" "text") IS 'Primary function to mark a task as failed with error message.';



CREATE OR REPLACE FUNCTION "public"."func_migrate_tasks_for_task_type"("p_table_name" "text" DEFAULT 'tasks'::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result_message TEXT;
    column_exists BOOLEAN;
BEGIN
    result_message := 'Migration check for ' || p_table_name || ': ';
    
    -- Check if dependant_on column exists
    SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
        AND column_name = 'dependant_on'
    ) INTO column_exists;
    
    IF column_exists THEN
        result_message := result_message || 'dependant_on column exists. ';
    ELSE
        result_message := result_message || 'dependant_on column missing. ';
    END IF;
    
    -- Check if project_id column exists
    SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
        AND column_name = 'project_id'
    ) INTO column_exists;
    
    IF column_exists THEN
        result_message := result_message || 'project_id column exists. ';
    ELSE
        result_message := result_message || 'project_id column missing. ';
    END IF;
    
    result_message := result_message || 'Schema appears current.';
    
    RETURN result_message;
END;
$$;


ALTER FUNCTION "public"."func_migrate_tasks_for_task_type"("p_table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."func_reset_orphaned_tasks"("failed_worker_ids" "text"[]) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    reset_count int;
BEGIN
    UPDATE tasks
    SET 
        status = 'Queued',
        worker_id = NULL,
        generation_started_at = NULL,
        updated_at = NOW()
    WHERE 
        worker_id = ANY(failed_worker_ids)
        AND status = 'In Progress'
        AND COALESCE(attempts, 0) < 3;  -- Don't retry tasks that have already failed too many times
    
    GET DIAGNOSTICS reset_count = ROW_COUNT;
    RETURN reset_count;
END;
$$;


ALTER FUNCTION "public"."func_reset_orphaned_tasks"("failed_worker_ids" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."func_reset_orphaned_tasks"("failed_worker_ids" "text"[]) IS 'Reset tasks from failed workers back to Queued status';



CREATE OR REPLACE FUNCTION "public"."func_update_task_status"("p_task_id" "text", "p_status" "text", "p_table_name" "text" DEFAULT 'tasks'::"text", "p_output_location" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    rows_updated INTEGER;
    task_uuid UUID;
BEGIN
    -- Convert TEXT task_id to UUID for compatibility
    BEGIN
        task_uuid := p_task_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid task_id format: %', p_task_id;
    END;

    -- Update the task status and output location (with enum casting)
    UPDATE tasks
    SET
        status = p_status::task_status,  -- Cast to enum type
        output_location = COALESCE(p_output_location, output_location),
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CASE 
            WHEN p_status = 'Complete' THEN CURRENT_TIMESTAMP 
            ELSE generation_processed_at 
        END
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$;


ALTER FUNCTION "public"."func_update_task_status"("p_task_id" "text", "p_status" "text", "p_table_name" "text", "p_output_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."func_update_worker_heartbeat"("worker_id_param" "text", "vram_total_mb_param" integer DEFAULT NULL::integer, "vram_used_mb_param" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    current_metadata jsonb;
BEGIN
    -- Get current metadata or initialize empty
    SELECT COALESCE(metadata, '{}'::jsonb) INTO current_metadata 
    FROM workers WHERE id = worker_id_param;
    
    -- Update metadata with VRAM info if provided
    IF vram_total_mb_param IS NOT NULL THEN
        current_metadata = current_metadata || 
            jsonb_build_object(
                'vram_total_mb', vram_total_mb_param,
                'vram_used_mb', COALESCE(vram_used_mb_param, 0),
                'vram_timestamp', extract(epoch from NOW())
            );
    END IF;
    
    -- Update heartbeat and metadata
    UPDATE workers
    SET 
        last_heartbeat = NOW(),
        metadata = current_metadata
    WHERE id = worker_id_param;
    
    -- If worker doesn't exist, create it as external worker
    IF NOT FOUND THEN
        INSERT INTO workers (id, instance_type, status, last_heartbeat, metadata, created_at)
        VALUES (
            worker_id_param, 
            'external', 
            'active', 
            NOW(), 
            current_metadata,
            NOW()
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."func_update_worker_heartbeat"("worker_id_param" "text", "vram_total_mb_param" integer, "vram_used_mb_param" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."func_update_worker_heartbeat"("worker_id_param" "text", "vram_total_mb_param" integer, "vram_used_mb_param" integer) IS 'Update worker heartbeat and optionally VRAM usage';



CREATE OR REPLACE FUNCTION "public"."normalize_image_path"("image_path" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    -- Remove local server IP patterns (e.g., http://192.168.1.1:3000/files/...)
    -- Pattern: http(s)://[IP]:[PORT]/... -> just the path part
    IF image_path ~ '^https?://[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}:[0-9]+/' THEN
        -- Extract just the path part after the host
        RETURN regexp_replace(image_path, '^https?://[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}:[0-9]+/', '');
    END IF;
    
    RETURN image_path;
END;
$$;


ALTER FUNCTION "public"."normalize_image_path"("image_path" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalize_image_path"("image_path" "text") IS 'Normalize a single image path by removing local server URLs';



CREATE OR REPLACE FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
DECLARE
    key text;
    value jsonb;
    result jsonb;
BEGIN
    IF jsonb_typeof(data) = 'string' THEN
        -- Check if it looks like an image path
        IF data::text ~ '\.(png|jpg|jpeg|gif|webp|svg)$' OR data::text LIKE '%/files/%' THEN
            RETURN to_jsonb(normalize_image_path(data::text));
        END IF;
        RETURN data;
    ELSIF jsonb_typeof(data) = 'array' THEN
        result := '[]'::jsonb;
        FOR value IN SELECT jsonb_array_elements(data)
        LOOP
            result := result || normalize_image_paths_in_jsonb(value);
        END LOOP;
        RETURN result;
    ELSIF jsonb_typeof(data) = 'object' THEN
        result := '{}'::jsonb;
        FOR key, value IN SELECT * FROM jsonb_each(data)
        LOOP
            result := jsonb_set(result, ARRAY[key], normalize_image_paths_in_jsonb(value));
        END LOOP;
        RETURN result;
    ELSE
        RETURN data;
    END IF;
END;
$_$;


ALTER FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") IS 'Recursively normalize all image paths in a JSONB structure';



CREATE OR REPLACE FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") RETURNS TABLE("id" "uuid", "shot_id" "uuid", "generation_id" "uuid", "position" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  next_pos integer;
  existing_record record;
BEGIN
  -- Find the existing record with NULL position
  SELECT * INTO existing_record
  FROM shot_generations
  WHERE shot_id = p_shot_id 
    AND generation_id = p_generation_id 
    AND "position" IS NULL
  LIMIT 1;
  
  IF existing_record IS NULL THEN
    -- No existing record with NULL position found
    RAISE EXCEPTION 'No existing shot_generation with NULL position found for shot_id % and generation_id %', p_shot_id, p_generation_id;
  END IF;
  
  -- Get the next position for this shot
  SELECT COALESCE(MAX("position") + 1, 0) INTO next_pos
  FROM shot_generations
  WHERE shot_id = p_shot_id 
    AND "position" IS NOT NULL;
  
  -- Update the existing record with the new position
  UPDATE shot_generations
  SET "position" = next_pos
  WHERE id = existing_record.id
  RETURNING * INTO existing_record;
  
  -- Return the updated record
  RETURN QUERY SELECT 
    existing_record.id,
    existing_record.shot_id,
    existing_record.generation_id,
    existing_record."position";
END;
$$;


ALTER FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") IS 'Updates an existing shot_generation record that has NULL position to assign it the next available position. 
This is used when viewing a shot with "Exclude items with a position" filter and adding one of those unpositioned items.';



CREATE OR REPLACE FUNCTION "public"."prevent_direct_credit_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Allow if called by service role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Allow if called by the refresh_user_balance trigger (system function)
  IF TG_OP = 'UPDATE' AND OLD.credits != NEW.credits THEN
    -- Check if this update is coming from the refresh_user_balance function
    -- by verifying the call stack (this is a simplified check)
    IF current_setting('application_name', true) = 'refresh_user_balance' THEN
      RETURN NEW;
    END IF;
    
    -- Block all other direct credit changes
    RAISE EXCEPTION 'Credits cannot be modified directly. Use the credits system.';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_direct_credit_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_timing_manipulation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Allow if called by service role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Allow if this is from a system function (claim/complete)
  IF current_setting('application_name', true) IN ('claim_task', 'complete_task') THEN
    RETURN NEW;
  END IF;
  
  -- Block direct timing changes by users
  IF TG_OP = 'UPDATE' AND (
    OLD.generation_started_at IS DISTINCT FROM NEW.generation_started_at OR
    OLD.generation_processed_at IS DISTINCT FROM NEW.generation_processed_at
  ) THEN
    RAISE EXCEPTION 'Timing fields can only be modified by system functions';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_timing_manipulation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_completed_task_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    edge_function_url text;
    response_status int;
BEGIN
    -- Only process tasks that just became 'Complete' and need generation processing
    IF NEW.status = 'Complete'::task_status 
       AND OLD.status != 'Complete'::task_status 
       AND NEW.generation_created = FALSE
       AND NEW.generation_processed_at IS NOT NULL
       AND NEW.task_type IN ('travel_stitch', 'single_image') THEN
        
        -- Get Supabase configuration from environment
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        -- Skip if configuration is not available (prevents errors in development)
        IF supabase_url IS NULL OR service_role_key IS NULL THEN
            RAISE LOG 'Supabase configuration not available for task processing trigger';
            RETURN NEW;
        END IF;
        
        -- Construct Edge Function URL
        edge_function_url := supabase_url || '/functions/v1/process-completed-task';
        
        -- Call the Edge Function asynchronously
        -- Note: Using http extension for non-blocking call
        BEGIN
            SELECT status INTO response_status
            FROM http_post(
                edge_function_url,
                jsonb_build_object('task_id', NEW.id),
                'application/json',
                ARRAY[
                    http_header('Authorization', 'Bearer ' || service_role_key),
                    http_header('Content-Type', 'application/json')
                ]
            );
            
            -- Log the response for debugging
            RAISE LOG 'Task processing trigger called for task % with status %', NEW.id, response_status;
            
        EXCEPTION WHEN OTHERS THEN
            -- Don't fail the original transaction if the Edge Function call fails
            RAISE LOG 'Failed to call task processing Edge Function for task %: %', NEW.id, SQLERRM;
        END;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."process_completed_task_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_user_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Set application name to identify this as a system update
  PERFORM set_config('application_name', 'refresh_user_balance', true);
  
  UPDATE users SET credits = (
    SELECT COALESCE(SUM(amount), 0) 
    FROM credits_ledger 
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
  ) WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  
  -- Reset application name
  PERFORM set_config('application_name', '', true);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."refresh_user_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_insert_task"("p_id" "uuid", "p_project_id" "uuid", "p_task_type" "text", "p_params" "jsonb", "p_status" "text" DEFAULT 'Queued'::"text", "p_dependant_on" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    inserted_id UUID;
BEGIN
    INSERT INTO tasks (
        id,
        project_id,
        task_type,
        params,
        status,
        dependant_on,
        created_at
    ) VALUES (
        p_id,
        p_project_id,
        p_task_type,
        p_params,
        p_status::task_status,
        p_dependant_on,
        CURRENT_TIMESTAMP
    )
    RETURNING id INTO inserted_id;
    
    RETURN inserted_id;
END;
$$;


ALTER FUNCTION "public"."safe_insert_task"("p_id" "uuid", "p_project_id" "uuid", "p_task_type" "text", "p_params" "jsonb", "p_status" "text", "p_dependant_on" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_update_task_status"("p_task_id" "uuid", "p_status" "text", "p_worker_id" "text" DEFAULT NULL::"text", "p_generation_started_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    -- Update the task with proper enum casting
    UPDATE tasks
    SET
        status = p_status::task_status,
        worker_id = COALESCE(p_worker_id, worker_id),
        generation_started_at = COALESCE(p_generation_started_at, generation_started_at),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_task_id;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$;


ALTER FUNCTION "public"."safe_update_task_status"("p_task_id" "uuid", "p_status" "text", "p_worker_id" "text", "p_generation_started_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_new_shot_position"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If position is not provided, set it to max + 1 for the project
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position
    FROM shots 
    WHERE project_id = NEW.project_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_new_shot_position"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_api_token"("p_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Check if token exists
  SELECT EXISTS(
    SELECT 1 
    FROM public.user_api_tokens
    WHERE token = p_token
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;


ALTER FUNCTION "public"."verify_api_token"("p_token" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_type" "text" NOT NULL,
    "params" "jsonb" NOT NULL,
    "status" "public"."task_status" DEFAULT 'Queued'::"public"."task_status" NOT NULL,
    "dependant_on" "uuid",
    "output_location" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "project_id" "uuid" NOT NULL,
    "generation_processed_at" timestamp with time zone,
    "worker_id" "text",
    "generation_started_at" timestamp with time zone,
    "generation_created" boolean DEFAULT false NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "result_data" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" "text" NOT NULL,
    "instance_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_heartbeat" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "workers_status_check" CHECK (("status" = ANY (ARRAY['inactive'::"text", 'spawning'::"text", 'active'::"text", 'error'::"text", 'terminated'::"text"])))
);


ALTER TABLE "public"."workers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."active_workers_health" AS
 SELECT "w"."id",
    "w"."instance_type",
    "w"."status",
    "w"."created_at",
    "w"."last_heartbeat",
        CASE
            WHEN ("w"."last_heartbeat" IS NOT NULL) THEN EXTRACT(epoch FROM ("now"() - "w"."last_heartbeat"))
            ELSE NULL::numeric
        END AS "heartbeat_age_seconds",
    (("w"."metadata" ->> 'vram_total_mb'::"text"))::integer AS "vram_total_mb",
    (("w"."metadata" ->> 'vram_used_mb'::"text"))::integer AS "vram_used_mb",
        CASE
            WHEN ((("w"."metadata" ->> 'vram_total_mb'::"text"))::integer > 0) THEN "round"((((("w"."metadata" ->> 'vram_used_mb'::"text"))::numeric * 100.0) / (("w"."metadata" ->> 'vram_total_mb'::"text"))::numeric), 1)
            ELSE NULL::numeric
        END AS "vram_usage_percent",
    "t"."id" AS "current_task_id",
    ("t"."status")::"text" AS "current_task_status",
    "t"."task_type" AS "current_task_type",
        CASE
            WHEN ("t"."generation_started_at" IS NOT NULL) THEN EXTRACT(epoch FROM ("now"() - "t"."generation_started_at"))
            ELSE NULL::numeric
        END AS "task_runtime_seconds",
        CASE
            WHEN ("w"."last_heartbeat" < ("now"() - '00:05:00'::interval)) THEN 'STALE_HEARTBEAT'::"text"
            WHEN (("t"."generation_started_at" < ("now"() - '00:10:00'::interval)) AND ("t"."status" = 'In Progress'::"public"."task_status")) THEN 'STUCK_TASK'::"text"
            WHEN (("w"."status" = ANY (ARRAY['active'::"text", 'external'::"text"])) AND ("w"."last_heartbeat" IS NULL)) THEN 'NO_HEARTBEAT'::"text"
            WHEN ("w"."status" = 'inactive'::"text") THEN 'INACTIVE'::"text"
            WHEN ("w"."status" = 'terminated'::"text") THEN 'TERMINATED'::"text"
            ELSE 'HEALTHY'::"text"
        END AS "health_status"
   FROM ("public"."workers" "w"
     LEFT JOIN "public"."tasks" "t" ON ((("t"."worker_id" = "w"."id") AND ("t"."status" = 'In Progress'::"public"."task_status"))))
  WHERE ("w"."status" = ANY (ARRAY['inactive'::"text", 'active'::"text", 'terminated'::"text"]))
  ORDER BY "w"."created_at" DESC;


ALTER VIEW "public"."active_workers_health" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credits_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "amount" numeric(10,3) NOT NULL,
    "type" "public"."credit_ledger_type" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."credits_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tasks" "jsonb",
    "params" "jsonb",
    "location" "text",
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "project_id" "uuid" NOT NULL,
    "starred" boolean DEFAULT false NOT NULL,
    "thumbnail_url" "text"
);


ALTER TABLE "public"."generations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."generations"."thumbnail_url" IS 'URL to thumbnail image for the generation, extracted from task parameters';



CREATE OR REPLACE VIEW "public"."normalized_task_status" AS
 SELECT "id",
        CASE
            WHEN ("status" = 'Complete'::"public"."task_status") THEN 'Complete'::"public"."task_status"
            WHEN ("status" = 'In Progress'::"public"."task_status") THEN 'In Progress'::"public"."task_status"
            WHEN ("status" = 'Queued'::"public"."task_status") THEN 'Queued'::"public"."task_status"
            WHEN ("status" = 'Failed'::"public"."task_status") THEN 'Failed'::"public"."task_status"
            WHEN ("status" = 'Cancelled'::"public"."task_status") THEN 'Cancelled'::"public"."task_status"
            ELSE "status"
        END AS "normalized_status",
    "status" AS "original_status"
   FROM "public"."tasks";


ALTER VIEW "public"."normalized_task_status" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."orchestrator_status" AS
 SELECT "count"(
        CASE
            WHEN ("status" = 'Queued'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "queued_tasks",
    "count"(
        CASE
            WHEN ("status" = 'In Progress'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "running_tasks",
    "count"(
        CASE
            WHEN ("status" = 'Complete'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "completed_tasks",
    "count"(
        CASE
            WHEN ("status" = 'Failed'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "error_tasks",
    "count"(
        CASE
            WHEN ("status" = 'Failed'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "failed_tasks",
    ( SELECT "count"(*) AS "count"
           FROM "public"."workers"
          WHERE ("workers"."status" = 'inactive'::"text")) AS "inactive_workers",
    ( SELECT "count"(*) AS "count"
           FROM "public"."workers"
          WHERE ("workers"."status" = 'active'::"text")) AS "active_workers",
    ( SELECT "count"(*) AS "count"
           FROM "public"."workers"
          WHERE ("workers"."status" = 'terminated'::"text")) AS "terminated_workers",
    ( SELECT "count"(*) AS "count"
           FROM "public"."workers"
          WHERE (("workers"."instance_type" = 'external'::"text") AND ("workers"."status" = 'active'::"text"))) AS "external_workers",
    ( SELECT "count"(*) AS "count"
           FROM "public"."workers"
          WHERE (("workers"."status" = ANY (ARRAY['active'::"text", 'external'::"text"])) AND ("workers"."last_heartbeat" < ("now"() - '00:05:00'::interval)))) AS "stale_workers",
    ( SELECT "count"(*) AS "count"
           FROM "public"."tasks"
          WHERE (("tasks"."status" = 'In Progress'::"public"."task_status") AND ("tasks"."generation_started_at" < ("now"() - '00:10:00'::interval)))) AS "stuck_tasks",
    "now"() AS "snapshot_time"
   FROM "public"."tasks" "t";


ALTER VIEW "public"."orchestrator_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "aspect_ratio" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settings" "jsonb"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."recent_task_activity" AS
 SELECT "t"."id",
    "t"."status",
    "t"."task_type",
    COALESCE("t"."attempts", 0) AS "attempts",
    "t"."worker_id",
    "t"."created_at",
    "t"."generation_started_at",
    "t"."generation_processed_at",
    "t"."updated_at",
    "t"."error_message",
        CASE
            WHEN (("t"."generation_processed_at" IS NOT NULL) AND ("t"."generation_started_at" IS NOT NULL)) THEN EXTRACT(epoch FROM ("t"."generation_processed_at" - "t"."generation_started_at"))
            WHEN (("t"."generation_started_at" IS NOT NULL) AND ("t"."status" = 'In Progress'::"public"."task_status")) THEN EXTRACT(epoch FROM ("now"() - "t"."generation_started_at"))
            ELSE NULL::numeric
        END AS "processing_duration_seconds",
    "w"."instance_type" AS "worker_instance_type",
    "w"."status" AS "worker_status"
   FROM ("public"."tasks" "t"
     LEFT JOIN "public"."workers" "w" ON (("w"."id" = "t"."worker_id")))
  WHERE ("t"."created_at" > ("now"() - '24:00:00'::interval))
  ORDER BY "t"."created_at" DESC
 LIMIT 100;


ALTER VIEW "public"."recent_task_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "metadata" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shot_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shot_id" "uuid" NOT NULL,
    "generation_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shot_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "project_id" "uuid" NOT NULL,
    "settings" "jsonb",
    "position" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."shots" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."shot_statistics" AS
 SELECT "s"."id" AS "shot_id",
    "s"."project_id",
    "count"("sg"."id") AS "total_generations",
    "count"("sg"."id") FILTER (WHERE ("sg"."position" IS NOT NULL)) AS "positioned_count",
    "count"("sg"."id") FILTER (WHERE (("sg"."position" IS NULL) AND (("g"."type" IS NULL) OR ("g"."type" !~~ '%video%'::"text")))) AS "unpositioned_count",
    "count"("sg"."id") FILTER (WHERE ("g"."type" ~~ '%video%'::"text")) AS "video_count"
   FROM (("public"."shots" "s"
     LEFT JOIN "public"."shot_generations" "sg" ON (("sg"."shot_id" = "s"."id")))
     LEFT JOIN "public"."generations" "g" ON (("g"."id" = "sg"."generation_id")))
  GROUP BY "s"."id", "s"."project_id";


ALTER VIEW "public"."shot_statistics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_cost_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "cost_factors" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "base_cost_per_second" numeric(10,6) DEFAULT 0.000278 NOT NULL
);


ALTER TABLE "public"."task_cost_configs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."task_queue_analysis" AS
 SELECT "task_type",
    "status",
    "count"(*) AS "task_count",
        CASE
            WHEN ("status" = 'Queued'::"public"."task_status") THEN "avg"((EXTRACT(epoch FROM ("now"() - "created_at")) / 60.0))
            ELSE NULL::numeric
        END AS "avg_queue_time_minutes",
        CASE
            WHEN ("status" = 'Queued'::"public"."task_status") THEN "max"((EXTRACT(epoch FROM ("now"() - "created_at")) / 60.0))
            ELSE NULL::numeric
        END AS "max_queue_time_minutes",
        CASE
            WHEN ("status" = 'Complete'::"public"."task_status") THEN "avg"(EXTRACT(epoch FROM ("generation_processed_at" - "generation_started_at")))
            ELSE NULL::numeric
        END AS "avg_processing_time_seconds",
    "count"(
        CASE
            WHEN ("status" = ANY (ARRAY['Failed'::"public"."task_status", 'Cancelled'::"public"."task_status"])) THEN 1
            ELSE NULL::integer
        END) AS "error_count"
   FROM "public"."tasks"
  WHERE ("created_at" > ("now"() - '24:00:00'::interval))
  GROUP BY "task_type", "status"
  ORDER BY "task_type",
        CASE "status"
            WHEN 'Queued'::"public"."task_status" THEN 1
            WHEN 'In Progress'::"public"."task_status" THEN 2
            WHEN 'Complete'::"public"."task_status" THEN 3
            WHEN 'Failed'::"public"."task_status" THEN 4
            WHEN 'Cancelled'::"public"."task_status" THEN 5
            ELSE 6
        END;


ALTER VIEW "public"."task_queue_analysis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "original_filename" "text" NOT NULL,
    "storage_location" "text" NOT NULL,
    "duration" integer,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "batch_id" "uuid"
);


ALTER TABLE "public"."training_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_data_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."training_data_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_data_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_data_id" "uuid" NOT NULL,
    "start_time" integer NOT NULL,
    "end_time" integer NOT NULL,
    "segment_location" "text",
    "description" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."training_data_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_api_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "token" "text" NOT NULL
);


ALTER TABLE "public"."user_api_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_api_tokens" IS 'Simplified API tokens table storing user-generated tokens without JWT complexity';



COMMENT ON COLUMN "public"."user_api_tokens"."token" IS 'The actual JWT token for user convenience';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "api_keys" "jsonb",
    "settings" "jsonb",
    "credits" numeric(10,3) DEFAULT 0 NOT NULL,
    "given_credits" boolean DEFAULT false NOT NULL,
    "onboarding" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."given_credits" IS 'Tracks whether user has received welcome bonus. Replaces automatic credit granting in user creation function (see migration 20250210000000 for old approach).';



CREATE OR REPLACE VIEW "public"."user_credit_balance" AS
 SELECT "u"."id" AS "user_id",
    "u"."credits" AS "current_balance",
    COALESCE("sum"(
        CASE
            WHEN ("cl"."type" = ANY (ARRAY['stripe'::"public"."credit_ledger_type", 'manual'::"public"."credit_ledger_type"])) THEN "cl"."amount"
            ELSE (0)::numeric
        END), (0)::numeric) AS "total_purchased",
    COALESCE("sum"(
        CASE
            WHEN ("cl"."type" = 'spend'::"public"."credit_ledger_type") THEN "abs"("cl"."amount")
            ELSE (0)::numeric
        END), (0)::numeric) AS "total_spent",
    COALESCE("sum"(
        CASE
            WHEN ("cl"."type" = 'refund'::"public"."credit_ledger_type") THEN "cl"."amount"
            ELSE (0)::numeric
        END), (0)::numeric) AS "total_refunded"
   FROM ("public"."users" "u"
     LEFT JOIN "public"."credits_ledger" "cl" ON (("u"."id" = "cl"."user_id")))
  GROUP BY "u"."id", "u"."credits";


ALTER VIEW "public"."user_credit_balance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."worker_performance" AS
 SELECT "w"."id" AS "worker_id",
    "w"."instance_type",
    "w"."status",
    "w"."created_at" AS "worker_created_at",
    "w"."last_heartbeat",
    "count"("t"."id") AS "total_tasks_processed",
    "count"(
        CASE
            WHEN ("t"."status" = 'Complete'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "completed_tasks",
    "count"(
        CASE
            WHEN ("t"."status" = 'Failed'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "error_tasks",
    "count"(
        CASE
            WHEN ("t"."status" = 'Failed'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "failed_tasks",
    "count"(
        CASE
            WHEN ("t"."status" = 'In Progress'::"public"."task_status") THEN 1
            ELSE NULL::integer
        END) AS "current_running_tasks",
        CASE
            WHEN ("count"("t"."id") > 0) THEN "round"(((("count"(
            CASE
                WHEN ("t"."status" = 'Complete'::"public"."task_status") THEN 1
                ELSE NULL::integer
            END))::numeric / ("count"("t"."id"))::numeric) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS "success_rate_percent",
    "avg"(
        CASE
            WHEN (("t"."status" = 'Complete'::"public"."task_status") AND ("t"."generation_started_at" IS NOT NULL) AND ("t"."generation_processed_at" IS NOT NULL)) THEN EXTRACT(epoch FROM ("t"."generation_processed_at" - "t"."generation_started_at"))
            ELSE NULL::numeric
        END) AS "avg_processing_time_seconds",
        CASE
            WHEN ("w"."status" = ANY (ARRAY['active'::"text", 'external'::"text"])) THEN (EXTRACT(epoch FROM ("now"() - "w"."created_at")) / 3600.0)
            ELSE NULL::numeric
        END AS "uptime_hours"
   FROM ("public"."workers" "w"
     LEFT JOIN "public"."tasks" "t" ON (("t"."worker_id" = "w"."id")))
  WHERE ("w"."created_at" > ("now"() - '7 days'::interval))
  GROUP BY "w"."id", "w"."instance_type", "w"."status", "w"."created_at", "w"."last_heartbeat"
  ORDER BY "w"."created_at" DESC;


ALTER VIEW "public"."worker_performance" OWNER TO "postgres";


ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generations"
    ADD CONSTRAINT "generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shot_generations"
    ADD CONSTRAINT "shot_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shots"
    ADD CONSTRAINT "shots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_cost_configs"
    ADD CONSTRAINT "task_cost_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_cost_configs"
    ADD CONSTRAINT "task_cost_configs_task_type_key" UNIQUE ("task_type");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_data_batches"
    ADD CONSTRAINT "training_data_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_data"
    ADD CONSTRAINT "training_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_data_segments"
    ADD CONSTRAINT "training_data_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_api_tokens"
    ADD CONSTRAINT "user_api_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_credits_ledger_created_at" ON "public"."credits_ledger" USING "btree" ("created_at");



CREATE INDEX "idx_credits_ledger_type" ON "public"."credits_ledger" USING "btree" ("type");



CREATE INDEX "idx_credits_ledger_user_id" ON "public"."credits_ledger" USING "btree" ("user_id");



CREATE INDEX "idx_dependant_on" ON "public"."tasks" USING "btree" ("dependant_on");



CREATE INDEX "idx_generations_project_starred" ON "public"."generations" USING "btree" ("project_id", "starred");



CREATE INDEX "idx_generations_starred" ON "public"."generations" USING "btree" ("starred");



CREATE INDEX "idx_generations_thumbnail_url" ON "public"."generations" USING "btree" ("thumbnail_url") WHERE ("thumbnail_url" IS NOT NULL);



CREATE INDEX "idx_generations_type" ON "public"."generations" USING "btree" ("type") WHERE ("type" IS NOT NULL);



COMMENT ON INDEX "public"."idx_generations_type" IS 'Optimizes video/image filtering in VideoGallery using generation.type LIKE %video%';



CREATE INDEX "idx_project_status" ON "public"."tasks" USING "btree" ("project_id", "status");



CREATE INDEX "idx_projects_user_id" ON "public"."projects" USING "btree" ("user_id");



CREATE INDEX "idx_shot_generations_generation_id" ON "public"."shot_generations" USING "btree" ("generation_id");



CREATE INDEX "idx_shot_generations_join_optimized" ON "public"."shot_generations" USING "btree" ("shot_id", "generation_id", "position") WHERE ("generation_id" IS NOT NULL);



CREATE INDEX "idx_shot_generations_shot_id_created_at" ON "public"."shot_generations" USING "btree" ("shot_id", "created_at" DESC) WHERE ("created_at" IS NOT NULL);



CREATE INDEX "idx_shot_generations_shot_id_position" ON "public"."shot_generations" USING "btree" ("shot_id", "position");



CREATE INDEX "idx_shot_generations_video_lookup" ON "public"."shot_generations" USING "btree" ("shot_id", "position", "created_at") WHERE ("generation_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_shot_generations_video_lookup" IS 'Optimizes VideoGallery queries that filter by shot_id and order by position/created_at';



CREATE INDEX "idx_status_created" ON "public"."tasks" USING "btree" ("status", "created_at");



CREATE INDEX "idx_task_cost_configs_active" ON "public"."task_cost_configs" USING "btree" ("is_active");



CREATE INDEX "idx_task_cost_configs_category" ON "public"."task_cost_configs" USING "btree" ("category");



CREATE INDEX "idx_task_cost_configs_task_type" ON "public"."task_cost_configs" USING "btree" ("task_type");



CREATE INDEX "idx_tasks_active_status" ON "public"."tasks" USING "btree" ("status", "project_id") WHERE ("status" <> ALL (ARRAY['Complete'::"public"."task_status", 'Failed'::"public"."task_status", 'Cancelled'::"public"."task_status"]));



CREATE INDEX "idx_tasks_created_at" ON "public"."tasks" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_tasks_dependant_on" ON "public"."tasks" USING "btree" ("dependant_on");



CREATE INDEX "idx_tasks_poll_single_image" ON "public"."tasks" USING "btree" ("task_type", "status") WHERE (("generation_processed_at" IS NULL) AND ("task_type" = 'single_image'::"text") AND ("status" = 'Complete'::"public"."task_status"));



CREATE INDEX "idx_tasks_poll_travel_stitch" ON "public"."tasks" USING "btree" ("task_type", "status") WHERE (("generation_processed_at" IS NULL) AND ("task_type" = 'travel_stitch'::"text") AND ("status" = 'Complete'::"public"."task_status"));



CREATE INDEX "idx_tasks_project_status_inprogress" ON "public"."tasks" USING "btree" ("project_id", "status") WHERE ("status" = 'In Progress'::"public"."task_status");



CREATE INDEX "idx_tasks_queued_created" ON "public"."tasks" USING "btree" ("created_at") WHERE ("status" = 'Queued'::"public"."task_status");



CREATE INDEX "idx_tasks_running_started" ON "public"."tasks" USING "btree" ("generation_started_at") WHERE ("status" = 'In Progress'::"public"."task_status");



CREATE INDEX "idx_tasks_status_created_at" ON "public"."tasks" USING "btree" ("status", "created_at");



CREATE INDEX "idx_tasks_status_generation_created" ON "public"."tasks" USING "btree" ("status", "generation_created") WHERE (("status" = 'Complete'::"public"."task_status") AND ("generation_created" = false));



CREATE INDEX "idx_tasks_status_worker" ON "public"."tasks" USING "btree" ("status", "worker_id");



CREATE INDEX "idx_tasks_task_type" ON "public"."tasks" USING "btree" ("task_type") WHERE ("task_type" = ANY (ARRAY['travel_stitch'::"text", 'single_image'::"text"]));



CREATE INDEX "idx_tasks_worker_id" ON "public"."tasks" USING "btree" ("worker_id");



CREATE INDEX "idx_training_data_batch_id" ON "public"."training_data" USING "btree" ("batch_id");



CREATE INDEX "idx_training_data_batches_created_at" ON "public"."training_data_batches" USING "btree" ("created_at");



CREATE INDEX "idx_training_data_batches_user_id" ON "public"."training_data_batches" USING "btree" ("user_id");



CREATE INDEX "idx_training_data_created_at" ON "public"."training_data" USING "btree" ("created_at");



CREATE INDEX "idx_training_data_segments_created_at" ON "public"."training_data_segments" USING "btree" ("created_at");



CREATE INDEX "idx_training_data_segments_training_data_id" ON "public"."training_data_segments" USING "btree" ("training_data_id");



CREATE INDEX "idx_training_data_user_id" ON "public"."training_data" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_user_api_tokens_token" ON "public"."user_api_tokens" USING "btree" ("token");



CREATE INDEX "idx_user_api_tokens_user_id" ON "public"."user_api_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_users_generation_settings" ON "public"."users" USING "gin" (((("settings" -> 'ui'::"text") -> 'generationMethods'::"text")));



CREATE INDEX "idx_workers_last_heartbeat" ON "public"."workers" USING "btree" ("last_heartbeat");



CREATE INDEX "idx_workers_status" ON "public"."workers" USING "btree" ("status");



CREATE INDEX "idx_workers_status_heartbeat" ON "public"."workers" USING "btree" ("status", "last_heartbeat");



CREATE OR REPLACE TRIGGER "auto_create_user_trigger" BEFORE INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_user_before_project"();



CREATE OR REPLACE TRIGGER "credits_ledger_after_delete" AFTER DELETE ON "public"."credits_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_user_balance"();



CREATE OR REPLACE TRIGGER "credits_ledger_after_insert" AFTER INSERT ON "public"."credits_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_user_balance"();



CREATE OR REPLACE TRIGGER "credits_ledger_after_update" AFTER UPDATE ON "public"."credits_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_user_balance"();



CREATE OR REPLACE TRIGGER "prevent_credit_manipulation" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_direct_credit_updates"();



CREATE OR REPLACE TRIGGER "prevent_timing_manipulation_trigger" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_timing_manipulation"();



CREATE OR REPLACE TRIGGER "trigger_create_generation_on_task_complete" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."create_generation_on_task_complete"();



CREATE OR REPLACE TRIGGER "trigger_set_shot_position" BEFORE INSERT ON "public"."shots" FOR EACH ROW EXECUTE FUNCTION "public"."set_new_shot_position"();



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generations"
    ADD CONSTRAINT "generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shot_generations"
    ADD CONSTRAINT "shot_generations_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shot_generations"
    ADD CONSTRAINT "shot_generations_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shots"
    ADD CONSTRAINT "shots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."training_data"
    ADD CONSTRAINT "training_data_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."training_data_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_data_batches"
    ADD CONSTRAINT "training_data_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_data_segments"
    ADD CONSTRAINT "training_data_segments_training_data_id_fkey" FOREIGN KEY ("training_data_id") REFERENCES "public"."training_data"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_data"
    ADD CONSTRAINT "training_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_api_tokens"
    ADD CONSTRAINT "user_api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow read access to public resources" ON "public"."resources" FOR SELECT USING ((("type" = 'lora'::"text") AND (("metadata" ->> 'is_public'::"text") = 'true'::"text")));



CREATE POLICY "Authenticated users can view task cost configs" ON "public"."task_cost_configs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view workers" ON "public"."workers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all access for resource owners" ON "public"."resources" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Service role can delete credit ledger entries" ON "public"."credits_ledger" FOR DELETE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can delete users" ON "public"."users" FOR DELETE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can do everything on users" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can insert credit ledger entries" ON "public"."credits_ledger" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can insert users" ON "public"."users" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all tasks" ON "public"."tasks" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage workers" ON "public"."workers" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can modify task cost configs" ON "public"."task_cost_configs" TO "service_role" USING (true);



CREATE POLICY "Service role can update credit ledger entries" ON "public"."credits_ledger" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can create tasks" ON "public"."tasks" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "p"."user_id"
   FROM "public"."projects" "p"
  WHERE ("p"."id" = "tasks"."project_id"))));



CREATE POLICY "Users can delete their own training data" ON "public"."training_data" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own training data batches" ON "public"."training_data_batches" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own training data segments" ON "public"."training_data_segments" FOR DELETE USING (("auth"."uid"() = ( SELECT "training_data"."user_id"
   FROM "public"."training_data"
  WHERE ("training_data"."id" = "training_data_segments"."training_data_id"))));



CREATE POLICY "Users can insert their own training data" ON "public"."training_data" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own training data batches" ON "public"."training_data_batches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own training data segments" ON "public"."training_data_segments" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "training_data"."user_id"
   FROM "public"."training_data"
  WHERE ("training_data"."id" = "training_data_segments"."training_data_id"))));



CREATE POLICY "Users can update their own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own tasks (no timing)" ON "public"."tasks" FOR UPDATE USING (("auth"."uid"() = ( SELECT "p"."user_id"
   FROM "public"."projects" "p"
  WHERE ("p"."id" = "tasks"."project_id"))));



CREATE POLICY "Users can update their own training data" ON "public"."training_data" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own training data batches" ON "public"."training_data_batches" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own training data segments" ON "public"."training_data_segments" FOR UPDATE USING (("auth"."uid"() = ( SELECT "training_data"."user_id"
   FROM "public"."training_data"
  WHERE ("training_data"."id" = "training_data_segments"."training_data_id"))));



CREATE POLICY "Users can view their own API tokens" ON "public"."user_api_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own credit ledger" ON "public"."credits_ledger" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own record" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own tasks" ON "public"."tasks" FOR SELECT USING (("auth"."uid"() = ( SELECT "p"."user_id"
   FROM "public"."projects" "p"
  WHERE ("p"."id" = "tasks"."project_id"))));



CREATE POLICY "Users can view their own training data" ON "public"."training_data" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own training data batches" ON "public"."training_data_batches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own training data segments" ON "public"."training_data_segments" FOR SELECT USING (("auth"."uid"() = ( SELECT "training_data"."user_id"
   FROM "public"."training_data"
  WHERE ("training_data"."id" = "training_data_segments"."training_data_id"))));



ALTER TABLE "public"."credits_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_cost_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_data_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_data_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_api_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_user_before_project"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_user_before_project"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_user_before_project"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_task_status_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_task_status_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_task_status_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_generation_on_task_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_generation_on_task_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_generation_on_task_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_record_if_not_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_record_if_not_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_record_if_not_exists"() TO "service_role";



GRANT ALL ON FUNCTION "public"."func_claim_available_task"("worker_id_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."func_claim_available_task"("worker_id_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_claim_available_task"("worker_id_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."func_get_tasks_by_status"("status_filter" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."func_get_tasks_by_status"("status_filter" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_get_tasks_by_status"("status_filter" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."func_initialize_tasks_table"("p_table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."func_initialize_tasks_table"("p_table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_initialize_tasks_table"("p_table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."func_mark_task_complete"("task_id_param" "uuid", "result_data_param" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."func_mark_task_complete"("task_id_param" "uuid", "result_data_param" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_mark_task_complete"("task_id_param" "uuid", "result_data_param" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."func_mark_task_failed"("p_task_id" "text", "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."func_mark_task_failed"("p_task_id" "text", "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_mark_task_failed"("p_task_id" "text", "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."func_mark_task_failed"("task_id_param" "uuid", "error_message_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."func_mark_task_failed"("task_id_param" "uuid", "error_message_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_mark_task_failed"("task_id_param" "uuid", "error_message_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."func_migrate_tasks_for_task_type"("p_table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."func_migrate_tasks_for_task_type"("p_table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_migrate_tasks_for_task_type"("p_table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."func_reset_orphaned_tasks"("failed_worker_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."func_reset_orphaned_tasks"("failed_worker_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_reset_orphaned_tasks"("failed_worker_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."func_update_task_status"("p_task_id" "text", "p_status" "text", "p_table_name" "text", "p_output_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."func_update_task_status"("p_task_id" "text", "p_status" "text", "p_table_name" "text", "p_output_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_update_task_status"("p_task_id" "text", "p_status" "text", "p_table_name" "text", "p_output_location" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."func_update_worker_heartbeat"("worker_id_param" "text", "vram_total_mb_param" integer, "vram_used_mb_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."func_update_worker_heartbeat"("worker_id_param" "text", "vram_total_mb_param" integer, "vram_used_mb_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."func_update_worker_heartbeat"("worker_id_param" "text", "vram_total_mb_param" integer, "vram_used_mb_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_image_path"("image_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_image_path"("image_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_image_path"("image_path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_direct_credit_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_direct_credit_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_direct_credit_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_timing_manipulation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_timing_manipulation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_timing_manipulation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_completed_task_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_completed_task_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_completed_task_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_user_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_user_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_insert_task"("p_id" "uuid", "p_project_id" "uuid", "p_task_type" "text", "p_params" "jsonb", "p_status" "text", "p_dependant_on" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_insert_task"("p_id" "uuid", "p_project_id" "uuid", "p_task_type" "text", "p_params" "jsonb", "p_status" "text", "p_dependant_on" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_insert_task"("p_id" "uuid", "p_project_id" "uuid", "p_task_type" "text", "p_params" "jsonb", "p_status" "text", "p_dependant_on" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_update_task_status"("p_task_id" "uuid", "p_status" "text", "p_worker_id" "text", "p_generation_started_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."safe_update_task_status"("p_task_id" "uuid", "p_status" "text", "p_worker_id" "text", "p_generation_started_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_update_task_status"("p_task_id" "uuid", "p_status" "text", "p_worker_id" "text", "p_generation_started_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_new_shot_position"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_new_shot_position"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_new_shot_position"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_api_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_api_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_api_token"("p_token" "text") TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."workers" TO "anon";
GRANT ALL ON TABLE "public"."workers" TO "authenticated";
GRANT ALL ON TABLE "public"."workers" TO "service_role";



GRANT ALL ON TABLE "public"."active_workers_health" TO "anon";
GRANT ALL ON TABLE "public"."active_workers_health" TO "authenticated";
GRANT ALL ON TABLE "public"."active_workers_health" TO "service_role";



GRANT ALL ON TABLE "public"."credits_ledger" TO "anon";
GRANT ALL ON TABLE "public"."credits_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."credits_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."generations" TO "anon";
GRANT ALL ON TABLE "public"."generations" TO "authenticated";
GRANT ALL ON TABLE "public"."generations" TO "service_role";



GRANT ALL ON TABLE "public"."normalized_task_status" TO "anon";
GRANT ALL ON TABLE "public"."normalized_task_status" TO "authenticated";
GRANT ALL ON TABLE "public"."normalized_task_status" TO "service_role";



GRANT ALL ON TABLE "public"."orchestrator_status" TO "anon";
GRANT ALL ON TABLE "public"."orchestrator_status" TO "authenticated";
GRANT ALL ON TABLE "public"."orchestrator_status" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."recent_task_activity" TO "anon";
GRANT ALL ON TABLE "public"."recent_task_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_task_activity" TO "service_role";



GRANT ALL ON TABLE "public"."resources" TO "anon";
GRANT ALL ON TABLE "public"."resources" TO "authenticated";
GRANT ALL ON TABLE "public"."resources" TO "service_role";



GRANT ALL ON TABLE "public"."shot_generations" TO "anon";
GRANT ALL ON TABLE "public"."shot_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."shot_generations" TO "service_role";



GRANT ALL ON TABLE "public"."shots" TO "anon";
GRANT ALL ON TABLE "public"."shots" TO "authenticated";
GRANT ALL ON TABLE "public"."shots" TO "service_role";



GRANT ALL ON TABLE "public"."shot_statistics" TO "anon";
GRANT ALL ON TABLE "public"."shot_statistics" TO "authenticated";
GRANT ALL ON TABLE "public"."shot_statistics" TO "service_role";



GRANT ALL ON TABLE "public"."task_cost_configs" TO "anon";
GRANT ALL ON TABLE "public"."task_cost_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."task_cost_configs" TO "service_role";



GRANT ALL ON TABLE "public"."task_queue_analysis" TO "anon";
GRANT ALL ON TABLE "public"."task_queue_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."task_queue_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."training_data" TO "anon";
GRANT ALL ON TABLE "public"."training_data" TO "authenticated";
GRANT ALL ON TABLE "public"."training_data" TO "service_role";



GRANT ALL ON TABLE "public"."training_data_batches" TO "anon";
GRANT ALL ON TABLE "public"."training_data_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."training_data_batches" TO "service_role";



GRANT ALL ON TABLE "public"."training_data_segments" TO "anon";
GRANT ALL ON TABLE "public"."training_data_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."training_data_segments" TO "service_role";



GRANT ALL ON TABLE "public"."user_api_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_api_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_api_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."user_credit_balance" TO "anon";
GRANT ALL ON TABLE "public"."user_credit_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."user_credit_balance" TO "service_role";



GRANT ALL ON TABLE "public"."worker_performance" TO "anon";
GRANT ALL ON TABLE "public"."worker_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_performance" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






RESET ALL;
