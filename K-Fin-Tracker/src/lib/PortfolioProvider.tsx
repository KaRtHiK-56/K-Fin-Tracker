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

  const setHoldings = (h: StockHolding[] | ((prev: StockHolding[]) => StockHolding[])) => {
    setHoldingsState(prev => {
      const next = typeof h === 'function' ? h(prev) : h
      saveHoldingsToStorage(next)
      return next
    })
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
