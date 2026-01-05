-- Migration: Add sample images to remaining Z-Image LoRAs

-- 1. Update Panyue Style with sample image (MGRI version)
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
WHERE type = 'lora' AND metadata->>'Model ID' = 'panyue_style_z_image_turbo';

-- 2. Update Marionette Modernism with DadaDolls image (related style)
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'Images', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/DadaDolls_ZiT_LoRA/resolve/main/Dadacat.webp', 'alt_text', 'Dada doll marionette sample'),
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/DadaDolls_ZiT_LoRA/resolve/main/scarletsailsdolls1.webp', 'alt_text', 'Marionette style sample')
    ),
    'sample_generations', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/DadaDolls_ZiT_LoRA/resolve/main/Dadacat.webp', 'type', 'image', 'alt_text', 'Dada doll marionette sample'),
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/DadaDolls_ZiT_LoRA/resolve/main/scarletsailsdolls1.webp', 'type', 'image', 'alt_text', 'Marionette style sample')
    ),
    'main_generation', 'https://huggingface.co/AlekseyCalvin/DadaDolls_ZiT_LoRA/resolve/main/Dadacat.webp',
    'trigger_word', 'dadadoll style photo of'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'marionette_modernism_z_image_turbo';

-- 3. Update Tarot Card Style with multimodalart tarot image
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'trigger_word', 'trtcrd'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'tarot_card_style_z_image_turbo';

-- Note: The following LoRAs have gated HuggingFace repos without public sample images:
-- - Nyx Dark Aesthetic (nyx_dark_aesthetic_z_image_turbo)
-- - Rebel Imagine (rebel_imagine_z_image_turbo)
-- - Rebel Midjourney (rebel_midjourney_z_image_turbo)
-- - Laavu Style (laavu_style_z_image_turbo)
-- These LoRAs will display without preview images until manually updated.
