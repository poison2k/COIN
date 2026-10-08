import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Benutzer } from '@/entities/benutzer'
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
  keinZugriffAntwort,
  testAuditEintrag,
  testBenutzerEintrag,
  testCoin,
  type FakeApi,
} from '../../test/fakeApi'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature rollen-benutzerverwaltung, AK-24, AK-25, AK-29, AK-32, AK-33, AK-35: Benutzerverwaltung und deaktivierte
// Benutzer im Zusammenspiel von App, Router, App-Shell und Seiten. Sichtbarkeit nur über berechtigungen.

const TEXTE = {
  deaktiviert:
    'Ihr Benutzerkonto ist deaktiviert. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
  /** katalog-seiten, AK-10: „Kein Zugriff“ für Benutzer mit Rolle ohne die Berechtigung der Seite. */
  ohneBerechtigung:
    'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
} as const

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Log ?in|Log ?out|Logout|Login|Loading|Error|Unauthorized|Forbidden|Access denied|Disabled|Deactivated|Deactivate|Reactivate|Users?|User management|Search|Previous|Next|Page|Role|Cancel|Confirm|Close|Select|Active|Inactive|No entries|Welcome|Retry|Back|Home|Not Found)\b/

let api: FakeApi

interface Optionen {
  /** Testbenutzer, eigener Benutzer oder 'deaktiviert' (403 benutzer_deaktiviert auf /api/me). */
  als?: TestBenutzer | Benutzer | 'deaktiviert'
  zustand?: SitzungsZustand
  vorbereiten?: (anmeldung: TestAnmeldung) => void
}

/** Benutzerliste der Verwaltung: der Admin selbst und zwei weitere (synthetisch). */
const VERWALTETE = [
  testBenutzerEintrag({ id: ME.admin.id, name: ME.admin.name, email: ME.admin.email, rolle: 'Administrator' }),
  testBenutzerEintrag({
    id: '0199a1b2-0000-7000-8000-00000000b001',
    name: 'Anna Probe',
    email: 'anna@test.local',
    rolle: 'keine',
  }),
]

function meVon(als: Optionen['als']): Benutzer | 'deaktiviert' {
  if (als === undefined) return ME.admin
  return typeof als === 'string' ? (als === 'deaktiviert' ? 'deaktiviert' : ME[als]) : als
}

function zeigeApp(pfad: string, { als, zustand = 'angemeldet', vorbereiten }: Optionen = {}) {
  const me = meVon(als)
  api = erstelleFakeApi([testCoin()], {
    me: zustand === 'anonym' ? null : me,
    benutzer: VERWALTETE,
    audit: [testAuditEintrag({ akteur: null, alt: 'keine', neu: 'Administrator' })],
  })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung = erstelleTestAnmeldung(zustand, me === 'deaktiviert' ? 'Test Administrator' : me.name)
  vorbereiten?.(anmeldung)
  const user = userEvent.setup()
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router, anmeldung }
}

function kopfzeile(): HTMLElement {
  const header = document.querySelector('header')
  expect(header).not.toBeNull()
  return header as HTMLElement
}

/** Wartet, bis /api/me beantwortet ist und die Kopfzeile „Abmelden“ zeigt. */
async function angemeldetGeladen(): Promise<void> {
  await waitFor(() => expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument())
}

function sidebarEintrag(): HTMLElement | null {
  return screen.queryByRole('link', { name: 'Benutzerverwaltung' })
}

function meAufrufe(): number {
  return api.anfragenMit('GET', /^\/api\/me$/).length
}

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

// ---------- AK-24: Sidebar ----------

