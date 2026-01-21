-- Make last_heartbeat nullable and default to NULL
-- This allows distinguishing "never sent a heartbeat" from "sent one long ago"

ALTER TABLE public.workers
  ALTER COLUMN last_heartbeat DROP NOT NULL,
  ALTER COLUMN last_heartbeat SET DEFAULT NULL;

-- Update any existing NULL checks in functions/views if needed
COMMENT ON COLUMN public.workers.last_heartbeat IS 'Last heartbeat timestamp. NULL means worker has never sent a heartbeat.';
