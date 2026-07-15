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
      app_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      download_records: {
        Row: {
          delivered_at: string
          entitlement_id: string
          id: string
          media_object_id: string
          request_id: string
          subject_id: string
        }
        Insert: {
          delivered_at?: string
          entitlement_id: string
          id?: string
          media_object_id: string
          request_id?: string
          subject_id: string
        }
        Update: {
          delivered_at?: string
          entitlement_id?: string
          id?: string
          media_object_id?: string
          request_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_records_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "entitlement_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_records_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_grants: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          resource_id: string
          resource_type: string
          revoked_at: string | null
          source_id: string
          source_type: string
          starts_at: string
          status: Database["public"]["Enums"]["entitlement_status"]
          subject_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          resource_id: string
          resource_type: string
          revoked_at?: string | null
          source_id: string
          source_type: string
          starts_at?: string
          status?: Database["public"]["Enums"]["entitlement_status"]
          subject_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          resource_id?: string
          resource_type?: string
          revoked_at?: string | null
          source_id?: string
          source_type?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["entitlement_status"]
          subject_id?: string
        }
        Relationships: []
      }
      media_objects: {
        Row: {
          bucket_id: string
          byte_size: number | null
          created_at: string
          created_by: string | null
          id: string
          is_public: boolean
          kind: Database["public"]["Enums"]["media_kind"]
          media_type: string
          object_path: string
          release_id: string | null
          sha256: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          kind: Database["public"]["Enums"]["media_kind"]
          media_type: string
          object_path: string
          release_id?: string | null
          sha256?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          kind?: Database["public"]["Enums"]["media_kind"]
          media_type?: string
          object_path?: string
          release_id?: string | null
          sha256?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_objects_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          resource_id: string
          resource_type: string
          unit_amount_minor: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity?: number
          resource_id: string
          resource_type: string
          unit_amount_minor: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          resource_id?: string
          resource_type?: string
          unit_amount_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          completed_at: string | null
          created_at: string
          currency: string
          customer_id: string
          id: string
          payment_event_id: string
          status: Database["public"]["Enums"]["fulfillment_status"]
          total_minor: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          currency: string
          customer_id: string
          id?: string
          payment_event_id: string
          status?: Database["public"]["Enums"]["fulfillment_status"]
          total_minor: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          payment_event_id?: string
          status?: Database["public"]["Enums"]["fulfillment_status"]
          total_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_payment_event_id_fkey"
            columns: ["payment_event_id"]
            isOneToOne: true
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount_minor: number
          currency: string
          customer_id: string
          id: string
          payload: Json
          processed_at: string | null
          product_id: string
          provider: string
          provider_event_id: string
          received_at: string
          status: Database["public"]["Enums"]["fulfillment_status"]
        }
        Insert: {
          amount_minor: number
          currency: string
          customer_id: string
          id?: string
          payload?: Json
          processed_at?: string | null
          product_id: string
          provider: string
          provider_event_id: string
          received_at?: string
          status?: Database["public"]["Enums"]["fulfillment_status"]
        }
        Update: {
          amount_minor?: number
          currency?: string
          customer_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          product_id?: string
          provider?: string
          provider_event_id?: string
          received_at?: string
          status?: Database["public"]["Enums"]["fulfillment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          active: boolean
          amount_minor: number
          created_at: string
          currency: string
          external_price_id: string | null
          id: string
          product_id: string
        }
        Insert: {
          active?: boolean
          amount_minor: number
          created_at?: string
          currency: string
          external_price_id?: string | null
          id?: string
          product_id: string
        }
        Update: {
          active?: boolean
          amount_minor?: number
          created_at?: string
          currency?: string
          external_price_id?: string | null
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          product_type: string
          resource_id: string
          resource_type: string
          slug: string
          state: Database["public"]["Enums"]["publication_state"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          product_type: string
          resource_id: string
          resource_type: string
          slug: string
          state?: Database["public"]["Enums"]["publication_state"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          product_type?: string
          resource_id?: string
          resource_type?: string
          slug?: string
          state?: Database["public"]["Enums"]["publication_state"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      releases: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          published_at: string | null
          release_date: string | null
          slug: string
          sort_order: number
          state: Database["public"]["Enums"]["publication_state"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          published_at?: string | null
          release_date?: string | null
          slug: string
          sort_order?: number
          state?: Database["public"]["Enums"]["publication_state"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          published_at?: string | null
          release_date?: string | null
          slug?: string
          sort_order?: number
          state?: Database["public"]["Enums"]["publication_state"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_config_versions: {
        Row: {
          config: Json
          config_schema_version: number
          created_at: string
          id: string
          installation_key: string
          published_at: string | null
          status: string
        }
        Insert: {
          config: Json
          config_schema_version: number
          created_at?: string
          id?: string
          installation_key?: string
          published_at?: string | null
          status: string
        }
        Update: {
          config?: Json
          config_schema_version?: number
          created_at?: string
          id?: string
          installation_key?: string
          published_at?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      published_site_config: {
        Row: {
          config: Json | null
          config_schema_version: number | null
          id: string | null
          installation_key: string | null
          published_at: string | null
        }
        Insert: {
          config?: Json | null
          config_schema_version?: number | null
          id?: string | null
          installation_key?: string | null
          published_at?: string | null
        }
        Update: {
          config?: Json | null
          config_schema_version?: number | null
          id?: string | null
          installation_key?: string | null
          published_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      bootstrap_owner: { Args: { target_user_id: string }; Returns: undefined }
      decide_access: {
        Args: {
          target_resource_id: string
          target_resource_type: string
          target_subject_id: string
        }
        Returns: Json
      }
      process_simulated_payment_event: {
        Args: {
          p_event_payload?: Json
          p_paid_amount_minor: number
          p_paid_currency: string
          p_provider_event_id: string
          p_target_customer_id: string
          p_target_product_id: string
        }
        Returns: {
          entitlement_id: string
          order_id: string
          replayed: boolean
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "editor" | "customer"
      entitlement_status: "active" | "revoked" | "expired"
      fulfillment_status: "pending" | "complete" | "failed" | "refunded"
      media_kind:
        | "artwork"
        | "preview_audio"
        | "source_audio"
        | "download"
        | "license_document"
        | "lesson_media"
        | "administrative"
      publication_state: "draft" | "published" | "archived"
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
      app_role: ["owner", "editor", "customer"],
      entitlement_status: ["active", "revoked", "expired"],
      fulfillment_status: ["pending", "complete", "failed", "refunded"],
      media_kind: [
        "artwork",
        "preview_audio",
        "source_audio",
        "download",
        "license_document",
        "lesson_media",
        "administrative",
      ],
      publication_state: ["draft", "published", "archived"],
    },
  },
} as const
