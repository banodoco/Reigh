-- Replace the violation-specific fix with optimal positioning
-- When ANY violation is detected, reposition ALL items to 0, 50, 100, 150... spacing

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
  frame_spacing INTEGER := 50;
  target_frame INTEGER;
BEGIN
  RAISE LOG 'fix_timeline_spacing: Starting optimal positioning for shot %', p_shot_id;
  
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
  
  -- STRATEGY: Optimal positioning - assign 0, 50, 100, 150... to all items
  -- This fixes ALL violations at once: duplicates, first frame, distance
  
  FOR item_record IN 
    SELECT * FROM temp_eligible_items ORDER BY item_order
  LOOP
    -- Calculate optimal frame: (item_order - 1) * 50
    target_frame := (item_record.item_order - 1) * frame_spacing;
    
    -- Ensure we don't exceed the context frame limit
    IF target_frame > max_allowed_frame AND max_allowed_frame > 0 THEN
      -- If we exceed limit and have positive space, use compact spacing
      target_frame := (item_record.item_order - 1) * GREATEST(1, max_allowed_frame / (total_items - 1));
    ELSIF max_allowed_frame <= 0 THEN
      -- If max_allowed_frame is negative/zero, too many items - use minimal spacing
      target_frame := (item_record.item_order - 1);
    END IF;
    
    -- Only update if the frame actually changes
    IF item_record.timeline_frame != target_frame THEN
      UPDATE shot_generations
      SET 
        timeline_frame = target_frame,
        metadata = COALESCE(metadata, '{}'::jsonb) || '{"auto_resolved": true}'::jsonb,
        updated_at = NOW()
      WHERE shot_generations.id = item_record.shot_gen_id;
      
      total_updates := total_updates + 1;
      
      -- Return update record
      id := item_record.shot_gen_id;
      generation_id := item_record.generation_id;
      old_timeline_frame := item_record.timeline_frame;
      new_timeline_frame := target_frame;
      updated := true;
      violation_type := 'optimal_positioning';
      details := format('repositioned to optimal frame %s (order %s)', target_frame, item_record.item_order);
      RETURN NEXT;
      
      RAISE LOG 'fix_timeline_spacing: Repositioned generation % from frame % to %',
        item_record.generation_id, item_record.timeline_frame, target_frame;
    ELSE
      -- Return unchanged record
      id := item_record.shot_gen_id;
      generation_id := item_record.generation_id;
      old_timeline_frame := item_record.timeline_frame;
      new_timeline_frame := item_record.timeline_frame;
      updated := false;
      violation_type := 'already_optimal';
      details := format('already at optimal frame %s', target_frame);
      RETURN NEXT;
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
'Fixes timeline violations using optimal positioning strategy. Repositions ALL eligible items (image generations with existing timeline_frame) to 0, 50, 100, 150... spacing. This fixes duplicates, first frame issues, and distance violations simultaneously. Returns details of all changes applied.';