describe('Sidebar-Eintrag „Benutzerverwaltung“', () => {
  it('erscheint mit users.manage und verweist auf /benutzerverwaltung', async () => {
    zeigeApp('/')

    expect(await screen.findByRole('link', { name: 'Benutzerverwaltung' })).toHaveAttribute(
      'href',
      '/benutzerverwaltung',
    )
  })

  it('blendet das Symbol für Screenreader aus', async () => {
    zeigeApp('/')

    const link = await screen.findByRole('link', { name: 'Benutzerverwaltung' })
    const symbol = link.querySelector('svg')
    expect(symbol).not.toBeNull()
    expect(symbol).toHaveAttribute('aria-hidden', 'true')
  })

  it.each(['betrachter', 'sachbearbeiter', 'keine'] as const)('fehlt für %s im DOM', async (als) => {
    zeigeApp('/', { als })
    await angemeldetGeladen()

    expect(sidebarEintrag()).not.toBeInTheDocument()
  })

  it('fehlt für deaktivierte Benutzer im DOM', async () => {
    zeigeApp('/', { als: 'deaktiviert' })
    await angemeldetGeladen()

    expect(sidebarEintrag()).not.toBeInTheDocument()
  })

  it('fehlt anonym im DOM', async () => {
    zeigeApp('/', { zustand: 'anonym' })
    await waitFor(() => expect(within(kopfzeile()).getByRole('button', { name: 'Anmelden' })).toBeInTheDocument())

    expect(sidebarEintrag()).not.toBeInTheDocument()
  })

  it('richtet sich nach berechtigungen und nicht nach dem Rollennamen', async () => {
    zeigeApp('/', { als: { ...ME.admin, berechtigungen: ['audit.read', 'coins.read', 'coins.write'] } })
    await angemeldetGeladen()

    expect(sidebarEintrag()).not.toBeInTheDocument()
  })

  it('führt per Klick zur Benutzerverwaltung', async () => {
    const { user, router } = zeigeApp('/')

    await user.click(await screen.findByRole('link', { name: 'Benutzerverwaltung' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/benutzerverwaltung')
  })

  it('markiert auf /benutzerverwaltung den Eintrag als aktiv', async () => {
    zeigeApp('/benutzerverwaltung')

    const link = await screen.findByRole('link', { name: 'Benutzerverwaltung' })
    await waitFor(() => expect(link).toHaveAttribute('aria-current', 'page'))
  })
})

// ---------- AK-25, AK-29: Route /benutzerverwaltung ----------

describe('/benutzerverwaltung', () => {
  it('zeigt dem Administrator die Seite in der App-Shell', async () => {
    zeigeApp('/benutzerverwaltung')

    expect(await screen.findByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('zeigt dem Administrator die Benutzerliste', async () => {
    zeigeApp('/benutzerverwaltung')

    const tabelle = await screen.findByRole('table', { name: 'Benutzer' })
    expect(within(tabelle).getByText('Anna Probe')).toBeInTheDocument()
  })

  it('sperrt die eigene Zeile des angemeldeten Administrators (Id aus /api/me)', async () => {
    zeigeApp('/benutzerverwaltung')
    await screen.findByRole('table', { name: 'Benutzer' })

    expect(screen.getByRole('combobox', { name: 'Rolle von Test Administrator' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Rolle von Anna Probe' })).toBeEnabled()
  })

  // katalog-seiten, AK-11 (Entscheidung F1): bisher Weiterleitung zur Startseite.
  it.each(['betrachter', 'sachbearbeiter'] as const)('leitet %s nach /kein-zugriff?grund=berechtigung', async (als) => {
    const { router } = zeigeApp('/benutzerverwaltung', { als })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.state.location.search).toEqual({ grund: 'berechtigung' })
    expect(screen.queryByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).not.toBeInTheDocument()
  })

  it.each(['betrachter', 'sachbearbeiter'] as const)('zeigt %s „Kein Zugriff“ mit dem Text aus AK-10', async (als) => {
    zeigeApp('/benutzerverwaltung', { als })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    await waitFor(() => expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(TEXTE.ohneBerechtigung))
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Erneut prüfen' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Zum Coin-Katalog' })).toHaveAttribute(
      'href',
      '/coins',
    )
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('ersetzt beim Weiterleiten den Eintrag /benutzerverwaltung im Verlauf (replace)', async () => {
    const { router } = zeigeApp('/benutzerverwaltung', { als: 'betrachter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.history.length).toBe(1)
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff', async () => {
    const { router } = zeigeApp('/benutzerverwaltung', { als: 'keine' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
  })

  it('leitet deaktivierte Benutzer nach /kein-zugriff', async () => {
    const { router } = zeigeApp('/benutzerverwaltung', { als: 'deaktiviert' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
  })

  it('startet anonym die Anmeldung mit Rückkehrziel /benutzerverwaltung', async () => {
    const { anmeldung } = zeigeApp('/benutzerverwaltung', { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalled())
    const args = anmeldung.signinRedirect.mock.calls.at(-1)?.[0] as { state?: { ziel?: unknown } } | undefined
    expect(args?.state?.ziel).toBe('/benutzerverwaltung')
  })

  it.each(['betrachter', 'sachbearbeiter', 'keine'] as const)(
    'lädt für %s keine Benutzerliste und kein Audit-Log',
    async (als) => {
      const { router } = zeigeApp('/benutzerverwaltung', { als })

      await waitFor(() => expect(router.state.location.pathname).not.toBe('/benutzerverwaltung'))
      expect(api.anfragenMit('GET', /^\/api\/(benutzer|audit)$/)).toHaveLength(0)
    },
  )

  it('lädt anonym keine Benutzerliste', async () => {
    const { anmeldung } = zeigeApp('/benutzerverwaltung', { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalled())
    expect(api.anfragenMit('GET', /^\/api\/benutzer$/)).toHaveLength(0)
  })
})

// ---------- AK-32: deaktiviert ----------

describe('deaktivierter Benutzer', () => {
  it('zeigt in der Kopfzeile „Abmelden“', async () => {
    zeigeApp('/', { als: 'deaktiviert' })

    await angemeldetGeladen()
  })

  it('zeigt in der Kopfzeile keinen Namen', async () => {
    zeigeApp('/', { als: 'deaktiviert' })
    await angemeldetGeladen()

    expect(kopfzeile()).not.toHaveTextContent('Angemeldet als')
    expect(kopfzeile()).not.toHaveTextContent('Test Administrator')
  })

  it('zeigt in der Kopfzeile weder „Anmelden“ noch die Prüf-Fehlermeldung', async () => {
    zeigeApp('/', { als: 'deaktiviert' })
    await angemeldetGeladen()

    expect(within(kopfzeile()).queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
    expect(kopfzeile()).not.toHaveTextContent('Ihre Anmeldung konnte nicht geprüft werden.')
  })

  it('behält die Sitzung (kein Verwerfen wie bei 401)', async () => {
    const { anmeldung } = zeigeApp('/', { als: 'deaktiviert' })
    await angemeldetGeladen()

    expect(anmeldung.hatUser()).toBe(true)
    expect(anmeldung.signinRedirect).not.toHaveBeenCalled()
  })

  it('zeigt unter /kein-zugriff das h1 „Kein Zugriff“ mit dem Deaktiviert-Text', async () => {
    zeigeApp('/kein-zugriff', { als: 'deaktiviert' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    await waitFor(() => expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(TEXTE.deaktiviert))
  })

  it('zeigt unter /kein-zugriff nicht den Text für Benutzer ohne Rolle', async () => {
    zeigeApp('/kein-zugriff', { als: 'deaktiviert' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(document.body.textContent).not.toContain(TEXTE.keineRolle)
  })

  it('bietet unter /kein-zugriff „Zum Coin-Katalog“ und „Abmelden“ im Seiteninhalt', async () => {
    zeigeApp('/kein-zugriff', { als: 'deaktiviert' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: 'Zum Coin-Katalog' })).toHaveAttribute('href', '/coins')
    expect(within(main).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('kann den Katalog unter /coins weiterhin lesen', async () => {
    zeigeApp('/coins', { als: 'deaktiviert' })
    await angemeldetGeladen()

    expect(await screen.findByText('Coin Alpha')).toBeInTheDocument()
  })

  it('sieht unter /coins kein Formular „Coin anlegen“ und keinen Link „Coin hinzufügen“', async () => {
    zeigeApp('/coins', { als: 'deaktiviert' })
    await angemeldetGeladen()
    await screen.findByText('Coin Alpha')

    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })

  it('wird nach dem Rückruf nach /kein-zugriff geleitet', async () => {
    setzeBrowserUrl('/anmeldung/rueckruf?code=test-code&state=test-state')
    const { router } = zeigeApp('/anmeldung/rueckruf?code=test-code&state=test-state', {
      zustand: 'anonym',
      vorbereiten: (anmeldung) => {
        anmeldung.rueckrufLiefert(testUser({ name: 'Test Administrator', ziel: '/coins' }))
        api.setzeMe('deaktiviert')
      },
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
  })

  it('lädt /api/me neu, wenn ein anderer Aufruf mit 403 benutzer_deaktiviert antwortet', async () => {
    zeigeApp('/benutzerverwaltung', {
      vorbereiten: () =>
        api.einmal('GET', /^\/api\/benutzer$/, () => {
          api.setzeMe('deaktiviert')
          return keinZugriffAntwort('benutzer_deaktiviert')
        }),
    })

    await waitFor(() => expect(meAufrufe()).toBe(2))
  })

  it('wechselt nach 403 benutzer_deaktiviert während der Sitzung in den Zustand deaktiviert', async () => {
    zeigeApp('/benutzerverwaltung', {
      vorbereiten: () =>
        api.einmal('GET', /^\/api\/benutzer$/, () => {
          api.setzeMe('deaktiviert')
          return keinZugriffAntwort('benutzer_deaktiviert')
        }),
    })
    await waitFor(() => expect(meAufrufe()).toBe(2))

    await waitFor(() => expect(kopfzeile()).not.toHaveTextContent('Test Administrator'))
    expect(within(kopfzeile()).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    expect(sidebarEintrag()).not.toBeInTheDocument()
  })

  it('zeigt nach 403 benutzer_deaktiviert während der Sitzung /kein-zugriff mit dem Deaktiviert-Text', async () => {
    const { router } = zeigeApp('/benutzerverwaltung', {
      vorbereiten: () =>
        api.einmal('GET', /^\/api\/benutzer$/, () => {
          api.setzeMe('deaktiviert')
          return keinZugriffAntwort('benutzer_deaktiviert')
        }),
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    await waitFor(() => expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(TEXTE.deaktiviert))
  })

  it('lädt /api/me bei 403 keine_berechtigung nicht neu', async () => {
    zeigeApp('/benutzerverwaltung', {
      vorbereiten: () => api.einmal('GET', /^\/api\/benutzer$/, keinZugriffAntwort('keine_berechtigung')),
    })
    await screen.findByText('Benutzer konnten nicht geladen werden. Bitte später erneut versuchen.')

    expect(meAufrufe()).toBe(1)
  })
})

// ---------- AK-33, seit katalog-seiten AK-13: „Coin hinzufügen“ aus berechtigungen ----------

describe('Coin hinzufügen nach Berechtigung', () => {
  it('zeigt den Link bei coins.write, auch wenn die Rolle Betrachter heißt', async () => {
    zeigeApp('/coins', { als: { ...ME.betrachter, berechtigungen: ['coins.read', 'coins.write'] } })

    expect(await screen.findByRole('link', { name: 'Coin hinzufügen' })).toHaveAttribute('href', '/coins/neu')
  })

  it('zeigt den Link ohne coins.write nicht, auch wenn die Rolle Administrator heißt', async () => {
    zeigeApp('/coins', { als: { ...ME.admin, berechtigungen: ['coins.read'] } })
    await angemeldetGeladen()
    await screen.findByText('Coin Alpha')

    expect(screen.queryByRole('link', { name: 'Coin hinzufügen' })).not.toBeInTheDocument()
  })

  it('zeigt das Formular auf /coins/neu bei coins.write, auch wenn die Rolle Betrachter heißt', async () => {
    zeigeApp('/coins/neu', { als: { ...ME.betrachter, berechtigungen: ['coins.read', 'coins.write'] } })

    expect(await screen.findByRole('button', { name: 'Coin anlegen' })).toBeInTheDocument()
  })

  it('leitet von /coins/neu ohne coins.write auf „Kein Zugriff“, auch wenn die Rolle Administrator heißt', async () => {
    const { router } = zeigeApp('/coins/neu', { als: { ...ME.admin, berechtigungen: ['coins.read', 'users.manage'] } })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
  })
})

// ---------- AK-35: deutsche Texte ----------

describe('deutsche Texte', () => {
  it('Tab „Benutzer“ ohne englische Texte und mit genau einem h1', async () => {
    zeigeApp('/benutzerverwaltung')
    await screen.findByRole('table', { name: 'Benutzer' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('Tab „Audit-Log“ ohne englische Texte', async () => {
    const { user } = zeigeApp('/benutzerverwaltung')
    await screen.findByRole('table', { name: 'Benutzer' })

    await user.click(screen.getByRole('tab', { name: 'Audit-Log' }))
    await screen.findByRole('table', { name: 'Audit-Log' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('Dialog „Rolle ändern?“ ohne englische Texte', async () => {
    const { user } = zeigeApp('/benutzerverwaltung')
    await screen.findByRole('table', { name: 'Benutzer' })

    await user.click(screen.getByRole('combobox', { name: 'Rolle von Anna Probe' }))
    await user.click(await screen.findByRole('option', { name: 'Betrachter' }))
    await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('Dialog „Benutzer deaktivieren?“ ohne englische Texte', async () => {
    const { user } = zeigeApp('/benutzerverwaltung')
    await screen.findByRole('table', { name: 'Benutzer' })

    await user.click(screen.getByRole('button', { name: 'Anna Probe deaktivieren' }))
    await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('/kein-zugriff?grund=berechtigung ohne englische Texte und mit genau einem h1 (katalog-seiten, AK-26)', async () => {
    zeigeApp('/benutzerverwaltung', { als: 'betrachter' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })
    await waitFor(() => expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(TEXTE.ohneBerechtigung))

    expect(alleTexte()).not.toMatch(ENGLISCH)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('/kein-zugriff für Deaktivierte ohne englische Texte und mit genau einem h1', async () => {
    zeigeApp('/kein-zugriff', { als: 'deaktiviert' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
