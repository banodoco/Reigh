-- Remove duplicate generations that have the same output location
-- Keep only the oldest generation for each unique output location

WITH duplicates_to_delete AS (
  SELECT id
  FROM (
    SELECT id, 
           location,
           ROW_NUMBER() OVER (
             PARTITION BY location 
             ORDER BY created_at ASC
           ) AS row_num
    FROM generations
    WHERE location IS NOT NULL
  ) ranked
  WHERE row_num > 1
)
DELETE FROM generations 
WHERE id IN (SELECT id FROM duplicates_to_delete);

-- Also remove any orphaned shot_generations that reference deleted generations
DELETE FROM shot_generations 
WHERE generation_id NOT IN (SELECT id FROM generations); 