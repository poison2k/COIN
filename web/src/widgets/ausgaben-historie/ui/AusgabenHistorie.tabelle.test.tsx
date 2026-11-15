import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import { erstelleFakeApi, testAusgabe, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { stubBreite } from '../../../../test/matchMedia'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabenHistorie } from '../index'

// Feature formulare-detailseiten, AK-29 bis AK-34 (Abschnitt 4.7, ADR-0041) für die Ausgabehistorie: feste
// Serversortierung „Erfasst“ absteigend per aria-sort, Statusfilter aktiv/storniert (Server-Parameter `status`, F8) mit
// Chip, Zeilenklick zur Ausgabe-Seite (`useZeilenklick`), Karten unter 1024 px.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const GET = /^\/api\/coins\/[^/]+\/ausgaben$/

let api: FakeApi

function ausgabeNr(nr: number, teil: Partial<Ausgabe> = {}): Ausgabe {
  return testAusgabe({ id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, 'e')}`, exemplarNummer: nr, ...teil })
}

const STORNIERT = ausgabeNr(2, {
  storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Doppelt' },
})

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })], {
    ausgaben: { [COIN_ID]: [ausgabeNr(3), STORNIERT, ausgabeNr(1)] },
  })
  vi.stubGlobal('fetch', api.fetch)
})

function zeige() {
  const user = userEvent.setup()
  const { router } = zeigeMitRouter(() => (
    <AusgabenHistorie coinId={COIN_ID} darfStornieren darfZertifikat onGeaendert={vi.fn()} />
  ))
  return { user, router }
}

async function tabelle(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: 'Ausgabehistorie' })
}

function zeileMit(nummer: string): HTMLElement {
  const link = screen.getByRole('link', { name: `Ausgabe ${nummer} anzeigen` })
  return link.closest('tr') as HTMLElement
}

describe('Tabelle (AK-29, AK-31)', () => {
  it('behält die Spaltentitel', async () => {
    zeige()

    const kopf = within(await tabelle())
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim())
    expect(kopf).toEqual(
      expect.arrayContaining(['Nr.', 'Empfänger', 'Datum', 'Gelegenheit', 'Begründung', 'Erfasst', 'Status']),
    )
  })

  it('zeigt die feste Sortierung „Erfasst“ absteigend per aria-sort', async () => {
    zeige()
    await tabelle()

    expect(screen.getByRole('columnheader', { name: 'Erfasst' })).toHaveAttribute('aria-sort', 'descending')
  })

  it('hat keine Sortier-Buttons in den Spaltenköpfen', async () => {
    zeige()

    for (const th of within(await tabelle()).getAllByRole('columnheader')) {
      expect(within(th).queryByRole('button')).not.toBeInTheDocument()
    }
  })
})

describe('Zeilenklick (AK-32)', () => {
  it('öffnet per Mausklick in eine Zelle die Ausgabe-Seite', async () => {
    const { user, router } = zeige()
    await tabelle()

    await user.click(within(zeileMit('C0042-0003')).getAllByRole('cell')[1])

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${COIN_ID}/ausgaben/${ausgabeNr(3).id}`))
  })

  it('navigiert bei einem Folgeklick (detail 2) nicht', async () => {
    const { router } = zeige()
    await tabelle()

    fireEvent.click(within(zeileMit('C0042-0003')).getAllByRole('cell')[1], { detail: 2 })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(router.state.location.pathname).toBe('/test')
  })

  it.each(['Control', 'Meta', 'Shift', 'Alt'])('navigiert bei %s-Klick in eine Zelle nicht', async (taste) => {
    const { user, router } = zeige()
    await tabelle()

    await user.keyboard(`{${taste}>}`)
    await user.click(within(zeileMit('C0042-0003')).getAllByRole('cell')[1])
    await user.keyboard(`{/${taste}}`)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(router.state.location.pathname).toBe('/test')
  })

  it('navigiert bei markiertem Text nicht', async () => {
    const { router } = zeige()
    await tabelle()
    const zelle = within(zeileMit('C0042-0003')).getAllByRole('cell')[1]
    window.getSelection()?.selectAllChildren(zelle)

    fireEvent.click(zelle, { detail: 1 })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(router.state.location.pathname).toBe('/test')
    window.getSelection()?.removeAllRanges()
  })

  it('navigiert beim Klick auf „Stornieren“ nicht zur Ausgabe-Seite', async () => {
    const { user, router } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 3 stornieren' }))

    expect(await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/test')
  })

  it('erreicht jede Zeile per Tastatur über den Link „Ausgabe {Nummer} anzeigen“', async () => {
    zeige()
    await tabelle()

    // Stornierte Zeilen heißen laut Bestand (zertifikat-erzeugen AK-24) „Stornierte Ausgabe {Nummer} anzeigen“.
    for (const name of [
      'Ausgabe C0042-0003 anzeigen',
      'Stornierte Ausgabe C0042-0002 anzeigen',
      'Ausgabe C0042-0001 anzeigen',
    ]) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('nimmt die Zeile selbst nicht in die Tab-Reihenfolge auf', async () => {
    zeige()
    await tabelle()

    const zeilen = within(await tabelle()).getAllByRole('row')
    expect(zeilen.filter((z) => z.hasAttribute('tabindex'))).toEqual([])
  })
})

describe('Statusfilter (AK-33, F8)', () => {
  it('lädt beim Filter „Storniert“ mit status=storniert ab Seite 1', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Storniert' }))

    await waitFor(() => expect(api.anfragenMit('GET', GET).at(-1)?.query.get('status')).toBe('storniert'))
    expect(api.anfragenMit('GET', GET).at(-1)?.query.get('seite') ?? '1').toBe('1')
  })

  it('zeigt den aktiven Filter als Chip „Status: Storniert“', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Storniert' }))

    expect(await screen.findByRole('list', { name: 'Aktive Filter' })).toHaveTextContent('Status: Storniert')
  })

  it('zeigt nach dem Filtern nur die stornierte Ausgabe', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Storniert' }))

    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2))
    // Linkname der stornierten Zeile laut Bestand (zertifikat-erzeugen AK-24).
    expect(screen.getByRole('link', { name: 'Stornierte Ausgabe C0042-0002 anzeigen' })).toBeInTheDocument()
  })

  it('entfernt den Filter per Chip und fokussiert danach den Statusfilter', async () => {
    const { user } = zeige()
    await tabelle()
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Aktiv' }))
    await screen.findByRole('list', { name: 'Aktive Filter' })

    await user.click(screen.getByRole('button', { name: 'Filter „Status: Aktiv“ entfernen' }))

    await waitFor(() => expect(api.anfragenMit('GET', GET).at(-1)?.query.has('status')).toBe(false))
    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveFocus())
  })

  it('zeigt ohne Filter keine Chip-Liste', async () => {
    zeige()
    await tabelle()

    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
  })
})

