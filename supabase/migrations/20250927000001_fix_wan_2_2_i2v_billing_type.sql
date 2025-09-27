-- Fix wan_2_2_i2v billing type to use per_unit instead of per_second
-- This task type should be billed at $0.25 per video generation, not per second

-- Update wan_2_2_i2v to use per_unit billing
UPDATE task_types 
SET billing_type = 'per_unit',
    unit_cost = 0.250000,  -- $0.25 per video generation
    base_cost_per_second = 0.0278  -- Standardize to match other task types (not used for per_unit billing)
WHERE name = 'wan_2_2_i2v' AND is_active = true;

-- Verify the update
DO $$
DECLARE
    v_billing_type text;
    v_unit_cost decimal(10,6);
BEGIN
    SELECT billing_type, unit_cost 
    INTO v_billing_type, v_unit_cost
    FROM task_types 
    WHERE name = 'wan_2_2_i2v' AND is_active = true;
    
    IF v_billing_type != 'per_unit' OR v_unit_cost != 0.250000 THEN
        RAISE EXCEPTION 'wan_2_2_i2v billing type update failed. Current: billing_type=%, unit_cost=%', v_billing_type, v_unit_cost;
    END IF;
    
    RAISE NOTICE 'wan_2_2_i2v billing type successfully updated to per_unit with unit_cost=$%', v_unit_cost;
END $$;
