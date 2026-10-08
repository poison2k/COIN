import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import {
  ME,
  erstelleTestAnmeldung,
  setzeBrowserUrl,
  testUser,
  type SitzungsZustand,
  type TestAnmeldung,
  type TestBenutzer,
} from '../../test/anmeldung'
import {
  erstelleFakeApi,
  jsonAntwort,
  problemAntwort,
  seiteAntwort,
  testCoin,
  testDatei,
  type FakeApi,
} from '../../test/fakeApi'
import { formularFelder, fuelleAus, meldungMit } from '../../test/hilfen'
import App from './App'
import { erstelleRouter, type AppRouter } from './router/router'

// Feature katalog-seiten im Zusammenspiel von App, Router, Guards, App-Shell und Seiten:
// AK-7 bis AK-11 (Routen, Schutz, „Kein Zugriff“ mit Grund keineBerechtigung), AK-13/AK-14 (Link, Suche und Seite in
// der URL), AK-17 bis AK-20 (Detailseite), AK-21 bis AK-24 (Anlegen und Weiterleitung), AK-25/AK-26 (Sidebar, Texte).

const TEXTE = {
  ohneBerechtigung:
    'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
  deaktiviert: 'Ihr Benutzerkonto ist deaktiviert.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
  angelegt: 'Coin wurde angelegt.',
  ohneBild: 'Coin wurde ohne Motivbild angelegt.',
  teilerfolg: 'Coin wurde angelegt, das Bild konnte nicht gespeichert werden:',
  konflikt: 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.',
  leer: 'Noch keine Coins erfasst.',
} as const

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Log ?in|Log ?out|Loading|Error|Unauthorized|Forbidden|Access denied|Not Found|Not found|Search|Previous|Next|Page|Add|New|Cancel|Back|Home|Catalog|Description|Publisher|Created|Image|Awards|Issues|Edit|Delete|Retry|Submit|Upload|Choose file)\b/

let api: FakeApi

interface Optionen {
  als?: TestBenutzer | 'deaktiviert'
  zustand?: SitzungsZustand
  ohneKonfiguration?: boolean
  coins?: Coin[]
  vorbereiten?: (anmeldung: TestAnmeldung) => void
  /** Eigener Router (z. B. mit Browser-History für „Neuladen“). */
  router?: AppRouter
}

function zeigeApp(
  pfad: string,
  { als = 'admin', zustand = 'angemeldet', ohneKonfiguration = false, coins = [], vorbereiten, router }: Optionen = {},
) {
  const me = als === 'deaktiviert' ? 'deaktiviert' : ME[als]
  api = erstelleFakeApi(coins, { me: zustand === 'anonym' ? null : me })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung = erstelleTestAnmeldung(zustand, als === 'deaktiviert' ? ME.admin.name : ME[als].name)
  vorbereiten?.(anmeldung)
  const user = userEvent.setup({ applyAccept: false })
  const aktiverRouter = router ?? erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  const ansicht = render(<App router={aktiverRouter} userManager={ohneKonfiguration ? null : anmeldung.userManager} />)
  return { user, router: aktiverRouter, anmeldung, ...ansicht }
}

