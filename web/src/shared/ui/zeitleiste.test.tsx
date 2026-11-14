import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Zeitleiste } from './zeitleiste'

// Feature formulare-detailseiten, AK-27 und AK-35 (Abschnitt 4.6, 4.8): Zeitleiste als geordnete Liste (`<ol>`) mit
// `beschriftung` und Einträgen { id, titel, zeitpunkt (ISO), zeitText, beschreibung?, ton }. Freitexte als Text.

const EINTRAEGE = [
  {
    id: 'erfasst',
    titel: 'Ausgabe erfasst',
    zeitpunkt: '2026-10-08T09:00:00.123456+00:00',
    zeitText: '08.10.2026, 11:00',
    beschreibung: 'von Test Sachbearbeiter',
    ton: 'erfolg' as const,
  },
  {
    id: 'storniert',
    titel: 'Ausgabe storniert',
    zeitpunkt: '2026-10-09T08:00:00+00:00',
    zeitText: '09.10.2026, 10:00',
    beschreibung: 'von Test Administrator · Grund: <b>Doppelt</b>',
    ton: 'gefahr' as const,
  },
]

function zeige(
  eintraege: Array<
    Omit<(typeof EINTRAEGE)[number], 'beschreibung' | 'ton'> & {
      beschreibung?: string
      ton: 'neutral' | 'erfolg' | 'gefahr'
    }
  > = EINTRAEGE,
) {
  render(<Zeitleiste beschriftung="Verlauf der Ausgabe" eintraege={eintraege} />)
  return screen.getByRole('list', { name: 'Verlauf der Ausgabe' })
}

describe('Liste (AK-27)', () => {
  it('ist eine geordnete Liste mit der Beschriftung als Namen', () => {
    expect(zeige().tagName).toBe('OL')
  })

  it('zeigt je Eintrag ein Listenelement in der übergebenen Reihenfolge', () => {
    const liste = zeige()

    const titel = within(liste)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
    expect(titel).toHaveLength(2)
    expect(titel[0]).toContain('Ausgabe erfasst')
    expect(titel[1]).toContain('Ausgabe storniert')
  })

  it('zeigt den Zeitpunkt als <time> mit dateTime = ISO-Zeitpunkt und dem Anzeigetext', () => {
    const liste = zeige()

    const zeiten = [...liste.querySelectorAll('time')]
    expect(zeiten.map((t) => t.getAttribute('datetime'))).toEqual([
      '2026-10-08T09:00:00.123456+00:00',
      '2026-10-09T08:00:00+00:00',
    ])
    expect(zeiten.map((t) => t.textContent?.trim())).toEqual(['08.10.2026, 11:00', '09.10.2026, 10:00'])
  })

  it('zeigt die Beschreibung', () => {
    const liste = zeige()

    expect(within(liste).getAllByRole('listitem')[0]).toHaveTextContent('von Test Sachbearbeiter')
  })

  it('rendert Freitexte als Text, nicht als HTML', () => {
    const liste = zeige()

    expect(liste.querySelector('b')).toBeNull()
    expect(within(liste).getAllByRole('listitem')[1]).toHaveTextContent('Grund: <b>Doppelt</b>')
  })

  it('zeigt einen Eintrag ohne Beschreibung', () => {
    const liste = zeige([{ ...EINTRAEGE[0], beschreibung: undefined }])

    expect(within(liste).getAllByRole('listitem')).toHaveLength(1)
    expect(liste).not.toHaveTextContent('von Test Sachbearbeiter')
  })

  it('blendet dekorative Symbole für Screenreader aus', () => {
    const liste = zeige()

    const sichtbareSymbole = [...liste.querySelectorAll('svg')].filter(
      (s) => s.closest('[aria-hidden="true"]') === null,
    )
    expect(sichtbareSymbole).toEqual([])
  })
})
