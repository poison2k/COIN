import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spinner } from './spinner'

// Feature design-fundament, AK-9 (Abschnitt 5): Spinner aus der shadcn-CLI, nachbearbeitet mit deutschem Namen.

describe('Spinner (AK-9)', () => {
  it('hat die Rolle status mit dem Namen „Wird geladen“', () => {
    render(<Spinner />)

    expect(screen.getByRole('status', { name: 'Wird geladen' })).toBeInTheDocument()
  })

  it('enthält keinen englischen Text', () => {
    const { container } = render(<Spinner />)

    expect(container.innerHTML).not.toMatch(/Loading/i)
  })
})