function coinNr(nr: number, teil: Partial<Coin> = {}): Coin {
  return testCoin({
    id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, 'e')}`,
    name: `Katalogcoin ${String(nr).padStart(3, '0')}`,
    ...teil,
  })
}

const DREISSIG = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
const ALPHA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a1', name: 'Coin Alpha', auflage: 250 })

function kopfzeile(): HTMLElement {
  const header = document.querySelector('header')
  expect(header).not.toBeNull()
  return header as HTMLElement
}

async function angemeldetGeladen(): Promise<void> {
  await waitFor(() => expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument())
}

function seitenText(): string {
  return document.body.textContent?.replace(/\s+/g, ' ') ?? ''
}

function alleTexte(): string {
  const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
    ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  )
  return [document.body.textContent ?? '', ...attribute].join(' ')
}

function zielAus(anmeldung: TestAnmeldung): unknown {
  const args = anmeldung.signinRedirect.mock.calls.at(-1)?.[0] as { state?: { ziel?: unknown } } | undefined
  return args?.state?.ziel
}

function listenAbrufe() {
  return api.anfragenMit('GET', /^\/api\/coins$/)
}

/** Sidebar-Eintrag „Katalog“ (exakter Name; „Zum Katalog“ und „Zurück zum Katalog“ zählen nicht). */
function sidebarKatalog(): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('link', { name: 'Katalog' })
}

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
})

// ---------- AK-7, AK-9: /coins/neu ----------

describe('/coins/neu – Zugriff', () => {
  it.each(['admin', 'sachbearbeiter'] as const)(
    'zeigt %s die Seite „Coin hinzufügen“ mit dem Formular',
    async (als) => {
      zeigeApp('/coins/neu', { als })

      expect(await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Coin anlegen' })).toBeInTheDocument()
    },
  )

  it('ruft nie GET /api/coins/neu auf und zeigt nie die Detailseite', async () => {
    zeigeApp('/coins/neu')
    await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })

    expect(api.anfragen.filter((a) => a.methode === 'GET' && a.pfad.startsWith('/api/coins'))).toEqual([])
    expect(screen.queryByRole('heading', { name: 'Coin nicht gefunden' })).not.toBeInTheDocument()
  })

  it('leitet den Betrachter nach /kein-zugriff?grund=berechtigung', async () => {
    const { router } = zeigeApp('/coins/neu', { als: 'betrachter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.state.location.search).toEqual({ grund: 'berechtigung' })
  })

  it('zeigt dem Betrachter „Kein Zugriff“ mit dem Text für fehlende Berechtigung', async () => {
    zeigeApp('/coins/neu', { als: 'betrachter' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    await waitFor(() => expect(seitenText()).toContain(TEXTE.ohneBerechtigung))
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
  })

  it('ersetzt beim Weiterleiten des Betrachters den Verlaufseintrag (replace)', async () => {
    const { router } = zeigeApp('/coins/neu', { als: 'betrachter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.history.length).toBe(1)
  })

  it('sendet als Betrachter keinen POST /api/coins', async () => {
    zeigeApp('/coins/neu', { als: 'betrachter' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff mit dem Text für „keine Rolle“', async () => {
    const { router } = zeigeApp('/coins/neu', { als: 'keine' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.keineRolle))
    expect(seitenText()).not.toContain(TEXTE.ohneBerechtigung)
  })

  it('leitet Deaktivierte nach /kein-zugriff mit dem Deaktiviert-Text', async () => {
    const { router } = zeigeApp('/coins/neu', { als: 'deaktiviert' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.deaktiviert))
    expect(seitenText()).not.toContain(TEXTE.ohneBerechtigung)
  })

  it('startet anonym die Anmeldung mit Rückkehrziel /coins/neu', async () => {
    const { anmeldung } = zeigeApp('/coins/neu', { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe('/coins/neu')
  })

  it('zeigt anonym kein Formular', async () => {
    const { anmeldung } = zeigeApp('/coins/neu', { zustand: 'anonym' })
    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalled())

    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })

  it('leitet ohne konfigurierte Anmeldung zur Startseite', async () => {
    const { router } = zeigeApp('/coins/neu', { ohneKonfiguration: true })

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
  })

  it.each([
    ['admin', '/coins/neu', 'Coin hinzufügen'],
    ['betrachter', '/kein-zugriff', 'Kein Zugriff'],
  ] as const)(
    'prüft nach der Rückkehr von der Anmeldung als %s erneut (Ziel %s)',
    async (als, erwartet, ueberschrift) => {
      setzeBrowserUrl('/anmeldung/rueckruf?code=test-code&state=test-state')
      const { router } = zeigeApp('/anmeldung/rueckruf?code=test-code&state=test-state', {
        als,
        zustand: 'anonym',
        vorbereiten: (anmeldung) => {
          anmeldung.rueckrufLiefert(testUser({ name: ME[als].name, ziel: '/coins/neu' }))
          api.setzeMe(ME[als])
        },
      })

      await waitFor(() => expect(router.state.location.pathname).toBe(erwartet))
      expect(await screen.findByRole('heading', { level: 1, name: ueberschrift })).toBeInTheDocument()
    },
  )
})

// ---------- AK-10: /kein-zugriff?grund=berechtigung ----------

describe('/kein-zugriff?grund=berechtigung', () => {
  it('zeigt dem Betrachter „Kein Zugriff“ mit dem Text für fehlende Berechtigung', async () => {
    zeigeApp('/kein-zugriff?grund=berechtigung', { als: 'betrachter' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    await waitFor(() => expect(seitenText()).toContain(TEXTE.ohneBerechtigung))
  })

  it('bietet „Zum Coin-Katalog“ und „Abmelden“, aber kein „Erneut prüfen“', async () => {
    zeigeApp('/kein-zugriff?grund=berechtigung', { als: 'sachbearbeiter' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    const main = screen.getByRole('main')
    await waitFor(() => expect(within(main).getByRole('link', { name: 'Zum Coin-Katalog' })).toBeInTheDocument())
    expect(within(main).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    expect(within(main).queryByRole('button', { name: 'Erneut prüfen' })).not.toBeInTheDocument()
  })

  it('zeigt Benutzern ohne Rolle trotz Parameter den Text für „keine Rolle“', async () => {
    const { router } = zeigeApp('/kein-zugriff?grund=berechtigung', { als: 'keine' })

    await waitFor(() => expect(seitenText()).toContain(TEXTE.keineRolle))
    expect(seitenText()).not.toContain(TEXTE.ohneBerechtigung)
    expect(router.state.location.pathname).toBe('/kein-zugriff')
  })

  it('zeigt Deaktivierten trotz Parameter den Deaktiviert-Text', async () => {
    zeigeApp('/kein-zugriff?grund=berechtigung', { als: 'deaktiviert' })

    await waitFor(() => expect(seitenText()).toContain(TEXTE.deaktiviert))
    expect(seitenText()).not.toContain(TEXTE.ohneBerechtigung)
  })

  it('leitet Benutzer mit Rolle ohne Parameter weiterhin zur Startseite', async () => {
    const { router } = zeigeApp('/kein-zugriff', { als: 'betrachter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('ignoriert einen anderen Wert von grund (Weiterleitung zur Startseite)', async () => {
    const { router } = zeigeApp('/kein-zugriff?grund=anders', { als: 'betrachter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(seitenText()).not.toContain(TEXTE.ohneBerechtigung)
  })

  it('startet anonym die Anmeldung', async () => {
    const { anmeldung } = zeigeApp('/kein-zugriff?grund=berechtigung', { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
  })

  it('enthält keine englischen Texte und genau ein h1', async () => {
    zeigeApp('/kein-zugriff?grund=berechtigung', { als: 'betrachter' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })
    await waitFor(() => expect(seitenText()).toContain(TEXTE.ohneBerechtigung))

    expect(alleTexte()).not.toMatch(ENGLISCH)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

// ---------- AK-7, AK-8, AK-17 bis AK-20: Detailseite ----------

describe('/coins/{id}', () => {
  it('zeigt den Coin mit seinem Namen als Überschrift', async () => {
    zeigeApp(`/coins/${ALPHA.id}`, { coins: [ALPHA] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })).toBeInTheDocument()
    expect(api.anfragenMit('GET', /^\/api\/coins\//).map((a) => a.pfad)).toEqual([`/api/coins/${ALPHA.id}`])
  })

  it('zeigt für /coins/abc „Coin nicht gefunden“ ohne API-Aufruf', async () => {
    zeigeApp('/coins/abc', { coins: [ALPHA] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
    expect(api.anfragen.filter((a) => a.pfad.startsWith('/api/coins'))).toEqual([])
  })

  it('zeigt für eine unbekannte GUID „Coin nicht gefunden“', async () => {
    zeigeApp('/coins/0199a1b2-0000-7000-8000-0000000000ff', { coins: [ALPHA] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('ist anonym lesbar und zeigt den Abschnitt „Verleihungen“', async () => {
    const { anmeldung } = zeigeApp(`/coins/${ALPHA.id}`, { coins: [ALPHA], zustand: 'anonym' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Verleihungen' })).toBeInTheDocument()
    expect(anmeldung.signinRedirect).not.toHaveBeenCalled()
  })

  it('sendet anonym keinen weiteren Request für „Verleihungen“', async () => {
    zeigeApp(`/coins/${ALPHA.id}`, { coins: [ALPHA], zustand: 'anonym' })
    await screen.findByRole('heading', { level: 2, name: 'Verleihungen' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${ALPHA.id}`])
  })

  it('zeigt auch mit coins.write keine Bearbeiten-, Löschen- oder Upload-Elemente', async () => {
    zeigeApp(`/coins/${ALPHA.id}`, { coins: [ALPHA] })
    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    await angemeldetGeladen()

    const main = screen.getByRole('main')
    expect(main.querySelectorAll('form, input, textarea, select')).toHaveLength(0)
    const namen = [...within(main).queryAllByRole('button'), ...within(main).queryAllByRole('link')].map(
      (el) => el.textContent ?? '',
    )
    expect(namen.filter((n) => /bearbeiten|ändern|löschen|hochladen|Bild/i.test(n))).toEqual([])
  })

  it('führt über „Zurück zum Katalog“ zu /coins', async () => {
    const { user, router } = zeigeApp(`/coins/${ALPHA.id}`, { coins: [ALPHA] })

    await user.click(await screen.findByRole('link', { name: 'Zurück zum Katalog' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
  })

  it('öffnet die Detailseite per Klick auf den Namen in der Liste', async () => {
    const { user, router } = zeigeApp('/coins', { coins: [ALPHA] })

    await user.click(await screen.findByRole('link', { name: 'Coin Alpha' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ALPHA.id}`))
    expect(await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })).toBeInTheDocument()
  })
})

// ---------- AK-21 bis AK-24: Anlegen und Weiterleitung ----------

describe('Coin hinzufügen → Detailseite', () => {
  async function legeAn(user: ReturnType<typeof userEvent.setup>, bild?: File) {
    await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })
    await fuelleAus(user, { name: 'Coin Neu', herausgeber: 'Herausgeber Neu', bild })
    await user.click(formularFelder().absenden)
  }

  it('führt nach dem Anlegen zu /coins/{neue id}', async () => {
    const { user, router } = zeigeApp('/coins/neu')

    await legeAn(user)

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${api.coins[0].id}`))
  })

  it('zeigt auf der Detailseite „Coin wurde angelegt.“ als Status', async () => {
    const { user } = zeigeApp('/coins/neu')

    await legeAn(user)

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin Neu' })).toBeInTheDocument()
    await waitFor(() => expect(meldungMit(TEXTE.angelegt)?.getAttribute('role')).toBe('status'))
  })

  it('setzt den Fokus auf die Überschrift der Detailseite', async () => {
    const { user } = zeigeApp('/coins/neu')

    await legeAn(user)

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Coin Neu' })
    await waitFor(() => expect(h1).toHaveFocus())
    expect(h1).toHaveAttribute('tabindex', '-1')
  })

  it('zeigt auch nach dem Anlegen mit Bild „Coin wurde angelegt.“', async () => {
    const { user } = zeigeApp('/coins/neu')

    await legeAn(user, testDatei())

    await screen.findByRole('heading', { level: 1, name: 'Coin Neu' })
    await waitFor(() => expect(meldungMit(TEXTE.angelegt)).toBeDefined())
    expect(await screen.findByRole('img', { name: 'Motiv: Coin Neu' })).toBeInTheDocument()
  })

  it('führt mit „Zurück“ im Verlauf nicht zum ausgefüllten Formular', async () => {
    const { user, router } = zeigeApp('/coins')
    await user.click(await screen.findByRole('link', { name: 'Coin hinzufügen' }))
    await legeAn(user)
    await screen.findByRole('heading', { level: 1, name: 'Coin Neu' })

    router.history.back()

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
  })

  it('zeigt die Meldung nach einem erneuten Aufruf über den Katalog nicht wieder', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    await legeAn(user)
    await screen.findByRole('heading', { level: 1, name: 'Coin Neu' })
    await waitFor(() => expect(meldungMit(TEXTE.angelegt)).toBeDefined())

    await user.click(screen.getByRole('link', { name: 'Zurück zum Katalog' }))
    await user.click(await screen.findByRole('link', { name: 'Coin Neu' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${api.coins[0].id}`))
    await screen.findByRole('heading', { level: 1, name: 'Coin Neu' })
    expect(seitenText()).not.toContain(TEXTE.angelegt)
  })

  it('zeigt die Meldung nach dem Neuladen der Detailseite nicht wieder', async () => {
    setzeBrowserUrl('/coins/neu')
    const erste = zeigeApp('/coins/neu', { router: erstelleRouter() })
    await legeAn(erste.user)
    await screen.findByRole('heading', { level: 1, name: 'Coin Neu' })
    await waitFor(() => expect(meldungMit(TEXTE.angelegt)).toBeDefined())
    const coins = [...api.coins]
    const pfad = window.location.pathname
    erste.unmount()

    // Neuladen: neue App mit Browser-History auf derselben URL und demselben history.state.
    zeigeApp(pfad, { coins, router: erstelleRouter() })

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin Neu' })).toBeInTheDocument()
    await angemeldetGeladen()
    expect(seitenText()).not.toContain(TEXTE.angelegt)
  })

  it('bleibt beim Teilerfolg auf /coins/neu mit „Bild erneut hochladen“ und „Ohne Bild fortfahren“', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    api.einmal('PUT', /\/bild$/, problemAntwort(415))

    await legeAn(user, testDatei())

    await waitFor(() => expect(meldungMit(TEXTE.teilerfolg)).toBeDefined())
    expect(router.state.location.pathname).toBe('/coins/neu')
    expect(screen.getByRole('button', { name: 'Bild erneut hochladen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ohne Bild fortfahren' })).toBeInTheDocument()
  })

  it('führt über „Ohne Bild fortfahren“ zur Detailseite mit „Coin wurde ohne Motivbild angelegt.“', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    api.einmal('PUT', /\/bild$/, problemAntwort(415))
    await legeAn(user, testDatei())
    await screen.findByRole('button', { name: 'Ohne Bild fortfahren' })

    await user.click(screen.getByRole('button', { name: 'Ohne Bild fortfahren' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${api.coins[0].id}`))
    await waitFor(() => expect(meldungMit(TEXTE.ohneBild)?.getAttribute('role')).toBe('status'))
    expect(seitenText()).not.toContain(TEXTE.angelegt)
  })

  it('führt nach erfolgreichem „Bild erneut hochladen“ zur Detailseite mit „Coin wurde angelegt.“', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    api.netzwerkfehler('PUT', /\/bild$/)
    await legeAn(user, testDatei())

    await user.click(await screen.findByRole('button', { name: 'Bild erneut hochladen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${api.coins[0].id}`))
    await waitFor(() => expect(meldungMit(TEXTE.angelegt)).toBeDefined())
  })

  it('bleibt bei 409 auf /coins/neu, behält die Eingaben und sendet nur einen POST', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409))

    await legeAn(user)

    await waitFor(() => expect(meldungMit(TEXTE.konflikt)).toBeDefined())
    expect(router.state.location.pathname).toBe('/coins/neu')
    expect(formularFelder().name).toHaveValue('Coin Neu')
    expect(api.anfragenMit('POST')).toHaveLength(1)
  })

  it('bleibt bei 400 auf /coins/neu und zeigt den Feldfehler', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    api.einmal(
      'POST',
      /^\/api\/coins$/,
      problemAntwort(400, { title: 'Eingaben ungültig', errors: { name: ['Name ist zu lang.'] } }),
    )

    await legeAn(user)

    await waitFor(() => expect(formularFelder().name).toHaveAttribute('aria-invalid', 'true'))
    expect(router.state.location.pathname).toBe('/coins/neu')
  })

  it('führt über „Abbrechen“ zu /coins, ohne zu speichern', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })
    await fuelleAus(user, { name: 'Coin Neu', herausgeber: 'Herausgeber Neu' })

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('führt vom Katalog über „Coin hinzufügen“ zu /coins/neu', async () => {
    const { user, router } = zeigeApp('/coins')

    await user.click(await screen.findByRole('link', { name: 'Coin hinzufügen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins/neu'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeInTheDocument()
  })
})

// ---------- AK-14: Suche und Seite in der URL ----------

describe('Katalog: Suche und Seite in der URL', () => {
  it('schreibt die Suche in die URL und lädt mit dem Suchbegriff', async () => {
    const { user, router } = zeigeApp('/coins', { coins: [ALPHA, coinNr(1)] })
    await screen.findByRole('table', { name: 'Coins' })

    await user.type(screen.getByRole('searchbox', { name: 'Coins suchen' }), 'Alpha{Enter}')

    await waitFor(() => expect(router.state.location.search).toMatchObject({ suche: 'Alpha' }))
    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('suche')).toBe('Alpha'))
  })

  it('schreibt die Seite beim Blättern in die URL', async () => {
    const { user, router } = zeigeApp('/coins', { coins: DREISSIG })
    await screen.findByRole('table', { name: 'Coins' })

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    await waitFor(() => expect(router.state.location.search).toMatchObject({ seite: 2 }))
    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('seite')).toBe('2'))
  })

  it('lädt beim Aufruf mit Suche und Seite in der URL genau diese', async () => {
    zeigeApp('/coins?suche=Katalogcoin&seite=2', { coins: DREISSIG })

    await waitFor(() => expect(listenAbrufe().length).toBeGreaterThan(0))
    expect(listenAbrufe()[0].query.get('suche')).toBe('Katalogcoin')
    expect(listenAbrufe()[0].query.get('seite')).toBe('2')
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Coins suchen' })).toHaveValue('Katalogcoin'))
  })

  it('beginnt eine neue Suche auf Seite 1', async () => {
    const { user, router } = zeigeApp('/coins?seite=2', { coins: DREISSIG })
    await screen.findByRole('table', { name: 'Coins' })

    await user.type(screen.getByRole('searchbox', { name: 'Coins suchen' }), 'Katalogcoin{Enter}')

    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('suche')).toBe('Katalogcoin'))
    expect(listenAbrufe().at(-1)?.query.get('seite')).toBe('1')
    expect((router.state.location.search as { seite?: number }).seite ?? 1).toBe(1)
  })

  // 2147483648 = int.MaxValue + 1; die API (int) antwortet darauf mit 400.
  it.each(['0', '-3', 'abc', '1.5', '2147483648', '3000000000'])(
    'behandelt seite=%s in der URL als Seite 1 ohne 400',
    async (seite) => {
      zeigeApp(`/coins?seite=${seite}`, { coins: [ALPHA] })

      await screen.findByRole('table', { name: 'Coins' })
      expect(listenAbrufe().every((a) => a.query.get('seite') === '1')).toBe(true)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('kürzt eine Suche über 100 Zeichen aus der URL auf 100 Zeichen', async () => {
    zeigeApp(`/coins?suche=${'x'.repeat(150)}`, { coins: [ALPHA] })

    await waitFor(() => expect(listenAbrufe().length).toBeGreaterThan(0))
    expect(listenAbrufe().every((a) => (a.query.get('suche') ?? '').length <= 100)).toBe(true)
    expect(listenAbrufe()[0].query.get('suche')).toBe('x'.repeat(100))
  })

  it('stellt Suche und Seite beim „Zurück“ von der Detailseite wieder her', async () => {
    const { user, router } = zeigeApp('/coins?suche=Katalogcoin&seite=2', { coins: DREISSIG })
    await waitFor(() => expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument())

    await user.click(screen.getByRole('link', { name: 'Katalogcoin 026' }))
    await screen.findByRole('heading', { level: 1, name: 'Katalogcoin 026' })
    router.history.back()

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(router.state.location.search).toMatchObject({ suche: 'Katalogcoin', seite: 2 })
    await waitFor(() => expect(screen.getByText('Seite 2 von 2')).toBeInTheDocument())
    expect(screen.getByRole('searchbox', { name: 'Coins suchen' })).toHaveValue('Katalogcoin')
  })
})

