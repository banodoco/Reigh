

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
    'refund',
    'auto_topup'
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


CREATE OR REPLACE FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "shot_id" "uuid", "generation_id" "uuid", "timeline_frame" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  next_frame integer;
  existing_record record;
  new_record record;
BEGIN
  -- Check if this generation is already associated with this shot
  SELECT sg.id, sg.timeline_frame 
  INTO existing_record
  FROM shot_generations sg 
  WHERE sg.shot_id = p_shot_id AND sg.generation_id = p_generation_id
  LIMIT 1;

  IF FOUND THEN
    -- Record exists
    IF p_with_position AND existing_record.timeline_frame IS NULL THEN
      -- Need to assign timeline_frame to existing record
      SELECT COALESCE(MAX(sg.timeline_frame), -50) + 50
      INTO next_frame
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id;
      
      UPDATE shot_generations 
      SET timeline_frame = next_frame
      WHERE id = existing_record.id;
      
      -- Return updated record
      SELECT sg.id, sg.shot_id, sg.generation_id, sg.timeline_frame
      INTO new_record
      FROM shot_generations sg
      WHERE sg.id = existing_record.id;
      
      RETURN QUERY SELECT new_record.id, new_record.shot_id, new_record.generation_id, new_record.timeline_frame;
    ELSE
      -- Return existing record as-is
      RETURN QUERY SELECT existing_record.id, p_shot_id, p_generation_id, existing_record.timeline_frame;
    END IF;
  ELSE
    -- Create new record
    IF p_with_position THEN
      -- Calculate next timeline_frame
      SELECT COALESCE(MAX(sg.timeline_frame), -50) + 50
      INTO next_frame
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id;
    ELSE
      -- No timeline_frame (unpositioned)
      next_frame := NULL;
    END IF;
    
    -- Insert new record
    INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
    VALUES (p_shot_id, p_generation_id, next_frame)
    RETURNING shot_generations.id, shot_generations.shot_id, shot_generations.generation_id, shot_generations.timeline_frame
    INTO new_record;
    
    RETURN QUERY SELECT new_record.id, new_record.shot_id, new_record.generation_id, new_record.timeline_frame;
  END IF;
END;
$$;


ALTER FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) IS 'Add a generation to a shot with optional timeline_frame positioning. Updated to work with timeline_frame instead of position column.';



