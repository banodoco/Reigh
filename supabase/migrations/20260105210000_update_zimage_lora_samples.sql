-- Migration: Add sample images to Z-Image LoRAs that were missing them

-- 1. Update Studio Ghibli Style with sample images
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'Images', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00147_.png', 'alt_text', 'Young woman in Ghibli style'),
        jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00152_.png', 'alt_text', 'Ghibli stormtrooper'),
        jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00149_.png', 'alt_text', 'Ghibli Santa workshop'),
        jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00151_.png', 'alt_text', 'Ghibli Dumbledore'),
        jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00148_.png', 'alt_text', 'Ghibli Garfield')
    ),
    'sample_generations', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00147_.png', 'type', 'image', 'alt_text', 'Young woman in Ghibli style'),
        jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00152_.png', 'type', 'image', 'alt_text', 'Ghibli stormtrooper'),
        jsonb_build_object('url', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00149_.png', 'type', 'image', 'alt_text', 'Ghibli Santa workshop')
    ),
    'main_generation', 'https://huggingface.co/Ttio2/Z-Image-Turbo-Ghibli-Style/resolve/main/images/z-image_00147_.png'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'ghibli_style_z_image_turbo';

-- 2. Update Technically Color with sample images
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'Images', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00828_.png', 'alt_text', 'Technicolor sample 1'),
        jsonb_build_object('url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00712_.png', 'alt_text', 'Technicolor sample 2'),
        jsonb_build_object('url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00909_.png', 'alt_text', 'Technicolor sample 3'),
        jsonb_build_object('url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00917_.png', 'alt_text', 'Technicolor sample 4'),
        jsonb_build_object('url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00760_.png', 'alt_text', 'Technicolor sample 5')
    ),
    'sample_generations', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00828_.png', 'type', 'image', 'alt_text', 'Technicolor sample 1'),
        jsonb_build_object('url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00712_.png', 'type', 'image', 'alt_text', 'Technicolor sample 2'),
        jsonb_build_object('url', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00909_.png', 'type', 'image', 'alt_text', 'Technicolor sample 3')
    ),
    'main_generation', 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/images/ComfyUI_00828_.png'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'technically_color_z_image_turbo';

-- 3. Update Elusarca Anime Style with sample images
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'Images', jsonb_build_array(
        jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/FZGdE-FNzQen53NwCXXbu.png', 'alt_text', 'Elusarca anime sample 1'),
        jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/oSYXkrJiBd6eUwQ8LIRgo.png', 'alt_text', 'Elusarca anime sample 2'),
        jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/OFz4NJNZKcpyfPTgjJiPA.png', 'alt_text', 'Elusarca anime sample 3'),
        jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/QDFDSZALnbh6-qfeEZCtE.png', 'alt_text', 'Elusarca anime sample 4'),
        jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/1y7pP4ykoIoRXSRY9N7NN.png', 'alt_text', 'Elusarca anime sample 5')
    ),
    'sample_generations', jsonb_build_array(
        jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/FZGdE-FNzQen53NwCXXbu.png', 'type', 'image', 'alt_text', 'Elusarca anime sample 1'),
        jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/oSYXkrJiBd6eUwQ8LIRgo.png', 'type', 'image', 'alt_text', 'Elusarca anime sample 2'),
        jsonb_build_object('url', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/OFz4NJNZKcpyfPTgjJiPA.png', 'type', 'image', 'alt_text', 'Elusarca anime sample 3')
    ),
    'main_generation', 'https://cdn-uploads.huggingface.co/production/uploads/661d56bdbca423783d3184d9/FZGdE-FNzQen53NwCXXbu.png'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'elusarca_anime_style_z_image';

-- 4. Update LogC4 Film Color Grade with sample images
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'Images', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464512096__000005000_0.jpg', 'alt_text', 'LogC4 sunset beach'),
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464517272__000005000_1.jpg', 'alt_text', 'LogC4 woman in pub'),
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464522440__000005000_2.jpg', 'alt_text', 'LogC4 dog close-up'),
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464527618__000005000_3.jpg', 'alt_text', 'LogC4 car explosion'),
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464532760__000005000_4.jpg', 'alt_text', 'LogC4 mossy rock'),
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464537917__000005000_5.jpg', 'alt_text', 'LogC4 underwater ocean')
    ),
    'sample_generations', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464512096__000005000_0.jpg', 'type', 'image', 'alt_text', 'LogC4 sunset beach'),
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464517272__000005000_1.jpg', 'type', 'image', 'alt_text', 'LogC4 woman in pub'),
        jsonb_build_object('url', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464522440__000005000_2.jpg', 'type', 'image', 'alt_text', 'LogC4 dog close-up')
    ),
    'main_generation', 'https://huggingface.co/Sumitc13/Z-image-Turbo_LogC4_lora/resolve/main/images/1764464512096__000005000_0.jpg'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'logc4_color_grade_z_image_turbo';

-- 5. Update Albany Bulb Art Zone with sample images
UPDATE resources
SET metadata = metadata || jsonb_build_object(
    'Images', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bulb3ii.jpg', 'alt_text', 'Albany Bulb art sample 1'),
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bylb3iii.jpg', 'alt_text', 'Albany Bulb art sample 2'),
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bulb3i.jpg', 'alt_text', 'Albany Bulb art sample 3')
    ),
    'sample_generations', jsonb_build_array(
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bulb3ii.jpg', 'type', 'image', 'alt_text', 'Albany Bulb art sample 1'),
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bylb3iii.jpg', 'type', 'image', 'alt_text', 'Albany Bulb art sample 2'),
        jsonb_build_object('url', 'https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bulb3i.jpg', 'type', 'image', 'alt_text', 'Albany Bulb art sample 3')
    ),
    'main_generation', 'https://huggingface.co/AlekseyCalvin/AlbanyBulb_ArtZone_var3_Z-image-Turbo_LoRA/resolve/main/bulb3ii.jpg',
    'trigger_word', 'bulbart photo of'
)
WHERE type = 'lora' AND metadata->>'Model ID' = 'albany_bulb_artzone_z_image_turbo';
