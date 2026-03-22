// ─── Portfolio Provider — wraps app, shares holdings + snapshot ───────────────
import { useState, useEffect } from 'react'
import {
  PortfolioContext, loadHoldingsFromStorage,
  saveHoldingsToStorage, loadSnapshotFromStorage,
  saveSnapshotToStorage,
  type PortfolioSnapshot,
} from './portfolioStore'
import type { StockHolding } from '../types'

export default function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [holdings, setHoldingsState] = useState<StockHolding[]>(() => loadHoldingsFromStorage())
  const [snapshot, setSnapshotState] = useState<PortfolioSnapshot | null>(() => loadSnapshotFromStorage())

  const setHoldings = (h: StockHolding[]) => {
    setHoldingsState(h)
    saveHoldingsToStorage(h)
  }

  const setSnapshot = (s: PortfolioSnapshot) => {
    setSnapshotState(s)
    saveSnapshotToStorage(s)
  }

  return (
    <PortfolioContext.Provider value={{ holdings, snapshot, setHoldings, setSnapshot }}>
      {children}
    </PortfolioContext.Provider>
  )
}
