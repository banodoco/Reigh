"""Task investigation command."""

from debug.client import DebugClient
from debug.formatters import Formatter


def run(client: DebugClient, task_id: str, options: dict):
    """Handle 'debug.py task <id>' command."""
    try:
        info = client.get_task_info(task_id)
        
        format_type = options.get('format', 'text')
        logs_only = options.get('logs_only', False)
        
        output = Formatter.format_task(info, format_type, logs_only)
        print(output)
        
    except Exception as e:
        print(f"❌ Error investigating task: {e}")
        import traceback
        if options.get('debug'):
            traceback.print_exc()









