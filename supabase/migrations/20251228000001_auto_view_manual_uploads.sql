-- Auto-mark manual upload variants as viewed immediately
-- Manual uploads are detected by: variant_type = 'original' AND no source_task_id in params
-- Task-created variants (with source_task_id) should NOT be auto-marked, so they show NEW badge

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION auto_view_manual_upload_variant()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for manual uploads (original variants without source_task_id)
  -- Task-created variants have source_task_id in params and should show as NEW
  IF NEW.variant_type = 'original' AND
     (NEW.params IS NULL OR NEW.params->>'source_task_id' IS NULL) THEN
    NEW.viewed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create BEFORE INSERT trigger so we can modify NEW.viewed_at
DROP TRIGGER IF EXISTS trg_auto_view_manual_upload ON generation_variants;
CREATE TRIGGER trg_auto_view_manual_upload
BEFORE INSERT ON generation_variants
FOR EACH ROW
EXECUTE FUNCTION auto_view_manual_upload_variant();

-- 3. Add function comment
COMMENT ON FUNCTION auto_view_manual_upload_variant() IS
  'Automatically marks manual upload variants (type=original, no source_task_id) as viewed. Task-created variants are NOT auto-marked so they show the NEW badge.';
