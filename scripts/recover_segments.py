#!/usr/bin/env python3
"""
Recover segment generations from task data.

This script recreates generation records that were accidentally deleted
by cascade delete when a parent generation was deleted.

Usage:
    python3 recover_segments.py --from-json data.json --dry-run
    python3 recover_segments.py --from-json data.json

The script will:
1. Group tasks by segment_index and child_generation_id
2. Recreate the parent generation if needed
3. Recreate each child generation with the most recent output
4. Create variants for each completed task
"""

import sys
import os
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from collections import defaultdict
from dotenv import load_dotenv

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

load_dotenv()

from supabase import create_client


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='Recover segment generations from task data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('--from-json', required=True, help='Load tasks from JSON file')
    parser.add_argument('--parent-gen-id', help='Override parent generation ID (use instead of value from tasks)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    parser.add_argument('--debug', action='store_true', help='Show debug info')
    return parser


def get_supabase_client():
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment")

    return create_client(supabase_url, supabase_key)


def load_tasks_from_json(json_path: str) -> List[Dict[str, Any]]:
    """Load task data from a JSON file."""
    with open(json_path, 'r') as f:
        data = json.load(f)

    # Handle both array and single object
    if isinstance(data, list):
        return data
    return [data]


def parse_params(params) -> Dict[str, Any]:
    """Parse params whether it's a string or dict."""
    if isinstance(params, str):
        return json.loads(params)
    return params or {}


def analyze_tasks(tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze tasks and group by segment."""
    by_segment = defaultdict(list)
    parent_gen_id = None
    project_id = None

    for t in tasks:
        params = parse_params(t.get('params', {}))
        seg_idx = params.get('segment_index')

        if seg_idx is None:
            continue

        if not parent_gen_id:
            parent_gen_id = params.get('parent_generation_id')
        if not project_id:
            project_id = params.get('project_id')

        by_segment[seg_idx].append({
            'task_id': t['id'],
            'child_generation_id': params.get('child_generation_id'),
            'output_location': t.get('output_location'),
            'thumbnail_url': params.get('thumbnail_url'),
            'status': t.get('status'),
            'created_at': t.get('created_at'),
            'params': params,
        })

    # Sort each segment's tasks by created_at (newest first)
    for seg_idx in by_segment:
        by_segment[seg_idx].sort(key=lambda x: x['created_at'] or '', reverse=True)

    return {
        'parent_generation_id': parent_gen_id,
        'project_id': project_id,
        'segments': dict(by_segment),
    }


def recreate_parent_generation(
    supabase,
    parent_gen_id: str,
    project_id: str,
    dry_run: bool = False
) -> bool:
    """Recreate the parent generation record."""
    # Check if it already exists
    existing = supabase.table('generations').select('id').eq('id', parent_gen_id).execute()
    if existing.data:
        print(f"  Parent generation {parent_gen_id[:8]}... already exists")
        return True

    print(f"\n{'[DRY RUN] Would create' if dry_run else 'Creating'} parent generation:")
    print(f"  ID: {parent_gen_id}")
    print(f"  Project: {project_id}")

    if dry_run:
        return True

    # Create the parent generation (no user_id or tool columns - tool goes in params)
    gen_data = {
        'id': parent_gen_id,
        'project_id': project_id,
        'type': 'video',
        'is_child': False,
        'params': json.dumps({'tool_type': 'travel-between-images', 'created_from': 'recovery_script'}),
        'created_at': datetime.now(timezone.utc).isoformat(),
    }

    result = supabase.table('generations').insert(gen_data).execute()
    if result.data:
        print(f"  Created parent generation")
        return True
    else:
        print(f"  ERROR creating parent generation")
        return False


def recreate_child_generation(
    supabase,
    segment_idx: int,
    tasks: List[Dict[str, Any]],
    parent_gen_id: str,
    project_id: str,
    dry_run: bool = False
) -> Optional[str]:
    """Recreate a child generation from segment tasks."""

    # Find the child_generation_id (should be consistent across tasks for this segment)
    child_gen_id = None
    for t in tasks:
        if t.get('child_generation_id'):
            child_gen_id = t['child_generation_id']
            break

    if not child_gen_id:
        print(f"  Segment {segment_idx}: No child_generation_id found, skipping")
        return None

    # Find the best output (newest completed task with output)
    best_task = None
    for t in tasks:
        if t.get('status') == 'Complete' and t.get('output_location'):
            best_task = t
            break

    if not best_task:
        print(f"  Segment {segment_idx}: No completed task with output, skipping")
        return None

    # Check if generation already exists
    existing = supabase.table('generations').select('id').eq('id', child_gen_id).execute()
    if existing.data:
        print(f"  Segment {segment_idx}: Generation {child_gen_id[:8]}... already exists")
        return child_gen_id

    output_url = best_task['output_location']
    thumb_url = best_task.get('thumbnail_url')

    print(f"\n{'[DRY RUN] Would create' if dry_run else 'Creating'} segment {segment_idx}:")
    print(f"  Child ID: {child_gen_id[:8]}...")
    print(f"  Output: ...{output_url[-60:]}" if len(output_url) > 60 else f"  Output: {output_url}")
    print(f"  From task: {best_task['task_id'][:8]}... ({best_task['created_at'][:16]})")
    print(f"  Total variants to create: {len([t for t in tasks if t.get('status') == 'Complete' and t.get('output_location')])}")

    if dry_run:
        return child_gen_id

    # Build params for the generation record
    task_params = best_task.get('params', {})
    gen_params = {
        'tool_type': 'travel-between-images',
        'created_from': 'recovery_script',
        'segment_index': segment_idx,
    }
    # Include pair_shot_generation_id if available
    pair_shot_gen_id = (
        task_params.get('pair_shot_generation_id') or
        task_params.get('individual_segment_params', {}).get('pair_shot_generation_id')
    )
    if pair_shot_gen_id:
        gen_params['pair_shot_generation_id'] = pair_shot_gen_id

    # Create the child generation
    gen_data = {
        'id': child_gen_id,
        'project_id': project_id,
        'type': 'video',
        'is_child': True,
        'parent_generation_id': parent_gen_id,
        'child_order': segment_idx,
        'location': output_url,
        'thumbnail_url': thumb_url,
        'params': json.dumps(gen_params),
        'created_at': best_task.get('created_at') or datetime.now(timezone.utc).isoformat(),
    }

    result = supabase.table('generations').insert(gen_data).execute()
    if not result.data:
        print(f"  ERROR creating child generation")
        return None

    print(f"  Created generation {child_gen_id[:8]}...")

    # Create variants for all completed tasks
    variant_count = 0
    for i, t in enumerate(tasks):
        if t.get('status') != 'Complete' or not t.get('output_location'):
            continue

        is_primary = (i == 0)  # First (newest) is primary
        task_params = t.get('params', {})

        # Build variant params like complete_task does - include pair_shot_generation_id for slot matching
        variant_params = {
            **task_params,
            'tool_type': 'travel-between-images',
            'source_task_id': t['task_id'],
            'created_from': 'recovery_script',
        }
        # Ensure pair_shot_generation_id is at top level
        pair_shot_gen_id = (
            task_params.get('pair_shot_generation_id') or
            task_params.get('individual_segment_params', {}).get('pair_shot_generation_id')
        )
        if pair_shot_gen_id:
            variant_params['pair_shot_generation_id'] = pair_shot_gen_id

        variant_data = {
            'generation_id': child_gen_id,
            'location': t['output_location'],
            'thumbnail_url': t.get('thumbnail_url'),
            'is_primary': is_primary,
            'variant_type': 'individual_segment',
            'params': json.dumps(variant_params),
            'created_at': t.get('created_at') or datetime.now(timezone.utc).isoformat(),
        }

        var_result = supabase.table('generation_variants').insert(variant_data).execute()
        if var_result.data:
            variant_count += 1

    print(f"  Created {variant_count} variants")
    return child_gen_id


def main():
    parser = create_parser()
    args = parser.parse_args()

    supabase = get_supabase_client()

    print(f"Loading tasks from {args.from_json}")
    tasks = load_tasks_from_json(args.from_json)
    print(f"Loaded {len(tasks)} tasks")

    # Analyze and group tasks
    analysis = analyze_tasks(tasks)
    parent_gen_id = args.parent_gen_id or analysis['parent_generation_id']
    project_id = analysis['project_id']
    segments = analysis['segments']

    if args.parent_gen_id:
        print(f"\nParent generation: {parent_gen_id} (OVERRIDDEN)")
    else:
        print(f"\nParent generation: {parent_gen_id}")
    print(f"Project: {project_id}")
    print(f"Segments: {len(segments)} (indices {min(segments.keys())}-{max(segments.keys())})")

    if args.debug:
        print("\nSegment breakdown:")
        for seg_idx in sorted(segments.keys()):
            seg_tasks = segments[seg_idx]
            completed = len([t for t in seg_tasks if t.get('status') == 'Complete' and t.get('output_location')])
            child_ids = set(t.get('child_generation_id') for t in seg_tasks if t.get('child_generation_id'))
            print(f"  Segment {seg_idx}: {len(seg_tasks)} tasks, {completed} with output, child_ids: {[c[:8] for c in child_ids]}")

    # Recreate parent
    print(f"\n{'=' * 60}")
    print("Step 1: Parent generation")
    print('=' * 60)

    if not recreate_parent_generation(supabase, parent_gen_id, project_id, args.dry_run):
        if not args.dry_run:
            print("Failed to create parent, aborting")
            sys.exit(1)

    # Recreate children
    print(f"\n{'=' * 60}")
    print("Step 2: Child generations")
    print('=' * 60)

    success_count = 0
    for seg_idx in sorted(segments.keys()):
        result = recreate_child_generation(
            supabase,
            seg_idx,
            segments[seg_idx],
            parent_gen_id,
            project_id,
            args.dry_run
        )
        if result:
            success_count += 1

    print(f"\n{'=' * 60}")
    print(f"{'Would recover' if args.dry_run else 'Recovered'} {success_count}/{len(segments)} segment generations")
    print('=' * 60)

    if args.dry_run:
        print("\nRun without --dry-run to apply changes")


if __name__ == '__main__':
    main()
