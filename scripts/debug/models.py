"""Data models for debug tool."""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class TaskInfo:
    """Complete task information with all related context."""
    task_id: str
    state: Optional[Dict[str, Any]]
    logs: List[Dict[str, Any]]
    
    # Related data
    generation: Optional[Dict[str, Any]] = None
    variants: List[Dict[str, Any]] = field(default_factory=list)
    worker: Optional[Dict[str, Any]] = None
    credit_entries: List[Dict[str, Any]] = field(default_factory=list)
    
    # Relationships
    orchestrator_task: Optional[Dict[str, Any]] = None  # For segments: parent orchestrator
    child_tasks: List[Dict[str, Any]] = field(default_factory=list)  # For orchestrators: child segments
    run_siblings: List[Dict[str, Any]] = field(default_factory=list)  # Other tasks in same run
    dependent_tasks: List[Dict[str, Any]] = field(default_factory=list)  # Tasks that depend on this one
    predecessor_tasks: List[Dict[str, Any]] = field(default_factory=list)  # Tasks this depends on (dependant_on array)
    
    # Shot associations
    shot_associations: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'task_id': self.task_id,
            'state': self.state,
            'logs': self.logs,
            'generation': self.generation,
            'variants': self.variants,
            'worker': self.worker,
            'credit_entries': self.credit_entries,
            'orchestrator_task': self.orchestrator_task,
            'child_tasks': self.child_tasks,
            'run_siblings': self.run_siblings,
            'dependent_tasks': self.dependent_tasks,
            'predecessor_tasks': self.predecessor_tasks,
            'shot_associations': self.shot_associations,
        }


@dataclass
class TasksSummary:
    """Summary of multiple tasks."""
    tasks: List[Dict[str, Any]]
    total_count: int
    status_distribution: Dict[str, int]
    task_type_distribution: Dict[str, int]
    timing_stats: Dict[str, Any]
    worker_distribution: Dict[str, int] = field(default_factory=dict)
    error_summary: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'tasks': self.tasks,
            'total_count': self.total_count,
            'status_distribution': self.status_distribution,
            'task_type_distribution': self.task_type_distribution,
            'timing_stats': self.timing_stats,
            'worker_distribution': self.worker_distribution,
            'error_summary': self.error_summary,
        }
