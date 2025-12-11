#!/usr/bin/env python3
"""
Debug Tool for Headless-Wan2GP
==============================

Investigate tasks and system state.

Usage:
    debug.py task <task_id>             # Investigate specific task
    debug.py tasks                      # Analyze recent tasks

Options:
    --json                              # Output as JSON
    --hours N                           # Time window in hours
    --limit N                           # Limit results
    --logs-only                         # Show only logs timeline
    --debug                             # Show debug info on errors

Examples:
    # Investigate why a task failed
    debug.py task 41345358-f3b5-418a-9805-b442aed30e18
    
    # List recent failed tasks
    debug.py tasks --status Failed --limit 10
    
    # Get tasks as JSON
    debug.py tasks --json
"""

import sys
import argparse
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from debug.client import DebugClient
from debug.commands import task, tasks


def create_parser() -> argparse.ArgumentParser:
    """Create argument parser."""
    parser = argparse.ArgumentParser(
        description='Debug tool for investigating tasks',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to run', required=True)
    
    # Task command
    task_parser = subparsers.add_parser('task', help='Investigate specific task')
    task_parser.add_argument('task_id', help='Task ID to investigate')
    task_parser.add_argument('--json', action='store_true', help='Output as JSON')
    task_parser.add_argument('--logs-only', action='store_true', help='Show only logs timeline')
    task_parser.add_argument('--debug', action='store_true', help='Show debug info on errors')
    
    # Tasks command
    tasks_parser = subparsers.add_parser('tasks', help='Analyze recent tasks')
    tasks_parser.add_argument('--limit', type=int, default=50, help='Number of tasks (default: 50)')
    tasks_parser.add_argument('--status', help='Filter by status (e.g., Failed, Complete, Queued)')
    tasks_parser.add_argument('--type', help='Filter by task type')
    tasks_parser.add_argument('--hours', type=int, help='Filter by hours')
    tasks_parser.add_argument('--json', action='store_true', help='Output as JSON')
    tasks_parser.add_argument('--debug', action='store_true', help='Show debug info on errors')
    
    return parser


def main():
    """Main entry point."""
    parser = create_parser()
    args = parser.parse_args()
    
    # Create debug client
    try:
        client = DebugClient()
    except Exception as e:
        print(f"❌ Failed to initialize debug client: {e}")
        print("\n💡 Make sure your .env file is configured with:")
        print("   - SUPABASE_URL")
        print("   - SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    
    # Convert args to options dict
    options = {
        'format': 'json' if hasattr(args, 'json') and args.json else 'text',
        'debug': args.debug if hasattr(args, 'debug') else False
    }
    
    # Add command-specific options
    if hasattr(args, 'hours') and args.hours:
        options['hours'] = args.hours
    if hasattr(args, 'limit'):
        options['limit'] = args.limit
    if hasattr(args, 'status') and args.status:
        options['status'] = args.status
    if hasattr(args, 'type') and args.type:
        options['type'] = args.type
    if hasattr(args, 'logs_only'):
        options['logs_only'] = args.logs_only
    
    # Route to appropriate command handler
    try:
        if args.command == 'task':
            task.run(client, args.task_id, options)
        elif args.command == 'tasks':
            tasks.run(client, options)
        else:
            parser.print_help()
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n👋 Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Command failed: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
