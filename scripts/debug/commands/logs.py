"""Logs viewing command."""

import json
from datetime import datetime
from debug.client import DebugClient


def run(client: DebugClient, options: dict):
    """Handle 'debug.py logs' command."""
    try:
        # Handle sessions subcommand
        if options.get('sessions'):
            sessions = client.get_browser_sessions(limit=options.get('limit', 10))
            _print_sessions(sessions, options.get('format', 'text'))
            return
        
        # Get logs with filters (limit=0 or None means fetch all, paginated)
        limit = options.get('limit', 5000)
        if limit == 0:
            limit = None  # Unlimited
        
        result = client.get_logs(
            limit=limit,
            source_type=options.get('source'),
            session_id=options.get('session'),
            level=options.get('level'),
            hours=options.get('hours'),
            latest_session=options.get('latest', False),
            tag=options.get('tag')
        )
        
        format_type = options.get('format', 'text')
        
        if format_type == 'json':
            print(json.dumps(result, indent=2, default=str))
        else:
            _print_logs_text(result, options)
        
    except Exception as e:
        print(f"❌ Error fetching logs: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()


def _print_logs_text(result: dict, options: dict):
    """Print logs in human-readable format."""
    logs = result.get('logs', [])
    session_id = result.get('session_id')
    tag_filter = result.get('tag_filter')
    
    print("=" * 80)
    
    if session_id:
        print(f"📜 BROWSER SESSION: {session_id}")
    else:
        source = options.get('source', 'all')
        print(f"📜 SYSTEM LOGS ({source})")
    
    if tag_filter:
        print(f"🏷️  Tag filter: [{tag_filter}*]")
    
    print("=" * 80)
    
    if result.get('message'):
        print(f"\n⚠️  {result['message']}")
        return
    
    if not logs:
        print("\n  No logs found matching filters")
        return
    
    print(f"\n  Showing {len(logs)} log entries (chronological)\n")
    
    # Group logs by minute for readability
    current_minute = None
    
    for log in logs:
        timestamp = log.get('timestamp', '')
        
        # Show minute separator
        if len(timestamp) >= 16:
            minute = timestamp[:16]  # YYYY-MM-DDTHH:MM
            if minute != current_minute:
                current_minute = minute
                print(f"\n  ─── {timestamp[:10]} {timestamp[11:16]} ───")
        
        # Format log line
        time_part = timestamp[11:19] if len(timestamp) >= 19 else timestamp
        level = log.get('log_level', 'INFO')
        source_type = log.get('source_type', 'unknown')
        source_id = log.get('source_id', '')
        message = log.get('message', '')
        
        # Level symbol
        level_symbol = {
            'ERROR': '❌',
            'WARNING': '⚠️ ',
            'INFO': 'ℹ️ ',
            'DEBUG': '🔍',
            'CRITICAL': '🔥'
        }.get(level, '  ')
        
        # Truncate source_id for display
        if source_type == 'browser':
            source_display = 'browser'
        else:
            source_display = source_id[:15] if source_id else source_type
        
        # Truncate message if very long
        if len(message) > 120:
            message = message[:117] + "..."
        
        print(f"  [{time_part}] {level_symbol} [{source_display:15}] {message}")
    
    print("\n" + "=" * 80)
    
    # Show hint for browser sessions
    if options.get('source') == 'browser' and not session_id:
        print("\n💡 Tip: Use --latest for most recent session, or --sessions to list sessions")


def _print_sessions(sessions: list, format_type: str):
    """Print browser sessions list."""
    if format_type == 'json':
        print(json.dumps(sessions, indent=2, default=str))
        return
    
    print("=" * 80)
    print("📱 BROWSER SESSIONS")
    print("=" * 80)
    
    if not sessions:
        print("\n  No browser sessions found")
        return
    
    print(f"\n  Found {len(sessions)} recent sessions\n")
    
    for i, session in enumerate(sessions):
        session_id = session.get('session_id', 'unknown')
        log_count = session.get('log_count', 0)
        error_count = session.get('error_count', 0)
        last_ts = session.get('last_timestamp', '')
        
        # Parse timestamp for display
        if last_ts:
            time_display = last_ts[:19].replace('T', ' ')
        else:
            time_display = 'unknown'
        
        # Show recent indicator
        recent = "🟢" if i == 0 else "  "
        
        # Error indicator
        error_str = f" ({error_count} errors)" if error_count > 0 else ""
        
        print(f"  {recent} {session_id}")
        print(f"       Last activity: {time_display}")
        print(f"       Logs: {log_count}{error_str}")
        print()
    
    print("=" * 80)
    print("\n💡 To view a session: debug.py logs --session <session_id>")
    print("   Or for latest:     debug.py logs --latest")
