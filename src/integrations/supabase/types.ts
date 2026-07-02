export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      account_guardrails: {
        Row: {
          account_id: string;
          cooldown_minutes_after_loss: number | null;
          created_at: string;
          daily_loss_reminder: boolean;
          id: string;
          lock_after_emotional_violations: number | null;
          require_post_trade_review: boolean;
          require_screenshot: boolean;
          require_trade_plan: boolean;
          stop_after_consecutive_losses: number | null;
          stop_after_daily_loss: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          cooldown_minutes_after_loss?: number | null;
          created_at?: string;
          daily_loss_reminder?: boolean;
          id?: string;
          lock_after_emotional_violations?: number | null;
          require_post_trade_review?: boolean;
          require_screenshot?: boolean;
          require_trade_plan?: boolean;
          stop_after_consecutive_losses?: number | null;
          stop_after_daily_loss?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          cooldown_minutes_after_loss?: number | null;
          created_at?: string;
          daily_loss_reminder?: boolean;
          id?: string;
          lock_after_emotional_violations?: number | null;
          require_post_trade_review?: boolean;
          require_screenshot?: boolean;
          require_trade_plan?: boolean;
          stop_after_consecutive_losses?: number | null;
          stop_after_daily_loss?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_guardrails_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "trading_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      community_group_invitations: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          invitee_id: string;
          inviter_id: string;
          responded_at: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          invitee_id: string;
          inviter_id: string;
          responded_at?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          invitee_id?: string;
          inviter_id?: string;
          responded_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_group_invitations_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "community_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      community_group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          group_id: string;
          joined_at?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          group_id?: string;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "community_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      community_groups: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      community_notifications: {
        Row: {
          created_at: string;
          id: string;
          payload: Json;
          read_at: string | null;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload?: Json;
          read_at?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: Json;
          read_at?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      community_trade_comments: {
        Row: {
          body: string;
          created_at: string;
          group_id: string;
          id: string;
          parent_id: string | null;
          trade_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          group_id: string;
          id?: string;
          parent_id?: string | null;
          trade_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          group_id?: string;
          id?: string;
          parent_id?: string | null;
          trade_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_trade_comments_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "community_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_trade_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "community_trade_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_trade_comments_trade_id_fkey";
            columns: ["trade_id"];
            isOneToOne: false;
            referencedRelation: "trades";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          disabled: boolean;
          expires_at: string;
          id: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          disabled?: boolean;
          expires_at: string;
          id?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          disabled?: boolean;
          expires_at?: string;
          id?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [];
      };
      notebook_entries: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          note_type: string;
          tags: string[];
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          note_type?: string;
          tags?: string[];
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          note_type?: string;
          tags?: string[];
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          community_access: boolean;
          created_at: string;
          deletion_cancelled_at: string | null;
          deletion_requested_at: string | null;
          deletion_scheduled_for: string | null;
          display_name: string | null;
          edge_id: string | null;
          has_seen_intro: boolean;
          id: string;
          notification_preferences: Json;
          updated_at: string;
          username: string;
        };
        Insert: {
          community_access?: boolean;
          created_at?: string;
          deletion_cancelled_at?: string | null;
          deletion_requested_at?: string | null;
          deletion_scheduled_for?: string | null;
          display_name?: string | null;
          edge_id?: string | null;
          has_seen_intro?: boolean;
          id: string;
          notification_preferences?: Json;
          updated_at?: string;
          username: string;
        };
        Update: {
          community_access?: boolean;
          created_at?: string;
          deletion_cancelled_at?: string | null;
          deletion_requested_at?: string | null;
          deletion_scheduled_for?: string | null;
          display_name?: string | null;
          edge_id?: string | null;
          has_seen_intro?: boolean;
          id?: string;
          notification_preferences?: Json;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      sticky_notes: {
        Row: {
          archived: boolean;
          color: string;
          content: string;
          created_at: string;
          id: string;
          kind: string | null;
          pinned: boolean;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          color?: string;
          content?: string;
          created_at?: string;
          id?: string;
          kind?: string | null;
          pinned?: boolean;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived?: boolean;
          color?: string;
          content?: string;
          created_at?: string;
          id?: string;
          kind?: string | null;
          pinned?: boolean;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      trade_screenshots: {
        Row: {
          annotations: Json;
          caption: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["screenshot_kind"];
          storage_path: string;
          trade_id: string;
          user_id: string;
        };
        Insert: {
          annotations?: Json;
          caption?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["screenshot_kind"];
          storage_path: string;
          trade_id: string;
          user_id: string;
        };
        Update: {
          annotations?: Json;
          caption?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["screenshot_kind"];
          storage_path?: string;
          trade_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trade_screenshots_trade_id_fkey";
            columns: ["trade_id"];
            isOneToOne: false;
            referencedRelation: "trades";
            referencedColumns: ["id"];
          },
        ];
      };
      trades: {
        Row: {
          account_id: string | null;
          account_size: number | null;
          achieved_rr: number | null;
          categories: string[];
          closed_at: string | null;
          closed_reason: string | null;
          created_at: string;
          direction: Database["public"]["Enums"]["trade_direction"];
          emotion_after: string | null;
          emotion_before: string | null;
          emotion_during: string | null;
          emotion_tags: string[];
          entry_price: number | null;
          exit_price: number | null;
          floating_pnl: number | null;
          grade: Database["public"]["Enums"]["trade_grade"] | null;
          id: string;
          in_killzone: boolean | null;
          instrument: string;
          is_paper: boolean;
          is_shared: boolean;
          killzone: string | null;
          lessons_learned: string | null;
          live_price: number | null;
          market: Database["public"]["Enums"]["market_type"];
          mistake_tags: string[];
          mistakes_made: string | null;
          notes: string | null;
          opened_at: string | null;
          planned_rr: string | null;
          pnl_amount: number | null;
          position_size: number | null;
          private_notes: string | null;
          reasoning: string | null;
          result: Database["public"]["Enums"]["trade_result"] | null;
          reward_amount: number | null;
          risk_amount: number | null;
          risk_percentage: number | null;
          session: string | null;
          status: string;
          stop_loss: number | null;
          subcategories: string[];
          take_profit: number | null;
          trade_date: string;
          trade_number: number | null;
          trade_time: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id?: string | null;
          account_size?: number | null;
          achieved_rr?: number | null;
          categories?: string[];
          closed_at?: string | null;
          closed_reason?: string | null;
          created_at?: string;
          direction: Database["public"]["Enums"]["trade_direction"];
          emotion_after?: string | null;
          emotion_before?: string | null;
          emotion_during?: string | null;
          emotion_tags?: string[];
          entry_price?: number | null;
          exit_price?: number | null;
          floating_pnl?: number | null;
          grade?: Database["public"]["Enums"]["trade_grade"] | null;
          id?: string;
          in_killzone?: boolean | null;
          instrument: string;
          is_paper?: boolean;
          is_shared?: boolean;
          killzone?: string | null;
          lessons_learned?: string | null;
          live_price?: number | null;
          market: Database["public"]["Enums"]["market_type"];
          mistake_tags?: string[];
          mistakes_made?: string | null;
          notes?: string | null;
          opened_at?: string | null;
          planned_rr?: string | null;
          pnl_amount?: number | null;
          position_size?: number | null;
          private_notes?: string | null;
          reasoning?: string | null;
          result?: Database["public"]["Enums"]["trade_result"] | null;
          reward_amount?: number | null;
          risk_amount?: number | null;
          risk_percentage?: number | null;
          session?: string | null;
          status?: string;
          stop_loss?: number | null;
          subcategories?: string[];
          take_profit?: number | null;
          trade_date: string;
          trade_number?: number | null;
          trade_time?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string | null;
          account_size?: number | null;
          achieved_rr?: number | null;
          categories?: string[];
          closed_at?: string | null;
          closed_reason?: string | null;
          created_at?: string;
          direction?: Database["public"]["Enums"]["trade_direction"];
          emotion_after?: string | null;
          emotion_before?: string | null;
          emotion_during?: string | null;
          emotion_tags?: string[];
          entry_price?: number | null;
          exit_price?: number | null;
          floating_pnl?: number | null;
          grade?: Database["public"]["Enums"]["trade_grade"] | null;
          id?: string;
          in_killzone?: boolean | null;
          instrument?: string;
          is_paper?: boolean;
          is_shared?: boolean;
          killzone?: string | null;
          lessons_learned?: string | null;
          live_price?: number | null;
          market?: Database["public"]["Enums"]["market_type"];
          mistake_tags?: string[];
          mistakes_made?: string | null;
          notes?: string | null;
          opened_at?: string | null;
          planned_rr?: string | null;
          pnl_amount?: number | null;
          position_size?: number | null;
          private_notes?: string | null;
          reasoning?: string | null;
          result?: Database["public"]["Enums"]["trade_result"] | null;
          reward_amount?: number | null;
          risk_amount?: number | null;
          risk_percentage?: number | null;
          session?: string | null;
          status?: string;
          stop_loss?: number | null;
          subcategories?: string[];
          take_profit?: number | null;
          trade_date?: string;
          trade_number?: number | null;
          trade_time?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "trading_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      trading_accounts: {
        Row: {
          account_type: string;
          broker: string | null;
          challenge_phase: string | null;
          challenge_provider: string | null;
          created_at: string;
          current_balance: number | null;
          daily_loss_limit_pct: number | null;
          id: string;
          is_active: boolean;
          max_correlated_positions: number | null;
          max_open_positions: number | null;
          max_risk_per_trade_pct: number | null;
          max_trades_per_day: number | null;
          monthly_loss_limit_pct: number | null;
          name: string;
          news_trading_allowed: boolean;
          starting_balance: number;
          status: string;
          updated_at: string;
          user_id: string;
          weekend_holding_allowed: boolean;
          weekly_loss_limit_pct: number | null;
        };
        Insert: {
          account_type?: string;
          broker?: string | null;
          challenge_phase?: string | null;
          challenge_provider?: string | null;
          created_at?: string;
          current_balance?: number | null;
          daily_loss_limit_pct?: number | null;
          id?: string;
          is_active?: boolean;
          max_correlated_positions?: number | null;
          max_open_positions?: number | null;
          max_risk_per_trade_pct?: number | null;
          max_trades_per_day?: number | null;
          monthly_loss_limit_pct?: number | null;
          name: string;
          news_trading_allowed?: boolean;
          starting_balance?: number;
          status?: string;
          updated_at?: string;
          user_id: string;
          weekend_holding_allowed?: boolean;
          weekly_loss_limit_pct?: number | null;
        };
        Update: {
          account_type?: string;
          broker?: string | null;
          challenge_phase?: string | null;
          challenge_provider?: string | null;
          created_at?: string;
          current_balance?: number | null;
          daily_loss_limit_pct?: number | null;
          id?: string;
          is_active?: boolean;
          max_correlated_positions?: number | null;
          max_open_positions?: number | null;
          max_risk_per_trade_pct?: number | null;
          max_trades_per_day?: number | null;
          monthly_loss_limit_pct?: number | null;
          name?: string;
          news_trading_allowed?: boolean;
          starting_balance?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
          weekend_holding_allowed?: boolean;
          weekly_loss_limit_pct?: number | null;
        };
        Relationships: [];
      };
      trading_preferences: {
        Row: {
          account_type: string | null;
          created_at: string;
          default_risk_pct: number | null;
          id: string;
          max_daily_loss: number | null;
          max_daily_profit: number | null;
          max_trades_per_day: number | null;
          primary_market: string | null;
          primary_session: string | null;
          require_post_trade_reflection: boolean;
          require_screenshot: boolean;
          require_setup_selection: boolean;
          starting_balance: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_type?: string | null;
          created_at?: string;
          default_risk_pct?: number | null;
          id?: string;
          max_daily_loss?: number | null;
          max_daily_profit?: number | null;
          max_trades_per_day?: number | null;
          primary_market?: string | null;
          primary_session?: string | null;
          require_post_trade_reflection?: boolean;
          require_screenshot?: boolean;
          require_setup_selection?: boolean;
          starting_balance?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_type?: string | null;
          created_at?: string;
          default_risk_pct?: number | null;
          id?: string;
          max_daily_loss?: number | null;
          max_daily_profit?: number | null;
          max_trades_per_day?: number | null;
          primary_market?: string | null;
          primary_session?: string | null;
          require_post_trade_reflection?: boolean;
          require_screenshot?: boolean;
          require_setup_selection?: boolean;
          starting_balance?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_edge_id: { Args: never; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "member";
      market_type: "forex" | "crypto" | "stocks" | "indices" | "futures" | "commodities" | "other";
      screenshot_kind: "before" | "after";
      trade_direction: "long" | "short";
      trade_grade: "A+" | "A" | "B+" | "B" | "C" | "D";
      trade_result: "win" | "loss" | "breakeven";
      trading_session: "asia" | "london" | "new_york" | "overlap" | "custom";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
      market_type: ["forex", "crypto", "stocks", "indices", "futures", "commodities", "other"],
      screenshot_kind: ["before", "after"],
      trade_direction: ["long", "short"],
      trade_grade: ["A+", "A", "B+", "B", "C", "D"],
      trade_result: ["win", "loss", "breakeven"],
      trading_session: ["asia", "london", "new_york", "overlap", "custom"],
    },
  },
} as const;
