import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTHORIZATION_ENDPOINT,
  END_SESSION_ENDPOINT,
  ME,
  erstelleTestAnmeldung,
  setzeBrowserUrl,
  testUser,
  type SitzungsZustand,
  type TestAnmeldung,
  type TestBenutzer,
} from '../../test/anmeldung'
import { erstelleFakeApi, offeneAntwort, problemAntwort, type FakeApi } from '../../test/fakeApi'
import { formularFelder, fuelleAus, meldungMit } from '../../test/hilfen'
import App from './App'
import { erstelleRouter, type AppRouter } from './router/router'

// Feature anmeldung-keycloak, AK-23 bis AK-34: Anmeldung im Zusammenspiel von App, Router, Kopfzeile und Seiten.
// Erweitert durch rollen-benutzerverwaltung Rev. 3, AK-41 bis AK-45 (Abschnitt am Dateiende).
// Echter UserManager (In-Memory-Speicher), Weiterleitungen werden nur aufgezeichnet (test/anmeldung.tsx).

// Feature katalog-seiten (AK-12, AK-13): Der Abschnitt „Neuen Coin erfassen“ mit Anmeldehinweis bzw. Hinweis
// „Coins erfassen können nur …“ entfällt; /coins zeigt nur mit coins.write den Link „Coin hinzufügen“, das Formular
// liegt auf /coins/neu.
const TEXTE = {
  leereListe: 'Noch keine Coins erfasst.',
  entfallenAnmelden: 'Zum Erfassen von Coins melden Sie sich bitte an.',
  entfallenKeineBerechtigung: 'Coins erfassen können nur Administratoren und Sachbearbeiter.',
  nichtKonfiguriert: 'Anmeldung ist nicht konfiguriert.',
  rueckrufLaeuft: 'Anmeldung wird abgeschlossen …',
  pruefungFehlgeschlagen: 'Ihre Anmeldung konnte nicht geprüft werden.',
  keinZugriffText:
    'Sie sind als Test Neu angemeldet, Ihrem Konto ist aber noch keine Rolle zugewiesen. Den Coin-Katalog können Sie weiterhin ansehen. Für weitere Funktionen wenden Sie sich bitte an einen Administrator.',
} as const

let api: FakeApi

interface Optionen {
  /** Benutzer laut /api/me; bei zustand 'anonym' ohne Bedeutung. */
  als?: TestBenutzer
  zustand?: SitzungsZustand
  /** null = Anmeldung nicht konfiguriert. */
  ohneKonfiguration?: boolean
  vorbereiten?: (anmeldung: TestAnmeldung) => void
  /** Wird vor dem Rendern mit dem Router aufgerufen (z. B. um Guards zu zählen, Rev. 3 AK-45). */
  routerVorbereiten?: (router: AppRouter) => void
}

function zeigeApp(
  pfad: string,
  { als = 'admin', zustand = 'angemeldet', ohneKonfiguration = false, vorbereiten, routerVorbereiten }: Optionen = {},
) {
  api = erstelleFakeApi([], { me: zustand === 'anonym' ? null : ME[als] })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung = erstelleTestAnmeldung(zustand, ME[als].name)
  vorbereiten?.(anmeldung)
  const user = userEvent.setup()
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  routerVorbereiten?.(router)
  const ergebnis = render(<App router={router} userManager={ohneKonfiguration ? null : anmeldung.userManager} />)
  return { user, router, anmeldung, unmount: ergebnis.unmount }
}

/** Kopfzeile der App-Shell (header-Element über dem Seiteninhalt); synchron, z. B. innerhalb von waitFor. */
function kopfzeile(): HTMLElement {
  const header = document.querySelector('header')
  expect(header).not.toBeNull()
  return header as HTMLElement
}

/** Wartet, bis der Router die App-Shell gerendert hat, und liefert die Kopfzeile. */
async function kopfzeileGerendert(): Promise<HTMLElement> {
  return waitFor(kopfzeile)
}

function meAufrufe(): number {
  return api.anfragenMit('GET', /^\/api\/me$/).length
}

/** Rückkehrziel aus dem Aufruf von signinRedirect ({ state: { ziel } }). */
function zielAus(anmeldung: TestAnmeldung): unknown {
  const args = anmeldung.signinRedirect.mock.calls.at(-1)?.[0] as { state?: { ziel?: unknown } } | undefined
  return args?.state?.ziel
}

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Log ?in|Log ?out|Logout|Login|Loading|Error|Unauthorized|Forbidden|Access denied|Welcome|Retry|Try again|Back|Home|Not Found|Something went wrong)\b/i

function alleTexte(): string {
  const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
    ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  )
  return [document.body.textContent ?? '', ...attribute].join(' ')
}

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

// ---------- AK-24, AK-28, AK-33: anonym ----------

