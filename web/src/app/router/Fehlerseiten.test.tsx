import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { erstelleRouter } from './router'

// AK-17, Abschnitt 6: Die Fehlerkomponente des Routers ist deutsch und zeigt keine technischen Details.
// Die Coin-Liste wird durch eine werfende Komponente ersetzt; Routenbaum, Fabrik und Fehlerkomponente bleiben echt.

const GEHEIME_MELDUNG = 'Interner Fehler XYZ-4711 in der Datenbankschicht'

vi.mock('@/pages/coin-liste', () => ({
  CoinListeSeite: () => {
    throw new Error('Interner Fehler XYZ-4711 in der Datenbankschicht')
  },
}))

beforeEach(() => {
  // React und der Router protokollieren den absichtlich geworfenen Fehler; die Ausgabe ist hier erwartet.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function zeigeFehlerhafteRoute() {
  const router = erstelleRouter(createMemoryHistory({ initialEntries: ['/coins'] }))
  render(<App router={router} />)
}

describe('Fehlerkomponente des Routers', () => {
  it('zeigt bei einem Fehler in einer Route einen deutschen Hinweis als Meldung', async () => {
    zeigeFehlerhafteRoute()

    expect(await screen.findByRole('alert')).toHaveTextContent(/unerwarteter Fehler/)
  })

  it('bietet auf der Fehlerseite den Link „Zur Startseite“ an', async () => {
    zeigeFehlerhafteRoute()
    await screen.findByRole('alert')

    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/')
  })

  it('zeigt die Fehlermeldung nicht im DOM an', async () => {
    zeigeFehlerhafteRoute()
    await screen.findByRole('alert')

    expect(document.body.textContent).not.toContain(GEHEIME_MELDUNG)
    expect(document.body.innerHTML).not.toContain('XYZ-4711')
  })

  it('zeigt keinen Fehlertyp und keinen Stacktrace an', async () => {
    zeigeFehlerhafteRoute()
    await screen.findByRole('alert')

    expect(document.body.textContent).not.toMatch(/Error|at \S+ \(|\.tsx?:\d+/)
  })

  it('zeigt keine englischen Standardtexte der Router-Fehlerkomponente', async () => {
    zeigeFehlerhafteRoute()
    await screen.findByRole('alert')

    expect(document.body.textContent).not.toMatch(/Something went wrong|Show Error|Hide Error/i)
  })
})
