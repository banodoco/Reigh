-- Create view for fast final video lookup per shot
-- This replaces the 3-query approach in useSegmentOutputsForShot with a single indexed query

CREATE OR REPLACE VIEW shot_final_videos AS
SELECT DISTINCT ON (g.id)
  g.id,
  g.location,
  g.thumbnail_url,
  g.type,
  g.created_at,
  g.updated_at,
  g.params,
  g.starred,
  g.project_id,
  sg.shot_id
FROM generations g
JOIN shot_generations sg ON sg.generation_id = g.id
WHERE g.type = 'video'
  AND g.parent_generation_id IS NULL
  AND (
    -- Has orchestrator_details (travel output)
    g.params->'orchestrator_details' IS NOT NULL
    -- OR has children (parent of segments)
    OR EXISTS (SELECT 1 FROM generations c WHERE c.parent_generation_id = g.id)
  );

-- Grant access
GRANT SELECT ON shot_final_videos TO authenticated;

-- Add comment
COMMENT ON VIEW shot_final_videos IS
'Final/parent video generations for each shot. Used by FinalVideoSection for fast lookup.
Includes videos that have orchestrator_details OR have child segments.';

-- Create index to speed up the EXISTS subquery (if not already exists)
CREATE INDEX IF NOT EXISTS idx_generations_parent_generation_id
ON generations(parent_generation_id)
WHERE parent_generation_id IS NOT NULL;