describe('Kartenansicht unter 1024 px (AK-30, AK-32)', () => {
  it('zeigt bei 800 px statt der Tabelle eine Liste „Ausgabehistorie“', async () => {
    stubBreite(800)
    zeige()

    expect(await screen.findByRole('list', { name: 'Ausgabehistorie' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('macht den Kartentitel (h3) zum Link „Ausgabe {Nummer} anzeigen“', async () => {
    stubBreite(360)
    zeige()

    const liste = await screen.findByRole('list', { name: 'Ausgabehistorie' })
    const karte = within(liste).getAllByRole('listitem')[0]
    const titel = within(karte).getByRole('heading', { level: 3 })
    expect(within(titel).getByRole('link', { name: 'Ausgabe C0042-0003 anzeigen' })).toBeInTheDocument()
  })

  it('zeigt in der Karte die Felder als dl und die Aktionen', async () => {
    stubBreite(360)
    zeige()

    const liste = await screen.findByRole('list', { name: 'Ausgabehistorie' })
    const karte = within(liste).getAllByRole('listitem')[0]
    const begriffe = [...karte.querySelectorAll('dl dt')].map((dt) => dt.textContent?.trim())
    expect(begriffe).toEqual(expect.arrayContaining(['Empfänger', 'Datum', 'Status']))
    expect(within(karte).getByRole('button', { name: 'Ausgabe von Exemplar Nr. 3 stornieren' })).toBeInTheDocument()
  })

  it('stellt das Blättern unter die Karten', async () => {
    stubBreite(360)
    api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })], {
      ausgaben: { [COIN_ID]: Array.from({ length: 30 }, (_, i) => ausgabeNr(30 - i)) },
    })
    vi.stubGlobal('fetch', api.fetch)
    zeige()

    const liste = await screen.findByRole('list', { name: 'Ausgabehistorie' })
    const naechste = await screen.findByRole('button', { name: 'Nächste Seite' })
    expect(liste.compareDocumentPosition(naechste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
