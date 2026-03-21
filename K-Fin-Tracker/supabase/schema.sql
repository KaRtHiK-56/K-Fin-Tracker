-- K-Fin Tracker — Supabase Schema
-- Run in: Supabase dashboard → SQL Editor → Run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Stock holdings
CREATE TABLE IF NOT EXISTS public.stock_holdings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  exchange        TEXT NOT NULL DEFAULT 'NSE' CHECK (exchange IN ('NSE','BSE')),
  company_name    TEXT NOT NULL,
  quantity        NUMERIC(12,4) NOT NULL CHECK (quantity > 0),
  avg_buy_price   NUMERIC(12,2) NOT NULL CHECK (avg_buy_price > 0),
  buy_date        DATE,
  sector          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Stock transactions
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol           TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('BUY','SELL')),
  quantity         NUMERIC(12,4) NOT NULL,
  price            NUMERIC(12,2) NOT NULL,
  total_amount     NUMERIC(16,2) NOT NULL,
  brokerage        NUMERIC(10,2) DEFAULT 0,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Mutual funds
CREATE TABLE IF NOT EXISTS public.mutual_funds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheme_name     TEXT NOT NULL,
  amfi_code       TEXT,
  fund_house      TEXT,
  category        TEXT,
  invested_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  units           NUMERIC(14,4) DEFAULT 0,
  avg_nav         NUMERIC(10,4) DEFAULT 0,
  current_nav     NUMERIC(10,4),
  sip_amount      NUMERIC(10,2),
  sip_date        INT CHECK (sip_date BETWEEN 1 AND 31),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Gold holdings
CREATE TABLE IF NOT EXISTS public.gold_holdings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('Physical','SGB','Digital','ETF')),
  purity        TEXT NOT NULL DEFAULT '24K' CHECK (purity IN ('24K','22K','18K')),
  weight_grams  NUMERIC(10,3) NOT NULL CHECK (weight_grams > 0),
  avg_buy_price NUMERIC(10,2) NOT NULL,
  buy_date      DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Fixed / Recurring Deposits
CREATE TABLE IF NOT EXISTS public.fixed_deposits (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('FD','RD')),
  bank_name            TEXT NOT NULL,
  principal            NUMERIC(14,2) NOT NULL,
  interest_rate        NUMERIC(5,2) NOT NULL,
  start_date           DATE NOT NULL,
  maturity_date        DATE NOT NULL,
  monthly_installment  NUMERIC(10,2),
  compounding          TEXT DEFAULT 'Quarterly',
  is_auto_renew        BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description  TEXT,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode TEXT DEFAULT 'UPI',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Income
CREATE TABLE IF NOT EXISTS public.income (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  type         TEXT NOT NULL,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_holdings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutual_funds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_holdings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_deposits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE income            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile"      ON profiles          FOR ALL USING (auth.uid() = id);
CREATE POLICY "own_stocks"       ON stock_holdings    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_txns"         ON stock_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_mf"           ON mutual_funds      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_gold"         ON gold_holdings     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_fd"           ON fixed_deposits    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_expenses"     ON expenses          FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_income"       ON income            FOR ALL USING (auth.uid() = user_id);
