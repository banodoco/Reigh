-- Migration: Add more Z-Image Community LoRAs
-- Additional curated aesthetic Z-Image LoRAs

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

    -- 1. Ghibli Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'ghibli_style_z_image_turbo',
            'Name', 'Studio Ghibli Style',
            'Author', 'Ttio2',
            'Description', 'Creates images in the beautiful Studio Ghibli animation style with dreamlike landscapes, whimsical characters, and painterly textures.',
            'lora_type', 'Z-Image',
            'Downloads', 484,
            'Tags', array['ghibli', 'anime', 'studio-ghibli', 'miyazaki', 'animation'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'ghibli_zimage_finetune.safetensors',
                'url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/ghibli_zimage_finetune.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 2. Technically Color (Classic Film)
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'technically_color_z_image_turbo',
            'Name', 'Technically Color (Classic Film)',
            'Author', 'renderartist',
            'Description', 'Captures the essence of classic film cinematography with vibrant saturated palettes, dramatic lighting, and the distinctive glow of 1940s-1960s cinema.',
            'lora_type', 'Z-Image',
            'trigger_word', 't3chnic4lly',
            'Downloads', 2877,
            'Tags', array['film', 'classic', 'cinema', 'vintage', 'technicolor'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors',
                'url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 3. Arcane Style (from DeverStyle collection)
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'z_image_arcane_v1',
            'Name', 'Arcane Style',
            'Author', 'DeverStyle',
            'Description', 'Creates images in the distinctive Arcane (Netflix/League of Legends) animation style with painterly textures and dramatic lighting.',
            'lora_type', 'Z-Image',
            'Downloads', 12,
            'Tags', array['arcane', 'animation', 'netflix', 'painterly', 'league-of-legends'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'z_image_arcane_v1.safetensors',
                'url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/z_image_arcane_v1.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/arcane.png', 'alt_text', 'Arcane style sample')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/arcane.png', 'type', 'image', 'alt_text', 'Arcane style sample')
            ),
            'main_generation', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/arcane.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 4. Archer Animation Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'z_image_archer_style',
            'Name', 'Archer Animation Style',
            'Author', 'DeverStyle',
            'Description', 'Creates images in the Archer animated series style with clean lines and distinctive character designs.',
            'lora_type', 'Z-Image',
            'Downloads', 12,
            'Tags', array['archer', 'animation', 'cartoon', 'spy', 'retro'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'z_image_archer_style.safetensors',
                'url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/z_image_archer_style.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/archer.png', 'alt_text', 'Archer style sample')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/archer.png', 'type', 'image', 'alt_text', 'Archer style sample')
            ),
            'main_generation', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/archer.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 5. Blue Eye Samurai Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'z_image_blue_eye_samurai',
            'Name', 'Blue Eye Samurai Style',
            'Author', 'DeverStyle',
            'Description', 'Creates images in the Blue Eye Samurai animation style with Japanese-inspired aesthetics and dramatic compositions.',
            'lora_type', 'Z-Image',
            'Downloads', 12,
            'Tags', array['anime', 'samurai', 'japanese', 'netflix', 'dramatic'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'z_image_blue_eye_samurai.safetensors',
                'url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/z_image_blue_eye_samurai.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/blue_eye_samurai.png', 'alt_text', 'Blue Eye Samurai style sample')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/blue_eye_samurai.png', 'type', 'image', 'alt_text', 'Blue Eye Samurai style sample')
            ),
            'main_generation', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/blue_eye_samurai.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 6. Dan Mumford Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'z_image_dan_mumford_style',
            'Name', 'Dan Mumford Style',
            'Author', 'DeverStyle',
            'Description', 'Creates images in Dan Mumford iconic illustration style with intricate linework, vibrant colors, and psychedelic rock poster aesthetics.',
            'lora_type', 'Z-Image',
            'Downloads', 12,
            'Tags', array['dan-mumford', 'illustration', 'psychedelic', 'rock-poster', 'intricate'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'z_image_dan-mumford_style.safetensors',
                'url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/z_image_dan-mumford_style.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/dan-mumford-style.png', 'alt_text', 'Dan Mumford style sample')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/dan-mumford-style.png', 'type', 'image', 'alt_text', 'Dan Mumford style sample')
            ),
            'main_generation', 'https://huggingface.co/DeverStyle/Z-Image-loras/resolve/main/samples/dan-mumford-style.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 7. Elusarca Anime Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'elusarca_anime_style_z_image',
            'Name', 'Elusarca Anime Style',
            'Author', 'reverentelusarca',
            'Description', 'Creates vibrant anime-style images with expressive characters and colorful compositions.',
            'lora_type', 'Z-Image',
            'Downloads', 7,
            'Tags', array['anime', 'colorful', 'expressive', 'character'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'elusarca-anime-style.safetensors',
                'url', 'https://huggingface.co/reverentelusarca/elusarca-anime-style-lora-z-image-turbo/resolve/main/elusarca-anime-style.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 8. LogC4 Film Color Grade
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'logc4_color_grade_z_image_turbo',
            'Name', 'LogC4 Film Color Grade',
            'Author', 'Sumitc13',
            'Description', 'Applies ARRI LogC4 film color grading for cinematic, professional-grade color treatment.',
            'lora_type', 'Z-Image',
            'Downloads', 132,
            'Tags', array['film', 'color-grading', 'logc4', 'arri', 'cinematic'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'z-image-logc4_000005000.safetensors',
                'url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/z-image-logc4_000005000.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 9. Albany Bulb Art Zone
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'albany_bulb_artzone_z_image_turbo',
            'Name', 'Albany Bulb Art Zone',
            'Author', 'AlekseyCalvin',
            'Description', 'Inspired by the Albany Bulb art installations with colorful, expressive street art aesthetics.',
            'lora_type', 'Z-Image',
            'Tags', array['street-art', 'graffiti', 'colorful', 'urban', 'artistic'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'ZImageBulbArt2_000002200.safetensors',
                'url', 'https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/ZImageBulbArt2_000002200.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Successfully added more Z-Image community LoRAs';
END $$;
