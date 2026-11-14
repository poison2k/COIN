import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import { ME, erstelleTestAnmeldung, type SitzungsZustand, type TestBenutzer } from '../../test/anmeldung'
import { erstelleFakeApi, testAusgabe, testCoin, testDatei, type FakeApi } from '../../test/fakeApi'
import { gibEin, meldungMit } from '../../test/hilfen'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature formulare-detailseiten im Zusammenspiel von App und Router: AK-13, AK-14 (Verlassen-Warnung je Route),
// AK-23 (`?reiter`, ungültige Werte, Standard, `replace`, nach dem Erfassen „Ausgaben“), AK-24/AK-33 (Chip entfernen
// setzt Filter und Seite zurück), F8 (Statusfilter der Historie nicht in der URL).

const ALPHA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a1', name: 'Coin Alpha', auflage: 150 })
const DETAIL = `/coins/${ALPHA.id}`
const EXEMPLARE = /^\/api\/coins\/[^/]+\/exemplare$/
const AUSGABEN = /^\/api\/coins\/[^/]+\/ausgaben$/
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const BESCHREIBUNG = {
  anlegen: 'Der neue Coin ist nicht gespeichert. Seite trotzdem verlassen?',
  bearbeiten: 'Die Änderungen am Coin sind nicht gespeichert. Seite trotzdem verlassen?',
  erfassen: 'Die Ausgabe ist nicht gespeichert. Seite trotzdem verlassen?',
  vorlage: 'Die ausgewählte Vorlage ist nicht hochgeladen. Seite trotzdem verlassen?',
} as const

let api: FakeApi

interface Optionen {
  als?: TestBenutzer
  zustand?: SitzungsZustand
  coins?: Coin[]
  ausgaben?: Ausgabe[]
}

function zeigeApp(
  pfad: string,
  { als = 'sachbearbeiter', zustand = 'angemeldet', coins = [ALPHA], ausgaben = [] }: Optionen = {},
) {
  api = erstelleFakeApi(coins, { me: zustand === 'anonym' ? null : ME[als], ausgaben: { [ALPHA.id]: ausgaben } })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung = erstelleTestAnmeldung(zustand, ME[als].name)
  const user = userEvent.setup({ applyAccept: false })
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

function katalogLink(): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('link', { name: 'Katalog' })
}

function warnung(): Promise<HTMLElement> {
  return screen.findByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })
}

// ---------- AK-23: Reiter in der URL ----------

