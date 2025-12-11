"""Tasks analysis command."""

from debug.client import DebugClient
from debug.formatters import Formatter


def run(client: DebugClient, options: dict):
    """Handle 'debug.py tasks' command."""
    try:
        limit = options.get('limit', 50)
        status = options.get('status')
        task_type = options.get('type')
        hours = options.get('hours')
        
        summary = client.get_recent_tasks(
            limit=limit,
            status=status,
            task_type=task_type,
            hours=hours
        )
        
        format_type = options.get('format', 'text')
        output = Formatter.format_tasks_summary(summary, format_type)
        print(output)
        
    except Exception as e:
        print(f"❌ Error analyzing tasks: {e}")
        import traceback
        if options.get('debug'):
            traceback.print_exc()









