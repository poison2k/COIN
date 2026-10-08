import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { erstelleFakeApi, keinZugriffAntwort, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import { formularFelder, fuelleAus, meldungMit, TEXTE } from '../../../../test/hilfen'
import { CoinFormular } from './CoinFormular'

// AK-27: 403 beim Anlegen → Meldung im Formular per role="alert".
// Feature katalog-seiten, AK-21 bis AK-24: onAngelegt(coin, { bild }) ersetzt onGespeichert und wird erst aufgerufen,
// wenn nichts mehr offen ist (nicht beim Teilerfolg); die Seite navigiert danach zur Detailseite.

type OnAngelegt = (coin: Coin, ergebnis: { bild: 'gespeichert' | 'ohne' }) => void

const TEXT_403 = 'Sie sind nicht berechtigt, Coins zu erfassen.'
const POST_COINS = /^\/api\/coins$/

let api: FakeApi
let onAngelegt: ReturnType<typeof vi.fn<OnAngelegt>>

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
  onAngelegt = vi.fn<OnAngelegt>()
})

async function sendeMit403() {
  api.einmal('POST', POST_COINS, problemAntwort(403, { title: 'Kein Zugriff' }))
  const user = userEvent.setup()
  render(<CoinFormular onAngelegt={onAngelegt} />)
  await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })
  await user.click(formularFelder().absenden)
  return { user }
}

describe('AK-27: 403 beim Anlegen', () => {
  it('zeigt „Sie sind nicht berechtigt, Coins zu erfassen.“ als Alarm', async () => {
    await sendeMit403()

    const alarm = await screen.findByRole('alert')
    expect(alarm).toHaveTextContent(TEXT_403)
  })

  it('meldet keinen Erfolg', async () => {
    await sendeMit403()
    await screen.findByText(TEXT_403)

    expect(meldungMit(TEXTE.erfolg)).toBeUndefined()
    expect(onAngelegt).not.toHaveBeenCalled()
  })

  it('zeigt keine technischen Details der Antwort', async () => {
    await sendeMit403()
    await screen.findByText(TEXT_403)

    expect(document.body.textContent).not.toMatch(/403|Forbidden|Kein Zugriff/)
  })

  it('lädt kein Bild hoch, wenn das Anlegen mit 403 abgelehnt wurde', async () => {
    api.einmal('POST', POST_COINS, problemAntwort(403))
    const user = userEvent.setup({ applyAccept: false })
    render(<CoinFormular onAngelegt={onAngelegt} />)
    const bild = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'motiv.png', { type: 'image/png' })
    await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta', bild })

    await user.click(formularFelder().absenden)
    await screen.findByText(TEXT_403)

    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })
})

// Feature rollen-benutzerverwaltung, AK-33: 403 mit code. Deaktivierte Benutzer bekommen einen eigenen Text,
// keine_berechtigung behält den bisherigen.

describe('AK-33: 403 mit code', () => {
  async function sendeMit(code: 'benutzer_deaktiviert' | 'keine_berechtigung') {
    api.einmal('POST', POST_COINS, keinZugriffAntwort(code))
    const user = userEvent.setup()
    render(<CoinFormular onAngelegt={onAngelegt} />)
    await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })
    await user.click(formularFelder().absenden)
  }

  it('zeigt bei benutzer_deaktiviert „Ihr Benutzerkonto ist deaktiviert.“ als Alarm', async () => {
    await sendeMit('benutzer_deaktiviert')

    const alarm = await screen.findByRole('alert')
    expect(alarm).toHaveTextContent('Ihr Benutzerkonto ist deaktiviert.')
  })

  it('zeigt bei benutzer_deaktiviert nicht den Text für fehlende Berechtigung', async () => {
    await sendeMit('benutzer_deaktiviert')
    await screen.findByText('Ihr Benutzerkonto ist deaktiviert.')

    expect(document.body.textContent).not.toContain(TEXT_403)
  })

  it('zeigt bei keine_berechtigung weiterhin „Sie sind nicht berechtigt, Coins zu erfassen.“', async () => {
    await sendeMit('keine_berechtigung')

    const alarm = await screen.findByRole('alert')
    expect(alarm).toHaveTextContent(TEXT_403)
  })
})