describe('Reiter in der URL (AK-23)', () => {
  it('öffnet mit ?reiter=ausgaben direkt die Ausgabehistorie', async () => {
    zeigeApp(`${DETAIL}?reiter=ausgaben`)

    expect(await screen.findByRole('heading', { level: 2, name: 'Ausgabehistorie' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ausgaben' })).toHaveAttribute('aria-selected', 'true')
  })

  it('öffnet mit ?reiter=vorlage die Zertifikatsvorlage', async () => {
    zeigeApp(`${DETAIL}?reiter=vorlage`)

    expect(await screen.findByRole('tabpanel', { name: 'Zertifikatsvorlage' })).toBeInTheDocument()
  })

  it('öffnet ohne reiter mit coins.read den Reiter „Exemplare“', async () => {
    zeigeApp(DETAIL, { als: 'betrachter' })

    expect(await screen.findByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
  })

  it.each(['unsinn', '', 'AUSGABEN', '1'])(
    'zeigt bei ?reiter=%s den Standardreiter ohne Fehler und ohne Weiterleitung',
    async (wert) => {
      const { router } = zeigeApp(`${DETAIL}?reiter=${wert}`)

      expect(await screen.findByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
      expect(router.state.location.pathname).toBe(DETAIL)
      expect(screen.queryByRole('heading', { level: 1, name: /nicht gefunden|Fehler/ })).not.toBeInTheDocument()
    },
  )

  it('zeigt dem Betrachter bei ?reiter=vorlage den Standardreiter ohne Vorlagen-Request', async () => {
    zeigeApp(`${DETAIL}?reiter=vorlage`, { als: 'betrachter' })

    expect(await screen.findByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.anfragen.filter((a) => a.pfad.includes('zertifikatsvorlage'))).toEqual([])
  })

  it('zeigt anonym ohne Reiterleiste die Stammdaten, auch mit ?reiter=ausgaben', async () => {
    zeigeApp(`${DETAIL}?reiter=ausgaben`, { zustand: 'anonym' })
    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Stammdaten' })).toBeInTheDocument()
    expect(api.anfragenMit('GET', AUSGABEN)).toHaveLength(0)
  })

  it('schreibt den Reiter bei einem Wechsel in die URL und behält status und seite', async () => {
    const { user, router } = zeigeApp(`${DETAIL}?status=verfuegbar&seite=2`)
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('tab', { name: 'Ausgaben' }))

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ reiter: 'ausgaben', status: 'verfuegbar', seite: 2 }),
    )
  })

  it('ersetzt beim Reiterwechsel den Verlaufseintrag (replace)', async () => {
    const { user, router } = zeigeApp(DETAIL)
    await screen.findByRole('table', { name: 'Exemplare' })
    const laenge = router.history.length

    await user.click(screen.getByRole('tab', { name: 'Ausgaben' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ reiter: 'ausgaben' }))

    expect(router.history.length).toBe(laenge)
  })

  it('öffnet nach dem Erfassen einer Ausgabe „Ausgaben“, die URL bleibt /coins/{id}', async () => {
    const { user, router } = zeigeApp(`${DETAIL}/ausgaben/neu`)
    await screen.findByRole('button', { name: 'Ausgabe speichern' })
    await gibEin(user, screen.getByLabelText(/^Name des Empfängers/), 'Testperson A')
    await gibEin(user, screen.getByLabelText(/^Gelegenheit/), 'Truppenbesuch')
    await gibEin(user, screen.getByLabelText(/^Begründung/), 'Verdienste')
    await gibEin(user, screen.getByLabelText(/^Ausgebende Stelle oder Person/), 'Dienststelle Beispiel')

    await user.click(screen.getByRole('button', { name: 'Ausgabe speichern' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(DETAIL))
    expect(await screen.findByRole('tab', { name: 'Ausgaben' })).toHaveAttribute('aria-selected', 'true')
    expect(router.state.location.search).not.toHaveProperty('reiter')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('nennt im Parameter reiter keine Daten (nur den Reiterwert)', async () => {
    const { user, router } = zeigeApp(DETAIL, { ausgaben: [testAusgabe()] })
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('tab', { name: 'Ausgaben' }))
    await screen.findByRole('table', { name: 'Ausgabehistorie' })

    expect(router.state.location.href).not.toMatch(/Max|Beispiel|Truppenbesuch/)
  })
})

// ---------- AK-24, AK-33: Chip entfernen ----------

describe('Exemplar-Filter-Chip (AK-24, AK-33)', () => {
  it('setzt beim Entfernen des Chips „Alle“ und Seite 1', async () => {
    const { user, router } = zeigeApp(`${DETAIL}?status=verfuegbar&seite=3`)
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('button', { name: 'Filter „Status: Verfügbar“ entfernen' }))

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('status'))
    expect((router.state.location.search as { seite?: number }).seite ?? 1).toBe(1)
    await waitFor(() => expect(api.anfragenMit('GET', EXEMPLARE).at(-1)?.query.has('status')).toBe(false))
  })

  it('setzt den Fokus danach auf das erste Filterbedienelement (Status)', async () => {
    // Mit einer Ausgabe, damit der Filter „Ausgegeben“ eine Tabelle zeigt (ohne Treffer gäbe es nur den Leerzustand).
    const { user } = zeigeApp(`${DETAIL}?status=ausgegeben`, { ausgaben: [testAusgabe({ exemplarNummer: 1 })] })
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('button', { name: 'Filter „Status: Ausgegeben“ entfernen' }))

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveFocus())
  })
})

// ---------- F8: Statusfilter der Historie ----------

