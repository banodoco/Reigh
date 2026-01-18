-- Migration: Add Qwen Image LoRAs to Qwen Edit category
-- These artistic/style LoRAs work with Qwen Edit and should be visible in the edit LoRA selector

DO $$
DECLARE
    system_user_id uuid;
BEGIN
    -- Get system user
    SELECT id INTO system_user_id FROM users WHERE email LIKE '%@anthropic.com' OR email LIKE '%admin%' LIMIT 1;
    IF system_user_id IS NULL THEN
        SELECT id INTO system_user_id FROM users LIMIT 1;
    END IF;
    IF system_user_id IS NULL THEN
        RAISE NOTICE 'No users found, skipping';
        RETURN;
    END IF;

    -- Raena Anime Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_raena_anime',
            'Name', 'Raena Anime',
            'Author', 'Raelina',
            'Description', 'High-quality anime style trained on 500 hand-picked images. Produces sharper details, richer colors, and better aesthetics.',
            'lora_type', 'Qwen Edit',
            'Downloads', 160,
            'Tags', array['anime', 'illustration', 'high-quality', 'style'],
            'trigger_word', 'Anime illustration of',
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'raena_qwen_image_lora_v0.1_diffusers_fix.safetensors',
                'url', 'https://huggingface.co/Raelina/Raena-Qwen-Image/resolve/main/raena_qwen_image_lora_v0.1_diffusers_fix.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/64b24543eec33e27dc9a6eca/mFduWl-5lO2fBbrzfgNNd.png', 'alt_text', 'Anime sample 1'),
                jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/64b24543eec33e27dc9a6eca/wQCZOW1-ZTaDj1SbBLCSf.png', 'alt_text', 'Anime sample 2')
            ),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- Watercolor Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_watercolor',
            'Name', 'Watercolor (Acuarelin)',
            'Author', 'd14945921',
            'Description', 'Watercolor painting style effect for artistic images.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['watercolor', 'painting', 'artistic', 'soft', 'style'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'qwen_image_acuarelin_000000750.safetensors',
                'url', 'https://huggingface.co/d14945921/qwen_image_acuarelin-lora/resolve/main/qwen_image_acuarelin_000000750.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- Crystalz Effect
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_crystalz',
            'Name', 'Crystalz Effect',
            'Author', 'RalFinger',
            'Description', 'Creates crystal and gem-like visual effects on images.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['crystal', 'gem', 'effect', 'artistic', 'style'],
            'trigger_word', 'ral-crystalz',
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'ral-crystalz-qwen-image_000001750.safetensors',
                'url', 'https://huggingface.co/RalFinger/ral-crystalz-qwen-image-lora/resolve/main/ral-crystalz-qwen-image_000001750.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- Fractal Geometry
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_frctlgmtry',
            'Name', 'Fractal Geometry',
            'Author', 'RalFinger',
            'Description', 'Adds fractal and geometric patterns to generated images.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['fractal', 'geometry', 'pattern', 'abstract', 'style'],
            'trigger_word', 'ral-frctlgmtry',
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'ral-frctlgmtry-qwen-image_000001750.safetensors',
                'url', 'https://huggingface.co/RalFinger/ral-frctlgmtry-qwen-image-lora/resolve/main/ral-frctlgmtry-qwen-image_000001750.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- Opal Effect
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_opal',
            'Name', 'Opal Effect',
            'Author', 'RalFinger',
            'Description', 'Creates opalescent, iridescent visual effects.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['opal', 'iridescent', 'effect', 'artistic', 'style'],
            'trigger_word', 'ral-opal',
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'ral-opal-qwen-image_000001500.safetensors',
                'url', 'https://huggingface.co/RalFinger/ral-opal-qwen-image-lora/resolve/main/ral-opal-qwen-image_000001500.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- Fluffy Effect
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_fluff',
            'Name', 'Fluffy Effect',
            'Author', 'RalFinger',
            'Description', 'Adds soft, fluffy textures to generated images.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['fluffy', 'soft', 'texture', 'cute', 'style'],
            'trigger_word', 'ral-fluff',
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'ral-fluff-qwen-image_000001500.safetensors',
                'url', 'https://huggingface.co/RalFinger/ral-fluff-qwen-image-lora/resolve/main/ral-fluff-qwen-image_000001500.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- Golden Beasts
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_golden_beasts',
            'Name', 'Golden Beasts',
            'Author', 'Quorlen',
            'Description', 'Creates golden, mythical beast imagery with ornate details.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['golden', 'beast', 'mythical', 'ornate', 'style'],
            'trigger_word', 'Golden beast',
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'Qwen_Image_Golden_Beasts_000001000.safetensors',
                'url', 'https://huggingface.co/Quorlen/Qwen_Image_Golden_Beasts-lora/resolve/main/Qwen_Image_Golden_Beasts_000001000.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- Samsung UltraReal (Photography)
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_samsung_ultrareal',
            'Name', 'Samsung UltraReal',
            'Author', 'Danrisi',
            'Description', 'Ultra-realistic photography style inspired by Samsung camera aesthetics.',
            'lora_type', 'Qwen Edit',
            'Downloads', 1147,
            'Tags', array['realistic', 'photography', 'samsung', 'camera', 'style'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'Samsung.safetensors',
                'url', 'https://huggingface.co/Danrisi/Qwen-image_SamsungCam_UltraReal/resolve/main/Samsung.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Successfully added Qwen Image style LoRAs to Qwen Edit category';
END $$;
