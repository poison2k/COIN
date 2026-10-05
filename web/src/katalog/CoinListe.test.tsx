import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testCoin } from '../test/fakeApi'
import { CoinListe } from './CoinListe'

// AK-28: Katalogliste als Tabelle.

function zeileVon(name: string): HTMLElement {
  const zelle = screen.getByRole('cell', { name })
  const zeile = zelle.closest('tr')
  expect(zeile).not.toBeNull()
  return zeile as HTMLElement
}

describe('CoinListe', () => {
  it('zeigt eine Tabelle mit den Spalten Bild, Name, Herausgeber, Auflage, Erfasst am', () => {
    render(<CoinListe coins={[testCoin()]} />)

    const kopf = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(kopf).toEqual(['Bild', 'Name', 'Herausgeber', 'Auflage', 'Erfasst am'])
  })

  it('zeigt je Coin eine Zeile mit Name und Herausgeber', () => {
    render(
      <CoinListe
        coins={[
          testCoin({ id: 'a', name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' }),
          testCoin({ id: 'b', name: 'Coin Gamma', herausgeber: 'Herausgeber Delta' }),
        ]}
      />,
    )

    expect(within(zeileVon('Coin Alpha')).getByText('Herausgeber Beta')).toBeInTheDocument()
    expect(within(zeileVon('Coin Gamma')).getByText('Herausgeber Delta')).toBeInTheDocument()
  })

  it('zeigt die Coins in der übergebenen Reihenfolge', () => {
    render(<CoinListe coins={[testCoin({ id: 'a', name: 'Alpha' }), testCoin({ id: 'b', name: 'bravo' })]} />)

    const zeilen = screen.getAllByRole('row').slice(1)
    expect(zeilen.map((z) => within(z).queryByText(/Alpha|bravo/)?.textContent)).toEqual(['Alpha', 'bravo'])
  })

  it('zeigt die Auflage als Zahl', () => {
    render(<CoinListe coins={[testCoin({ auflage: 250 })]} />)

    expect(within(zeileVon('Coin Alpha')).getByText('250')).toBeInTheDocument()
  })

  it('zeigt „unbekannt“, wenn die Auflage null ist', () => {
    render(<CoinListe coins={[testCoin({ auflage: null })]} />)

    expect(within(zeileVon('Coin Alpha')).getByText('unbekannt')).toBeInTheDocument()
  })

  it('zeigt das Erfassungsdatum im deutschen Datumsformat', () => {
    render(<CoinListe coins={[testCoin({ erstelltAm: '2026-10-05T12:00:00+00:00' })]} />)

    expect(within(zeileVon('Coin Alpha')).getByText(/^0?5\.10\.2026$/)).toBeInTheDocument()
  })

  it('zeigt ein Vorschaubild mit Alternativtext „Motiv: {name}“ und der bildUrl als Quelle', () => {
    const bildUrl = '/api/coins/0199a1b2-0000-7000-8000-000000000001/bild?v=0123456789abcdef'
    render(<CoinListe coins={[testCoin({ bildUrl })]} />)

    const bild = within(zeileVon('Coin Alpha')).getByRole('img', { name: 'Motiv: Coin Alpha' })
    expect(bild).toHaveAttribute('src', bildUrl)
  })

  it('lädt das Vorschaubild verzögert (loading="lazy")', () => {
    render(<CoinListe coins={[testCoin({ bildUrl: '/api/coins/x/bild?v=1' })]} />)

    expect(screen.getByRole('img', { name: 'Motiv: Coin Alpha' })).toHaveAttribute('loading', 'lazy')
  })

  it('zeigt „Kein Bild“ und kein img, wenn der Coin kein Bild hat', () => {
    render(<CoinListe coins={[testCoin({ bildUrl: null })]} />)

    const zeile = zeileVon('Coin Alpha')
    expect(within(zeile).getByText('Kein Bild')).toBeInTheDocument()
    expect(within(zeile).queryByRole('img')).not.toBeInTheDocument()
  })

  it('zeigt „Noch keine Coins erfasst.“ bei leerer Liste', () => {
    render(<CoinListe coins={[]} />)

    expect(screen.getByText('Noch keine Coins erfasst.')).toBeInTheDocument()
  })

  it('zeigt bei leerer Liste keine Datenzeilen', () => {
    render(<CoinListe coins={[]} />)

    expect(screen.queryAllByRole('cell')).toHaveLength(0)
  })

  it('stellt HTML in Feldern als Text dar und führt es nicht aus', () => {
    render(<CoinListe coins={[testCoin({ name: '<img src=x onerror=alert(1)>' })]} />)

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
