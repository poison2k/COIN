import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExemplarStatusBadge } from './ExemplarStatusBadge'

// Feature coin-ausgaben, AK-20 und AK-30: Status als Badge mit Text, nicht nur über Farbe.

describe('ExemplarStatusBadge', () => {
  it('zeigt „verfügbar“ für verfuegbar', () => {
    render(<ExemplarStatusBadge status="verfuegbar" />)

    expect(screen.getByText('verfügbar')).toBeInTheDocument()
  })

  it('zeigt „ausgegeben“ für ausgegeben', () => {
    render(<ExemplarStatusBadge status="ausgegeben" />)

    expect(screen.getByText('ausgegeben')).toBeInTheDocument()
  })

  it('unterscheidet die Status nicht nur über Farbe (unterschiedlicher Text)', () => {
    const { container: verfuegbar } = render(<ExemplarStatusBadge status="verfuegbar" />)
    const { container: ausgegeben } = render(<ExemplarStatusBadge status="ausgegeben" />)

    expect(verfuegbar.textContent?.trim()).not.toBe(ausgegeben.textContent?.trim())
  })

  it('zeigt keinen technischen Schlüssel', () => {
    const { container } = render(<ExemplarStatusBadge status="verfuegbar" />)

    expect(container.textContent).not.toContain('verfuegbar')
  })
})
