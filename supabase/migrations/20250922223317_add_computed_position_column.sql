-- Add computed position column based on timeline_frame ordering
-- This eliminates the dual ordering system and makes timeline_frame the single source of truth

-- First, let's add a function to calculate position from timeline_frame
CREATE OR REPLACE FUNCTION calculate_position_from_timeline_frame(
  p_shot_id uuid,
  p_timeline_frame integer
) RETURNS integer AS $$
BEGIN
  -- Return the rank (1-based position) of this timeline_frame within the shot
  RETURN (
    SELECT COALESCE(
      (SELECT COUNT(*) + 1 
       FROM shot_generations sg2 
       WHERE sg2.shot_id = p_shot_id 
         AND sg2.timeline_frame IS NOT NULL 
         AND sg2.timeline_frame < p_timeline_frame),
      1
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_position_from_timeline_frame(uuid, integer) TO authenticated;

-- Add a computed column that calculates position from timeline_frame
-- Note: PostgreSQL doesn't support computed columns directly, so we'll use a view approach
-- But first, let's add a helper function to get the computed position for any row

CREATE OR REPLACE FUNCTION get_computed_position(
  p_shot_id uuid,
  p_timeline_frame integer
) RETURNS integer AS $$
BEGIN
  -- If timeline_frame is null, return a high number to put it at the end
  IF p_timeline_frame IS NULL THEN
    RETURN 9999;
  END IF;
  
  -- Calculate position as rank within the shot ordered by timeline_frame
  RETURN (
    SELECT ROW_NUMBER() OVER (ORDER BY timeline_frame ASC, created_at ASC)
    FROM shot_generations 
    WHERE shot_id = p_shot_id 
      AND timeline_frame IS NOT NULL
      AND timeline_frame <= p_timeline_frame
      AND id IN (
        SELECT id FROM shot_generations 
        WHERE shot_id = p_shot_id AND timeline_frame = p_timeline_frame
        LIMIT 1
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions  
GRANT EXECUTE ON FUNCTION get_computed_position(uuid, integer) TO authenticated;

-- Create a view that includes the computed position
CREATE OR REPLACE VIEW shot_generations_with_computed_position AS
SELECT 
  sg.*,
  -- Computed position based on timeline_frame ordering
  CASE 
    WHEN sg.timeline_frame IS NULL THEN 9999
    ELSE ROW_NUMBER() OVER (
      PARTITION BY sg.shot_id 
      ORDER BY sg.timeline_frame ASC, sg.created_at ASC
    )
  END as computed_position
FROM shot_generations sg;

-- Grant access to the view
GRANT SELECT ON shot_generations_with_computed_position TO authenticated;

-- Verify the migration
SELECT 'Added computed position column based on timeline_frame ordering' as status;
