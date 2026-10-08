import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import {
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { gibEin, meldungMit, seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabeErfassenSeite } from '../index'

// Feature coin-ausgaben, AK-26 bis AK-29 und AK-30: Seite „Ausgabe erfassen“ (/coins/$coinId/ausgaben/neu).
// Props { coinId, onErfasst(ausgabe) }; die Seite lädt Coin und Kennzahlen und nutzt keine Router-Hooks.

const ID = '0199a1b2-0000-7000-8000-0000000000d1'
const TEXTE = {
  auflageUnbekannt:
    'Für diesen Coin ist keine Auflage erfasst. Ausgaben sind erst nach dem Festlegen der Auflage möglich.',
  keinFrei: 'Alle Exemplare dieses Coins sind ausgegeben.',
} as const

let api: FakeApi
let onErfasst: ReturnType<typeof vi.fn<(ausgabe: Ausgabe) => void>>

function starte(coin: Coin | null = testCoin({ id: ID, name: 'Coin Alpha', auflage: 150 }), ausgegeben: number[] = []) {
  api = erstelleFakeApi(coin ? [coin] : [], {
    ausgaben: {
      [ID]: ausgegeben.map((nr) =>
        testAusgabe({ id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, 'f')}`, exemplarNummer: nr }),
      ),
    },
  })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
  starte(testCoin({ id: ID, name: 'Coin Alpha', auflage: 150 }), [1, 2, 3])
  onErfasst = vi.fn<(ausgabe: Ausgabe) => void>()
})

afterEach(() => {
  vi.useRealTimers()
})

function zeige(coinId = ID) {
  const user = userEvent.setup()
  const { router } = zeigeMitRouter(() => <AusgabeErfassenSeite coinId={coinId} onErfasst={onErfasst} />, {
    pfad: '/coins/$coinId/ausgaben/neu',
    start: `/coins/${coinId}/ausgaben/neu`,
  })
  return { user, router }
}

async function ueberschrift(name = 'Ausgabe erfassen') {
  return screen.findByRole('heading', { level: 1, name })
}

describe('Aufbau (AK-27)', () => {
  it('hat die Überschrift „Ausgabe erfassen“', async () => {
    zeige()

    expect(await ueberschrift()).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeige()
    await screen.findByRole('button', { name: 'Ausgabe speichern' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('nennt den Coin-Namen', async () => {
    zeige()
    await screen.findByRole('button', { name: 'Ausgabe speichern' })

    expect(seitentext()).toContain('Coin Alpha')
  })

  it('zeigt „Verfügbar: {n} von {Auflage}“', async () => {
    zeige()

    expect(await screen.findByText('Verfügbar: 147 von 150')).toBeInTheDocument()
  })

  it('formatiert die Zahlen im deutschen Format', async () => {
    starte(testCoin({ id: ID, auflage: 12500 }))
    zeige()

    expect(await screen.findByText('Verfügbar: 12.500 von 12.500')).toBeInTheDocument()
  })

  it('zeigt das Formular mit „Ausgabe speichern“', async () => {
    zeige()

    expect(await screen.findByRole('button', { name: 'Ausgabe speichern' })).toBeInTheDocument()
  })

  it('verlinkt „Abbrechen“ auf die Detailseite', async () => {
    zeige()

    expect(await screen.findByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', `/coins/${ID}`)
  })

  it('lädt Coin und Kennzahlen', async () => {
    zeige()
    await screen.findByRole('button', { name: 'Ausgabe speichern' })

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`).sort()).toEqual([
      `GET /api/coins/${ID}`,
      `GET /api/coins/${ID}/exemplare`,
    ])
  })

  it('lädt keine Ausgabehistorie', async () => {
    zeige()
    await screen.findByRole('button', { name: 'Ausgabe speichern' })

    expect(api.anfragenMit('GET', /\/ausgaben$/)).toHaveLength(0)
  })

  it('zeigt während des Ladens einen Status', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/coins\/[^/]+$/, () => offen.promise)

    zeige()

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    offen.aufloesen(problemAntwort(404))
  })
})

