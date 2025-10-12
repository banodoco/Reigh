export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      credits_ledger: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json | null
          task_id: string | null
          type: Database["public"]["Enums"]["credit_ledger_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id?: string | null
          type: Database["public"]["Enums"]["credit_ledger_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id?: string | null
          type?: Database["public"]["Enums"]["credit_ledger_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_ledger_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "active_workers_health"
            referencedColumns: ["current_task_id"]
          },
          {
            foreignKeyName: "credits_ledger_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "normalized_task_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_ledger_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recent_task_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_ledger_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "referral_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_credit_balance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "credits_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          based_on: string | null
          created_at: string
          id: string
          location: string | null
          name: string | null
          params: Json | null
          project_id: string
          starred: boolean
          tasks: Json | null
          thumbnail_url: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          based_on?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string | null
          params?: Json | null
          project_id: string
          starred?: boolean
          tasks?: Json | null
          thumbnail_url?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          based_on?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string | null
          params?: Json | null
          project_id?: string
          starred?: boolean
          tasks?: Json | null
          thumbnail_url?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_based_on_fkey"
            columns: ["based_on"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          aspect_ratio: string | null
          created_at: string
          id: string
          name: string
          settings: Json | null
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string
          id?: string
          name: string
          settings?: Json | null
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string
          id?: string
          name?: string
          settings?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "referral_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_credit_balance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "projects_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_sessions: {
        Row: {
          converted_at: string | null
          converted_user_id: string | null
          first_visit_at: string | null
          id: string
          is_latest_referrer: boolean | null
          last_visit_at: string | null
          referrer_user_id: string | null
          referrer_username: string
          session_id: string | null
          visit_count: number | null
          visitor_fingerprint: string | null
          visitor_ip: unknown | null
        }
        Insert: {
          converted_at?: string | null
          converted_user_id?: string | null
          first_visit_at?: string | null
          id?: string
          is_latest_referrer?: boolean | null
          last_visit_at?: string | null
          referrer_user_id?: string | null
          referrer_username: string
          session_id?: string | null
          visit_count?: number | null
          visitor_fingerprint?: string | null
          visitor_ip?: unknown | null
        }
        Update: {
          converted_at?: string | null
          converted_user_id?: string | null
          first_visit_at?: string | null
          id?: string
          is_latest_referrer?: boolean | null
          last_visit_at?: string | null
          referrer_user_id?: string | null
          referrer_username?: string
          session_id?: string | null
          visit_count?: number | null
          visitor_fingerprint?: string | null
          visitor_ip?: unknown | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_sessions_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "referral_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_sessions_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "user_credit_balance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "referral_sessions_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_sessions_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "referral_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_sessions_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_credit_balance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "referral_sessions_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          referred_id: string
          referrer_id: string
          referrer_username: string
          session_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          referred_id: string
          referrer_id: string
          referrer_username: string
          session_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          referred_id?: string
          referrer_id?: string
          referrer_username?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "referral_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "user_credit_balance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referral_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "user_credit_balance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "referral_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata: Json
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "referral_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_credit_balance"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resources_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      shot_generations: {
        Row: {
          created_at: string | null
          generation_id: string
          id: string
          metadata: Json | null
          shot_id: string
          timeline_frame: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          generation_id: string
          id?: string
          metadata?: Json | null
          shot_id: string
          timeline_frame?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          generation_id?: string
          id?: string
          metadata?: Json | null
          shot_id?: string
          timeline_frame?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shot_generations_generation_id_generations_id_fk"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_generations_shot_id_shots_id_fk"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shot_statistics"
            referencedColumns: ["shot_id"]
          },
          {
            foreignKeyName: "shot_generations_shot_id_shots_id_fk"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          aspect_ratio: string | null
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          project_id: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shots_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_types: {
        Row: {
          base_cost_per_second: number
          billing_type: string
          category: string
          content_type: string | null
          cost_factors: Json | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          name: string
          run_type: string
          tool_type: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          base_cost_per_second: number
          billing_type?: string
          category: string
          content_type?: string | null
          cost_factors?: Json | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          name: string
          run_type?: string
          tool_type?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          base_cost_per_second?: number
          billing_type?: string
          category?: string
          content_type?: string | null
          cost_factors?: Json | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          name?: string
          run_type?: string
          tool_type?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          attempts: number
          created_at: string
          dependant_on: string | null
          error_message: string | null
          generation_created: boolean
          generation_processed_at: string | null
          generation_started_at: string | null
          id: string
          output_location: string | null
          params: Json
          project_id: string
          result_data: Json | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: string
          updated_at: string | null
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dependant_on?: string | null
          error_message?: string | null
          generation_created?: boolean
          generation_processed_at?: string | null
          generation_started_at?: string | null
          id?: string
          output_location?: string | null
          params: Json
          project_id: string
          result_data?: Json | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type: string
          updated_at?: string | null
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dependant_on?: string | null
          error_message?: string | null
          generation_created?: boolean
          generation_processed_at?: string | null
          generation_started_at?: string | null
          id?: string
          output_location?: string | null
          params?: Json
          project_id?: string
          result_data?: Json | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string
          updated_at?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "active_workers_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_performance"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_update_log: {
        Row: {
          call_source: string | null
          created_at: string | null
          generation_id: string
          id: string
          metadata: Json | null
          new_timeline_frame: number | null
          old_timeline_frame: number | null
          operation_type: string
          shot_id: string | null
        }
        Insert: {
          call_source?: string | null
          created_at?: string | null
          generation_id: string
          id?: string
          metadata?: Json | null
          new_timeline_frame?: number | null
          old_timeline_frame?: number | null
          operation_type: string
          shot_id?: string | null
        }
        Update: {
          call_source?: string | null
          created_at?: string | null
          generation_id?: string
          id?: string
          metadata?: Json | null
          new_timeline_frame?: number | null
          old_timeline_frame?: number | null
          operation_type?: string
          shot_id?: string | null
        }
        Relationships: []
      }
      training_data: {
        Row: {
          batch_id: string | null
          created_at: string
          duration: number | null
          id: string
          metadata: Json | null
          original_filename: string
          storage_location: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          duration?: number | null
          id?: string
          metadata?: Json | null
          original_filename: string
          storage_location: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          duration?: number | null
          id?: string
          metadata?: Json | null
          original_filename?: string
          storage_location?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_data_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "training_data_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      training_data_batches: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      training_data_segments: {
        Row: {
          created_at: string
          description: string | null
          end_time: number
          id: string
          metadata: Json | null
          segment_location: string | null
          start_time: number
          training_data_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_time: number
          id?: string
          metadata?: Json | null
          segment_location?: string | null
          start_time: number
          training_data_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          end_time?: number
          id?: string
          metadata?: Json | null
          segment_location?: string | null
          start_time?: number
          training_data_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_data_segments_training_data_id_fkey"
            columns: ["training_data_id"]
            isOneToOne: false
            referencedRelation: "training_data"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_tokens: {
        Row: {
          created_at: string
          id: string
          label: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          api_keys: Json | null
          auto_topup_amount: number | null
          auto_topup_enabled: boolean
          auto_topup_last_triggered: string | null
          auto_topup_threshold: number | null
          credits: number
          email: string | null
          given_credits: boolean
          id: string
          name: string | null
          onboarding: Json
          settings: Json | null
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          username: string | null
        }
        Insert: {
          api_keys?: Json | null
          auto_topup_amount?: number | null
          auto_topup_enabled?: boolean
          auto_topup_last_triggered?: string | null
          auto_topup_threshold?: number | null
          credits?: number
          email?: string | null
          given_credits?: boolean
          id: string
          name?: string | null
          onboarding?: Json
          settings?: Json | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          username?: string | null
        }
        Update: {
          api_keys?: Json | null
          auto_topup_amount?: number | null
          auto_topup_enabled?: boolean
          auto_topup_last_triggered?: string | null
          auto_topup_threshold?: number | null
          credits?: number
          email?: string | null
          given_credits?: boolean
          id?: string
          name?: string | null
          onboarding?: Json
          settings?: Json | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      workers: {
        Row: {
          created_at: string
          id: string
          instance_type: string
          last_heartbeat: string
          metadata: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          id: string
          instance_type: string
          last_heartbeat?: string
          metadata?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_type?: string
          last_heartbeat?: string
          metadata?: Json | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_workers_health: {
        Row: {
          created_at: string | null
          current_task_id: string | null
          current_task_status: string | null
          current_task_type: string | null
          health_status: string | null
          heartbeat_age_seconds: number | null
          id: string | null
          instance_type: string | null
          last_heartbeat: string | null
          status: string | null
          task_runtime_seconds: number | null
          vram_total_mb: number | null
          vram_usage_percent: number | null
          vram_used_mb: number | null
        }
        Relationships: []
      }
      normalized_task_status: {
        Row: {
          id: string | null
          normalized_status: Database["public"]["Enums"]["task_status"] | null
          original_status: Database["public"]["Enums"]["task_status"] | null
        }
        Insert: {
          id?: string | null
          normalized_status?: never
          original_status?: Database["public"]["Enums"]["task_status"] | null
        }
        Update: {
          id?: string | null
          normalized_status?: never
          original_status?: Database["public"]["Enums"]["task_status"] | null
        }
        Relationships: []
      }
      orchestrator_status: {
        Row: {
          active_workers: number | null
          completed_tasks: number | null
          error_tasks: number | null
          external_workers: number | null
          failed_tasks: number | null
          inactive_workers: number | null
          queued_tasks: number | null
          running_tasks: number | null
          snapshot_time: string | null
          stale_workers: number | null
          stuck_tasks: number | null
          terminated_workers: number | null
        }
        Relationships: []
      }
      recent_task_activity: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          generation_processed_at: string | null
          generation_started_at: string | null
          id: string | null
          processing_duration_seconds: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_type: string | null
          updated_at: string | null
          worker_id: string | null
          worker_instance_type: string | null
          worker_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "active_workers_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_performance"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_stats: {
        Row: {
          conversion_rate_percent: number | null
          conversions: number | null
          id: string | null
          name: string | null
          successful_referrals: number | null
          total_visits: number | null
          username: string | null
        }
        Relationships: []
      }
      shot_statistics: {
        Row: {
          positioned_count: number | null
          project_id: string | null
          shot_id: string | null
          total_generations: number | null
          unpositioned_count: number | null
          video_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shots_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_queue_analysis: {
        Row: {
          avg_processing_time_seconds: number | null
          avg_queue_time_minutes: number | null
          error_count: number | null
          max_queue_time_minutes: number | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_count: number | null
          task_type: string | null
        }
        Relationships: []
      }
      task_types_with_billing: {
        Row: {
          base_cost_per_second: number | null
          billing_type: string | null
          category: string | null
          cost_factors: Json | null
          created_at: string | null
          description: string | null
          display_name: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          primary_cost: number | null
          run_type: string | null
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          base_cost_per_second?: number | null
          billing_type?: string | null
          category?: string | null
          cost_factors?: Json | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          primary_cost?: never
          run_type?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          base_cost_per_second?: number | null
          billing_type?: string | null
          category?: string | null
          cost_factors?: Json | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          primary_cost?: never
          run_type?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_credit_balance: {
        Row: {
          current_balance: number | null
          total_purchased: number | null
          total_refunded: number | null
          total_spent: number | null
          user_id: string | null
        }
        Relationships: []
      }
      worker_performance: {
        Row: {
          avg_processing_time_seconds: number | null
          completed_tasks: number | null
          current_running_tasks: number | null
          error_tasks: number | null
          failed_tasks: number | null
          instance_type: string | null
          last_heartbeat: string | null
          status: string | null
          success_rate_percent: number | null
          total_tasks_processed: number | null
          uptime_hours: number | null
          worker_created_at: string | null
          worker_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_generation_to_shot: {
        Args: {
          p_generation_id: string
          p_shot_id: string
          p_with_position?: boolean
        }
        Returns: {
          generation_id: string
          id: string
          shot_id: string
          timeline_frame: number
        }[]
      }
      analyze_task_availability_service_role: {
        Args: { p_include_active?: boolean; p_run_type?: string }
        Returns: {
          in_progress_tasks: number
          queued_tasks: number
          run_type: string
          task_breakdown: Json
          total_tasks: number
        }[]
      }
      analyze_task_availability_user: {
        Args:
          | {
              p_include_active?: boolean
              p_run_type?: string
              p_user_id: string
            }
          | { p_include_active?: boolean; p_user_id: string }
        Returns: {
          in_progress_tasks: number
          queued_tasks: number
          run_type: string
          task_breakdown: Json
          total_tasks: number
        }[]
      }
      analyze_task_availability_user_pat: {
        Args: { p_include_active?: boolean; p_user_id: string }
        Returns: Json
      }
      apply_timeline_frames: {
        Args: {
          p_changes: Json
          p_shot_id: string
          p_update_positions?: boolean
        }
        Returns: {
          generation_id: string
          id: string
          position: number
          timeline_frame: number
          updated_at: string
        }[]
      }
      auto_register_worker: {
        Args: { p_instance_type?: string; p_worker_id: string }
        Returns: undefined
      }
      batch_update_timeline_positions: {
        Args: { updates: Json }
        Returns: {
          error_message: string
          generation_id: string
          id: string
          success: boolean
          timeline_frame: number
        }[]
      }
      bytea_to_text: {
        Args: { data: string }
        Returns: string
      }
      check_shot_generations_functions: {
        Args: Record<PropertyKey, never>
        Returns: {
          function_definition: string
          function_name: string
        }[]
      }
      check_shot_generations_triggers: {
        Args: Record<PropertyKey, never>
        Returns: {
          trigger_definition: string
          trigger_enabled: boolean
          trigger_name: string
          trigger_type: string
        }[]
      }
      check_welcome_bonus_eligibility: {
        Args: Record<PropertyKey, never>
        Returns: {
          already_had_bonus: boolean
          current_credits_balance: number
          eligible: boolean
          message: string
        }[]
      }
      claim_next_task_service_role: {
        Args: {
          p_include_active?: boolean
          p_run_type?: string
          p_worker_id: string
        }
        Returns: {
          params: Json
          project_id: string
          task_id: string
          task_type: string
          user_id: string
        }[]
      }
      claim_next_task_user: {
        Args: {
          p_include_active?: boolean
          p_run_type?: string
          p_user_id: string
        }
        Returns: {
          params: Json
          project_id: string
          task_id: string
          task_type: string
          user_id: string
        }[]
      }
      claim_next_task_user_pat: {
        Args: { p_include_active?: boolean; p_user_id: string }
        Returns: {
          params: Json
          project_id: string
          task_id: string
          task_type: string
        }[]
      }
      complete_task_with_timing: {
        Args: { p_output_location: string; p_task_id: string }
        Returns: boolean
      }
      count_eligible_tasks_service_role: {
        Args: { p_include_active?: boolean; p_run_type?: string }
        Returns: number
      }
      count_eligible_tasks_user: {
        Args: {
          p_include_active?: boolean
          p_run_type?: string
          p_user_id: string
        }
        Returns: number
      }
      count_eligible_tasks_user_pat: {
        Args: { p_include_active?: boolean; p_user_id: string }
        Returns: number
      }
      count_unpositioned_generations: {
        Args: { p_shot_id: string }
        Returns: number
      }
      create_referral_from_session: {
        Args: { p_fingerprint: string; p_session_id: string }
        Returns: string
      }
      create_shot_with_image: {
        Args: {
          p_generation_id: string
          p_project_id: string
          p_shot_name: string
        }
        Returns: {
          shot_generation_id: string
          shot_id: string
          shot_name: string
          success: boolean
        }[]
      }
      create_user_record_if_not_exists: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      debug_timeline_update: {
        Args: {
          p_generation_id: string
          p_metadata?: Json
          p_new_timeline_frame: number
          p_shot_id: string
        }
        Returns: Json
      }
      ensure_shot_association_from_params: {
        Args: { p_generation_id: string; p_params: Json }
        Returns: boolean
      }
      exchange_timeline_frames: {
        Args: {
          p_shot_generation_id_a: string
          p_shot_generation_id_b: string
          p_shot_id: string
        }
        Returns: undefined
      }
      extract_discord_username: {
        Args: { jwt_claims: Json; user_metadata: Json }
        Returns: string
      }
      fix_timeline_spacing: {
        Args: { p_shot_id: string }
        Returns: {
          details: string
          generation_id: string
          id: string
          new_timeline_frame: number
          old_timeline_frame: number
          updated: boolean
          violation_type: string
        }[]
      }
      func_claim_available_task: {
        Args: { worker_id_param: string }
        Returns: {
          attempts: number
          created_at: string
          generation_started_at: string
          id: string
          status: string
          task_data: Json
          task_type: string
          worker_id: string
        }[]
      }
      func_get_tasks_by_status: {
        Args: { status_filter: string[] }
        Returns: {
          attempts: number
          created_at: string
          generation_processed_at: string
          generation_started_at: string
          id: string
          status: string
          task_data: Json
          worker_id: string
        }[]
      }
      func_initialize_tasks_table: {
        Args: { p_table_name?: string }
        Returns: string
      }
      func_mark_task_complete: {
        Args: { result_data_param?: Json; task_id_param: string }
        Returns: undefined
      }
      func_mark_task_failed: {
        Args:
          | { error_message_param?: string; task_id_param: string }
          | { p_error_message: string; p_task_id: string }
        Returns: boolean
      }
      func_migrate_tasks_for_task_type: {
        Args: { p_table_name?: string }
        Returns: string
      }
      func_reset_orphaned_tasks: {
        Args: { failed_worker_ids: string[] }
        Returns: number
      }
      func_update_task_status: {
        Args: {
          p_output_location?: string
          p_status: string
          p_table_name?: string
          p_task_id: string
        }
        Returns: boolean
      }
      func_update_worker_heartbeat: {
        Args: {
          vram_total_mb_param?: number
          vram_used_mb_param?: number
          worker_id_param: string
        }
        Returns: undefined
      }
      get_recent_timeline_updates: {
        Args: { p_generation_id?: string; p_minutes?: number }
        Returns: {
          call_source: string
          created_at: string
          generation_id: string
          log_id: string
          new_frame: number
          old_frame: number
          operation_type: string
          shot_id: string
        }[]
      }
      get_task_cost: {
        Args: {
          p_duration_seconds?: number
          p_task_type: string
          p_unit_count?: number
        }
        Returns: number
      }
      get_task_run_type: {
        Args: { p_task_type: string }
        Returns: string
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_delete: {
        Args:
          | { content: string; content_type: string; uri: string }
          | { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_get: {
        Args: { data: Json; uri: string } | { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
      }
      http_list_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_post: {
        Args:
          | { content: string; content_type: string; uri: string }
          | { data: Json; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_reset_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      initialize_timeline_frames_for_shot: {
        Args: { p_frame_spacing?: number; p_shot_id: string }
        Returns: number
      }
      insert_shot_at_position: {
        Args: { p_position: number; p_project_id: string; p_shot_name: string }
        Returns: {
          shot_id: string
          shot_name: string
          shot_position: number
          success: boolean
        }[]
      }
      normalize_image_path: {
        Args: { image_path: string }
        Returns: string
      }
      normalize_image_paths_in_jsonb: {
        Args: { data: Json }
        Returns: Json
      }
      per_user_capacity_stats_service_role: {
        Args: Record<PropertyKey, never>
        Returns: {
          credits: number
          in_progress_tasks: number
          queued_tasks: number
          total_pending_tasks: number
          user_id: string
        }[]
      }
      safe_insert_task: {
        Args: {
          p_dependant_on?: string
          p_id: string
          p_params: Json
          p_project_id: string
          p_status?: string
          p_task_type: string
        }
        Returns: string
      }
      safe_update_task_status: {
        Args: {
          p_generation_started_at?: string
          p_status: string
          p_task_id: string
          p_worker_id?: string
        }
        Returns: boolean
      }
      sanitize_discord_handle: {
        Args: { handle: string }
        Returns: string
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      text_to_bytea: {
        Args: { data: string }
        Returns: string
      }
      timeline_sync_bulletproof: {
        Args: {
          frame_changes: Json
          shot_uuid: string
          should_update_positions?: boolean
        }
        Returns: {
          frame_value: number
          gen_uuid: string
          last_updated: string
          record_id: string
        }[]
      }
      track_referral_visit: {
        Args: {
          p_referrer_username: string
          p_session_id?: string
          p_visitor_fingerprint?: string
          p_visitor_ip?: unknown
        }
        Returns: string
      }
      update_shot_image_order_disabled: {
        Args: {
          p_ordered_shot_generation_ids: string[]
          p_project_id: string
          p_shot_id: string
        }
        Returns: Json
      }
      update_single_timeline_frame: {
        Args: {
          p_generation_id: string
          p_metadata: Json
          p_new_timeline_frame: number
        }
        Returns: {
          created_at: string | null
          generation_id: string
          id: string
          metadata: Json | null
          shot_id: string
          timeline_frame: number | null
          updated_at: string
        }[]
      }
      update_timeline_frame_debug: {
        Args: {
          p_generation_id: string
          p_metadata?: Json
          p_new_timeline_frame: number
          p_shot_id: string
        }
        Returns: Json
      }
      urlencode: {
        Args: { data: Json } | { string: string } | { string: string }
        Returns: string
      }
      verify_api_token: {
        Args: { p_token: string }
        Returns: boolean
      }
      verify_referral_security: {
        Args: Record<PropertyKey, never>
        Returns: {
          anon_permissions: string[]
          auth_permissions: string[]
          policy_count: number
          rls_enabled: boolean
          table_name: string
        }[]
      }
    }
    Enums: {
      credit_ledger_type:
        | "stripe"
        | "manual"
        | "spend"
        | "refund"
        | "auto_topup"
      task_status:
        | "Queued"
        | "In Progress"
        | "Complete"
        | "Failed"
        | "Cancelled"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown | null
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      credit_ledger_type: ["stripe", "manual", "spend", "refund", "auto_topup"],
      task_status: ["Queued", "In Progress", "Complete", "Failed", "Cancelled"],
    },
  },
} as const
