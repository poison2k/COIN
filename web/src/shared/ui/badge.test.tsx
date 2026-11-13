import { render, screen } from '@testing-library/react'
import { CircleCheckIcon } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge'

// Feature design-fundament, AK-16, AK-40 (Abschnitt 5): Status-Varianten der Badge. Bedeutung immer im Text, Icon
// aria-hidden, Farben nur aus Tokens (je *-subtle-Fläche mit Statusfarbe als Text).

const STATUS = ['info', 'success', 'warning', 'destructive'] as const
const VARIANTEN = ['neutral', ...STATUS] as const

/** Palettenklassen und beliebige Farbwerte wie im Code-Test gestaltungsregeln.test.ts. */
const KEINE_TOKENFARBE =
  /(?:bg|text|border|ring)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b|-(?:black|white)\b|-\[(?:#|rgba?\(|hsla?\(|oklch\(|color-mix\()/

describe('Status-Varianten (AK-16)', () => {
  it.each(VARIANTEN.map((v) => [v]))('zeigt in der Variante „%s“ den Text', (variant) => {
    render(<Badge variant={variant}>Verfügbar</Badge>)

    expect(screen.getByText('Verfügbar')).toBeVisible()
  })

  it.each(VARIANTEN.map((v) => [v]))('verwendet in der Variante „%s“ nur Token-Farben', (variant) => {
    render(<Badge variant={variant}>Verfügbar</Badge>)

    expect(screen.getByText('Verfügbar').className).not.toMatch(KEINE_TOKENFARBE)
  })

  it.each(STATUS.map((v) => [v]))('legt in der Variante „%s“ die Statusfarbe auf die *-subtle-Fläche', (variant) => {
    render(<Badge variant={variant}>Verfügbar</Badge>)

    const klassen = screen.getByText('Verfügbar').className
    expect(klassen).toMatch(new RegExp(`(^|\\s)bg-${variant}-subtle(\\s|$)`))
    expect(klassen).toMatch(new RegExp(`(^|\\s)text-${variant}(\\s|$)`))
  })

  it.each(VARIANTEN.map((v) => [v]))('ist in der Variante „%s“ vollständig gerundet', (variant) => {
    render(<Badge variant={variant}>Verfügbar</Badge>)

    expect(screen.getByText('Verfügbar').className).toMatch(/(^|\s)rounded-full(\s|$)/)
  })

  it('blendet ein gesetztes Icon für Screenreader aus', () => {
    render(
      <Badge variant="success">
        <CircleCheckIcon />
        Aktiv
      </Badge>,
    )

    const icon = screen.getByText('Aktiv').querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('behält die bestehenden Varianten bei', () => {
    render(
      <>
        <Badge variant="default">A</Badge>
        <Badge variant="secondary">B</Badge>
        <Badge variant="outline">C</Badge>
      </>,
    )

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })
})
