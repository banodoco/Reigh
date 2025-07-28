-- Add created_at column to shot_generations first
ALTER TABLE shot_generations 
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Update existing records to have created_at from their generation
UPDATE shot_generations sg
SET created_at = g.created_at
FROM generations g
WHERE sg.generation_id = g.id
  AND sg.created_at IS NULL;

-- Add indexes for better performance with large datasets
CREATE INDEX IF NOT EXISTS idx_shot_generations_shot_id_position
  ON shot_generations (shot_id, position);

CREATE INDEX IF NOT EXISTS idx_shot_generations_shot_id_created_at
  ON shot_generations (shot_id, created_at DESC)
  WHERE created_at IS NOT NULL;

-- Create function to count unpositioned non-video generations
CREATE OR REPLACE FUNCTION count_unpositioned_generations(p_shot_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM shot_generations sg
  JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = p_shot_id
    AND sg.position IS NULL
    AND (g.type IS NULL OR g.type NOT LIKE '%video%');
$$;

-- Create a view for shot statistics (optional but useful)
CREATE OR REPLACE VIEW shot_statistics AS
SELECT 
  s.id as shot_id,
  s.project_id,
  COUNT(sg.id) as total_generations,
  COUNT(sg.id) FILTER (WHERE sg.position IS NOT NULL) as positioned_count,
  COUNT(sg.id) FILTER (WHERE sg.position IS NULL AND (g.type IS NULL OR g.type NOT LIKE '%video%')) as unpositioned_count,
  COUNT(sg.id) FILTER (WHERE g.type LIKE '%video%') as video_count
FROM shots s
LEFT JOIN shot_generations sg ON sg.shot_id = s.id
LEFT JOIN generations g ON g.id = sg.generation_id
GROUP BY s.id, s.project_id;

-- Grant appropriate permissions
GRANT SELECT ON shot_statistics TO authenticated; 