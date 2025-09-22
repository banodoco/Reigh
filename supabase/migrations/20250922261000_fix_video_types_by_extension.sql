-- Fix generation types based on file extensions
-- Update generations with video file extensions to type = 'video'

CREATE OR REPLACE FUNCTION fix_video_types_by_extension()
RETURNS void AS $$
DECLARE
  updated_count INTEGER := 0;
  r RECORD;
BEGIN
  RAISE NOTICE 'Starting video type correction based on file extensions...';

  -- Update generations to type = 'video' where location has video file extensions
  UPDATE public.generations
  SET type = 'video', updated_at = NOW()
  WHERE type != 'video' OR type IS NULL
    AND location IS NOT NULL
    AND (
      LOWER(location) LIKE '%.mp4' OR
      LOWER(location) LIKE '%.mov' OR
      LOWER(location) LIKE '%.avi' OR
      LOWER(location) LIKE '%.mkv' OR
      LOWER(location) LIKE '%.webm' OR
      LOWER(location) LIKE '%.m4v' OR
      LOWER(location) LIKE '%.flv' OR
      LOWER(location) LIKE '%.wmv' OR
      LOWER(location) LIKE '%.3gp' OR
      LOWER(location) LIKE '%.ogv'
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count > 0 THEN
    RAISE NOTICE 'Updated % generations to type = ''video'' based on file extensions', updated_count;
    
    -- Show sample of what was updated
    RAISE NOTICE 'Sample of updated generations:';
    FOR r IN 
      SELECT id, location, type, updated_at
      FROM public.generations 
      WHERE type = 'video' 
        AND updated_at > NOW() - INTERVAL '1 minute'
      ORDER BY updated_at DESC
      LIMIT 5
    LOOP
      RAISE NOTICE '  ID: %, Location: %, Type: %, Updated: %', 
        r.id, r.location, r.type, r.updated_at;
    END LOOP;
  ELSE
    RAISE NOTICE 'No generations needed type correction - all video files already properly typed';
  END IF;

  RAISE NOTICE 'Video type correction completed!';
END;
$$ LANGUAGE plpgsql;

-- Execute the type correction
SELECT fix_video_types_by_extension();

-- Drop the function after use
DROP FUNCTION fix_video_types_by_extension();
