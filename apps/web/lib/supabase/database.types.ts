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
      accounts: {
        Row: {
          created_at: string
          display_name: string
          id: number
          location_raw: string | null
          person_id: number | null
          school_raw: string | null
          source: string
          source_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: never
          location_raw?: string | null
          person_id?: number | null
          school_raw?: string | null
          source?: string
          source_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: never
          location_raw?: string | null
          person_id?: number | null
          school_raw?: string | null
          source?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      claim_attempts: {
        Row: {
          account_id: number
          code: string
          created_at: string
          expires_at: string
          id: number
          user_id: string
          verified_at: string | null
        }
        Insert: {
          account_id: number
          code: string
          created_at?: string
          expires_at: string
          id?: never
          user_id: string
          verified_at?: string | null
        }
        Update: {
          account_id?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: never
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_attempts_account_id_fkey"
            columns: ["account_id"]
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_attempts_account_id_fkey"
            columns: ["account_id"]
            referencedRelation: "public_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      config_changes: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          new_row: Json | null
          old_row: Json | null
          operation: string
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          operation: string
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          operation?: string
          table_name?: string
        }
        Relationships: []
      }
      corrections: {
        Row: {
          created_at: string
          id: number
          kind: string
          note: string | null
          payload: Json
          person_id: number
          reviewed_at: string | null
          reviewer: string | null
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          note?: string | null
          payload?: Json
          person_id: number
          reviewed_at?: string | null
          reviewer?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          note?: string | null
          payload?: Json
          person_id?: number
          reviewed_at?: string | null
          reviewer?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrections_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      crawl_checkpoints: {
        Row: {
          cursor: Json
          job: string
          updated_at: string
        }
        Insert: {
          cursor: Json
          job: string
          updated_at?: string
        }
        Update: {
          cursor?: Json
          job?: string
          updated_at?: string
        }
        Relationships: []
      }
      crawl_failures: {
        Row: {
          attempts: number
          error: string
          kind: string
          last_attempt_at: string
          status: number | null
          url: string
        }
        Insert: {
          attempts?: number
          error: string
          kind: string
          last_attempt_at?: string
          status?: number | null
          url: string
        }
        Update: {
          attempts?: number
          error?: string
          kind?: string
          last_attempt_at?: string
          status?: number | null
          url?: string
        }
        Relationships: []
      }
      event_series: {
        Row: {
          created_at: string
          id: number
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_tiers: {
        Row: {
          code: string
          description: string | null
          label: string
          position: number
        }
        Insert: {
          code: string
          description?: string | null
          label: string
          position: number
        }
        Update: {
          code?: string
          description?: string | null
          label?: string
          position?: number
        }
        Relationships: []
      }
      excluded_hackathons: {
        Row: {
          created_at: string
          created_by: string | null
          hackathon_id: number
          reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hackathon_id: number
          reason: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hackathon_id?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "excluded_hackathons_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "excluded_hackathons_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excluded_hackathons_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_settings: {
        Row: {
          counts: string
          event_tier: string | null
          hackathon_id: number
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          counts?: string
          event_tier?: string | null
          hackathon_id: number
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          counts?: string
          event_tier?: string | null
          hackathon_id?: number
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_settings_event_tier_fkey"
            columns: ["event_tier"]
            referencedRelation: "event_tiers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "hackathon_settings_event_tier_fkey"
            columns: ["event_tier"]
            referencedRelation: "public_event_tiers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "hackathon_settings_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "hackathon_settings_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_settings_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_strength: {
        Row: {
          elite_count: number
          event_rating: number | null
          field_mean: number | null
          field_size: number
          hackathon_id: number
          judging_corr: number | null
          top_field: number | null
          win_odds: number | null
        }
        Insert: {
          elite_count: number
          event_rating?: number | null
          field_mean?: number | null
          field_size: number
          hackathon_id: number
          judging_corr?: number | null
          top_field?: number | null
          win_odds?: number | null
        }
        Update: {
          elite_count?: number
          event_rating?: number | null
          field_mean?: number | null
          field_size?: number
          hackathon_id?: number
          judging_corr?: number | null
          top_field?: number | null
          win_odds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_strength_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "hackathon_strength_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_strength_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_strength_next: {
        Row: {
          elite_count: number
          event_rating: number | null
          field_mean: number | null
          field_size: number
          hackathon_id: number
          judging_corr: number | null
          top_field: number | null
          win_odds: number | null
        }
        Insert: {
          elite_count: number
          event_rating?: number | null
          field_mean?: number | null
          field_size: number
          hackathon_id: number
          judging_corr?: number | null
          top_field?: number | null
          win_odds?: number | null
        }
        Update: {
          elite_count?: number
          event_rating?: number | null
          field_mean?: number | null
          field_size?: number
          hackathon_id?: number
          judging_corr?: number | null
          top_field?: number | null
          win_odds?: number | null
        }
        Relationships: []
      }
      hackathons: {
        Row: {
          created_at: string
          ends_on: string | null
          id: number
          is_high_school: boolean
          is_mlh: boolean
          is_online: boolean
          location: string | null
          organization: string | null
          prize_total_usd: number | null
          registrations: number | null
          series_id: number | null
          slug: string
          source: string
          source_id: string
          starts_on: string | null
          themes: Json
          title: string
          updated_at: string
          url: string
          winners_announced: boolean
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: never
          is_high_school?: boolean
          is_mlh?: boolean
          is_online?: boolean
          location?: string | null
          organization?: string | null
          prize_total_usd?: number | null
          registrations?: number | null
          series_id?: number | null
          slug: string
          source?: string
          source_id: string
          starts_on?: string | null
          themes?: Json
          title: string
          updated_at?: string
          url: string
          winners_announced?: boolean
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: never
          is_high_school?: boolean
          is_mlh?: boolean
          is_online?: boolean
          location?: string | null
          organization?: string | null
          prize_total_usd?: number | null
          registrations?: number | null
          series_id?: number | null
          slug?: string
          source?: string
          source_id?: string
          starts_on?: string | null
          themes?: Json
          title?: string
          updated_at?: string
          url?: string
          winners_announced?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hackathons_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathons_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "public_event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathons_devpost_meta: {
        Row: {
          hackathon_id: number
          invite_only: boolean
          open_state: string | null
        }
        Insert: {
          hackathon_id: number
          invite_only?: boolean
          open_state?: string | null
        }
        Update: {
          hackathon_id?: number
          invite_only?: boolean
          open_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathons_devpost_meta_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "hackathons_devpost_meta_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathons_devpost_meta_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      merge_candidates: {
        Row: {
          account_a: number
          account_b: number
          created_at: string
          reasons: Json
          score: number
        }
        Insert: {
          account_a: number
          account_b: number
          created_at?: string
          reasons?: Json
          score: number
        }
        Update: {
          account_a?: number
          account_b?: number
          created_at?: string
          reasons?: Json
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "merge_candidates_account_a_fkey"
            columns: ["account_a"]
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_account_a_fkey"
            columns: ["account_a"]
            referencedRelation: "public_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_account_b_fkey"
            columns: ["account_b"]
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_account_b_fkey"
            columns: ["account_b"]
            referencedRelation: "public_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pair_synergy: {
        Row: {
          events_together: number
          overperformance: number | null
          person_a: number
          person_b: number
          placements_together: number
          score: number | null
        }
        Insert: {
          events_together: number
          overperformance?: number | null
          person_a: number
          person_b: number
          placements_together: number
          score?: number | null
        }
        Update: {
          events_together?: number
          overperformance?: number | null
          person_a?: number
          person_b?: number
          placements_together?: number
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pair_synergy_person_a_fkey"
            columns: ["person_a"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_synergy_person_a_fkey"
            columns: ["person_a"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_synergy_person_b_fkey"
            columns: ["person_b"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_synergy_person_b_fkey"
            columns: ["person_b"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      pair_synergy_next: {
        Row: {
          events_together: number
          overperformance: number | null
          person_a: number
          person_b: number
          placements_together: number
          score: number | null
        }
        Insert: {
          events_together: number
          overperformance?: number | null
          person_a: number
          person_b: number
          placements_together: number
          score?: number | null
        }
        Update: {
          events_together?: number
          overperformance?: number | null
          person_a?: number
          person_b?: number
          placements_together?: number
          score?: number | null
        }
        Relationships: []
      }
      people: {
        Row: {
          bio: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          display_name: string
          github_url: string | null
          hidden: boolean
          id: number
          linkedin_url: string | null
          open_to_recruiters: boolean
          school_id: number | null
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          bio?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          display_name: string
          github_url?: string | null
          hidden?: boolean
          id?: never
          linkedin_url?: string | null
          open_to_recruiters?: boolean
          school_id?: number | null
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          bio?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          display_name?: string
          github_url?: string | null
          hidden?: boolean
          id?: never
          linkedin_url?: string | null
          open_to_recruiters?: boolean
          school_id?: number | null
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "public_schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          config_snapshot: Json | null
          events_added: number
          failures: number
          finished_at: string | null
          id: number
          job: string
          pages_fetched: number
          people_rated: number
          started_at: string
          status: string
          summary: Json
        }
        Insert: {
          config_snapshot?: Json | null
          events_added?: number
          failures?: number
          finished_at?: string | null
          id?: never
          job: string
          pages_fetched?: number
          people_rated?: number
          started_at?: string
          status?: string
          summary?: Json
        }
        Update: {
          config_snapshot?: Json | null
          events_added?: number
          failures?: number
          finished_at?: string | null
          id?: never
          job?: string
          pages_fetched?: number
          people_rated?: number
          started_at?: string
          status?: string
          summary?: Json
        }
        Relationships: []
      }
      prize_tier_overrides: {
        Row: {
          hackathon_id: number
          note: string | null
          prize_name: string
          tier: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          hackathon_id: number
          note?: string | null
          prize_name: string
          tier: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          hackathon_id?: number
          note?: string | null
          prize_name?: string
          tier?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prize_tier_overrides_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "prize_tier_overrides_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_tier_overrides_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_tier_rules: {
        Row: {
          enabled: boolean
          examples: string[]
          id: number
          match: string
          name: string
          pattern: string
          position: number
          tier: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          examples?: string[]
          id?: never
          match?: string
          name: string
          pattern: string
          position: number
          tier: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          examples?: string[]
          id?: never
          match?: string
          name?: string
          pattern?: string
          position?: number
          tier?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      prizes_won: {
        Row: {
          prize_name: string
          project_id: number
          tier: number
        }
        Insert: {
          prize_name: string
          project_id: number
          tier: number
        }
        Update: {
          prize_name?: string
          project_id?: number
          tier?: number
        }
        Relationships: [
          {
            foreignKeyName: "prizes_won_project_id_fkey"
            columns: ["project_id"]
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prizes_won_project_id_fkey"
            columns: ["project_id"]
            referencedRelation: "public_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          account_id: number
          project_id: number
        }
        Insert: {
          account_id: number
          project_id: number
        }
        Update: {
          account_id?: number
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_members_account_id_fkey"
            columns: ["account_id"]
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_account_id_fkey"
            columns: ["account_id"]
            referencedRelation: "public_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            referencedRelation: "public_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          anonymous_members: number
          built_with: string[]
          created_at: string
          description: string | null
          hackathon_id: number
          id: number
          is_winner: boolean
          source: string
          source_id: string
          tagline: string | null
          title: string
          updated_at: string
        }
        Insert: {
          anonymous_members?: number
          built_with?: string[]
          created_at?: string
          description?: string | null
          hackathon_id: number
          id?: never
          is_winner?: boolean
          source?: string
          source_id: string
          tagline?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          anonymous_members?: number
          built_with?: string[]
          created_at?: string
          description?: string | null
          hackathon_id?: number
          id?: never
          is_winner?: boolean
          source?: string
          source_id?: string
          tagline?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "projects_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_tiers: {
        Row: {
          id: number
          name: string
          position: number
          top_n: number | null
          top_percent: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: never
          name: string
          position: number
          top_n?: number | null
          top_percent?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: never
          name?: string
          position?: number
          top_n?: number | null
          top_percent?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      rating_history: {
        Row: {
          ends_on: string | null
          hackathon_id: number
          person_id: number
          score_after: number
          score_before: number
        }
        Insert: {
          ends_on?: string | null
          hackathon_id: number
          person_id: number
          score_after: number
          score_before: number
        }
        Update: {
          ends_on?: string | null
          hackathon_id?: number
          person_id?: number
          score_after?: number
          score_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "rating_history_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "rating_history_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_history_next: {
        Row: {
          ends_on: string | null
          hackathon_id: number
          person_id: number
          score_after: number
          score_before: number
        }
        Insert: {
          ends_on?: string | null
          hackathon_id: number
          person_id: number
          score_after: number
          score_before: number
        }
        Update: {
          ends_on?: string | null
          hackathon_id?: number
          person_id?: number
          score_after?: number
          score_before?: number
        }
        Relationships: []
      }
      rating_settings: {
        Row: {
          default_prize_tier: number
          id: boolean
          inactive_after_months: number
          mlh_digital_counts: boolean
          provisional_min_events: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_prize_tier?: number
          id?: boolean
          inactive_after_months?: number
          mlh_digital_counts?: boolean
          provisional_min_events?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_prize_tier?: number
          id?: boolean
          inactive_after_months?: number
          mlh_digital_counts?: boolean
          provisional_min_events?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ratings: {
        Row: {
          events: number
          grand_prizes: number
          last_event_on: string | null
          mu: number
          percentile: number | null
          person_id: number
          placements: number
          provisional: boolean
          score: number
          sigma: number
        }
        Insert: {
          events: number
          grand_prizes: number
          last_event_on?: string | null
          mu: number
          percentile?: number | null
          person_id: number
          placements: number
          provisional: boolean
          score: number
          sigma: number
        }
        Update: {
          events?: number
          grand_prizes?: number
          last_event_on?: string | null
          mu?: number
          percentile?: number | null
          person_id?: number
          placements?: number
          provisional?: boolean
          score?: number
          sigma?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings_next: {
        Row: {
          events: number
          grand_prizes: number
          last_event_on: string | null
          mu: number
          percentile: number | null
          person_id: number
          placements: number
          provisional: boolean
          score: number
          sigma: number
        }
        Insert: {
          events: number
          grand_prizes: number
          last_event_on?: string | null
          mu: number
          percentile?: number | null
          person_id: number
          placements: number
          provisional: boolean
          score: number
          sigma: number
        }
        Update: {
          events?: number
          grand_prizes?: number
          last_event_on?: string | null
          mu?: number
          percentile?: number | null
          person_id?: number
          placements?: number
          provisional?: boolean
          score?: number
          sigma?: number
        }
        Relationships: []
      }
      raw_pages_index: {
        Row: {
          fetched_at: string
          kind: string
          parser_version: string | null
          status: number
          storage_path: string | null
          url: string
          url_hash: string
        }
        Insert: {
          fetched_at: string
          kind: string
          parser_version?: string | null
          status: number
          storage_path?: string | null
          url: string
          url_hash: string
        }
        Update: {
          fetched_at?: string
          kind?: string
          parser_version?: string | null
          status?: number
          storage_path?: string | null
          url?: string
          url_hash?: string
        }
        Relationships: []
      }
      removals: {
        Row: {
          person_id: number
          reason: string | null
          requested_at: string
        }
        Insert: {
          person_id: number
          reason?: string | null
          requested_at?: string
        }
        Update: {
          person_id?: number
          reason?: string | null
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "removals_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removals_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      school_ratings: {
        Row: {
          members_rated: number
          rank: number | null
          school_id: number
          season: string
          top10_avg: number
        }
        Insert: {
          members_rated: number
          rank?: number | null
          school_id: number
          season: string
          top10_avg: number
        }
        Update: {
          members_rated?: number
          rank?: number | null
          school_id?: number
          season?: string
          top10_avg?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_ratings_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "public_schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_ratings_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_ratings_next: {
        Row: {
          members_rated: number
          rank: number | null
          school_id: number
          season: string
          top10_avg: number
        }
        Insert: {
          members_rated: number
          rank?: number | null
          school_id: number
          season: string
          top10_avg: number
        }
        Update: {
          members_rated?: number
          rank?: number | null
          school_id?: number
          season?: string
          top10_avg?: number
        }
        Relationships: []
      }
      schools: {
        Row: {
          aliases: string[]
          country: string | null
          created_at: string
          id: number
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          country?: string | null
          created_at?: string
          id?: never
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          country?: string | null
          created_at?: string
          id?: never
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      series_overrides: {
        Row: {
          created_at: string
          hackathon_id: number
          note: string | null
          series_id: number
        }
        Insert: {
          created_at?: string
          hackathon_id: number
          note?: string | null
          series_id: number
        }
        Update: {
          created_at?: string
          hackathon_id?: number
          note?: string | null
          series_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_overrides_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "series_overrides_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_overrides_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_overrides_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_overrides_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "public_event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      series_strength: {
        Row: {
          best_hackathon_id: number | null
          editions: number
          rating: number | null
          series_id: number
        }
        Insert: {
          best_hackathon_id?: number | null
          editions: number
          rating?: number | null
          series_id: number
        }
        Update: {
          best_hackathon_id?: number | null
          editions?: number
          rating?: number | null
          series_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_strength_best_hackathon_id_fkey"
            columns: ["best_hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "series_strength_best_hackathon_id_fkey"
            columns: ["best_hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_strength_best_hackathon_id_fkey"
            columns: ["best_hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_strength_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_strength_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "public_event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      series_strength_next: {
        Row: {
          best_hackathon_id: number | null
          editions: number
          rating: number | null
          series_id: number
        }
        Insert: {
          best_hackathon_id?: number | null
          editions: number
          rating?: number | null
          series_id: number
        }
        Update: {
          best_hackathon_id?: number | null
          editions?: number
          rating?: number | null
          series_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      hackathon_scope: {
        Row: {
          counts: string | null
          ends_on: string | null
          event_tier: string | null
          hackathon_id: number | null
          is_high_school: boolean | null
          is_mlh: boolean | null
          is_online: boolean | null
          is_rated: boolean | null
          note: string | null
          reason: string | null
          slug: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_settings_event_tier_fkey"
            columns: ["event_tier"]
            referencedRelation: "event_tiers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "hackathon_settings_event_tier_fkey"
            columns: ["event_tier"]
            referencedRelation: "public_event_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      public_accounts: {
        Row: {
          display_name: string | null
          id: number | null
          person_id: number | null
          source: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      public_event_series: {
        Row: {
          id: number | null
          name: string | null
          slug: string | null
        }
        Insert: {
          id?: number | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          id?: number | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      public_event_tiers: {
        Row: {
          code: string | null
          description: string | null
          label: string | null
          position: number | null
        }
        Insert: {
          code?: string | null
          description?: string | null
          label?: string | null
          position?: number | null
        }
        Update: {
          code?: string | null
          description?: string | null
          label?: string | null
          position?: number | null
        }
        Relationships: []
      }
      public_hackathon_strength: {
        Row: {
          elite_count: number | null
          event_rating: number | null
          field_mean: number | null
          field_size: number | null
          hackathon_id: number | null
          judging_corr: number | null
          top_field: number | null
          win_odds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_strength_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "hackathon_strength_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_strength_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      public_hackathons: {
        Row: {
          ends_on: string | null
          event_tier: string | null
          id: number | null
          is_mlh: boolean | null
          is_online: boolean | null
          location: string | null
          organization: string | null
          prize_total_usd: number | null
          registrations: number | null
          series_id: number | null
          slug: string | null
          starts_on: string | null
          themes: Json | null
          title: string | null
          url: string | null
          winners_announced: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_settings_event_tier_fkey"
            columns: ["event_tier"]
            referencedRelation: "event_tiers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "hackathon_settings_event_tier_fkey"
            columns: ["event_tier"]
            referencedRelation: "public_event_tiers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "hackathons_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathons_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "public_event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      public_pair_synergy: {
        Row: {
          events_together: number | null
          overperformance: number | null
          person_a: number | null
          person_b: number | null
          placements_together: number | null
          score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pair_synergy_person_a_fkey"
            columns: ["person_a"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_synergy_person_a_fkey"
            columns: ["person_a"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_synergy_person_b_fkey"
            columns: ["person_b"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_synergy_person_b_fkey"
            columns: ["person_b"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      public_people: {
        Row: {
          bio: string | null
          display_name: string | null
          github_url: string | null
          id: number | null
          is_claimed: boolean | null
          linkedin_url: string | null
          school_id: number | null
          slug: string | null
          website_url: string | null
        }
        Insert: {
          bio?: never
          display_name?: string | null
          github_url?: never
          id?: number | null
          is_claimed?: never
          linkedin_url?: never
          school_id?: number | null
          slug?: string | null
          website_url?: never
        }
        Update: {
          bio?: never
          display_name?: string | null
          github_url?: never
          id?: number | null
          is_claimed?: never
          linkedin_url?: never
          school_id?: number | null
          slug?: string | null
          website_url?: never
        }
        Relationships: [
          {
            foreignKeyName: "people_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "public_schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      public_prizes_won: {
        Row: {
          prize_name: string | null
          project_id: number | null
          tier: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prizes_won_project_id_fkey"
            columns: ["project_id"]
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prizes_won_project_id_fkey"
            columns: ["project_id"]
            referencedRelation: "public_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      public_project_members: {
        Row: {
          display_name: string | null
          person_id: number | null
          person_slug: string | null
          project_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            referencedRelation: "public_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      public_projects: {
        Row: {
          anonymous_members: number | null
          built_with: string[] | null
          hackathon_id: number | null
          id: number | null
          is_winner: boolean | null
          source: string | null
          source_id: string | null
          tagline: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "projects_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      public_rank_tiers: {
        Row: {
          name: string | null
          position: number | null
          top_n: number | null
          top_percent: number | null
        }
        Insert: {
          name?: string | null
          position?: number | null
          top_n?: number | null
          top_percent?: number | null
        }
        Update: {
          name?: string | null
          position?: number | null
          top_n?: number | null
          top_percent?: number | null
        }
        Relationships: []
      }
      public_rating_history: {
        Row: {
          ends_on: string | null
          hackathon_id: number | null
          person_id: number | null
          score_after: number | null
          score_before: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_history_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "rating_history_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_hackathon_id_fkey"
            columns: ["hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_history_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      public_ratings: {
        Row: {
          events: number | null
          grand_prizes: number | null
          last_event_on: string | null
          mu: number | null
          percentile: number | null
          person_id: number | null
          placements: number | null
          provisional: boolean | null
          score: number | null
          sigma: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_person_id_fkey"
            columns: ["person_id"]
            referencedRelation: "public_people"
            referencedColumns: ["id"]
          },
        ]
      }
      public_school_ratings: {
        Row: {
          members_rated: number | null
          rank: number | null
          school_id: number | null
          season: string | null
          top10_avg: number | null
        }
        Insert: {
          members_rated?: number | null
          rank?: number | null
          school_id?: number | null
          season?: string | null
          top10_avg?: number | null
        }
        Update: {
          members_rated?: number | null
          rank?: number | null
          school_id?: number | null
          season?: string | null
          top10_avg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "school_ratings_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "public_schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_ratings_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      public_schools: {
        Row: {
          country: string | null
          id: number | null
          name: string | null
          slug: string | null
        }
        Insert: {
          country?: string | null
          id?: number | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          country?: string | null
          id?: number | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      public_series_strength: {
        Row: {
          best_hackathon_id: number | null
          editions: number | null
          rating: number | null
          series_id: number | null
        }
        Insert: {
          best_hackathon_id?: number | null
          editions?: number | null
          rating?: number | null
          series_id?: number | null
        }
        Update: {
          best_hackathon_id?: number | null
          editions?: number | null
          rating?: number | null
          series_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "series_strength_best_hackathon_id_fkey"
            columns: ["best_hackathon_id"]
            referencedRelation: "hackathon_scope"
            referencedColumns: ["hackathon_id"]
          },
          {
            foreignKeyName: "series_strength_best_hackathon_id_fkey"
            columns: ["best_hackathon_id"]
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_strength_best_hackathon_id_fkey"
            columns: ["best_hackathon_id"]
            referencedRelation: "public_hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_strength_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_strength_series_id_fkey"
            columns: ["series_id"]
            referencedRelation: "public_event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      search_index: {
        Row: {
          kind: string | null
          name: string | null
          rank_score: number | null
          ref_id: number | null
          school: string | null
          slug: string | null
          username: string | null
          usernames: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      f_unaccent: { Args: { "": string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      move_prize_rule: {
        Args: { direction: number; rule_id: number }
        Returns: undefined
      }
      publish_gold: { Args: never; Returns: undefined }
      search: {
        Args: { lim?: number; q: string }
        Returns: {
          kind: string
          name: string
          rank_score: number
          school: string
          slug: string
          username: string
        }[]
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
    Enums: {},
  },
} as const
