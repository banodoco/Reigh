-- Replace tokens column with execution_details JSONB
ALTER TABLE dev_tasks DROP COLUMN tokens;
ALTER TABLE dev_tasks ADD COLUMN execution_details JSONB;

-- Example structure:
-- {
--   "num_turns": 1,
--   "total_cost_usd": 0.04,
--   "usage": {
--     "input_tokens": 3,
--     "output_tokens": 5,
--     "cache_creation_input_tokens": 5354,
--     "cache_read_input_tokens": 12834
--   }
-- }
