import type {
  TimelineCommandHistoryMetadata,
  TimelineCommandTransaction,
} from '@/tools/video-editor/commands/index.ts';
import type { AssetRegistry, TimelineConfig } from './index.ts';

export type UndoSnapshot = {
  config: TimelineConfig;
  registry?: AssetRegistry;
  signature: string;
};

export type UndoEntry = {
  /** In-memory ownership only; an unacknowledged native edit has no snapshot save fallback. */
  nativeRegistration?: {
    owner: import('../lib/timeline-data.ts').TimelineData;
    inverse?: import('@/integrations/runtime/generated.ts').EditCommand;
    /** Exact original selected-media add only; Redo repeats authority validation. */
    mediaReplay?: import('@/integrations/runtime/generated.ts').EditCommand;
  };
  snapshot: UndoSnapshot;
  timestamp: string;
  label?: string;
  transactionId?: string;
  command?: {
    history: TimelineCommandHistoryMetadata;
    undoTransaction: TimelineCommandTransaction;
    redoTransaction: TimelineCommandTransaction;
  };
};

export type CheckpointTriggerType =
  | 'session_boundary'
  | 'edit_distance'
  | 'semantic'
  | 'manual';

export type Checkpoint = {
  id: string;
  timelineId: string;
  config: TimelineConfig;
  createdAt: string;
  triggerType: CheckpointTriggerType;
  label: string;
  editsSinceLastCheckpoint: number;
};
