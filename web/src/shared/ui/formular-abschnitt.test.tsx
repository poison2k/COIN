import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormularAbschnitt } from './formular-abschnitt'
import { Input } from './input'

// Feature formulare-detailseiten, AK-1 und AK-35 (Abschnitt 4.1, 4.8, ADR-0039 Punkt 4): Formularabschnitt als
// `<fieldset>` mit `<legend>`, darin eine Überschrift der angegebenen Ebene. Props `titel`, `ebene?: 2|3`,
// `beschreibung?`, `spalten?: 1|2`, `children`.

function zeige(props: { ebene?: 2 | 3; beschreibung?: string; spalten?: 1 | 2 } = {}) {
  render(
    <FormularAbschnitt titel="Empfänger" {...props}>
      <label htmlFor="feld-a">Dienstgrad</label>
      <Input id="feld-a" />
      <label htmlFor="feld-b">Dienststelle</label>
      <Input id="feld-b" />
    </FormularAbschnitt>,
  )
}

describe('Gruppe (AK-1)', () => {
  it('ist eine Gruppe mit dem Titel als zugänglichem Namen', () => {
    zeige()

    expect(screen.getByRole('group', { name: 'Empfänger' })).toBeInTheDocument()
  })

  it('ist ein fieldset mit legend', () => {
    zeige()

    const gruppe = screen.getByRole('group', { name: 'Empfänger' })
    expect(gruppe.tagName).toBe('FIELDSET')
    expect(gruppe.querySelector(':scope > legend')).not.toBeNull()
  })

  it('enthält die übergebenen Felder', () => {
    zeige()

    const gruppe = screen.getByRole('group', { name: 'Empfänger' })
    expect(within(gruppe).getByRole('textbox', { name: 'Dienstgrad' })).toBeInTheDocument()
    expect(within(gruppe).getByRole('textbox', { name: 'Dienststelle' })).toBeInTheDocument()
  })

  it('zeigt die Beschreibung im Abschnitt', () => {
    zeige({ beschreibung: 'Angaben zur Person, die den Coin erhält.' })

    const gruppe = screen.getByRole('group', { name: 'Empfänger' })
    expect(within(gruppe).getByText('Angaben zur Person, die den Coin erhält.')).toBeInTheDocument()
  })

  it('rendert auch zweispaltig dieselben Felder in derselben Reihenfolge', () => {
    zeige({ spalten: 2 })

    const namen = within(screen.getByRole('group', { name: 'Empfänger' }))
      .getAllByRole('textbox')
      .map((f) => f.id)
    expect(namen).toEqual(['feld-a', 'feld-b'])
  })
})

describe('Überschrift (AK-1)', () => {
  it('enthält eine Überschrift der Ebene 2 mit dem Titel', () => {
    zeige({ ebene: 2 })

    const gruppe = screen.getByRole('group', { name: 'Empfänger' })
    expect(within(gruppe).getByRole('heading', { level: 2, name: 'Empfänger' })).toBeInTheDocument()
  })

  it('enthält bei ebene 3 eine Überschrift der Ebene 3', () => {
    zeige({ ebene: 3 })

    const gruppe = screen.getByRole('group', { name: 'Empfänger' })
    expect(within(gruppe).getByRole('heading', { level: 3, name: 'Empfänger' })).toBeInTheDocument()
    expect(within(gruppe).queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('nennt den Titel genau einmal sichtbar', () => {
    zeige({ ebene: 2 })

    expect(screen.getAllByText('Empfänger')).toHaveLength(1)
  })
})
