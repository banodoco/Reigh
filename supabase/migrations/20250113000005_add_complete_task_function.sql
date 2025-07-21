-- Create a database function to handle task completion with timing protection

CREATE OR REPLACE FUNCTION complete_task_with_timing(
  p_task_id uuid,
  p_output_location text
) RETURNS boolean AS $$
BEGIN
  -- Set application name to identify this as a system function
  PERFORM set_config('application_name', 'complete_task', true);
  
  -- Update the task with completion details
  UPDATE tasks
  SET 
    status = 'Complete',
    output_location = p_output_location,
    generation_processed_at = NOW()
  WHERE id = p_task_id 
    AND status = 'In Progress';
  
  -- Reset application name
  PERFORM set_config('application_name', '', true);
  
  -- Return true if a row was updated
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 