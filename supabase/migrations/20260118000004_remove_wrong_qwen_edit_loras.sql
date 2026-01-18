-- Migration: Remove incorrectly added LoRAs from Qwen Edit
-- These were added in error in 20260118000002

DELETE FROM resources
WHERE type = 'lora'
AND metadata->>'Model ID' IN (
    'qwen_edit_raena_anime',
    'qwen_edit_watercolor',
    'qwen_edit_crystalz',
    'qwen_edit_frctlgmtry',
    'qwen_edit_opal',
    'qwen_edit_fluff',
    'qwen_edit_golden_beasts',
    'qwen_edit_samsung_ultrareal'
);
