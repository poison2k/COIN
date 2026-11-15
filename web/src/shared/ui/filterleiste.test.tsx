import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Filterleiste } from './filterleiste'

// Feature formulare-detailseiten, AK-33 und AK-35 (Abschnitt 4.7, 4.8, ADR-0041 Punkt 4): Filterleiste mit den
// Filterbedienelementen (`children`) und den aktiven Filtern als Chips in `<ul aria-label="Aktive Filter">`. Props
// `children`, `chips: { id, text, onEntfernen }[]`, `onAlleEntfernen?`. Nach dem Entfernen Fokus auf den nächsten Chip,
// sonst auf das erste Filterbedienelement.

interface Filter {
  id: string
  text: string
}

function Test({ start, mitAlle }: { start: Filter[]; mitAlle: boolean }) {
  const [filter, setFilter] = useState(start)
  return (
    <Filterleiste
      chips={filter.map((f) => ({ ...f, onEntfernen: () => setFilter((alt) => alt.filter((x) => x.id !== f.id)) }))}
      onAlleEntfernen={mitAlle ? () => setFilter([]) : undefined}
    >
      <label htmlFor="suche">Benutzer suchen</label>
      <input id="suche" type="search" />
      <button type="button">Suchen</button>
    </Filterleiste>
  )
}

function zeige(start: Filter[], mitAlle = true) {
  const user = userEvent.setup()
  render(<Test start={start} mitAlle={mitAlle} />)
  return user
}

const STATUS = { id: 'status', text: 'Status: Verfügbar' }
const SUCHE = { id: 'suche', text: 'Suche: Test' }

describe('Chips (AK-33)', () => {
  it('zeigt die aktiven Filter in der Liste „Aktive Filter“', () => {
    zeige([STATUS])

    const liste = screen.getByRole('list', { name: 'Aktive Filter' })
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1)
    expect(liste).toHaveTextContent('Status: Verfügbar')
  })

  it('hat je Chip einen Button „Filter „{Filter}: {Wert}“ entfernen“', () => {
    zeige([STATUS])

    expect(screen.getByRole('button', { name: 'Filter „Status: Verfügbar“ entfernen' })).toBeInTheDocument()
  })

  it('zeigt ohne aktive Filter keine Liste', () => {
    zeige([])

    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
  })

  it('zeigt die Filterbedienelemente', () => {
    zeige([])

    expect(screen.getByRole('searchbox', { name: 'Benutzer suchen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suchen' })).toBeInTheDocument()
  })

  it('ruft beim Entfernen onEntfernen des Chips auf', async () => {
    const onEntfernen = vi.fn()
    const user = userEvent.setup()
    render(
      <Filterleiste chips={[{ ...STATUS, onEntfernen }]}>
        <button type="button">Filter</button>
      </Filterleiste>,
    )

    await user.click(screen.getByRole('button', { name: 'Filter „Status: Verfügbar“ entfernen' }))

    expect(onEntfernen).toHaveBeenCalledTimes(1)
  })

  it('blendet das Symbol des Entfernen-Buttons für Screenreader aus', () => {
    zeige([STATUS])

    const knopf = screen.getByRole('button', { name: 'Filter „Status: Verfügbar“ entfernen' })
    expect([...knopf.querySelectorAll('svg')].filter((s) => s.closest('[aria-hidden="true"]') === null)).toEqual([])
  })
})

describe('Fokus nach dem Entfernen (AK-33)', () => {
  it('setzt den Fokus auf den nächsten Chip', async () => {
    const user = zeige([STATUS, SUCHE])

    await user.click(screen.getByRole('button', { name: 'Filter „Status: Verfügbar“ entfernen' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Filter „Suche: Test“ entfernen' })).toHaveFocus())
  })

  it('setzt den Fokus ohne weiteren Chip auf das erste Filterbedienelement', async () => {
    const user = zeige([STATUS])

    await user.click(screen.getByRole('button', { name: 'Filter „Status: Verfügbar“ entfernen' }))

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Benutzer suchen' })).toHaveFocus())
    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
  })
})

describe('Alle Filter entfernen (AK-33)', () => {
  it('bietet ab zwei Chips „Alle Filter entfernen“ an', () => {
    zeige([STATUS, SUCHE])

    expect(screen.getByRole('button', { name: 'Alle Filter entfernen' })).toBeInTheDocument()
  })

  it('bietet bei einem Chip kein „Alle Filter entfernen“ an', () => {
    zeige([STATUS])

    expect(screen.queryByRole('button', { name: 'Alle Filter entfernen' })).not.toBeInTheDocument()
  })

  it('entfernt alle Chips und fokussiert das erste Filterbedienelement', async () => {
    const user = zeige([STATUS, SUCHE])

    await user.click(screen.getByRole('button', { name: 'Alle Filter entfernen' }))

    expect(screen.queryByRole('list', { name: 'Aktive Filter' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Benutzer suchen' })).toHaveFocus())
  })
})

describe('Deutsche Texte (AK-35)', () => {
  it('enthält keine englischen Texte', () => {
    zeige([STATUS, SUCHE])

    const attribute = [...document.body.querySelectorAll('*')].map((el) => el.getAttribute('aria-label') ?? '')
    expect([document.body.textContent ?? '', ...attribute].join(' ')).not.toMatch(/\b(Remove|Clear|Active|Reset)\b/)
  })
})
