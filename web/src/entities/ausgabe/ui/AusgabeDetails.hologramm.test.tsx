import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { testAusgabe } from '../../../../test/fakeApi'
import { AusgabeDetails } from '../index'

// Feature hologrammnummer, AK-27: AusgabeDetails zeigt die Zeile „Hologrammnummer“ mit der Anzeigeform bzw.
// „Keine erfasst“, als Text, nie als HTML.

function wert(begriff: string): HTMLElement {
  const dt = screen.getAllByRole('term').find((t) => t.textContent?.trim() === begriff)
  expect(dt, `Begriff „${begriff}“ fehlt`).toBeDefined()
  let dd = dt!.nextElementSibling
  while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling
  expect(dd, `Kein Wert zu „${begriff}“`).not.toBeNull()
  return dd as HTMLElement
}

describe('AusgabeDetails – Hologrammnummer', () => {
  it('zeigt die Anzeigeform der Nummer', () => {
    render(<AusgabeDetails ausgabe={testAusgabe({ hologrammnummer: 'AB 12-34' })} />)

    expect(wert('Hologrammnummer')).toHaveTextContent('AB 12-34')
  })

  it('zeigt ohne Nummer „Keine erfasst“', () => {
    render(<AusgabeDetails ausgabe={testAusgabe({ hologrammnummer: null })} />)

    expect(wert('Hologrammnummer')).toHaveTextContent('Keine erfasst')
  })

  it('zeigt die Nummer auch bei einer stornierten Ausgabe', () => {
    render(
      <AusgabeDetails
        ausgabe={testAusgabe({
          hologrammnummer: 'AB 12-34',
          storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Test' },
        })}
      />,
    )

    expect(wert('Hologrammnummer')).toHaveTextContent('AB 12-34')
  })

  it('gibt die Nummer als Text aus', () => {
    const { container } = render(<AusgabeDetails ausgabe={testAusgabe({ hologrammnummer: '<b>AB</b>' })} />)

    expect(container.querySelector('b')).toBeNull()
  })
})
