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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      checkins: {
        Row: {
          checked_in_at: string
          created_at: string
          id: string
          ip_hash: string | null
          method: string
          owner_id: string
        }
        Insert: {
          checked_in_at?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          method: string
          owner_id: string
        }
        Update: {
          checked_in_at?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          method?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      heartbeat_settings: {
        Row: {
          cadence_days: number
          created_at: string
          grace_days: number
          id: string
          next_checkin_due: string
          owner_id: string
          reminder_days_before: number[]
          state: string
          state_changed_at: string
          updated_at: string
        }
        Insert: {
          cadence_days?: number
          created_at?: string
          grace_days?: number
          id?: string
          next_checkin_due: string
          owner_id: string
          reminder_days_before?: number[]
          state?: string
          state_changed_at?: string
          updated_at?: string
        }
        Update: {
          cadence_days?: number
          created_at?: string
          grace_days?: number
          id?: string
          next_checkin_due?: string
          owner_id?: string
          reminder_days_before?: number[]
          state?: string
          state_changed_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "heartbeat_settings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      keeper_confirmations: {
        Row: {
          confirmed_at: string
          decision: string
          id: string
          keeper_id: string
          note: string | null
          release_id: string
        }
        Insert: {
          confirmed_at?: string
          decision: string
          id?: string
          keeper_id: string
          note?: string | null
          release_id: string
        }
        Update: {
          confirmed_at?: string
          decision?: string
          id?: string
          keeper_id?: string
          note?: string | null
          release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "keeper_confirmations_keeper_id_fkey"
            columns: ["keeper_id"]
            isOneToOne: false
            referencedRelation: "keepers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keeper_confirmations_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "release_processes"
            referencedColumns: ["id"]
          },
        ]
      }
      keepers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          invite_email_failed: boolean
          invite_expires_at: string | null
          invite_token_hash: string | null
          name: string
          owner_id: string
          public_key: string | null
          relationship: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          invite_email_failed?: boolean
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          name: string
          owner_id: string
          public_key?: string | null
          relationship?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          invite_email_failed?: boolean
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          name?: string
          owner_id?: string
          public_key?: string | null
          relationship?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "keepers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      letters: {
        Row: {
          ai_assisted: boolean
          created_at: string
          delivered_at: string | null
          id: string
          iv: string
          owner_id: string
          payload_ciphertext: string
          recipient_keeper_id: string
          status: string
          updated_at: string
          vault_id: string
        }
        Insert: {
          ai_assisted?: boolean
          created_at?: string
          delivered_at?: string | null
          id?: string
          iv: string
          owner_id: string
          payload_ciphertext: string
          recipient_keeper_id: string
          status?: string
          updated_at?: string
          vault_id: string
        }
        Update: {
          ai_assisted?: boolean
          created_at?: string
          delivered_at?: string | null
          id?: string
          iv?: string
          owner_id?: string
          payload_ciphertext?: string
          recipient_keeper_id?: string
          status?: string
          updated_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "letters_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_recipient_keeper_id_fkey"
            columns: ["recipient_keeper_id"]
            isOneToOne: false
            referencedRelation: "keepers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          created_at: string
          due_date: string
          id: string
          kind: string
          owner_id: string
          payload: Json
          read_at: string | null
          sent_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          due_date: string
          id?: string
          kind: string
          owner_id: string
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          due_date?: string
          id?: string
          kind?: string
          owner_id?: string
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          demo_time_offset: string | null
          display_name: string
          id: string
          onboarding_completed_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          demo_time_offset?: string | null
          display_name: string
          id: string
          onboarding_completed_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          demo_time_offset?: string | null
          display_name?: string
          id?: string
          onboarding_completed_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      release_processes: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          owner_id: string
          released_at: string | null
          required_confirmations: number
          state: string
          triggered_at: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          owner_id: string
          released_at?: string | null
          required_confirmations?: number
          state?: string
          triggered_at: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          released_at?: string | null
          required_confirmations?: number
          state?: string
          triggered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_processes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_items: {
        Row: {
          created_at: string
          id: string
          iv: string
          kind: string
          payload_ciphertext: string
          recipient_keeper_id: string | null
          sort_order: number
          updated_at: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          iv: string
          kind: string
          payload_ciphertext: string
          recipient_keeper_id?: string | null
          sort_order?: number
          updated_at?: string
          vault_id: string
        }
        Update: {
          created_at?: string
          id?: string
          iv?: string
          kind?: string
          payload_ciphertext?: string
          recipient_keeper_id?: string | null
          sort_order?: number
          updated_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_items_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vaults: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          recovery_hint: string | null
          salt: string
          updated_at: string
          wrapped_dek: string
          wrapped_dek_for_keepers: Json
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          recovery_hint?: string | null
          salt: string
          updated_at?: string
          wrapped_dek: string
          wrapped_dek_for_keepers?: Json
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          recovery_hint?: string | null
          salt?: string
          updated_at?: string
          wrapped_dek?: string
          wrapped_dek_for_keepers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "vaults_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      will_items: {
        Row: {
          category: string
          created_at: string
          id: string
          iv: string | null
          notes_ciphertext: string | null
          owner_id: string
          service_name: string
          sort_order: number
          transfer_to_keeper_id: string | null
          updated_at: string
          wish: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          iv?: string | null
          notes_ciphertext?: string | null
          owner_id: string
          service_name: string
          sort_order?: number
          transfer_to_keeper_id?: string | null
          updated_at?: string
          wish?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          iv?: string | null
          notes_ciphertext?: string | null
          owner_id?: string
          service_name?: string
          sort_order?: number
          transfer_to_keeper_id?: string | null
          updated_at?: string
          wish?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "will_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "will_items_transfer_to_keeper_id_fkey"
            columns: ["transfer_to_keeper_id"]
            isOneToOne: false
            referencedRelation: "keepers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_keeper_invite: {
        Args: { p_public_key: string; p_token_hash: string }
        Returns: string
      }
      decline_keeper_invite: {
        Args: { p_token_hash: string }
        Returns: boolean
      }
      get_keeper_invite: {
        Args: { p_token_hash: string }
        Returns: {
          expired: boolean
          keeper_email: string
          keeper_id: string
          keeper_name: string
          owner_name: string
          status: string
        }[]
      }
      get_release_context: {
        Args: { p_release_id: string }
        Returns: {
          as_of: string
          confirmations: number
          keeper_id: string
          last_checkin_at: string
          my_decision: string
          owner_name: string
          release_state: string
          released_at: string
          required_confirmations: number
          triggered_at: string
        }[]
      }
      notify_release_pending: {
        Args: { p_release_id: string }
        Returns: number
      }
      pending_letter_emails: {
        Args: { p_release_id: string }
        Returns: {
          keeper_email: string
          keeper_id: string
          keeper_name: string
          letter_count: number
        }[]
      }
      pending_will_emails: {
        Args: { p_release_id: string }
        Returns: {
          keeper_email: string
          keeper_id: string
          keeper_name: string
        }[]
      }
      record_keeper_decision: {
        Args: {
          p_decision: string
          p_keeper_id: string
          p_note?: string
          p_release_id: string
        }
        Returns: {
          confirmations: number
          outcome: string
          release_state: string
          required_confirmations: number
        }[]
      }
      record_letter_email_attempt: {
        Args: { p_keeper_id: string; p_ok: boolean; p_release_id: string }
        Returns: undefined
      }
      record_will_email_attempt: {
        Args: { p_keeper_id: string; p_ok: boolean; p_release_id: string }
        Returns: undefined
      }
      release_party_emails: {
        Args: { p_release_id: string }
        Returns: {
          party_email: string
          party_name: string
          party_role: string
        }[]
      }
      will_transfer_keepers: {
        Args: { p_release_id: string }
        Returns: {
          available: boolean
          keeper_id: string
          keeper_name: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

// App-level aliases for text columns guarded by CHECK constraints (the schema
// uses no Postgres enums, so the generator emits `string` for these columns).
// Re-append this block after regenerating with `pnpm db:types`.
export type KeeperStatus = "invited" | "accepted" | "declined" | "revoked";
export type KeeperDecision = "confirm" | "false_alarm";
export type LetterStatus = "draft" | "final";
export type WillWish = "delete" | "memorialize" | "transfer" | "archive" | "ignore";
export type WillCategory = "social" | "finance" | "email" | "photos" | "work" | "other";
export type DecisionOutcome =
  | "recorded"
  | "released"
  | "cancelled"
  | "already_decided"
  | "not_open";
