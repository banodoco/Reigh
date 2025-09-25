-- Fix remaining ambiguous column references in fix_timeline_spacing function
-- Replace the function to ensure all ambiguous 'id' references are resolved

DROP FUNCTION IF EXISTS fix_timeline_spacing(UUID);

CREATE OR REPLACE FUNCTION fix_timeline_spacing(p_shot_id UUID)
RETURNS TABLE (
  id UUID,
  generation_id UUID,
  old_timeline_frame INTEGER,
  new_timeline_frame INTEGER,
  updated BOOLEAN,
  violation_type TEXT,
  details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item_record RECORD;
  total_items INTEGER;
  context_frames INTEGER;
  max_allowed_frame INTEGER;
  total_updates INTEGER := 0;
  adjustment INTEGER;
  first_frame INTEGER;
BEGIN
  RAISE LOG 'fix_timeline_spacing: Starting violation-only fix for shot %', p_shot_id;
  
  -- Create temporary working table with eligible items
  CREATE TEMP TABLE temp_eligible_items AS
  SELECT sg.id as shot_gen_id, sg.generation_id, sg.timeline_frame, sg.metadata, sg.created_at,
         ROW_NUMBER() OVER (ORDER BY sg.timeline_frame ASC, sg.created_at ASC) as item_order
  FROM shot_generations sg
  JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = p_shot_id
    AND sg.timeline_frame IS NOT NULL
    AND g.type = 'image'
  ORDER BY sg.timeline_frame ASC, sg.created_at ASC;
  
  SELECT COUNT(*) INTO total_items FROM temp_eligible_items;
  
  IF total_items = 0 THEN
    RAISE LOG 'fix_timeline_spacing: No eligible items found for shot %', p_shot_id;
    DROP TABLE temp_eligible_items;
    RETURN;
  END IF;
  
  -- Calculate context frame limit: 81 - number of items
  context_frames := total_items;
  max_allowed_frame := 81 - context_frames;
  
  RAISE LOG 'fix_timeline_spacing: Processing % items, max_allowed_frame = % (81 - %)', 
    total_items, max_allowed_frame, context_frames;
  
  -- VIOLATION 1: First frame must be at 0
  SELECT timeline_frame INTO first_frame FROM temp_eligible_items WHERE item_order = 1;
  
  IF first_frame != 0 THEN
    adjustment := first_frame;
    RAISE LOG 'fix_timeline_spacing: FIRST FRAME VIOLATION - shifting all frames down by %', adjustment;
    
    -- Update all items by shifting down
    FOR item_record IN 
      SELECT * FROM temp_eligible_items ORDER BY item_order
    LOOP
      UPDATE shot_generations
      SET 
        timeline_frame = GREATEST(0, item_record.timeline_frame - adjustment),
        metadata = COALESCE(metadata, '{}'::jsonb) || '{"auto_resolved": true}'::jsonb,
        updated_at = NOW()
      WHERE shot_generations.id = item_record.shot_gen_id;
      
      total_updates := total_updates + 1;
      
      -- Return update record
      id := item_record.shot_gen_id;
      generation_id := item_record.generation_id;
      old_timeline_frame := item_record.timeline_frame;
      new_timeline_frame := GREATEST(0, item_record.timeline_frame - adjustment);
      updated := true;
      violation_type := 'first_frame_fix';
      details := format('shifted down by %s', adjustment);
      RETURN NEXT;
      
      -- Update temp table for subsequent processing
      UPDATE temp_eligible_items 
      SET timeline_frame = GREATEST(0, timeline_frame - adjustment)
      WHERE shot_gen_id = item_record.shot_gen_id;
    END LOOP;
  END IF;
  
  -- VIOLATION 2 & 3: Process distance and duplicate violations
  -- Re-read the temp table with updated values and process sequentially
  FOR item_record IN 
    SELECT t1.*, 
           LAG(t1.timeline_frame) OVER (ORDER BY t1.item_order) as prev_timeline_frame
    FROM temp_eligible_items t1 
    ORDER BY t1.item_order
  LOOP
    -- VIOLATION 2: Distance too large (exceeds context frame limit)
    IF item_record.timeline_frame > max_allowed_frame THEN
      adjustment := item_record.timeline_frame - max_allowed_frame;
      RAISE LOG 'fix_timeline_spacing: DISTANCE VIOLATION - frame % exceeds limit %, reducing by %', 
        item_record.timeline_frame, max_allowed_frame, adjustment;
      
      -- Update this item and all subsequent items
      UPDATE shot_generations
      SET 
        timeline_frame = GREATEST(0, timeline_frame - adjustment),
        metadata = COALESCE(metadata, '{}'::jsonb) || '{"auto_resolved": true}'::jsonb,
        updated_at = NOW()
      WHERE shot_generations.id IN (
        SELECT t.shot_gen_id FROM temp_eligible_items t 
        WHERE t.item_order >= item_record.item_order
      );
      
      -- Return update records for affected items
      DECLARE
        affected_record RECORD;
        current_order INTEGER := item_record.item_order;
      BEGIN
        FOR affected_record IN 
          SELECT * FROM temp_eligible_items 
          WHERE item_order >= current_order
          ORDER BY item_order
        LOOP
          total_updates := total_updates + 1;
          
          id := affected_record.shot_gen_id;
          generation_id := affected_record.generation_id;
          old_timeline_frame := affected_record.timeline_frame;
          new_timeline_frame := GREATEST(0, affected_record.timeline_frame - adjustment);
          updated := true;
          violation_type := 'distance_fix';
          details := format('reduced by %s (exceeded limit %s)', adjustment, max_allowed_frame);
          RETURN NEXT;
        END LOOP;
      END;
      
      -- Update temp table for subsequent processing
      UPDATE temp_eligible_items 
      SET timeline_frame = GREATEST(0, timeline_frame - adjustment)
      WHERE item_order >= item_record.item_order;
      
      EXIT; -- Exit loop since we've processed all remaining items
    END IF;
    
    -- VIOLATION 3: Duplicate frame (same timeline_frame as previous item)
    IF item_record.prev_timeline_frame IS NOT NULL 
       AND item_record.timeline_frame = item_record.prev_timeline_frame THEN
      
      adjustment := 10; -- Move duplicate +10 from current position
      RAISE LOG 'fix_timeline_spacing: DUPLICATE VIOLATION - frame % conflicts with previous %, moving by +%', 
        item_record.timeline_frame, item_record.prev_timeline_frame, adjustment;
      
      -- Update this item and all subsequent items
      UPDATE shot_generations
      SET 
        timeline_frame = timeline_frame + adjustment,
        metadata = COALESCE(metadata, '{}'::jsonb) || '{"auto_resolved": true}'::jsonb,
        updated_at = NOW()
      WHERE shot_generations.id IN (
        SELECT t.shot_gen_id FROM temp_eligible_items t 
        WHERE t.item_order >= item_record.item_order
      );
      
      -- Return update records for affected items
      DECLARE
        affected_record RECORD;
        current_order INTEGER := item_record.item_order;
        prev_frame INTEGER := item_record.prev_timeline_frame;
      BEGIN
        FOR affected_record IN 
          SELECT * FROM temp_eligible_items 
          WHERE item_order >= current_order
          ORDER BY item_order
        LOOP
          total_updates := total_updates + 1;
          
          id := affected_record.shot_gen_id;
          generation_id := affected_record.generation_id;
          old_timeline_frame := affected_record.timeline_frame;
          new_timeline_frame := affected_record.timeline_frame + adjustment;
          updated := true;
          violation_type := 'duplicate_fix';
          details := format('moved +%s (duplicate at %s)', adjustment, prev_frame);
          RETURN NEXT;
        END LOOP;
      END;
      
      -- Update temp table for subsequent processing
      UPDATE temp_eligible_items 
      SET timeline_frame = timeline_frame + adjustment
      WHERE item_order >= item_record.item_order;
    END IF;
  END LOOP;
  
  -- Clean up
  DROP TABLE temp_eligible_items;
  
  RAISE LOG 'fix_timeline_spacing: Completed shot % with % total updates', p_shot_id, total_updates;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION fix_timeline_spacing(UUID) TO authenticated;

-- Add comment to document the function
COMMENT ON FUNCTION fix_timeline_spacing(UUID) IS 
'Fixes timeline violations for a specific shot using violation-only strategy. Only processes image generations with existing timeline_frame values. Fixes: 1) First frame normalization (must be 0), 2) Distance violations (frame > 81-context_frames), 3) Duplicate violations (+10 spacing). Cascades adjustments to maintain alignment. Returns details of all fixes applied.';
