import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ZeitraumFilter } from '../index'

// Feature nacharbeiten-audit-filter, AK-13 und AK-17 (Abschnitt 4.4 „Filterleiste“ Punkt 1, A4, A5, A7): Gruppe
// „Zeitraum“ (FieldSet) mit Hilfetext „Ganze Tage nach deutscher Zeit, höchstens 366 Tage.“ und den nativen Datumsfeldern
// „Von“ und „Bis“ (min 2000-01-01, max 2999-12-31). Kontrolliert über `wert: { von?, bis? }` und `onWert`; Feldfehler
// der API (`fehler: { von?, bis? }`) stehen am Feld. Ein leeres Feld heißt „nicht angegeben“.

const HILFETEXT = 'Ganze Tage nach deutscher Zeit, höchstens 366 Tage.'

function zeige(props: Partial<Parameters<typeof ZeitraumFilter>[0]> = {}) {
  const onWert = vi.fn()
  render(<ZeitraumFilter wert={{}} onWert={onWert} {...props} />)
  return { onWert }
}

const gruppe = () => screen.getByRole('group', { name: 'Zeitraum' })
const von = () => screen.getByLabelText(/^Von/)
const bis = () => screen.getByLabelText(/^Bis/)

describe('Aufbau (AK-13)', () => {
  it('hat eine Gruppe „Zeitraum“', () => {
    zeige()

    expect(gruppe()).toBeInTheDocument()
  })

  it('beschreibt die Gruppe mit dem Hilfetext', () => {
    zeige()

    expect(within(gruppe()).getByText(HILFETEXT)).toBeInTheDocument()
  })

  it('hat in der Gruppe die beschrifteten Felder „Von“ und „Bis“ in dieser Reihenfolge', () => {
    zeige()

    const felder = within(gruppe()).getAllByLabelText(/^(Von|Bis)/)
    expect(felder).toEqual([von(), bis()])
  })

  it.each([
    ['Von', von],
    ['Bis', bis],
  ])('ist bei „%s“ ein natives Datumsfeld', (_name, feld) => {
    zeige()

    expect(feld()).toHaveAttribute('type', 'date')
  })

  it.each([
    ['Von', von],
    ['Bis', bis],
  ])('begrenzt „%s“ auf 2000-01-01 bis 2999-12-31', (_name, feld) => {
    zeige()

    expect([feld().getAttribute('min'), feld().getAttribute('max')]).toEqual(['2000-01-01', '2999-12-31'])
  })

  it('zeigt die übergebenen Werte', () => {
    zeige({ wert: { von: '2026-10-01', bis: '2026-10-31' } })

    expect([von(), bis()].map((f) => (f as HTMLInputElement).value)).toEqual(['2026-10-01', '2026-10-31'])
  })

  it('ist frei von englischen Texten', () => {
    zeige()

    expect(gruppe().textContent).not.toMatch(/\b(From|To|Date|Start|End)\b/)
  })
})

describe('Wirkung (AK-14)', () => {
  it('meldet ein vollständiges Datum in „Von“ mit dem bisherigen „Bis“', () => {
    const { onWert } = zeige({ wert: { bis: '2026-10-31' } })

    fireEvent.change(von(), { target: { value: '2026-10-01' } })

    expect(onWert).toHaveBeenCalledWith({ von: '2026-10-01', bis: '2026-10-31' })
  })

  it('meldet ein vollständiges Datum in „Bis“ mit dem bisherigen „Von“', () => {
    const { onWert } = zeige({ wert: { von: '2026-10-01' } })

    fireEvent.change(bis(), { target: { value: '2026-10-31' } })

    expect(onWert).toHaveBeenCalledWith({ von: '2026-10-01', bis: '2026-10-31' })
  })

  it('meldet ein geleertes Feld als nicht angegeben', () => {
    const { onWert } = zeige({ wert: { von: '2026-10-01', bis: '2026-10-31' } })

    fireEvent.change(von(), { target: { value: '' } })

    expect(onWert).toHaveBeenCalledWith({ bis: '2026-10-31' })
  })

  it('meldet je Änderung genau einmal', () => {
    const { onWert } = zeige()

    fireEvent.change(von(), { target: { value: '2026-10-01' } })

    expect(onWert).toHaveBeenCalledTimes(1)
  })
})

