-- Migration: Add Qwen Edit LoRAs
-- These are specialized LoRAs for Qwen image editing (inpainting/magic edit)

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

    -- 1. InScene LoRA - For editing objects while maintaining scene coherence
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_in_scene',
            'Name', 'InScene (Different Object)',
            'Author', 'peteromallet',
            'Description', 'Optimized for editing objects within a scene while maintaining visual coherence. Use this when replacing or modifying elements that should blend naturally with the existing scene.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['inpainting', 'editing', 'scene-coherence', 'object-replacement', 'qwen'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'in_scene_different_object_000010500.safetensors',
                'url', 'https://huggingface.co/peteromallet/random_junk/resolve/main/in_scene_different_object_000010500.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 2. Next Scene LoRA - For creating scene transitions and continuations
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_next_scene',
            'Name', 'Next Scene',
            'Author', 'lovis93',
            'Description', 'Designed for creating scene transitions and continuations. Ideal for generating what comes next in a sequence while maintaining style and character consistency.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['next-scene', 'transition', 'continuation', 'sequence', 'qwen'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'next-scene_lora-v2-3000.safetensors',
                'url', 'https://huggingface.co/lovis93/next-scene-qwen-image-lora-2509/resolve/main/next-scene_lora-v2-3000.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Successfully added Qwen Edit LoRAs (InScene and Next Scene)';
END $$;


