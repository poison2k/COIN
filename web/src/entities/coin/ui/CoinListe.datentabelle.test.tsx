import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Coin } from '../model/types'
import { testCoin } from '../../../../test/fakeApi'
import { stubBreite } from '../../../../test/matchMedia'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinListe } from './CoinListe'

// Feature nacharbeiten-audit-filter, AK-29 bis AK-31 (Abschnitt 4.10, ADR-0046): `CoinListe` rendert nur noch
// `DatenTabelle` (Caption „Coins“, feste Serversortierung nach Name nur per aria-sort ohne Sortier-Button, Zeilenklick,
// Karten unter 768 px). Ab 768 px Tabelle wie bisher, darunter `<ul aria-label="Coins">` mit je einer Karte (h3 mit
// Link, dl mit Bild, Herausgeber, Auflage, Erfasst am), keine Tabelle.

const ID_A = '0199a1b2-0000-7000-8000-00000000000a'
const ID_B = '0199a1b2-0000-7000-8000-00000000000b'

async function zeige(coins: Coin[], breite: number) {
  stubBreite(breite)
  const user = userEvent.setup()
  const ergebnis = zeigeMitRouter(() => <CoinListe coins={coins} />)
  await waitFor(() =>
    expect(
      screen.queryByRole('table') ?? screen.queryByRole('list') ?? screen.queryByText('Noch keine Coins erfasst.'),
    ).not.toBeNull(),
  )
  return { user, ...ergebnis }
}

const ZWEI = [
  testCoin({ id: ID_A, name: 'Coin Alpha', herausgeber: 'Herausgeber Beta', auflage: null }),
  testCoin({ id: ID_B, name: 'Coin Gamma', herausgeber: 'Herausgeber Delta', auflage: 250 }),
]

describe('Tabelle ab 768 px (AK-30)', () => {
  it('zeigt die Tabelle „Coins“', async () => {
    await zeige(ZWEI, 1280)

    expect(screen.getByRole('table', { name: 'Coins' })).toBeInTheDocument()
  })

  it('setzt aria-sort="ascending" an der Spalte „Name“', async () => {
    await zeige(ZWEI, 1280)

    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('setzt aria-sort an keiner anderen Spalte', async () => {
    await zeige(ZWEI, 1280)

    const sortiert = screen.getAllByRole('columnheader').filter((th) => th.hasAttribute('aria-sort'))
    expect(sortiert.map((th) => th.textContent?.trim())).toEqual(['Name'])
  })

  it('bietet keinen Sortier-Button im Tabellenkopf', async () => {
    await zeige(ZWEI, 1280)

    const kopf = screen.getAllByRole('rowgroup')[0]
    expect(within(kopf).queryAllByRole('button')).toEqual([])
  })

  it('hat genau einen Link je Zeile', async () => {
    await zeige(ZWEI, 1280)

    const zeilen = screen.getAllByRole('row').slice(1)
    expect(zeilen.map((z) => within(z).getAllByRole('link').length)).toEqual([1, 1])
  })
})

describe('Karten unter 768 px (AK-31)', () => {
  it('zeigt die Liste „Coins“ statt einer Tabelle', async () => {
    await zeige(ZWEI, 360)

    expect(screen.getByRole('list', { name: 'Coins' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('zeigt je Coin eine Karte', async () => {
    await zeige(ZWEI, 360)

    expect(within(screen.getByRole('list', { name: 'Coins' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('zeigt den Namen als h3 mit Link zur Detailseite', async () => {
    await zeige(ZWEI, 360)

    const titel = screen.getByRole('heading', { level: 3, name: 'Coin Alpha' })
    expect(within(titel).getByRole('link', { name: 'Coin Alpha' })).toHaveAttribute('href', `/coins/${ID_A}`)
  })

  it('zeigt in der Karte die Felder Bild, Herausgeber, Auflage und Erfasst am', async () => {
    await zeige(ZWEI, 360)

    const karte = within(screen.getByRole('list', { name: 'Coins' })).getAllByRole('listitem')[0]
    expect(
      within(karte)
        .getAllByRole('term')
        .map((dt) => dt.textContent?.trim()),
    ).toEqual(['Bild', 'Herausgeber', 'Auflage', 'Erfasst am'])
  })

  it('zeigt ohne Auflage das Badge „unbekannt“', async () => {
    await zeige(ZWEI, 360)

    const karte = within(screen.getByRole('list', { name: 'Coins' })).getAllByRole('listitem')[0]
    expect(within(karte).getByText('unbekannt')).toBeInTheDocument()
  })

  it('zeigt ohne Bild „Kein Bild“', async () => {
    await zeige([testCoin({ id: ID_A, name: 'Coin Alpha', bildUrl: null })], 360)

    expect(within(screen.getByRole('listitem')).getByText('Kein Bild')).toBeInTheDocument()
  })

  it('hat je Karte genau einen Link', async () => {
    await zeige(ZWEI, 360)

    const karten = within(screen.getByRole('list', { name: 'Coins' })).getAllByRole('listitem')
    expect(karten.map((k) => within(k).getAllByRole('link').length)).toEqual([1, 1])
  })

  it('zeigt die Karten in der übergebenen Reihenfolge', async () => {
    await zeige([ZWEI[1], ZWEI[0]], 360)

    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim())).toEqual([
      'Coin Gamma',
      'Coin Alpha',
    ])
  })
})

describe('Leer (AK-30)', () => {
  it('zeigt ohne Coins „Noch keine Coins erfasst.“', async () => {
    await zeige([], 1280)

    expect(screen.getByText('Noch keine Coins erfasst.')).toBeInTheDocument()
  })
})
