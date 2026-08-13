-- Enums
CREATE TYPE public.app_role AS ENUM ('admin','member');
CREATE TYPE public.market_type AS ENUM ('forex','crypto','stocks','indices','futures','commodities','other');
CREATE TYPE public.trade_direction AS ENUM ('long','short');
CREATE TYPE public.trade_result AS ENUM ('win','loss','breakeven');
CREATE TYPE public.trade_grade AS ENUM ('A+','A','B+','B','C','D');
CREATE TYPE public.trading_session AS ENUM ('asia','london','new_york','overlap','custom');
CREATE TYPE public.screenshot_kind AS ENUM ('before','after');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;