// ---------- QA Runde 2 (H4): Suche nach einem Ladefehler auf Seite 2 ----------

describe('Katalog: Suche nach einem Ladefehler auf Seite 2', () => {
  it('lädt nach einer neuen Suche nur Seite 1, ohne erneuten Request für Seite 2', async () => {
    const { user } = zeigeApp('/coins?seite=2', {
      coins: DREISSIG,
      vorbereiten: () => api.einmal('GET', /^\/api\/coins$/, problemAntwort(500)),
    })
    await screen.findByRole('alert')
    const vorher = listenAbrufe().length

    await user.type(screen.getByRole('searchbox', { name: 'Coins suchen' }), 'Katalogcoin{Enter}')

    await screen.findByRole('table', { name: 'Coins' })
    expect(
      listenAbrufe()
        .slice(vorher)
        .map((a) => a.query.get('seite')),
    ).toEqual(['1'])
  })

  it('lädt nach erneuter Suche mit demselben Begriff nur Seite 1, ohne erneuten Request für Seite 2', async () => {
    const { user } = zeigeApp('/coins?suche=Katalogcoin&seite=2', {
      coins: DREISSIG,
      vorbereiten: () => api.einmal('GET', /^\/api\/coins$/, problemAntwort(500)),
    })
    await screen.findByRole('alert')
    const vorher = listenAbrufe().length

    await user.click(screen.getByRole('button', { name: 'Suchen' }))

    await screen.findByRole('table', { name: 'Coins' })
    expect(
      listenAbrufe()
        .slice(vorher)
        .map((a) => a.query.get('seite')),
    ).toEqual(['1'])
  })
})

