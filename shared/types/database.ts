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
      audit_records: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      catalog_credits: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          resource_id: string
          resource_type: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          resource_id: string
          resource_type: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          resource_id?: string
          resource_type?: string
          role?: string
        }
        Relationships: []
      }
      catalog_taxonomies: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      catalog_term_assignments: {
        Row: {
          created_at: string
          resource_id: string
          resource_type: string
          term_id: string
        }
        Insert: {
          created_at?: string
          resource_id: string
          resource_type: string
          term_id: string
        }
        Update: {
          created_at?: string
          resource_id?: string
          resource_type?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_term_assignments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "catalog_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_terms: {
        Row: {
          created_at: string
          id: string
          label: string
          slug: string
          sort_order: number
          taxonomy_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          slug: string
          sort_order?: number
          taxonomy_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          slug?: string
          sort_order?: number
          taxonomy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_terms_taxonomy_id_fkey"
            columns: ["taxonomy_id"]
            isOneToOne: false
            referencedRelation: "catalog_taxonomies"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_tracks: {
        Row: {
          collection_id: string
          created_at: string
          note: string
          position: number
          track_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          note?: string
          position: number
          track_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          note?: string
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_tracks_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          published_at: string | null
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
          slug?: string
          sort_order?: number
          state?: Database["public"]["Enums"]["publication_state"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          consent: boolean
          created_at: string
          email: string
          id: string
          message: string
          name: string
          request_fingerprint: string
          status: string
          updated_at: string
        }
        Insert: {
          consent?: boolean
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          request_fingerprint: string
          status?: string
          updated_at?: string
        }
        Update: {
          consent?: boolean
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          request_fingerprint?: string
          status?: string
          updated_at?: string
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
      favorites: {
        Row: {
          created_at: string
          owner_id: string
          resource_id: string
          resource_type: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          resource_id: string
          resource_type: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          resource_id?: string
          resource_type?: string
        }
        Relationships: []
      }
      listening_history: {
        Row: {
          completed: boolean
          id: string
          listened_at: string
          owner_id: string
          progress_ms: number
          track_id: string
        }
        Insert: {
          completed?: boolean
          id?: string
          listened_at?: string
          owner_id: string
          progress_ms?: number
          track_id: string
        }
        Update: {
          completed?: boolean
          id?: string
          listened_at?: string
          owner_id?: string
          progress_ms?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listening_history_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      media_jobs: {
        Row: {
          attempts: number
          created_at: string
          error_category: string | null
          finished_at: string | null
          id: string
          lease_expires_at: string | null
          media_object_id: string
          processing_profile_version: string
          result_metadata: Json
          started_at: string | null
          status: Database["public"]["Enums"]["media_job_status"]
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_category?: string | null
          finished_at?: string | null
          id?: string
          lease_expires_at?: string | null
          media_object_id: string
          processing_profile_version: string
          result_metadata?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["media_job_status"]
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error_category?: string | null
          finished_at?: string | null
          id?: string
          lease_expires_at?: string | null
          media_object_id?: string
          processing_profile_version?: string
          result_metadata?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["media_job_status"]
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_jobs_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      media_objects: {
        Row: {
          bucket_id: string
          byte_size: number | null
          created_at: string
          created_by: string | null
          derivative_key: string | null
          id: string
          is_public: boolean
          kind: Database["public"]["Enums"]["media_kind"]
          media_type: string
          metadata: Json
          object_path: string
          processing_profile_version: string | null
          release_id: string | null
          sha256: string | null
          source_media_id: string | null
          status: string
          track_id: string | null
          updated_at: string
        }
        Insert: {
          bucket_id: string
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          derivative_key?: string | null
          id?: string
          is_public?: boolean
          kind: Database["public"]["Enums"]["media_kind"]
          media_type: string
          metadata?: Json
          object_path: string
          processing_profile_version?: string | null
          release_id?: string | null
          sha256?: string | null
          source_media_id?: string | null
          status?: string
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          derivative_key?: string | null
          id?: string
          is_public?: boolean
          kind?: Database["public"]["Enums"]["media_kind"]
          media_type?: string
          metadata?: Json
          object_path?: string
          processing_profile_version?: string | null
          release_id?: string | null
          sha256?: string | null
          source_media_id?: string | null
          status?: string
          track_id?: string | null
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
          {
            foreignKeyName: "media_objects_source_media_id_fkey"
            columns: ["source_media_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_objects_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
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
      pages: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          navigation_label: string | null
          published_at: string | null
          sections: Json
          seo: Json
          slug: string
          status: Database["public"]["Enums"]["publication_state"]
          supersedes_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          navigation_label?: string | null
          published_at?: string | null
          sections?: Json
          seo?: Json
          slug: string
          status?: Database["public"]["Enums"]["publication_state"]
          supersedes_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          navigation_label?: string | null
          published_at?: string | null
          sections?: Json
          seo?: Json
          slug?: string
          status?: Database["public"]["Enums"]["publication_state"]
          supersedes_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "pages"
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
      playlist_tracks: {
        Row: {
          added_at: string
          playlist_id: string
          position: number
          track_id: string
        }
        Insert: {
          added_at?: string
          playlist_id: string
          position: number
          track_id: string
        }
        Update: {
          added_at?: string
          playlist_id?: string
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          description: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      release_tracks: {
        Row: {
          created_at: string
          disc_number: number
          position: number
          release_id: string
          track_id: string
        }
        Insert: {
          created_at?: string
          disc_number?: number
          position: number
          release_id: string
          track_id: string
        }
        Update: {
          created_at?: string
          disc_number?: number
          position?: number
          release_id?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_tracks_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          artwork_media_id: string | null
          catalog_number: string
          created_at: string
          created_by: string | null
          description: string
          genre: string
          id: string
          label: string
          mood: string
          published_at: string | null
          release_date: string | null
          release_type: string
          slug: string
          sort_order: number
          state: Database["public"]["Enums"]["publication_state"]
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          artwork_media_id?: string | null
          catalog_number?: string
          created_at?: string
          created_by?: string | null
          description?: string
          genre?: string
          id?: string
          label?: string
          mood?: string
          published_at?: string | null
          release_date?: string | null
          release_type?: string
          slug: string
          sort_order?: number
          state?: Database["public"]["Enums"]["publication_state"]
          subtitle?: string
          title: string
          updated_at?: string
        }
        Update: {
          artwork_media_id?: string | null
          catalog_number?: string
          created_at?: string
          created_by?: string | null
          description?: string
          genre?: string
          id?: string
          label?: string
          mood?: string
          published_at?: string | null
          release_date?: string | null
          release_type?: string
          slug?: string
          sort_order?: number
          state?: Database["public"]["Enums"]["publication_state"]
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "releases_artwork_media_id_fkey"
            columns: ["artwork_media_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
        ]
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
          supersedes_id: string | null
          updated_by: string | null
        }
        Insert: {
          config: Json
          config_schema_version: number
          created_at?: string
          id?: string
          installation_key?: string
          published_at?: string | null
          status: string
          supersedes_id?: string | null
          updated_by?: string | null
        }
        Update: {
          config?: Json
          config_schema_version?: number
          created_at?: string
          id?: string
          installation_key?: string
          published_at?: string | null
          status?: string
          supersedes_id?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_config_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "published_site_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_config_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "site_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          duration_ms: number | null
          explicit: boolean
          id: string
          instruments: string[]
          meter: string
          mood: string
          musical_key: string
          primary_release_id: string | null
          published_at: string | null
          slug: string
          state: Database["public"]["Enums"]["publication_state"]
          tempo_bpm: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          duration_ms?: number | null
          explicit?: boolean
          id?: string
          instruments?: string[]
          meter?: string
          mood?: string
          musical_key?: string
          primary_release_id?: string | null
          published_at?: string | null
          slug: string
          state?: Database["public"]["Enums"]["publication_state"]
          tempo_bpm?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          duration_ms?: number | null
          explicit?: boolean
          id?: string
          instruments?: string[]
          meter?: string
          mood?: string
          musical_key?: string
          primary_release_id?: string | null
          published_at?: string | null
          slug?: string
          state?: Database["public"]["Enums"]["publication_state"]
          tempo_bpm?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_primary_release_id_fkey"
            columns: ["primary_release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
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
      claim_media_job: {
        Args: { p_lease_seconds?: number; p_worker_id: string }
        Returns: {
          job_id: string
          lease_expires_at: string
          media_id: string
          processing_profile_version: string
          source_bucket: string
          source_hash: string
          source_path: string
        }[]
      }
      decide_access: {
        Args: {
          target_resource_id: string
          target_resource_type: string
          target_subject_id: string
        }
        Returns: Json
      }
      fail_media_job: {
        Args: {
          p_error_category: string
          p_job_id: string
          p_worker_id: string
        }
        Returns: undefined
      }
      finalize_media_job: {
        Args: { p_job_id: string; p_result_metadata: Json; p_worker_id: string }
        Returns: undefined
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
      publish_page: {
        Args: { p_actor_id: string; p_page_id: string }
        Returns: string
      }
      publish_site_config: {
        Args: { p_actor_id: string; p_version_id: string }
        Returns: string
      }
      submit_contact_message: {
        Args: {
          p_consent: boolean
          p_email: string
          p_message: string
          p_name: string
          p_request_fingerprint: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "owner" | "editor" | "customer"
      entitlement_status: "active" | "revoked" | "expired"
      fulfillment_status: "pending" | "complete" | "failed" | "refunded"
      media_job_status: "pending" | "processing" | "ready" | "failed"
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
      media_job_status: ["pending", "processing", "ready", "failed"],
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
