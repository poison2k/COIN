import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router'
import { CoinListeSeite } from '@/pages/coin-liste'
import { StartSeite } from '@/pages/start'
import { ROUTEN } from '@/shared/config'
import { AppShell } from '@/widgets/app-shell'
import { Fehler, NichtGefunden } from './Fehlerseiten'

// Code-basierter Routenbaum (ADR-0010). Seiten bleiben frei von Router-Hooks.

const wurzel = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})

const startRoute = createRoute({ getParentRoute: () => wurzel, path: ROUTEN.start, component: StartSeite })
const coinListeRoute = createRoute({
  getParentRoute: () => wurzel,
  path: ROUTEN.coinListe,
  component: CoinListeSeite,
})

const routenBaum = wurzel.addChildren([startRoute, coinListeRoute])

/** Erzeugt den Router; Tests übergeben eine Memory-History. */
export function erstelleRouter(history: RouterHistory = createBrowserHistory()) {
  return createRouter({
    routeTree: routenBaum,
    history,
    defaultNotFoundComponent: NichtGefunden,
    defaultErrorComponent: Fehler,
  })
}

export type AppRouter = ReturnType<typeof erstelleRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
