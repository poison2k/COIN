import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import { erstelleFakeApi, testAusgabe, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { meldungMit } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinDetailSeite, type CoinDetailSeiteProps } from '../index'

// Feature formulare-detailseiten, AK-19 bis AK-25 (Abschnitt 4.5, ADR-0042): Coin-Detailseite mit Kopf (h1, Status-
// Chips, Aktionen je Berechtigung), Kennzahlenkarten (Region „Kennzahlen“) und Reitern. Angenommene neue Props:
// `reiter?: 'stammdaten' | 'exemplare' | 'ausgaben' | 'vorlage'`, `onReiter?(reiter)` und `berechtigungen.vorlage`
// (coins.write). Die Seite nutzt keine Router-Hooks; den Reiter hält hier ein Test-Zustand wie die Route.

const ID = '0199a1b2-0000-7000-8000-0000000000d1'
const EXEMPLARE = /^\/api\/coins\/[^/]+\/exemplare$/
const AUSGABEN = /^\/api\/coins\/[^/]+\/ausgaben$/
const VORLAGE = /^\/api\/coins\/[^/]+\/zertifikatsvorlage$/

type Berechtigungen = CoinDetailSeiteProps['berechtigungen']
type Reiter = NonNullable<CoinDetailSeiteProps['reiter']>

const STUFEN = {
  anonym: { exemplare: false, historie: false, erfassen: false, auflage: false, bearbeiten: false, vorlage: false },
  betrachter: { exemplare: true, historie: false, erfassen: false, auflage: false, bearbeiten: false, vorlage: false },
  sachbearbeiter: { exemplare: true, historie: true, erfassen: true, auflage: true, bearbeiten: true, vorlage: true },
} satisfies Record<string, Berechtigungen>

let api: FakeApi
let onReiter: ReturnType<typeof vi.fn<(reiter: Reiter) => void>>

function starte(coin: Coin = testCoin({ id: ID, auflage: 250 }), ausgaben: Ausgabe[] = []) {
  api = erstelleFakeApi([coin], { ausgaben: { [ID]: ausgaben } })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
  onReiter = vi.fn<(reiter: Reiter) => void>()
})

interface Optionen extends Partial<CoinDetailSeiteProps> {
  /** Reiterwechsel wie die Route übernehmen (Standard true). */
  wechseln?: boolean
}

function zeige({ wechseln = true, ...props }: Optionen = {}) {
  function MitReitern() {
    const [reiter, setReiter] = useState<Reiter | undefined>(props.reiter)
    return (
      <CoinDetailSeite
        coinId={ID}
        berechtigungen={STUFEN.anonym}
        seite={1}
        onStatus={() => {}}
        onSeite={() => {}}
        {...props}
        reiter={reiter}
        onReiter={(neu: Reiter) => {
          onReiter(neu)
          if (wechseln) setReiter(neu)
        }}
      />
    )
  }
  const user = userEvent.setup()
  zeigeMitRouter(() => <MitReitern />, { pfad: '/coins/$coinId', start: `/coins/${ID}` })
  return user
}

async function geladen(name = 'Coin Alpha'): Promise<HTMLElement> {
  return screen.findByRole('heading', { level: 1, name })
}

const kennzahlen = () => screen.queryByRole('region', { name: 'Kennzahlen' })

/** Werte der Kennzahlen-Beschreibungsliste als Paare. */
function kennzahlWerte(): Array<[string, string]> {
  const region = kennzahlen()
  expect(region, 'Region „Kennzahlen“ fehlt').not.toBeNull()
  return [...(region as HTMLElement).querySelectorAll('dt')].map((dt) => {
    let dd = dt.nextElementSibling
    while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling
    dd ??= dt.parentElement?.querySelector('dd') ?? null
    return [dt.textContent?.trim() ?? '', dd?.textContent?.trim() ?? '']
  })
}

// ---------- AK-19: Kopf und Status-Chips ----------

