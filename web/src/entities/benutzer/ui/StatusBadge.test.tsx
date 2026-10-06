import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from '../index'

// Feature rollen-benutzerverwaltung, AK-28: Status als Badge mit Text (nicht nur Farbe).

describe('StatusBadge', () => {
  it('zeigt „Aktiv“ für aktive Benutzer', () => {
    render(<StatusBadge aktiv />)

    expect(screen.getByText('Aktiv')).toBeInTheDocument()
  })

  it('zeigt „Deaktiviert“ für deaktivierte Benutzer', () => {
    render(<StatusBadge aktiv={false} />)

    expect(screen.getByText('Deaktiviert')).toBeInTheDocument()
  })

  it('zeigt bei aktiven Benutzern nicht „Deaktiviert“', () => {
    render(<StatusBadge aktiv />)

    expect(screen.queryByText('Deaktiviert')).not.toBeInTheDocument()
  })
})
