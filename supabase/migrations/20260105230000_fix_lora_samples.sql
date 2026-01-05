-- Migration: Fix sample images for Z-Image LoRAs with correct Model IDs

-- 1. Update Panyue Style with sample image (correct Model ID)
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'Images', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/MGRI/Z-Image-Turbo-Panyue-Lora/resolve/main/1.png', 'alt_text', 'Panyue character sample')
    ),
    'sample_generations', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/MGRI/Z-Image-Turbo-Panyue-Lora/resolve/main/1.png', 'type', 'image', 'alt_text', 'Panyue character sample')
    ),
    'main_generation', 'https://huggingface.co/MGRI/Z-Image-Turbo-Panyue-Lora/resolve/main/1.png'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'panyue_z_image_turbo';

-- 2. Update Tarot Card Style with trigger word (correct Model ID)
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'trigger_word', 'trtcrd'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'tarot_z_image';

-- Note: The following LoRAs have gated HuggingFace repos without public sample images:
-- - Nyx Dark Aesthetic (nyx_z_image)
-- - Rebel Imagine (rebel_imagine_z_image)
-- - Rebel Midjourney (rebel_midjourney_z_image)
-- - Laavu Style (laavu_z_image)
-- - Tarot Card Style (tarot_z_image) - trigger word added but no samples available
-- These LoRAs will display without preview images until manually updated.
