import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExemplarStatus } from '@/entities/exemplar'
import {
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { meldungMit, seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinExemplare } from '../index'

// Feature coin-ausgaben, AK-20, AK-23, AK-25 und AK-30: Widget „Exemplare“ mit Kennzahlen, Status-Filter, Tabelle,
// Blättern, Lade-/Fehlerzustand, Link „Ausgabe erfassen“ und „Auflage ändern“. Status und Seite sind Props (URL);
// die Test-Steuerung übernimmt die Rolle der Route.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const GET = /^\/api\/coins\/[^/]+\/exemplare$/
const TEXTE = {
  laden: 'Exemplare werden geladen …',
  fehler: 'Die Exemplare konnten nicht geladen werden. Bitte später erneut versuchen.',
  leer: 'Keine Exemplare mit diesem Status.',
  ohneAuflage: 'Für diesen Coin ist keine Auflage erfasst. Es gibt daher keine Exemplare.',
} as const

let api: FakeApi

function starte(auflage: number | null = 30, ausgegeben: number[] = []) {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage })], {
    ausgaben: {
      [COIN_ID]: ausgegeben.map((nr, i) =>
        testAusgabe({ id: `0199a1b2-0000-7000-8000-${String(i).padStart(12, 'f')}`, exemplarNummer: nr }),
      ),
    },
  })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
})

interface Optionen {
  status?: ExemplarStatus
  seite?: number
  darfErfassen?: boolean
  darfAuflageAendern?: boolean
  steuern?: boolean
}

function zeige({ status, seite = 1, darfErfassen = false, darfAuflageAendern = false, steuern = true }: Optionen = {}) {
  const onStatus = vi.fn<(status?: ExemplarStatus) => void>()
  const onSeite = vi.fn<(seite: number) => void>()
  let neuLadenAusloesen: () => void = () => {}
  let seiteSetzen: (neu: number) => void = () => {}
  function Steuerung() {
    const [zustand, setZustand] = useState({ status, seite, neuLaden: 0 })
    neuLadenAusloesen = () => setZustand((alt) => ({ ...alt, neuLaden: alt.neuLaden + 1 }))
    seiteSetzen = (neu) => setZustand((alt) => ({ ...alt, seite: neu }))
    return (
      <CoinExemplare
        coinId={COIN_ID}
        status={zustand.status}
        seite={zustand.seite}
        neuLaden={zustand.neuLaden}
        darfErfassen={darfErfassen}
        darfAuflageAendern={darfAuflageAendern}
        onStatus={(neu) => {
          onStatus(neu)
          if (steuern) setZustand((alt) => ({ ...alt, status: neu, seite: 1 }))
        }}
        onSeite={(neu) => {
          onSeite(neu)
          if (steuern) setZustand((alt) => ({ ...alt, seite: neu }))
        }}
      />
    )
  }
  const user = userEvent.setup()
  const { router } = zeigeMitRouter(() => <Steuerung />, { pfad: '/coins/$coinId', start: `/coins/${COIN_ID}` })
  return {
    user,
    router,
    onStatus,
    onSeite,
    neuLaden: () => act(() => neuLadenAusloesen()),
    seite: (neu: number) => act(() => seiteSetzen(neu)),
  }
}

const abrufe = () => api.anfragenMit('GET', GET)

async function tabelle() {
  return screen.findByRole('table', { name: 'Exemplare' })
}

function nummernInTabelle(): string[] {
  return within(screen.getByRole('table', { name: 'Exemplare' }))
    .getAllByRole('row')
    .slice(1)
    .map((z) => within(z).getAllByRole('cell')[0].textContent?.trim() ?? '')
}

