


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'member'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."market_type" AS ENUM (
    'forex',
    'crypto',
    'stocks',
    'indices',
    'futures',
    'commodities',
    'other'
);


ALTER TYPE "public"."market_type" OWNER TO "postgres";


CREATE TYPE "public"."screenshot_kind" AS ENUM (
    'before',
    'after'
);


ALTER TYPE "public"."screenshot_kind" OWNER TO "postgres";


CREATE TYPE "public"."trade_direction" AS ENUM (
    'long',
    'short'
);


ALTER TYPE "public"."trade_direction" OWNER TO "postgres";


CREATE TYPE "public"."trade_grade" AS ENUM (
    'A+',
    'A',
    'B+',
    'B',
    'C',
    'D'
);


ALTER TYPE "public"."trade_grade" OWNER TO "postgres";


CREATE TYPE "public"."trade_result" AS ENUM (
    'win',
    'loss',
    'breakeven'
);


ALTER TYPE "public"."trade_result" OWNER TO "postgres";


CREATE TYPE "public"."trading_session" AS ENUM (
    'asia',
    'london',
    'new_york',
    'overlap',
    'custom'
);


ALTER TYPE "public"."trading_session" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_trade_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.trade_number IS NULL THEN
    SELECT COALESCE(MAX(trade_number), 0) + 1
      INTO NEW.trade_number
      FROM public.trades
      WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."assign_trade_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_edge_id"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i INT;
  attempts INT := 0;
BEGIN
  LOOP
    candidate := 'EDGE-';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE edge_id = candidate);
    attempts := attempts + 1;
    IF attempts > 25 THEN
      RAISE EXCEPTION 'Failed to allocate edge_id';
    END IF;
  END LOOP;
  RETURN candidate;
END
$$;


ALTER FUNCTION "public"."generate_edge_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  uname TEXT;
  is_first BOOLEAN;
  eid TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '_' || substr(NEW.id::text, 1, 6);
  END IF;
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
  eid := public.generate_edge_id();
  INSERT INTO public.profiles (id, username, display_name, community_access, edge_id)
  VALUES (NEW.id, uname, COALESCE(NEW.raw_user_meta_data->>'display_name', uname), is_first, eid);
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = NEW.id;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_guardrails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "stop_after_consecutive_losses" integer,
    "stop_after_daily_loss" boolean DEFAULT false NOT NULL,
    "cooldown_minutes_after_loss" integer,
    "require_trade_plan" boolean DEFAULT false NOT NULL,
    "require_screenshot" boolean DEFAULT false NOT NULL,
    "require_post_trade_review" boolean DEFAULT false NOT NULL,
    "lock_after_emotional_violations" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "daily_loss_reminder" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."account_guardrails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_group_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "invitee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "community_group_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."community_group_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_group_members" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_group_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."community_group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_groups_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 60)))
);


ALTER TABLE "public"."community_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_notifications_type_check" CHECK (("type" = ANY (ARRAY['invite_received'::"text", 'invite_accepted'::"text", 'trade_shared'::"text", 'comment_added'::"text"])))
);


ALTER TABLE "public"."community_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_trade_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trade_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_trade_comments_body_check" CHECK ((("length"(TRIM(BOTH FROM "body")) >= 1) AND ("length"(TRIM(BOTH FROM "body")) <= 4000)))
);


ALTER TABLE "public"."community_trade_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_trade_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "share_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_trade_reactions_reaction_type_check" CHECK (("reaction_type" = ANY (ARRAY['reviewed'::"text", 'good_execution'::"text", 'rule_break'::"text", 'useful_note'::"text", 'clean_setup'::"text"])))
);


