import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testAuditEintrag } from '../../../../test/fakeApi'
import { stubBreite } from '../../../../test/matchMedia'
import { AuditTabelle } from '../index'

// Feature formulare-detailseiten, AK-30 und AK-31 (Abschnitt 4.7.1): Audit-Log mit fester Serversortierung
// „Zeitpunkt“ absteigend (aria-sort, ohne Button), Karten unter 768 px.

describe('AuditTabelle (AK-31)', () => {
  it('zeigt die feste Sortierung „Zeitpunkt“ absteigend per aria-sort ohne Button', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag()]} />)

    const zeitpunkt = screen.getByRole('columnheader', { name: 'Zeitpunkt' })
    expect(zeitpunkt).toHaveAttribute('aria-sort', 'descending')
    expect(within(zeitpunkt).queryByRole('button')).not.toBeInTheDocument()
  })

  it('setzt aria-sort an keiner anderen Spalte', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag()]} />)

    const mitSortierung = screen.getAllByRole('columnheader').filter((th) => th.hasAttribute('aria-sort'))
    expect(mitSortierung.map((th) => th.textContent?.trim())).toEqual(['Zeitpunkt'])
  })
})

describe('Kartenansicht (AK-30)', () => {
  it('zeigt bei 360 px Karten in einer Liste „Audit-Log“', () => {
    stubBreite(360)
    render(<AuditTabelle eintraege={[testAuditEintrag()]} />)

    expect(screen.getByRole('list', { name: 'Audit-Log' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
