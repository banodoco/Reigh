create or replace function update_single_timeline_frame(p_generation_id uuid, p_new_timeline_frame integer, p_metadata jsonb)
returns setof shot_generations as $$
declare
    v_shot_id uuid;
    v_current_metadata jsonb;
begin
    -- Find the shot_id from the generation_id
    select shot_id, metadata into v_shot_id, v_current_metadata
    from shot_generations where generation_id = p_generation_id limit 1;

    if v_shot_id is null then
        raise exception 'Generation ID not found: %', p_generation_id;
    end if;

    -- Preserve existing user_positioned status and merge new metadata
    -- If item was already user_positioned, keep it that way
    -- If item is being positioned by user (drag operation), set user_positioned=true
    update shot_generations
    set
        timeline_frame = p_new_timeline_frame,
        metadata = jsonb_build_object(
            'user_positioned', COALESCE(
                (v_current_metadata->>'user_positioned')::boolean,
                (p_metadata->>'user_positioned')::boolean,
                (p_metadata->>'drag_source') IS NOT NULL
            ),
            'drag_source', COALESCE(
                v_current_metadata->>'drag_source',
                p_metadata->>'drag_source'
            ),
            'auto_positioned', COALESCE(
                v_current_metadata->>'auto_positioned',
                false
            )
        ) || p_metadata -- Merge any additional metadata
    where generation_id = p_generation_id and shot_id = v_shot_id;

    -- Log the update for debugging
    raise log 'update_single_timeline_frame: generation_id=%, timeline_frame=%->%, user_positioned=%',
        p_generation_id,
        v_current_metadata->>'timeline_frame',
        p_new_timeline_frame,
        COALESCE(
            (v_current_metadata->>'user_positioned')::boolean,
            (p_metadata->>'user_positioned')::boolean,
            (p_metadata->>'drag_source') IS NOT NULL
        );

    return query
        select * from shot_generations where generation_id = p_generation_id and shot_id = v_shot_id;
end;
$$ language plpgsql security definer;
