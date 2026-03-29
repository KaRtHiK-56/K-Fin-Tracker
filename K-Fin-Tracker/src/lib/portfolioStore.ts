// ─── Global Portfolio Store ───────────────────────────────────────────────────
// Persists to localStorage so data survives page refresh.
// Shared across StockTracker + Dashboard via React Context.

import { createContext, useContext } from 'react'
import type { StockHolding } from '../types'

export interface PortfolioSnapshot {
  totalInvested:  number
  currentValue:   number
  totalPnL:       number
  totalPnLPct:    number
  dayPnL:         number
  dayPnLPct:      number
  lastUpdated:    string   // ISO timestamp
}

export interface PortfolioState {
  holdings:    StockHolding[]
  snapshot:    PortfolioSnapshot | null
  setHoldings: (h: StockHolding[] | ((prev: StockHolding[]) => StockHolding[])) => void
  setSnapshot: (s: PortfolioSnapshot) => void
}

export const PortfolioContext = createContext<PortfolioState>({
  holdings:    [],
  snapshot:    null,
  setHoldings: (_h) => {},
  setSnapshot: () => {},
})

export function usePortfolio() {
  return useContext(PortfolioContext)
}

// localStorage keys
const HOLDINGS_KEY = 'kfin_holdings'
const SNAPSHOT_KEY = 'kfin_snapshot'

// portfolioStore.ts
export function loadHoldingsFromStorage(): StockHolding[] {
  try {
    const raw = localStorage.getItem(HOLDINGS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }  // ← This catches parse errors, BUT...
}

export function saveHoldingsToStorage(h: StockHolding[]) {
  try { localStorage.setItem(HOLDINGS_KEY, JSON.stringify(h)) } catch {}
}

export function loadSnapshotFromStorage(): PortfolioSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveSnapshotToStorage(s: PortfolioSnapshot) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s)) } catch {}
}