// ---------- AK-13: Link „Coin hinzufügen“ im Katalog ----------

describe('Katalog: Link „Coin hinzufügen“', () => {
  it.each(['admin', 'sachbearbeiter'] as const)('erscheint für %s', async (als) => {
    zeigeApp('/coins', { als })

    expect(await screen.findByRole('link', { name: 'Coin hinzufügen' })).toHaveAttribute('href', '/coins/neu')
  })

  it.each(['betrachter', 'keine', 'deaktiviert'] as const)('fehlt für %s', async (als) => {
    zeigeApp('/coins', { als })
    await angemeldetGeladen()
    await screen.findByText(TEXTE.leer)

    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })

  it('fehlt anonym', async () => {
    zeigeApp('/coins', { zustand: 'anonym' })
    await screen.findByText(TEXTE.leer)

    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })

  it('enthält unter /coins kein Formular außer der Suche', async () => {
    zeigeApp('/coins', { coins: [ALPHA] })
    await screen.findByRole('link', { name: 'Coin hinzufügen' })

    const main = screen.getByRole('main')
    expect(main.querySelectorAll('form')).toHaveLength(1)
    expect([...main.querySelectorAll('input, textarea, select')]).toEqual([
      screen.getByRole('searchbox', { name: 'Coins suchen' }),
    ])
  })
})

