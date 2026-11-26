import { render, screen, within } from '@testing-library/react'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { testAuditEintrag } from '../../../../test/fakeApi'
import { AuditTabelle } from '../index'

// Feature startseite-listen-pruefung, AK-30 (Abschnitt 4.4 „Zeitpunkte“, Regel R7): Zeitpunkte im Audit-Log als
// „TT.MM.JJJJ, HH:MM Uhr“ in Europe/Berlin, auch wenn der Browser in einer anderen Zeitzone läuft. `<time dateTime>`
// behält den ISO-Wert, `title` enthält zusätzlich die Sekunden. Die Zeitzone des Prozesses wird vor dem Laden der Module
// auf America/New_York gesetzt (Node übernimmt TZ zur Laufzeit), damit eine lokale Formatierung auffällt.

// Node-Prozessumgebung ohne Node-Typen im App-Projekt (tsconfig.app.json kennt nur DOM-Typen).
const umgebung = vi.hoisted(() => {
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
  const alt = env.TZ
  env.TZ = 'America/New_York'
  return { env, alt }
})

afterAll(() => {
  if (umgebung.alt === undefined) delete umgebung.env.TZ
  else umgebung.env.TZ = umgebung.alt
})

const ISO_SOMMER = '2026-10-05T12:34:56+00:00'
const ISO_WINTER = '2026-01-31T23:05:09+00:00'

function zeitElement(iso: string): HTMLTimeElement {
  render(<AuditTabelle eintraege={[testAuditEintrag({ zeitpunkt: iso })]} />)
  const tabelle = screen.getByRole('table', { name: 'Änderungsprotokoll' })
  const zeit = tabelle.querySelector('time')
  expect(zeit, 'kein <time> in der Tabelle').not.toBeNull()
  return zeit as HTMLTimeElement
}

describe('Zeitpunkte im Audit-Log (AK-30)', () => {
  it('läuft mit einer Prozess-Zeitzone außerhalb Europe/Berlin (Selbsttest)', () => {
    expect(new Date(ISO_SOMMER).getHours()).toBe(8)
  })

  it('zeigt den Zeitpunkt als „TT.MM.JJJJ, HH:MM Uhr“ in Europe/Berlin (Sommerzeit)', () => {
    expect(zeitElement(ISO_SOMMER)).toHaveTextContent(/^05\.10\.2026, 14:34 Uhr$/)
  })

  it('rechnet in der Winterzeit nach Europe/Berlin um, auch über den Tageswechsel', () => {
    expect(zeitElement(ISO_WINTER)).toHaveTextContent(/^01\.02\.2026, 00:05 Uhr$/)
  })

  it('behält in dateTime den ISO-Wert der API', () => {
    expect(zeitElement(ISO_SOMMER)).toHaveAttribute('dateTime', ISO_SOMMER)
  })

  it('nennt im title zusätzlich die Sekunden', () => {
    expect(zeitElement(ISO_SOMMER)).toHaveAttribute('title', '05.10.2026, 14:34:56 Uhr')
  })

  it('zeigt den Zeitpunkt in der Zelle der Spalte „Zeitpunkt“', () => {
    render(<AuditTabelle eintraege={[testAuditEintrag({ zeitpunkt: ISO_SOMMER })]} />)

    const zeile = within(screen.getByRole('table', { name: 'Änderungsprotokoll' })).getAllByRole('row')[1]
    // Erste Zelle der Zeile (Datenzelle oder Zeilenkopf).
    expect(zeile.firstElementChild).toHaveTextContent('05.10.2026, 14:34 Uhr')
  })
})
