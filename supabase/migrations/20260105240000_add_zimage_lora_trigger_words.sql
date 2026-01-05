-- Migration: Add trigger words to Z-Image LoRAs

-- Pixel Art Style - trigger: "Pixel art style."
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'Pixel art style.')
WHERE type = 'lora' AND metadata->>'Model ID' = 'pixel_art_style_z_image_turbo';

-- Classic Painting - trigger: "class1cpa1nt"
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'class1cpa1nt')
WHERE type = 'lora' AND metadata->>'Model ID' = 'classic_painting_z_image_turbo';

-- Vintage Comic Style - trigger: "St652yl3"
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'St652yl3')
WHERE type = 'lora' AND metadata->>'Model ID' = 'vintage_comic_style_z_image';

-- Realism - trigger: "Realism"
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'Realism')
WHERE type = 'lora' AND metadata->>'Model ID' = 'realism_z_image_turbo';

-- D-ART Fantasy - trigger: "D-ART"
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'D-ART')
WHERE type = 'lora' AND metadata->>'Model ID' = 'd_art_z_image_turbo';

-- Sunbleached Photograph - trigger: "Act1vate!" (same as Behind Reeded Glass)
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'Act1vate!')
WHERE type = 'lora' AND metadata->>'Model ID' = 'sunbleached_photograph_z_image_turbo';

-- Reversal Film Gravure - trigger: "Reversal Film Gravure"
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'Reversal Film Gravure')
WHERE type = 'lora' AND metadata->>'Model ID' = 'reversal_film_gravure_z_image_turbo';

-- Panyue Style - trigger: "Panyue"
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'Panyue')
WHERE type = 'lora' AND metadata->>'Model ID' = 'panyue_z_image_turbo';

-- Elusarca Anime Style - trigger: "elusarca anime style"
UPDATE resources
SET metadata = metadata || jsonb_build_object('trigger_word', 'elusarca anime style')
WHERE type = 'lora' AND metadata->>'Model ID' = 'elusarca_anime_style_z_image';

-- The following LoRAs do NOT need trigger words (documented as "no trigger word needed"):
-- - 3D MMORPG Style (not documented)
-- - Childrens Drawings (no trigger needed)
-- - Pencil Sketch (no trigger needed)
-- - Studio Ghibli Style (no trigger needed)
-- - Arcane Style (no trigger needed)
-- - Archer Animation Style (no trigger needed)
-- - Blue Eye Samurai Style (no trigger needed)
-- - Dan Mumford Style (no trigger needed)
-- - LogC4 Film Color Grade (no trigger needed)