// ---------- AK-25: Navigation ----------

describe('Sidebar „Katalog“', () => {
  it('verweist auf /coins', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(sidebarKatalog()).toHaveAttribute('href', '/coins')
  })

  it('trägt aria-current="page" auf /coins', async () => {
    zeigeApp('/coins')
    await screen.findByRole('heading', { level: 1, name: 'Katalog' })

    expect(sidebarKatalog()).toHaveAttribute('aria-current', 'page')
    expect(sidebarKatalog()).toHaveAttribute('data-active')
  })

  it.each([
    ['/coins/neu', 'Coin hinzufügen'],
    [`/coins/${ALPHA.id}`, 'Coin Alpha'],
  ])('ist auf %s als aktiv markiert, ohne aria-current', async (pfad, ueberschrift) => {
    zeigeApp(pfad, { coins: [ALPHA] })
    await screen.findByRole('heading', { level: 1, name: ueberschrift })

    expect(sidebarKatalog()).toHaveAttribute('data-active')
    expect(sidebarKatalog()).not.toHaveAttribute('aria-current')
  })

  it('ist auf der Startseite nicht aktiv', async () => {
    zeigeApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })

    expect(sidebarKatalog()).not.toHaveAttribute('data-active')
  })

  it('hat keinen eigenen Eintrag „Coin hinzufügen“', async () => {
    zeigeApp('/coins/neu')
    await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })

    const navigation = screen.getByRole('navigation', { name: 'Hauptnavigation' })
    expect(within(navigation).queryByRole('link', { name: /Coin hinzufügen/ })).not.toBeInTheDocument()
  })

  it('benennt den Link auf der Startseite „Zum Katalog“', async () => {
    zeigeApp('/')

    expect(await screen.findByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })
})

