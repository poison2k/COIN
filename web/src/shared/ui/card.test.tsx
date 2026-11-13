import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card'

// Feature design-fundament, AK-14 (Abschnitt 5): CardTitle mit Überschriftenebene, keine <header>/<footer>-Elemente.

describe('CardTitle (AK-14)', () => {
  it.each([2, 3, 4] as const)('rendert mit ebene={%i} eine Überschrift dieser Ebene', (ebene) => {
    render(<CardTitle ebene={ebene}>Stammdaten</CardTitle>)

    expect(screen.getByRole('heading', { level: ebene, name: 'Stammdaten' })).toBeInTheDocument()
  })

  it.each([
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
  ] as const)('verwendet für ebene={%i} das Element %s', (ebene, tag) => {
    render(<CardTitle ebene={ebene}>Stammdaten</CardTitle>)

    expect(screen.getByText('Stammdaten').tagName).toBe(tag)
  })

  it('rendert ohne ebene keine Überschrift, sondern ein div', () => {
    render(<CardTitle>Stammdaten</CardTitle>)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByText('Stammdaten').tagName).toBe('DIV')
  })
})

describe('Card (AK-14)', () => {
  it('enthält mit allen Teilen weder <header> noch <footer>', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle ebene={2}>Stammdaten</CardTitle>
          <CardDescription>Angaben zum Coin</CardDescription>
          <CardAction>
            <button type="button">Bearbeiten</button>
          </CardAction>
        </CardHeader>
        <CardContent>Inhalt</CardContent>
        <CardFooter>Fuß</CardFooter>
      </Card>,
    )

    expect(container.querySelectorAll('header, footer')).toHaveLength(0)
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('zeigt Titel, Beschreibung, Aktion und Inhalt', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle ebene={3}>Exemplare</CardTitle>
          <CardDescription>Alle Exemplare dieses Coins</CardDescription>
          <CardAction>
            <button type="button">Auflage ändern</button>
          </CardAction>
        </CardHeader>
        <CardContent>Tabelle</CardContent>
      </Card>,
    )

    expect(screen.getByRole('heading', { level: 3, name: 'Exemplare' })).toBeInTheDocument()
    expect(screen.getByText('Alle Exemplare dieses Coins')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Auflage ändern' })).toBeInTheDocument()
    expect(screen.getByText('Tabelle')).toBeInTheDocument()
  })
})
