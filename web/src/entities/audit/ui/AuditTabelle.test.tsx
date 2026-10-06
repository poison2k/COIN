import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testAuditEintrag } from '../../../../test/fakeApi'
import { AuditTabelle } from '../index'

// Feature rollen-benutzerverwaltung, AK-31: Tabelle des Audit-Logs mit deutscher Anzeige der Werte.

function zeile(index = 0): HTMLElement {
  return within(screen.getByRole('table', { name: 'Audit-Log' })).getAllByRole('row')[index + 1]
}

function zellen(index = 0): string[] {
  return within(zeile(index))
    .getAllByRole('cell')
    .map((z) => z.textContent?.trim() ?? '')
}

describe('AuditTabelle', () => {
  it('hat die Beschriftung „Audit-Log“', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag()]} />)

    expect(screen.getByRole('table', { name: 'Audit-Log' })).toBeInTheDocument()
  })

  it('hat die Spalten Zeitpunkt, Geändert von, Benutzer, Änderung, Vorher, Nachher', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag()]} />)

    expect(screen.getAllByRole('columnheader').map((k) => k.textContent?.trim())).toEqual([
      'Zeitpunkt',
      'Geändert von',
      'Benutzer',
      'Änderung',
      'Vorher',
      'Nachher',
    ])
  })

  it('zeigt den Zeitpunkt als deutsches Datum mit Uhrzeit', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag({ zeitpunkt: '2026-10-05T12:34:56+00:00' })]} />)

    const zeitpunkt = zellen()[0]
    expect(zeitpunkt).toMatch(/0?5\.10\.(20)?26/)
    expect(zeitpunkt).toMatch(/\d{1,2}:\d{2}/)
    expect(zeitpunkt).not.toContain('2026-10-05T')
  })

  it('zeigt Akteur und Benutzer mit Namen', () => {
    render(
      <AuditTabelle
        eintraege={[
          testAuditEintrag({
            akteur: { id: 'a1', name: 'Test Administrator' },
            benutzer: { id: 'b1', name: 'Test Betrachter' },
          }),
        ]}
      />,
    )

    expect(zellen().slice(1, 3)).toEqual(['Test Administrator', 'Test Betrachter'])
  })

  it('zeigt akteur null als „System (Bootstrap)“', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag({ akteur: null })]} />)

    expect(zellen()[1]).toBe('System (Bootstrap)')
  })

  it('zeigt eine Rollenänderung mit „Rolle“ und den Rollennamen, „keine“ als „Keine Rolle“', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag({ art: 'Rolle', alt: 'keine', neu: 'Betrachter' })]} />)

    expect(zellen().slice(3)).toEqual(['Rolle', 'Keine Rolle', 'Betrachter'])
  })

  it('zeigt eine Rollenänderung auf „keine“ als „Keine Rolle“', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag({ art: 'Rolle', alt: 'Sachbearbeiter', neu: 'keine' })]} />)

    expect(zellen().slice(3)).toEqual(['Rolle', 'Sachbearbeiter', 'Keine Rolle'])
  })

  it('zeigt eine Statusänderung mit „Status“, „Aktiv“ und „Deaktiviert“', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag({ art: 'Status', alt: 'aktiv', neu: 'deaktiviert' })]} />)

    expect(zellen().slice(3)).toEqual(['Status', 'Aktiv', 'Deaktiviert'])
  })

  it('zeigt eine Reaktivierung als „Deaktiviert“ → „Aktiv“', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag({ art: 'Status', alt: 'deaktiviert', neu: 'aktiv' })]} />)

    expect(zellen().slice(4)).toEqual(['Deaktiviert', 'Aktiv'])
  })

  it('zeigt die Einträge in der übergebenen Reihenfolge', () => {
    render(
      <AuditTabelle
        eintraege={[
          testAuditEintrag({ id: 'e2', neu: 'Sachbearbeiter', alt: 'Betrachter' }),
          testAuditEintrag({ id: 'e1', neu: 'Betrachter', alt: 'keine' }),
        ]}
      />,
    )

    expect(zellen(0)[5]).toBe('Sachbearbeiter')
    expect(zellen(1)[5]).toBe('Betrachter')
  })

  it('zeigt keine E-Mail-Adressen und keine Ids', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag()]} />)

    expect(document.body.textContent).not.toMatch(/@|0199a1b2/)
  })
})
