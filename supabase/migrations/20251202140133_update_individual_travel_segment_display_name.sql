-- Update display_name for individual_travel_segment from 'Regenerate Segment' to 'Travel Segment'
UPDATE task_types SET display_name = 'Travel Segment' WHERE name = 'individual_travel_segment';

