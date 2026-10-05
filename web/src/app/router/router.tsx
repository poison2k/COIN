import {
  createBrowserHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import { AbgemeldetSeite } from '@/pages/abgemeldet'
import { StartSeite } from '@/pages/start'
import { ROUTEN } from '@/shared/config'
import { Fehler, NichtGefunden } from './Fehlerseiten'
import {
  CoinListeRoute,
  KeinZugriffRoute,
  NichtGefundenInShell,
  RueckrufRoute,
  ShellLayout,
} from './routen-komponenten'
import { erfordertAnmeldung, type SchutzKontext } from './schutz'

// Code-basierter Routenbaum (ADR-0010). Seiten bleiben frei von Router-Hooks; Anmelde- und Benutzerdaten
// kommen als Props aus app (anmeldung-keycloak, Abschnitt 5.5).

/** Router-Kontext: liefert den Anmeldezustand, sobald er feststeht (Anmeldung geprüft, /api/me geladen). */
export interface RouterKontext {
  schutz: () => Promise<SchutzKontext>
}

const OHNE_ANMELDUNG: RouterKontext = {
  schutz: async () => ({ anmeldung: { status: 'nichtKonfiguriert', anmelden: () => {} }, benutzer: null }),
}

const wurzel = createRootRouteWithContext<RouterKontext>()({
  component: Outlet,
  notFoundComponent: NichtGefundenInShell,
})

const rueckrufRoute = createRoute({
  getParentRoute: () => wurzel,
  path: ROUTEN.anmeldungRueckruf,
  component: RueckrufRoute,
})

const shellRoute = createRoute({ getParentRoute: () => wurzel, id: 'shell', component: ShellLayout })

const startRoute = createRoute({ getParentRoute: () => shellRoute, path: ROUTEN.start, component: StartSeite })
const coinListeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.coinListe,
  component: CoinListeRoute,
})
const abgemeldetRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.abgemeldet,
  component: AbgemeldetSeite,
})
const keinZugriffRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.keinZugriff,
  beforeLoad: async ({ context, location }) => {
    const schutz = await context.schutz()
    erfordertAnmeldung(schutz, location.href)
    // Benutzer mit Rolle (oder ohne geladene Daten) haben hier nichts zu sehen (AK-29).
    if (schutz.benutzer?.rolle !== 'keine') throw redirect({ to: ROUTEN.start, replace: true })
  },
  component: KeinZugriffRoute,
})

const routenBaum = wurzel.addChildren([
  rueckrufRoute,
  shellRoute.addChildren([startRoute, coinListeRoute, abgemeldetRoute, keinZugriffRoute]),
])

/** Erzeugt den Router; Tests übergeben eine Memory-History. Den Anmeldezustand setzt App über den Kontext. */
export function erstelleRouter(history: RouterHistory = createBrowserHistory()) {
  return createRouter({
    routeTree: routenBaum,
    history,
    context: OHNE_ANMELDUNG,
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
