import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { zeigeMitRouter } from '../../../test/router'
import { Fehler, NichtGefunden } from './Fehlerseiten'

// Feature design-fundament, AK-35 (Abschnitt 7): 404 als Leerzustand („Seite nicht gefunden.“ als Überschrift mit Link
// „Zur Startseite“), Router-Fehler als Fehlerzustand mit bestehendem Text und Link.

describe('404 als Leerzustand (AK-35)', () => {
  it('zeigt „Seite nicht gefunden.“ als Überschrift', async () => {
    zeigeMitRouter(() => <NichtGefunden />)

    expect(await screen.findByRole('heading', { name: 'Seite nicht gefunden.' })).toBeInTheDocument()
  })

  it('zeigt den Link „Zur Startseite“ als Aktion', async () => {
    zeigeMitRouter(() => <NichtGefunden />)

    expect(await screen.findByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/')
  })

  it('setzt keinen eigenen Seitenrahmen (max-w-5xl)', async () => {
    const { container } = zeigeMitRouter(() => <NichtGefunden />)
    await screen.findByRole('link', { name: 'Zur Startseite' })

    expect(container.innerHTML).not.toContain('max-w-5xl')
  })
})

describe('Router-Fehler als Fehlerzustand (AK-35)', () => {
  it('zeigt den bestehenden Text als alert', async () => {
    zeigeMitRouter(() => <Fehler />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Es ist ein unerwarteter Fehler aufgetreten. Bitte die Seite neu laden.',
    )
  })

  it('zeigt den Link „Zur Startseite“', async () => {
    zeigeMitRouter(() => <Fehler />)

    expect(await screen.findByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/')
  })

  it('setzt keinen eigenen Seitenrahmen (max-w-5xl)', async () => {
    const { container } = zeigeMitRouter(() => <Fehler />)
    await screen.findByRole('alert')

    expect(container.innerHTML).not.toContain('max-w-5xl')
  })
})
