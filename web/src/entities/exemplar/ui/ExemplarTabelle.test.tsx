import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { stubBreite } from '../../../../test/matchMedia'
import { ExemplarTabelle } from '../index'

// Feature formulare-detailseiten, AK-29 bis AK-31 (Abschnitt 4.7.1): Exemplare mit fester Serversortierung „Nr.“
// aufsteigend (aria-sort, ohne Button), Karten unter 768 px. Caption, Spaltentitel und Zeilentexte bleiben.

const EXEMPLARE = [
  { nummer: 1, status: 'ausgegeben' as const },
  { nummer: 2, status: 'verfuegbar' as const },
]

describe('ExemplarTabelle (AK-29, AK-31)', () => {
  it('heißt weiterhin „Exemplare“ mit den Spalten „Nr.“ und „Status“', () => {
    render(<ExemplarTabelle exemplare={EXEMPLARE} />)

    const tabelle = screen.getByRole('table', { name: 'Exemplare' })
    expect(
      within(tabelle)
        .getAllByRole('columnheader')
        .map((th) => th.textContent?.trim()),
    ).toEqual(['Nr.', 'Status'])
  })

  it('zeigt die feste Sortierung „Nr.“ aufsteigend per aria-sort ohne Button', () => {
    render(<ExemplarTabelle exemplare={EXEMPLARE} />)

    const nr = screen.getByRole('columnheader', { name: 'Nr.' })
    expect(nr).toHaveAttribute('aria-sort', 'ascending')
    expect(within(nr).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('Kartenansicht (AK-30)', () => {
  it('zeigt bei 360 px Karten in einer Liste „Exemplare“', () => {
    stubBreite(360)
    render(<ExemplarTabelle exemplare={EXEMPLARE} />)

    const liste = screen.getByRole('list', { name: 'Exemplare' })
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