// QA-Runde 1 W2 (AK-14): Zwischenwerte beim Eintippen des Jahres (z. B. 0202-10-01) und Werte außerhalb von min/max
// (2000-01-01 bis 2999-12-31) sind kein vollständiges Datum und werden nicht gemeldet.
describe('Zwischenwerte beim Eintippen (W2)', () => {
  it.each(['0002-10-01', '0020-10-01', '0202-10-01', '1999-12-31'])('meldet „%s“ nicht', (wert) => {
    const { onWert } = zeige()

    fireEvent.change(von(), { target: { value: wert } })

    expect(onWert).not.toHaveBeenCalled()
  })

  it('meldet ein Jahr nach 2999 nicht', () => {
    const { onWert } = zeige()

    fireEvent.change(bis(), { target: { value: '3000-01-01' } })

    expect(onWert).not.toHaveBeenCalled()
  })

  it.each(['2000-01-01', '2999-12-31'])('meldet die Bereichsgrenze „%s“', (wert) => {
    const { onWert } = zeige()

    fireEvent.change(von(), { target: { value: wert } })

    expect(onWert).toHaveBeenCalledWith({ von: wert })
  })

  it('meldet nach Zwischenwerten genau einmal das vollständige Datum', () => {
    const { onWert } = zeige()

    for (const wert of ['0002-10-01', '0020-10-01', '0202-10-01', '2026-10-01']) {
      fireEvent.change(von(), { target: { value: wert } })
    }

    expect(onWert.mock.calls).toEqual([[{ von: '2026-10-01' }]])
  })
})

// QA-Runde 2 R2-G1: Ein nicht gemeldeter Zwischenwert (Entwurf) wird verworfen, sobald sich der Wert des Aufrufers
// ändert. Er darf nicht wieder auftauchen, wenn der Wert später zum alten Stand zurückkehrt.
describe('Entwurf nach Wertänderung von außen (R2-G1)', () => {
  it('zeigt nach Rückkehr zum alten Wert den Wert des Aufrufers statt des alten Zwischenwerts', () => {
    const onWert = vi.fn()
    const { rerender } = render(<ZeitraumFilter wert={{ von: '2026-10-01' }} onWert={onWert} />)
    fireEvent.change(von(), { target: { value: '0002-10-01' } })

    rerender(<ZeitraumFilter wert={{}} onWert={onWert} />)
    rerender(<ZeitraumFilter wert={{ von: '2026-10-01' }} onWert={onWert} />)

    expect(von()).toHaveValue('2026-10-01')
  })

  it('zeigt nach einer Wertänderung von außen den neuen Wert statt des Zwischenwerts', () => {
    const onWert = vi.fn()
    const { rerender } = render(<ZeitraumFilter wert={{ von: '2026-10-01' }} onWert={onWert} />)
    fireEvent.change(von(), { target: { value: '0002-10-01' } })

    rerender(<ZeitraumFilter wert={{}} onWert={onWert} />)

    expect(von()).toHaveValue('')
  })
})

describe('Feldfehler der API (AK-17)', () => {
  const BIS_FEHLER = 'Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.'
  const DATUM_FEHLER = 'Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.'

  it('markiert „Bis“ mit Fehler als ungültig', () => {
    zeige({ fehler: { bis: BIS_FEHLER } })

    expect(bis()).toHaveAttribute('aria-invalid', 'true')
  })

  it('nennt den Fehler in der Beschreibung von „Bis“', () => {
    zeige({ fehler: { bis: BIS_FEHLER } })

    expect(bis()).toHaveAccessibleDescription(expect.stringContaining(BIS_FEHLER))
  })

  it('nennt den Fehler von „Von“ nur an „Von“', () => {
    zeige({ fehler: { von: DATUM_FEHLER } })

    expect(von()).toHaveAccessibleDescription(expect.stringContaining(DATUM_FEHLER))
    expect(bis()).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('ist ohne Fehler nicht als ungültig markiert', () => {
    zeige()

    expect([von(), bis()].map((f) => f.getAttribute('aria-invalid'))).toEqual([null, null])
  })
})