CREATE OR REPLACE FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean DEFAULT false, "p_run_type" "text" DEFAULT NULL::"text") RETURNS TABLE("total_tasks" integer, "queued_tasks" integer, "in_progress_tasks" integer, "run_type" "text", "task_breakdown" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  WITH task_stats AS (
    SELECT 
      COUNT(*)::INTEGER as total,
      COUNT(*) FILTER (WHERE t.status = 'Queued'::task_status)::INTEGER as queued,
      COUNT(*) FILTER (WHERE t.status = 'In Progress'::task_status)::INTEGER as in_progress,
      COALESCE(tt.run_type, 'unknown') as task_run_type,
      jsonb_object_agg(
        COALESCE(t.task_type, 'unknown'),
        COUNT(*)
      ) as breakdown
    FROM tasks t
    LEFT JOIN task_types tt ON tt.name = t.task_type AND tt.is_active = true
    WHERE (NOT p_include_active OR t.status IN ('Queued'::task_status, 'In Progress'::task_status))
      AND (p_run_type IS NULL OR tt.run_type = p_run_type)
      AND tt.is_active = true
    GROUP BY tt.run_type
  )
  SELECT 
    ts.total,
    ts.queued,
    ts.in_progress,
    ts.task_run_type,
    ts.breakdown
  FROM task_stats ts;
END;
$$;


ALTER FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean, "p_run_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean, "p_run_type" "text") IS 'Removed SECURITY DEFINER - now runs with caller privileges';



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



CREATE OR REPLACE FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false, "p_run_type" "text" DEFAULT NULL::"text") RETURNS TABLE("total_tasks" integer, "queued_tasks" integer, "in_progress_tasks" integer, "run_type" "text", "task_breakdown" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH task_stats AS (
    SELECT 
      tt.run_type as rt,
      t.status,
      COUNT(*) as task_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id  -- ORIGINAL - no public. prefix
    JOIN task_types tt ON t.task_type = tt.name  -- ORIGINAL - no public. prefix
    WHERE 
      p.user_id = p_user_id
      AND (t.status = 'Queued' OR (p_include_active AND t.status = 'In Progress'))
      AND (p_run_type IS NULL OR tt.run_type = p_run_type)
      AND tt.is_active = true
    GROUP BY tt.run_type, t.status
  )
  SELECT 
    COALESCE(SUM(task_count), 0)::INTEGER as total_tasks,
    COALESCE(SUM(CASE WHEN status = 'Queued' THEN task_count ELSE 0 END), 0)::INTEGER as queued_tasks,
    COALESCE(SUM(CASE WHEN status = 'In Progress' THEN task_count ELSE 0 END), 0)::INTEGER as in_progress_tasks,
    COALESCE(p_run_type, 'all') as run_type,
    jsonb_object_agg(
      COALESCE(rt, 'unknown') || '_' || status, 
      task_count
    ) as task_breakdown
  FROM task_stats;
END;
$$;


ALTER FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analyze_task_availability_user_pat"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_result JSONB;
  v_user_info JSONB;
  v_projects JSONB;
  v_tasks JSONB;
BEGIN
  -- Get user information (no credits constraint for PAT)
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
  
  -- Get user's tasks (no run_type filtering for PAT)
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
  
  -- Build result using PAT-friendly count function
  v_result := jsonb_build_object(
    'user_info', COALESCE(v_user_info, '{}'),
    'projects', COALESCE(v_projects, '[]'),
    'recent_tasks', COALESCE(v_tasks, '[]'),
    'eligible_count', count_eligible_tasks_user_pat(p_user_id, p_include_active)
  );
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."analyze_task_availability_user_pat"("p_user_id" "uuid", "p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."analyze_task_availability_user_pat"("p_user_id" "uuid", "p_include_active" boolean) IS 'PAT-friendly version: Provides detailed analysis of task availability for a specific user without credits or run_type constraints';



CREATE OR REPLACE FUNCTION "public"."apply_timeline_frames"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "generation_id" "uuid", "position" integer, "timeline_frame" integer, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _change_count integer;
  _affected_count integer;
BEGIN
  -- Acquire advisory lock for this shot to serialize all position updates
  PERFORM pg_advisory_xact_lock(hashtext(p_shot_id::text));

  -- Validate input
  IF p_changes IS NULL OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'Changes array cannot be null or empty';
  END IF;

  -- Log the operation for debugging with unique identifier
  SELECT jsonb_array_length(p_changes) INTO _change_count;
  RAISE LOG 'apply_timeline_frames_FIXED_v3: shot_id=%, changes=%, update_positions=%', 
    p_shot_id, _change_count, p_update_positions;

  -- Create a temporary table for the changes with validation
  CREATE TEMP TABLE temp_changes_debug AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as generation_id,
    (c->>'timeline_frame')::integer as timeline_frame
  FROM jsonb_array_elements(p_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0;

  -- Validate that all generation_ids exist in this shot
  IF EXISTS (
    SELECT 1 FROM temp_changes_debug tc
    LEFT JOIN shot_generations sg ON sg.shot_id = p_shot_id AND sg.generation_id = tc.generation_id
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_changes_debug;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', p_shot_id;
  END IF;

  -- Validate no duplicate timeline_frames in the payload
  IF (SELECT COUNT(*) FROM temp_changes_debug) != (SELECT COUNT(DISTINCT timeline_frame) FROM temp_changes_debug) THEN
    DROP TABLE temp_changes_debug;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes payload';
  END IF;

  -- Stage 1: Clear timeline_frame for all affected rows
  UPDATE shot_generations main_sg
  SET 
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE main_sg.shot_id = p_shot_id
    AND main_sg.generation_id IN (SELECT tc.generation_id FROM temp_changes_debug tc);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames_FIXED_v3: cleared % timeline_frames', _affected_count;

  -- Stage 2: Apply new timeline_frame values
  UPDATE shot_generations main_sg
  SET 
    timeline_frame = tc.timeline_frame,
    updated_at = NOW()
  FROM temp_changes_debug tc
  WHERE main_sg.shot_id = p_shot_id 
    AND main_sg.generation_id = tc.generation_id;

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames_FIXED_v3: updated % timeline_frames', _affected_count;

  -- Stage 3: Reconcile position values if requested
  IF p_update_positions THEN
    WITH ordered_items AS (
      SELECT 
        main_sg.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            main_sg.timeline_frame NULLS LAST,  -- EXPLICIT TABLE ALIAS
            main_sg.created_at ASC, 
            main_sg.generation_id ASC
        ) - 1 as new_position
      FROM shot_generations main_sg  -- EXPLICIT ALIAS
      WHERE main_sg.shot_id = p_shot_id
    )
    UPDATE shot_generations update_sg
    SET 
      "position" = oi.new_position,
      updated_at = NOW()
    FROM ordered_items oi
    WHERE update_sg.id = oi.id;

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'apply_timeline_frames_FIXED_v3: reconciled % positions', _affected_count;
  END IF;

  -- Clean up temp table
  DROP TABLE temp_changes_debug;

  -- Return updated rows for client reconciliation
  RETURN QUERY
  SELECT 
    result_sg.id,
    result_sg.generation_id,
    result_sg."position",
    result_sg.timeline_frame,
    result_sg.updated_at
  FROM shot_generations result_sg  -- EXPLICIT ALIAS
  WHERE result_sg.shot_id = p_shot_id
  ORDER BY result_sg."position" ASC;

  RAISE LOG 'apply_timeline_frames_FIXED_v3: completed successfully';
END;
$$;


ALTER FUNCTION "public"."apply_timeline_frames"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atomic_timeline_update"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "generation_id" "uuid", "position" integer, "timeline_frame" integer, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _change_count integer;
  _affected_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_shot_id::text));

  IF p_changes IS NULL OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'Changes array cannot be null or empty';
  END IF;

  SELECT jsonb_array_length(p_changes) INTO _change_count;
  RAISE LOG 'atomic_timeline_update_FIXED: shot_id=%, changes=%, update_positions=%', 
    p_shot_id, _change_count, p_update_positions;

  CREATE TEMP TABLE temp_atomic_changes AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as generation_id,
    (c->>'timeline_frame')::integer as timeline_frame
  FROM jsonb_array_elements(p_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0;

  IF EXISTS (
    SELECT 1 FROM temp_atomic_changes tc
    LEFT JOIN shot_generations sg ON sg.shot_id = p_shot_id AND sg.generation_id = tc.generation_id
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_atomic_changes;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', p_shot_id;
  END IF;

  IF (SELECT COUNT(*) FROM temp_atomic_changes) != (SELECT COUNT(DISTINCT timeline_frame) FROM temp_atomic_changes) THEN
    DROP TABLE temp_atomic_changes;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes payload';
  END IF;

  UPDATE shot_generations 
  SET 
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE shot_id = p_shot_id
    AND generation_id IN (SELECT generation_id FROM temp_atomic_changes);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'atomic_timeline_update_FIXED: cleared % timeline_frames', _affected_count;

  UPDATE shot_generations 
  SET 
    timeline_frame = tc.timeline_frame,
    updated_at = NOW()
  FROM temp_atomic_changes tc
  WHERE shot_id = p_shot_id 
    AND generation_id = tc.generation_id;

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'atomic_timeline_update_FIXED: updated % timeline_frames', _affected_count;

  IF p_update_positions THEN
    WITH ordered_items AS (
      SELECT 
        sg.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            sg.timeline_frame NULLS LAST,
            sg.created_at ASC, 
            sg.generation_id ASC
        ) - 1 as new_position
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id
    )
    UPDATE shot_generations 
    SET 
      "position" = oi.new_position,
      updated_at = NOW()
    FROM ordered_items oi
    WHERE shot_generations.id = oi.id;

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'atomic_timeline_update_FIXED: reconciled % positions', _affected_count;
  END IF;

  DROP TABLE temp_atomic_changes;

  RETURN QUERY
  SELECT 
    sg.id,
    sg.generation_id,
    sg."position",
    sg.timeline_frame,
    sg.updated_at
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id
  ORDER BY sg."position" ASC;

  RAISE LOG 'atomic_timeline_update_FIXED: completed successfully';
END;
$$;


ALTER FUNCTION "public"."atomic_timeline_update"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) OWNER TO "postgres";


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



CREATE OR REPLACE FUNCTION "public"."auto_register_worker"("p_worker_id" "text", "p_instance_type" "text" DEFAULT 'api'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Insert worker if it doesn't exist
  INSERT INTO workers (id, instance_type, status, metadata, created_at, last_heartbeat)
  VALUES (
    p_worker_id, 
    p_instance_type, 
    'active', 
    json_build_object(
      'worker_type', p_instance_type,
      'auto_registered', true,
      'capabilities', CASE WHEN p_instance_type = 'api' THEN '["qwen_image_edit"]'::json ELSE '[]'::json END,
      'orchestrator_status', 'active'
    ), 
    NOW(), 
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    last_heartbeat = NOW(),
    status = 'active';
END;
$$;


ALTER FUNCTION "public"."auto_register_worker"("p_worker_id" "text", "p_instance_type" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."check_auto_topup_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_record RECORD;
  time_since_last_trigger interval;
BEGIN
  -- Only check when credits decrease (not increase)
  IF NEW.credits >= OLD.credits THEN
    RETURN NEW;
  END IF;

  -- Get user auto-top-up settings (ORIGINAL - no public. prefix)
  SELECT 
    auto_topup_enabled,
    auto_topup_threshold,
    auto_topup_amount,
    auto_topup_last_triggered,
    stripe_customer_id,
    stripe_payment_method_id
  INTO user_record
  FROM users 
  WHERE id = NEW.id;

  -- Exit if auto-top-up not enabled or not configured
  IF NOT user_record.auto_topup_enabled 
     OR user_record.auto_topup_threshold IS NULL 
     OR user_record.auto_topup_amount IS NULL
     OR user_record.stripe_customer_id IS NULL
     OR user_record.stripe_payment_method_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Exit if balance is still above threshold
  IF NEW.credits > user_record.auto_topup_threshold THEN
    RETURN NEW;
  END IF;

  -- Rate limiting: prevent triggering more than once per hour
  IF user_record.auto_topup_last_triggered IS NOT NULL THEN
    time_since_last_trigger := NOW() - user_record.auto_topup_last_triggered;
    IF time_since_last_trigger < interval '1 hour' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Update last triggered timestamp to prevent duplicate triggers (ORIGINAL - no public. prefix)
  UPDATE users 
  SET auto_topup_last_triggered = NOW()
  WHERE id = NEW.id;

  -- Call the trigger-auto-topup edge function
  -- Note: This uses pg_net extension to make HTTP requests
  PERFORM 
    net.http_post(
      url := 'https://wczysqzxlwdndgxitrvc.supabase.co/functions/v1/trigger-auto-topup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
      ),
      body := jsonb_build_object(
        'userId', NEW.id
      )
    );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_auto_topup_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_welcome_bonus_eligibility"() RETURNS TABLE("eligible" boolean, "already_had_bonus" boolean, "current_credits_balance" numeric, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_user_id uuid;
  user_record record;
BEGIN
  -- Get the current authenticated user ID
  current_user_id := auth.uid();
  
  -- Exit if no authenticated user
  IF current_user_id IS NULL THEN
    RETURN QUERY SELECT false, false, 0::numeric(10,3), 'No authenticated user'::text;
    RETURN;
  END IF;
  
  -- Get user record with current credits and welcome bonus status
  SELECT u.given_credits, u.credits INTO user_record
  FROM users u 
  WHERE u.id = current_user_id;
  
  -- If user doesn't exist, create them first (should not happen with proper auth flow)
  IF NOT FOUND THEN
    PERFORM create_user_record_if_not_exists();
    SELECT u.given_credits, u.credits INTO user_record
    FROM users u 
    WHERE u.id = current_user_id;
  END IF;
  
  -- Check if user already has welcome bonus
  IF user_record.given_credits = true THEN
    RETURN QUERY SELECT false, true, user_record.credits, 'Welcome bonus already granted'::text;
    RETURN;
  END IF;
  
  -- User is eligible for welcome bonus
  RETURN QUERY SELECT true, false, user_record.credits, 'User eligible for welcome bonus'::text;
  
END;
$$;


ALTER FUNCTION "public"."check_welcome_bonus_eligibility"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_welcome_bonus_eligibility"() IS 'Checks if user is eligible for welcome bonus. Does not grant credits - that should be done via the grant-credits edge function.';



CREATE OR REPLACE FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean DEFAULT false, "p_run_type" "text" DEFAULT NULL::"text") RETURNS TABLE("task_id" "uuid", "params" "jsonb", "task_type" "text", "project_id" "uuid", "user_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_task_id UUID;
  v_params JSONB;
  v_task_type TEXT;
  v_project_id UUID;
  v_user_id UUID;
  v_status_filter task_status[];
BEGIN
  -- Set status filter based on include_active flag (with proper enum casting)
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Single atomic query to find and claim the next eligible task
  WITH eligible_users AS (
    -- Pre-filter users who meet all criteria
    SELECT 
      u.id as user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'::task_status
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    -- Find tasks that meet dependency criteria and run_type filter
    SELECT 
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      p.user_id,
      ROW_NUMBER() OVER (ORDER BY t.created_at ASC) as rn
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = 'Queued'::task_status
      AND (t.dependant_on IS NULL OR dep.status = 'Complete'::task_status)
      AND EXISTS (
        SELECT 1 FROM eligible_users eu WHERE eu.user_id = p.user_id
      )
      -- Add run_type filtering if specified
      AND (
        p_run_type IS NULL OR 
        get_task_run_type(t.task_type) = p_run_type
      )
  )
  -- Atomically claim the first eligible task
  UPDATE tasks 
  SET 
    status = CASE 
      WHEN status = 'Queued'::task_status THEN 'In Progress'::task_status 
      ELSE status 
    END,
    worker_id = CASE 
      WHEN status = 'Queued'::task_status THEN p_worker_id 
      ELSE worker_id 
    END,
    updated_at = CASE 
      WHEN status = 'Queued'::task_status THEN NOW() 
      ELSE updated_at 
    END,
    generation_started_at = CASE 
      WHEN status = 'Queued'::task_status THEN NOW() 
      ELSE generation_started_at 
    END
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
    AND (NOT p_include_active OR tasks.status = 'Queued'::task_status)
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


ALTER FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean, "p_run_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean, "p_run_type" "text") IS 'Removed SECURITY DEFINER - now relies on RLS policies to allow cross-user task claiming for authenticated users';



CREATE OR REPLACE FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false, "p_run_type" "text" DEFAULT NULL::"text") RETURNS TABLE("task_id" "uuid", "params" "jsonb", "task_type" "text", "project_id" "uuid", "user_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_task_id UUID;
  v_params JSONB;
  v_task_type TEXT;
  v_project_id UUID;
  v_status_filter task_status[];
BEGIN
  -- Set status filter based on include_active flag
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Pre-check user eligibility
  IF NOT EXISTS (
    SELECT 1 FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'::task_status
    WHERE u.id = p_user_id
      AND u.credits > 0
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  ) THEN
    RETURN; -- User not eligible, return empty result
  END IF;

  -- Find and claim next eligible task for this specific user
  WITH ready_tasks AS (
    SELECT 
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      p.user_id,
      ROW_NUMBER() OVER (ORDER BY t.created_at ASC) as rn
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = 'Queued'::task_status
      AND p.user_id = p_user_id
      AND (t.dependant_on IS NULL OR dep.status = 'Complete'::task_status)
      -- Add run_type filtering if specified
      AND (
        p_run_type IS NULL OR 
        get_task_run_type(t.task_type) = p_run_type
      )
  )
  -- Atomically claim the first eligible task
  UPDATE tasks 
  SET 
    status = CASE 
      WHEN status = 'Queued'::task_status THEN 'In Progress'::task_status 
      ELSE status 
    END,
    generation_started_at = CASE 
      WHEN status = 'Queued'::task_status THEN NOW() 
      ELSE generation_started_at 
    END,
    updated_at = NOW()
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
  RETURNING tasks.id, tasks.params, tasks.task_type, tasks.project_id, p_user_id
  INTO v_task_id, v_params, v_task_type, v_project_id;

  -- Return the claimed task or nothing if no task was available
  IF v_task_id IS NOT NULL THEN
    task_id := v_task_id;
    params := v_params;
    task_type := v_task_type;
    project_id := v_project_id;
    user_id := p_user_id;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;


ALTER FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") IS 'Removed SECURITY DEFINER - now runs with caller privileges and relies on RLS policies';



CREATE OR REPLACE FUNCTION "public"."claim_next_task_user_pat"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false) RETURNS TABLE("task_id" "uuid", "params" "jsonb", "task_type" "text", "project_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_status_filter task_status[];
  v_allows_local BOOLEAN;
  v_in_progress_count INTEGER;
BEGIN
  -- Set status filter based on include_active flag (with proper enum casting)
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Get user preferences and validate eligibility
  -- NO CREDITS CHECK for PAT users
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
    COUNT(in_progress_tasks.id)
  INTO v_allows_local, v_in_progress_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
    AND in_progress_tasks.status = 'In Progress'::task_status
    -- Exclude orchestrator tasks from concurrency limit
    AND COALESCE(in_progress_tasks.task_type, '') NOT ILIKE '%orchestrator%'
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings;

  -- Early exit if user doesn't meet basic criteria
  -- ONLY check allows_local and concurrency limit, NO CREDITS CHECK for PAT users
  IF NOT v_allows_local OR v_in_progress_count >= 5 THEN
    RETURN;
  END IF;

  -- Find and claim the next eligible task atomically
  -- Use RETURN QUERY to properly return the results
  RETURN QUERY
  WITH user_projects AS (
    SELECT id FROM projects WHERE user_id = p_user_id
  ),
  claimed_task AS (
    UPDATE tasks 
    SET 
      status = 'In Progress'::task_status,
      generation_started_at = NOW()
    WHERE tasks.id = (
      -- Subquery to find the oldest eligible task
      SELECT t.id
      FROM tasks t
      JOIN user_projects up ON t.project_id = up.id
      WHERE t.status = ANY(v_status_filter)
        AND (
          t.dependant_on IS NULL 
          OR EXISTS (
            SELECT 1 FROM tasks dep 
            WHERE dep.id = t.dependant_on 
            AND dep.status = 'Complete'::task_status
          )
        )
        -- NO run_type filtering for PAT users
      ORDER BY t.created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    AND tasks.status = 'Queued'::task_status  -- Double-check it's still queued
    RETURNING tasks.id, tasks.params, tasks.task_type, tasks.project_id
  )
  SELECT ct.id, ct.params, ct.task_type, ct.project_id
  FROM claimed_task ct;
END;
$$;


ALTER FUNCTION "public"."claim_next_task_user_pat"("p_user_id" "uuid", "p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_next_task_user_pat"("p_user_id" "uuid", "p_include_active" boolean) IS 'PAT-friendly version: Atomically claims next eligible task for specific user without credits or run_type constraints. Fixed RETURN QUERY syntax.';



CREATE OR REPLACE FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    task_uuid UUID;
    rows_updated INTEGER;
BEGIN
    -- Convert string ID to UUID with error handling
    BEGIN
        task_uuid := p_task_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid task_id format: %', p_task_id;
    END;

    -- Complete the task with timing information
    UPDATE tasks
    SET
        status = 'Complete'::task_status,
        output_location = p_output_location,
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CURRENT_TIMESTAMP
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$;


ALTER FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") IS 'Removed SECURITY DEFINER - now runs with caller privileges';



CREATE OR REPLACE FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean DEFAULT false, "p_run_type" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_total_capacity INTEGER := 0;
BEGIN
  -- Calculate per-user capacity and sum across all eligible users
  WITH per_user_capacity AS (
    SELECT 
      u.id AS user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
      -- Count non-orchestrator in-progress tasks for concurrency checks
      COUNT(CASE 
        WHEN t.status = 'In Progress' 
          AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
        THEN 1 
      END) AS in_progress_count,
      -- Count ready queued tasks with dependency resolved and optional run_type filter
      COUNT(CASE 
        WHEN t.status = 'Queued'
          AND (t.dependant_on IS NULL OR dep.status = 'Complete')
          AND (
            p_run_type IS NULL -- include all when no filter
            OR get_task_run_type(t.task_type) = p_run_type
          )
        THEN 1 
      END) AS ready_queued_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN tasks dep ON dep.id = t.dependant_on
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COALESCE(COUNT(CASE 
      WHEN t.status = 'In Progress' 
        AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1 
    END), 0) < 5
  )
  SELECT COALESCE(SUM(
    CASE 
      WHEN p_include_active THEN
        -- Capacity including active: cap at 5 per user
        LEAST(5, in_progress_count + ready_queued_count)
      ELSE
        -- Capacity for new claims only
        GREATEST(0, LEAST(5 - in_progress_count, ready_queued_count))
    END
  ), 0) INTO v_total_capacity
  FROM per_user_capacity;

  RETURN v_total_capacity;
END;
$$;


ALTER FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean, "p_run_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean, "p_run_type" "text") IS 'FINAL VERSION: Returns capacity-limited task counts across eligible users; respects run_type and dependency resolution. Excludes orchestrator tasks from In Progress counts for capacity calculations. include_active=true counts current in-progress toward capacity.';



CREATE OR REPLACE FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false, "p_run_type" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
  v_ready_queued_count INTEGER;
  v_capacity INTEGER;
BEGIN
  -- Aggregate per-user eligibility and counts
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    u.credits,
    COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) AS in_progress_count,
    COUNT(CASE 
      WHEN t.status = 'Queued'
        AND (t.dependant_on IS NULL OR dep.status = 'Complete')
        AND (
          p_run_type IS NULL
          OR (tt.is_active = true AND tt.run_type = p_run_type)
        )
      THEN 1 
    END) AS ready_queued_count
  INTO v_allows_local, v_user_credits, v_in_progress_count, v_ready_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON dep.id = t.dependant_on
  LEFT JOIN task_types tt ON tt.name = t.task_type
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings, u.credits;

  -- Eligibility checks
  IF NOT v_allows_local OR v_user_credits <= 0 OR COALESCE(v_in_progress_count, 0) >= 5 THEN
    RETURN 0;
  END IF;

  -- Capacity calculation
  IF p_include_active THEN
    v_capacity := LEAST(5, COALESCE(v_in_progress_count, 0) + COALESCE(v_ready_queued_count, 0));
  ELSE
    v_capacity := GREATEST(0, LEAST(5 - COALESCE(v_in_progress_count, 0), COALESCE(v_ready_queued_count, 0)));
  END IF;

  RETURN v_capacity;
END;
$$;


ALTER FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") IS 'Returns capacity-limited task counts for a user; respects run_type and dependency resolution. include_active=true counts current in-progress toward capacity.';



CREATE OR REPLACE FUNCTION "public"."count_eligible_tasks_user_pat"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_allows_local BOOLEAN;
  v_in_progress_count INTEGER;
  v_ready_queued_count INTEGER;
  v_capacity INTEGER;
BEGIN
  -- Aggregate per-user eligibility and counts
  -- Exclude orchestrator tasks from In Progress counts for capacity calculations
  -- NO CREDITS CHECK and NO RUN_TYPE FILTERING for PAT users
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    COUNT(CASE 
      WHEN t.status = 'In Progress' 
        AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1 
    END) AS in_progress_count,
    COUNT(CASE 
      WHEN t.status = 'Queued'
        AND (t.dependant_on IS NULL OR dep.status = 'Complete')
        -- NO run_type filtering for PAT users
      THEN 1 
    END) AS ready_queued_count
  INTO v_allows_local, v_in_progress_count, v_ready_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON dep.id = t.dependant_on
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings;

  -- Eligibility checks (using non-orchestrator In Progress count)
  -- ONLY check allows_local and concurrency limit, NO CREDITS CHECK for PAT users
  IF NOT v_allows_local OR COALESCE(v_in_progress_count, 0) >= 5 THEN
    RETURN 0;
  END IF;

  -- Capacity calculation
  IF p_include_active THEN
    v_capacity := LEAST(5, COALESCE(v_in_progress_count, 0) + COALESCE(v_ready_queued_count, 0));
  ELSE
    v_capacity := GREATEST(0, LEAST(5 - COALESCE(v_in_progress_count, 0), COALESCE(v_ready_queued_count, 0)));
  END IF;

  RETURN v_capacity;
END;
$$;


ALTER FUNCTION "public"."count_eligible_tasks_user_pat"("p_user_id" "uuid", "p_include_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."count_eligible_tasks_user_pat"("p_user_id" "uuid", "p_include_active" boolean) IS 'PAT-friendly version: Returns capacity-limited task counts for a user without credits or run_type constraints. Excludes orchestrator tasks from In Progress counts for capacity calculations.';



CREATE OR REPLACE FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COUNT(*)::integer
  FROM shot_generations sg
  JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = p_shot_id
    AND sg.timeline_frame IS NULL
    AND (g.type IS NULL OR g.type NOT LIKE '%video%');
$$;


ALTER FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_referral_from_session"("p_session_id" "text", "p_fingerprint" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  session_record RECORD;
  referral_uuid uuid;
  current_user_id uuid;
BEGIN
  -- Use auth.uid() for security (don't trust client-provided user_id)
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Find the session that should get credit
  SELECT * INTO session_record
  FROM referral_sessions
  WHERE (
    (p_fingerprint IS NOT NULL AND visitor_fingerprint = p_fingerprint)
    OR (p_session_id IS NOT NULL AND session_id = p_session_id)
  )
  AND converted_at IS NULL
  AND is_latest_referrer = true
  AND referrer_user_id != current_user_id -- No self-referrals
  AND referrer_user_id IS NOT NULL -- Valid referrer
  ORDER BY last_visit_at DESC
  LIMIT 1;
  
  IF session_record.id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Verify the referrer still exists (data integrity check)
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = session_record.referrer_user_id) THEN
    RAISE EXCEPTION 'Referrer user no longer exists';
  END IF;
  
  -- Mark session as converted
  UPDATE referral_sessions 
  SET 
    converted_at = now(),
    converted_user_id = current_user_id
  WHERE id = session_record.id;
  
  -- Create referral record
  INSERT INTO referrals (
    referrer_id,
    referred_id,
    referrer_username,
    session_id
  ) VALUES (
    session_record.referrer_user_id,
    current_user_id,
    session_record.referrer_username,
    session_record.id
  ) RETURNING id INTO referral_uuid;
  
  RETURN referral_uuid;
END;
$$;


ALTER FUNCTION "public"."create_referral_from_session"("p_session_id" "text", "p_fingerprint" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") RETURNS TABLE("shot_id" "uuid", "shot_name" "text", "shot_generation_id" "uuid", "success" boolean)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_shot_id UUID;
  v_shot_generation_id UUID;
BEGIN
  -- Create the shot first
  INSERT INTO shots (name, project_id)
  VALUES (p_shot_name, p_project_id)
  RETURNING id INTO v_shot_id;
  
  -- Add the generation to the shot with timeline_frame 0 (first image)
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
  VALUES (v_shot_id, p_generation_id, 0)
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


COMMENT ON FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") IS 'Creates a shot and adds the first generation at timeline_frame 0. Updated to use timeline_frame instead of position.';



CREATE OR REPLACE FUNCTION "public"."create_user_record_if_not_exists"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_name text;
  user_username text;
  discord_handle text;
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
  
  -- Extract Discord username and sanitize it
  discord_handle := extract_discord_username(jwt_claims, user_metadata);
  user_username := sanitize_discord_handle(discord_handle);
  
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
  INSERT INTO users (id, name, email, username, credits, given_credits, settings, onboarding)
  VALUES (current_user_id, user_name, user_email, user_username, 0, false, default_settings, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  
END;
$$;


ALTER FUNCTION "public"."create_user_record_if_not_exists"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_user_record_if_not_exists"() IS 'Manually create a user record for the authenticated user if it does not exist';



CREATE OR REPLACE FUNCTION "public"."ensure_shot_association_from_params"("p_generation_id" "uuid", "p_params" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    shot_exists boolean;
    association_exists boolean;
    extracted_shot_id uuid;
BEGIN
    -- Extract shot_id from params (same as before)
    extracted_shot_id := COALESCE(
        (p_params->>'shot_id')::uuid,
        (p_params->'originalParams'->>'shot_id')::uuid,
        (p_params->'full_orchestrator_payload'->>'shot_id')::uuid,
        (p_params->'originalParams'->'full_orchestrator_payload'->>'shot_id')::uuid,
        (p_params->'orchestrator_details'->>'shot_id')::uuid,
        (p_params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid
    );
    
    -- Return false if no shot_id found
    IF extracted_shot_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if shot exists
    SELECT EXISTS (
        SELECT 1 FROM shots WHERE id = extracted_shot_id
    ) INTO shot_exists;
    
    -- Check if association already exists
    SELECT EXISTS (
        SELECT 1 FROM shot_generations 
        WHERE shot_id = extracted_shot_id AND generation_id = p_generation_id
    ) INTO association_exists;
    
    -- Create association if shot exists and no association exists
    IF shot_exists AND NOT association_exists THEN
        -- Insert without timeline_frame (unpositioned by default)
        INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
        VALUES (extracted_shot_id, p_generation_id, NULL);
        
        RETURN true;
    END IF;
    
    RETURN association_exists;
END;
$$;


ALTER FUNCTION "public"."ensure_shot_association_from_params"("p_generation_id" "uuid", "p_params" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_shot_association_from_params"("p_generation_id" "uuid", "p_params" "jsonb") IS 'Creates shot associations from generation params. Updated to use timeline_frame instead of position.';



CREATE OR REPLACE FUNCTION "public"."exchange_timeline_frames"("p_shot_id" "uuid", "p_generation_id_a" "uuid", "p_generation_id_b" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  item_a_frame integer;
  item_b_frame integer;
BEGIN
  -- Get current timeline_frames for both items
  SELECT timeline_frame
  INTO item_a_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  SELECT timeline_frame
  INTO item_b_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_b;

  -- Verify both items exist
  IF item_a_frame IS NULL OR item_b_frame IS NULL THEN
    RAISE EXCEPTION 'One or both items not found in shot %', p_shot_id;
  END IF;

  -- Perform atomic swap of timeline_frames
  UPDATE shot_generations SET
    timeline_frame = CASE
      WHEN generation_id = p_generation_id_a THEN item_b_frame
      WHEN generation_id = p_generation_id_b THEN item_a_frame
    END,
    updated_at = NOW()
  WHERE shot_id = p_shot_id
    AND generation_id IN (p_generation_id_a, p_generation_id_b);

  -- Log the exchange for debugging
  RAISE LOG 'Exchanged timeline_frames: % (frame % -> %) and % (frame % -> %)',
    p_generation_id_a, item_a_frame, item_b_frame,
    p_generation_id_b, item_b_frame, item_a_frame;
END;
$$;


ALTER FUNCTION "public"."exchange_timeline_frames"("p_shot_id" "uuid", "p_generation_id_a" "uuid", "p_generation_id_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_discord_username"("jwt_claims" "jsonb", "user_metadata" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  discord_username text;
  provider_data jsonb;
BEGIN
  -- Try to get Discord username from various possible locations in JWT
  -- Check user_metadata first (most reliable for Discord)
  discord_username := user_metadata ->> 'preferred_username';
  
  IF discord_username IS NULL OR discord_username = '' THEN
    discord_username := user_metadata ->> 'username';
  END IF;
  
  IF discord_username IS NULL OR discord_username = '' THEN
    discord_username := user_metadata ->> 'user_name';
  END IF;
  
  -- Check app_metadata for provider-specific data
  IF discord_username IS NULL OR discord_username = '' THEN
    provider_data := (jwt_claims -> 'app_metadata' -> 'provider_data');
    IF provider_data IS NOT NULL THEN
      discord_username := provider_data ->> 'username';
    END IF;
  END IF;
  
  -- Fallback to name or email if no Discord username found
  IF discord_username IS NULL OR discord_username = '' THEN
    discord_username := COALESCE(
      user_metadata ->> 'full_name',
      user_metadata ->> 'name',
      jwt_claims ->> 'email'
    );
  END IF;
  
  -- Final fallback
  IF discord_username IS NULL OR discord_username = '' THEN
    discord_username := 'user';
  END IF;
  
  RETURN discord_username;
END;
$$;


ALTER FUNCTION "public"."extract_discord_username"("jwt_claims" "jsonb", "user_metadata" "jsonb") OWNER TO "postgres";


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
        t.status,
        COALESCE(t.attempts, 0),
        t.worker_id,
        t.created_at,
        t.generation_started_at,
        t.generation_processed_at,
        t.params as task_data
    FROM tasks t  -- ORIGINAL - no public. prefix
    WHERE t.status = ANY(status_filter)
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
    -- ORIGINAL - no public. prefix
    UPDATE tasks
    SET 
        status = 'Queued',
        worker_id = NULL,
        generation_started_at = NULL,
        updated_at = NOW()
    WHERE 
        worker_id = ANY(failed_worker_ids)
        AND status = 'In Progress'
        AND COALESCE(attempts, 0) < 3;
    
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
    -- Get current metadata or initialize empty (ORIGINAL - no public. prefix)
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
    
    -- Update heartbeat and metadata (ORIGINAL - no public. prefix)
    UPDATE workers
    SET 
        last_heartbeat = NOW(),
        metadata = current_metadata
    WHERE id = worker_id_param;
    
    -- If worker doesn't exist, create it as external worker (ORIGINAL - no public. prefix)
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



CREATE OR REPLACE FUNCTION "public"."get_task_cost"("p_task_type" "text", "p_duration_seconds" integer DEFAULT NULL::integer, "p_unit_count" integer DEFAULT 1) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_billing_type text;
  v_base_cost_per_second decimal(10,6);
  v_unit_cost decimal(10,6);
  v_total_cost decimal(10,6);
BEGIN
  -- Get task type configuration (ORIGINAL - no public. prefix)
  SELECT 
    billing_type, 
    base_cost_per_second, 
    unit_cost
  INTO v_billing_type, v_base_cost_per_second, v_unit_cost
  FROM task_types 
  WHERE name = p_task_type AND is_active = true;
  
  -- If task type not found, use default per-second billing
  IF v_billing_type IS NULL THEN
    v_billing_type := 'per_second';
    v_base_cost_per_second := 0.0278; -- Default cost
    v_unit_cost := NULL;
  END IF;
  
  -- Calculate cost based on billing type
  IF v_billing_type = 'per_unit' THEN
    -- Per-unit billing: unit_cost * number of units
    v_total_cost := COALESCE(v_unit_cost, 0.025) * p_unit_count;
  ELSE
    -- Per-second billing: base_cost_per_second * duration
    IF p_duration_seconds IS NULL THEN
      -- If no duration provided for per-second billing, return base rate
      v_total_cost := v_base_cost_per_second;
    ELSE
      v_total_cost := v_base_cost_per_second * p_duration_seconds;
    END IF;
  END IF;
  
  RETURN v_total_cost;
END;
$$;


ALTER FUNCTION "public"."get_task_cost"("p_task_type" "text", "p_duration_seconds" integer, "p_unit_count" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_task_cost"("p_task_type" "text", "p_duration_seconds" integer, "p_unit_count" integer) IS 'Calculate task cost based on billing type - supports both per-second and per-unit billing';



CREATE OR REPLACE FUNCTION "public"."get_task_run_type"("p_task_type" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    run_type_result text;
BEGIN
    SELECT run_type INTO run_type_result
    FROM task_types
    WHERE name = p_task_type AND is_active = true;
    
    RETURN COALESCE(run_type_result, 'unknown');
END;
$$;


ALTER FUNCTION "public"."get_task_run_type"("p_task_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_task_run_type"("p_task_type" "text") IS 'Removed SECURITY DEFINER - now runs with caller privileges';



CREATE OR REPLACE FUNCTION "public"."initialize_timeline_frames_for_shot"("p_shot_id" "uuid", "p_frame_spacing" integer DEFAULT 50) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  records_updated integer := 0;
  max_existing_frame integer;
  current_frame integer;
BEGIN
  -- Get the maximum existing timeline_frame for this shot
  SELECT COALESCE(MAX(timeline_frame), -50)
  INTO max_existing_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND timeline_frame IS NOT NULL;

  -- Update records that have NULL timeline_frame
  WITH ordered_records AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
    FROM shot_generations
    WHERE shot_id = p_shot_id AND timeline_frame IS NULL
  )
  UPDATE shot_generations
  SET timeline_frame = max_existing_frame + (ordered_records.rn * p_frame_spacing)
  FROM ordered_records
  WHERE shot_generations.id = ordered_records.id;

  GET DIAGNOSTICS records_updated = ROW_COUNT;
  
  RETURN records_updated;
END;
$$;


ALTER FUNCTION "public"."initialize_timeline_frames_for_shot"("p_shot_id" "uuid", "p_frame_spacing" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."initialize_timeline_frames_for_shot"("p_shot_id" "uuid", "p_frame_spacing" integer) IS 'Initializes timeline_frame values for shot_generations that have NULL values.';



CREATE OR REPLACE FUNCTION "public"."insert_shot_at_position"("p_project_id" "uuid", "p_shot_name" "text", "p_position" integer) RETURNS TABLE("shot_id" "uuid", "shot_name" "text", "shot_position" integer, "success" boolean)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."insert_shot_at_position"("p_project_id" "uuid", "p_shot_name" "text", "p_position" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."insert_shot_at_position"("p_project_id" "uuid", "p_shot_name" "text", "p_position" integer) IS 'Removed SECURITY DEFINER - now runs with caller privileges';



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



CREATE OR REPLACE FUNCTION "public"."per_user_capacity_stats_service_role"() RETURNS TABLE("user_id" "uuid", "credits" numeric, "queued_tasks" bigint, "in_progress_tasks" bigint, "total_pending_tasks" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.credits,
    COALESCE(queued.task_count, 0) as queued_tasks,
    COALESCE(in_progress.task_count, 0) as in_progress_tasks,
    COALESCE(queued.task_count, 0) + COALESCE(in_progress.task_count, 0) as total_pending_tasks
  FROM users u
  LEFT JOIN (
    SELECT 
      p.user_id,
      COUNT(*) as task_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'Queued'
    GROUP BY p.user_id
  ) queued ON u.id = queued.user_id
  LEFT JOIN (
    SELECT 
      p.user_id,
      COUNT(*) as task_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'In Progress'
      -- Exclude orchestrator tasks from capacity calculations for consistency
      AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
    GROUP BY p.user_id
  ) in_progress ON u.id = in_progress.user_id
  WHERE u.credits IS NOT NULL
  ORDER BY total_pending_tasks DESC, u.credits DESC;
END;
$$;


ALTER FUNCTION "public"."per_user_capacity_stats_service_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."per_user_capacity_stats_service_role"() IS 'Returns per-user task statistics excluding orchestrator tasks from in_progress counts to maintain consistency with capacity calculations.';



CREATE OR REPLACE FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") RETURNS TABLE("id" "uuid", "shot_id" "uuid", "generation_id" "uuid", "position" integer)
    LANGUAGE "plpgsql"
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


COMMENT ON FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") IS 'Removed SECURITY DEFINER - now runs with caller privileges';



CREATE OR REPLACE FUNCTION "public"."prevent_direct_credit_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Allow if called by service role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Prevent direct credit updates by regular users
  IF OLD.credits IS DISTINCT FROM NEW.credits THEN
    RAISE EXCEPTION 'Direct credit updates are not allowed. Use the credits_ledger table.';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_direct_credit_updates"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."prevent_direct_credit_updates"() IS 'Removed SECURITY DEFINER - now runs with caller privileges';



CREATE OR REPLACE FUNCTION "public"."prevent_timing_manipulation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


COMMENT ON FUNCTION "public"."prevent_timing_manipulation"() IS 'Removed SECURITY DEFINER - now runs with caller privileges';



CREATE OR REPLACE FUNCTION "public"."process_task_result"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    shot_id uuid;
    add_in_position boolean;
    new_generation_id uuid;
    next_timeline_frame integer;
BEGIN
    -- Skip if this is not a generation task result
    IF NEW.result IS NULL OR NEW.result->>'location' IS NULL THEN
        RETURN NEW;
    END IF;

    -- Extract shot_id from task params
    shot_id := COALESCE(
        (NEW.params->>'shot_id')::uuid,
        (NEW.params->'originalParams'->>'shot_id')::uuid,
        (NEW.params->'full_orchestrator_payload'->>'shot_id')::uuid,
        (NEW.params->'originalParams'->'full_orchestrator_payload'->>'shot_id')::uuid,
        (NEW.params->'orchestrator_details'->>'shot_id')::uuid,
        (NEW.params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid
    );

    -- Extract add_in_position flag
    add_in_position := COALESCE(
        (NEW.params->>'add_in_position')::boolean,
        (NEW.params->'originalParams'->>'add_in_position')::boolean,
        (NEW.params->'full_orchestrator_payload'->>'add_in_position')::boolean,
        (NEW.params->'originalParams'->'full_orchestrator_payload'->>'add_in_position')::boolean,
        (NEW.params->'orchestrator_details'->>'add_in_position')::boolean,
        (NEW.params->'originalParams'->'orchestrator_details'->>'add_in_position')::boolean,
        true -- Default to true if not specified
    );

    -- Create generation record first
    INSERT INTO generations (location, type, project_id, params, thumbnail_url)
    VALUES (
        NEW.result->>'location',
        COALESCE(NEW.result->>'type', 'image'),
        NEW.project_id,
        NEW.result,
        NEW.result->>'thumbnail_url'
    )
    RETURNING id INTO new_generation_id;

    -- Link to shot if shot_id exists
    IF shot_id IS NOT NULL THEN
        IF add_in_position THEN
            -- Calculate next timeline_frame
            SELECT COALESCE(MAX(timeline_frame), -50) + 50
            INTO next_timeline_frame
            FROM shot_generations
            WHERE shot_id = shot_id;

            INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
            VALUES (shot_id, new_generation_id, next_timeline_frame);

            RAISE LOG '[ProcessTask] Linked generation % to shot % at timeline_frame %', new_generation_id, shot_id, next_timeline_frame;
        ELSE
            -- Create shot_generations link without timeline_frame (unpositioned)
            INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
            VALUES (shot_id, new_generation_id, NULL);

            RAISE LOG '[ProcessTask] Linked generation % to shot % without timeline_frame', new_generation_id, shot_id;
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[ProcessTask] Error processing task result: %', SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."process_task_result"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_task_result"() IS 'Processes task results and creates shot associations. Updated to use timeline_frame instead of position.';



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


CREATE OR REPLACE FUNCTION "public"."sanitize_discord_handle"("handle" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  sanitized text;
  counter integer := 0;
  base_username text;
  final_username text;
BEGIN
  -- Handle null or empty input
  IF handle IS NULL OR trim(handle) = '' THEN
    RETURN 'user';
  END IF;
  
  -- Start with the input handle
  sanitized := trim(handle);
  
  -- Remove Discord discriminator (everything after and including #)
  sanitized := split_part(sanitized, '#', 1);
  
  -- Convert to lowercase
  sanitized := lower(sanitized);
  
  -- Replace problematic characters with underscores
  -- Remove: @, #, :, `, spaces, and other special chars not allowed in domains
  sanitized := regexp_replace(sanitized, '[^a-z0-9_-]', '_', 'g');
  
  -- Remove multiple consecutive underscores
  sanitized := regexp_replace(sanitized, '_+', '_', 'g');
  
  -- Remove leading/trailing underscores and hyphens
  sanitized := trim(sanitized, '_-');
  
  -- Ensure minimum length (pad with random suffix if too short)
  IF length(sanitized) < 2 THEN
    sanitized := sanitized || '_user';
  END IF;
  
  -- Ensure maximum length (truncate if too long)
  IF length(sanitized) > 30 THEN
    sanitized := substring(sanitized, 1, 30);
  END IF;
  
  -- Remove trailing underscores after truncation
  sanitized := rtrim(sanitized, '_-');
  
  -- Store base username for collision handling
  base_username := sanitized;
  final_username := base_username;
  
  -- Handle collisions by appending numbers
  WHILE EXISTS (SELECT 1 FROM users WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || '_' || counter::text;
    
    -- Ensure we don't exceed length limit with counter
    IF length(final_username) > 32 THEN
      base_username := substring(base_username, 1, 32 - length('_' || counter::text));
      final_username := base_username || '_' || counter::text;
    END IF;
    
    -- Safety check to prevent infinite loops
    IF counter > 9999 THEN
      final_username := 'user_' || extract(epoch from now())::integer::text;
      EXIT;
    END IF;
  END LOOP;
  
  RETURN final_username;
END;
$$;


ALTER FUNCTION "public"."sanitize_discord_handle"("handle" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."timeline_position_sync"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "generation_id" "uuid", "position" integer, "timeline_frame" integer, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _change_count integer;
  _affected_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_shot_id::text));

  IF p_changes IS NULL OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'Changes array cannot be null or empty';
  END IF;

  SELECT jsonb_array_length(p_changes) INTO _change_count;
  RAISE LOG 'timeline_position_sync_CLEAN: shot_id=%, changes=%, update_positions=%', 
    p_shot_id, _change_count, p_update_positions;

  CREATE TEMP TABLE temp_frame_changes AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as gen_id,
    (c->>'timeline_frame')::integer as frame_value
  FROM jsonb_array_elements(p_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0;

  IF EXISTS (
    SELECT 1 FROM temp_frame_changes tfc
    LEFT JOIN shot_generations sg ON sg.shot_id = p_shot_id AND sg.generation_id = tfc.gen_id
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_frame_changes;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', p_shot_id;
  END IF;

  IF (SELECT COUNT(*) FROM temp_frame_changes) != (SELECT COUNT(DISTINCT frame_value) FROM temp_frame_changes) THEN
    DROP TABLE temp_frame_changes;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes payload';
  END IF;

  UPDATE shot_generations 
  SET 
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE shot_id = p_shot_id
    AND generation_id IN (SELECT gen_id FROM temp_frame_changes);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'timeline_position_sync_CLEAN: cleared % timeline_frames', _affected_count;

  UPDATE shot_generations 
  SET 
    timeline_frame = tfc.frame_value,
    updated_at = NOW()
  FROM temp_frame_changes tfc
  WHERE shot_id = p_shot_id 
    AND generation_id = tfc.gen_id;

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'timeline_position_sync_CLEAN: updated % timeline_frames', _affected_count;

  IF p_update_positions THEN
    WITH ordered_items AS (
      SELECT 
        sg.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            sg.timeline_frame NULLS LAST,
            sg.created_at ASC, 
            sg.generation_id ASC
        ) - 1 as new_position
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id
    )
    UPDATE shot_generations 
    SET 
      "position" = oi.new_position,
      updated_at = NOW()
    FROM ordered_items oi
    WHERE shot_generations.id = oi.id;

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'timeline_position_sync_CLEAN: reconciled % positions', _affected_count;
  END IF;

  DROP TABLE temp_frame_changes;

  RETURN QUERY
  SELECT 
    sg.id,
    sg.generation_id,
    sg."position",
    sg.timeline_frame,
    sg.updated_at
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id
  ORDER BY sg."position" ASC;

  RAISE LOG 'timeline_position_sync_CLEAN: completed successfully';
END;
$$;


ALTER FUNCTION "public"."timeline_position_sync"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."timeline_sync_bulletproof"("shot_uuid" "uuid", "frame_changes" "jsonb", "should_update_positions" boolean DEFAULT true) RETURNS TABLE("record_id" "uuid", "gen_uuid" "uuid", "frame_value" integer, "last_updated" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  change_count integer;
  affected_rows integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(shot_uuid::text));

  IF frame_changes IS NULL OR jsonb_array_length(frame_changes) = 0 THEN
    RAISE EXCEPTION 'Changes array cannot be null or empty';
  END IF;

  SELECT jsonb_array_length(frame_changes) INTO change_count;
  RAISE LOG 'timeline_sync_bulletproof: shot=%, changes=%', 
    shot_uuid, change_count;

  CREATE TEMP TABLE temp_updates AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as update_gen_id,
    (c->>'timeline_frame')::integer as update_frame
  FROM jsonb_array_elements(frame_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0;

  IF EXISTS (
    SELECT 1 FROM temp_updates tu
    LEFT JOIN shot_generations sg ON (sg.shot_id = shot_uuid AND sg.generation_id = tu.update_gen_id)
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_updates;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', shot_uuid;
  END IF;

  IF (SELECT COUNT(*) FROM temp_updates) != (SELECT COUNT(DISTINCT update_frame) FROM temp_updates) THEN
    DROP TABLE temp_updates;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes array for shot %', shot_uuid;
  END IF;

  -- Update the timeline frames
  UPDATE shot_generations
  SET
    timeline_frame = temp_updates.update_frame,
    updated_at = NOW()
  FROM temp_updates
  WHERE shot_generations.id = (
    SELECT sg.id FROM shot_generations sg
    WHERE sg.shot_id = shot_uuid AND sg.generation_id = temp_updates.update_gen_id
    LIMIT 1
  );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE LOG 'timeline_sync_bulletproof: updated % frames', affected_rows;

  DROP TABLE temp_updates;

  RETURN QUERY
  SELECT
    sg.id as record_id,
    sg.generation_id as gen_uuid,
    sg.timeline_frame as frame_value,
    sg.updated_at as last_updated
  FROM shot_generations sg
  WHERE sg.shot_id = shot_uuid
  ORDER BY sg.timeline_frame ASC;
END;
$$;


ALTER FUNCTION "public"."timeline_sync_bulletproof"("shot_uuid" "uuid", "frame_changes" "jsonb", "should_update_positions" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_referral_visit"("p_referrer_username" "text", "p_visitor_fingerprint" "text" DEFAULT NULL::"text", "p_session_id" "text" DEFAULT NULL::"text", "p_visitor_ip" "inet" DEFAULT NULL::"inet") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  referrer_user_id uuid;
  existing_session RECORD;
  session_uuid uuid;
BEGIN
  -- Validate input
  IF p_referrer_username IS NULL OR LENGTH(trim(p_referrer_username)) = 0 THEN
    RETURN NULL;
  END IF;
  
  -- Find referrer by username with case-insensitive lookup
  SELECT id INTO referrer_user_id
  FROM users 
  WHERE LOWER(username) = LOWER(trim(p_referrer_username));
  
  IF referrer_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check for existing session (prioritize fingerprint > session_id > IP)
  SELECT * INTO existing_session
  FROM referral_sessions
  WHERE (
    (p_visitor_fingerprint IS NOT NULL AND visitor_fingerprint = p_visitor_fingerprint)
    OR (p_visitor_fingerprint IS NULL AND p_session_id IS NOT NULL AND session_id = p_session_id)
    OR (p_visitor_fingerprint IS NULL AND p_session_id IS NULL AND p_visitor_ip IS NOT NULL AND visitor_ip = p_visitor_ip)
  )
  AND converted_at IS NULL
  ORDER BY last_visit_at DESC
  LIMIT 1;
  
  -- Update existing or create new
  IF existing_session.id IS NOT NULL THEN
    -- Mark old sessions as not latest if different referrer
    IF existing_session.referrer_username != p_referrer_username THEN
      UPDATE referral_sessions 
      SET is_latest_referrer = false
      WHERE (
        (p_visitor_fingerprint IS NOT NULL AND visitor_fingerprint = p_visitor_fingerprint)
        OR (p_visitor_fingerprint IS NULL AND p_session_id IS NOT NULL AND session_id = p_session_id)
        OR (p_visitor_fingerprint IS NULL AND p_session_id IS NULL AND p_visitor_ip IS NOT NULL AND visitor_ip = p_visitor_ip)
      )
      AND converted_at IS NULL;
    ELSE
      -- Same referrer, just update visit count
      UPDATE referral_sessions 
      SET 
        visit_count = visit_count + 1,
        last_visit_at = now()
      WHERE id = existing_session.id;
      
      RETURN existing_session.id;
    END IF;
  END IF;
  
  -- Create new session
  INSERT INTO referral_sessions (
    referrer_username,
    referrer_user_id,
    visitor_fingerprint,
    session_id,
    visitor_ip,
    visit_count,
    first_visit_at,
    last_visit_at,
    is_latest_referrer
  ) VALUES (
    p_referrer_username,
    referrer_user_id,
    p_visitor_fingerprint,
    p_session_id,
    p_visitor_ip,
    COALESCE(existing_session.visit_count, 0) + 1,
    COALESCE(existing_session.first_visit_at, now()),
    now(),
    true
  ) RETURNING id INTO session_uuid;
  
  RETURN session_uuid;
END;
$$;


ALTER FUNCTION "public"."track_referral_visit"("p_referrer_username" "text", "p_visitor_fingerprint" "text", "p_session_id" "text", "p_visitor_ip" "inet") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."verify_referral_security"() RETURNS TABLE("table_name" "text", "rls_enabled" boolean, "policy_count" bigint, "anon_permissions" "text"[], "auth_permissions" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.tablename::text,
    c.relrowsecurity,
    COUNT(p.policyname),
    ARRAY_AGG(DISTINCT tp1.privilege_type) FILTER (WHERE tp1.grantee = 'anon'),
    ARRAY_AGG(DISTINCT tp2.privilege_type) FILTER (WHERE tp2.grantee = 'authenticated')
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  LEFT JOIN pg_policies p ON p.tablename = t.tablename
  LEFT JOIN information_schema.table_privileges tp1 ON tp1.table_name = t.tablename AND tp1.grantee = 'anon'
  LEFT JOIN information_schema.table_privileges tp2 ON tp2.table_name = t.tablename AND tp2.grantee = 'authenticated'
  WHERE t.schemaname = 'public' 
    AND t.tablename LIKE 'referral%'
  GROUP BY t.tablename, c.relrowsecurity
  ORDER BY t.tablename;
END;
$$;


ALTER FUNCTION "public"."verify_referral_security"() OWNER TO "postgres";

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


COMMENT ON TABLE "public"."tasks" IS 'Task completion processing is now handled by the complete_task Edge Function calling calculate-task-cost directly, eliminating the need for database triggers to call external functions.';



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


CREATE TABLE IF NOT EXISTS "public"."referral_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_username" "text" NOT NULL,
    "referrer_user_id" "uuid",
    "visitor_fingerprint" "text",
    "session_id" "text",
    "visitor_ip" "inet",
    "first_visit_at" timestamp with time zone DEFAULT "now"(),
    "last_visit_at" timestamp with time zone DEFAULT "now"(),
    "visit_count" integer DEFAULT 1,
    "converted_at" timestamp with time zone,
    "converted_user_id" "uuid",
    "is_latest_referrer" boolean DEFAULT true
);


ALTER TABLE "public"."referral_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "referred_id" "uuid" NOT NULL,
    "referrer_username" "text" NOT NULL,
    "session_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "api_keys" "jsonb",
    "settings" "jsonb",
    "credits" numeric(10,3) DEFAULT 0 NOT NULL,
    "given_credits" boolean DEFAULT false NOT NULL,
    "onboarding" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_payment_method_id" "text",
    "auto_topup_enabled" boolean DEFAULT false NOT NULL,
    "auto_topup_amount" integer,
    "auto_topup_threshold" integer,
    "auto_topup_last_triggered" timestamp with time zone,
    "username" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."given_credits" IS 'Tracks whether user has received welcome bonus. Replaces automatic credit granting in user creation function (see migration 20250210000000 for old approach).';



CREATE OR REPLACE VIEW "public"."referral_stats" WITH ("security_invoker"='true') AS
 SELECT "u"."id",
    "u"."username",
    "u"."name",
    "count"(DISTINCT "rs"."id") AS "total_visits",
    "count"(DISTINCT "rs"."id") FILTER (WHERE ("rs"."converted_at" IS NOT NULL)) AS "conversions",
    "count"(DISTINCT "r"."id") AS "successful_referrals",
        CASE
            WHEN ("count"(DISTINCT "rs"."id") > 0) THEN "round"(((("count"(DISTINCT "rs"."id") FILTER (WHERE ("rs"."converted_at" IS NOT NULL)))::numeric / ("count"(DISTINCT "rs"."id"))::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS "conversion_rate_percent"
   FROM (("public"."users" "u"
     LEFT JOIN "public"."referral_sessions" "rs" ON (("u"."username" = "rs"."referrer_username")))
     LEFT JOIN "public"."referrals" "r" ON (("u"."id" = "r"."referrer_id")))
  WHERE ("u"."username" IS NOT NULL)
  GROUP BY "u"."id", "u"."username", "u"."name";


ALTER VIEW "public"."referral_stats" OWNER TO "postgres";


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
    "created_at" timestamp with time zone DEFAULT "now"(),
    "timeline_frame" integer,
    "metadata" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shot_generations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."shot_generations"."timeline_frame" IS 'Frame position for timeline view (e.g., 60, 120, 180). NULL means not positioned on timeline yet.';



COMMENT ON COLUMN "public"."shot_generations"."metadata" IS 'Additional position metadata like frame_spacing, user_positioned flags, etc.';



COMMENT ON COLUMN "public"."shot_generations"."updated_at" IS 'Timestamp when the record was last modified';



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
    "count"("sg"."id") FILTER (WHERE ("sg"."timeline_frame" IS NOT NULL)) AS "positioned_count",
    "count"("sg"."id") FILTER (WHERE (("sg"."timeline_frame" IS NULL) AND (("g"."type" IS NULL) OR ("g"."type" !~~ '%video%'::"text")))) AS "unpositioned_count",
    "count"("sg"."id") FILTER (WHERE (("g"."params" ->> 'tool_type'::"text") = 'travel-between-images'::"text")) AS "video_count"
   FROM (("public"."shots" "s"
     LEFT JOIN "public"."shot_generations" "sg" ON (("sg"."shot_id" = "s"."id")))
     LEFT JOIN "public"."generations" "g" ON (("g"."id" = "sg"."generation_id")))
  GROUP BY "s"."id", "s"."project_id";


ALTER VIEW "public"."shot_statistics" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."task_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "run_type" "text" DEFAULT 'gpu'::"text" NOT NULL,
    "category" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "base_cost_per_second" numeric(10,6) NOT NULL,
    "cost_factors" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "billing_type" "text" DEFAULT 'per_second'::"text" NOT NULL,
    "unit_cost" numeric(10,6) DEFAULT NULL::numeric,
    "tool_type" "text",
    CONSTRAINT "check_billing_type" CHECK (("billing_type" = ANY (ARRAY['per_second'::"text", 'per_unit'::"text"]))),
    CONSTRAINT "check_run_type" CHECK (("run_type" = ANY (ARRAY['gpu'::"text", 'api'::"text"]))),
    CONSTRAINT "check_tool_type_not_null" CHECK ((("tool_type" IS NOT NULL) OR ("is_active" = false)))
);


ALTER TABLE "public"."task_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."task_types" IS 'Registry of all task types with their execution environment (gpu/api) and metadata';



COMMENT ON COLUMN "public"."task_types"."name" IS 'Unique task type identifier (matches tasks.task_type)';



COMMENT ON COLUMN "public"."task_types"."run_type" IS 'Execution environment: gpu (local/cloud GPU) or api (external API calls)';



COMMENT ON COLUMN "public"."task_types"."category" IS 'Task category for organization and UI display';



COMMENT ON COLUMN "public"."task_types"."billing_type" IS 'Billing model: per_second (time-based) or per_unit (fixed cost per task)';



COMMENT ON COLUMN "public"."task_types"."unit_cost" IS 'Fixed cost per unit for per_unit billing type (NULL for per_second tasks)';



CREATE OR REPLACE VIEW "public"."task_types_with_billing" WITH ("security_invoker"='true') AS
 SELECT "id",
    "name",
    "run_type",
    "category",
    "display_name",
    "description",
    "billing_type",
        CASE
            WHEN ("billing_type" = 'per_second'::"text") THEN "base_cost_per_second"
            WHEN ("billing_type" = 'per_unit'::"text") THEN "unit_cost"
            ELSE "base_cost_per_second"
        END AS "primary_cost",
    "base_cost_per_second",
    "unit_cost",
    "cost_factors",
    "is_active",
    "created_at",
    "updated_at"
   FROM "public"."task_types"
  WHERE ("is_active" = true);


ALTER VIEW "public"."task_types_with_billing" OWNER TO "postgres";


COMMENT ON VIEW "public"."task_types_with_billing" IS 'Convenient view showing task types with their primary billing cost based on billing_type';



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



CREATE OR REPLACE VIEW "public"."user_credit_balance" WITH ("security_invoker"='true') AS
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



ALTER TABLE ONLY "public"."referral_sessions"
    ADD CONSTRAINT "referral_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_id_referred_id_key" UNIQUE ("referrer_id", "referred_id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shot_generations"
    ADD CONSTRAINT "shot_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shots"
    ADD CONSTRAINT "shots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_types"
    ADD CONSTRAINT "task_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."task_types"
    ADD CONSTRAINT "task_types_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_credits_ledger_created_at" ON "public"."credits_ledger" USING "btree" ("created_at");



CREATE INDEX "idx_credits_ledger_type" ON "public"."credits_ledger" USING "btree" ("type");



CREATE INDEX "idx_credits_ledger_user_id" ON "public"."credits_ledger" USING "btree" ("user_id");



CREATE INDEX "idx_dependant_on" ON "public"."tasks" USING "btree" ("dependant_on");



CREATE INDEX "idx_generations_params_tool_type" ON "public"."generations" USING "gin" ((("params" -> 'tool_type'::"text"))) WHERE ("params" IS NOT NULL);



COMMENT ON INDEX "public"."idx_generations_params_tool_type" IS 'GIN index for fast tool_type filtering in JSONB params column';



CREATE INDEX "idx_generations_project_created_desc" ON "public"."generations" USING "btree" ("project_id", "created_at" DESC) WHERE ("project_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_generations_project_created_desc" IS 'Primary index for pagination queries - covers project_id filtering and created_at ordering';



CREATE INDEX "idx_generations_project_id" ON "public"."generations" USING "btree" ("project_id");



CREATE INDEX "idx_generations_project_starred" ON "public"."generations" USING "btree" ("project_id", "starred");



CREATE INDEX "idx_generations_project_starred_created" ON "public"."generations" USING "btree" ("project_id", "starred", "created_at" DESC) WHERE (("project_id" IS NOT NULL) AND ("starred" IS NOT NULL));



COMMENT ON INDEX "public"."idx_generations_project_starred_created" IS 'Composite index for starred-only filtering with proper ordering';



CREATE INDEX "idx_generations_project_type_created" ON "public"."generations" USING "btree" ("project_id", "type", "created_at" DESC) WHERE (("project_id" IS NOT NULL) AND ("type" IS NOT NULL));



COMMENT ON INDEX "public"."idx_generations_project_type_created" IS 'Composite index combining project, type, and ordering for complex filters';



CREATE INDEX "idx_generations_prompt_search" ON "public"."generations" USING "gin" ((((("params" -> 'originalParams'::"text") -> 'orchestrator_details'::"text") ->> 'prompt'::"text")) "public"."gin_trgm_ops") WHERE (((("params" -> 'originalParams'::"text") -> 'orchestrator_details'::"text") ->> 'prompt'::"text") IS NOT NULL);



COMMENT ON INDEX "public"."idx_generations_prompt_search" IS 'Trigram GIN index for fast prompt text search using ILIKE queries';



CREATE INDEX "idx_generations_starred" ON "public"."generations" USING "btree" ("starred");



CREATE INDEX "idx_generations_thumbnail_url" ON "public"."generations" USING "btree" ("thumbnail_url") WHERE ("thumbnail_url" IS NOT NULL);



CREATE INDEX "idx_generations_type" ON "public"."generations" USING "btree" ("type") WHERE ("type" IS NOT NULL);



COMMENT ON INDEX "public"."idx_generations_type" IS 'Optimizes video/image filtering in VideoGallery using generation.type LIKE %video%';



CREATE INDEX "idx_generations_type_filter" ON "public"."generations" USING "btree" ("type") WHERE ("type" IS NOT NULL);



COMMENT ON INDEX "public"."idx_generations_type_filter" IS 'Index for video/image type filtering - dramatically speeds up media type filters';



CREATE INDEX "idx_project_status" ON "public"."tasks" USING "btree" ("project_id", "status");



CREATE INDEX "idx_projects_user_id" ON "public"."projects" USING "btree" ("user_id");



CREATE INDEX "idx_referral_sessions_converted_at" ON "public"."referral_sessions" USING "btree" ("converted_at");



CREATE INDEX "idx_referral_sessions_fingerprint" ON "public"."referral_sessions" USING "btree" ("visitor_fingerprint");



CREATE INDEX "idx_referral_sessions_referrer" ON "public"."referral_sessions" USING "btree" ("referrer_username");



CREATE INDEX "idx_referral_sessions_session_id" ON "public"."referral_sessions" USING "btree" ("session_id");



CREATE INDEX "idx_referral_sessions_visitor_unconverted" ON "public"."referral_sessions" USING "btree" ("visitor_fingerprint", "converted_at", "is_latest_referrer") WHERE ("converted_at" IS NULL);



CREATE INDEX "idx_referrals_referred" ON "public"."referrals" USING "btree" ("referred_id");



CREATE INDEX "idx_referrals_referrer" ON "public"."referrals" USING "btree" ("referrer_id");



CREATE INDEX "idx_sg_generation_id" ON "public"."shot_generations" USING "btree" ("generation_id");



CREATE INDEX "idx_sg_shot_id" ON "public"."shot_generations" USING "btree" ("shot_id");



CREATE INDEX "idx_shot_generations_generation_id" ON "public"."shot_generations" USING "btree" ("generation_id");



CREATE INDEX "idx_shot_generations_shot_id_created_at" ON "public"."shot_generations" USING "btree" ("shot_id", "created_at" DESC) WHERE ("created_at" IS NOT NULL);



CREATE INDEX "idx_shot_generations_timeline_frame" ON "public"."shot_generations" USING "btree" ("shot_id", "timeline_frame") WHERE ("timeline_frame" IS NOT NULL);



CREATE INDEX "idx_shots_project_id" ON "public"."shots" USING "btree" ("project_id");



CREATE INDEX "idx_status_created" ON "public"."tasks" USING "btree" ("status", "created_at");



CREATE INDEX "idx_task_types_active" ON "public"."task_types" USING "btree" ("is_active");



CREATE INDEX "idx_task_types_billing_type" ON "public"."task_types" USING "btree" ("billing_type");



CREATE INDEX "idx_task_types_category" ON "public"."task_types" USING "btree" ("category");



CREATE INDEX "idx_task_types_name" ON "public"."task_types" USING "btree" ("name");



CREATE INDEX "idx_task_types_run_type" ON "public"."task_types" USING "btree" ("run_type");



CREATE INDEX "idx_task_types_tool_type" ON "public"."task_types" USING "btree" ("tool_type");



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



CREATE INDEX "idx_users_auto_topup_enabled" ON "public"."users" USING "btree" ("auto_topup_enabled") WHERE ("auto_topup_enabled" = true);



CREATE INDEX "idx_users_auto_topup_threshold" ON "public"."users" USING "btree" ("auto_topup_threshold") WHERE ("auto_topup_enabled" = true);



CREATE INDEX "idx_users_generation_settings" ON "public"."users" USING "gin" (((("settings" -> 'ui'::"text") -> 'generationMethods'::"text")));



CREATE INDEX "idx_users_stripe_customer" ON "public"."users" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_users_username" ON "public"."users" USING "btree" ("username");



CREATE INDEX "idx_workers_last_heartbeat" ON "public"."workers" USING "btree" ("last_heartbeat");



CREATE INDEX "idx_workers_status" ON "public"."workers" USING "btree" ("status");



CREATE INDEX "idx_workers_status_heartbeat" ON "public"."workers" USING "btree" ("status", "last_heartbeat");



CREATE OR REPLACE TRIGGER "auto_create_user_trigger" BEFORE INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_user_before_project"();



CREATE OR REPLACE TRIGGER "auto_topup_trigger" AFTER UPDATE OF "credits" ON "public"."users" FOR EACH ROW WHEN (("old"."credits" IS DISTINCT FROM "new"."credits")) EXECUTE FUNCTION "public"."check_auto_topup_trigger"();



CREATE OR REPLACE TRIGGER "credits_ledger_after_delete" AFTER DELETE ON "public"."credits_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_user_balance"();



CREATE OR REPLACE TRIGGER "credits_ledger_after_insert" AFTER INSERT ON "public"."credits_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_user_balance"();



CREATE OR REPLACE TRIGGER "credits_ledger_after_update" AFTER UPDATE ON "public"."credits_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_user_balance"();



CREATE OR REPLACE TRIGGER "prevent_credit_manipulation" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_direct_credit_updates"();



CREATE OR REPLACE TRIGGER "prevent_timing_manipulation_trigger" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_timing_manipulation"();



CREATE OR REPLACE TRIGGER "trigger_set_shot_position" BEFORE INSERT ON "public"."shots" FOR EACH ROW EXECUTE FUNCTION "public"."set_new_shot_position"();



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credits_ledger"
    ADD CONSTRAINT "credits_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generations"
    ADD CONSTRAINT "generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_sessions"
    ADD CONSTRAINT "referral_sessions_converted_user_id_fkey" FOREIGN KEY ("converted_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."referral_sessions"
    ADD CONSTRAINT "referral_sessions_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."referral_sessions"("id");



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



CREATE POLICY "Allow task claiming for queued tasks" ON "public"."tasks" FOR UPDATE TO "authenticated" USING (("status" = 'Queued'::"public"."task_status")) WITH CHECK (("status" = ANY (ARRAY['Queued'::"public"."task_status", 'In Progress'::"public"."task_status"])));



CREATE POLICY "Allow viewing own project tasks" ON "public"."tasks" FOR SELECT TO "authenticated" USING (("project_id" IN ( SELECT "p"."id"
   FROM "public"."projects" "p"
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "Allow viewing queued tasks for claiming" ON "public"."tasks" FOR SELECT TO "authenticated" USING ((("status" = 'Queued'::"public"."task_status") OR ("status" = 'In Progress'::"public"."task_status")));



CREATE POLICY "Authenticated users can view workers" ON "public"."workers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all access for resource owners" ON "public"."resources" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Projects: service role bypass" ON "public"."projects" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Projects: users access own projects" ON "public"."projects" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Service role can delete credit ledger entries" ON "public"."credits_ledger" FOR DELETE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can delete users" ON "public"."users" FOR DELETE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can do everything on users" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can insert credit ledger entries" ON "public"."credits_ledger" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can insert users" ON "public"."users" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all tasks" ON "public"."tasks" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage workers" ON "public"."workers" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can update credit ledger entries" ON "public"."credits_ledger" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "TaskTypes: authenticated read access" ON "public"."task_types" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") OR ("auth"."role"() = 'service_role'::"text")));



CREATE POLICY "TaskTypes: service role full access" ON "public"."task_types" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



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



CREATE POLICY "Users can update their own auto-top-up settings" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



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



CREATE POLICY "Users can view their own auto-top-up settings" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



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



CREATE POLICY "anon_insert_sessions" ON "public"."referral_sessions" FOR INSERT TO "anon" WITH CHECK (true);



ALTER TABLE "public"."credits_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sg: service role" ON "public"."shot_generations" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "sg: user delete" ON "public"."shot_generations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."shots" "s"
     JOIN "public"."projects" "p" ON (("p"."id" = "s"."project_id")))
  WHERE (("s"."id" = "shot_generations"."shot_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "sg: user insert" ON "public"."shot_generations" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."shots" "s"
     JOIN "public"."projects" "p" ON (("p"."id" = "s"."project_id")))
  WHERE (("s"."id" = "shot_generations"."shot_id") AND ("p"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM ("public"."generations" "g"
     JOIN "public"."projects" "p2" ON (("p2"."id" = "g"."project_id")))
  WHERE (("g"."id" = "shot_generations"."generation_id") AND ("p2"."user_id" = "auth"."uid"())))) AND (( SELECT "s"."project_id"
   FROM "public"."shots" "s"
  WHERE ("s"."id" = "shot_generations"."shot_id")) = ( SELECT "g"."project_id"
   FROM "public"."generations" "g"
  WHERE ("g"."id" = "shot_generations"."generation_id")))));



CREATE POLICY "sg: user select" ON "public"."shot_generations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."shots" "s"
     JOIN "public"."projects" "p" ON (("p"."id" = "s"."project_id")))
  WHERE (("s"."id" = "shot_generations"."shot_id") AND ("p"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM ("public"."generations" "g"
     JOIN "public"."projects" "p2" ON (("p2"."id" = "g"."project_id")))
  WHERE (("g"."id" = "shot_generations"."generation_id") AND ("p2"."user_id" = "auth"."uid"()))))));



CREATE POLICY "sg: user update" ON "public"."shot_generations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."shots" "s"
     JOIN "public"."projects" "p" ON (("p"."id" = "s"."project_id")))
  WHERE (("s"."id" = "shot_generations"."shot_id") AND ("p"."user_id" = "auth"."uid"()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."shots" "s"
     JOIN "public"."projects" "p" ON (("p"."id" = "s"."project_id")))
  WHERE (("s"."id" = "shot_generations"."shot_id") AND ("p"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM ("public"."generations" "g"
     JOIN "public"."projects" "p2" ON (("p2"."id" = "g"."project_id")))
  WHERE (("g"."id" = "shot_generations"."generation_id") AND ("p2"."user_id" = "auth"."uid"())))) AND (( SELECT "s"."project_id"
   FROM "public"."shots" "s"
  WHERE ("s"."id" = "shot_generations"."shot_id")) = ( SELECT "g"."project_id"
   FROM "public"."generations" "g"
  WHERE ("g"."id" = "shot_generations"."generation_id")))));



ALTER TABLE "public"."task_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_data_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_data_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_api_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_view_own_referrals" ON "public"."referrals" FOR SELECT TO "authenticated" USING ((("referrer_id" = "auth"."uid"()) OR ("referred_id" = "auth"."uid"())));



CREATE POLICY "users_view_own_sessions" ON "public"."referral_sessions" FOR SELECT TO "authenticated" USING ((("referrer_user_id" = "auth"."uid"()) OR ("converted_user_id" = "auth"."uid"())));



ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_generation_to_shot"("p_shot_id" "uuid", "p_generation_id" "uuid", "p_with_position" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean, "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean, "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_service_role"("p_include_active" boolean, "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_task_availability_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_task_availability_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_timeline_frames"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_timeline_frames"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_timeline_frames"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."atomic_timeline_update"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."atomic_timeline_update"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."atomic_timeline_update"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_user_before_project"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_user_before_project"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_user_before_project"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_register_worker"("p_worker_id" "text", "p_instance_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."auto_register_worker"("p_worker_id" "text", "p_instance_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_register_worker"("p_worker_id" "text", "p_instance_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_task_status_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_task_status_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_task_status_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_auto_topup_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_auto_topup_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_auto_topup_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_welcome_bonus_eligibility"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_welcome_bonus_eligibility"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_welcome_bonus_eligibility"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean, "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean, "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_task_service_role"("p_worker_id" "text", "p_include_active" boolean, "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_task_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_next_task_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_task_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_task_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_task_with_timing"("p_task_id" "text", "p_output_location" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean, "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean, "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean, "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean, "p_run_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_eligible_tasks_user_pat"("p_user_id" "uuid", "p_include_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_unpositioned_generations"("p_shot_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_referral_from_session"("p_session_id" "text", "p_fingerprint" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_referral_from_session"("p_session_id" "text", "p_fingerprint" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_referral_from_session"("p_session_id" "text", "p_fingerprint" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_shot_with_image"("p_project_id" "uuid", "p_shot_name" "text", "p_generation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_record_if_not_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_record_if_not_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_record_if_not_exists"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_shot_association_from_params"("p_generation_id" "uuid", "p_params" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_shot_association_from_params"("p_generation_id" "uuid", "p_params" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_shot_association_from_params"("p_generation_id" "uuid", "p_params" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."exchange_timeline_frames"("p_shot_id" "uuid", "p_generation_id_a" "uuid", "p_generation_id_b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."exchange_timeline_frames"("p_shot_id" "uuid", "p_generation_id_a" "uuid", "p_generation_id_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exchange_timeline_frames"("p_shot_id" "uuid", "p_generation_id_a" "uuid", "p_generation_id_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."extract_discord_username"("jwt_claims" "jsonb", "user_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."extract_discord_username"("jwt_claims" "jsonb", "user_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_discord_username"("jwt_claims" "jsonb", "user_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_discord_username"("jwt_claims" "jsonb", "user_metadata" "jsonb") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_task_cost"("p_task_type" "text", "p_duration_seconds" integer, "p_unit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_task_cost"("p_task_type" "text", "p_duration_seconds" integer, "p_unit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_task_cost"("p_task_type" "text", "p_duration_seconds" integer, "p_unit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_task_run_type"("p_task_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_task_run_type"("p_task_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_task_run_type"("p_task_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_timeline_frames_for_shot"("p_shot_id" "uuid", "p_frame_spacing" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_timeline_frames_for_shot"("p_shot_id" "uuid", "p_frame_spacing" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_timeline_frames_for_shot"("p_shot_id" "uuid", "p_frame_spacing" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_shot_at_position"("p_project_id" "uuid", "p_shot_name" "text", "p_position" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."insert_shot_at_position"("p_project_id" "uuid", "p_shot_name" "text", "p_position" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_shot_at_position"("p_project_id" "uuid", "p_shot_name" "text", "p_position" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_image_path"("image_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_image_path"("image_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_image_path"("image_path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_image_paths_in_jsonb"("data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."per_user_capacity_stats_service_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."per_user_capacity_stats_service_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."per_user_capacity_stats_service_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."position_existing_generation_in_shot"("p_shot_id" "uuid", "p_generation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_direct_credit_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_direct_credit_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_direct_credit_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_timing_manipulation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_timing_manipulation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_timing_manipulation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_task_result"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_task_result"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_task_result"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_user_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_user_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_insert_task"("p_id" "uuid", "p_project_id" "uuid", "p_task_type" "text", "p_params" "jsonb", "p_status" "text", "p_dependant_on" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_insert_task"("p_id" "uuid", "p_project_id" "uuid", "p_task_type" "text", "p_params" "jsonb", "p_status" "text", "p_dependant_on" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_insert_task"("p_id" "uuid", "p_project_id" "uuid", "p_task_type" "text", "p_params" "jsonb", "p_status" "text", "p_dependant_on" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_update_task_status"("p_task_id" "uuid", "p_status" "text", "p_worker_id" "text", "p_generation_started_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."safe_update_task_status"("p_task_id" "uuid", "p_status" "text", "p_worker_id" "text", "p_generation_started_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_update_task_status"("p_task_id" "uuid", "p_status" "text", "p_worker_id" "text", "p_generation_started_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sanitize_discord_handle"("handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sanitize_discord_handle"("handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_discord_handle"("handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_discord_handle"("handle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_new_shot_position"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_new_shot_position"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_new_shot_position"() TO "service_role";



GRANT ALL ON FUNCTION "public"."timeline_position_sync"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."timeline_position_sync"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."timeline_position_sync"("p_shot_id" "uuid", "p_changes" "jsonb", "p_update_positions" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."timeline_sync_bulletproof"("shot_uuid" "uuid", "frame_changes" "jsonb", "should_update_positions" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."timeline_sync_bulletproof"("shot_uuid" "uuid", "frame_changes" "jsonb", "should_update_positions" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."timeline_sync_bulletproof"("shot_uuid" "uuid", "frame_changes" "jsonb", "should_update_positions" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."track_referral_visit"("p_referrer_username" "text", "p_visitor_fingerprint" "text", "p_session_id" "text", "p_visitor_ip" "inet") TO "anon";
GRANT ALL ON FUNCTION "public"."track_referral_visit"("p_referrer_username" "text", "p_visitor_fingerprint" "text", "p_session_id" "text", "p_visitor_ip" "inet") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_referral_visit"("p_referrer_username" "text", "p_visitor_fingerprint" "text", "p_session_id" "text", "p_visitor_ip" "inet") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_api_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_api_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_api_token"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_referral_security"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_referral_security"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_referral_security"() TO "service_role";



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



GRANT ALL ON TABLE "public"."referral_sessions" TO "anon";
GRANT ALL ON TABLE "public"."referral_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."referral_stats" TO "anon";
GRANT ALL ON TABLE "public"."referral_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_stats" TO "service_role";



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



GRANT ALL ON TABLE "public"."task_queue_analysis" TO "anon";
GRANT ALL ON TABLE "public"."task_queue_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."task_queue_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."task_types" TO "anon";
GRANT ALL ON TABLE "public"."task_types" TO "authenticated";
GRANT ALL ON TABLE "public"."task_types" TO "service_role";



GRANT ALL ON TABLE "public"."task_types_with_billing" TO "anon";
GRANT ALL ON TABLE "public"."task_types_with_billing" TO "authenticated";
GRANT ALL ON TABLE "public"."task_types_with_billing" TO "service_role";



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
