-- Migration: Disable auto-create variant trigger
--
-- The trg_auto_create_variant_after_generation trigger was added for backward compatibility
-- to auto-create variants when legacy code inserted directly into generations.
--
-- Now that all generation creation goes through the complete_task edge function,
-- the edge function handles all variant creation explicitly. This gives us:
-- - Full control over variant params (created_from, source_task_id, viewedAt)
-- - Consistent behavior for all generation types
-- - No "invisible magic" from triggers
--
-- We keep the function but drop the trigger, so it can be re-enabled if needed.

DROP TRIGGER IF EXISTS trg_auto_create_variant_after_generation ON generations;

COMMENT ON FUNCTION auto_create_variant_after_generation_insert() IS
  'DISABLED: Variant creation now handled by complete_task edge function. Trigger dropped in 20260118000000_disable_auto_variant_trigger.sql';