describe('Kopf und Status-Chips (AK-19)', () => {
  it('zeigt den Namen als einziges h1', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt anonym bei fehlender Auflage „Auflage unbekannt“', async () => {
    starte(testCoin({ id: ID, auflage: null }))
    zeige({ berechtigungen: STUFEN.anonym })
    await geladen()

    expect(screen.getByText('Auflage unbekannt')).toBeInTheDocument()
  })

  it('zeigt anonym bei bekannter Auflage keinen Verfügbarkeits-Chip', async () => {
    zeige({ berechtigungen: STUFEN.anonym })
    await geladen()

    expect(screen.queryByText('Exemplare verfügbar')).not.toBeInTheDocument()
    expect(screen.queryByText('Alle Exemplare ausgegeben')).not.toBeInTheDocument()
    expect(screen.queryByText('Auflage unbekannt')).not.toBeInTheDocument()
  })

  it('zeigt mit coins.read und freien Exemplaren „Exemplare verfügbar“', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()

    expect(await screen.findByText('Exemplare verfügbar')).toBeInTheDocument()
    expect(screen.queryByText('Alle Exemplare ausgegeben')).not.toBeInTheDocument()
  })

  it('zeigt mit coins.read ohne freie Exemplare „Alle Exemplare ausgegeben“', async () => {
    starte(testCoin({ id: ID, auflage: 2 }), [
      testAusgabe({ exemplarNummer: 1 }),
      testAusgabe({ id: '0199a1b2-0000-7000-8000-00000000e002', exemplarNummer: 2 }),
    ])
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()

    expect(await screen.findByText('Alle Exemplare ausgegeben')).toBeInTheDocument()
    expect(screen.queryByText('Exemplare verfügbar')).not.toBeInTheDocument()
  })

  it('zeigt mit coins.read bei fehlender Auflage nur „Auflage unbekannt“', async () => {
    starte(testCoin({ id: ID, auflage: null }))
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()
    await waitFor(() => expect(api.anfragenMit('GET', EXEMPLARE)).toHaveLength(1))

    expect(screen.getByText('Auflage unbekannt')).toBeInTheDocument()
    expect(screen.queryByText('Exemplare verfügbar')).not.toBeInTheDocument()
    expect(screen.queryByText('Alle Exemplare ausgegeben')).not.toBeInTheDocument()
  })

  it('stellt die Chips in den Kopf vor die Kennzahlen', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    const h1 = await geladen()
    const chip = await screen.findByText('Exemplare verfügbar')

    expect(h1.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(chip.compareDocumentPosition(kennzahlen() as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// ---------- AK-20: Aktionen im Kopf ----------

describe('Aktionen im Kopf (AK-20)', () => {
  it('zeigt mit allen Rechten „Auflage ändern“, „Bearbeiten“ und „Ausgabe erfassen“ in dieser Reihenfolge', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()

    const auflage = await screen.findByRole('button', { name: 'Auflage ändern' })
    const bearbeiten = screen.getByRole('link', { name: 'Bearbeiten' })
    const erfassen = await screen.findByRole('link', { name: 'Ausgabe erfassen' })
    expect(auflage.compareDocumentPosition(bearbeiten) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bearbeiten.compareDocumentPosition(erfassen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('zeigt jede Aktion genau einmal auf der Seite', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()
    await screen.findByRole('link', { name: 'Ausgabe erfassen' })

    expect(screen.getAllByRole('button', { name: 'Auflage ändern' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Bearbeiten' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Ausgabe erfassen' })).toHaveLength(1)
  })

  it('stellt die Aktionen vor die Kennzahlen und die Reiter', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()
    const erfassen = await screen.findByRole('link', { name: 'Ausgabe erfassen' })

    expect(
      erfassen.compareDocumentPosition(kennzahlen() as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      erfassen.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('verlinkt „Ausgabe erfassen“ auf /coins/{id}/ausgaben/neu', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()

    expect(await screen.findByRole('link', { name: 'Ausgabe erfassen' })).toHaveAttribute(
      'href',
      `/coins/${ID}/ausgaben/neu`,
    )
  })

  it('zeigt „Ausgabe erfassen“ nicht, wenn alle Exemplare ausgegeben sind', async () => {
    starte(testCoin({ id: ID, auflage: 1 }), [testAusgabe({ exemplarNummer: 1 })])
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()
    await screen.findByText('Alle Exemplare ausgegeben')

    expect(screen.queryByRole('link', { name: 'Ausgabe erfassen' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Auflage ändern' })).toBeInTheDocument()
  })

  it('zeigt „Ausgabe erfassen“ nicht bei unbekannter Auflage', async () => {
    starte(testCoin({ id: ID, auflage: null }))
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()
    await waitFor(() => expect(api.anfragenMit('GET', EXEMPLARE)).toHaveLength(1))

    expect(screen.queryByRole('link', { name: 'Ausgabe erfassen' })).not.toBeInTheDocument()
  })

  it.each([
    ['Betrachter', STUFEN.betrachter],
    ['anonym/ohne Rolle', STUFEN.anonym],
  ])('zeigt %s keine der Aktionen', async (_, berechtigungen) => {
    zeige({ berechtigungen })
    await geladen()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.queryByRole('button', { name: 'Auflage ändern' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ausgabe erfassen' })).not.toBeInTheDocument()
  })

  it('zeigt im Reiter „Exemplare“ keine eigenen Aktionen', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter, reiter: 'exemplare' })
    await geladen()

    const panel = await screen.findByRole('tabpanel', { name: 'Exemplare' })
    expect(within(panel).queryByRole('button', { name: 'Auflage ändern' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('link', { name: 'Ausgabe erfassen' })).not.toBeInTheDocument()
  })
})

// ---------- AK-21: Kennzahlen ----------

describe('Kennzahlen (AK-21)', () => {
  it('zeigt die Region „Kennzahlen“ mit Auflage, Ausgegeben und Verfügbar in de-DE', async () => {
    starte(testCoin({ id: ID, auflage: 1500 }), [testAusgabe({ exemplarNummer: 1 })])
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()

    await waitFor(() =>
      expect(kennzahlWerte()).toEqual([
        ['Auflage', '1.500'],
        ['Ausgegeben', '1'],
        ['Verfügbar', '1.499'],
      ]),
    )
  })

  it('zeigt bei fehlender Auflage „unbekannt“ und keinen Fortschrittsbalken', async () => {
    starte(testCoin({ id: ID, auflage: null }))
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()

    await waitFor(() => expect(kennzahlWerte()[0]).toEqual(['Auflage', 'unbekannt']))
    expect(within(kennzahlen() as HTMLElement).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('zeigt einen Fortschrittsbalken mit aria-valuenow, aria-valuemax und aria-valuetext', async () => {
    starte(testCoin({ id: ID, auflage: 150 }), [
      testAusgabe({ exemplarNummer: 1 }),
      testAusgabe({ id: '0199a1b2-0000-7000-8000-00000000e002', exemplarNummer: 2 }),
      testAusgabe({ id: '0199a1b2-0000-7000-8000-00000000e003', exemplarNummer: 3 }),
    ])
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()

    const balken = await within(await screen.findByRole('region', { name: 'Kennzahlen' })).findByRole('progressbar')
    expect(balken).toHaveAttribute('aria-valuenow', '147')
    expect(balken).toHaveAttribute('aria-valuemax', '150')
    expect(balken).toHaveAttribute('aria-valuetext', '147 von 150 verfügbar (98 %)')
  })

  it('sendet genau einen Request auf …/exemplare für Kennzahlen und Reiter „Exemplare“', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()
    await screen.findByRole('table', { name: 'Exemplare' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.anfragenMit('GET', EXEMPLARE)).toHaveLength(1)
  })

  it('lädt beim Wechsel auf „Stammdaten“ und zurück die Exemplare nicht erneut', async () => {
    const user = zeige({ berechtigungen: STUFEN.betrachter })
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('tab', { name: 'Stammdaten' }))
    await user.click(screen.getByRole('tab', { name: 'Exemplare' }))
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(api.anfragenMit('GET', EXEMPLARE)).toHaveLength(1)
  })

  it('zeigt ohne coins.read keine Kennzahlen und sendet keinen Request auf …/exemplare', async () => {
    zeige({ berechtigungen: STUFEN.anonym })
    await geladen()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(kennzahlen()).toBeNull()
    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${ID}`])
  })
})

// ---------- AK-22: Reiter ----------

describe('Reiter (AK-22)', () => {
  it('zeigt ohne coins.read keine Reiterleiste, die Stammdaten direkt', async () => {
    zeige({ berechtigungen: STUFEN.anonym })
    await geladen()

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Stammdaten' })).toBeInTheDocument()
  })

  it('zeigt dem Betrachter die Reiter „Stammdaten“ und „Exemplare“', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()

    expect(
      within(screen.getByRole('tablist'))
        .getAllByRole('tab')
        .map((t) => t.textContent?.trim()),
    ).toEqual(['Stammdaten', 'Exemplare'])
  })

  it('zeigt mit allen Rechten die vier Reiter in fester Reihenfolge', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()

    expect(
      within(screen.getByRole('tablist'))
        .getAllByRole('tab')
        .map((t) => t.textContent?.trim()),
    ).toEqual(['Stammdaten', 'Exemplare', 'Ausgaben', 'Zertifikatsvorlage'])
  })

  it('öffnet ohne reiter den Reiter „Exemplare“ (aria-selected, tabpanel mit Namen)', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()

    expect(screen.getByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Stammdaten' })).toHaveAttribute('aria-selected', 'false')
    const panel = screen.getByRole('tabpanel', { name: 'Exemplare' })
    expect(within(panel).getByRole('heading', { level: 2, name: 'Exemplare' })).toBeInTheDocument()
  })

  it('rendert die Inhalte nicht gewählter Reiter nicht', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(screen.queryByRole('heading', { level: 2, name: 'Stammdaten' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Ausgabehistorie' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  })

  it('lädt die Ausgabehistorie erst beim Öffnen von „Ausgaben“', async () => {
    const user = zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await screen.findByRole('table', { name: 'Exemplare' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.anfragenMit('GET', AUSGABEN)).toHaveLength(0)

    await user.click(screen.getByRole('tab', { name: 'Ausgaben' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Ausgabehistorie' })).toBeInTheDocument()
    expect(api.anfragenMit('GET', AUSGABEN)).toHaveLength(1)
  })

  it('lädt die Zertifikatsvorlage erst beim Öffnen von „Zertifikatsvorlage“', async () => {
    const user = zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await screen.findByRole('table', { name: 'Exemplare' })
    expect(api.anfragenMit('GET', VORLAGE)).toHaveLength(0)

    await user.click(screen.getByRole('tab', { name: 'Zertifikatsvorlage' }))

    await waitFor(() => expect(api.anfragenMit('GET', VORLAGE)).toHaveLength(1))
    expect(screen.getByRole('tabpanel', { name: 'Zertifikatsvorlage' })).toBeInTheDocument()
  })

  it('meldet einen Reiterwechsel per Klick über onReiter', async () => {
    const user = zeige({ berechtigungen: STUFEN.sachbearbeiter, wechseln: false })
    await geladen()

    await user.click(screen.getByRole('tab', { name: 'Ausgaben' }))

    expect(onReiter).toHaveBeenCalledWith('ausgaben')
  })

  it('bewegt per Pfeiltaste nur den Fokus und wählt per Enter (manuelle Aktivierung)', async () => {
    const user = zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()
    screen.getByRole('tab', { name: 'Exemplare' }).focus()

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Ausgaben' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
    expect(onReiter).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')

    expect(onReiter).toHaveBeenCalledWith('ausgaben')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Ausgaben' })).toHaveAttribute('aria-selected', 'true'))
  })

  it('wählt per Leertaste den fokussierten Reiter', async () => {
    const user = zeige({ berechtigungen: STUFEN.betrachter })
    await geladen()
    screen.getByRole('tab', { name: 'Exemplare' }).focus()

    await user.keyboard('{ArrowLeft}')
    await user.keyboard(' ')

    expect(onReiter).toHaveBeenCalledWith('stammdaten')
    expect(await screen.findByRole('heading', { level: 2, name: 'Stammdaten' })).toBeInTheDocument()
  })

  it('hat nur einen Tab-Stopp in der Reiterleiste (aktiver Reiter)', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()

    const fokussierbar = within(screen.getByRole('tablist'))
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('tabindex') !== '-1')
    expect(fokussierbar.map((t) => t.textContent?.trim())).toEqual(['Exemplare'])
  })
})

// ---------- AK-23: reiter-Prop ----------

describe('reiter aus der URL (AK-23)', () => {
  it.each([
    ['stammdaten', 'Stammdaten'],
    ['exemplare', 'Exemplare'],
    ['ausgaben', 'Ausgaben'],
    ['vorlage', 'Zertifikatsvorlage'],
  ] as const)('öffnet mit reiter=%s den Reiter „%s“', async (reiter, name) => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter, reiter })
    await geladen()

    expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name })).toBeInTheDocument()
  })

  it('zeigt dem Betrachter mit reiter=ausgaben (nicht erlaubt) den Standardreiter ohne Fehler', async () => {
    zeige({ berechtigungen: STUFEN.betrachter, reiter: 'ausgaben' })
    await geladen()

    expect(screen.getByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.anfragenMit('GET', AUSGABEN)).toHaveLength(0)
  })

  it('zeigt anonym mit reiter=exemplare die Stammdaten ohne Reiterleiste und ohne Request', async () => {
    zeige({ berechtigungen: STUFEN.anonym, reiter: 'exemplare' })
    await geladen()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${ID}`])
  })

  it('öffnet nach dem Erfassen einer Ausgabe den Reiter „Ausgaben“', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter, meldung: { art: 'ausgabeErfasst', nummer: 1 } })
    await geladen()

    expect(screen.getByRole('tab', { name: 'Ausgaben' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(meldungMit('Exemplar Nr. 1 wurde ausgegeben.')).toBeDefined())
  })
})

// ---------- AK-24: Exemplar-Filter als Chip ----------

describe('Exemplar-Filter als Chip (AK-24)', () => {
  it.each([
    ['verfuegbar', 'Status: Verfügbar'],
    ['ausgegeben', 'Status: Ausgegeben'],
  ] as const)('zeigt bei status=%s den Chip „%s“', async (status, text) => {
    zeige({ berechtigungen: STUFEN.betrachter, status })
    await geladen()

    const liste = await screen.findByRole('list', { name: 'Aktive Filter' })
    expect(liste).toHaveTextContent(text)
  })

  it('zeigt ohne Filter keine Liste „Aktive Filter“', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
  })

  it('setzt beim Entfernen des Chips „Alle“ (onStatus ohne Wert)', async () => {
    const onStatus = vi.fn()
    const user = zeige({ berechtigungen: STUFEN.betrachter, status: 'verfuegbar', onStatus })
    await geladen()

    await user.click(await screen.findByRole('button', { name: 'Filter „Status: Verfügbar“ entfernen' }))

    expect(onStatus).toHaveBeenCalledWith(undefined)
  })
})

// ---------- AK-25: Auflage ändern und Storno aktualisieren die Kennzahlen ----------

describe('Aktualisierung der Kennzahlen (AK-25)', () => {
  it('aktualisiert nach „Auflage ändern“ im Kopf die Kennzahlen und meldet „Auflage wurde geändert.“', async () => {
    starte(testCoin({ id: ID, auflage: 150 }))
    const user = zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await geladen()

    await user.click(await screen.findByRole('button', { name: 'Auflage ändern' }))
    const dialog = await screen.findByRole('dialog', { name: 'Auflage ändern' })
    const feld = within(dialog).getByLabelText(/^Auflage/)
    await user.clear(feld)
    await user.type(feld, '200')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(meldungMit('Auflage wurde geändert.')?.getAttribute('role')).toBe('status'))
    await waitFor(() => expect(kennzahlWerte()[0]).toEqual(['Auflage', '200']))
  })

  it('aktualisiert nach einem Storno in der Historie die Kennzahlen', async () => {
    starte(testCoin({ id: ID, auflage: 150 }), [testAusgabe({ exemplarNummer: 1 })])
    const user = zeige({ berechtigungen: STUFEN.sachbearbeiter, reiter: 'ausgaben' })
    await geladen()
    await waitFor(() => expect(kennzahlWerte()[1]).toEqual(['Ausgegeben', '1']))

    await user.click(await screen.findByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await user.type(within(dialog).getByLabelText(/^Grund/), 'Doppelt')
    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await waitFor(() => expect(kennzahlWerte()[1]).toEqual(['Ausgegeben', '0']))
  })
})

// ---------- Reiter „Zertifikatsvorlage“: umgezogen aus CoinBearbeitenSeite.test.tsx (F2, Freigabe 2026-11-14) ----------
// Gleiche Prüfinhalte wie bisher auf „Coin bearbeiten“: Abschnitt „Zertifikatsvorlage“ als Ebene 2, Laden von Coin und
// Vorlagenstatus, Tab-Reihenfolge der Vorlage-Bedienelemente (Dateifeld, dann „Vorlage hochladen“).

describe('Reiter „Zertifikatsvorlage“ (umgezogen aus „Coin bearbeiten“, F2)', () => {
  it('hat den Abschnitt „Zertifikatsvorlage“ als Ebene 2', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter, reiter: 'vorlage' })
    await geladen()

    const panel = await screen.findByRole('tabpanel', { name: 'Zertifikatsvorlage' })
    expect(await within(panel).findByRole('heading', { level: 2, name: 'Zertifikatsvorlage' })).toBeInTheDocument()
  })

  it('lädt den Coin und den Vorlagenstatus', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter, reiter: 'vorlage' })
    await geladen()

    await waitFor(() => expect(api.anfragenMit('GET', VORLAGE)).toHaveLength(1))
    expect(api.anfragenMit('GET', /^\/api\/coins\/[^/]+$/)).toHaveLength(1)
  })

  it('erreicht Dateifeld und „Vorlage hochladen“ in der Reihenfolge des Abschnitts', async () => {
    const user = zeige({ berechtigungen: STUFEN.sachbearbeiter, reiter: 'vorlage' })
    await geladen()
    await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' })
    const ziele = [
      screen.getByLabelText(/^Word-Vorlage \(\.docx\)/),
      screen.getByRole('button', { name: 'Vorlage hochladen' }),
    ]

    const reihenfolge: Element[] = []
    for (let i = 0; i < 60 && reihenfolge.length < ziele.length; i++) {
      await user.tab()
      if (ziele.includes(document.activeElement as HTMLElement) && !reihenfolge.includes(document.activeElement!)) {
        reihenfolge.push(document.activeElement!)
      }
    }

    expect(reihenfolge).toEqual(ziele)
  })
})
