import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Aktionsleiste } from './aktionsleiste'
import { Button } from './button'

// Feature formulare-detailseiten, AK-9 und AK-35 (Abschnitt 4.1, 4.8, ADR-0039 Punkt 4): Aktionsleiste mit „Abbrechen“
// links und der Hauptaktion rechts; Standard `fest` = sticky unter 768 px. Lage, Sticky und Verdecken prüft der UI-Test
// (formulare.spec.ts) im Browser; hier nur Inhalt, Reihenfolge und das Umschalten von `fest`.

function zeige(fest?: boolean) {
  const { container } = render(
    <form>
      <Aktionsleiste fest={fest}>
        <a href="/coins">Abbrechen</a>
        <Button type="submit">Coin anlegen</Button>
      </Aktionsleiste>
    </form>,
  )
  return container.querySelector('form')?.lastElementChild as HTMLElement
}

describe('Inhalt (AK-9)', () => {
  it('zeigt „Abbrechen“ und die Hauptaktion', () => {
    zeige()

    expect(screen.getByRole('link', { name: 'Abbrechen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coin anlegen' })).toBeInTheDocument()
  })

  it('stellt „Abbrechen“ in der DOM-Reihenfolge vor die Hauptaktion', () => {
    zeige()

    const abbrechen = screen.getByRole('link', { name: 'Abbrechen' })
    const haupt = screen.getByRole('button', { name: 'Coin anlegen' })
    expect(abbrechen.compareDocumentPosition(haupt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('fügt keine eigenen Bedienelemente hinzu', () => {
    zeige()

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('enthält beide Aktionen in einem gemeinsamen Element', () => {
    const leiste = zeige()

    expect(leiste).toContainElement(screen.getByRole('link', { name: 'Abbrechen' }))
    expect(leiste).toContainElement(screen.getByRole('button', { name: 'Coin anlegen' }))
  })
})

describe('fest (AK-9)', () => {
  it('klebt standardmäßig unter 768 px am unteren Rand (sticky bottom-0)', () => {
    const leiste = zeige()

    // Klassen ggf. mit Breakpoint-Präfix (z. B. max-md:sticky).
    expect(leiste.className).toMatch(/(^|[\s:])sticky(\s|$)/)
    expect(leiste.className).toMatch(/(^|[\s:])bottom-0(\s|$)/)
  })

  it('klebt mit fest={false} nicht', () => {
    const leiste = zeige(false)

    expect(leiste.className).not.toMatch(/(^|[\s:])sticky(\s|$)/)
  })
})
