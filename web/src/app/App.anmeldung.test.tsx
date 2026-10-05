import { createMemoryHistory } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import { formularFelder, fuelleAus } from '../../test/hilfen'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature anmeldung-keycloak, AK-23 bis AK-34: Anmeldung im Zusammenspiel von App, Router, Kopfzeile und Seiten.
// Echter UserManager (In-Memory-Speicher), Weiterleitungen werden nur aufgezeichnet (test/anmeldung.tsx).

const TEXTE = {
  anmeldenHinweis: 'Zum Erfassen von Coins melden Sie sich bitte an.',
  keineBerechtigung: 'Coins erfassen können nur Administratoren und Sachbearbeiter.',
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
}

function zeigeApp(
  pfad: string,
  { als = 'admin', zustand = 'angemeldet', ohneKonfiguration = false, vorbereiten }: Optionen = {},
) {
  api = erstelleFakeApi([], { me: zustand === 'anonym' ? null : ME[als] })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung = erstelleTestAnmeldung(zustand, ME[als].name)
  vorbereiten?.(anmeldung)
  const user = userEvent.setup()
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  render(<App router={router} userManager={ohneKonfiguration ? null : anmeldung.userManager} />)
  return { user, router, anmeldung }
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

  it('zeigt unter /coins den Anmeldehinweis statt des Formulars', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })

    expect(await screen.findByText(TEXTE.anmeldenHinweis)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
  })

  it('behält unter /coins die Überschrift „Neuen Coin erfassen“', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })

    expect(await screen.findByRole('heading', { level: 2, name: 'Neuen Coin erfassen' })).toBeInTheDocument()
  })

  it('zeigt im Erfassen-Abschnitt einen Button „Anmelden“', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    const abschnitt = (await screen.findByText(TEXTE.anmeldenHinweis)).closest('section') as HTMLElement

    expect(within(abschnitt).getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('ruft /api/me nicht auf', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    await screen.findByText(TEXTE.anmeldenHinweis)

    expect(meAufrufe()).toBe(0)
  })

  it('sendet beim Laden der Liste keinen Authorization-Header', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    await screen.findByText(TEXTE.anmeldenHinweis)

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

    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeInTheDocument()
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

  it('startet die Anmeldung auch über den Button im Erfassen-Abschnitt', async () => {
    const { user, anmeldung } = zeigeApp('/coins', { zustand: 'anonym' })
    const abschnitt = (await screen.findByText(TEXTE.anmeldenHinweis)).closest('section') as HTMLElement

    await user.click(within(abschnitt).getByRole('button', { name: 'Anmelden' }))

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe('/coins')
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

    expect(await screen.findByText(TEXTE.keineBerechtigung)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
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

// ---------- AK-33: Formular nach Rolle ----------

describe('Formular „Neuen Coin erfassen“ nach Rolle', () => {
  it.each(['admin', 'sachbearbeiter'] as const)('zeigt %s das Formular', async (als) => {
    zeigeApp('/coins', { als })

    expect(await screen.findByRole('button', { name: 'Coin anlegen' })).toBeInTheDocument()
  })

  it.each(['betrachter', 'keine'] as const)('zeigt %s den Hinweis statt des Formulars', async (als) => {
    zeigeApp('/coins', { als })

    expect(await screen.findByText(TEXTE.keineBerechtigung)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
  })

  it('blendet das Formular aus, solange /api/me fehlschlägt', async () => {
    zeigeApp('/coins', { vorbereiten: () => api.einmal('GET', /^\/api\/me$/, problemAntwort(500)) })

    await screen.findByText(TEXTE.pruefungFehlgeschlagen)
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
    expect(screen.getByText('Noch keine Coins erfasst.')).toBeInTheDocument()
  })
})

// ---------- AK-27: Bearer-Header, 401, 403 ----------

describe('API-Aufrufe angemeldet', () => {
  it('sendet beim Anlegen Authorization: Bearer mit dem Access-Token', async () => {
    const { user } = zeigeApp('/coins')
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

  it('entfernt bei 401 auf das Anlegen den User und startet die Anmeldung mit Rückkehr auf /coins', async () => {
    const { user, anmeldung } = zeigeApp('/coins')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(401, { title: 'Nicht angemeldet' }))
    await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe('/coins')
    expect(anmeldung.hatUser()).toBe(false)
  })

  it('zeigt bei 403 auf das Anlegen „Sie sind nicht berechtigt, Coins zu erfassen.“', async () => {
    const { user, anmeldung } = zeigeApp('/coins')
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

    await user.click(screen.getByRole('link', { name: 'Coin-Liste' }))
    await screen.findByRole('heading', { level: 1, name: 'Coin-Katalog' })
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
    const { user, anmeldung } = zeigeApp('/coins')
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
    await screen.findByRole('button', { name: 'Coin anlegen' })

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
