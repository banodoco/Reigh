-- ============================================================================
-- Server-side shot duplication function
-- RUN THIS IN SUPABASE SQL EDITOR
-- ============================================================================

CREATE OR REPLACE FUNCTION duplicate_shot_generations(
  p_source_shot_id UUID,
  p_target_shot_id UUID
)
RETURNS TABLE(
  inserted_count INTEGER,
  skipped_videos INTEGER,
  skipped_unpositioned INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted_count INTEGER;
  v_total_count INTEGER;
  v_video_count INTEGER;
  v_unpositioned_count INTEGER;
BEGIN
  -- Count total shot_generations in source shot
  SELECT COUNT(*) INTO v_total_count
  FROM shot_generations
  WHERE shot_id = p_source_shot_id;
  
  -- Count videos (will be skipped)
  SELECT COUNT(*) INTO v_video_count
  FROM shot_generations sg
  INNER JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = p_source_shot_id
    AND (
      g.type = 'video_travel_output' 
      OR g.location LIKE '%.mp4'
    );
  
  -- Count unpositioned items (will be skipped)
  SELECT COUNT(*) INTO v_unpositioned_count
  FROM shot_generations
  WHERE shot_id = p_source_shot_id
    AND timeline_frame IS NULL;
  
  -- Copy positioned, non-video shot_generations
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
  SELECT 
    p_target_shot_id,
    sg.generation_id,
    sg.timeline_frame,
    sg.metadata
  FROM shot_generations sg
  INNER JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = p_source_shot_id
    AND sg.timeline_frame IS NOT NULL  -- Only positioned
    AND g.type != 'video_travel_output'  -- Exclude videos
    AND (g.location IS NULL OR NOT g.location LIKE '%.mp4')  -- Exclude mp4s
  ORDER BY sg.timeline_frame ASC;
  
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  
  -- Return stats
  RETURN QUERY SELECT 
    v_inserted_count,
    v_video_count,
    v_unpositioned_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION duplicate_shot_generations(UUID, UUID) TO authenticated;

SELECT '✅ Server-side duplication function created!' AS status;
SELECT 'Now shot duplication will be instant for any size (1, 1000, 10000+ items)' AS info;

