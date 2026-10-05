import { useContext } from 'react'
import { ThemeProviderContext, type ThemeProviderState } from './theme-context'

export function useTheme(): ThemeProviderState {
  const context = useContext(ThemeProviderContext)
  if (context === null) {
    throw new Error('useTheme muss innerhalb von ThemeProvider verwendet werden.')
  }
  return context
}
