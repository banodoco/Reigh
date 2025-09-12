-- Simple debug query to see what tasks exist
SELECT 
  t.id,
  t.task_type,
  t.status,
  t.worker_id,
  p.user_id,
  u.credits,
  CASE WHEN t.task_type ILIKE '%orchestrator%' THEN 'YES' ELSE 'NO' END as is_orchestrator
FROM tasks t
JOIN projects p ON t.project_id = p.id
JOIN users u ON p.user_id = u.id
WHERE t.status IN ('Queued', 'In Progress')
ORDER BY t.status, t.task_type;