describe('Abschnitt', () => {
  it('hat die Überschrift „Exemplare“ (Ebene 2)', async () => {
    zeige()

    expect(await screen.findByRole('heading', { level: 2, name: 'Exemplare' })).toBeInTheDocument()
  })

  it('lädt GET …/exemplare mit seite 1 ohne Status', async () => {
    zeige()
    await tabelle()

    expect(abrufe()).toHaveLength(1)
    expect(abrufe()[0].pfad).toBe(`/api/coins/${COIN_ID}/exemplare`)
    expect(abrufe()[0].query.get('seite')).toBe('1')
    expect(abrufe()[0].query.has('status')).toBe(false)
  })

  it('zeigt die Kennzahlen', async () => {
    starte(150, [1, 2, 3])
    zeige()
    await tabelle()

    const werte = [...document.querySelectorAll('dl dd')].map((dd) => dd.textContent?.trim())
    expect(werte).toEqual(['150', '3', '147'])
  })

  it('zeigt die Exemplare der Seite in der Tabelle', async () => {
    zeige()
    await tabelle()

    expect(nummernInTabelle()).toHaveLength(25)
    expect(nummernInTabelle()[0]).toBe('1')
  })
})

describe('Laden und Fehler', () => {
  it('zeigt während des Ladens „Exemplare werden geladen …“ als Status', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', GET, () => offen.promise)

    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.laden)?.getAttribute('role')).toBe('status'))
    offen.aufloesen(problemAntwort(500))
  })

  it('zeigt bei einem Fehler den Alarm aus AK-20', async () => {
    api.einmal('GET', GET, problemAntwort(500, { detail: 'NpgsqlException' }))

    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.fehler)?.getAttribute('role')).toBe('alert'))
    expect(seitentext()).not.toMatch(/Npgsql|500/)
  })

  it('zeigt bei leerem Filter „Keine Exemplare mit diesem Status.“', async () => {
    zeige({ status: 'ausgegeben' })

    expect(await screen.findByText(TEXTE.leer)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Exemplare' })).not.toBeInTheDocument()
  })

  it('zeigt bei Auflage null den Hinweis und keine Tabelle', async () => {
    starte(null)
    zeige()

    expect(await screen.findByText(TEXTE.ohneAuflage)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Exemplare' })).not.toBeInTheDocument()
  })

  it('verwirft eine veraltete Antwort nach einem Seitenwechsel', async () => {
    const alt = offeneAntwort()
    api.einmal('GET', GET, () => alt.promise)
    const steuerung = zeige()
    // Die Antwort für Seite 1 hängt; Seite 2 kommt sofort, danach erst die veraltete Antwort.
    await waitFor(() => expect(abrufe()).toHaveLength(1))
    steuerung.seite(2)
    await waitFor(() => expect(nummernInTabelle()[0]).toBe('26'))
    alt.aufloesen(
      jsonAntwort(200, {
        kennzahlen: { auflage: 30, ausgegeben: 0, verfuegbar: 30 },
        eintraege: [{ nummer: 999, status: 'verfuegbar' }],
        gesamt: 30,
        seite: 1,
        groesse: 25,
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(nummernInTabelle()).not.toContain('999')
  })
})

describe('Filter „Status“', () => {
  it('hat ein beschriftetes Auswahlfeld „Status“', async () => {
    zeige()
    await tabelle()

    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
  })

  it('bietet „Alle“, „Verfügbar“ und „Ausgegeben“', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('combobox', { name: 'Status' }))

    const optionen = (await screen.findAllByRole('option')).map((o) => o.textContent?.trim())
    expect(optionen).toEqual(['Alle', 'Verfügbar', 'Ausgegeben'])
  })

  it('meldet die Wahl „Ausgegeben“ über onStatus', async () => {
    const { user, onStatus } = zeige()
    await tabelle()

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Ausgegeben' }))

    expect(onStatus).toHaveBeenCalledWith('ausgegeben')
  })

  it('meldet „Alle“ als fehlenden Status', async () => {
    const { user, onStatus } = zeige({ status: 'verfuegbar' })
    await tabelle()

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Alle' }))

    expect(onStatus).toHaveBeenCalledWith(undefined)
  })

  it('lädt mit dem Status aus den Props', async () => {
    starte(30, [4])
    zeige({ status: 'ausgegeben' })
    await tabelle()

    expect(abrufe().at(-1)?.query.get('status')).toBe('ausgegeben')
    expect(nummernInTabelle()).toEqual(['4'])
  })

  it('zeigt den gewählten Status im Auswahlfeld', async () => {
    starte(30, [4])
    zeige({ status: 'ausgegeben' })
    await tabelle()

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Ausgegeben')
  })
})

describe('Blättern', () => {
  it('zeigt „Seite 1 von 2“ bei 30 Exemplaren', async () => {
    zeige()
    await tabelle()

    expect(screen.getByText('Seite 1 von 2')).toBeInTheDocument()
  })

  it('meldet „Nächste Seite“ über onSeite(2)', async () => {
    const { user, onSeite } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    expect(onSeite).toHaveBeenCalledWith(2)
  })

  it('lädt Seite 2 aus den Props', async () => {
    zeige({ seite: 2 })
    await tabelle()

    expect(abrufe().at(-1)?.query.get('seite')).toBe('2')
    expect(nummernInTabelle()[0]).toBe('26')
  })
})

describe('Neu laden', () => {
  it('lädt erneut, wenn sich neuLaden ändert', async () => {
    const { neuLaden } = zeige()
    await tabelle()

    neuLaden()

    await waitFor(() => expect(abrufe()).toHaveLength(2))
  })
})

describe('Link „Ausgabe erfassen“ (AK-23)', () => {
  it('ist mit darfErfassen und gesetzter Auflage ein Link auf /coins/{id}/ausgaben/neu', async () => {
    zeige({ darfErfassen: true })
    await tabelle()

    expect(screen.getByRole('link', { name: 'Ausgabe erfassen' })).toHaveAttribute(
      'href',
      `/coins/${COIN_ID}/ausgaben/neu`,
    )
  })

  it('führt zur Erfassen-Seite', async () => {
    const { user, router } = zeige({ darfErfassen: true })
    await tabelle()

    await user.click(screen.getByRole('link', { name: 'Ausgabe erfassen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${COIN_ID}/ausgaben/neu`))
  })

  it('fehlt ohne darfErfassen', async () => {
    zeige({ darfErfassen: false })
    await tabelle()

    expect(screen.queryByRole('link', { name: 'Ausgabe erfassen' })).not.toBeInTheDocument()
  })

  it('fehlt bei Auflage null', async () => {
    starte(null)
    zeige({ darfErfassen: true })
    await screen.findByText(TEXTE.ohneAuflage)

    expect(screen.queryByRole('link', { name: 'Ausgabe erfassen' })).not.toBeInTheDocument()
  })

  it('ist auch bei 0 verfügbaren Exemplaren vorhanden', async () => {
    starte(2, [1, 2])
    zeige({ darfErfassen: true })
    await tabelle()

    expect(screen.getByRole('link', { name: 'Ausgabe erfassen' })).toBeInTheDocument()
  })
})

describe('„Auflage ändern“ (AK-25)', () => {
  it('ist mit darfAuflageAendern vorhanden', async () => {
    zeige({ darfAuflageAendern: true })
    await tabelle()

    expect(screen.getByRole('button', { name: 'Auflage ändern' })).toBeInTheDocument()
  })

  it('ist auch bei Auflage null vorhanden', async () => {
    starte(null)
    zeige({ darfAuflageAendern: true })
    await screen.findByText(TEXTE.ohneAuflage)

    expect(screen.getByRole('button', { name: 'Auflage ändern' })).toBeInTheDocument()
  })

  it('fehlt ohne darfAuflageAendern', async () => {
    zeige({ darfAuflageAendern: false })
    await tabelle()

    expect(screen.queryByRole('button', { name: 'Auflage ändern' })).not.toBeInTheDocument()
  })
})

describe('deutsche Texte', () => {
  it('enthält keine englischen Texte', async () => {
    zeige({ darfErfassen: true, darfAuflageAendern: true })
    await tabelle()

    expect(seitentext()).not.toMatch(/\b(Loading|Error|Available|Issued|All|Status filter|Next|Previous|Page)\b/)
  })
})
