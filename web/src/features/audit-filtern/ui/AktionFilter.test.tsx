import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AktionFilter } from '../index'

// Feature nacharbeiten-audit-filter, AK-13 und AK-17 (Abschnitt 4.4 „Filterleiste“ Punkt 2, A6, A8): Gruppe „Aktion“
// (FieldSet) mit je einer Checkbox pro Eintrag der Prop `aktionen` (aus GET /api/audit/aktionen, Text = `bezeichnung`,
// keine fest kodierte Liste). Kontrolliert über `wert: string[]` (Werte) und `onWert`; die gemeldete Liste folgt der
// Reihenfolge von `aktionen`. Fehler der API (`fehler`) an der Gruppe; `ladefehler` zeigt „Aktionen konnten nicht geladen
// werden.“ ohne role="alert".

const AKTIONEN = [
  { wert: 'Rolle', bezeichnung: 'Rolle' },
  { wert: 'Status', bezeichnung: 'Status' },
]

function zeige(props: Partial<Parameters<typeof AktionFilter>[0]> = {}) {
  const onWert = vi.fn()
  const user = userEvent.setup()
  render(<AktionFilter aktionen={AKTIONEN} wert={[]} onWert={onWert} {...props} />)
  return { onWert, user }
}

const gruppe = () => screen.getByRole('group', { name: /^Aktion/ })

describe('Aufbau (AK-13)', () => {
  it('hat eine Gruppe „Aktion“', () => {
    zeige()

    expect(gruppe()).toBeInTheDocument()
  })

  it('hat je Aktion eine Checkbox mit der Bezeichnung als Namen, in der Reihenfolge der API', () => {
    zeige()

    expect(within(gruppe()).getAllByRole('checkbox')).toEqual([
      screen.getByRole('checkbox', { name: 'Rolle' }),
      screen.getByRole('checkbox', { name: 'Status' }),
    ])
  })

  it('übernimmt die Texte aus bezeichnung, nicht aus wert', () => {
    zeige({ aktionen: [{ wert: 'Rolle', bezeichnung: 'Rollenänderung' }] })

    expect(screen.getByRole('checkbox', { name: 'Rollenänderung' })).toBeInTheDocument()
  })

  it('zeigt die gewählten Aktionen als angehakt', () => {
    zeige({ wert: ['Status'] })

    expect(screen.getByRole('checkbox', { name: 'Status' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Rolle' })).not.toBeChecked()
  })
})

describe('Wirkung (AK-14)', () => {
  it('meldet beim Anhaken die Aktion', async () => {
    const { onWert, user } = zeige()

    await user.click(screen.getByRole('checkbox', { name: 'Status' }))

    expect(onWert).toHaveBeenCalledWith(['Status'])
  })

  it('meldet mehrere Aktionen in der Reihenfolge der API', async () => {
    const { onWert, user } = zeige({ wert: ['Status'] })

    await user.click(screen.getByRole('checkbox', { name: 'Rolle' }))

    expect(onWert).toHaveBeenCalledWith(['Rolle', 'Status'])
  })

  it('meldet beim Abhaken die übrigen Aktionen', async () => {
    const { onWert, user } = zeige({ wert: ['Rolle', 'Status'] })

    await user.click(screen.getByRole('checkbox', { name: 'Rolle' }))

    expect(onWert).toHaveBeenCalledWith(['Status'])
  })

  it('schaltet per Leertaste', async () => {
    const { onWert, user } = zeige()
    screen.getByRole('checkbox', { name: 'Rolle' }).focus()

    await user.keyboard(' ')

    expect(onWert).toHaveBeenCalledWith(['Rolle'])
  })
})

describe('Fehler und Ladefehler (AK-17)', () => {
  const MELDUNG = 'Unbekannte Aktion. Erlaubt sind: Rolle, Status.'

  it('zeigt den Fehler der API in der Gruppe', () => {
    zeige({ fehler: MELDUNG })

    expect(within(gruppe()).getByText(MELDUNG)).toBeInTheDocument()
  })

  it('zeigt bei einem Ladefehler „Aktionen konnten nicht geladen werden.“ in der Gruppe', () => {
    zeige({ aktionen: [], ladefehler: true })

    expect(within(gruppe()).getByText('Aktionen konnten nicht geladen werden.')).toBeInTheDocument()
  })

  it('meldet den Ladefehler nicht als Alarm', () => {
    zeige({ aktionen: [], ladefehler: true })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('zeigt ohne Ladefehler keinen Hinweis', () => {
    zeige()

    expect(screen.queryByText('Aktionen konnten nicht geladen werden.')).not.toBeInTheDocument()
  })
})
