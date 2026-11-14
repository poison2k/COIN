import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testAusgabe } from '../../../../test/fakeApi'
import { AusgabeVerlauf } from '../index'

// Feature formulare-detailseiten, AK-27 (Abschnitt 4.6, F3): Verlauf einer Ausgabe als Zeitleiste (`<ol>`, älteste
// zuerst) nur aus vorhandenen Feldern: „Ausgabe erfasst“ (erfasstAm, erfasstVon) und bei Storno „Ausgabe storniert“
// (storno.am, storno.von, storno.grund). Hologramm-Korrekturen liefert die API nicht. Props `{ ausgabe }`.

const STORNO = {
  am: '2026-10-09T08:00:00+00:00',
  von: { id: '0199a1b2-0000-7000-8000-00000000a001', name: 'Test Administrator' },
  grund: 'Doppelt erfasst',
}

function zeige(storniert = false) {
  render(<AusgabeVerlauf ausgabe={testAusgabe({ hologrammnummer: 'AB 12-43', storno: storniert ? STORNO : null })} />)
  const liste = screen.getByRole('list')
  return { liste, eintraege: within(liste).getAllByRole('listitem') }
}

describe('Verlauf (AK-27)', () => {
  it('ist eine geordnete Liste', () => {
    expect(zeige().liste.tagName).toBe('OL')
  })

  it('zeigt bei einer aktiven Ausgabe genau den Eintrag „Ausgabe erfasst“', () => {
    const { eintraege } = zeige()

    expect(eintraege).toHaveLength(1)
    expect(eintraege[0]).toHaveTextContent('Ausgabe erfasst')
  })

  it('nennt den Erfasser „von {Name}“', () => {
    const { eintraege } = zeige()

    expect(eintraege[0]).toHaveTextContent('von Test Sachbearbeiter')
  })

  it('zeigt den Zeitpunkt als <time dateTime> = erfasstAm', () => {
    const { eintraege } = zeige()

    expect(eintraege[0].querySelector('time')).toHaveAttribute('datetime', '2026-10-08T09:00:00.123456+00:00')
  })

  it('zeigt Tag und Uhrzeit in Europe/Berlin', () => {
    const { eintraege } = zeige()

    const zeit = eintraege[0].querySelector('time')?.textContent ?? ''
    expect(zeit).toContain('08.10.2026')
    expect(zeit).toContain('11:00')
  })

  it('zeigt bei Storno als zweiten Eintrag „Ausgabe storniert“ (älteste zuerst)', () => {
    const { eintraege } = zeige(true)

    expect(eintraege).toHaveLength(2)
    expect(eintraege[0]).toHaveTextContent('Ausgabe erfasst')
    expect(eintraege[1]).toHaveTextContent('Ausgabe storniert')
  })

  it('nennt beim Storno Zeitpunkt, Namen und Grund', () => {
    const { eintraege } = zeige(true)

    expect(eintraege[1].querySelector('time')).toHaveAttribute('datetime', STORNO.am)
    expect(eintraege[1]).toHaveTextContent('von Test Administrator')
    expect(eintraege[1]).toHaveTextContent('Grund: Doppelt erfasst')
  })

  it('nennt keine Hologramm-Korrektur und keine Hologrammnummer (F3)', () => {
    const { liste } = zeige(true)

    expect(liste).not.toHaveTextContent(/Hologramm|AB 12-43/)
  })
})
