import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { THEMES, ThemeProviderContext, type Theme } from './theme-context'

// Nach shadcn/ui-Doku „Dark mode – Vite“, angepasst: deutsche Texte, Prüfung des gespeicherten Werts,
// localStorage wird nur bei einer Auswahl geschrieben (AK-16).

const DUNKEL_QUERY = '(prefers-color-scheme: dark)'

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

function istTheme(wert: unknown): wert is Theme {
  return typeof wert === 'string' && (THEMES as readonly string[]).includes(wert)
}

function leseGespeichertesTheme(storageKey: string): Theme | null {
  try {
    const wert = window.localStorage.getItem(storageKey)
    return istTheme(wert) ? wert : null
  } catch {
    // localStorage nicht verfügbar (z. B. gesperrt): Standard verwenden.
    return null
  }
}

function speichereTheme(storageKey: string, theme: Theme): void {
  try {
    window.localStorage.setItem(storageKey, theme)
  } catch {
    // Auswahl gilt dann nur bis zum Neuladen.
  }
}

export function ThemeProvider({ children, defaultTheme = 'system', storageKey = 'coin-theme' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => leseGespeichertesTheme(storageKey) ?? defaultTheme)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia(DUNKEL_QUERY).matches ? 'dark' : 'light'
      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme: (neu: Theme) => {
        speichereTheme(storageKey, neu)
        setThemeState(neu)
      },
    }),
    [theme, storageKey],
  )

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}
