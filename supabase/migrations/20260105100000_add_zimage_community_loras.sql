-- Migration: Add Z-Image Community LoRAs
-- This adds curated aesthetic Z-Image LoRAs as public community resources

-- First, get or create a system user for community resources
DO $$
DECLARE
    system_user_id uuid;
BEGIN
    -- Try to find existing system user or use the first admin user
    SELECT id INTO system_user_id FROM users WHERE email LIKE '%@anthropic.com' OR email LIKE '%admin%' LIMIT 1;

    -- If no system user found, we'll use the first user
    IF system_user_id IS NULL THEN
        SELECT id INTO system_user_id FROM users LIMIT 1;
    END IF;

    -- Skip if no users exist
    IF system_user_id IS NULL THEN
        RAISE NOTICE 'No users found, skipping Z-Image LoRA import';
        RETURN;
    END IF;

    -- Insert Z-Image LoRAs
    -- Using ON CONFLICT to avoid duplicates if run multiple times

    -- 1. Pixel Art Style (most popular)
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'pixel_art_style_z_image_turbo',
            'Name', 'Pixel Art Style',
            'Author', 'tarn59',
            'Description', 'Transforms images into pixel art style with retro gaming aesthetics. Great for creating nostalgic, 8-bit inspired artwork.',
            'lora_type', 'Z-Image',
            'Downloads', 338000,
            'Tags', array['pixel-art', 'retro', 'gaming', '8-bit'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'pixel_art_style_z_image_turbo.safetensors',
                'url', 'https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/pixel_art_style_z_image_turbo.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00310_%20(1).png', 'alt_text', 'Pixel art sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00305_%20(1).png', 'alt_text', 'Pixel art sample 2'),
                jsonb_build_object('url', 'https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00285_.png', 'alt_text', 'Pixel art sample 3')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00310_%20(1).png', 'type', 'image', 'alt_text', 'Pixel art sample 1')
            ),
            'main_generation', 'https://huggingface.co/tarn59/pixel_art_style_lora_z_image_turbo/resolve/main/images/ComfyUI_00310_%20(1).png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 2. Classic Painting
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'classic_painting_z_image_turbo',
            'Name', 'Classic Painting',
            'Author', 'renderartist',
            'Description', 'Creates images in the style of classic oil paintings with rich textures and traditional artistic techniques.',
            'lora_type', 'Z-Image',
            'Downloads', 1620,
            'Tags', array['painting', 'classical', 'oil-painting', 'fine-art'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'Classic_Painting_Z_Image_Turbo_v1_renderartist_1750.safetensors',
                'url', 'https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/Classic_Painting_Z_Image_Turbo_v1_renderartist_1750.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00076_.png', 'alt_text', 'Classic painting sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00006_.png', 'alt_text', 'Classic painting sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00076_.png', 'type', 'image', 'alt_text', 'Classic painting sample 1')
            ),
            'main_generation', 'https://huggingface.co/renderartist/Classic-Painting-Z-Image-Turbo-LoRA/resolve/main/images/Classic_Painting_Z_00076_.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 3. 80s Airbrush Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', '80s_air_brush_style_z_image_turbo',
            'Name', '80s Airbrush Style',
            'Author', 'tarn59',
            'Description', 'Recreates the distinctive 80s airbrush aesthetic popular in album covers and vintage posters.',
            'lora_type', 'Z-Image',
            'trigger_word', '80s Air Brush style.',
            'Tags', array['80s', 'airbrush', 'retro', 'vintage'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', '80s_air_brush_style_v2_z_image_turbo.safetensors',
                'url', 'https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/80s_air_brush_style_v2_z_image_turbo.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00707_.png', 'alt_text', '80s airbrush sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00703_.png', 'alt_text', '80s airbrush sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00707_.png', 'type', 'image', 'alt_text', '80s airbrush sample 1')
            ),
            'main_generation', 'https://huggingface.co/tarn59/80s_air_brush_style_z_image_turbo/resolve/main/images/ComfyUI_00707_.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 4. Coloring Book
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'coloring_book_z_image_turbo',
            'Name', 'Coloring Book',
            'Author', 'renderartist',
            'Description', 'Creates clean line art suitable for coloring books with bold outlines and simplified shapes.',
            'lora_type', 'Z-Image',
            'trigger_word', 'c0l0ringb00k',
            'Tags', array['coloring-book', 'line-art', 'kids', 'illustration'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'Coloring_Book_Z_Image_Turbo_v1_renderartist_2000.safetensors',
                'url', 'https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/Coloring_Book_Z_Image_Turbo_v1_renderartist_2000.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00664_.png', 'alt_text', 'Coloring book sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00651_.png', 'alt_text', 'Coloring book sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00664_.png', 'type', 'image', 'alt_text', 'Coloring book sample 1')
            ),
            'main_generation', 'https://huggingface.co/renderartist/Coloring-Book-Z-Image-Turbo-LoRA/resolve/main/images/CBZ_00664_.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 5. Saturday Morning Cartoon
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'saturday_morning_z_image_turbo',
            'Name', 'Saturday Morning Cartoon',
            'Author', 'renderartist',
            'Description', 'Creates images in the style of classic Saturday morning cartoons with bold colors and expressive characters.',
            'lora_type', 'Z-Image',
            'trigger_word', 'saturd4ym0rning',
            'Tags', array['cartoon', 'animation', 'retro', 'kids'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'Saturday_Morning_Z_Image_Turbo_v1_renderartist_1500.safetensors',
                'url', 'https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/Saturday_Morning_Z_Image_Turbo_v1_renderartist_1500.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_20.png', 'alt_text', 'Saturday morning cartoon sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_05.png', 'alt_text', 'Saturday morning cartoon sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_20.png', 'type', 'image', 'alt_text', 'Saturday morning cartoon sample 1')
            ),
            'main_generation', 'https://huggingface.co/renderartist/Saturday-Morning-Z-Image-Turbo/resolve/main/images/Saturday_Morning_Z_20.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 6. D-ART Fantasy
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'd_art_z_image_turbo',
            'Name', 'D-ART Fantasy',
            'Author', 'AiAF',
            'Description', 'Creates dramatic fantasy artwork with rich details and epic compositions. Great for game art and illustrations.',
            'lora_type', 'Z-Image',
            'Tags', array['fantasy', 'game-art', 'epic', 'illustration'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'D-ART_Z-Image-Turbo.safetensors',
                'url', 'https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/D-ART_Z-Image-Turbo.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_va0yozu4z.png', 'alt_text', 'D-ART fantasy sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_2lam3w01o.png', 'alt_text', 'D-ART fantasy sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_va0yozu4z.png', 'type', 'image', 'alt_text', 'D-ART fantasy sample 1')
            ),
            'main_generation', 'https://huggingface.co/AiAF/D-ART_Z-Image-Turbo_LoRA/resolve/main/images/example_va0yozu4z.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 7. 3D MMORPG Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', '3d_mmorpg_style_z_image_turbo',
            'Name', '3D MMORPG Style',
            'Author', 'DK9',
            'Description', 'Creates images in the style of 3D MMORPGs like Lost Ark with detailed fantasy characters and armor.',
            'lora_type', 'Z-Image',
            'Tags', array['3d', 'mmorpg', 'game-art', 'fantasy'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'lostark_v1.safetensors',
                'url', 'https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/lostark_v1.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/01_with_lora.png', 'alt_text', '3D MMORPG sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/02_with_lora.png', 'alt_text', '3D MMORPG sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/01_with_lora.png', 'type', 'image', 'alt_text', '3D MMORPG sample 1')
            ),
            'main_generation', 'https://huggingface.co/DK9/3D_MMORPG_style_z-image-turbo_lora/resolve/main/images/01_with_lora.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 8. Vintage Comic Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'vintage_comic_style_z_image',
            'Name', 'Vintage Comic Style',
            'Author', 'lovis93',
            'Description', 'Creates images with bold black outlines, halftone textures, and vibrant retro color palettes inspired by 1960s-70s illustrations.',
            'lora_type', 'Z-Image',
            'Downloads', 39,
            'Tags', array['comic', 'vintage', 'retro', 'pop-art'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'vintage_comic_style_lora.safetensors',
                'url', 'https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/vintage_comic_style_lora.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/00.png', 'alt_text', 'Vintage comic sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/01.png', 'alt_text', 'Vintage comic sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/00.png', 'type', 'image', 'alt_text', 'Vintage comic sample 1')
            ),
            'main_generation', 'https://huggingface.co/lovis93/vintage-comic-style-zimage-lora/resolve/main/00.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 9. Behind Reeded Glass
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'behind_reeded_glass_z_image_turbo',
            'Name', 'Behind Reeded Glass',
            'Author', 'Quorlen',
            'Description', 'Creates a distinctive distorted effect as if the subject is viewed through reeded/fluted glass.',
            'lora_type', 'Z-Image',
            'trigger_word', 'Act1vate! {subject}, behind reeded glass',
            'Downloads', 249,
            'Tags', array['glass', 'distortion', 'artistic', 'effect'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'Z_Image_Turbo_Behind_Reeded_Glass_Lora__TAV2.safetensors',
                'url', 'https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/Z_Image_Turbo_Behind_Reeded_Glass_Lora__TAV2.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00391_.png', 'alt_text', 'Reeded glass sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00392_.png', 'alt_text', 'Reeded glass sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00391_.png', 'type', 'image', 'alt_text', 'Reeded glass sample 1')
            ),
            'main_generation', 'https://huggingface.co/Quorlen/Z-Image-Turbo-Behind-Reeded-Glass-Lora/resolve/main/images/ComfyUI_00391_.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 10. Sunbleached Photograph
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'sunbleached_photograph_z_image_turbo',
            'Name', 'Sunbleached Photograph',
            'Author', 'Quorlen',
            'Description', 'Creates warm, sun-faded photograph aesthetic with peach skin tones, cyan grass, and light vignetting.',
            'lora_type', 'Z-Image',
            'Tags', array['vintage', 'photograph', 'warm', 'nostalgic'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'zimageturbo_Sunbleach_Photograph_Style_Lora_TAV2_000002500_(recommended).safetensors',
                'url', 'https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/zimageturbo_Sunbleach_Photograph_Style_Lora_TAV2_000002500_(recommended).safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00024_.png', 'alt_text', 'Sunbleached photo sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00028_.png', 'alt_text', 'Sunbleached photo sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00024_.png', 'type', 'image', 'alt_text', 'Sunbleached photo sample 1')
            ),
            'main_generation', 'https://huggingface.co/Quorlen/z_image_turbo_Sunbleached_Protograph_Style_Lora/resolve/main/images/ComfyUI_00024_.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 11. Historic Color
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'historic_color_z_image_turbo',
            'Name', 'Historic Color',
            'Author', 'AlekseyCalvin',
            'Description', 'Recreates the look of early color photography and autochrome images with historic, vintage aesthetics.',
            'lora_type', 'Z-Image',
            'trigger_word', 'HST photo',
            'Tags', array['historic', 'vintage', 'autochrome', 'photography'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'ZImage1HST.safetensors',
                'url', 'https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/ZImage1HST.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen.webp', 'alt_text', 'Historic color sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen3.webp', 'alt_text', 'Historic color sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen.webp', 'type', 'image', 'alt_text', 'Historic color sample 1')
            ),
            'main_generation', 'https://huggingface.co/AlekseyCalvin/HistoricColor_Z-image-Turbo-LoRA/resolve/main/HSTZgen.webp',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 12. Children's Drawings
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'childrens_drawings_z_image_turbo',
            'Name', 'Childrens Drawings',
            'Author', 'ostris',
            'Description', 'Transforms prompts into charming, child-like drawings with playful, naive art style.',
            'lora_type', 'Z-Image',
            'Tags', array['kids', 'naive-art', 'playful', 'drawing'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'z_image_turbo_childrens_drawings.safetensors',
                'url', 'https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/z_image_turbo_childrens_drawings.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433583842__000003000_0.jpg', 'alt_text', 'Childrens drawing sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433587842__000003000_1.jpg', 'alt_text', 'Childrens drawing sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433583842__000003000_0.jpg', 'type', 'image', 'alt_text', 'Childrens drawing sample 1')
            ),
            'main_generation', 'https://huggingface.co/ostris/z_image_turbo_childrens_drawings/resolve/main/images/1764433583842__000003000_0.jpg',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 13. Pencil Sketch
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'pencil_sketch_z_image_turbo',
            'Name', 'Pencil Sketch',
            'Author', 'Ttio2',
            'Description', 'Creates color and grayscale pencil sketch artwork with realistic hand-drawn aesthetics.',
            'lora_type', 'Z-Image',
            'Tags', array['sketch', 'pencil', 'drawing', 'monochrome'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'Zimage_pencil_sketch.safetensors',
                'url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/Zimage_pencil_sketch.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00100_.png', 'alt_text', 'Pencil sketch sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00099_.png', 'alt_text', 'Pencil sketch sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00100_.png', 'type', 'image', 'alt_text', 'Pencil sketch sample 1')
            ),
            'main_generation', 'https://huggingface.co/Ttio2/Z-Image-Turbo-pencil-sketch/resolve/main/images/z-image_00100_.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 14. Realism
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'realism_z_image_turbo',
            'Name', 'Realism',
            'Author', 'suayptalha',
            'Description', 'Enhances realism with ultra-realistic portraits and scenes featuring cinematic lighting and detailed textures.',
            'lora_type', 'Z-Image',
            'Downloads', 9880,
            'Tags', array['realism', 'photorealistic', 'cinematic', 'portrait'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'pytorch_lora_weights.safetensors',
                'url', 'https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/pytorch_lora_weights.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/mpzr-wsdQmgxbZIfP8bfb.png', 'alt_text', 'Realism sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/n4aSpqa-YFXYo4dtcIg4W.png', 'alt_text', 'Realism sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/mpzr-wsdQmgxbZIfP8bfb.png', 'type', 'image', 'alt_text', 'Realism sample 1')
            ),
            'main_generation', 'https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/images/mpzr-wsdQmgxbZIfP8bfb.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 15. Reversal Film Gravure
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'reversal_film_gravure_z_image_turbo',
            'Name', 'Reversal Film Gravure',
            'Author', 'AIImageStudio',
            'Description', 'Creates analog film photography aesthetic with the distinctive look of reversal film and gravure printing.',
            'lora_type', 'Z-Image',
            'Tags', array['film', 'analog', 'gravure', 'vintage'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'z_image_turbo_ReversalFilmGravure_v2.0.safetensors',
                'url', 'https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/z_image_turbo_ReversalFilmGravure_v2.0.safetensors'
            )),
            'Images', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_213257-z_image_z_image_turbo_bf16-831733836635472-euler_10_hires.png', 'alt_text', 'Reversal film sample 1'),
                jsonb_build_object('url', 'https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_213736-z_image_z_image_turbo_bf16-768412127747288-euler_10_hires.png', 'alt_text', 'Reversal film sample 2')
            ),
            'sample_generations', jsonb_build_array(
                jsonb_build_object('url', 'https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_213257-z_image_z_image_turbo_bf16-831733836635472-euler_10_hires.png', 'type', 'image', 'alt_text', 'Reversal film sample 1')
            ),
            'main_generation', 'https://huggingface.co/AIImageStudio/ReversalFilmGravure_z_Image_turbo_v2.0/resolve/main/images/2025-12-12_213257-z_image_z_image_turbo_bf16-831733836635472-euler_10_hires.png',
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    -- 16. Tarot Card Style
    INSERT INTO resources (user_id, type, metadata, is_public)
    VALUES (
        system_user_id,
        'lora',
        jsonb_build_object(
            'Model ID', 'tarot_z_image',
            'Name', 'Tarot Card Style',
            'Author', 'multimodalart',
            'Description', 'Creates images in the style of traditional tarot cards with mystical, ornate aesthetics.',
            'lora_type', 'Z-Image',
            'trigger_word', 'trtcrd',
            'Downloads', 164,
            'Tags', array['tarot', 'mystical', 'ornate', 'illustration'],
            'Model Files', jsonb_build_array(jsonb_build_object(
                'path', 'tarot-z-image.safetensors',
                'url', 'https://huggingface.co/multimodalart/tarot-z-image-lora/resolve/main/tarot-z-image.safetensors'
            )),
            'Images', jsonb_build_array(),
            'sample_generations', jsonb_build_array(),
            'base_model', 'Z-Image Turbo',
            'is_public', true,
            'Last Modified', now()
        ),
        true
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Successfully added Z-Image community LoRAs';
END $$;
