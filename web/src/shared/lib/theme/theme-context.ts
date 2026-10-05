import { createContext } from 'react'

export type Theme = 'dark' | 'light' | 'system'

export const THEMES: readonly Theme[] = ['light', 'dark', 'system']

export interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeProviderContext = createContext<ThemeProviderState | null>(null)
