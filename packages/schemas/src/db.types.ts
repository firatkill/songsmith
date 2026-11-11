export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  app: {
    Tables: {
      appeals: {
        Row: {
          action_id: string;
          created_at: string;
          decided_by: string | null;
          id: string;
          outcome: string | null;
          text: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action_id: string;
          created_at?: string;
          decided_by?: string | null;
          id?: string;
          outcome?: string | null;
          text: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          action_id?: string;
          created_at?: string;
          decided_by?: string | null;
          id?: string;
          outcome?: string | null;
          text?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'appeals_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_actions';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          at: string;
          diff: NonNullable<Json>;
          id: string;
          target: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          at?: string;
          diff?: NonNullable<Json>;
          id?: string;
          target: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          at?: string;
          diff?: NonNullable<Json>;
          id?: string;
          target?: string;
        };
        Relationships: [];
      };
      cost_counters: {
        Row: {
          created_at: string;
          day: string;
          id: string;
          micro_usd: number;
          scope: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day: string;
          id?: string;
          micro_usd?: number;
          scope: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          id?: string;
          micro_usd?: number;
          scope?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      data_requests: {
        Row: {
          artifact_path: string | null;
          created_at: string;
          due_at: string;
          id: string;
          kind: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          artifact_path?: string | null;
          created_at?: string;
          due_at: string;
          id?: string;
          kind: string;
          status: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          artifact_path?: string | null;
          created_at?: string;
          due_at?: string;
          id?: string;
          kind?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      devices: {
        Row: {
          attestation_status: string | null;
          created_at: string;
          expo_push_token: string | null;
          id: string;
          last_seen_at: string | null;
          platform: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attestation_status?: string | null;
          created_at?: string;
          expo_push_token?: string | null;
          id?: string;
          last_seen_at?: string | null;
          platform: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attestation_status?: string | null;
          created_at?: string;
          expo_push_token?: string | null;
          id?: string;
          last_seen_at?: string | null;
          platform?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      flags: {
        Row: {
          created_at: string;
          id: string;
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          id?: string;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      likes: {
        Row: {
          created_at: string;
          id: string;
          song_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          song_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          song_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          action: string;
          actor_id: string | null;
          case_id: string;
          created_at: string;
          id: string;
          notice_sent_at: string | null;
          reason_code: string;
          reason_text: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          case_id: string;
          created_at?: string;
          id?: string;
          notice_sent_at?: string | null;
          reason_code: string;
          reason_text?: string | null;
          updated_at?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          case_id?: string;
          created_at?: string;
          id?: string;
          notice_sent_at?: string | null;
          reason_code?: string;
          reason_text?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_actions_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_cases';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_cases: {
        Row: {
          assigned_to: string | null;
          created_at: string;
          id: string;
          kind: string;
          priority: string;
          status: string;
          subject_user_id: string | null;
          target: NonNullable<Json>;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_to?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          priority: string;
          status: string;
          subject_user_id?: string | null;
          target: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          priority?: string;
          status?: string;
          subject_user_id?: string | null;
          target?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [];
      };
      moderation_decisions: {
        Row: {
          action: string;
          category: string;
          classifier_model: string | null;
          created_at: string;
          id: string;
          input_sha256: string;
          latency_ms: number | null;
          layers: NonNullable<Json>;
          policy_version: string;
          severity: string;
          surface: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          category: string;
          classifier_model?: string | null;
          created_at?: string;
          id?: string;
          input_sha256: string;
          latency_ms?: number | null;
          layers: NonNullable<Json>;
          policy_version: string;
          severity: string;
          surface: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          category?: string;
          classifier_model?: string | null;
          created_at?: string;
          id?: string;
          input_sha256?: string;
          latency_ms?: number | null;
          layers?: NonNullable<Json>;
          policy_version?: string;
          severity?: string;
          surface?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      play_events: {
        Row: {
          created_at: string;
          hour_bucket: string;
          id: string;
          listener_key: string;
          song_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          hour_bucket: string;
          id?: string;
          listener_key: string;
          song_id: string;
        };
        Update: {
          created_at?: string;
          hour_bucket?: string;
          id?: string;
          listener_key?: string;
          song_id?: string;
        };
        Relationships: [];
      };
      provider_calls: {
        Row: {
          actual_cost_micro_usd: number | null;
          created_at: string;
          est_cost_micro_usd: number;
          id: string;
          job_id: string | null;
          latency_ms: number | null;
          model_id: string | null;
          operation: string;
          provider: string;
          provider_request_id: string | null;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actual_cost_micro_usd?: number | null;
          created_at?: string;
          est_cost_micro_usd: number;
          id?: string;
          job_id?: string | null;
          latency_ms?: number | null;
          model_id?: string | null;
          operation: string;
          provider: string;
          provider_request_id?: string | null;
          status: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          actual_cost_micro_usd?: number | null;
          created_at?: string;
          est_cost_micro_usd?: number;
          id?: string;
          job_id?: string | null;
          latency_ms?: number | null;
          model_id?: string | null;
          operation?: string;
          provider?: string;
          provider_request_id?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      provider_health: {
        Row: {
          breaker_state: string;
          created_at: string;
          failure_count: number;
          id: string;
          opened_at: string | null;
          provider: string;
          updated_at: string;
          window_started_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          breaker_state?: string;
          created_at?: string;
          failure_count?: number;
          id?: string;
          opened_at?: string | null;
          provider: string;
          updated_at?: string;
          window_started_at?: string | null;
        };
        Update: {
          breaker_state?: string;
          created_at?: string;
          failure_count?: number;
          id?: string;
          opened_at?: string | null;
          provider?: string;
          updated_at?: string;
          window_started_at?: string | null;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          count: number;
          created_at: string;
          id: string;
          key: string;
          updated_at: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          created_at?: string;
          id?: string;
          key: string;
          updated_at?: string;
          window_start: string;
        };
        Update: {
          count?: number;
          created_at?: string;
          id?: string;
          key?: string;
          updated_at?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          priority: string;
          reason: string;
          reporter_id: string | null;
          status: string;
          target_id: string;
          target_kind: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          priority: string;
          reason: string;
          reporter_id?: string | null;
          status: string;
          target_id: string;
          target_kind: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          priority?: string;
          reason?: string;
          reporter_id?: string | null;
          status?: string;
          target_id?: string;
          target_kind?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_roles: {
        Row: {
          created_at: string;
          id: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          role: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      consents: {
        Row: {
          at: string;
          created_at: string;
          granted: boolean;
          id: string;
          kind: string;
          source: string;
          user_id: string;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          at?: string;
          created_at?: string;
          granted: boolean;
          id?: string;
          kind: string;
          source: string;
          user_id: string;
          version: string;
        };
        Update: {
          at?: string;
          created_at?: string;
          granted?: boolean;
          id?: string;
          kind?: string;
          source?: string;
          user_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'consents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      favourites: {
        Row: {
          created_at: string;
          id: string;
          song_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          song_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          song_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'favourites_song_id_fkey';
            columns: ['song_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'favourites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'favourites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string;
          followed_id: string;
          follower_id: string;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          followed_id: string;
          follower_id: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          followed_id?: string;
          follower_id?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'follows_followed_id_fkey';
            columns: ['followed_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_followed_id_fkey';
            columns: ['followed_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      generation_jobs: {
        Row: {
          attempts: number;
          correlation_id: string | null;
          created_at: string;
          error_code: string | null;
          heartbeat_at: string;
          id: string;
          idempotency_key: string;
          model_id: string | null;
          operation: string;
          reservation_id: string | null;
          route_reason: NonNullable<Json>;
          song_id: string | null;
          stage_detail: string | null;
          status: string;
          steps: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          correlation_id?: string | null;
          created_at?: string;
          error_code?: string | null;
          heartbeat_at?: string;
          id?: string;
          idempotency_key: string;
          model_id?: string | null;
          operation: string;
          reservation_id?: string | null;
          route_reason?: NonNullable<Json>;
          song_id?: string | null;
          stage_detail?: string | null;
          status?: string;
          steps?: NonNullable<Json>;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          correlation_id?: string | null;
          created_at?: string;
          error_code?: string | null;
          heartbeat_at?: string;
          id?: string;
          idempotency_key?: string;
          model_id?: string | null;
          operation?: string;
          reservation_id?: string | null;
          route_reason?: NonNullable<Json>;
          song_id?: string | null;
          stage_detail?: string | null;
          status?: string;
          steps?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'generation_jobs_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'models';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_song_id_fkey';
            columns: ['song_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      gifts: {
        Row: {
          created_at: string;
          details: Json | null;
          id: string;
          message: string;
          occasion: string | null;
          opens_at: string | null;
          recipient_name: string;
          revoked_at: string | null;
          sender_id: string;
          song_id: string;
          token: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          details?: Json | null;
          id?: string;
          message?: string;
          occasion?: string | null;
          opens_at?: string | null;
          recipient_name: string;
          revoked_at?: string | null;
          sender_id: string;
          song_id: string;
          token?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          details?: Json | null;
          id?: string;
          message?: string;
          occasion?: string | null;
          opens_at?: string | null;
          recipient_name?: string;
          revoked_at?: string | null;
          sender_id?: string;
          song_id?: string;
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'gifts_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gifts_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gifts_song_id_fkey';
            columns: ['song_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['id'];
          },
        ];
      };
      model_languages: {
        Row: {
          created_at: string;
          eval_run_id: string | null;
          id: string;
          language: string;
          model_id: string;
          status: string;
          updated_at: string;
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          eval_run_id?: string | null;
          id?: string;
          language: string;
          model_id: string;
          status?: string;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          eval_run_id?: string | null;
          id?: string;
          language?: string;
          model_id?: string;
          status?: string;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'model_languages_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'models';
            referencedColumns: ['id'];
          },
        ];
      };
      model_prices: {
        Row: {
          created_at: string;
          credits: number;
          est_cost_micro_usd: number;
          model_id: string;
          operation: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          credits: number;
          est_cost_micro_usd: number;
          model_id: string;
          operation: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          credits?: number;
          est_cost_micro_usd?: number;
          model_id?: string;
          operation?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'model_prices_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'models';
            referencedColumns: ['id'];
          },
        ];
      };
      models: {
        Row: {
          adapter: string;
          adapter_version: string;
          capabilities: NonNullable<Json>;
          created_at: string;
          display_name: string;
          enabled: boolean;
          id: string;
          is_mock: boolean;
          kind: string;
          quality_rank: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          adapter: string;
          adapter_version: string;
          capabilities: NonNullable<Json>;
          created_at?: string;
          display_name: string;
          enabled?: boolean;
          id: string;
          is_mock?: boolean;
          kind: string;
          quality_rank?: number;
          updated_at?: string;
        };
        Update: {
          adapter?: string;
          adapter_version?: string;
          capabilities?: NonNullable<Json>;
          created_at?: string;
          display_name?: string;
          enabled?: boolean;
          id?: string;
          is_mock?: boolean;
          kind?: string;
          quality_rank?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          payload: NonNullable<Json>;
          read_at: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      playlist_items: {
        Row: {
          created_at: string;
          id: string;
          playlist_id: string;
          position: number;
          song_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          playlist_id: string;
          position: number;
          song_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          playlist_id?: string;
          position?: number;
          song_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'playlist_items_playlist_id_fkey';
            columns: ['playlist_id'];
            isOneToOne: false;
            referencedRelation: 'playlists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'playlist_items_song_id_fkey';
            columns: ['song_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['id'];
          },
        ];
      };
      playlists: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'playlists_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'playlists_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          adult_verified_at: string | null;
          avatar_seed: string;
          bio: string;
          created_at: string;
          display_name: string;
          explicit_hidden: boolean;
          handle: string;
          id: string;
          is_adult: boolean;
          locale: string;
          remix_default: boolean;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          adult_verified_at?: string | null;
          avatar_seed?: string;
          bio?: string;
          created_at?: string;
          display_name?: string;
          explicit_hidden?: boolean;
          handle: string;
          id: string;
          is_adult?: boolean;
          locale?: string;
          remix_default?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          adult_verified_at?: string | null;
          avatar_seed?: string;
          bio?: string;
          created_at?: string;
          display_name?: string;
          explicit_hidden?: boolean;
          handle?: string;
          id?: string;
          is_adult?: boolean;
          locale?: string;
          remix_default?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      song_assets: {
        Row: {
          bucket: string;
          bytes: number | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          kind: string;
          label: string | null;
          path: string;
          sha256: string | null;
          song_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bucket: string;
          bytes?: number | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          kind: string;
          label?: string | null;
          path: string;
          sha256?: string | null;
          song_id: string;
          updated_at?: string;
        };
        Update: {
          bucket?: string;
          bytes?: number | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          kind?: string;
          label?: string | null;
          path?: string;
          sha256?: string | null;
          song_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'song_assets_song_id_fkey';
            columns: ['song_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['id'];
          },
        ];
      };
      song_stats: {
        Row: {
          created_at: string;
          id: string;
          likes: number;
          plays: number;
          song_id: string;
          trending_score: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          likes?: number;
          plays?: number;
          song_id: string;
          trending_score?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          likes?: number;
          plays?: number;
          song_id?: string;
          trending_score?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'song_stats_song_id_fkey';
            columns: ['song_id'];
            isOneToOne: true;
            referencedRelation: 'songs';
            referencedColumns: ['id'];
          },
        ];
      };
      song_timings: {
        Row: {
          created_at: string;
          granularity: string;
          id: string;
          song_id: string;
          source: string;
          timings: NonNullable<Json>;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          granularity: string;
          id?: string;
          song_id: string;
          source: string;
          timings: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          granularity?: string;
          id?: string;
          song_id?: string;
          source?: string;
          timings?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'song_timings_song_id_fkey';
            columns: ['song_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['id'];
          },
        ];
      };
      songs: {
        Row: {
          created_at: string;
          credit_cost: number | null;
          deleted_at: string | null;
          duration_ms: number | null;
          explicit: boolean;
          id: string;
          instrumental: boolean;
          language: string | null;
          lyrics: string;
          model_id: string | null;
          model_version: string | null;
          moderation_decision_id: string | null;
          owner_id: string;
          parent_kind: string | null;
          parent_song_id: string | null;
          remix_allowed: boolean;
          search: unknown;
          sections: NonNullable<Json>;
          share_token: string;
          status: string;
          style: NonNullable<Json>;
          title: string;
          updated_at: string;
          visibility: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          credit_cost?: number | null;
          deleted_at?: string | null;
          duration_ms?: number | null;
          explicit?: boolean;
          id?: string;
          instrumental?: boolean;
          language?: string | null;
          lyrics?: string;
          model_id?: string | null;
          model_version?: string | null;
          moderation_decision_id?: string | null;
          owner_id: string;
          parent_kind?: string | null;
          parent_song_id?: string | null;
          remix_allowed?: boolean;
          search?: never;
          sections?: NonNullable<Json>;
          share_token?: string;
          status?: string;
          style?: NonNullable<Json>;
          title: string;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          created_at?: string;
          credit_cost?: number | null;
          deleted_at?: string | null;
          duration_ms?: number | null;
          explicit?: boolean;
          id?: string;
          instrumental?: boolean;
          language?: string | null;
          lyrics?: string;
          model_id?: string | null;
          model_version?: string | null;
          moderation_decision_id?: string | null;
          owner_id?: string;
          parent_kind?: string | null;
          parent_song_id?: string | null;
          remix_allowed?: boolean;
          search?: never;
          sections?: NonNullable<Json>;
          share_token?: string;
          status?: string;
          style?: NonNullable<Json>;
          title?: string;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'songs_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'models';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'songs_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'songs_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'songs_parent_song_id_fkey';
            columns: ['parent_song_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['id'];
          },
        ];
      };
      user_settings: {
        Row: {
          analytics_consent: boolean;
          created_at: string;
          id: string;
          marketing_email_opt_in: boolean;
          notification_prefs: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          analytics_consent?: boolean;
          created_at?: string;
          id?: string;
          marketing_email_opt_in?: boolean;
          notification_prefs?: NonNullable<Json>;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          analytics_consent?: boolean;
          created_at?: string;
          id?: string;
          marketing_email_opt_in?: boolean;
          notification_prefs?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          avatar_seed: string;
          bio: string;
          display_name: string;
          handle: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_seed?: string | null;
          bio?: string | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string | null;
        };
        Update: {
          avatar_seed?: string | null;
          bio?: string | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  app: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