// ---------- AK-26: Barrierefreiheit und deutsche Texte ----------

describe('Barrierefreiheit und deutsche Texte', () => {
  it.each([
    ['/coins', 'Katalog'],
    ['/coins/neu', 'Coin hinzufügen'],
    [`/coins/${ALPHA.id}`, 'Coin Alpha'],
  ])('%s hat genau ein h1 und keine englischen Texte', async (pfad, ueberschrift) => {
    zeigeApp(pfad, { coins: DREISSIG.concat(ALPHA) })
    await screen.findByRole('heading', { level: 1, name: ueberschrift })
    await angemeldetGeladen()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('/coins/abc (nicht gefunden) hat genau ein h1 und keine englischen Texte', async () => {
    zeigeApp('/coins/abc')
    await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('erreicht im Katalog „Coin hinzufügen“, Suche, „Suchen“, Namens-Link und Blättern per Tab in dieser Reihenfolge', async () => {
    // Wenige Einträge, aber gesamt > 25: „Nächste Seite“ ist aktiv, ohne durch 25 Namens-Links tabben zu müssen.
    const { user } = zeigeApp('/coins', {
      coins: DREISSIG,
      vorbereiten: () => {
        for (let i = 0; i < 3; i++) {
          api.einmal('GET', /^\/api\/coins$/, () =>
            jsonAntwort(200, seiteAntwort(DREISSIG.slice(0, 2), { gesamt: 30 })),
          )
        }
      },
    })
    await screen.findByRole('table', { name: 'Coins' })
    await screen.findByRole('link', { name: 'Coin hinzufügen' })
    const ziele = [
      screen.getByRole('link', { name: 'Coin hinzufügen' }),
      screen.getByRole('searchbox', { name: 'Coins suchen' }),
      screen.getByRole('button', { name: 'Suchen' }),
      screen.getByRole('link', { name: 'Katalogcoin 001' }),
      screen.getByRole('button', { name: 'Nächste Seite' }),
    ]

    const reihenfolge: number[] = []
    for (let i = 0; i < 30 && reihenfolge.length < ziele.length; i++) {
      await user.tab()
      const index = ziele.findIndex((z) => z === document.activeElement)
      if (index >= 0 && !reihenfolge.includes(index)) reihenfolge.push(index)
    }

    expect(reihenfolge).toEqual([0, 1, 2, 3, 4])
  })

  it('erreicht auf /coins/neu das Formular und „Abbrechen“ per Tab', async () => {
    const { user } = zeigeApp('/coins/neu')
    await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })
    const abbrechen = screen.getByRole('link', { name: 'Abbrechen' })

    let erreicht = false
    for (let i = 0; i < 60 && !erreicht; i++) {
      await user.tab()
      erreicht = document.activeElement === abbrechen
    }

    expect(erreicht).toBe(true)
  })

  it('erreicht auf der Detailseite „Zurück zum Katalog“ per Tab', async () => {
    const { user } = zeigeApp(`/coins/${ALPHA.id}`, { coins: [ALPHA] })
    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    const zurueck = screen.getByRole('link', { name: 'Zurück zum Katalog' })

    let erreicht = false
    for (let i = 0; i < 40 && !erreicht; i++) {
      await user.tab()
      erreicht = document.activeElement === zurueck
    }

    expect(erreicht).toBe(true)
  })

  it('verwendet den Begriff „Ausgaben“ auf der Detailseite nicht', async () => {
    zeigeApp(`/coins/${ALPHA.id}`, { coins: [ALPHA] })
    await screen.findByRole('heading', { level: 2, name: 'Verleihungen' })

    expect(alleTexte()).not.toMatch(/Ausgabe/i)
  })
})
