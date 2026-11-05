import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import type { Benutzer } from '@/entities/benutzer'
import { ME, erstelleTestAnmeldung, type TestAnmeldung, type TestBenutzer } from '../../test/anmeldung'
import { erstelleFakeApi, testAusgabe, testCoin, type FakeApi } from '../../test/fakeApi'
import { gibEin, meldungMit } from '../../test/hilfen'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature hologrammnummer im Zusammenspiel von App, Router, Guards, Sidebar und Seiten: AK-27 (Button auf der Seite
// „Ausgabe“ nur mit issues.write und ohne Storno, Statusmeldung nach dem Speichern), AK-28 (Route /pruefung mit
// coins.read, Sidebar-Eintrag „Zertifikat prüfen“ nach „Katalog“ nur aus `berechtigungen`), AK-31 (Endpunkt je
// issues.read), AK-33 (deutsche Texte, genau ein h1).

const TEXTE = {
  deaktiviert: 'Ihr Benutzerkonto ist deaktiviert.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
  gespeichert: 'Hologrammnummer gespeichert.',
} as const

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Loading|Error|Unauthorized|Forbidden|Not Found|Not found|Back|Certificate|Check|Verify|Search|Select|Clear|No results|Submit|Recipient|Reason|Valid|Invalid)\b/

const ALPHA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a1', name: 'Coin Alpha', auflage: 150 })
const OHNE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const MIT_ID = '0199a1b2-0000-7000-8000-0000000000e8'
const STORNO_ID = '0199a1b2-0000-7000-8000-0000000000e9'
const AUSGABEN: Ausgabe[] = [
  testAusgabe({ id: OHNE_ID, exemplarNummer: 12, hologrammnummer: null }),
  testAusgabe({ id: MIT_ID, exemplarNummer: 13, hologrammnummer: 'AB 12-43' }),
  testAusgabe({
    id: STORNO_ID,
    exemplarNummer: 14,
    hologrammnummer: 'CD 56-78',
    storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Test Storno' },
  }),
]
const seite = (ausgabeId: string) => `/coins/${ALPHA.id}/ausgaben/${ausgabeId}`

let api: FakeApi

function zeigeApp(pfad: string, als: TestBenutzer | Benutzer | 'deaktiviert' | 'anonym' = 'sachbearbeiter') {
  const me = als === 'deaktiviert' ? 'deaktiviert' : als === 'anonym' ? null : typeof als === 'string' ? ME[als] : als
  api = erstelleFakeApi([ALPHA], { me, ausgaben: { [ALPHA.id]: AUSGABEN.map((a) => structuredClone(a)) } })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung: TestAnmeldung = erstelleTestAnmeldung(
    als === 'anonym' ? 'anonym' : 'angemeldet',
    me === null || me === 'deaktiviert' ? ME.admin.name : me.name,
  )
  const user = userEvent.setup()
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router, anmeldung }
}

function navigation(): Promise<HTMLElement> {
  return screen.findByRole('navigation', { name: 'Hauptnavigation' })
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

const pruefSeite = () => screen.findByRole('heading', { level: 1, name: 'Zertifikat prüfen' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------- AK-28: Route /pruefung ----------

describe('/pruefung – Zugriff', () => {
  it.each(['admin', 'sachbearbeiter', 'betrachter'] as const)('zeigt %s die Seite „Zertifikat prüfen“', async (als) => {
    zeigeApp('/pruefung', als)

    expect(await pruefSeite()).toBeInTheDocument()
  })

  it('startet anonym die Anmeldung mit Rückkehrziel /pruefung', async () => {
    const { anmeldung } = zeigeApp('/pruefung', 'anonym')

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe('/pruefung')
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff mit dem Text für „keine Rolle“', async () => {
    const { router } = zeigeApp('/pruefung', 'keine')

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.keineRolle))
  })

  it('leitet Deaktivierte nach /kein-zugriff mit dem Deaktiviert-Text', async () => {
    const { router } = zeigeApp('/pruefung', 'deaktiviert')

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.deaktiviert))
  })

  it('sendet ohne Zugriff keine Prüfung', async () => {
    const { router } = zeigeApp('/pruefung', 'keine')
    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))

    expect(api.anfragen.filter((a) => a.pfad.startsWith('/api/pruefung'))).toEqual([])
  })

  it('hat genau ein h1 und keine englischen Texte', async () => {
    zeigeApp('/pruefung', 'betrachter')
    await pruefSeite()
    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/me$/).length).toBeGreaterThan(0))

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})

