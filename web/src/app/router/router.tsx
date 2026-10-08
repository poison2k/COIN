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
  AusgabeErfassenRoute,
  BenutzerverwaltungRoute,
  CoinAnlegenRoute,
  CoinDetailRoute,
  CoinListeRoute,
  KeinZugriffRoute,
  NichtGefundenInShell,
  RueckrufRoute,
  ShellLayout,
} from './routen-komponenten'
import { erfordertAnmeldung, erfordertBerechtigung, type SchutzKontext } from './schutz'
import { coinDetailSuche, katalogSuche, keinZugriffSuche } from './suchparameter'

// Code-basierter Routenbaum (ADR-0010). Seiten bleiben frei von Router-Hooks; Anmelde- und Benutzerdaten
// kommen als Props aus app (anmeldung-keycloak, Abschnitt 5.5).

/** Router-Kontext: liefert den Anmeldezustand, sobald er feststeht (Anmeldung geprüft, /api/me geladen). */
export interface RouterKontext {
  schutz: () => Promise<SchutzKontext>
}

const OHNE_ANMELDUNG: RouterKontext = {
  schutz: async () => ({
    anmeldung: { status: 'nichtKonfiguriert', anmelden: () => {} },
    benutzer: null,
    deaktiviert: false,
  }),
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
  validateSearch: katalogSuche,
  component: CoinListeRoute,
})
// Geschwister von /coins (das keinen <Outlet> hat). Statische Segmente gehen vor Parametern: /coins/neu ist nie eine
// Detailseite (katalog-seiten, AK-7).
const coinNeuRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.coinNeu,
  beforeLoad: async ({ context, location }) => {
    erfordertBerechtigung('coins.write')(await context.schutz(), location.href)
  },
  component: CoinAnlegenRoute,
})
const coinDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.coinDetail,
  validateSearch: coinDetailSuche,
  component: CoinDetailRoute,
})
// Geschwister der Detailseite (die keinen <Outlet> hat), nur mit issues.write (coin-ausgaben, AK-26).
const coinAusgabeNeuRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.coinAusgabeNeu,
  beforeLoad: async ({ context, location }) => {
    erfordertBerechtigung('issues.write')(await context.schutz(), location.href)
  },
  component: AusgabeErfassenRoute,
})
const abgemeldetRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.abgemeldet,
  component: AbgemeldetSeite,
})
const keinZugriffRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.keinZugriff,
  validateSearch: keinZugriffSuche,
  beforeLoad: async ({ context, location, search }) => {
    const schutz = await context.schutz()
    erfordertAnmeldung(schutz, location.href)
    // Ohne Rolle (AK-29), deaktiviert (AK-32) oder mit Rolle nach einer Weiterleitung wegen fehlender Berechtigung
    // (katalog-seiten, AK-10); alle anderen haben hier nichts zu sehen.
    const ohneZugriff = schutz.deaktiviert || schutz.benutzer?.rolle === 'keine'
    if (!ohneZugriff && search.grund !== 'berechtigung') throw redirect({ to: ROUTEN.start, replace: true })
  },
  component: KeinZugriffRoute,
})
const benutzerverwaltungRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: ROUTEN.benutzerverwaltung,
  beforeLoad: async ({ context, location }) => {
    erfordertBerechtigung('users.manage')(await context.schutz(), location.href)
  },
  component: BenutzerverwaltungRoute,
})

const routenBaum = wurzel.addChildren([
  rueckrufRoute,
  shellRoute.addChildren([
    startRoute,
    coinListeRoute,
    coinNeuRoute,
    coinDetailRoute,
    coinAusgabeNeuRoute,
    abgemeldetRoute,
    keinZugriffRoute,
    benutzerverwaltungRoute,
  ]),
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
  interface HistoryState {
    /** Meldung für die Detailseite direkt nach dem Anlegen (katalog-seiten, AK-22/AK-23); wird einmal verbraucht. */
    coinAngelegt?: 'mitBild' | 'ohneBild'
    /** Meldung nach dem Erfassen einer Ausgabe, nur mit der Nummer (coin-ausgaben, AK-28); wird einmal verbraucht. */
    ausgabeErfasst?: { nummer: number }
  }
}
