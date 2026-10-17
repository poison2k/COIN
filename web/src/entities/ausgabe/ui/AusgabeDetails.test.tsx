import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testAusgabe } from '../../../../test/fakeApi'
import { AusgabeDetails } from '../index'

// Feature zertifikat-erzeugen, AK-28: Angaben einer Ausgabe als Beschreibungsliste (<dl>): Zertifikatsnummer, Empfänger,
// Dienstgrad, Dienststelle (nur wenn vorhanden), Datum, Gelegenheit, Begründung (Zeilenumbrüche sichtbar), Ausgebende
// Stelle, Erfasst (Name, Datum), Status wie in der Historie. Alle Werte als Text, nie als HTML. Props { ausgabe }.

function wert(begriff: string): HTMLElement {
  const dt = screen.getAllByRole('term').find((t) => t.textContent?.trim() === begriff)
  expect(dt, `Begriff „${begriff}“ fehlt`).toBeDefined()
  let dd = dt!.nextElementSibling
  while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling
  expect(dd, `Kein Wert zu „${begriff}“`).not.toBeNull()
  return dd as HTMLElement
}

function begriffe(): string[] {
  return screen.getAllByRole('term').map((t) => t.textContent?.trim() ?? '')
}

describe('AusgabeDetails', () => {
  it('ist eine Beschreibungsliste', () => {
    const { container } = render(<AusgabeDetails ausgabe={testAusgabe()} />)

    expect(container.querySelector('dl')).not.toBeNull()
  })

  it('nennt alle Begriffe in der Reihenfolge aus AK-28', () => {
    render(<AusgabeDetails ausgabe={testAusgabe()} />)

    expect(begriffe()).toEqual([
      'Zertifikatsnummer',
      'Empfänger',
      'Dienstgrad',
      'Dienststelle',
      'Datum',
      'Gelegenheit',
      'Begründung',
      'Ausgebende Stelle',
      'Erfasst',
      'Status',
    ])
  })

  it('zeigt die Zertifikatsnummer', () => {
    render(<AusgabeDetails ausgabe={testAusgabe({ exemplarNummer: 12 })} />)

    expect(wert('Zertifikatsnummer')).toHaveTextContent('C0042-0012')
  })

  it.each([
    ['Empfänger', 'Max Beispiel'],
    ['Dienstgrad', 'Hauptmann'],
    ['Dienststelle', 'Beispielbataillon 1'],
    ['Datum', '01.10.2026'],
    ['Gelegenheit', 'Truppenbesuch'],
    ['Begründung', 'Herausragende Leistung'],
    ['Ausgebende Stelle', 'Kommandeur Beispielbataillon 1'],
  ])('zeigt „%s“ mit dem Wert „%s“', (begriff, erwartet) => {
    render(<AusgabeDetails ausgabe={testAusgabe()} />)

    expect(wert(begriff).textContent?.trim()).toBe(erwartet)
  })

  it('zeigt bei „Erfasst“ Name und Datum', () => {
    render(<AusgabeDetails ausgabe={testAusgabe()} />)

    expect(wert('Erfasst')).toHaveTextContent('Test Sachbearbeiter')
    expect(wert('Erfasst')).toHaveTextContent('08.10.2026')
  })

  it('zeigt eine aktive Ausgabe mit Status „aktiv“', () => {
    render(<AusgabeDetails ausgabe={testAusgabe()} />)

    expect(wert('Status').textContent?.trim()).toBe('aktiv')
  })

  it('zeigt eine stornierte Ausgabe wie in der Historie', () => {
    render(
      <AusgabeDetails
        ausgabe={testAusgabe({
          storno: { am: '2026-10-09T08:00:00+00:00', von: { id: 'x', name: 'Test Administrator' }, grund: 'Doppelt' },
        })}
      />,
    )

    expect(wert('Status').textContent?.trim()).toBe('storniert am 09.10.2026 von Test Administrator: Doppelt')
  })

  it('lässt „Dienststelle“ weg, wenn keine angegeben ist', () => {
    render(
      <AusgabeDetails
        ausgabe={testAusgabe({ empfaenger: { name: 'Erika Beispiel', dienstgrad: 'Leutnant', dienststelle: null } })}
      />,
    )

    expect(begriffe()).not.toContain('Dienststelle')
  })

  it('zeigt fehlende optionale Angaben nie als „null“', () => {
    render(
      <AusgabeDetails
        ausgabe={testAusgabe({ empfaenger: { name: 'Erika Beispiel', dienstgrad: null, dienststelle: null } })}
      />,
    )

    expect(document.body.textContent).not.toMatch(/null|undefined/)
  })

  it('zeigt Zeilenumbrüche der Begründung sichtbar (whitespace-pre-line)', () => {
    render(<AusgabeDetails ausgabe={testAusgabe({ begruendung: 'Zeile 1\nZeile 2' })} />)

    expect(wert('Begründung').textContent).toBe('Zeile 1\nZeile 2')
    expect(wert('Begründung')).toHaveClass('whitespace-pre-line')
  })

  it('zeigt HTML in den Werten als Text, nie als HTML', () => {
    render(
      <AusgabeDetails
        ausgabe={testAusgabe({ gelegenheit: '<img src=x onerror=alert(1)>', begruendung: '<b>fett</b>' })}
      />,
    )

    expect(wert('Gelegenheit').textContent).toBe('<img src=x onerror=alert(1)>')
    expect(document.body.querySelector('img')).toBeNull()
    expect(wert('Begründung').querySelector('b')).toBeNull()
  })

  it('enthält keine englischen Texte', () => {
    render(<AusgabeDetails ausgabe={testAusgabe()} />)

    expect(document.body.textContent).not.toMatch(
      /\b(Recipient|Rank|Unit|Date|Occasion|Reason|Issued by|Status: active|Created)\b/,
    )
  })
})