// ---------- AK-28: Sidebar ----------

describe('Sidebar-Eintrag „Zertifikat prüfen“', () => {
  it.each(['admin', 'sachbearbeiter', 'betrachter'] as const)(
    'ist für %s sichtbar und führt auf /pruefung',
    async (als) => {
      zeigeApp('/', als)

      expect(await within(await navigation()).findByRole('link', { name: 'Zertifikat prüfen' })).toHaveAttribute(
        'href',
        '/pruefung',
      )
    },
  )

  it('steht direkt nach „Katalog“', async () => {
    zeigeApp('/', 'betrachter')
    await within(await navigation()).findByRole('link', { name: 'Zertifikat prüfen' })

    const namen = within(await navigation())
      .getAllByRole('link')
      .map((l) => l.textContent?.trim())
    expect(namen.indexOf('Zertifikat prüfen')).toBe(namen.indexOf('Katalog') + 1)
  })

  it('blendet das Icon für Screenreader aus', async () => {
    zeigeApp('/', 'betrachter')

    const link = await within(await navigation()).findByRole('link', { name: 'Zertifikat prüfen' })
    const icons = link.querySelectorAll('svg')
    expect(icons.length).toBeGreaterThan(0)
    for (const svg of icons) expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it.each(['keine', 'deaktiviert', 'anonym'] as const)('ist für %s nicht sichtbar', async (als) => {
    zeigeApp('/', als)
    await within(await navigation()).findByRole('link', { name: 'Katalog' })
    if (als !== 'anonym') await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/me$/).length).toBeGreaterThan(0))

    expect(within(await navigation()).queryByRole('link', { name: 'Zertifikat prüfen' })).not.toBeInTheDocument()
  })

  it('leitet die Sichtbarkeit nur aus berechtigungen ab (Betrachter ohne coins.read sieht den Eintrag nicht)', async () => {
    zeigeApp('/', { ...ME.betrachter, berechtigungen: [] } as Benutzer)
    await within(await navigation()).findByRole('link', { name: 'Katalog' })
    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/me$/).length).toBeGreaterThan(0))

    expect(within(await navigation()).queryByRole('link', { name: 'Zertifikat prüfen' })).not.toBeInTheDocument()
  })

  it('führt per Klick zur Seite „Zertifikat prüfen“', async () => {
    const { user, router } = zeigeApp('/', 'betrachter')

    await user.click(await within(await navigation()).findByRole('link', { name: 'Zertifikat prüfen' }))

    expect(await pruefSeite()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pruefung')
  })
})

// ---------- AK-31: Endpunkt je issues.read ----------

describe('Prüfung je Berechtigung', () => {
  async function pruefeAls(als: TestBenutzer | Benutzer) {
    const { user } = zeigeApp('/pruefung', als)
    await pruefSeite()
    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/me$/).length).toBeGreaterThan(0))
    await gibEin(user, screen.getByLabelText(/^Hologrammnummer/), 'ab 12-43')
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 2 })
  }

  it('ruft als Betrachter nur POST /api/pruefung auf', async () => {
    await pruefeAls('betrachter')

    expect(api.anfragen.filter((a) => a.pfad.startsWith('/api/pruefung')).map((a) => a.pfad)).toEqual(['/api/pruefung'])
  })

  it('sendet als Betrachter keinen Request auf …/ausgaben', async () => {
    await pruefeAls('betrachter')

    expect(api.anfragen.filter((a) => a.pfad.includes('/ausgaben'))).toEqual([])
  })

  it('zeigt dem Betrachter keine Empfängerdaten', async () => {
    await pruefeAls('betrachter')

    expect(seitenText()).not.toContain('Max Beispiel')
    expect(screen.queryByRole('link', { name: 'Zur Ausgabe' })).not.toBeInTheDocument()
  })

  it.each(['admin', 'sachbearbeiter'] as const)(
    'ruft als %s nur POST /api/pruefung/mit-empfaenger auf',
    async (als) => {
      await pruefeAls(als)

      expect(api.anfragen.filter((a) => a.pfad.startsWith('/api/pruefung')).map((a) => a.pfad)).toEqual([
        '/api/pruefung/mit-empfaenger',
      ])
    },
  )

  it('zeigt dem Sachbearbeiter den Empfänger und „Zur Ausgabe“', async () => {
    await pruefeAls('sachbearbeiter')

    expect(seitenText()).toContain('Max Beispiel')
    expect(screen.getByRole('link', { name: 'Zur Ausgabe' })).toHaveAttribute('href', seite(MIT_ID))
  })
})

