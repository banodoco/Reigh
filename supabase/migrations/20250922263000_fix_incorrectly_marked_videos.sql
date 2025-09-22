-- URGENT FIX: Correct generations that were incorrectly marked as video
-- Revert image files back to type = 'image' and only keep actual video files as type = 'video'

CREATE OR REPLACE FUNCTION fix_incorrectly_marked_videos()
RETURNS void AS $$
DECLARE
  image_corrected_count INTEGER := 0;
  video_kept_count INTEGER := 0;
  r RECORD;
BEGIN
  RAISE NOTICE 'URGENT FIX: Correcting incorrectly marked video types...';

  -- First, revert image files back to type = 'image'
  UPDATE public.generations
  SET type = 'image', updated_at = NOW()
  WHERE type = 'video'
    AND location IS NOT NULL
    AND (
      LOWER(location) LIKE '%.png' OR
      LOWER(location) LIKE '%.jpg' OR
      LOWER(location) LIKE '%.jpeg' OR
      LOWER(location) LIKE '%.gif' OR
      LOWER(location) LIKE '%.bmp' OR
      LOWER(location) LIKE '%.tiff' OR
      LOWER(location) LIKE '%.tif' OR
      LOWER(location) LIKE '%.webp' OR
      LOWER(location) LIKE '%.svg' OR
      LOWER(location) LIKE '%.ico' OR
      LOWER(location) LIKE '%.heic' OR
      LOWER(location) LIKE '%.heif'
    );

  GET DIAGNOSTICS image_corrected_count = ROW_COUNT;
  RAISE NOTICE 'Corrected % image files back to type = ''image''', image_corrected_count;

  -- Now ensure only ACTUAL video files are marked as video
  UPDATE public.generations
  SET type = 'video', updated_at = NOW()
  WHERE (type != 'video' OR type IS NULL)
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

  GET DIAGNOSTICS video_kept_count = ROW_COUNT;
  RAISE NOTICE 'Ensured % actual video files are marked as type = ''video''', video_kept_count;

  -- Show sample of corrected image files
  IF image_corrected_count > 0 THEN
    RAISE NOTICE 'Sample of corrected image files:';
    FOR r IN 
      SELECT id, location, type, updated_at
      FROM public.generations 
      WHERE type = 'image' 
        AND updated_at > NOW() - INTERVAL '1 minute'
      ORDER BY updated_at DESC
      LIMIT 5
    LOOP
      RAISE NOTICE '  ID: %, Location: %, Type: %, Updated: %', 
        r.id, r.location, r.type, r.updated_at;
    END LOOP;
  END IF;

  -- Show sample of actual video files
  IF video_kept_count > 0 THEN
    RAISE NOTICE 'Sample of actual video files:';
    FOR r IN 
      SELECT id, location, type, updated_at
      FROM public.generations 
      WHERE type = 'video' 
        AND updated_at > NOW() - INTERVAL '1 minute'
      ORDER BY updated_at DESC
      LIMIT 3
    LOOP
      RAISE NOTICE '  ID: %, Location: %, Type: %, Updated: %', 
        r.id, r.location, r.type, r.updated_at;
    END LOOP;
  END IF;

  RAISE NOTICE 'Type correction completed!';
  RAISE NOTICE 'Summary: Fixed % image files, Confirmed % video files', image_corrected_count, video_kept_count;
END;
$$ LANGUAGE plpgsql;

-- Execute the correction
SELECT fix_incorrectly_marked_videos();

-- Drop the function after use
DROP FUNCTION fix_incorrectly_marked_videos();
