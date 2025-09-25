-- Create function to batch update timeline positions
-- This avoids the infinite loop issue by doing all updates in a single transaction

CREATE OR REPLACE FUNCTION batch_update_timeline_positions(
  updates JSONB
)
RETURNS TABLE (
  id UUID,
  generation_id UUID,
  timeline_frame INTEGER,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  update_record RECORD;
  affected_rows INTEGER := 0;
BEGIN
  -- Log the batch update start
  RAISE LOG 'batch_update_timeline_positions: Starting batch update with % records', jsonb_array_length(updates);
  
  -- Process each update in the batch
  FOR update_record IN 
    SELECT 
      (value->>'id')::UUID as record_id,
      (value->>'timeline_frame')::INTEGER as new_frame
    FROM jsonb_array_elements(updates) AS value
  LOOP
    BEGIN
      -- First clear user_positioned flag to bypass any triggers
      UPDATE shot_generations 
      SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"user_positioned": false, "auto_resolved": true}'::jsonb
      WHERE id = update_record.record_id;
      
      -- Then update the timeline_frame
      UPDATE shot_generations 
      SET timeline_frame = update_record.new_frame
      WHERE id = update_record.record_id;
      
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      
      IF affected_rows > 0 THEN
        -- Return success record
        SELECT sg.id, sg.generation_id, sg.timeline_frame, true, null
        FROM shot_generations sg
        WHERE sg.id = update_record.record_id
        INTO id, generation_id, timeline_frame, success, error_message;
        
        RETURN NEXT;
        
        RAISE LOG 'batch_update_timeline_positions: Successfully updated record % to frame %', 
          update_record.record_id, update_record.new_frame;
      ELSE
        -- Return error record
        id := update_record.record_id;
        generation_id := null;
        timeline_frame := update_record.new_frame;
        success := false;
        error_message := 'No rows affected';
        RETURN NEXT;
        
        RAISE LOG 'batch_update_timeline_positions: Failed to update record % - no rows affected', 
          update_record.record_id;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Return error record
      id := update_record.record_id;
      generation_id := null;
      timeline_frame := update_record.new_frame;
      success := false;
      error_message := SQLERRM;
      RETURN NEXT;
      
      RAISE LOG 'batch_update_timeline_positions: Error updating record %: %', 
        update_record.record_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE LOG 'batch_update_timeline_positions: Batch update complete';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION batch_update_timeline_positions(JSONB) TO authenticated;
