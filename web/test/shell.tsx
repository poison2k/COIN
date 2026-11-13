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
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { Benutzer } from '@/entities/benutzer'
import { AnmeldungProvider } from '@/shared/lib/anmeldung'
import { ThemeProvider } from '@/shared/lib/theme'
import { AppShell, type BenutzerZustand } from '@/widgets/app-shell'
import { erstelleTestAnmeldung, ME } from './anmeldung'

// Testhilfe (design-fundament, Abschnitt 6): rendert die App-Shell ohne App und ohne Anmeldung in einem Memory-Router.
// Die Seiten der Shell sind Platzhalter mit einem h1 „Seite {pfad}“; alle Daten sind synthetisch. Die Anmeldung (für
// „Anmelden“/„Abmelden“) passt zum Zustand: „nichtKonfiguriert“ ohne UserManager, „anonym“ ohne Sitzung, sonst angemeldet.

/** Pfade der Seitenleiste und weitere Shell-Seiten (Abschnitt 6.2). */
const PFADE = [
  '/',
  '/coins',
  '/coins/neu',
  '/coins/$coinId',
  '/pruefung',
  '/benutzerverwaltung',
  '/verwaltung/startseite',
  '/kein-zugriff',
] as const

/** Anmeldezustand „angemeldet“ mit einem Testbenutzer aus `ME` (Standard: Administrator). */
export function angemeldet(benutzer: Benutzer = ME.admin): BenutzerZustand {
  return { art: 'angemeldet', benutzer }
}

export interface ShellOptionen {
  /** Start-URL (Standard /). */
  start?: string
  /** Zusätzlicher Seiteninhalt unter dem Platzhalter-h1 (z. B. ein Eingabefeld). */
  inhalt?: ReactNode
}

/** Rendert die App-Shell mit dem Anmeldezustand und liefert Router und userEvent mit. */
export function zeigeShell(zustand: BenutzerZustand, { start = '/', inhalt }: ShellOptionen = {}) {
  // Innerhalb der Funktion definiert, damit die Datei nur Nicht-Komponenten exportiert (react-refresh).
  function Platzhalter() {
    const pfad = useLocation({ select: (ort) => ort.pathname })
    return (
      <>
        <h1>{`Seite ${pfad}`}</h1>
        {inhalt}
      </>
    )
  }
  const userManager =
    zustand.art === 'nichtKonfiguriert'
      ? null
      : erstelleTestAnmeldung(zustand.art === 'anonym' ? 'anonym' : 'angemeldet').userManager
  function Layout() {
    return (
      <ThemeProvider defaultTheme="light" storageKey="coin-theme">
        <AnmeldungProvider userManager={userManager}>
          <AppShell benutzerZustand={zustand}>
            <Outlet />
          </AppShell>
        </AnmeldungProvider>
      </ThemeProvider>
    )
  }
  const wurzel = createRootRoute({ component: Layout })
  const seiten = PFADE.map((pfad) => createRoute({ getParentRoute: () => wurzel, path: pfad, component: Platzhalter }))
  const router = createRouter({
    routeTree: wurzel.addChildren(seiten),
    history: createMemoryHistory({ initialEntries: [start] }),
  })
  const user = userEvent.setup()
  const ansicht = render(<RouterProvider router={router} />)
  return { router, user, ...ansicht }
}
