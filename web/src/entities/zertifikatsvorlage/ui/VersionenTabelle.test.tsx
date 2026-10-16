import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testVorlagenVersion } from '../../../../test/fakeApi'
import { VersionenTabelle } from '../index'

// Feature zertifikatsvorlagen, AK-30 und AK-33: Tabelle der Versionen mit sr-only-Caption, Datum/Uhrzeit und Größe
// in de-DE, Status als Badge mit Text. Die Aktion je Zeile („Herunterladen“) kommt per Prop `aktion` von außen.
// Kein „Aktivieren“ (F6).

const SPALTEN = ['Version', 'Hochgeladen am', 'Hochgeladen von', 'Größe', 'Status']

const VERSIONEN = [
  testVorlagenVersion({
    version: 2,
    aktiv: true,
    groesseBytes: 48211,
    hochgeladenAm: '2026-10-09T09:00:00.123456+00:00',
  }),
  testVorlagenVersion({
    version: 1,
    aktiv: false,
    groesseBytes: 1_234_567,
    hochgeladenAm: '2026-10-08T07:30:00+00:00',
    hochgeladenVon: { id: 'b1', name: 'Test Administrator' },
  }),
]

function zeile(index: number): HTMLElement {
  return screen.getAllByRole('row')[index + 1]
}

function zelle(spalte: string, index = 0): HTMLElement {
  const kopf = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
  const position = kopf.indexOf(spalte)
  expect(position, `Spalte „${spalte}“ fehlt`).toBeGreaterThanOrEqual(0)
  return within(zeile(index)).getAllByRole('cell')[position]
}

describe('VersionenTabelle', () => {
  it('ist eine Tabelle mit dem zugänglichen Namen „Versionen der Zertifikatsvorlage“', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect(screen.getByRole('table', { name: 'Versionen der Zertifikatsvorlage' })).toBeInTheDocument()
  })

  it('hat eine nur für Screenreader sichtbare Caption', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    const caption = screen.getByRole('table').querySelector('caption')
    expect(caption).toHaveClass('sr-only')
    expect(caption).toHaveTextContent('Versionen der Zertifikatsvorlage')
  })

  it('hat ohne Aktion genau die Spalten aus AK-30', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual(SPALTEN)
  })

  it('zeigt die Versionen in der übergebenen Reihenfolge', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect([0, 1].map((i) => zelle('Version', i).textContent?.trim())).toEqual(['2', '1'])
  })

  it('zeigt „Hochgeladen am“ als deutsches Datum mit Uhrzeit', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    const text = zelle('Hochgeladen am', 1).textContent ?? ''
    expect(text).toMatch(/0?8\.10\.(20)?26/)
    expect(text).toMatch(/\d{1,2}:\d{2}/)
    expect(text).not.toContain('2026-10-08T')
  })

  it('zeigt den Namen des Hochladenden', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect(zelle('Hochgeladen von', 1)).toHaveTextContent('Test Administrator')
  })

  it('zeigt die Größe in kB im Format de-DE', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect(zelle('Größe', 0).textContent?.trim()).toMatch(/^4[78](,\d)? kB$/)
    expect(zelle('Größe', 1).textContent?.trim()).toMatch(/^1\.(234|205)(,\d)? kB$/)
  })

  it('kennzeichnet die aktive Version mit dem Text „aktiv“', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect(zelle('Status', 0)).toHaveTextContent('aktiv')
  })

  it('zeigt bei nicht aktiven Versionen kein „aktiv“', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect(zelle('Status', 1).textContent).not.toContain('aktiv')
  })

  it('rendert die Aktion je Zeile mit der Version', () => {
    render(
      <VersionenTabelle
        versionen={VERSIONEN}
        aktion={(v) => (
          <button type="button" aria-label={`Version ${v.version} herunterladen`}>
            Herunterladen
          </button>
        )}
      />,
    )

    expect(within(zeile(0)).getByRole('button', { name: 'Version 2 herunterladen' })).toBeInTheDocument()
    expect(within(zeile(1)).getByRole('button', { name: 'Version 1 herunterladen' })).toBeInTheDocument()
  })

  it('bietet kein „Aktivieren“ an', () => {
    render(<VersionenTabelle versionen={VERSIONEN} />)

    expect(document.body.textContent).not.toMatch(/aktivieren/i)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('rendert Namen als Text, nie als HTML', () => {
    render(
      <VersionenTabelle versionen={[testVorlagenVersion({ hochgeladenVon: { id: 'x', name: '<b>Test Fett</b>' } })]} />,
    )

    expect(zelle('Hochgeladen von')).toHaveTextContent('<b>Test Fett</b>')
    expect(zelle('Hochgeladen von').querySelector('b')).toBeNull()
  })
})
