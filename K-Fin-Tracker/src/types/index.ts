export type Theme = 'light' | 'dark'
export type NavSection = 'dashboard' | 'stocks' | 'mf' | 'gold' | 'bonds' | 'expenses' | 'income' | 'sip' | 'tax'
export type SortField = 'symbol' | 'current_value' | 'pnl' | 'pnl_pct' | 'quantity'
export type SortDir = 'asc' | 'desc'

export interface StockHolding {
  id: string
  user_id: string
  symbol: string
  exchange: 'NSE' | 'BSE'
  company_name: string
  quantity: number
  avg_buy_price: number
  buy_date: string
  sector?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface LiveQuote {
  symbol: string
  company_name: string
  exchange: string
  ltp: number
  open: number
  high: number
  low: number
  prev_close: number
  change: number
  change_pct: number
  volume: number
  market_cap?: number
  pe_ratio?: number
  week_52_high?: number
  week_52_low?: number
  last_updated: string
}

export interface StockWithQuote extends StockHolding {
  quote?: LiveQuote
  current_value: number
  invested_value: number
  pnl: number
  pnl_pct: number
}

export interface HealthScore {
  overall: number
  risk_level: 'Low' | 'Moderate' | 'High' | 'Very High'
  top_holding_pct: number
  sector_count: number
}

export interface HistPoint {
  date: string
  close: number
}
