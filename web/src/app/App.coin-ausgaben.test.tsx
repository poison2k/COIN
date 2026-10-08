import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import {
  ME,
  erstelleTestAnmeldung,
  type SitzungsZustand,
  type TestAnmeldung,
  type TestBenutzer,
} from '../../test/anmeldung'
import { erstelleFakeApi, testAusgabe, testCoin, type FakeApi } from '../../test/fakeApi'
import { gibEin, meldungMit } from '../../test/hilfen'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature coin-ausgaben im Zusammenspiel von App, Router, Guards und Seiten: AK-20 bis AK-23 (Detailseite je
// Berechtigung, Filter und Seite in der URL), AK-26 (Guard der Erfassen-Seite), AK-28 (Weiterleitung mit Meldung),
// AK-30 (deutsche Texte, genau ein h1).

const TEXTE = {
  ohneBerechtigung:
    'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
  deaktiviert: 'Ihr Benutzerkonto ist deaktiviert.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
  leereHistorie: 'Für diesen Coin wurden noch keine Ausgaben erfasst.',
} as const

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Loading|Error|Unauthorized|Forbidden|Not Found|Not found|Previous|Next|Page|Cancel|Back|Save|Submit|Recipient|Reason|Occasion|Available|Issued|Copies|Issues|History|Status filter|All)\b/

const ALPHA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a1', name: 'Coin Alpha', auflage: 150 })
const EXEMPLARE = /^\/api\/coins\/[^/]+\/exemplare$/
const AUSGABEN = /^\/api\/coins\/[^/]+\/ausgaben$/

let api: FakeApi

interface Optionen {
  als?: TestBenutzer | 'deaktiviert'
  zustand?: SitzungsZustand
  coins?: Coin[]
  ausgaben?: Ausgabe[]
}

function zeigeApp(
  pfad: string,
  { als = 'sachbearbeiter', zustand = 'angemeldet', coins = [ALPHA], ausgaben = [] }: Optionen = {},
) {
  const me = als === 'deaktiviert' ? 'deaktiviert' : ME[als]
  api = erstelleFakeApi(coins, { me: zustand === 'anonym' ? null : me, ausgaben: { [ALPHA.id]: ausgaben } })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung: TestAnmeldung = erstelleTestAnmeldung(zustand, als === 'deaktiviert' ? ME.admin.name : ME[als].name)
  const user = userEvent.setup()
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router, anmeldung }
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

const NEU = `/coins/${ALPHA.id}/ausgaben/neu`

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------- AK-26: Guard der Erfassen-Seite ----------

