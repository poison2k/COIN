import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, offeneAntwort, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import {
  aktiverKopf,
  infotextBlock,
  kennzahlenBlock,
  kopfBlock,
  neuesteBlock,
  STANDARD_INFOTEXT,
  testKopf,
  testLogo,
  testStartseite,
} from '../../../../test/startseite'
import { StartSeite } from './StartSeite'

// AK-13: Startseite mit Begrüßung, kurzem Einleitungstext und Link zum Katalog (katalog-seiten, AK-25).
// Der Link braucht einen Router-Kontext; ein minimaler Test-Router genügt (ohne App-Shell und Theme).
// Feature startseite (9.7): Ohne coins.read ruft die Seite GET /api/startseite/kopf auf; der Test-Router bekommt deshalb
// einen fetch-Mock (Fake-API, Kopf standardmäßig inaktiv). Der Test „ruft keine API auf“ ist ersetzt durch „ruft ohne
// Recht nur GET /api/startseite/kopf auf“. Die übrigen Fälle (h1, Absatz, „Zum Katalog“) gelten für den inaktiven Kopf.

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([], { me: null })
  vi.stubGlobal('fetch', api.fetch)
})

function zeigeStartSeite(darfAnsehen?: boolean) {
  const wurzel = createRootRoute({ component: Outlet })
  const start = createRoute({
    getParentRoute: () => wurzel,
    path: '/',
    component: darfAnsehen === undefined ? StartSeite : () => <StartSeite darfAnsehen={darfAnsehen} />,
  })
  const coins = createRoute({ getParentRoute: () => wurzel, path: '/coins', component: () => <p>Liste</p> })
  const detail = createRoute({ getParentRoute: () => wurzel, path: '/coins/$coinId', component: () => <p>Detail</p> })
  const router = createRouter({
    routeTree: wurzel.addChildren([start, coins, detail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
}

/** Pfade aller Startseiten-Aufrufe. */
function startseitenAufrufe(): string[] {
  return api.anfragen.filter((a) => a.pfad.startsWith('/api/startseite')).map((a) => `${a.methode} ${a.pfad}`)
}

describe('StartSeite', () => {
  it('zeigt die Überschrift „Willkommen bei C.O.I.N.“ als Ebene 1', async () => {
    zeigeStartSeite()

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeigeStartSeite()
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt einen Einleitungstext unter der Überschrift', async () => {
    zeigeStartSeite()
    const ueberschrift = await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    const absatz = ueberschrift.parentElement?.querySelector('p')
    expect(absatz?.textContent?.trim().length ?? 0).toBeGreaterThan(0)
  })

  // katalog-seiten, AK-25 (Entscheidung F4): bisher „Zur Coin-Liste“.
  it('zeigt den Link „Zum Katalog“ mit Ziel /coins', async () => {
    zeigeStartSeite()

    expect(await screen.findByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  // startseite (9.7): ersetzt „ruft keine API auf“.
  it('ruft ohne Recht nur GET /api/startseite/kopf auf', async () => {
    zeigeStartSeite()
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    await waitFor(() => expect(startseitenAufrufe()).toEqual(['GET /api/startseite/kopf']))
    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual(['GET /api/startseite/kopf'])
  })
})

// ---------- AK-22: ohne coins.read (anonym, ohne Rolle, deaktiviert) ----------

describe('StartSeite ohne coins.read (AK-22)', () => {
  it('ruft GET /api/startseite nie auf, auch nicht mit aktivem Kopf', async () => {
    api = erstelleFakeApi([], { me: ME.betrachter, startseite: { kopf: aktiverKopf() } })
    vi.stubGlobal('fetch', api.fetch)
    zeigeStartSeite(false)

    await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })
    expect(startseitenAufrufe()).toEqual(['GET /api/startseite/kopf'])
  })

  it('zeigt bei aktivem Kopf dessen Titel als einziges h1', async () => {
    api.startseite.kopf = aktiverKopf()
    zeigeStartSeite()

    expect(await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Willkommen bei C.O.I.N.' })).not.toBeInTheDocument()
  })

  it('zeigt bei aktivem Kopf den Untertitel', async () => {
    api.startseite.kopf = aktiverKopf()
    zeigeStartSeite()

    expect(await screen.findByText('Untertitel des Testverbands')).toBeInTheDocument()
  })

  it('zeigt bei aktivem Kopf die Logos per img mit Alternativtext und öffentlicher URL', async () => {
    api.startseite.kopf = aktiverKopf({ logoSoftware: testLogo('software') })
    zeigeStartSeite()

    expect(await screen.findByRole('img', { name: 'Wappen des Testverbands' })).toHaveAttribute(
      'src',
      '/api/startseite/logos/bereitsteller?v=0123456789abcdef',
    )
    expect(screen.getByRole('img', { name: 'Logo der Testsoftware' })).toBeInTheDocument()
  })

  it('zeigt bei aktivem Kopf den bisherigen Einleitungsabsatz nicht', async () => {
    api.startseite.kopf = aktiverKopf()
    zeigeStartSeite()

    await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })
    expect(screen.queryByText(STANDARD_INFOTEXT)).not.toBeInTheDocument()
  })

  it('zeigt bei aktivem Kopf den Link „Zum Katalog“', async () => {
    api.startseite.kopf = aktiverKopf()
    zeigeStartSeite()

    await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })
    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('zeigt bei ausgeschaltetem Kopf die statische Begrüßung mit Absatz', async () => {
    api.startseite.kopf = testKopf({ aktiv: false, position: 3 })
    zeigeStartSeite()

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
    expect(screen.getByText(STANDARD_INFOTEXT)).toBeInTheDocument()
  })

  it('zeigt bei einem Fehler die statische Begrüßung ohne Fehlermeldung', async () => {
    api.einmal('GET', /^\/api\/startseite\/kopf$/, problemAntwort(500))
    zeigeStartSeite()

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toBeInTheDocument()
  })

  it('zeigt bei einem Netzwerkfehler die statische Begrüßung', async () => {
    api.netzwerkfehler('GET', /^\/api\/startseite\/kopf$/)
    zeigeStartSeite()

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('zeigt während des Ladens kein h1, aber role="status" „Startseite wird geladen …“', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/startseite\/kopf$/, () => offen.promise)
    zeigeStartSeite()

    expect(await screen.findByRole('status')).toHaveTextContent('Startseite wird geladen …')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    offen.aufloesen(
      new Response(JSON.stringify(testKopf()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
  })

  it('zeigt einen Titel mit XSS-Nutzlast als reinen Text', async () => {
    const nutzlast = '<img src=x onerror="window.__xss=2"><script>window.__xss=1</script>'
    api.startseite.kopf = aktiverKopf({ titel: nutzlast, logoBereitsteller: null })
    zeigeStartSeite()

    expect(await screen.findByRole('heading', { level: 1, name: nutzlast })).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect((window as unknown as { __xss?: unknown }).__xss).toBeUndefined()
  })

  it('zeigt weder Infotext noch Kennzahlen noch Coin-Listen', async () => {
    api.startseite.kopf = aktiverKopf()
    zeigeStartSeite()

    await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })
    expect(screen.queryByRole('region', { name: 'Kennzahlen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Information' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Neueste Coins' })).not.toBeInTheDocument()
  })

  it('verhält sich ohne Props wie darfAnsehen={false}', async () => {
    api.startseite.kopf = aktiverKopf()
    zeigeStartSeite()

    await screen.findByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })
    expect(startseitenAufrufe()).toEqual(['GET /api/startseite/kopf'])
  })
})

// ---------- AK-20, AK-21: mit coins.read ----------

describe('StartSeite mit coins.read (AK-20, AK-21)', () => {
  beforeEach(() => {
    api = erstelleFakeApi([], { me: ME.betrachter })
    vi.stubGlobal('fetch', api.fetch)
  })

  it('lädt nur GET /api/startseite und nicht zusätzlich den Kopf', async () => {
    zeigeStartSeite(true)

    await screen.findByRole('region', { name: 'Kennzahlen' })
    expect(startseitenAufrufe()).toEqual(['GET /api/startseite'])
  })

  it('zeigt ohne aktiven Kopf h1 „Willkommen bei C.O.I.N.“ und die Blöcke', async () => {
    zeigeStartSeite(true)

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Kennzahlen' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt bei aktivem Kopf dessen Titel als einziges h1', async () => {
    api.startseite.ansicht = testStartseite([kopfBlock({ titel: 'Titel mit Rolle' }), kennzahlenBlock()])
    zeigeStartSeite(true)

    expect(await screen.findByRole('heading', { level: 1, name: 'Titel mit Rolle' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt die Blöcke in der Reihenfolge der API', async () => {
    api.startseite.ansicht = testStartseite([neuesteBlock(), infotextBlock(), kennzahlenBlock()])
    zeigeStartSeite(true)

    await screen.findByRole('region', { name: 'Kennzahlen' })
    const regionen = screen
      .getAllByRole('region')
      .map((r) => r.getAttribute('aria-label') ?? within(r).getAllByRole('heading')[0].textContent)
    expect(regionen).toEqual(['Neueste Coins', 'Information', 'Kennzahlen'])
  })

  it('zeigt während des Ladens kein h1, aber role="status" „Startseite wird geladen …“', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/startseite$/, () => offen.promise)
    zeigeStartSeite(true)

    expect(await screen.findByRole('status')).toHaveTextContent('Startseite wird geladen …')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    offen.aufloesen(
      new Response(JSON.stringify(testStartseite()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
  })

  it('zeigt bei einem Fehler h1 „Willkommen bei C.O.I.N.“ und die Fehlermeldung als alert', async () => {
    api.einmal('GET', /^\/api\/startseite$/, problemAntwort(500))
    zeigeStartSeite(true)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Startseite konnte nicht geladen werden. Bitte später erneut versuchen.',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
  })

  it('zeigt bei einem Fehler den Link „Zum Katalog“', async () => {
    api.einmal('GET', /^\/api\/startseite$/, problemAntwort(500))
    zeigeStartSeite(true)

    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('zeigt nach dem Laden den Link „Zum Katalog“', async () => {
    zeigeStartSeite(true)

    await screen.findByRole('region', { name: 'Kennzahlen' })
    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('zeigt einen Infotext mit <script> und onerror wirkungslos', async () => {
    api.startseite.ansicht = testStartseite([
      infotextBlock('<script>window.__xss=1</script>\n\n<img src=x onerror="window.__xss=2">\n\nSichtbarer Text'),
    ])
    zeigeStartSeite(true)

    const region = await screen.findByRole('region', { name: 'Information' })
    expect(within(region).getByText('Sichtbarer Text')).toBeInTheDocument()
    expect(region.querySelector('script, img')).toBeNull()
    expect((window as unknown as { __xss?: unknown }).__xss).toBeUndefined()
  })
})
