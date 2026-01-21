"""Debug client for querying task data from Supabase."""

import os
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from collections import Counter
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from supabase import create_client
from debug.models import TaskInfo, TasksSummary


class DebugClient:
    """Client for debugging task data."""
    
    def __init__(self):
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment")
        
        self.supabase = create_client(supabase_url, supabase_key)
    
    def get_task_info(self, task_id: str) -> TaskInfo:
        """Get complete task information with all related context."""
        # Get task state from DB
        result = self.supabase.table('tasks').select('*').eq('id', task_id).execute()
        state = result.data[0] if result.data else None
        
        # Initialize TaskInfo with basic data
        info = TaskInfo(
            task_id=task_id,
            state=state,
            logs=[]
        )
        
        if not state:
            return info
        
        # Fetch all related data in parallel-ish manner
        info.logs = self._get_task_logs(task_id)
        info.generation = self._get_generation_for_task(task_id)
        info.worker = self._get_worker_info(state.get('worker_id'))
        info.credit_entries = self._get_credit_entries(task_id)
        info.predecessor_tasks = self._get_predecessor_tasks(state.get('dependant_on'))
        info.dependent_tasks = self._get_dependent_tasks(task_id)
        
        # Get variants if we have a generation
        if info.generation:
            info.variants = self._get_variants(info.generation.get('id'))
            info.shot_associations = self._get_shot_associations(info.generation.get('id'))
        
        # Get orchestrator relationships based on task type
        task_type = state.get('task_type', '')
        params = state.get('params', {}) or {}
        
        if task_type in ['travel_segment', 'join_clips_segment']:
            # This is a child task - get parent orchestrator
            orchestrator_id = params.get('orchestrator_task_id') or params.get('orchestrator_task_id_ref')
            if orchestrator_id:
                info.orchestrator_task = self._get_task_summary(orchestrator_id)
            
            # Get sibling tasks in the same run
            run_id = params.get('orchestrator_run_id')
            if run_id:
                info.run_siblings = self._get_run_siblings(run_id, task_id)
                
        elif task_type in ['travel_orchestrator', 'join_clips_orchestrator']:
            # This is a parent - get child tasks
            run_id = params.get('run_id')
            if run_id:
                info.child_tasks = self._get_child_tasks(run_id)
        
        return info
    
    def _get_task_logs(self, task_id: str) -> List[Dict[str, Any]]:
        """Get logs from system_logs table."""
        try:
            result = self.supabase.table('system_logs').select('*').eq('task_id', task_id).order('timestamp').execute()
            return result.data or []
        except:
            return []
    
    def _get_generation_for_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get generation created by this task."""
        try:
            # Method 1: Check params for generation_id first (most reliable)
            task_result = self.supabase.table('tasks').select('params').eq('id', task_id).execute()
            if task_result.data:
                params = task_result.data[0].get('params', {}) or {}
                gen_id = params.get('generation_id')
                if gen_id:
                    gen_result = self.supabase.table('generations').select('*').eq('id', gen_id).execute()
                    if gen_result.data:
                        return gen_result.data[0]
            
            # Method 2: Use RPC or raw SQL to find generation with task_id in tasks array
            # The tasks column is JSONB, so we use the ? operator via filter
            try:
                # Try using the filter with proper JSONB syntax
                result = self.supabase.rpc('get_generation_by_task_id', {'p_task_id': task_id}).execute()
                if result.data:
                    return result.data[0] if isinstance(result.data, list) else result.data
            except:
                pass
            
            # Method 3: Fallback - query all recent generations and check client-side
            # This is less efficient but works without RPC
            try:
                recent_gens = self.supabase.table('generations').select('*').order('created_at', desc=True).limit(100).execute()
                for gen in (recent_gens.data or []):
                    tasks_array = gen.get('tasks', []) or []
                    if task_id in tasks_array:
                        return gen
            except:
                pass
            
            return None
        except Exception as e:
            print(f"  [debug] Error fetching generation: {e}")
            return None
    
    def _get_variants(self, generation_id: str) -> List[Dict[str, Any]]:
        """Get all variants for a generation."""
        if not generation_id:
            return []
        try:
            result = self.supabase.table('generation_variants').select('*').eq('generation_id', generation_id).order('created_at').execute()
            return result.data or []
        except:
            return []
    
    def _get_worker_info(self, worker_id: str) -> Optional[Dict[str, Any]]:
        """Get worker details."""
        if not worker_id:
            return None
        try:
            result = self.supabase.table('workers').select('*').eq('id', worker_id).execute()
            return result.data[0] if result.data else None
        except:
            return None
    
    def _get_credit_entries(self, task_id: str) -> List[Dict[str, Any]]:
        """Get credit ledger entries for this task."""
        try:
            result = self.supabase.table('credits_ledger').select('*').eq('task_id', task_id).order('created_at').execute()
            return result.data or []
        except:
            return []
    
    def _get_predecessor_tasks(self, dependant_on: any) -> List[Dict[str, Any]]:
        """Get the tasks this one depends on (dependant_on is now an array)."""
        if not dependant_on:
            return []
        # dependant_on is now an array of task IDs
        if isinstance(dependant_on, list):
            return [t for t in (self._get_task_summary(tid) for tid in dependant_on) if t]
        # Backward compat: single string
        task = self._get_task_summary(dependant_on)
        return [task] if task else []

    def _get_dependent_tasks(self, task_id: str) -> List[Dict[str, Any]]:
        """Get tasks that depend on this one."""
        try:
            # dependant_on is now an array - use contains filter
            result = self.supabase.table('tasks').select(
                'id, task_type, status, created_at, generation_processed_at'
            ).contains('dependant_on', [task_id]).order('created_at').execute()
            return result.data or []
        except:
            return []
    
    def _get_task_summary(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a summary of a task (for relationships)."""
        if not task_id:
            return None
        try:
            result = self.supabase.table('tasks').select(
                'id, task_type, status, created_at, generation_processed_at, output_location, error_message, worker_id'
            ).eq('id', task_id).execute()
            return result.data[0] if result.data else None
        except:
            return None
    
    def _get_shot_associations(self, generation_id: str) -> List[Dict[str, Any]]:
        """Get shot associations for a generation."""
        if not generation_id:
            return []
        try:
            result = self.supabase.table('shot_generations').select(
                '*, shot:shots(id, name)'
            ).eq('generation_id', generation_id).execute()
            return result.data or []
        except:
            return []
    
    def _get_run_siblings(self, run_id: str, exclude_task_id: str) -> List[Dict[str, Any]]:
        """Get other tasks in the same run (for segments)."""
        try:
            # Query for tasks with matching orchestrator_run_id in params
            result = self.supabase.rpc('get_tasks_by_run_id', {
                'p_run_id': run_id,
                'p_exclude_task_id': exclude_task_id
            }).execute()
            
            if result.data:
                return result.data
            
            # Fallback: manual query (less efficient but works without RPC)
            all_tasks = self.supabase.table('tasks').select(
                'id, task_type, status, created_at, generation_processed_at, params, output_location'
            ).in_('task_type', ['travel_segment', 'join_clips_segment']).order('created_at').limit(100).execute()
            
            siblings = []
            for task in (all_tasks.data or []):
                params = task.get('params', {}) or {}
                if params.get('orchestrator_run_id') == run_id and task.get('id') != exclude_task_id:
                    siblings.append(task)
            
            return siblings
        except:
            return []
    
    def _get_child_tasks(self, run_id: str) -> List[Dict[str, Any]]:
        """Get child tasks for an orchestrator run."""
        try:
            # Try RPC first
            result = self.supabase.rpc('get_tasks_by_run_id', {
                'p_run_id': run_id,
                'p_exclude_task_id': None
            }).execute()
            
            if result.data:
                return result.data
            
            # Fallback: manual query
            all_tasks = self.supabase.table('tasks').select(
                'id, task_type, status, created_at, generation_processed_at, params, output_location, error_message'
            ).in_('task_type', ['travel_segment', 'join_clips_segment']).order('created_at').limit(100).execute()
            
            children = []
            for task in (all_tasks.data or []):
                params = task.get('params', {}) or {}
                if params.get('orchestrator_run_id') == run_id:
                    # Extract segment index for ordering
                    task['segment_index'] = params.get('segment_index') or params.get('sequence_index')
                    children.append(task)
            
            # Sort by segment index
            children.sort(key=lambda t: t.get('segment_index') or 0)
            return children
        except:
            return []
    
    def get_logs(
        self,
        limit: Optional[int] = None,  # None = fetch all (paginated)
        source_type: Optional[str] = None,
        session_id: Optional[str] = None,
        level: Optional[str] = None,
        hours: Optional[int] = None,
        latest_session: bool = False,
        tag: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get logs from system_logs table with filters. Auto-paginates if limit is None."""
        # If latest_session, first find the most recent browser session
        if latest_session:
            session_id = self._get_latest_browser_session()
            if not session_id:
                return {'logs': [], 'session_id': None, 'message': 'No browser sessions found'}
            source_type = 'browser'  # Implied when using latest_session
        
        PAGE_SIZE = 1000  # Supabase max per query
        all_logs = []
        offset = 0
        max_pages = 100  # Safety limit: 100k logs max
        
        while True:
            # Build query
            query = self.supabase.table('system_logs').select('*')
            
            if source_type:
                query = query.eq('source_type', source_type)
            if session_id:
                query = query.eq('source_id', session_id)
            if level:
                query = query.eq('log_level', level.upper())
            if hours:
                cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
                query = query.gte('timestamp', cutoff.isoformat())
            if tag:
                # Filter by tag in message (case-insensitive search)
                query = query.ilike('message', f'%[{tag}%')
            
            # Determine how many to fetch this page
            if limit is not None:
                remaining = limit - len(all_logs)
                fetch_count = min(PAGE_SIZE, remaining)
            else:
                fetch_count = PAGE_SIZE
            
            query = query.order('timestamp', desc=True).range(offset, offset + fetch_count - 1)
            result = query.execute()
            page_logs = result.data or []
            
            all_logs.extend(page_logs)
            
            # Stop conditions
            if len(page_logs) < fetch_count:
                # No more logs available
                break
            if limit is not None and len(all_logs) >= limit:
                # Reached requested limit
                break
            if offset // PAGE_SIZE >= max_pages:
                # Safety limit reached
                break
            
            offset += len(page_logs)
        
        # Reverse to show chronological order
        all_logs.reverse()
        
        return {
            'logs': all_logs,
            'session_id': session_id,
            'total_count': len(all_logs),
            'tag_filter': tag
        }
    
    def _get_latest_browser_session(self) -> Optional[str]:
        """Get the most recent browser session ID."""
        try:
            result = self.supabase.table('system_logs').select('source_id').eq(
                'source_type', 'browser'
            ).order('timestamp', desc=True).limit(1).execute()
            
            if result.data:
                return result.data[0].get('source_id')
            return None
        except:
            return None
    
    def get_browser_sessions(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent browser sessions with log counts."""
        # Manual aggregation - query recent browser logs and group by session
        try:
            logs_result = self.supabase.table('system_logs').select(
                'source_id, timestamp, log_level'
            ).eq('source_type', 'browser').order('timestamp', desc=True).limit(1000).execute()
            
            sessions = {}
            for log in (logs_result.data or []):
                sid = log.get('source_id')
                if not sid:
                    continue
                if sid not in sessions:
                    sessions[sid] = {
                        'session_id': sid,
                        'last_timestamp': log.get('timestamp'),
                        'first_timestamp': log.get('timestamp'),
                        'log_count': 0,
                        'error_count': 0
                    }
                sessions[sid]['log_count'] += 1
                if log.get('log_level') == 'ERROR':
                    sessions[sid]['error_count'] += 1
                # Update first_timestamp (logs are desc, so this becomes earliest)
                sessions[sid]['first_timestamp'] = log.get('timestamp')
            
            # Sort by last timestamp and limit
            sorted_sessions = sorted(
                sessions.values(), 
                key=lambda s: s['last_timestamp'] or '', 
                reverse=True
            )[:limit]
            
            return sorted_sessions
        except Exception as e:
            print(f"  [debug] Error fetching browser sessions: {e}")
            return []

    def get_recent_tasks(
        self,
        limit: int = 50,
        status: Optional[str] = None,
        task_type: Optional[str] = None,
        hours: Optional[int] = None
    ) -> TasksSummary:
        """Get recent tasks with analysis."""
        # Build query
        query = self.supabase.table('tasks').select('*')
        
        if status:
            query = query.eq('status', status)
        if task_type:
            query = query.eq('task_type', task_type)
        if hours:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            query = query.gte('created_at', cutoff.isoformat())
        
        query = query.order('created_at', desc=True).limit(limit)
        result = query.execute()
        tasks = result.data or []
        
        # Calculate statistics
        status_dist = Counter(t.get('status') for t in tasks)
        type_dist = Counter(t.get('task_type') for t in tasks)
        worker_dist = Counter(t.get('worker_id') for t in tasks if t.get('worker_id'))
        
        # Calculate timing statistics
        processing_times = []
        queue_times = []
        
        for task in tasks:
            if task.get('generation_started_at') and task.get('generation_processed_at'):
                try:
                    started = datetime.fromisoformat(task['generation_started_at'].replace('Z', '+00:00'))
                    processed = datetime.fromisoformat(task['generation_processed_at'].replace('Z', '+00:00'))
                    processing_times.append((processed - started).total_seconds())
                except:
                    pass
            
            if task.get('created_at') and task.get('generation_started_at'):
                try:
                    created = datetime.fromisoformat(task['created_at'].replace('Z', '+00:00'))
                    started = datetime.fromisoformat(task['generation_started_at'].replace('Z', '+00:00'))
                    queue_times.append((started - created).total_seconds())
                except:
                    pass
        
        timing_stats = {
            'avg_processing_seconds': sum(processing_times) / len(processing_times) if processing_times else None,
            'avg_queue_seconds': sum(queue_times) / len(queue_times) if queue_times else None,
            'total_with_timing': len(processing_times)
        }
        
        # Collect error summaries for failed tasks
        error_summary = []
        for task in tasks:
            if task.get('status') == 'Failed':
                error_summary.append({
                    'task_id': task.get('id'),
                    'task_type': task.get('task_type'),
                    'error_message': task.get('error_message'),
                    'output_location': task.get('output_location'),
                    'created_at': task.get('created_at'),
                })
        
        return TasksSummary(
            tasks=tasks,
            total_count=len(tasks),
            status_distribution=dict(status_dist),
            task_type_distribution=dict(type_dist),
            timing_stats=timing_stats,
            worker_distribution=dict(worker_dist),
            error_summary=error_summary[:10]  # Top 10 errors
        )
