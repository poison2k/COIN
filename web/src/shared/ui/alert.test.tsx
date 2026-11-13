import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert, AlertDescription, AlertTitle } from './alert'

// Feature design-fundament, AK-18, AK-40 (Abschnitt 5): Hinweisbanner mit festem Icon je Variante, Titel als Träger
// der Bedeutung, Rolle standardmäßig alert und überschreibbar.

const VARIANTEN = ['info', 'success', 'warning', 'destructive'] as const

function zeige(variant: (typeof VARIANTEN)[number] | 'default', role?: string) {
  // role nur übergeben, wenn gesetzt: „ohne role-Prop“ heißt ohne Attribut, nicht role={undefined}.
  render(
    <Alert variant={variant} {...(role ? { role } : {})}>
      <AlertTitle>Titel {variant}</AlertTitle>
      <AlertDescription>Beschreibung</AlertDescription>
    </Alert>,
  )
}

/** Icons (svg) im Banner. */
function icons(banner: HTMLElement): SVGElement[] {
  return [...banner.querySelectorAll('svg')]
}

describe('Varianten (AK-18)', () => {
  it.each(VARIANTEN.map((v) => [v]))('zeigt in der Variante „%s“ ein Icon', (variant) => {
    zeige(variant)

    expect(icons(screen.getByRole('alert'))).toHaveLength(1)
  })

  it.each(VARIANTEN.map((v) => [v]))('blendet das Icon der Variante „%s“ für Screenreader aus', (variant) => {
    zeige(variant)

    const [icon] = icons(screen.getByRole('alert'))
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it.each(VARIANTEN.map((v) => [v]))('zeigt in der Variante „%s“ den Titel', (variant) => {
    zeige(variant)

    expect(screen.getByRole('alert')).toHaveTextContent(`Titel ${variant}`)
  })

  it('verwendet für jede Variante ein eigenes Icon', () => {
    const formen = VARIANTEN.map((variant) => {
      const { unmount } = render(
        <Alert variant={variant}>
          <AlertTitle>Titel</AlertTitle>
        </Alert>,
      )
      const svg = screen.getByRole('alert').querySelector('svg')
      const form = `${svg?.getAttribute('class') ?? ''}|${svg?.innerHTML ?? ''}`
      unmount()
      return form
    })

    expect(new Set(formen).size).toBe(VARIANTEN.length)
  })
})

describe('Rolle (AK-18)', () => {
  it('hat ohne role-Prop die Rolle alert', () => {
    zeige('info')

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('rendert mit role="status" die Rolle status', () => {
    zeige('success', 'status')

    expect(screen.getByRole('status')).toHaveTextContent('Titel success')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('behält die Variante „default“ bei', () => {
    zeige('default')

    expect(screen.getByRole('alert')).toHaveTextContent('Titel default')
  })
})