ALTER TABLE "public"."community_trade_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_trade_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trade_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "include_reasoning" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."community_trade_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "used_by" "uuid",
    "used_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "disabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notebook_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note_type" "text" DEFAULT 'general'::"text" NOT NULL,
    CONSTRAINT "notebook_entries_note_type_check" CHECK (("note_type" = ANY (ARRAY['setup'::"text", 'lesson'::"text", 'review'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."notebook_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text",
    "notification_preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "community_access" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edge_id" "text" DEFAULT "public"."generate_edge_id"() NOT NULL,
    "has_seen_intro" boolean DEFAULT false NOT NULL,
    "profile_completed" boolean DEFAULT false NOT NULL,
    "activation_guide_completed_at" timestamp with time zone,
    "deletion_requested_at" timestamp with time zone,
    "deletion_scheduled_for" timestamp with time zone,
    "deletion_cancelled_at" timestamp with time zone,
    "deletion_purge_state" "text" DEFAULT 'unclaimed'::"text" NOT NULL,
    "deletion_purge_claim_token" "uuid",
    "deletion_purge_claimed_at" timestamp with time zone,
    "deletion_purge_attempt_count" integer DEFAULT 0 NOT NULL,
    "deletion_purge_last_attempt_at" timestamp with time zone,
    "deletion_purge_next_attempt_at" timestamp with time zone,
    "deletion_purge_last_error_code" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sticky_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "color" "text" DEFAULT 'default'::"text" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text"
);


ALTER TABLE "public"."sticky_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trade_screenshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trade_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "kind" "public"."screenshot_kind" DEFAULT 'before'::"public"."screenshot_kind" NOT NULL,
    "caption" "text",
    "annotations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trade_screenshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "market" "public"."market_type" NOT NULL,
    "instrument" "text" NOT NULL,
    "trade_date" "date" NOT NULL,
    "trade_time" time without time zone,
    "direction" "public"."trade_direction" NOT NULL,
    "entry_price" numeric(20,8),
    "stop_loss" numeric(20,8),
    "take_profit" numeric(20,8),
    "exit_price" numeric(20,8),
    "account_size" numeric(20,2),
    "risk_percentage" numeric(8,4),
    "position_size" numeric(20,8),
    "planned_rr" "text",
    "achieved_rr" numeric(8,2),
    "result" "public"."trade_result",
    "grade" "public"."trade_grade",
    "session" "text",
    "reasoning" "text",
    "lessons_learned" "text",
    "mistakes_made" "text",
    "notes" "text",
    "emotion_before" "text",
    "emotion_during" "text",
    "emotion_after" "text",
    "mistake_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subcategories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_shared" boolean DEFAULT false NOT NULL,
    "is_paper" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'closed'::"text" NOT NULL,
    "live_price" numeric,
    "floating_pnl" numeric,
    "closed_reason" "text",
    "opened_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid",
    "risk_amount" numeric(20,2),
    "reward_amount" numeric(20,2),
    "pnl_amount" numeric(20,2),
    "private_notes" "text",
    "trade_number" integer,
    "killzone" "text",
    "in_killzone" boolean,
    "emotion_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "trades_closed_reason_check" CHECK ((("closed_reason" IS NULL) OR ("closed_reason" = ANY (ARRAY['tp'::"text", 'sl'::"text", 'manual'::"text"])))),
    CONSTRAINT "trades_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."trades" OWNER TO "postgres";


COMMENT ON COLUMN "public"."trades"."in_killzone" IS 'Whether the trade was taken during the trader''s personal killzone (discipline checkbox).';



COMMENT ON COLUMN "public"."trades"."emotion_tags" IS 'Multi-select emoji-based emotion tags captured during trade review.';



CREATE TABLE IF NOT EXISTS "public"."trading_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "account_type" "text" DEFAULT 'personal'::"text" NOT NULL,
    "starting_balance" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "broker" "text",
    "challenge_provider" "text",
    "challenge_phase" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "max_risk_per_trade_pct" numeric(6,3),
    "daily_loss_limit_pct" numeric(6,3),
    "weekly_loss_limit_pct" numeric(6,3),
    "monthly_loss_limit_pct" numeric(6,3),
    "max_open_positions" integer,
    "max_correlated_positions" integer,
    "news_trading_allowed" boolean DEFAULT true NOT NULL,
    "weekend_holding_allowed" boolean DEFAULT true NOT NULL,
    "max_trades_per_day" integer,
    "current_balance" numeric(20,2),
    CONSTRAINT "trading_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['personal'::"text", 'funded'::"text", 'demo'::"text", 'live'::"text", 'challenge'::"text", 'backtest'::"text"]))),
    CONSTRAINT "trading_accounts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."trading_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trading_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "starting_balance" numeric(18,2),
    "account_type" "text",
    "default_risk_pct" numeric(6,3),
    "max_trades_per_day" integer,
    "max_daily_loss" numeric(18,2),
    "max_daily_profit" numeric(18,2),
    "primary_market" "text",
    "primary_session" "text",
    "require_screenshot" boolean DEFAULT false NOT NULL,
    "require_setup_selection" boolean DEFAULT false NOT NULL,
    "require_post_trade_reflection" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trading_preferences_account_type_check" CHECK (("account_type" = ANY (ARRAY['personal'::"text", 'funded'::"text", 'demo'::"text"]))),
    CONSTRAINT "trading_preferences_primary_market_check" CHECK (("primary_market" = ANY (ARRAY['forex'::"text", 'crypto'::"text", 'indices'::"text", 'gold'::"text", 'stocks'::"text"]))),
    CONSTRAINT "trading_preferences_primary_session_check" CHECK (("primary_session" = ANY (ARRAY['london'::"text", 'new_york'::"text", 'asian'::"text", 'multiple'::"text"])))
);


ALTER TABLE "public"."trading_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_guardrails"
    ADD CONSTRAINT "account_guardrails_account_id_key" UNIQUE ("account_id");



ALTER TABLE ONLY "public"."account_guardrails"
    ADD CONSTRAINT "account_guardrails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_group_invitations"
    ADD CONSTRAINT "community_group_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_group_members"
    ADD CONSTRAINT "community_group_members_pkey" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."community_groups"
    ADD CONSTRAINT "community_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_notifications"
    ADD CONSTRAINT "community_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_trade_comments"
    ADD CONSTRAINT "community_trade_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_trade_reactions"
    ADD CONSTRAINT "community_trade_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_trade_reactions"
    ADD CONSTRAINT "community_trade_reactions_share_id_user_id_key" UNIQUE ("share_id", "user_id");



ALTER TABLE ONLY "public"."community_trade_shares"
    ADD CONSTRAINT "community_trade_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_trade_shares"
    ADD CONSTRAINT "community_trade_shares_trade_id_group_id_key" UNIQUE ("trade_id", "group_id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notebook_entries"
    ADD CONSTRAINT "notebook_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."sticky_notes"
    ADD CONSTRAINT "sticky_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trade_screenshots"
    ADD CONSTRAINT "trade_screenshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trading_accounts"
    ADD CONSTRAINT "trading_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trading_preferences"
    ADD CONSTRAINT "trading_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trading_preferences"
    ADD CONSTRAINT "trading_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



CREATE INDEX "cgi_invitee_idx" ON "public"."community_group_invitations" USING "btree" ("invitee_id");



CREATE UNIQUE INDEX "cgi_pending_unique" ON "public"."community_group_invitations" USING "btree" ("group_id", "invitee_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "cgm_user_idx" ON "public"."community_group_members" USING "btree" ("user_id");



CREATE INDEX "cn_user_idx" ON "public"."community_notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "ctc_trade_group_idx" ON "public"."community_trade_comments" USING "btree" ("trade_id", "group_id", "created_at");



CREATE INDEX "idx_invites_created_by" ON "public"."invites" USING "btree" ("created_by");



CREATE INDEX "idx_notebook_user" ON "public"."notebook_entries" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_screenshots_trade" ON "public"."trade_screenshots" USING "btree" ("trade_id");



CREATE INDEX "idx_trades_shared" ON "public"."trades" USING "btree" ("is_shared") WHERE ("is_shared" = true);



CREATE INDEX "idx_trades_user_date" ON "public"."trades" USING "btree" ("user_id", "trade_date" DESC);



CREATE INDEX "idx_trades_user_number" ON "public"."trades" USING "btree" ("user_id", "trade_number" DESC);



CREATE UNIQUE INDEX "profiles_edge_id_key" ON "public"."profiles" USING "btree" ("edge_id");



CREATE INDEX "trades_account_idx" ON "public"."trades" USING "btree" ("account_id");



CREATE INDEX "trades_user_paper_status_idx" ON "public"."trades" USING "btree" ("user_id", "is_paper", "status");



CREATE UNIQUE INDEX "trading_accounts_one_active_per_user" ON "public"."trading_accounts" USING "btree" ("user_id") WHERE "is_active";



CREATE INDEX "trading_accounts_user_idx" ON "public"."trading_accounts" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "account_guardrails_set_updated_at" BEFORE UPDATE ON "public"."account_guardrails" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "cgroups_set_updated_at" BEFORE UPDATE ON "public"."community_groups" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ctc_set_updated_at" BEFORE UPDATE ON "public"."community_trade_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ctr_set_updated_at" BEFORE UPDATE ON "public"."community_trade_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "notebook_set_updated_at" BEFORE UPDATE ON "public"."notebook_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_sticky_notes_updated_at" BEFORE UPDATE ON "public"."sticky_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_trading_preferences" BEFORE UPDATE ON "public"."trading_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trading_accounts_set_updated_at" BEFORE UPDATE ON "public"."trading_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_trades_assign_number" BEFORE INSERT ON "public"."trades" FOR EACH ROW EXECUTE FUNCTION "public"."assign_trade_number"();



CREATE OR REPLACE TRIGGER "trg_trades_updated_at" BEFORE UPDATE ON "public"."trades" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."account_guardrails"
    ADD CONSTRAINT "account_guardrails_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_guardrails"
    ADD CONSTRAINT "account_guardrails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_group_invitations"
    ADD CONSTRAINT "community_group_invitations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_group_invitations"
    ADD CONSTRAINT "community_group_invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_group_invitations"
    ADD CONSTRAINT "community_group_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_group_members"
    ADD CONSTRAINT "community_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_group_members"
    ADD CONSTRAINT "community_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_groups"
    ADD CONSTRAINT "community_groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_notifications"
    ADD CONSTRAINT "community_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_comments"
    ADD CONSTRAINT "community_trade_comments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_comments"
    ADD CONSTRAINT "community_trade_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."community_trade_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_comments"
    ADD CONSTRAINT "community_trade_comments_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_comments"
    ADD CONSTRAINT "community_trade_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_reactions"
    ADD CONSTRAINT "community_trade_reactions_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "public"."community_trade_shares"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_reactions"
    ADD CONSTRAINT "community_trade_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_shares"
    ADD CONSTRAINT "community_trade_shares_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_shares"
    ADD CONSTRAINT "community_trade_shares_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_trade_shares"
    ADD CONSTRAINT "community_trade_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notebook_entries"
    ADD CONSTRAINT "notebook_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sticky_notes"
    ADD CONSTRAINT "sticky_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_screenshots"
    ADD CONSTRAINT "trade_screenshots_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trade_screenshots"
    ADD CONSTRAINT "trade_screenshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trading_accounts"
    ADD CONSTRAINT "trading_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trading_preferences"
    ADD CONSTRAINT "trading_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete their own trading preferences" ON "public"."trading_preferences" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own trading preferences" ON "public"."trading_preferences" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own trading preferences" ON "public"."trading_preferences" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own trading preferences" ON "public"."trading_preferences" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete own accounts" ON "public"."trading_accounts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete own guardrails" ON "public"."account_guardrails" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own accounts" ON "public"."trading_accounts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own guardrails" ON "public"."account_guardrails" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage their own notes" ON "public"."sticky_notes" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users select own accounts" ON "public"."trading_accounts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users select own guardrails" ON "public"."account_guardrails" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own accounts" ON "public"."trading_accounts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own guardrails" ON "public"."account_guardrails" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."account_guardrails" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cgi_select_party" ON "public"."community_group_invitations" FOR SELECT TO "authenticated" USING ((("inviter_id" = "auth"."uid"()) OR ("invitee_id" = "auth"."uid"())));



CREATE POLICY "cgi_update_invitee_or_inviter" ON "public"."community_group_invitations" FOR UPDATE TO "authenticated" USING ((("invitee_id" = "auth"."uid"()) OR ("inviter_id" = "auth"."uid"()))) WITH CHECK ((("invitee_id" = "auth"."uid"()) OR ("inviter_id" = "auth"."uid"())));



CREATE POLICY "cgm_delete_self_or_owner" ON "public"."community_group_members" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."community_groups" "g"
  WHERE (("g"."id" = "community_group_members"."group_id") AND ("g"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "cgm_select_self" ON "public"."community_group_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "cn_delete_own" ON "public"."community_notifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "cn_select_own" ON "public"."community_notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "cn_update_own" ON "public"."community_notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."community_group_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_trade_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_trade_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_trade_shares" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ctc_delete_own_or_group_owner" ON "public"."community_trade_comments" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."community_groups" "g"
  WHERE (("g"."id" = "community_trade_comments"."group_id") AND ("g"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "ctc_insert_group_member_self" ON "public"."community_trade_comments" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."community_group_members" "m"
  WHERE (("m"."group_id" = "community_trade_comments"."group_id") AND ("m"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."community_trade_shares" "s"
  WHERE (("s"."trade_id" = "community_trade_comments"."trade_id") AND ("s"."group_id" = "community_trade_comments"."group_id"))))));



CREATE POLICY "ctc_select_group_member" ON "public"."community_trade_comments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."community_group_members" "m"
  WHERE (("m"."group_id" = "community_trade_comments"."group_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "ctc_update_own" ON "public"."community_trade_comments" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "ctr_delete_own_or_group_owner" ON "public"."community_trade_reactions" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."community_groups" "g"
     JOIN "public"."community_trade_shares" "s" ON (("s"."group_id" = "g"."id")))
  WHERE (("s"."id" = "community_trade_reactions"."share_id") AND ("g"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "ctr_insert_group_member_self" ON "public"."community_trade_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."community_group_members" "m"
     JOIN "public"."community_trade_shares" "s" ON (("s"."group_id" = "m"."group_id")))
  WHERE (("s"."id" = "community_trade_reactions"."share_id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "ctr_select_group_member" ON "public"."community_trade_reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."community_group_members" "m"
     JOIN "public"."community_trade_shares" "s" ON (("s"."group_id" = "m"."group_id")))
  WHERE (("s"."id" = "community_trade_reactions"."share_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "ctr_update_own" ON "public"."community_trade_reactions" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."community_group_members" "m"
     JOIN "public"."community_trade_shares" "s" ON (("s"."group_id" = "m"."group_id")))
  WHERE (("s"."id" = "community_trade_reactions"."share_id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "groups_delete_owner" ON "public"."community_groups" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "groups_insert_self_owner" ON "public"."community_groups" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "groups_select_owner_or_member" ON "public"."community_groups" FOR SELECT TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."community_group_members" "m"
  WHERE (("m"."group_id" = "community_groups"."id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "groups_update_owner" ON "public"."community_groups" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites_delete_own" ON "public"."invites" FOR DELETE TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "invites_insert_own" ON "public"."invites" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "invites_select_own" ON "public"."invites" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "invites_update_own" ON "public"."invites" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "notebook_delete_own" ON "public"."notebook_entries" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notebook_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notebook_insert_own" ON "public"."notebook_entries" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "notebook_select_own" ON "public"."notebook_entries" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notebook_update_own" ON "public"."notebook_entries" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "screenshots_delete_own" ON "public"."trade_screenshots" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "screenshots_insert_own" ON "public"."trade_screenshots" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("split_part"("storage_path", '/'::"text", 1) = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."trades" "t"
  WHERE (("t"."id" = "trade_screenshots"."trade_id") AND ("t"."user_id" = "auth"."uid"()))))));



CREATE POLICY "screenshots_select_own" ON "public"."trade_screenshots" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "screenshots_update_own" ON "public"."trade_screenshots" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."sticky_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trade_screenshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trade_shares_delete" ON "public"."community_trade_shares" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "trade_shares_insert" ON "public"."community_trade_shares" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trades" "t"
  WHERE (("t"."id" = "community_trade_shares"."trade_id") AND ("t"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."community_group_members" "m"
  WHERE (("m"."group_id" = "community_trade_shares"."group_id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "trade_shares_select" ON "public"."community_trade_shares" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."community_group_members" "m"
  WHERE (("m"."group_id" = "community_trade_shares"."group_id") AND ("m"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."trades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trades_delete_own" ON "public"."trades" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "trades_insert_own" ON "public"."trades" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trades_select_own" ON "public"."trades" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "trades_update_own" ON "public"."trades" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."trading_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trading_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_select_self" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."assign_trade_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_trade_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_trade_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_edge_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_edge_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_edge_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."account_guardrails" TO "anon";
GRANT ALL ON TABLE "public"."account_guardrails" TO "authenticated";
GRANT ALL ON TABLE "public"."account_guardrails" TO "service_role";



GRANT ALL ON TABLE "public"."community_group_invitations" TO "anon";
GRANT ALL ON TABLE "public"."community_group_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."community_group_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."community_group_members" TO "anon";
GRANT ALL ON TABLE "public"."community_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."community_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."community_groups" TO "anon";
GRANT ALL ON TABLE "public"."community_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."community_groups" TO "service_role";



GRANT ALL ON TABLE "public"."community_notifications" TO "anon";
GRANT ALL ON TABLE "public"."community_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."community_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."community_trade_comments" TO "anon";
GRANT ALL ON TABLE "public"."community_trade_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."community_trade_comments" TO "service_role";



GRANT ALL ON TABLE "public"."community_trade_reactions" TO "anon";
GRANT ALL ON TABLE "public"."community_trade_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."community_trade_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."community_trade_shares" TO "anon";
GRANT ALL ON TABLE "public"."community_trade_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."community_trade_shares" TO "service_role";



GRANT ALL ON TABLE "public"."invites" TO "anon";
GRANT ALL ON TABLE "public"."invites" TO "authenticated";
GRANT ALL ON TABLE "public"."invites" TO "service_role";



GRANT ALL ON TABLE "public"."notebook_entries" TO "anon";
GRANT ALL ON TABLE "public"."notebook_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."notebook_entries" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."sticky_notes" TO "anon";
GRANT ALL ON TABLE "public"."sticky_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."sticky_notes" TO "service_role";



GRANT ALL ON TABLE "public"."trade_screenshots" TO "anon";
GRANT ALL ON TABLE "public"."trade_screenshots" TO "authenticated";
GRANT ALL ON TABLE "public"."trade_screenshots" TO "service_role";



GRANT ALL ON TABLE "public"."trades" TO "anon";
GRANT ALL ON TABLE "public"."trades" TO "authenticated";
GRANT ALL ON TABLE "public"."trades" TO "service_role";



GRANT ALL ON TABLE "public"."trading_accounts" TO "anon";
GRANT ALL ON TABLE "public"."trading_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."trading_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."trading_preferences" TO "anon";
GRANT ALL ON TABLE "public"."trading_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."trading_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































