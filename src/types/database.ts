// Database types extracted from schema - for TypeScript only
// This file provides type safety without Drizzle ORM dependencies

// Enums
export const TASK_STATUS = {
  QUEUED: 'Queued',
  IN_PROGRESS: 'In Progress', 
  COMPLETE: 'Complete',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled'
} as const;

export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];

export const CREDIT_LEDGER_TYPE = {
  STRIPE: 'stripe',
  MANUAL: 'manual',
  SPEND: 'spend', 
  REFUND: 'refund'
} as const;

export type CreditLedgerType = typeof CREDIT_LEDGER_TYPE[keyof typeof CREDIT_LEDGER_TYPE];

// Core table types (matching your database structure)
export interface User {
  id: string;
  name?: string;
  email?: string;
  username?: string;
  api_keys?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  credits: number;
}

export interface Project {
  id: string;
  name: string;
  user_id: string;
  aspect_ratio: string;
  created_at: string;
  updated_at?: string;
  settings?: Record<string, unknown>;
}

export interface Shot {
  id: string;
  name: string;
  project_id: string;
  aspect_ratio?: string | null;
  created_at: string;
  updated_at?: string;
  settings?: Record<string, unknown>;
}

export interface Generation {
  id: string;
  location?: string;
  type?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
  params?: Record<string, unknown>;
  project_id: string;
  tasks?: string[];
  starred?: boolean;
  name?: string; // Optional variant name
}

export interface ShotGeneration {
  id: string;
  shot_id: string;
  generation_id: string;
  timeline_frame?: number; // Now nullable for unpositioned associations
}

export interface Task {
  id: string;
  taskType: string;
  params: Record<string, unknown>;
  status: TaskStatus;
  dependantOn?: string[];
  outputLocation?: string;
  createdAt: string;
  updatedAt?: string;
  projectId: string;
  costCents?: number;
  generationStartedAt?: string;
  generationProcessedAt?: string;
}

export interface Worker {
  id: string;
  last_heartbeat: string;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface CreditLedger {
  id: string;
  user_id: string;
  amount: number;
  type: CreditLedgerType;
  description?: string;
  created_at: string;
  stripe_payment_intent_id?: string;
}



export interface UserAPIToken {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
}

export interface Resource {
  id: string;
  user_id: string;
  type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Training data types
export interface TrainingDataBatch {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface TrainingData {
  id: string;
  batch_id: string;
  filename: string;
  url: string;
}

export interface TrainingDataSegment {
  id: string;
  video_id: string;
  start_time: number;
  end_time: number;
} 