describe('anonym', () => {
  it('zeigt die Startseite ohne Weiterleitung zum Login', async () => {
    const { anmeldung } = zeigeApp('/', { zustand: 'anonym' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
    expect(anmeldung.signinRedirect).not.toHaveBeenCalled()
  })

  it('zeigt unter /coins die Liste ohne Weiterleitung zum Login', async () => {
    const { anmeldung } = zeigeApp('/coins', { zustand: 'anonym' })

    expect(await screen.findByText('Noch keine Coins erfasst.')).toBeInTheDocument()
    expect(anmeldung.signinRedirect).not.toHaveBeenCalled()
  })

  // katalog-seiten, AK-12/AK-13: bisher Anmeldehinweis und Abschnitt „Neuen Coin erfassen“.
  it('zeigt unter /coins weder Formular noch „Coin hinzufügen“', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    await screen.findByText(TEXTE.leereListe)

    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })

  it('zeigt unter /coins weder den Abschnitt „Neuen Coin erfassen“ noch den Anmeldehinweis', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    await screen.findByText(TEXTE.leereListe)

    expect(screen.queryByRole('heading', { name: 'Neuen Coin erfassen' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(TEXTE.entfallenAnmelden)
  })

  it('bietet „Anmelden“ nur in der Kopfzeile an', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    await screen.findByText(TEXTE.leereListe)

    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
    expect(within(await kopfzeileGerendert()).getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('ruft /api/me nicht auf', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    await screen.findByText(TEXTE.leereListe)

    expect(meAufrufe()).toBe(0)
  })

  it('sendet beim Laden der Liste keinen Authorization-Header', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    await screen.findByText(TEXTE.leereListe)

    expect(api.anfragenMit('GET', /^\/api\/coins$/)[0].headers.has('Authorization')).toBe(false)
  })

  it('behandelt eine abgelaufene Sitzung ohne Erneuerung als anonym', async () => {
    zeigeApp('/coins', { zustand: 'abgelaufen' })

    expect(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  })
})

// ---------- AK-30: Kopfzeile ----------

describe('Kopfzeile', () => {
  it('zeigt anonym den Button „Anmelden“', async () => {
    zeigeApp('/', { zustand: 'anonym' })

    expect(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('zeigt anonym keinen Button „Abmelden“', async () => {
    zeigeApp('/', { zustand: 'anonym' })
    await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' })

    expect(within(await kopfzeileGerendert()).queryByRole('button', { name: 'Abmelden' })).not.toBeInTheDocument()
  })

  it('zeigt angemeldet den Namen aus /api/me mit dem Präfix „Angemeldet als“', async () => {
    zeigeApp('/')

    await waitFor(() =>
      expect(kopfzeile().textContent?.replace(/\s+/g, ' ')).toContain('Angemeldet als Test Administrator'),
    )
  })

  it('zeigt angemeldet den Button „Abmelden“ und nicht „Anmelden“', async () => {
    zeigeApp('/')

    expect(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    expect(within(await kopfzeileGerendert()).queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
  })

  it('blendet die Symbole der Buttons für Screenreader aus', async () => {
    zeigeApp('/')
    const button = await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' })

    for (const svg of button.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('zeigt während /api/me lädt weder „Anmelden“ noch einen Namen, die Seite aber schon', async () => {
    const offen = offeneAntwort()
    zeigeApp('/', {
      vorbereiten: () => api.einmal('GET', /^\/api\/me$/, () => offen.promise),
    })

    // startseite (9.7, AK-20): Solange /api/me lädt, steht noch nicht fest, ob die Seite GET /api/startseite oder
    // …/kopf lädt; die Seite zeigt dann nur role="status" „Startseite wird geladen …“ und kein h1.
    expect(await screen.findByText('Startseite wird geladen …')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(within(await kopfzeileGerendert()).queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
    expect(kopfzeile()).not.toHaveTextContent('Test Administrator')
    offen.aufloesen(
      new Response(JSON.stringify(ME.admin), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })

  it('zeigt ohne Konfiguration den Hinweis „Anmeldung ist nicht konfiguriert.“ statt „Anmelden“', async () => {
    zeigeApp('/', { ohneKonfiguration: true })

    expect(await within(await kopfzeileGerendert()).findByText(TEXTE.nichtKonfiguriert)).toBeInTheDocument()
    expect(within(await kopfzeileGerendert()).queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
  })

  it('lässt ohne Konfiguration den Katalog lesbar', async () => {
    zeigeApp('/coins', { ohneKonfiguration: true })

    expect(await screen.findByText('Noch keine Coins erfasst.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })
})

// ---------- AK-24: Anmeldung starten ----------

describe('Anmelden', () => {
  it('startet per Button „Anmelden“ die Anmeldung mit Rückkehr auf den aktuellen Pfad samt Query', async () => {
    const { user, anmeldung } = zeigeApp('/coins?seite=2', { zustand: 'anonym' })

    await user.click(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' }))

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe('/coins?seite=2')
  })

  it('leitet zum authorization_endpoint mit Code-Flow und PKCE S256', async () => {
    const { user, anmeldung } = zeigeApp('/coins', { zustand: 'anonym' })

    await user.click(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' }))

    await waitFor(() => expect(anmeldung.navigator.urls).toHaveLength(1))
    const url = anmeldung.navigator.letzte()
    expect(`${url.origin}${url.pathname}`).toBe(AUTHORIZATION_ENDPOINT)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(url.searchParams.has('client_secret')).toBe(false)
  })

  // katalog-seiten, AK-9 (Entscheidung F2): ersetzt den Button im entfallenen Erfassen-Abschnitt.
  it('startet für /coins/neu ohne Sitzung die Anmeldung mit Rückkehrziel /coins/neu', async () => {
    const { anmeldung } = zeigeApp('/coins/neu', { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe('/coins/neu')
  })

  it('ist per Tastatur auslösbar', async () => {
    const { user, anmeldung } = zeigeApp('/', { zustand: 'anonym' })
    const button = await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' })

    button.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
  })

  it('startet für /kein-zugriff ohne Sitzung die Anmeldung mit Rückkehrziel /kein-zugriff', async () => {
    const { anmeldung } = zeigeApp('/kein-zugriff', { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe('/kein-zugriff')
  })
})

// ---------- AK-24, AK-32: Rückruf ----------

describe('Rückruf /anmeldung/rueckruf', () => {
  function rueckruf(ergebnis: 'erfolg' | Error, als: TestBenutzer = 'admin', ziel: string = '/coins?seite=2') {
    setzeBrowserUrl('/anmeldung/rueckruf?code=test-code&state=test-state')
    return zeigeApp('/anmeldung/rueckruf?code=test-code&state=test-state', {
      als,
      zustand: 'anonym',
      vorbereiten: (anmeldung) => {
        anmeldung.rueckrufLiefert(ergebnis === 'erfolg' ? testUser({ name: ME[als].name, ziel }) : ergebnis)
        api.setzeMe(ME[als])
      },
    })
  }

  it('zeigt während des Abschlusses „Anmeldung wird abgeschlossen …“ als Status', async () => {
    setzeBrowserUrl('/anmeldung/rueckruf?code=test-code&state=test-state')
    zeigeApp('/anmeldung/rueckruf?code=test-code&state=test-state', {
      zustand: 'anonym',
      vorbereiten: (anmeldung) => {
        vi.spyOn(anmeldung.userManager, 'signinCallback').mockReturnValue(new Promise(() => {}))
        vi.spyOn(anmeldung.userManager, 'signinRedirectCallback').mockReturnValue(new Promise(() => {}))
      },
    })

    expect(await screen.findByRole('status')).toHaveTextContent(TEXTE.rueckrufLaeuft)
  })

  it('führt nach Erfolg zum Ausgangspfad inklusive Query', async () => {
    const { router } = rueckruf('erfolg')

    await waitFor(() => expect(router.state.location.href).toBe('/coins?seite=2'))
  })

  it('lädt nach Erfolg /api/me', async () => {
    const { router } = rueckruf('erfolg')

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(meAufrufe()).toBeGreaterThanOrEqual(1)
  })

  it('führt bei rolle „keine“ nach /kein-zugriff', async () => {
    const { router } = rueckruf('erfolg', 'keine')

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
  })

  it('führt bei einem fremden Rückkehrziel zur Startseite (kein Open Redirect)', async () => {
    const { router } = rueckruf('erfolg', 'admin', 'https://boese.example/coins')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('führt bei einem protokollrelativen Rückkehrziel zur Startseite', async () => {
    const { router } = rueckruf('erfolg', 'admin', '//boese.example/coins')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('entfernt code und state aus der Browser-URL', async () => {
    const { router } = rueckruf('erfolg')

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(window.location.search).not.toMatch(/code=|state=/)
  })

  it('zeigt bei einem Fehler „Anmeldung fehlgeschlagen“ als Überschrift', async () => {
    rueckruf(new Error('No matching state found in storage'))

    expect(await screen.findByRole('heading', { level: 1, name: 'Anmeldung fehlgeschlagen' })).toBeInTheDocument()
  })

  it('zeigt bei error=access_denied keine technischen Details', async () => {
    rueckruf(new Error('access_denied: Benutzer hat abgelehnt (ErrorResponse)'))
    await screen.findByRole('heading', { level: 1, name: 'Anmeldung fehlgeschlagen' })

    expect(document.body.textContent).not.toMatch(/access_denied|ErrorResponse|state|Error/)
  })

  it('bietet nach einem Fehler „Erneut anmelden“ und „Zum Coin-Katalog“ an', async () => {
    rueckruf(new Error('Failed to fetch'))
    await screen.findByRole('heading', { level: 1, name: 'Anmeldung fehlgeschlagen' })

    expect(screen.getByRole('button', { name: 'Erneut anmelden' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zum Coin-Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('startet über „Erneut anmelden“ eine neue Anmeldung', async () => {
    const { user, anmeldung } = rueckruf(new Error('Failed to fetch'))

    await user.click(await screen.findByRole('button', { name: 'Erneut anmelden' }))

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
  })

  it('hat auf der Fehlerseite genau eine Überschrift der Ebene 1 und ein main', async () => {
    rueckruf(new Error('Failed to fetch'))
    await screen.findByRole('heading', { level: 1, name: 'Anmeldung fehlgeschlagen' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})

// ---------- AK-29: Kein Zugriff ----------

describe('/kein-zugriff', () => {
  it('zeigt die Überschrift „Kein Zugriff“', async () => {
    zeigeApp('/kein-zugriff', { als: 'keine' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
  })

  it('zeigt den Erklärtext mit dem Namen des Benutzers', async () => {
    zeigeApp('/kein-zugriff', { als: 'keine' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    await waitFor(() => expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(TEXTE.keinZugriffText))
  })

  it('verlinkt „Zum Coin-Katalog“ auf /coins', async () => {
    zeigeApp('/kein-zugriff', { als: 'keine' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: 'Zum Coin-Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('bietet im Seiteninhalt den Button „Abmelden“', async () => {
    zeigeApp('/kein-zugriff', { als: 'keine' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    const h1 = screen.getByRole('heading', { level: 1, name: 'Kein Zugriff' })
    const inhalt = h1.parentElement as HTMLElement
    expect(within(inhalt).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('führt über „Zum Coin-Katalog“ zur Liste ohne Formular', async () => {
    const { user, router } = zeigeApp('/kein-zugriff', { als: 'keine' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Zum Coin-Katalog' }))

    expect(await screen.findByText(TEXTE.leereListe)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/coins')
  })

  it('leitet Benutzer mit Rolle zur Startseite', async () => {
    const { router } = zeigeApp('/kein-zugriff', { als: 'betrachter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('wird in der App-Shell angezeigt (Kopfzeile vorhanden)', async () => {
    zeigeApp('/kein-zugriff', { als: 'keine' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(
      within(await kopfzeileGerendert()).getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }),
    ).toBeInTheDocument()
  })
})

// ---------- AK-33, ersetzt durch katalog-seiten AK-13: Link „Coin hinzufügen“ nach Berechtigung ----------

describe('Link „Coin hinzufügen“ nach Rolle', () => {
  it.each(['admin', 'sachbearbeiter'] as const)('zeigt %s den Link „Coin hinzufügen“', async (als) => {
    zeigeApp('/coins', { als })

    expect(await screen.findByRole('link', { name: 'Coin hinzufügen' })).toHaveAttribute('href', '/coins/neu')
  })

  it.each(['betrachter', 'keine'] as const)('zeigt %s keinen Link „Coin hinzufügen“', async (als) => {
    zeigeApp('/coins', { als })
    await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' })
    await screen.findByText(TEXTE.leereListe)

    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(TEXTE.entfallenKeineBerechtigung)
  })

  it('blendet den Link aus, solange /api/me fehlschlägt', async () => {
    zeigeApp('/coins', { vorbereiten: () => api.einmal('GET', /^\/api\/me$/, problemAntwort(500)) })

    await screen.findByText(TEXTE.pruefungFehlgeschlagen)
    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
    expect(screen.getByText('Noch keine Coins erfasst.')).toBeInTheDocument()
  })

  it('blendet den Link aus, solange /api/me lädt', async () => {
    const offen = offeneAntwort()
    zeigeApp('/coins', { vorbereiten: () => api.einmal('GET', /^\/api\/me$/, () => offen.promise) })

    await screen.findByText(TEXTE.leereListe)
    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
    offen.aufloesen(
      new Response(JSON.stringify(ME.admin), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    expect(await screen.findByRole('link', { name: 'Coin hinzufügen' })).toBeInTheDocument()
  })
})

// ---------- AK-27: Bearer-Header, 401, 403 ----------

describe('API-Aufrufe angemeldet', () => {
  it('sendet beim Anlegen Authorization: Bearer mit dem Access-Token', async () => {
    const { user } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(api.anfragenMit('POST')).toHaveLength(1))
    expect(api.anfragenMit('POST')[0].headers.get('Authorization')).toBe('Bearer test-access-token-1')
  })

  it('sendet beim Laden von /api/me das Access-Token', async () => {
    zeigeApp('/')
    await waitFor(() => expect(meAufrufe()).toBe(1))

    expect(api.anfragenMit('GET', /^\/api\/me$/)[0].headers.get('Authorization')).toBe('Bearer test-access-token-1')
  })

  it('lädt das Motivbild per <img src> ohne fetch', async () => {
    zeigeApp('/coins', {
      vorbereiten: () =>
        api.coins.push({
          id: 'c1',
          name: 'Coin Bild',
          herausgeber: 'Herausgeber Beta',
          auflage: null,
          beschreibung: null,
          erstelltAm: '2026-10-05T12:00:00+00:00',
          bildUrl: '/api/coins/c1/bild?v=a',
        }),
    })

    const bild = await screen.findByRole('img', { name: 'Motiv: Coin Bild' })
    expect(bild).toHaveAttribute('src', '/api/coins/c1/bild?v=a')
    expect(api.anfragen.some((a) => a.pfad.endsWith('/bild') && a.methode === 'GET')).toBe(false)
  })

  // katalog-seiten (AK-21): Das Formular liegt auf /coins/neu, die Rückkehr führt dorthin (bisher /coins).
  it('entfernt bei 401 auf das Anlegen den User und startet die Anmeldung mit Rückkehr auf /coins/neu', async () => {
    const { user, anmeldung } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(401, { title: 'Nicht angemeldet' }))
    await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe('/coins/neu')
    expect(anmeldung.hatUser()).toBe(false)
  })

  it('zeigt bei 403 auf das Anlegen „Sie sind nicht berechtigt, Coins zu erfassen.“', async () => {
    const { user, anmeldung } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(403, { title: 'Kein Zugriff' }))
    await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })

    await user.click(formularFelder().absenden)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sie sind nicht berechtigt, Coins zu erfassen.')
    expect(anmeldung.signinRedirect).not.toHaveBeenCalled()
  })
})

// ---------- AK-28: /api/me nur einmal ----------

describe('/api/me-Aufrufe', () => {
  it('ruft /api/me bei mehreren Navigationen nur einmal auf', async () => {
    const { user } = zeigeApp('/')
    await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' })

    await user.click(screen.getByRole('link', { name: 'Katalog' }))
    await screen.findByRole('heading', { level: 1, name: 'Katalog' })
    await user.click(screen.getByRole('link', { name: 'Startseite' }))
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(meAufrufe()).toBe(1)
  })
})

// ---------- AK-32: /api/me scheitert ----------

describe('/api/me scheitert', () => {
  it('zeigt in der Kopfzeile „Ihre Anmeldung konnte nicht geprüft werden.“ als Alarm', async () => {
    zeigeApp('/', { vorbereiten: () => api.einmal('GET', /^\/api\/me$/, problemAntwort(500)) })

    const alarm = await within(await kopfzeileGerendert()).findByRole('alert')
    expect(alarm).toHaveTextContent(TEXTE.pruefungFehlgeschlagen)
  })

  it('zeigt die Meldung auch bei einem Netzwerkfehler', async () => {
    zeigeApp('/', { vorbereiten: () => api.netzwerkfehler('GET', /^\/api\/me$/) })

    expect(await within(await kopfzeileGerendert()).findByRole('alert')).toHaveTextContent(TEXTE.pruefungFehlgeschlagen)
  })

  it('lädt /api/me per „Erneut versuchen“ erneut und zeigt dann den Namen', async () => {
    const { user } = zeigeApp('/', { vorbereiten: () => api.einmal('GET', /^\/api\/me$/, problemAntwort(503)) })

    await user.click(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Erneut versuchen' }))

    await waitFor(() => expect(kopfzeile()).toHaveTextContent('Test Administrator'))
    expect(meAufrufe()).toBe(2)
  })
})

// ---------- AK-26: Erneuerung gescheitert ----------

describe('Erneuerung', () => {
  it('zeigt nach gescheiterter Erneuerung den Zustand anonym', async () => {
    const { anmeldung } = zeigeApp('/')
    await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' })

    await act(async () => {
      await anmeldung.userManager.events._raiseSilentRenewError(new Error('invalid_grant'))
    })

    expect(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('entfernt nach gescheiterter Erneuerung den User', async () => {
    const { anmeldung } = zeigeApp('/')
    await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' })

    await act(async () => {
      await anmeldung.userManager.events._raiseSilentRenewError(new Error('invalid_grant'))
    })

    await waitFor(() => expect(anmeldung.hatUser()).toBe(false))
  })

  it('sendet nach einer Erneuerung das neue Token', async () => {
    const { user, anmeldung } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })

    await act(async () => {
      await anmeldung.userManager.storeUser(testUser({ accessToken: 'erneuertes-token' }))
      await anmeldung.userManager.events.load(testUser({ accessToken: 'erneuertes-token' }))
    })
    await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })
    await user.click(formularFelder().absenden)

    await waitFor(() => expect(api.anfragenMit('POST')).toHaveLength(1))
    expect(api.anfragenMit('POST')[0].headers.get('Authorization')).toBe('Bearer erneuertes-token')
  })
})

// ---------- AK-31: Abmelden ----------

describe('Abmelden', () => {
  it('entfernt den lokalen User', async () => {
    const { user, anmeldung } = zeigeApp('/')

    await user.click(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' }))

    await waitFor(() => expect(anmeldung.hatUser()).toBe(false))
  })

  it('leitet zum end_session_endpoint mit id_token_hint und client_id', async () => {
    const { user, anmeldung } = zeigeApp('/')

    await user.click(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' }))

    await waitFor(() => expect(anmeldung.navigator.urls).toHaveLength(1))
    const url = anmeldung.navigator.letzte()
    expect(`${url.origin}${url.pathname}`).toBe(END_SESSION_ENDPOINT)
    expect(url.searchParams.get('id_token_hint')).toBeTruthy()
    expect(url.searchParams.get('client_id')).toBe('coin-web')
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${window.location.origin}/abgemeldet`)
  })

  it('ist per Tastatur auslösbar', async () => {
    const { user, anmeldung } = zeigeApp('/')
    const button = await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' })

    button.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(anmeldung.signoutRedirect).toHaveBeenCalledTimes(1))
  })
})

describe('/abgemeldet', () => {
  it('zeigt die Überschrift „Abgemeldet“ und „Sie wurden abgemeldet.“', async () => {
    zeigeApp('/abgemeldet', { zustand: 'anonym' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Abgemeldet' })).toBeInTheDocument()
    expect(screen.getByText('Sie wurden abgemeldet.')).toBeInTheDocument()
  })

  it('bietet „Erneut anmelden“ und „Zum Coin-Katalog“ an', async () => {
    zeigeApp('/abgemeldet', { zustand: 'anonym' })
    await screen.findByRole('heading', { level: 1, name: 'Abgemeldet' })

    expect(screen.getByRole('button', { name: 'Erneut anmelden' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Zum Coin-Katalog' })).toHaveAttribute(
      'href',
      '/coins',
    )
  })

  it('startet über „Erneut anmelden“ die Anmeldung', async () => {
    const { user, anmeldung } = zeigeApp('/abgemeldet', { zustand: 'anonym' })

    await user.click(await screen.findByRole('button', { name: 'Erneut anmelden' }))

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
  })

  it('ist ohne Sitzung erreichbar und leitet nicht zum Login', async () => {
    const { anmeldung } = zeigeApp('/abgemeldet', { zustand: 'anonym' })
    await screen.findByRole('heading', { level: 1, name: 'Abgemeldet' })

    expect(anmeldung.signinRedirect).not.toHaveBeenCalled()
  })
})

// ---------- AK-25 ----------

describe('Speicher', () => {
  it('schreibt beim Start angemeldet nichts außer coin-theme in den localStorage', async () => {
    zeigeApp('/coins')
    await screen.findByRole('link', { name: 'Coin hinzufügen' })

    expect(Object.keys(localStorage).filter((k) => k !== 'coin-theme')).toEqual([])
  })

  it('setzt keine Cookies', async () => {
    const { user } = zeigeApp('/')
    await user.click(await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' }))

    expect(document.cookie).toBe('')
  })
})

// ---------- AK-34: deutsche Texte, ein h1 ----------

describe('deutsche Texte und Struktur', () => {
  it('Kopfzeile anonym ohne englische Texte', async () => {
    zeigeApp('/', { zustand: 'anonym' })
    await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('Kopfzeile angemeldet ohne englische Texte', async () => {
    zeigeApp('/')
    await within(await kopfzeileGerendert()).findByRole('button', { name: 'Abmelden' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('/kein-zugriff ohne englische Texte und mit genau einem h1', async () => {
    zeigeApp('/kein-zugriff', { als: 'keine' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('/abgemeldet ohne englische Texte und mit genau einem h1', async () => {
    zeigeApp('/abgemeldet', { zustand: 'anonym' })
    await screen.findByRole('heading', { level: 1, name: 'Abgemeldet' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('Kopfzeile mit Prüffehler ohne englische Texte', async () => {
    zeigeApp('/', { vorbereiten: () => api.einmal('GET', /^\/api\/me$/, problemAntwort(500)) })
    await within(await kopfzeileGerendert()).findByRole('alert')

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})

// ======================================================================================================
// Feature rollen-benutzerverwaltung Rev. 3, AK-41 bis AK-45: „Erneut prüfen“, Prüfung bei Fensterfokus und
// Guard-Neulauf nur bei echten Übergängen der Zugriffsklasse (deaktiviert, ohneRolle, mitRolle).
// ======================================================================================================

const REV3 = {
  deaktiviert: 'Ihr Benutzerkonto ist deaktiviert.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
  weiterhinDeaktiviert: 'Ihr Benutzerkonto ist weiterhin deaktiviert.',
  weiterhinKeineRolle: 'Ihrem Benutzerkonto ist weiterhin keine Rolle zugewiesen.',
  pruefungFehlgeschlagen: 'Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.',
} as const

type Ausgang = 'deaktiviert' | 'keineRolle'

/** Startet die App auf `pfad` als Deaktivierter (403 benutzer_deaktiviert) bzw. als Benutzer ohne Rolle. */
function zeigeAppAls(ausgang: Ausgang, pfad = '/kein-zugriff', routerVorbereiten?: (router: AppRouter) => void) {
  return zeigeApp(pfad, {
    als: ausgang === 'keineRolle' ? 'keine' : 'admin',
    vorbereiten: ausgang === 'deaktiviert' ? () => api.setzeMe('deaktiviert') : undefined,
    routerVorbereiten,
  })
}

async function keinZugriffGeladen(ausgang: Ausgang): Promise<void> {
  await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })
  await waitFor(() =>
    expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(
      ausgang === 'deaktiviert' ? REV3.deaktiviert : REV3.keineRolle,
    ),
  )
}

function erneutPruefenButton(): HTMLElement {
  return within(screen.getByRole('main')).getByRole('button', { name: /^(Erneut prüfen|Wird geprüft …)$/ })
}

/**
 * Keine Meldung „weiterhin …“ (AK-42), weder als status/alert noch sonst im Text. Der feste Seitentext enthält das
 * Wort „weiterhin“ (AK-32: „Den Coin-Katalog können Sie weiterhin ansehen.“), deshalb wird nach den Meldungssätzen gesucht.
 */
function keineWeiterhinMeldung(): void {
  expect(meldungMit(REV3.weiterhinDeaktiviert)).toBeUndefined()
  expect(meldungMit(REV3.weiterhinKeineRolle)).toBeUndefined()
  expect(seitenText()).not.toContain(REV3.weiterhinDeaktiviert)
  expect(seitenText()).not.toContain(REV3.weiterhinKeineRolle)
}

function seitenText(): string {
  return document.body.textContent?.replace(/\s+/g, ' ') ?? ''
}

/** Simuliert die Rückkehr in das Fenster über das focus-Ereignis des Fensters. */
function fensterFokus(): void {
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
}

/** Simuliert die Rückkehr in das Fenster über visibilitychange auf „visible“. */
function wiederSichtbar(): void {
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** Lässt die (gefälschte) Uhr vorlaufen; Timer laufen nur, wenn sie ebenfalls gefälscht sind. */
function zeitVergeht(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Zählt die Aufrufe des beforeLoad-Guards einer Route (TanStack liest `options.beforeLoad` bei jedem Laden). */
function zaehleGuard(router: AppRouter, pfad: '/kein-zugriff' | '/benutzerverwaltung') {
  const optionen = router.routesByPath[pfad].options as { beforeLoad?: (...args: unknown[]) => unknown }
  const original = optionen.beforeLoad
  const spy = vi.fn((...args: unknown[]) => original?.(...args))
  optionen.beforeLoad = spy
  return spy
}

function jsonAntwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function deaktiviertAntwort(): Response {
  return problemAntwort(403, { title: 'Kein Zugriff', code: 'benutzer_deaktiviert' })
}

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'visibilityState')
  Reflect.deleteProperty(document, 'hidden')
})

// ---------- AK-41 ----------

describe.each(['deaktiviert', 'keineRolle'] as const)('/kein-zugriff (%s): Button „Erneut prüfen“', (ausgang) => {
  it('zeigt im Seiteninhalt „Erneut prüfen“ neben „Zum Coin-Katalog“ und „Abmelden“', async () => {
    zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)

    const main = screen.getByRole('main')
    expect(within(main).getByRole('button', { name: 'Erneut prüfen' })).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: 'Zum Coin-Katalog' })).toBeInTheDocument()
    expect(within(main).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('ist per Tastatur erreichbar', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    const button = within(screen.getByRole('main')).getByRole('button', { name: 'Erneut prüfen' })

    for (let i = 0; i < 40 && document.activeElement !== button; i++) await user.tab()

    expect(button).toHaveFocus()
  })
})

// ---------- AK-42 ----------

describe.each(['deaktiviert', 'keineRolle'] as const)('„Erneut prüfen“ (%s)', (ausgang) => {
  const weiterhin = ausgang === 'deaktiviert' ? REV3.weiterhinDeaktiviert : REV3.weiterhinKeineRolle

  it('lädt /api/me genau einmal neu', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(meldungMit(weiterhin)).toBeDefined())
    expect(meAufrufe()).toBe(2)
  })

  it('lässt die Seite während der Prüfung stehen und zeigt „Wird geprüft …“', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/me$/, () => offen.promise)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(erneutPruefenButton()).toHaveTextContent('Wird geprüft …'))
    expect(screen.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    expect(seitenText()).toContain(ausgang === 'deaktiviert' ? REV3.deaktiviert : REV3.keineRolle)
    offen.aufloesen(ausgang === 'deaktiviert' ? deaktiviertAntwort() : jsonAntwort(200, ME.keine))
  })

  it('behält während der Prüfung die Kopfzeile (kein Zwischenzustand „pruefe“)', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/me$/, () => offen.promise)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(erneutPruefenButton()).toHaveTextContent('Wird geprüft …'))
    expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    if (ausgang === 'keineRolle') expect(kopfzeile()).toHaveTextContent('Test Neu')
    offen.aufloesen(ausgang === 'deaktiviert' ? deaktiviertAntwort() : jsonAntwort(200, ME.keine))
  })

  it('hält den Button während der Prüfung fokussierbar (aria-disabled, kein disabled) und fokussiert', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/me$/, () => offen.promise)
    const button = erneutPruefenButton()

    await user.click(button)

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).not.toHaveAttribute('disabled')
    expect(button).toHaveFocus()
    offen.aufloesen(ausgang === 'deaktiviert' ? deaktiviertAntwort() : jsonAntwort(200, ME.keine))
  })

  it('sendet bei weiteren Klicks und Enter während der Prüfung keinen zweiten Request', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/me$/, () => offen.promise)
    const button = erneutPruefenButton()

    await user.click(button)
    await user.click(button)
    await user.keyboard('{Enter}')

    expect(meAufrufe()).toBe(2)
    offen.aufloesen(ausgang === 'deaktiviert' ? deaktiviertAntwort() : jsonAntwort(200, ME.keine))
  })

  it('meldet bei unveränderter Zugriffsklasse „weiterhin …“ als Status', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(weiterhin))
  })

  it('bleibt bei unveränderter Zugriffsklasse auf /kein-zugriff mit dem Fokus auf dem Button', async () => {
    const { user, router } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(meldungMit(weiterhin)).toBeDefined())
    expect(router.state.location.pathname).toBe('/kein-zugriff')
    expect(erneutPruefenButton()).toHaveFocus()
  })

  it('meldet einen Serverfehler als Alarm und lässt die Seite stehen', async () => {
    const { user, router } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    api.einmal('GET', /^\/api\/me$/, problemAntwort(500))

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(REV3.pruefungFehlgeschlagen))
    expect(router.state.location.pathname).toBe('/kein-zugriff')
    expect(seitenText()).toContain(ausgang === 'deaktiviert' ? REV3.deaktiviert : REV3.keineRolle)
  })

  it('meldet einen Netzwerkfehler als Alarm', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    api.netzwerkfehler('GET', /^\/api\/me$/)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(meldungMit(REV3.pruefungFehlgeschlagen)).toBeDefined())
  })

  it('behält bei einem Fehler den bisherigen Zustand (keine Prüf-Fehlermeldung der Kopfzeile)', async () => {
    const { user } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    api.einmal('GET', /^\/api\/me$/, problemAntwort(503))

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(meldungMit(REV3.pruefungFehlgeschlagen)).toBeDefined())
    expect(kopfzeile()).not.toHaveTextContent(TEXTE.pruefungFehlgeschlagen)
    expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('verwirft bei 401 die Sitzung wie bisher', async () => {
    const { user, anmeldung } = zeigeAppAls(ausgang)
    await keinZugriffGeladen(ausgang)
    api.einmal('GET', /^\/api\/me$/, problemAntwort(401, { title: 'Nicht angemeldet' }))

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(anmeldung.hatUser()).toBe(false))
  })
})

describe('„Erneut prüfen“: Wechsel des Grunds', () => {
  it('zeigt nach Deaktivierung eines Benutzers ohne Rolle den Deaktiviert-Text', async () => {
    const { user, router } = zeigeAppAls('keineRolle')
    await keinZugriffGeladen('keineRolle')
    api.setzeMe('deaktiviert')

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(seitenText()).toContain(REV3.deaktiviert))
    expect(seitenText()).not.toContain(REV3.keineRolle)
    expect(router.state.location.pathname).toBe('/kein-zugriff')
  })

  it('behält nach dem Wechsel „keine Rolle“ → „deaktiviert“ den Fokus auf „Erneut prüfen“', async () => {
    const { user } = zeigeAppAls('keineRolle')
    await keinZugriffGeladen('keineRolle')
    api.setzeMe('deaktiviert')

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(seitenText()).toContain(REV3.deaktiviert))
    await waitFor(() => expect(erneutPruefenButton()).toHaveTextContent('Erneut prüfen'))
    expect(erneutPruefenButton()).toHaveFocus()
  })

  it('zeigt nach dem Wechsel keine Meldung „weiterhin …“', async () => {
    const { user } = zeigeAppAls('keineRolle')
    await keinZugriffGeladen('keineRolle')
    api.setzeMe('deaktiviert')

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(seitenText()).toContain(REV3.deaktiviert))
    await waitFor(() => expect(erneutPruefenButton()).toHaveTextContent('Erneut prüfen'))
    keineWeiterhinMeldung()
  })

  it('lässt einen reaktivierten Benutzer ohne Rolle auf /kein-zugriff mit dem Text für „keine Rolle“ (AK-43)', async () => {
    const { user, router } = zeigeAppAls('deaktiviert')
    await keinZugriffGeladen('deaktiviert')
    api.setzeMe(ME.keine)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(seitenText()).toContain(TEXTE.keinZugriffText))
    expect(router.state.location.pathname).toBe('/kein-zugriff')
  })
})

// ---------- AK-43 ----------

describe('Reaktivierung bzw. Rollenvergabe während der Sitzung', () => {
  it('führt einen reaktivierten Benutzer mit Rolle nach „Erneut prüfen“ zur Startseite', async () => {
    const { user, router } = zeigeAppAls('deaktiviert')
    await keinZugriffGeladen('deaktiviert')
    api.setzeMe(ME.betrachter)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
  })

  it('zeigt nach der Reaktivierung den Namen in der Kopfzeile', async () => {
    const { user } = zeigeAppAls('deaktiviert')
    await keinZugriffGeladen('deaktiviert')
    api.setzeMe(ME.betrachter)

    await user.click(erneutPruefenButton())

    await waitFor(() =>
      expect(kopfzeile().textContent?.replace(/\s+/g, ' ')).toContain('Angemeldet als Test Betrachter'),
    )
  })

  it('führt nach einer Rollenvergabe an einen Benutzer ohne Rolle zur Startseite', async () => {
    const { user, router } = zeigeAppAls('keineRolle')
    await keinZugriffGeladen('keineRolle')
    api.setzeMe({ ...ME.betrachter, id: ME.keine.id, name: ME.keine.name })

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('zeigt nach der Rollenvergabe die Sidebar-Einträge gemäß berechtigungen', async () => {
    const { user, router } = zeigeAppAls('keineRolle')
    await keinZugriffGeladen('keineRolle')
    expect(screen.queryByRole('link', { name: 'Benutzerverwaltung' })).not.toBeInTheDocument()
    api.setzeMe({ ...ME.admin, id: ME.keine.id, name: ME.keine.name })

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('link', { name: 'Benutzerverwaltung' })).toBeInTheDocument()
  })

  it('führt router.invalidate dabei genau einmal aus', async () => {
    const { user, router } = zeigeAppAls('deaktiviert')
    await keinZugriffGeladen('deaktiviert')
    const invalidate = vi.spyOn(router, 'invalidate')
    api.setzeMe(ME.betrachter)

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})

// ---------- AK-44 ----------

describe('Prüfung bei Rückkehr in das Fenster', () => {
  beforeEach(() => {
    // Nur die Uhr wird gefälscht (für die 30-Sekunden-Sperre); Timer laufen echt, damit waitFor funktioniert.
    vi.useFakeTimers({ toFake: ['Date', 'performance'], shouldAdvanceTime: true })
  })

  describe.each(['deaktiviert', 'keineRolle'] as const)('%s', (ausgang) => {
    it('lädt /api/me beim focus-Ereignis des Fensters genau einmal', async () => {
      zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)

      fensterFokus()

      await waitFor(() => expect(meAufrufe()).toBe(2))
    })

    it('lädt /api/me bei visibilitychange auf „visible“ genau einmal', async () => {
      zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)

      wiederSichtbar()

      await waitFor(() => expect(meAufrufe()).toBe(2))
    })

    it('zeigt bei unveränderter Zugriffsklasse keine Statusmeldung (stille Prüfung)', async () => {
      zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)

      fensterFokus()

      await waitFor(() => expect(meAufrufe()).toBe(2))
      await act(async () => {
        await Promise.resolve()
      })
      keineWeiterhinMeldung()
    })

    it('zeigt bei einem Fehler keine Fehlermeldung (stille Prüfung)', async () => {
      zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)
      api.einmal('GET', /^\/api\/me$/, problemAntwort(500))

      fensterFokus()

      await waitFor(() => expect(meAufrufe()).toBe(2))
      await act(async () => {
        await Promise.resolve()
      })
      expect(seitenText()).not.toContain(REV3.pruefungFehlgeschlagen)
      expect(seitenText()).not.toContain(TEXTE.pruefungFehlgeschlagen)
    })

    it('prüft höchstens einmal je 30 Sekunden', async () => {
      zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)
      fensterFokus()
      await waitFor(() => expect(meAufrufe()).toBe(2))

      zeitVergeht(10_000)
      fensterFokus()
      wiederSichtbar()
      zeitVergeht(19_000)
      fensterFokus()

      await act(async () => {
        await Promise.resolve()
      })
      expect(meAufrufe()).toBe(2)
    })

    it('prüft nach Ablauf von 30 Sekunden erneut', async () => {
      zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)
      fensterFokus()
      await waitFor(() => expect(meAufrufe()).toBe(2))

      zeitVergeht(31_000)
      fensterFokus()

      await waitFor(() => expect(meAufrufe()).toBe(3))
    })

    it('prüft bei Fensterfokus direkt nach „Erneut prüfen“ nicht erneut (30-Sekunden-Sperre)', async () => {
      const { user } = zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)
      await user.click(erneutPruefenButton())
      await waitFor(() => expect(meAufrufe()).toBe(2))
      await waitFor(() => expect(erneutPruefenButton()).toHaveTextContent('Erneut prüfen'))

      fensterFokus()
      wiederSichtbar()

      await act(async () => {
        await Promise.resolve()
      })
      expect(meAufrufe()).toBe(2)
    })

    it('prüft bei Fensterfokus 30 Sekunden nach „Erneut prüfen“ wieder', async () => {
      const { user } = zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)
      await user.click(erneutPruefenButton())
      await waitFor(() => expect(meAufrufe()).toBe(2))
      await waitFor(() => expect(erneutPruefenButton()).toHaveTextContent('Erneut prüfen'))
      zeitVergeht(31_000)

      fensterFokus()

      await waitFor(() => expect(meAufrufe()).toBe(3))
    })

    it('prüft nicht parallel zu einer laufenden Prüfung über „Erneut prüfen“', async () => {
      const { user } = zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)
      const offen = offeneAntwort()
      api.einmal('GET', /^\/api\/me$/, () => offen.promise)
      await user.click(erneutPruefenButton())
      await waitFor(() => expect(meAufrufe()).toBe(2))

      fensterFokus()
      wiederSichtbar()

      await act(async () => {
        await Promise.resolve()
      })
      expect(meAufrufe()).toBe(2)
      offen.aufloesen(ausgang === 'deaktiviert' ? deaktiviertAntwort() : jsonAntwort(200, ME.keine))
    })

    it('prüft nicht parallel zu einer laufenden Prüfung bei Fensterfokus', async () => {
      zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      zeitVergeht(31_000)
      const offen = offeneAntwort()
      api.einmal('GET', /^\/api\/me$/, () => offen.promise)
      fensterFokus()
      await waitFor(() => expect(meAufrufe()).toBe(2))
      zeitVergeht(31_000)

      fensterFokus()

      await act(async () => {
        await Promise.resolve()
      })
      expect(meAufrufe()).toBe(2)
      offen.aufloesen(ausgang === 'deaktiviert' ? deaktiviertAntwort() : jsonAntwort(200, ME.keine))
    })

    it('entfernt die Listener beim Unmount', async () => {
      const { unmount } = zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      unmount()
      zeitVergeht(31_000)

      fensterFokus()
      wiederSichtbar()

      await act(async () => {
        await Promise.resolve()
      })
      expect(meAufrufe()).toBe(1)
    })
  })

  it('leitet einen Deaktivierten auf /kein-zugriff nach Reaktivierung per Fensterfokus zur Startseite', async () => {
    const { router } = zeigeAppAls('deaktiviert')
    await keinZugriffGeladen('deaktiviert')
    zeitVergeht(31_000)
    api.setzeMe(ME.betrachter)

    fensterFokus()

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('prüft auch auf anderen Seiten, z. B. als Deaktivierter auf /coins', async () => {
    zeigeAppAls('deaktiviert', '/coins')
    await waitFor(() => expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument())
    zeitVergeht(31_000)

    fensterFokus()

    await waitFor(() => expect(meAufrufe()).toBe(2))
  })

  it('bleibt nach Reaktivierung per Fensterfokus auf /coins und zeigt den Namen', async () => {
    const { router } = zeigeAppAls('deaktiviert', '/coins')
    await waitFor(() => expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument())
    zeitVergeht(31_000)
    api.setzeMe(ME.betrachter)

    fensterFokus()

    await waitFor(() => expect(kopfzeile()).toHaveTextContent('Test Betrachter'))
    expect(router.state.location.pathname).toBe('/coins')
  })

  it('entfernt die Listener nach dem Wechsel zu „mit Rolle“', async () => {
    const { router } = zeigeAppAls('deaktiviert')
    await keinZugriffGeladen('deaktiviert')
    zeitVergeht(31_000)
    api.setzeMe(ME.betrachter)
    fensterFokus()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    zeitVergeht(31_000)
    fensterFokus()
    wiederSichtbar()

    await act(async () => {
      await Promise.resolve()
    })
    expect(meAufrufe()).toBe(2)
  })

  it.each(['admin', 'betrachter'] as const)(
    'lädt /api/me für angemeldete Benutzer mit Rolle (%s) nicht',
    async (als) => {
      zeigeApp('/', { als })
      await waitFor(() => expect(kopfzeile()).toHaveTextContent(ME[als].name))
      zeitVergeht(31_000)

      fensterFokus()
      wiederSichtbar()

      await act(async () => {
        await Promise.resolve()
      })
      expect(meAufrufe()).toBe(1)
    },
  )

  it('lädt /api/me anonym nicht', async () => {
    zeigeApp('/', { zustand: 'anonym' })
    await within(await kopfzeileGerendert()).findByRole('button', { name: 'Anmelden' })
    zeitVergeht(31_000)

    fensterFokus()
    wiederSichtbar()

    await act(async () => {
      await Promise.resolve()
    })
    expect(meAufrufe()).toBe(0)
  })

  it('lädt /api/me im Zustand „Fehler“ nicht', async () => {
    zeigeApp('/', { vorbereiten: () => api.einmal('GET', /^\/api\/me$/, problemAntwort(500)) })
    await within(await kopfzeileGerendert()).findByRole('alert')
    zeitVergeht(31_000)

    fensterFokus()
    wiederSichtbar()

    await act(async () => {
      await Promise.resolve()
    })
    expect(meAufrufe()).toBe(1)
  })
})

describe('kein Polling (AK-44)', () => {
  it.each(['deaktiviert', 'keineRolle'] as const)(
    'ruft /api/me als %s in 5 Minuten ohne Ereignis nicht auf',
    async (ausgang) => {
      // Alle Timer gefälscht (auch setInterval/setTimeout), damit eine Polling-Schleife auffiele; die Zeit läuft
      // zusätzlich echt weiter, damit findBy/waitFor funktionieren.
      vi.useFakeTimers({ shouldAdvanceTime: true })
      zeigeAppAls(ausgang)
      await keinZugriffGeladen(ausgang)
      expect(meAufrufe()).toBe(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000)
      })

      expect(meAufrufe()).toBe(1)
    },
  )
})

// ---------- AK-45 ----------

describe('Guard-Neulauf nur bei echten Übergängen der Zugriffsklasse', () => {
  it('leitet beim Erstaufruf von /benutzerverwaltung als Deaktivierter nach /kein-zugriff', async () => {
    const { router } = zeigeAppAls('deaktiviert', '/benutzerverwaltung')

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
  })

  it('führt beim Erstaufruf als Deaktivierter den Guard von /benutzerverwaltung genau einmal aus', async () => {
    let guard: ReturnType<typeof zaehleGuard> | undefined
    zeigeAppAls('deaktiviert', '/benutzerverwaltung', (router) => {
      guard = zaehleGuard(router, '/benutzerverwaltung')
    })
    await keinZugriffGeladen('deaktiviert')
    await act(async () => {
      await Promise.resolve()
    })

    expect(guard).toHaveBeenCalledTimes(1)
  })

  it('führt beim Erstaufruf als Deaktivierter den Guard von /kein-zugriff genau einmal aus', async () => {
    let guard: ReturnType<typeof zaehleGuard> | undefined
    zeigeAppAls('deaktiviert', '/benutzerverwaltung', (router) => {
      guard = zaehleGuard(router, '/kein-zugriff')
    })
    await keinZugriffGeladen('deaktiviert')
    await act(async () => {
      await Promise.resolve()
    })

    expect(guard).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Deaktivierter', 'deaktiviert', '/benutzerverwaltung'],
    ['Administrator', 'admin', '/'],
    ['Benutzer ohne Rolle', 'keine', '/kein-zugriff'],
  ] as const)('ruft beim Erstaufruf als %s kein invalidate auf', async (_name, als, pfad) => {
    let invalidate: ReturnType<typeof vi.spyOn> | undefined
    zeigeApp(pfad, {
      als: als === 'deaktiviert' ? 'admin' : als,
      vorbereiten: als === 'deaktiviert' ? () => api.setzeMe('deaktiviert') : undefined,
      routerVorbereiten: (router) => {
        invalidate = vi.spyOn(router, 'invalidate')
      },
    })
    await waitFor(() => expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument())
    await act(async () => {
      await Promise.resolve()
    })

    expect(invalidate).not.toHaveBeenCalled()
  })

  function deaktiviertWaehrendDerSitzung(
    offen?: ReturnType<typeof offeneAntwort>,
    routerVorbereiten?: (router: AppRouter) => void,
  ) {
    return zeigeApp('/benutzerverwaltung', {
      routerVorbereiten,
      vorbereiten: () =>
        api.einmal('GET', /^\/api\/benutzer$/, () => {
          api.setzeMe('deaktiviert')
          if (offen) api.einmal('GET', /^\/api\/me$/, () => offen.promise)
          return deaktiviertAntwort()
        }),
    })
  }

  it('führt bei 403 benutzer_deaktiviert während der Sitzung genau ein invalidate aus und landet auf /kein-zugriff', async () => {
    // Spy vor dem Rendern: Die Kette 403 → /api/me → invalidate kann sonst schon durchgelaufen sein. Der Erstaufruf
    // als Administrator löst laut AK-45 kein invalidate aus, gezählt wird also nur der Übergang.
    let invalidate: ReturnType<typeof vi.spyOn> | undefined
    const { router } = deaktiviertWaehrendDerSitzung(undefined, (r) => {
      invalidate = vi.spyOn(r, 'invalidate')
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('behält beim Neuladen nach 403 benutzer_deaktiviert den letzten Zustand bis zur Antwort', async () => {
    const offen = offeneAntwort()
    deaktiviertWaehrendDerSitzung(offen)

    await waitFor(() => expect(meAufrufe()).toBe(2))

    // Kein Zwischenzustand „pruefe“: Die Kopfzeile zeigt weiter Namen und „Abmelden“.
    expect(kopfzeile().textContent?.replace(/\s+/g, ' ')).toContain('Angemeldet als Test Administrator')
    expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    offen.aufloesen(deaktiviertAntwort())
  })

  it('ruft bei „Erneut prüfen“ ohne Änderung der Zugriffsklasse kein invalidate auf', async () => {
    const { user, router } = zeigeAppAls('deaktiviert')
    await keinZugriffGeladen('deaktiviert')
    const invalidate = vi.spyOn(router, 'invalidate')

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(meldungMit(REV3.weiterhinDeaktiviert)).toBeDefined())
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('führt beim Wechsel „ohne Rolle“ → „deaktiviert“ genau ein invalidate aus', async () => {
    const { user, router } = zeigeAppAls('keineRolle')
    await keinZugriffGeladen('keineRolle')
    const invalidate = vi.spyOn(router, 'invalidate')
    api.setzeMe('deaktiviert')

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(seitenText()).toContain(REV3.deaktiviert))
    await act(async () => {
      await Promise.resolve()
    })
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('führt beim Wechsel „ohne Rolle“ → „mit Rolle“ genau ein invalidate aus', async () => {
    const { user, router } = zeigeAppAls('keineRolle')
    await keinZugriffGeladen('keineRolle')
    const invalidate = vi.spyOn(router, 'invalidate')
    api.setzeMe({ ...ME.betrachter, id: ME.keine.id, name: ME.keine.name })

    await user.click(erneutPruefenButton())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})
