import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { TEXTE } from '../../../../test/hilfen'
import { CoinListeSeite } from './CoinListeSeite'

// AK-33: Der Abschnitt „Neuen Coin erfassen“ hängt vom Anmeldezustand ab (Prop erfassen).
// Der Fall „anmelden“ (mit Button „Anmelden“) braucht den Anmelde-Kontext und wird in App.anmeldung.test.tsx geprüft.

const TEXT_KEINE_BERECHTIGUNG = 'Coins erfassen können nur Administratoren und Sachbearbeiter.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([
    testCoin({ name: 'Coin Alpha', bildUrl: '/api/coins/0199a1b2-0000-7000-8000-000000000001/bild?v=a' }),
  ])
  vi.stubGlobal('fetch', api.fetch)
})

describe('erfassen = keineBerechtigung', () => {
  it('zeigt den Hinweis für Benutzer ohne Schreibrolle', async () => {
    render(<CoinListeSeite erfassen="keineBerechtigung" />)

    expect(await screen.findByText(TEXT_KEINE_BERECHTIGUNG)).toBeInTheDocument()
  })

  it('zeigt kein Formular', async () => {
    render(<CoinListeSeite erfassen="keineBerechtigung" />)
    await screen.findByText(TEXT_KEINE_BERECHTIGUNG)

    expect(screen.queryByRole('button', { name: 'Coin anlegen' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument()
  })

  it('behält die Überschrift „Neuen Coin erfassen“', async () => {
    render(<CoinListeSeite erfassen="keineBerechtigung" />)

    expect(await screen.findByRole('heading', { level: 2, name: 'Neuen Coin erfassen' })).toBeInTheDocument()
  })

  it('zeigt die Katalogliste mit Motivbild', async () => {
    render(<CoinListeSeite erfassen="keineBerechtigung" />)

    const bild = await screen.findByRole('img', { name: 'Motiv: Coin Alpha' })
    expect(bild).toHaveAttribute('src', '/api/coins/0199a1b2-0000-7000-8000-000000000001/bild?v=a')
  })

  it('bietet keinen Button „Anmelden“ an (der Benutzer ist bereits angemeldet)', async () => {
    render(<CoinListeSeite erfassen="keineBerechtigung" />)
    await screen.findByText(TEXT_KEINE_BERECHTIGUNG)

    expect(screen.queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
  })
})

describe('erfassen = erlaubt (Standard)', () => {
  it('zeigt das Formular ohne Angabe von erfassen', async () => {
    render(<CoinListeSeite />)

    expect(await screen.findByRole('button', { name: 'Coin anlegen' })).toBeInTheDocument()
  })

  it('zeigt das Formular bei erfassen = erlaubt', async () => {
    render(<CoinListeSeite erfassen="erlaubt" />)

    expect(await screen.findByRole('button', { name: 'Coin anlegen' })).toBeInTheDocument()
    expect(screen.queryByText(TEXT_KEINE_BERECHTIGUNG)).not.toBeInTheDocument()
  })

  it('zeigt weiterhin die Liste', async () => {
    api.coins.splice(0)
    render(<CoinListeSeite erfassen="erlaubt" />)

    expect(await screen.findByText(TEXTE.leereListe)).toBeInTheDocument()
  })
})
