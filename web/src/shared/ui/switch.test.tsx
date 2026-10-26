import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Switch } from './switch'

// Feature startseite, AK-33 „keine Animationen“ (QA-Runde 1): Der Switch der Blockkarten darf beim Umschalten weder
// Übergänge noch Animationen haben. Geprüft werden die Tailwind-Klassen von Schalter und Griff, weil jsdom keine
// berechneten Übergänge kennt. Erlaubt sind nur die neutralen Werte `transition-none` bzw. `animate-none`.

/** Klassen-Token mit Übergang oder Animation (auch hinter Varianten wie `dark:` oder `data-checked:`). */
function animierteKlassen(element: Element): string[] {
  return [...element.classList].filter((klasse) => {
    const wert = klasse.split(':').pop() ?? ''
    return /^(transition|animate-|duration-)/.test(wert) && wert !== 'transition-none' && wert !== 'animate-none'
  })
}

describe('Switch ohne Animation (AK-33)', () => {
  it('hat am Schalter keine Übergangs- oder Animationsklassen', () => {
    render(<Switch aria-label="Testblock anzeigen" />)

    expect(animierteKlassen(screen.getByRole('switch', { name: 'Testblock anzeigen' }))).toEqual([])
  })

  it('hat am Griff keine Übergangs- oder Animationsklassen', () => {
    render(<Switch aria-label="Testblock anzeigen" />)

    const griffe = [...screen.getByRole('switch', { name: 'Testblock anzeigen' }).querySelectorAll('*')]
    expect(griffe.length).toBeGreaterThan(0)
    expect(griffe.flatMap(animierteKlassen)).toEqual([])
  })
})
