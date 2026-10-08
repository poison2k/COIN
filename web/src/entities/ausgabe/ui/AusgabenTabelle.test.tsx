import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testAusgabe } from '../../../../test/fakeApi'
import { AusgabenTabelle } from '../index'

// Feature coin-ausgaben, AK-22 und AK-24: Tabelle der Ausgabehistorie. Alle Inhalte als Text, nie als HTML; der
// Storno-Button kommt über die Prop `aktion` von außen (features/ausgabe-stornieren).

const SPALTEN = ['Nr.', 'Empfänger', 'Datum', 'Gelegenheit', 'Begründung', 'Ausgebende Stelle', 'Erfasst', 'Status']

function zeile(index = 0): HTMLElement {
  return screen.getAllByRole('row')[index + 1]
}

function zelle(spalte: string, index = 0): HTMLElement {
  const kopf = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
  const position = kopf.indexOf(spalte)
  expect(position, `Spalte „${spalte}“ fehlt`).toBeGreaterThanOrEqual(0)
  return within(zeile(index)).getAllByRole('cell')[position]
}

describe('AusgabenTabelle', () => {
  it('ist eine Tabelle mit dem zugänglichen Namen „Ausgabehistorie“', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} />)

    expect(screen.getByRole('table', { name: 'Ausgabehistorie' })).toBeInTheDocument()
  })

  it('hat eine nur für Screenreader sichtbare Caption', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} />)

    expect(screen.getByRole('table').querySelector('caption')).toHaveClass('sr-only')
  })

  it('hat ohne Aktion genau die Spalten aus AK-22', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} />)

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual(SPALTEN)
  })

  it('zeigt die Ausgaben in der übergebenen Reihenfolge', () => {
    render(
      <AusgabenTabelle
        ausgaben={[
          testAusgabe({ id: 'a', exemplarNummer: 5 }),
          testAusgabe({ id: 'b', exemplarNummer: 1 }),
          testAusgabe({ id: 'c', exemplarNummer: 3 }),
        ]}
      />,
    )

    expect([0, 1, 2].map((i) => zelle('Nr.', i).textContent?.trim())).toEqual(['5', '1', '3'])
  })

  it('zeigt Name, Dienstgrad und Dienststelle des Empfängers', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} />)

    const empfaenger = zelle('Empfänger')
    expect(empfaenger).toHaveTextContent('Max Beispiel')
    expect(empfaenger).toHaveTextContent('Hauptmann')
    expect(empfaenger).toHaveTextContent('Beispielbataillon 1')
  })

  it('zeigt den Namen vor Dienstgrad und Dienststelle', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} />)

    const text = zelle('Empfänger').textContent ?? ''
    expect(text.indexOf('Max Beispiel')).toBeLessThan(text.indexOf('Hauptmann'))
  })

  it('lässt fehlenden Dienstgrad und fehlende Dienststelle weg', () => {
    render(
      <AusgabenTabelle
        ausgaben={[testAusgabe({ empfaenger: { name: 'Erika Beispiel', dienstgrad: null, dienststelle: null } })]}
      />,
    )

    expect(zelle('Empfänger').textContent?.trim()).toBe('Erika Beispiel')
  })

  it('zeigt das Datum im deutschen Format', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe({ datum: '2026-10-01' })]} />)

    expect(zelle('Datum').textContent?.trim()).toBe('01.10.2026')
  })

  it('zeigt Gelegenheit, Begründung und ausgebende Stelle', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} />)

    expect(
      [zelle('Gelegenheit'), zelle('Begründung'), zelle('Ausgebende Stelle')].map((z) => z.textContent?.trim()),
    ).toEqual(['Truppenbesuch', 'Herausragende Leistung', 'Kommandeur Beispielbataillon 1'])
  })

  it('zeigt bei „Erfasst“ Name und Datum', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe({ erfasstAm: '2026-10-08T09:00:00+00:00' })]} />)

    expect(zelle('Erfasst')).toHaveTextContent('Test Sachbearbeiter')
    expect(zelle('Erfasst')).toHaveTextContent('08.10.2026')
  })

  it('zeigt eine aktive Ausgabe als „aktiv“', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} />)

    expect(zelle('Status').textContent?.trim()).toBe('aktiv')
  })

  it('zeigt eine stornierte Ausgabe als „storniert am {Datum} von {Name}: {Grund}“', () => {
    render(
      <AusgabenTabelle
        ausgaben={[
          testAusgabe({
            storno: {
              am: '2026-10-09T08:00:00+00:00',
              von: { id: 'x', name: 'Test Administrator' },
              grund: 'Falsches Exemplar',
            },
          }),
        ]}
      />,
    )

    expect(zelle('Status').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'storniert am 09.10.2026 von Test Administrator: Falsches Exemplar',
    )
  })

  it('stellt HTML in Freitexten als Text dar', () => {
    render(
      <AusgabenTabelle
        ausgaben={[
          testAusgabe({
            empfaenger: { name: '<img src=x onerror=alert(1)>', dienstgrad: '<b>fett</b>', dienststelle: null },
            begruendung: '<script>alert(1)</script>',
          }),
        ]}
      />,
    )

    expect(zelle('Empfänger')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(zelle('Begründung')).toHaveTextContent('<script>alert(1)</script>')
    expect(document.querySelector('table img, table b, table script')).toBeNull()
  })

  it('rendert die Aktion je Ausgabe in deren Zeile', () => {
    render(
      <AusgabenTabelle
        ausgaben={[testAusgabe({ id: 'a', exemplarNummer: 4 }), testAusgabe({ id: 'b', exemplarNummer: 7 })]}
        aktion={(a) => <button type="button">Aktion {a.exemplarNummer}</button>}
      />,
    )

    expect(within(zeile(0)).getByRole('button', { name: 'Aktion 4' })).toBeInTheDocument()
    expect(within(zeile(1)).getByRole('button', { name: 'Aktion 7' })).toBeInTheDocument()
  })

  it('rendert keine Aktion, wenn die Funktion null liefert', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} aktion={() => null} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('behält mit Aktion die Spalten aus AK-22 vorne', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} aktion={() => null} />)

    expect(
      screen
        .getAllByRole('columnheader')
        .slice(0, SPALTEN.length)
        .map((th) => th.textContent?.trim()),
    ).toEqual(SPALTEN)
  })
})
