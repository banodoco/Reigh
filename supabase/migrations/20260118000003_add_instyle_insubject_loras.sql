-- Migration: Add InStyle and InSubject LoRAs to Qwen Edit
-- These are the style/subject reference LoRAs used in image generation

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

    -- InStyle LoRA
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_instyle',
            'Name', 'InStyle',
            'Author', 'peteromallet',
            'Description', 'Style transfer LoRA for Qwen editing. Applies the style of a reference image to the generation while preserving content structure.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['style', 'transfer', 'reference', 'artistic'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'instyle.safetensors',
                'url', 'https://huggingface.co/peteromallet/Qwen-Image-Edit-InStyle/resolve/main/instyle.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- InSubject LoRA
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'qwen_edit_insubject',
            'Name', 'InSubject',
            'Author', 'peteromallet',
            'Description', 'Subject consistency LoRA for Qwen editing. Maintains subject identity from a reference image in the generation.',
            'lora_type', 'Qwen Edit',
            'Downloads', 0,
            'Tags', array['subject', 'identity', 'reference', 'consistency'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'insubject.safetensors',
                'url', 'https://huggingface.co/peteromallet/Qwen-Image-Edit-InSubject/resolve/main/insubject.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Qwen2-VL',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Successfully added InStyle and InSubject LoRAs to Qwen Edit category';
END $$;
