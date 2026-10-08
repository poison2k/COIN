import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExemplarTabelle, Kennzahlen } from '../index'

// Feature coin-ausgaben, AK-20: Kennzahlen als <dl> („Auflage“, „Ausgegeben“, „Verfügbar“, Zahlen de-DE) und die
// Exemplar-Tabelle (sr-only-Caption „Exemplare“, Spalten „Nr.“ und „Status“, Status als Text-Badge).

/** Wert zu einem Begriff der Beschreibungsliste (<dt> → folgendes <dd>). */
function wertZu(begriff: string): HTMLElement {
  const dt = [...document.querySelectorAll('dl dt')].find((el) => el.textContent?.trim() === begriff)
  expect(dt, `Begriff „${begriff}“ fehlt`).toBeDefined()
  let dd = dt?.nextElementSibling ?? null
  while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling
  expect(dd).not.toBeNull()
  return dd as HTMLElement
}

describe('Kennzahlen', () => {
  it('zeigt Auflage, Ausgegeben und Verfügbar in dieser Reihenfolge als Beschreibungsliste', () => {
    render(<Kennzahlen kennzahlen={{ auflage: 150, ausgegeben: 37, verfuegbar: 113 }} />)

    expect([...document.querySelectorAll('dl dt')].map((dt) => dt.textContent?.trim())).toEqual([
      'Auflage',
      'Ausgegeben',
      'Verfügbar',
    ])
  })

  it('zeigt die Werte', () => {
    render(<Kennzahlen kennzahlen={{ auflage: 150, ausgegeben: 37, verfuegbar: 113 }} />)

    expect([wertZu('Auflage'), wertZu('Ausgegeben'), wertZu('Verfügbar')].map((dd) => dd.textContent?.trim())).toEqual([
      '150',
      '37',
      '113',
    ])
  })

  it('formatiert große Zahlen im deutschen Format', () => {
    render(<Kennzahlen kennzahlen={{ auflage: 1_000_000, ausgegeben: 12_500, verfuegbar: 987_500 }} />)

    expect([wertZu('Auflage'), wertZu('Ausgegeben'), wertZu('Verfügbar')].map((dd) => dd.textContent?.trim())).toEqual([
      '1.000.000',
      '12.500',
      '987.500',
    ])
  })

  it('zeigt 0 ausgegeben als Zahl', () => {
    render(<Kennzahlen kennzahlen={{ auflage: 10, ausgegeben: 0, verfuegbar: 10 }} />)

    expect(wertZu('Ausgegeben')).toHaveTextContent(/^0$/)
  })
})

describe('ExemplarTabelle', () => {
  const exemplare = [
    { nummer: 1, status: 'verfuegbar' as const },
    { nummer: 2, status: 'ausgegeben' as const },
  ]

  it('ist eine Tabelle mit dem zugänglichen Namen „Exemplare“', () => {
    render(<ExemplarTabelle exemplare={exemplare} />)

    expect(screen.getByRole('table', { name: 'Exemplare' })).toBeInTheDocument()
  })

  it('hat eine nur für Screenreader sichtbare Caption', () => {
    render(<ExemplarTabelle exemplare={exemplare} />)

    expect(screen.getByRole('table').querySelector('caption')).toHaveClass('sr-only')
  })

  it('hat die Spalten „Nr.“ und „Status“', () => {
    render(<ExemplarTabelle exemplare={exemplare} />)

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual(['Nr.', 'Status'])
  })

  it('zeigt je Exemplar Nummer und Status als Text', () => {
    render(<ExemplarTabelle exemplare={exemplare} />)

    const zeilen = screen.getAllByRole('row').slice(1)
    expect(zeilen.map((z) => z.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['1 verfügbar', '2 ausgegeben'])
  })

  it('formatiert Nummern im deutschen Format', () => {
    render(<ExemplarTabelle exemplare={[{ nummer: 12500, status: 'verfuegbar' }]} />)

    expect(screen.getAllByRole('row')[1]).toHaveTextContent('12.500')
  })
})