// ---------- AK-27: Seite „Ausgabe“ ----------

describe('Seite „Ausgabe“ – Hologrammnummer', () => {
  const ueberschrift = (nr: number) =>
    screen.findByRole('heading', { level: 1, name: `Ausgabe von Exemplar Nr. ${nr}` })

  it('zeigt die Hologrammnummer der Ausgabe', async () => {
    zeigeApp(seite(MIT_ID))
    await ueberschrift(13)

    expect(seitenText()).toContain('AB 12-43')
  })

  it('zeigt ohne Nummer „Keine erfasst“ und den Button „Hologrammnummer ergänzen“', async () => {
    zeigeApp(seite(OHNE_ID))
    await ueberschrift(12)

    expect(seitenText()).toContain('Keine erfasst')
    expect(await screen.findByRole('button', { name: 'Hologrammnummer ergänzen' })).toBeInTheDocument()
  })

  it('zeigt mit Nummer den Button „Hologrammnummer korrigieren“', async () => {
    zeigeApp(seite(MIT_ID))
    await ueberschrift(13)

    expect(await screen.findByRole('button', { name: 'Hologrammnummer korrigieren' })).toBeInTheDocument()
  })

  it('zeigt bei einer stornierten Ausgabe keinen Button', async () => {
    zeigeApp(seite(STORNO_ID))
    await ueberschrift(14)
    await screen.findByText('CD 56-78')

    expect(screen.queryByRole('button', { name: /^Hologrammnummer/ })).not.toBeInTheDocument()
  })

  it('zeigt ohne issues.write keinen Button und sendet kein PUT', async () => {
    zeigeApp(seite(OHNE_ID), { ...ME.sachbearbeiter, berechtigungen: ['coins.read', 'issues.read'] } as Benutzer)
    await ueberschrift(12)
    await screen.findByText('Keine erfasst')

    expect(screen.queryByRole('button', { name: /^Hologrammnummer/ })).not.toBeInTheDocument()
    expect(api.anfragenMit('PUT')).toEqual([])
  })

  it('zeigt nach dem Ergänzen die neue Nummer und die Statusmeldung', async () => {
    const { user } = zeigeApp(seite(OHNE_ID))
    await ueberschrift(12)
    await user.click(await screen.findByRole('button', { name: 'Hologrammnummer ergänzen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Hologrammnummer ergänzen' })
    await gibEin(user, within(dialog).getByLabelText(/^Hologrammnummer/), 'ef 90-12')

    await user.click(within(dialog).getByRole('button', { name: /Speichern/ }))

    await waitFor(() => expect(meldungMit(TEXTE.gespeichert)?.getAttribute('role')).toBe('status'))
    expect(seitenText()).toContain('EF 90-12')
  })

  it('heißt der Button nach dem Ergänzen „Hologrammnummer korrigieren“ und hat den Fokus', async () => {
    const { user } = zeigeApp(seite(OHNE_ID))
    await ueberschrift(12)
    await user.click(await screen.findByRole('button', { name: 'Hologrammnummer ergänzen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Hologrammnummer ergänzen' })
    await gibEin(user, within(dialog).getByLabelText(/^Hologrammnummer/), 'EF9012')

    await user.click(within(dialog).getByRole('button', { name: /Speichern/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Hologrammnummer korrigieren' })).toHaveFocus())
  })

  it('zeigt auf der Seite „Ausgabe“ mit geöffnetem Dialog keine englischen Texte', async () => {
    const { user } = zeigeApp(seite(MIT_ID))
    await ueberschrift(13)
    await user.click(await screen.findByRole('button', { name: 'Hologrammnummer korrigieren' }))
    await screen.findByRole('dialog', { name: 'Hologrammnummer korrigieren' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})
