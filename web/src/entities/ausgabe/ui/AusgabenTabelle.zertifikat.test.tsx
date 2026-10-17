import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testAusgabe } from '../../../../test/fakeApi'
import { AusgabenTabelle } from '../index'

// Feature zertifikat-erzeugen, AK-24: Spalte „Zertifikat“ vor „Status“ über die Render-Prop `zertifikat`
// (Link und Button kommen von außen, die Tabelle kennt keinen Router). Ohne Prop bleiben die Spalten aus coin-ausgaben.

const SPALTEN_MIT_ZERTIFIKAT = [
  'Nr.',
  'Empfänger',
  'Datum',
  'Gelegenheit',
  'Begründung',
  'Ausgebende Stelle',
  'Erfasst',
  'Zertifikat',
  'Status',
]

function zelle(spalte: string, index = 0): HTMLElement {
  const kopf = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
  const position = kopf.indexOf(spalte)
  expect(position, `Spalte „${spalte}“ fehlt`).toBeGreaterThanOrEqual(0)
  return within(screen.getAllByRole('row')[index + 1]).getAllByRole('cell')[position]
}

describe('AusgabenTabelle – Spalte „Zertifikat“', () => {
  it('steht mit der Render-Prop direkt vor „Status“', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} zertifikat={(a) => a.zertifikatsnummer} />)

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual(SPALTEN_MIT_ZERTIFIKAT)
  })

  it('ist eine Spaltenüberschrift mit scope="col"', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} zertifikat={(a) => a.zertifikatsnummer} />)

    expect(screen.getByRole('columnheader', { name: 'Zertifikat' })).toHaveAttribute('scope', 'col')
  })

  it('zeigt je Zeile, was die Render-Prop liefert', () => {
    render(
      <AusgabenTabelle
        ausgaben={[testAusgabe({ id: 'a', exemplarNummer: 12 }), testAusgabe({ id: 'b', exemplarNummer: 7 })]}
        zertifikat={(a) => <span>{`Nummer ${a.zertifikatsnummer}`}</span>}
      />,
    )

    expect([zelle('Zertifikat', 0).textContent, zelle('Zertifikat', 1).textContent]).toEqual([
      'Nummer C0042-0012',
      'Nummer C0042-0007',
    ])
  })

  it('übergibt der Render-Prop die Ausgabe der Zeile', () => {
    const gesehen: string[] = []
    render(
      <AusgabenTabelle
        ausgaben={[testAusgabe({ id: 'a' }), testAusgabe({ id: 'b' })]}
        zertifikat={(a) => {
          gesehen.push(a.id)
          return null
        }}
      />,
    )

    expect(gesehen).toEqual(['a', 'b'])
  })

  it('zeigt eine Nummer mit HTML-Zeichen als Text, nie als HTML', () => {
    render(
      <AusgabenTabelle
        ausgaben={[testAusgabe({ zertifikatsnummer: '<b>C0042-0001</b>' })]}
        zertifikat={(a) => a.zertifikatsnummer}
      />,
    )

    expect(zelle('Zertifikat').textContent).toBe('<b>C0042-0001</b>')
    expect(zelle('Zertifikat').querySelector('b')).toBeNull()
  })

  it('steht mit Aktion vor der Aktionsspalte', () => {
    render(
      <AusgabenTabelle ausgaben={[testAusgabe()]} zertifikat={(a) => a.zertifikatsnummer} aktion={() => 'Aktion'} />,
    )

    const kopf = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(kopf.indexOf('Zertifikat')).toBeLessThan(kopf.indexOf('Status'))
    expect(kopf.at(-1)).toBe('Aktionen')
  })

  it('fehlt ohne Render-Prop', () => {
    render(<AusgabenTabelle ausgaben={[testAusgabe()]} />)

    expect(screen.queryByRole('columnheader', { name: 'Zertifikat' })).not.toBeInTheDocument()
  })
})