describe('Coin nicht gefunden (AK-26)', () => {
  it('zeigt bei keiner GUID „Coin nicht gefunden“ ohne API-Aufruf', async () => {
    zeige('keine-guid')

    expect(await ueberschrift('Coin nicht gefunden')).toBeInTheDocument()
    expect(api.anfragen).toHaveLength(0)
  })

  it('zeigt bei 404 „Coin nicht gefunden“', async () => {
    starte(null)
    zeige()

    expect(await ueberschrift('Coin nicht gefunden')).toBeInTheDocument()
  })

  it('zeigt bei 404 kein Formular', async () => {
    starte(null)
    zeige()
    await ueberschrift('Coin nicht gefunden')

    expect(screen.queryByRole('button', { name: 'Ausgabe speichern' })).not.toBeInTheDocument()
  })
})

describe('keine Ausgabe möglich (AK-27)', () => {
  it('zeigt bei Auflage null den Text aus AK-8 statt des Formulars', async () => {
    starte(testCoin({ id: ID, auflage: null }))
    zeige()

    expect(await screen.findByText(TEXTE.auflageUnbekannt)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ausgabe speichern' })).not.toBeInTheDocument()
  })

  it('zeigt bei 0 verfügbaren Exemplaren den Text aus AK-8 statt des Formulars', async () => {
    starte(testCoin({ id: ID, auflage: 2 }), [1, 2])
    zeige()

    expect(await screen.findByText(TEXTE.keinFrei)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ausgabe speichern' })).not.toBeInTheDocument()
  })

  it('bietet dann „Zurück zum Coin“ zur Detailseite', async () => {
    starte(testCoin({ id: ID, auflage: null }))
    zeige()

    expect(await screen.findByRole('link', { name: 'Zurück zum Coin' })).toHaveAttribute('href', `/coins/${ID}`)
  })
})

describe('Erfassen (AK-28)', () => {
  it('ruft nach 201 onErfasst mit der Ausgabe auf', async () => {
    const { user } = zeige()
    await screen.findByRole('button', { name: 'Ausgabe speichern' })
    await gibEin(user, screen.getByLabelText(/^Name des Empfängers/), 'Max Beispiel')
    await gibEin(user, screen.getByLabelText(/^Gelegenheit/), 'Truppenbesuch')
    await gibEin(user, screen.getByLabelText(/^Begründung/), 'Herausragende Leistung')
    await gibEin(user, screen.getByLabelText(/^Ausgebende Stelle oder Person/), 'Kommandeur')

    await user.click(screen.getByRole('button', { name: 'Ausgabe speichern' }))

    await waitFor(() => expect(onErfasst).toHaveBeenCalledTimes(1))
    expect(onErfasst.mock.calls[0][0]).toMatchObject({ exemplarNummer: 4, empfaenger: { name: 'Max Beispiel' } })
  })

  it('zeigt einen Fehler auf der Seite und ruft onErfasst nicht auf', async () => {
    const { user } = zeige()
    await screen.findByRole('button', { name: 'Ausgabe speichern' })
    api.einmal('POST', /\/ausgaben$/, problemAntwort(500))
    await gibEin(user, screen.getByLabelText(/^Name des Empfängers/), 'Max Beispiel')
    await gibEin(user, screen.getByLabelText(/^Gelegenheit/), 'Truppenbesuch')
    await gibEin(user, screen.getByLabelText(/^Begründung/), 'Herausragende Leistung')
    await gibEin(user, screen.getByLabelText(/^Ausgebende Stelle oder Person/), 'Kommandeur')

    await user.click(screen.getByRole('button', { name: 'Ausgabe speichern' }))

    await screen.findByRole('alert')
    expect(onErfasst).not.toHaveBeenCalled()
  })
})

describe('deutsche Texte (AK-30)', () => {
  const ENGLISCH = /\b(Loading|Error|Not found|Cancel|Save|Back|Available|of)\b/

  it('enthält keine englischen Texte', async () => {
    zeige()
    await screen.findByRole('button', { name: 'Ausgabe speichern' })

    expect(seitentext()).not.toMatch(ENGLISCH)
  })

  it('enthält auf der Ansicht „keine Ausgabe möglich“ keine englischen Texte', async () => {
    starte(testCoin({ id: ID, auflage: null }))
    zeige()
    await screen.findByText(TEXTE.auflageUnbekannt)

    expect(seitentext()).not.toMatch(ENGLISCH)
    expect(meldungMit('Loading')).toBeUndefined()
  })
})
