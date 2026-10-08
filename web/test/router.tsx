import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

// Testhilfe (katalog-seiten): Seiten und Komponenten mit Router-Links ohne App rendern. Ein minimaler Router mit der
// getesteten Komponente unter `pfad` und Platzhalter-Zielen für die übrigen Pfade, die den erreichten Pfad anzeigen.

// coin-ausgaben: Ziel des Links „Ausgabe erfassen“ (AK-23).
const ZIELE = ['/', '/coins', '/coins/neu', '/coins/$coinId', '/coins/$coinId/ausgaben/neu', '/kein-zugriff'] as const

export interface MitRouterOptionen {
  /** Routen-Pfad der getesteten Komponente (Standard /test). */
  pfad?: string
  /** Start-URL (Standard: `pfad`). */
  start?: string
}

/** Rendert `inhalt` als Routen-Komponente in einem Memory-Router und liefert den Router mit. */
export function zeigeMitRouter(inhalt: () => ReactNode, { pfad = '/test', start = pfad }: MitRouterOptionen = {}) {
  // Innerhalb der Funktion definiert, damit die Datei nur Nicht-Komponenten exportiert (react-refresh).
  /** Platzhalter für Link-Ziele: zeigt „Ziel: {pfad}“. */
  function Ziel() {
    const pfad = useLocation({ select: (ort) => ort.pathname })
    return <p>{`Ziel: ${pfad}`}</p>
  }
  const wurzel = createRootRoute({ component: Outlet })
  const seite = createRoute({ getParentRoute: () => wurzel, path: pfad, component: inhalt })
  const ziele = ZIELE.filter((ziel) => ziel !== pfad).map((ziel) =>
    createRoute({ getParentRoute: () => wurzel, path: ziel, component: Ziel }),
  )
  const router = createRouter({
    routeTree: wurzel.addChildren([seite, ...ziele]),
    history: createMemoryHistory({ initialEntries: [start] }),
  })
  const ansicht = render(<RouterProvider router={router} />)
  return { router, ...ansicht }
}
