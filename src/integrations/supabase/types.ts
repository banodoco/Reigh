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
      api_keys: {
        Row: {
          created_at: string | null
          id: string
          key_value: string
          service: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_value: string
          service: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key_value?: string
          service?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      asset_media: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          is_primary: boolean | null
          media_id: string
          status: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          media_id: string
          status?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          media_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_media_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          admin_reviewed: boolean
          admin_status: string | null
          created_at: string
          creator: string | null
          curator_id: string | null
          description: string | null
          download_link: string | null
          id: string
          lora_base_model: string | null
          lora_link: string | null
          lora_type: string | null
          model_variant: string | null
          name: string
          primary_media_id: string | null
          type: string
          user_id: string | null
          user_status: string | null
        }
        Insert: {
          admin_reviewed?: boolean
          admin_status?: string | null
          created_at?: string
          creator?: string | null
          curator_id?: string | null
          description?: string | null
          download_link?: string | null
          id?: string
          lora_base_model?: string | null
          lora_link?: string | null
          lora_type?: string | null
          model_variant?: string | null
          name: string
          primary_media_id?: string | null
          type: string
          user_id?: string | null
          user_status?: string | null
        }
        Update: {
          admin_reviewed?: boolean
          admin_status?: string | null
          created_at?: string
          creator?: string | null
          curator_id?: string | null
          description?: string | null
          download_link?: string | null
          id?: string
          lora_base_model?: string | null
          lora_link?: string | null
          lora_type?: string | null
          model_variant?: string | null
          name?: string
          primary_media_id?: string | null
          type?: string
          user_id?: string | null
          user_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_primary_media_id_fkey"
            columns: ["primary_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          admin_reviewed: boolean
          admin_status: string | null
          backup_thumbnail_url: string | null
          backup_url: string | null
          classification: string | null
          cloudflare_playback_dash_url: string | null
          cloudflare_playback_hls_url: string | null
          cloudflare_stream_uid: string | null
          cloudflare_thumbnail_url: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          placeholder_image: string | null
          storage_provider: string | null
          title: string | null
          type: string
          updated_at: string | null
          url: string
          user_id: string | null
          user_status: string | null
        }
        Insert: {
          admin_reviewed?: boolean
          admin_status?: string | null
          backup_thumbnail_url?: string | null
          backup_url?: string | null
          classification?: string | null
          cloudflare_playback_dash_url?: string | null
          cloudflare_playback_hls_url?: string | null
          cloudflare_stream_uid?: string | null
          cloudflare_thumbnail_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          placeholder_image?: string | null
          storage_provider?: string | null
          title?: string | null
          type: string
          updated_at?: string | null
          url: string
          user_id?: string | null
          user_status?: string | null
        }
        Update: {
          admin_reviewed?: boolean
          admin_status?: string | null
          backup_thumbnail_url?: string | null
          backup_url?: string | null
          classification?: string | null
          cloudflare_playback_dash_url?: string | null
          cloudflare_playback_hls_url?: string | null
          cloudflare_stream_uid?: string | null
          cloudflare_thumbnail_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          placeholder_image?: string | null
          storage_provider?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          url?: string
          user_id?: string | null
          user_status?: string | null
        }
        Relationships: []
      }
      models: {
        Row: {
          created_at: string
          default_variant: string | null
          display_name: string
          id: string
          internal_identifier: string
          is_active: boolean
          sort_order: number | null
          variants: Json
        }
        Insert: {
          created_at?: string
          default_variant?: string | null
          display_name: string
          id?: string
          internal_identifier: string
          is_active?: boolean
          sort_order?: number | null
          variants?: Json
        }
        Update: {
          created_at?: string
          default_variant?: string | null
          display_name?: string
          id?: string
          internal_identifier?: string
          is_active?: boolean
          sort_order?: number | null
          variants?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          background_image_url: string | null
          created_at: string
          description: string | null
          discord_connected: boolean | null
          discord_user_id: string | null
          discord_username: string | null
          display_name: string | null
          id: string
          links: string[] | null
          real_name: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          background_image_url?: string | null
          created_at?: string
          description?: string | null
          discord_connected?: boolean | null
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          id?: string
          links?: string[] | null
          real_name?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          background_image_url?: string | null
          created_at?: string
          description?: string | null
          discord_connected?: boolean | null
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          id?: string
          links?: string[] | null
          real_name?: string | null
          username?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      debug_asset_media: {
        Args: { asset_id: string }
        Returns: {
          asset_id: string
          created_at: string
          id: string
          is_primary: boolean | null
          media_id: string
          status: string
        }[]
      }
      debug_get_all_assets: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      has_role: {
        Args: { user_id: string; role: string }
        Returns: boolean
      }
      is_current_user_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      set_primary_media: {
        Args: { p_asset_id: string; p_media_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
