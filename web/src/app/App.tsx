import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { ThemeProvider } from '@/shared/lib/theme'
import { erstelleRouter, type AppRouter } from './router/router'

export interface AppProps {
  /** Optionaler Router, z. B. mit Memory-History in Tests. */
  router?: AppRouter
}

export default function App({ router }: AppProps) {
  // Der Router wird einmalig erzeugt (Browser-History), sofern keiner übergeben wurde.
  const [aktiverRouter] = useState(() => router ?? erstelleRouter())

  return (
    <ThemeProvider defaultTheme="system" storageKey="coin-theme">
      <RouterProvider router={aktiverRouter} />
    </ThemeProvider>
  )
}
