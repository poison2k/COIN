import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi } from './test/fakeApi'
import { TEXTE } from './test/hilfen'
import App from './App'

// AK-28: Die Startseite zeigt den Katalog (Liste und Formular), nicht mehr das Vite-Template.

beforeEach(() => {
  vi.stubGlobal('fetch', erstelleFakeApi().fetch)
})

describe('App', () => {
  it('zeigt auf der Startseite die Katalogliste', async () => {
    render(<App />)

    expect(await screen.findByText(TEXTE.leereListe)).toBeInTheDocument()
  })

  it('zeigt auf der Startseite das Formular „Coin anlegen“', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Coin anlegen' })).toBeInTheDocument()
  })

  it('enthält keine Inhalte des Vite-Templates mehr', async () => {
    render(<App />)
    await screen.findByText(TEXTE.leereListe)

    expect(screen.queryByText(/Get started|count is/i)).not.toBeInTheDocument()
  })
})
