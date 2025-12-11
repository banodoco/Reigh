"""Output formatting for debug data."""

import json
from datetime import datetime, timezone
from typing import Dict, Any, List
from debug.models import TaskInfo, TasksSummary


class Formatter:
    """Output formatting for debug data."""
    
    @staticmethod
    def format_task(info: TaskInfo, format_type: str = 'text', logs_only: bool = False) -> str:
        """Format task information."""
        if format_type == 'json':
            return json.dumps(info.to_dict(), indent=2, default=str)
        
        if logs_only:
            return Formatter._format_task_logs_only(info)
        
        return Formatter._format_task_text(info)
    
    @staticmethod
    def _format_task_text(info: TaskInfo) -> str:
        """Format task info as human-readable text."""
        lines = []
        
        lines.append("=" * 80)
        lines.append(f"📋 TASK: {info.task_id}")
        lines.append("=" * 80)
        
        if not info.state:
            lines.append("\n❌ Task not found in database")
            return "\n".join(lines)
        
        task = info.state
        
        # Overview section
        lines.append("\n🏷️  Overview")
        lines.append(f"   Status: {task.get('status', 'Unknown')}")
        lines.append(f"   Type: {task.get('task_type', 'Unknown')}")
        lines.append(f"   Project: {task.get('project_id', 'Unknown')}")
        
        # Worker info
        if info.worker:
            worker = info.worker
            lines.append(f"   Worker: {worker.get('id', 'Unknown')[:40]}")
            lines.append(f"   Worker Status: {worker.get('status', 'Unknown')}")
            if worker.get('metadata'):
                meta = worker['metadata']
                if isinstance(meta, dict):
                    if meta.get('gpu_type'):
                        lines.append(f"   GPU: {meta.get('gpu_type')}")
                    if meta.get('gpu_memory_gb'):
                        lines.append(f"   GPU Memory: {meta.get('gpu_memory_gb')} GB")
        elif task.get('worker_id'):
            lines.append(f"   Worker ID: {task.get('worker_id')[:40]}")
        
        # Cost info
        if task.get('cost_in_credits'):
            lines.append(f"   Cost: {task.get('cost_in_credits')} credits")
        
        # Timing section
        lines.append("\n⏱️  Timing")
        created_at = task.get('created_at')
        started_at = task.get('generation_started_at')
        processed_at = task.get('generation_processed_at')
        
        if created_at:
            lines.append(f"   Created: {created_at}")
            
            if started_at:
                try:
                    created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    started = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
                    queue_seconds = (started - created).total_seconds()
                    lines.append(f"   Started: {started_at} (queue: {queue_seconds:.1f}s)")
                    
                    if processed_at:
                        processed = datetime.fromisoformat(processed_at.replace('Z', '+00:00'))
                        processing_seconds = (processed - started).total_seconds()
                        total_seconds = (processed - created).total_seconds()
                        lines.append(f"   Processed: {processed_at} (processing: {processing_seconds:.1f}s)")
                        lines.append(f"   Total: {total_seconds:.1f}s")
                    else:
                        now = datetime.now(timezone.utc)
                        running_seconds = (now - started).total_seconds()
                        lines.append(f"   ⚠️  Still running ({running_seconds:.1f}s elapsed)")
                except Exception as e:
                    lines.append(f"   Error parsing timestamps: {e}")
            else:
                lines.append("   ⚠️  Never started")
        
        # Error section (prominently displayed for failed tasks)
        if task.get('status') == 'Failed':
            lines.append("\n❌ ERROR")
            if task.get('error_message'):
                error_msg = task.get('error_message')
                # Wrap long error messages
                if len(error_msg) > 200:
                    lines.append(f"   {error_msg[:200]}...")
                    lines.append(f"   ...{error_msg[200:]}")
                else:
                    lines.append(f"   {error_msg}")
            elif task.get('output_location') and 'error' in str(task.get('output_location', '')).lower():
                lines.append(f"   {task.get('output_location')}")
            else:
                lines.append("   No error message recorded")
        
        # Relationships section
        has_relationships = any([
            info.orchestrator_task,
            info.child_tasks,
            info.run_siblings,
            info.predecessor_task,
            info.dependent_tasks
        ])
        
        if has_relationships:
            lines.append("\n🔗 Relationships")
            
            if info.orchestrator_task:
                orch = info.orchestrator_task
                lines.append(f"   Parent Orchestrator: {orch.get('id', '')[:20]}...")
                lines.append(f"      Status: {orch.get('status')} | Type: {orch.get('task_type')}")
            
            if info.child_tasks:
                lines.append(f"   Child Tasks: {len(info.child_tasks)}")
                status_counts = {}
                for child in info.child_tasks:
                    status = child.get('status', 'Unknown')
                    status_counts[status] = status_counts.get(status, 0) + 1
                lines.append(f"      Status breakdown: {status_counts}")
                
                # Show first few children
                for i, child in enumerate(info.child_tasks[:5]):
                    seg_idx = child.get('segment_index', i)
                    lines.append(f"      [{seg_idx}] {child.get('id', '')[:12]}... {child.get('status')}")
                if len(info.child_tasks) > 5:
                    lines.append(f"      ... and {len(info.child_tasks) - 5} more")
            
            if info.run_siblings:
                lines.append(f"   Run Siblings: {len(info.run_siblings)} other tasks in same run")
                status_counts = {}
                for sib in info.run_siblings:
                    status = sib.get('status', 'Unknown')
                    status_counts[status] = status_counts.get(status, 0) + 1
                lines.append(f"      Status breakdown: {status_counts}")
            
            if info.predecessor_task:
                pred = info.predecessor_task
                lines.append(f"   Depends On: {pred.get('id', '')[:20]}...")
                lines.append(f"      Status: {pred.get('status')} | Type: {pred.get('task_type')}")
            
            if info.dependent_tasks:
                lines.append(f"   Blocking Tasks: {len(info.dependent_tasks)} tasks depend on this")
                for dep in info.dependent_tasks[:3]:
                    lines.append(f"      → {dep.get('id', '')[:12]}... ({dep.get('task_type')}) - {dep.get('status')}")
        
        # Generation section
        if info.generation:
            gen = info.generation
            lines.append("\n🖼️  Generation")
            lines.append(f"   ID: {gen.get('id')}")
            lines.append(f"   Type: {gen.get('type')}")
            if gen.get('location'):
                lines.append(f"   Location: {gen.get('location')}")
            if gen.get('based_on'):
                lines.append(f"   Based On: {gen.get('based_on')}")
            if gen.get('parent_generation_id'):
                lines.append(f"   Parent: {gen.get('parent_generation_id')} (child_order: {gen.get('child_order')})")
            if gen.get('is_child'):
                lines.append(f"   Is Child: Yes")
            
            # Variants
            if info.variants:
                lines.append(f"   Variants: {len(info.variants)}")
                for var in info.variants:
                    primary = "★" if var.get('is_primary') else " "
                    lines.append(f"      {primary} {var.get('variant_type', 'unknown')}: {var.get('id', '')[:12]}...")
            
            # Shot associations
            if info.shot_associations:
                lines.append(f"   Shots: {len(info.shot_associations)}")
                for assoc in info.shot_associations:
                    shot = assoc.get('shot', {})
                    lines.append(f"      → {shot.get('name', 'Unknown')} (frame: {assoc.get('timeline_frame')})")
        
        # Credit entries
        if info.credit_entries:
            lines.append("\n💰 Credits")
            total = sum(float(e.get('amount', 0)) for e in info.credit_entries)
            lines.append(f"   Total: {total:.2f} credits")
            for entry in info.credit_entries:
                lines.append(f"   {entry.get('type', 'unknown')}: {entry.get('amount')} ({entry.get('created_at', '')[:19]})")
        
        # Event Timeline from logs
        if info.logs:
            lines.append("\n📜 Event Timeline (from system_logs)")
            lines.append(f"   Found {len(info.logs)} log entries")
            lines.append("")
            
            for log in info.logs[:50]:  # Show first 50
                timestamp = log['timestamp'][11:19] if len(log.get('timestamp', '')) >= 19 else log.get('timestamp', '')
                level = log.get('log_level', 'INFO')
                source = log.get('source_id', 'unknown')[:20]
                message = log.get('message', '')[:100]
                
                level_symbol = {
                    'ERROR': '❌',
                    'WARNING': '⚠️',
                    'INFO': 'ℹ️',
                    'DEBUG': '🔍',
                    'CRITICAL': '🔥'
                }.get(level, '  ')
                
                lines.append(f"   [{timestamp}] {level_symbol} [{level:8}] [{source:20}] {message}")
            
            if len(info.logs) > 50:
                lines.append(f"\n   ... and {len(info.logs) - 50} more log entries")
        else:
            lines.append("\n📜 Event Timeline")
            lines.append("   No logs found for this task")
        
        # Parameters (moved to end, truncated)
        params = task.get('params')
        if params:
            lines.append("\n📝 Parameters (truncated)")
            if isinstance(params, dict):
                # Prioritize important params
                priority_keys = ['prompt', 'base_prompt', 'shot_id', 'generation_id', 'orchestrator_task_id', 'orchestrator_run_id', 'segment_index']
                shown = set()
                
                for key in priority_keys:
                    if key in params:
                        value_str = str(params[key])
                        if len(value_str) > 80:
                            value_str = value_str[:80] + "..."
                        lines.append(f"   {key}: {value_str}")
                        shown.add(key)
                
                # Show a few more
                remaining = [(k, v) for k, v in params.items() if k not in shown]
                for key, value in remaining[:5]:
                    value_str = str(value)
                    if len(value_str) > 80:
                        value_str = value_str[:80] + "..."
                    lines.append(f"   {key}: {value_str}")
                
                remaining_count = len(params) - len(shown) - 5
                if remaining_count > 0:
                    lines.append(f"   ... and {remaining_count} more parameters")
        
        # Output / Success
        if task.get('status') == 'Complete' and task.get('output_location'):
            output_location = task.get('output_location')
            if 'error' not in output_location.lower():
                lines.append("\n✅ Output")
                lines.append(f"   {output_location}")
        
        lines.append("\n" + "=" * 80)
        
        return "\n".join(lines)
    
    @staticmethod
    def _format_task_logs_only(info: TaskInfo) -> str:
        """Format only the task logs timeline."""
        lines = []
        
        lines.append(f"📜 Event Timeline for Task: {info.task_id}")
        lines.append("=" * 80)
        
        if not info.logs:
            lines.append("No logs found")
            return "\n".join(lines)
        
        for log in info.logs:
            timestamp = log['timestamp'][11:19] if len(log.get('timestamp', '')) >= 19 else log.get('timestamp', '')
            level = log.get('log_level', 'INFO')
            message = log.get('message', '')
            
            lines.append(f"[{timestamp}] [{level:8}] {message}")
        
        return "\n".join(lines)
    
    @staticmethod
    def format_tasks_summary(summary: TasksSummary, format_type: str = 'text') -> str:
        """Format tasks summary."""
        if format_type == 'json':
            return json.dumps(summary.to_dict(), indent=2, default=str)
        
        lines = []
        
        lines.append("=" * 80)
        lines.append("📊 RECENT TASKS ANALYSIS")
        lines.append("=" * 80)
        
        lines.append(f"\n📈 Overview")
        lines.append(f"   Total tasks: {summary.total_count}")
        
        if summary.tasks:
            oldest = summary.tasks[-1].get('created_at', '')
            newest = summary.tasks[0].get('created_at', '')
            lines.append(f"   Time range: {oldest[:19]} to {newest[:19]}")
        
        # Status Distribution
        lines.append(f"\n📊 Status Distribution")
        for status, count in sorted(summary.status_distribution.items()):
            percentage = (count / summary.total_count * 100) if summary.total_count > 0 else 0
            lines.append(f"   {status}: {count} ({percentage:.1f}%)")
        
        # Task Types
        if summary.task_type_distribution:
            lines.append(f"\n🔧 Task Types")
            sorted_types = sorted(summary.task_type_distribution.items(), key=lambda x: x[1], reverse=True)
            for task_type, count in sorted_types[:10]:
                percentage = (count / summary.total_count * 100) if summary.total_count > 0 else 0
                lines.append(f"   {task_type}: {count} ({percentage:.1f}%)")
        
        # Worker Distribution
        if summary.worker_distribution:
            lines.append(f"\n🖥️  Workers ({len(summary.worker_distribution)} active)")
            sorted_workers = sorted(summary.worker_distribution.items(), key=lambda x: x[1], reverse=True)
            for worker_id, count in sorted_workers[:5]:
                lines.append(f"   {worker_id[:30]}...: {count} tasks")
        
        # Timing Analysis
        timing = summary.timing_stats
        if timing.get('avg_processing_seconds') or timing.get('avg_queue_seconds'):
            lines.append(f"\n⏱️  Timing Analysis")
            if timing.get('avg_queue_seconds'):
                lines.append(f"   Avg Queue Time: {timing['avg_queue_seconds']:.1f}s")
            if timing.get('avg_processing_seconds'):
                lines.append(f"   Avg Processing Time: {timing['avg_processing_seconds']:.1f}s")
            lines.append(f"   Tasks with timing: {timing['total_with_timing']}")
        
        # Error Summary
        if summary.error_summary:
            lines.append(f"\n❌ Recent Errors ({len(summary.error_summary)})")
            for err in summary.error_summary[:5]:
                lines.append(f"   {err.get('task_id', '')[:12]}... ({err.get('task_type')})")
                if err.get('error_message'):
                    msg = err['error_message'][:60] + "..." if len(err.get('error_message', '')) > 60 else err.get('error_message', '')
                    lines.append(f"      → {msg}")
        
        lines.append("\n" + "=" * 80)
        
        return "\n".join(lines)