describe('Statusfilter der Ausgabehistorie (F8, AK-33)', () => {
  const AUSGABEN_LISTE = [
    testAusgabe({ exemplarNummer: 1 }),
    testAusgabe({
      id: '0199a1b2-0000-7000-8000-00000000e002',
      exemplarNummer: 2,
      storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Administrator' }, grund: 'Doppelt' },
    }),
  ]

  it('lädt beim Filter „Storniert“ mit status=storniert und zeigt den Chip „Status: Storniert“', async () => {
    const { user } = zeigeApp(`${DETAIL}?reiter=ausgaben`, { ausgaben: AUSGABEN_LISTE })
    const panel = await screen.findByRole('tabpanel', { name: 'Ausgaben' })
    await within(panel).findByRole('table', { name: 'Ausgabehistorie' })

    await user.click(within(panel).getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Storniert' }))

    await waitFor(() => expect(api.anfragenMit('GET', AUSGABEN).at(-1)?.query.get('status')).toBe('storniert'))
    expect(await within(panel).findByRole('list', { name: 'Aktive Filter' })).toHaveTextContent('Status: Storniert')
  })

  it('schreibt den Statusfilter der Historie nicht in die URL', async () => {
    const { user, router } = zeigeApp(`${DETAIL}?reiter=ausgaben`, { ausgaben: AUSGABEN_LISTE })
    const panel = await screen.findByRole('tabpanel', { name: 'Ausgaben' })
    await within(panel).findByRole('table', { name: 'Ausgabehistorie' })

    await user.click(within(panel).getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Aktiv' }))
    await waitFor(() => expect(api.anfragenMit('GET', AUSGABEN).at(-1)?.query.get('status')).toBe('aktiv'))

    expect(router.state.location.search).not.toHaveProperty('status')
  })

  it('lädt nach dem Entfernen des Chips ohne status ab Seite 1', async () => {
    const { user } = zeigeApp(`${DETAIL}?reiter=ausgaben`, { ausgaben: AUSGABEN_LISTE })
    const panel = await screen.findByRole('tabpanel', { name: 'Ausgaben' })
    await within(panel).findByRole('table', { name: 'Ausgabehistorie' })
    await user.click(within(panel).getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Aktiv' }))
    await within(panel).findByRole('list', { name: 'Aktive Filter' })

    await user.click(within(panel).getByRole('button', { name: 'Filter „Status: Aktiv“ entfernen' }))

    await waitFor(() => expect(api.anfragenMit('GET', AUSGABEN).at(-1)?.query.has('status')).toBe(false))
    expect(api.anfragenMit('GET', AUSGABEN).at(-1)?.query.get('seite') ?? '1').toBe('1')
  })
})

// ---------- AK-13, AK-14: Verlassen-Warnung je Route ----------

describe('Verlassen-Warnung: Coin anlegen (AK-13, AK-14)', () => {
  it('fragt nach Eingabe beim Klick auf „Katalog“ in der Seitenleiste nach', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    await user.type(screen.getByLabelText(/^Name/), 'Coin Neu')

    await user.click(katalogLink())

    expect(await warnung()).toHaveAccessibleDescription(BESCHREIBUNG.anlegen)
    expect(router.state.location.pathname).toBe('/coins/neu')
  })

  it('bleibt bei „Bleiben“ mit den Eingaben auf der Seite', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    await user.type(screen.getByLabelText(/^Name/), 'Coin Neu')
    await user.click(katalogLink())

    await user.click(within(await warnung()).getByRole('button', { name: 'Bleiben' }))

    expect(router.state.location.pathname).toBe('/coins/neu')
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Coin Neu')
  })

  it('navigiert bei „Verlassen“ ohne Request', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    await user.type(screen.getByLabelText(/^Name/), 'Coin Neu')
    await user.click(katalogLink())

    await user.click(within(await warnung()).getByRole('button', { name: 'Verlassen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('fragt ohne Eingabe nicht nach', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })

    await user.click(katalogLink())

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('fragt nach Rücksetzen auf den Ausgangswert nicht nach', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    await user.type(screen.getByLabelText(/^Name/), 'X')
    await user.clear(screen.getByLabelText(/^Name/))

    await user.click(katalogLink())

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('fragt nach gewähltem Motivbild nach', async () => {
    const { user } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    await user.upload(screen.getByLabelText(/^Motivbild/), testDatei())

    await user.click(katalogLink())

    expect(await warnung()).toBeInTheDocument()
  })

  it('fragt nach erfolgreichem Anlegen beim Weiterleiten nicht nach', async () => {
    const { user, router } = zeigeApp('/coins/neu')
    await screen.findByRole('button', { name: 'Coin anlegen' })
    await gibEin(user, screen.getByLabelText(/^Name/), 'Coin Neu')
    await gibEin(user, screen.getByLabelText(/^Herausgeber/), 'Herausgeber Neu')

    await user.click(screen.getByRole('button', { name: 'Coin anlegen' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/coins\/[0-9a-f-]{36}$/))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('fragt auch bei „Zurück“ im Browser nach', async () => {
    const { user, router } = zeigeApp('/coins')
    await user.click(await screen.findByRole('link', { name: 'Coin hinzufügen' }))
    await screen.findByRole('button', { name: 'Coin anlegen' })
    await user.type(screen.getByLabelText(/^Name/), 'Coin Neu')

    router.history.back()

    expect(await warnung()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/coins/neu')
  })
})

describe('Verlassen-Warnung: Coin bearbeiten (AK-13)', () => {
  it('fragt nach Änderung beim Klick auf „Abbrechen“ mit der Beschreibung für „Coin bearbeiten“ nach', async () => {
    const { user, router } = zeigeApp(`${DETAIL}/bearbeiten`)
    await screen.findByRole('button', { name: 'Änderungen speichern' })
    await user.type(screen.getByLabelText(/^Name/), ' Neu')

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    expect(await warnung()).toHaveAccessibleDescription(BESCHREIBUNG.bearbeiten)
    expect(router.state.location.pathname).toBe(`${DETAIL}/bearbeiten`)
  })

  it('fragt nach erfolgreichem Speichern nicht nach', async () => {
    const { user, router } = zeigeApp(`${DETAIL}/bearbeiten`)
    await screen.findByRole('button', { name: 'Änderungen speichern' })
    await user.type(screen.getByLabelText(/^Name/), ' Neu')

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(DETAIL))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('Verlassen-Warnung: Ausgabe erfassen (AK-13)', () => {
  it('fragt nach Eingabe beim Klick auf „Abbrechen“ mit der Beschreibung für „Ausgabe erfassen“ nach', async () => {
    const { user } = zeigeApp(`${DETAIL}/ausgaben/neu`)
    await screen.findByRole('button', { name: 'Ausgabe speichern' })
    await user.type(screen.getByLabelText(/^Name des Empfängers/), 'Testperson A')

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    expect(await warnung()).toHaveAccessibleDescription(BESCHREIBUNG.erfassen)
  })

  it('zählt eine geänderte Radiowahl als Änderung', async () => {
    const { user } = zeigeApp(`${DETAIL}/ausgaben/neu`)
    await screen.findByRole('button', { name: 'Ausgabe speichern' })
    await user.click(screen.getByRole('radio', { name: 'Bestimmte Nummer' }))

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    expect(await warnung()).toBeInTheDocument()
  })

  it('fragt ohne Eingabe nicht nach (vorbelegtes Datum zählt nicht)', async () => {
    const { user, router } = zeigeApp(`${DETAIL}/ausgaben/neu`)
    await screen.findByRole('button', { name: 'Ausgabe speichern' })

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(DETAIL))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('Verlassen-Warnung: Reiter „Zertifikatsvorlage“ (AK-13)', () => {
  it('fragt bei gewählter, nicht hochgeladener Vorlage beim Reiterwechsel nach', async () => {
    const { user, router } = zeigeApp(`${DETAIL}?reiter=vorlage`)
    await user.upload(await screen.findByLabelText(/^Word-Vorlage/), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(screen.getByRole('tab', { name: 'Exemplare' }))

    expect(await warnung()).toHaveAccessibleDescription(BESCHREIBUNG.vorlage)
    expect(router.state.location.search).toMatchObject({ reiter: 'vorlage' })
  })

  it('wechselt bei „Verlassen“ den Reiter ohne Upload', async () => {
    const { user, router } = zeigeApp(`${DETAIL}?reiter=vorlage`)
    await user.upload(await screen.findByLabelText(/^Word-Vorlage/), testDatei(DOCX, 2048, 'urkunde.docx'))
    await user.click(screen.getByRole('tab', { name: 'Exemplare' }))

    await user.click(within(await warnung()).getByRole('button', { name: 'Verlassen' }))

    await waitFor(() => expect(router.state.location.search).toMatchObject({ reiter: 'exemplare' }))
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('fragt ohne gewählte Datei beim Reiterwechsel nicht nach', async () => {
    const { user, router } = zeigeApp(`${DETAIL}?reiter=vorlage`)
    await screen.findByLabelText(/^Word-Vorlage/)

    await user.click(screen.getByRole('tab', { name: 'Exemplare' }))

    await waitFor(() => expect(router.state.location.search).toMatchObject({ reiter: 'exemplare' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('blockiert auf anderen Reitern keinen Reiterwechsel', async () => {
    const { user, router } = zeigeApp(DETAIL)
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('tab', { name: 'Stammdaten' }))

    await waitFor(() => expect(router.state.location.search).toMatchObject({ reiter: 'stammdaten' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('Meldung nach dem Erfassen (AK-28 coin-ausgaben, unverändert)', () => {
  it('meldet „Exemplar Nr. 1 wurde ausgegeben.“ und zeigt die Ausgabe im Reiter „Ausgaben“', async () => {
    const { user } = zeigeApp(`${DETAIL}/ausgaben/neu`)
    await screen.findByRole('button', { name: 'Ausgabe speichern' })
    await gibEin(user, screen.getByLabelText(/^Name des Empfängers/), 'Testperson A')
    await gibEin(user, screen.getByLabelText(/^Gelegenheit/), 'Truppenbesuch')
    await gibEin(user, screen.getByLabelText(/^Begründung/), 'Verdienste')
    await gibEin(user, screen.getByLabelText(/^Ausgebende Stelle oder Person/), 'Dienststelle Beispiel')

    await user.click(screen.getByRole('button', { name: 'Ausgabe speichern' }))

    await waitFor(() => expect(meldungMit('Exemplar Nr. 1 wurde ausgegeben.')?.getAttribute('role')).toBe('status'))
    const tabelle = await screen.findByRole('table', { name: 'Ausgabehistorie' })
    expect(within(tabelle).getAllByRole('row')[1]).toHaveTextContent('Testperson A')
  })
})
