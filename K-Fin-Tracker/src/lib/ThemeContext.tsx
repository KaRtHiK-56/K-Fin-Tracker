import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Theme } from '../types'

interface ThemeCtx { theme: Theme; toggle: () => void; isDark: boolean }

const ThemeContext = createContext<ThemeCtx>({ theme: 'dark', toggle: () => {}, isDark: true })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('kfin-theme') as Theme | null
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('kfin-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  return (
    <ThemeContext.Provider value={{ theme, toggle, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
