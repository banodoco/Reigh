export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
            referencedRelation: "tasks"
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
          created_at: string
          id: string
          location: string | null
          params: Json | null
          project_id: string
          tasks: Json | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          params?: Json | null
          project_id: string
          tasks?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          params?: Json | null
          project_id?: string
          tasks?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
      shot_generations: {
        Row: {
          generation_id: string
          id: string
          position: number
          shot_id: string
        }
        Insert: {
          generation_id: string
          id?: string
          position?: number
          shot_id: string
        }
        Update: {
          generation_id?: string
          id?: string
          position?: number
          shot_id?: string
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
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
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
      tasks: {
        Row: {
          created_at: string
          dependant_on: string | null
          generation_processed_at: string | null
          id: string
          output_location: string | null
          params: Json
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          task_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          dependant_on?: string | null
          generation_processed_at?: string | null
          id?: string
          output_location?: string | null
          params: Json
          project_id: string
          status?: Database["public"]["Enums"]["task_status"]
          task_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          dependant_on?: string | null
          generation_processed_at?: string | null
          id?: string
          output_location?: string | null
          params?: Json
          project_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          id: string
          name: string | null
          settings: Json | null
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
        }
        Insert: {
          api_keys?: Json | null
          auto_topup_amount?: number | null
          auto_topup_enabled?: boolean
          auto_topup_last_triggered?: string | null
          auto_topup_threshold?: number | null
          credits?: number
          email?: string | null
          id: string
          name?: string | null
          settings?: Json | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
        }
        Update: {
          api_keys?: Json | null
          auto_topup_amount?: number | null
          auto_topup_enabled?: boolean
          auto_topup_last_triggered?: string | null
          auto_topup_threshold?: number | null
          credits?: number
          email?: string | null
          id?: string
          name?: string | null
          settings?: Json | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
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
    }
    Functions: {
      add_generation_to_shot: {
        Args: { p_generation_id: string; p_shot_id: string }
        Returns: {
          position: number
          generation_id: string
          shot_id: string
          id: string
        }[]
      }
      complete_task_with_timing: {
        Args: { p_output_location: string; p_task_id: string }
        Returns: boolean
      }
      func_claim_task: {
        Args: { p_worker_id: string; p_table_name: string }
        Returns: {
          project_id_out: string
          task_type_out: string
          params_out: Json
          task_id_out: string
        }[]
      }
      func_claim_user_task: {
        Args: { p_table_name: string; p_worker_id: string; p_user_id: string }
        Returns: {
          params_out: Json
          project_id_out: string
          task_id_out: string
          task_type_out: string
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
      [_ in never]: never
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

