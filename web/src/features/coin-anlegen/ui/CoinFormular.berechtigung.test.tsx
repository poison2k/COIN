import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { erstelleFakeApi, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import { formularFelder, fuelleAus, meldungMit, TEXTE } from '../../../../test/hilfen'
import { CoinFormular } from './CoinFormular'

// AK-27: 403 beim Anlegen → Meldung im Formular per role="alert".

const TEXT_403 = 'Sie sind nicht berechtigt, Coins zu erfassen.'
const POST_COINS = /^\/api\/coins$/

let api: FakeApi
let onGespeichert: ReturnType<typeof vi.fn<(coin: Coin) => void>>

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
  onGespeichert = vi.fn<(coin: Coin) => void>()
})

async function sendeMit403() {
  api.einmal('POST', POST_COINS, problemAntwort(403, { title: 'Kein Zugriff' }))
  const user = userEvent.setup()
  render(<CoinFormular onGespeichert={onGespeichert} />)
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
    expect(onGespeichert).not.toHaveBeenCalled()
  })

  it('zeigt keine technischen Details der Antwort', async () => {
    await sendeMit403()
    await screen.findByText(TEXT_403)

    expect(document.body.textContent).not.toMatch(/403|Forbidden|Kein Zugriff/)
  })

  it('lädt kein Bild hoch, wenn das Anlegen mit 403 abgelehnt wurde', async () => {
    api.einmal('POST', POST_COINS, problemAntwort(403))
    const user = userEvent.setup({ applyAccept: false })
    render(<CoinFormular onGespeichert={onGespeichert} />)
    const bild = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'motiv.png', { type: 'image/png' })
    await fuelleAus(user, { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta', bild })

    await user.click(formularFelder().absenden)
    await screen.findByText(TEXT_403)

    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })
})
