-- Check if worker_4333 exists
SELECT id, instance_type, status, created_at FROM workers WHERE id = 'worker_4333';

-- Insert worker_4333 if it doesn't exist
INSERT INTO workers (id, instance_type, created_at, last_heartbeat, status, metadata)
VALUES ('worker_4333', 'server', NOW(), NOW(), 'active', '{"source": "headless_server"}')
ON CONFLICT (id) DO UPDATE SET 
  last_heartbeat = NOW(),
  status = 'active';

-- Verify the worker was created/updated
SELECT id, instance_type, status, created_at, last_heartbeat FROM workers WHERE id = 'worker_4333';