describe('/coins/{id}/ausgaben/neu – Zugriff', () => {
  it.each(['admin', 'sachbearbeiter'] as const)('zeigt %s die Seite „Ausgabe erfassen“', async (als) => {
    zeigeApp(NEU, { als })

    expect(await screen.findByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Ausgabe speichern' })).toBeInTheDocument()
  })

  it('leitet den Betrachter nach /kein-zugriff?grund=berechtigung', async () => {
    const { router } = zeigeApp(NEU, { als: 'betrachter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.state.location.search).toEqual({ grund: 'berechtigung' })
  })

  it('zeigt dem Betrachter „Kein Zugriff“ mit dem Text für fehlende Berechtigung', async () => {
    zeigeApp(NEU, { als: 'betrachter' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    await waitFor(() => expect(seitenText()).toContain(TEXTE.ohneBerechtigung))
  })

  it('sendet als Betrachter keinen Request auf …/ausgaben', async () => {
    zeigeApp(NEU, { als: 'betrachter' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(api.anfragen.filter((a) => a.pfad.includes('/ausgaben'))).toEqual([])
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff mit dem Text für „keine Rolle“', async () => {
    const { router } = zeigeApp(NEU, { als: 'keine' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.keineRolle))
  })

  it('leitet Deaktivierte nach /kein-zugriff mit dem Deaktiviert-Text', async () => {
    const { router } = zeigeApp(NEU, { als: 'deaktiviert' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.deaktiviert))
  })

  it('startet anonym die Anmeldung mit Rückkehrziel', async () => {
    const { anmeldung } = zeigeApp(NEU, { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe(NEU)
  })

  it('zeigt für eine Id ohne GUID-Format „Coin nicht gefunden“ ohne API-Aufruf auf den Coin', async () => {
    zeigeApp('/coins/keine-guid/ausgaben/neu')

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
    expect(api.anfragen.filter((a) => a.pfad.startsWith('/api/coins'))).toEqual([])
  })
})

// ---------- AK-20 bis AK-23: Detailseite je Berechtigung ----------

describe('Detailseite je Berechtigung', () => {
  it('zeigt dem Betrachter Kennzahlen und Status, aber keine Ausgabehistorie', async () => {
    zeigeApp(`/coins/${ALPHA.id}`, { als: 'betrachter', ausgaben: [testAusgabe({ exemplarNummer: 1 })] })

    expect(await screen.findByRole('table', { name: 'Exemplare' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ausgabehistorie' })).not.toBeInTheDocument()
    expect(seitenText()).not.toContain('Max Beispiel')
  })

  it('sendet für den Betrachter keinen Request auf …/ausgaben', async () => {
    zeigeApp(`/coins/${ALPHA.id}`, { als: 'betrachter' })
    await screen.findByRole('table', { name: 'Exemplare' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.anfragenMit('GET', AUSGABEN)).toHaveLength(0)
  })

  it('zeigt Benutzern ohne Rolle keine Exemplare und sendet keinen Request darauf', async () => {
    zeigeApp(`/coins/${ALPHA.id}`, { als: 'keine' })
    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.queryByRole('heading', { name: 'Exemplare' })).not.toBeInTheDocument()
    expect(api.anfragen.filter((a) => /\/(exemplare|ausgaben)$/.test(a.pfad))).toEqual([])
  })

  it('zeigt dem Sachbearbeiter Exemplare, Historie, „Ausgabe erfassen“ und „Auflage ändern“', async () => {
    zeigeApp(`/coins/${ALPHA.id}`)

    expect(await screen.findByRole('table', { name: 'Exemplare' })).toBeInTheDocument()
    expect(await screen.findByText(TEXTE.leereHistorie)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ausgabe erfassen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Auflage ändern' })).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeigeApp(`/coins/${ALPHA.id}`)
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('enthält keine englischen Texte', async () => {
    zeigeApp(`/coins/${ALPHA.id}`, { ausgaben: [testAusgabe()] })
    await screen.findByRole('table', { name: 'Exemplare' })
    await screen.findByRole('table', { name: 'Ausgabehistorie' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})

// ---------- AK-20: Filter und Seite in der URL ----------

describe('Filter und Seite in der URL', () => {
  it('lädt mit ?status=ausgegeben&seite=2 aus der URL', async () => {
    zeigeApp(`/coins/${ALPHA.id}?status=ausgegeben&seite=2`)
    await waitFor(() => expect(api.anfragenMit('GET', EXEMPLARE).length).toBeGreaterThan(0))

    const abruf = api.anfragenMit('GET', EXEMPLARE).at(-1)!
    expect([abruf.query.get('status'), abruf.query.get('seite')]).toEqual(['ausgegeben', '2'])
  })

  it('behandelt einen ungültigen Status als „Alle“', async () => {
    zeigeApp(`/coins/${ALPHA.id}?status=unsinn`)
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(api.anfragenMit('GET', EXEMPLARE).at(-1)?.query.has('status')).toBe(false)
  })

  it('behandelt eine ungültige Seite als Seite 1', async () => {
    zeigeApp(`/coins/${ALPHA.id}?seite=0`)
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(api.anfragenMit('GET', EXEMPLARE).at(-1)?.query.get('seite')).toBe('1')
  })

  it('schreibt die Filterwahl in die URL', async () => {
    const { user, router } = zeigeApp(`/coins/${ALPHA.id}`)
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Ausgegeben' }))

    await waitFor(() => expect(router.state.location.search).toMatchObject({ status: 'ausgegeben' }))
  })

  it('schreibt das Blättern in die URL', async () => {
    const { user, router } = zeigeApp(`/coins/${ALPHA.id}`)
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    await waitFor(() => expect(router.state.location.search).toMatchObject({ seite: 2 }))
  })

  it('setzt beim Filterwechsel die Seite zurück', async () => {
    const { user, router } = zeigeApp(`/coins/${ALPHA.id}?seite=3`)
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Verfügbar' }))

    await waitFor(() => expect(router.state.location.search).toMatchObject({ status: 'verfuegbar' }))
    expect((router.state.location.search as { seite?: number }).seite ?? 1).toBe(1)
  })
})

// ---------- AK-28: Erfassen → Detailseite ----------

async function erfasse(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: 'Ausgabe speichern' })
  await gibEin(user, screen.getByLabelText(/^Name des Empfängers/), 'Erika Beispiel')
  await gibEin(user, screen.getByLabelText(/^Gelegenheit/), 'Verabschiedung')
  await gibEin(user, screen.getByLabelText(/^Begründung/), 'Langjährige Verdienste')
  await gibEin(user, screen.getByLabelText(/^Ausgebende Stelle oder Person/), 'Kommandeur')
  await user.click(screen.getByRole('button', { name: 'Ausgabe speichern' }))
}

describe('Erfassen → Detailseite', () => {
  const VORHANDEN = [
    testAusgabe({ exemplarNummer: 1 }),
    testAusgabe({ id: '0199a1b2-0000-7000-8000-00000000e002', exemplarNummer: 2 }),
  ]

  it('navigiert nach 201 zur Detailseite', async () => {
    const { user, router } = zeigeApp(NEU, { ausgaben: VORHANDEN })

    await erfasse(user)

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ALPHA.id}`))
  })

  it('meldet „Exemplar Nr. {n} wurde ausgegeben.“ als Status', async () => {
    const { user } = zeigeApp(NEU, { ausgaben: VORHANDEN })

    await erfasse(user)

    await waitFor(() => expect(meldungMit('Exemplar Nr. 3 wurde ausgegeben.')?.getAttribute('role')).toBe('status'))
  })

  it('setzt den Fokus auf die Überschrift der Detailseite', async () => {
    const { user } = zeigeApp(NEU, { ausgaben: VORHANDEN })

    await erfasse(user)

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    await waitFor(() => expect(h1).toHaveFocus())
  })

  it('zeigt die neue Ausgabe oben in der Historie', async () => {
    const { user } = zeigeApp(NEU, { ausgaben: VORHANDEN })

    await erfasse(user)

    const tabelle = await screen.findByRole('table', { name: 'Ausgabehistorie' })
    await waitFor(() => expect(within(tabelle).getAllByRole('row')[1]).toHaveTextContent('Erika Beispiel'))
  })

  it('zeigt aktualisierte Kennzahlen', async () => {
    const { user } = zeigeApp(NEU, { ausgaben: VORHANDEN })

    await erfasse(user)

    await screen.findByRole('table', { name: 'Exemplare' })
    await waitFor(() =>
      expect([...document.querySelectorAll('dl dd')].map((dd) => dd.textContent?.trim()).slice(-3)).toEqual([
        '150',
        '3',
        '147',
      ]),
    )
  })

  it('ersetzt das Formular im Verlauf (replace), „Zurück“ führt nicht zum Formular', async () => {
    const { user, router } = zeigeApp(`/coins/${ALPHA.id}`, { ausgaben: VORHANDEN })
    await user.click(await screen.findByRole('link', { name: 'Ausgabe erfassen' }))
    await erfasse(user)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ALPHA.id}`))

    router.history.back()

    await waitFor(() => expect(router.state.location.pathname).not.toBe(NEU))
  })

  it('nennt in Meldung und History-State keinen Empfänger', async () => {
    const { user, router } = zeigeApp(NEU, { ausgaben: VORHANDEN })

    await erfasse(user)

    await waitFor(() => expect(meldungMit('Exemplar Nr. 3 wurde ausgegeben.')).toBeDefined())
    expect(JSON.stringify(router.state.location.state)).not.toContain('Erika')
  })

  it('verbraucht die Meldung: nach erneutem Laden der Route erscheint sie nicht wieder', async () => {
    const { user, router } = zeigeApp(NEU, { ausgaben: VORHANDEN })
    await erfasse(user)
    await waitFor(() => expect(meldungMit('Exemplar Nr. 3 wurde ausgegeben.')).toBeDefined())

    await waitFor(() =>
      expect((router.state.location.state as { ausgabeErfasst?: unknown }).ausgabeErfasst).toBeUndefined(),
    )
  })

  it('führt „Abbrechen“ zur Detailseite ohne Request', async () => {
    const { user, router } = zeigeApp(NEU)

    await user.click(await screen.findByRole('link', { name: 'Abbrechen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ALPHA.id}`))
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('enthält auf der Erfassen-Seite keine englischen Texte', async () => {
    zeigeApp(NEU)
    await screen.findByRole('button', { name: 'Ausgabe speichern' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})
