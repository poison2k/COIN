import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import {
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testCoin,
  testDatei,
  type FakeApi,
} from '../../../../test/fakeApi'
import { meldungMit, seitentext } from '../../../../test/hilfen'
import { MotivbildHochladen } from '../index'

// Feature zertifikatsvorlagen, AK-29 (F5): Motivbild auf „Coin bearbeiten“ ersetzen über PUT /api/coins/{id}/bild.
// Dateifeld „Neues Motivbild“ mit den Hinweisen aus dem Anlegen-Formular, Button „Bild hochladen“, Erfolg als Status
// „Motivbild wurde gespeichert.“, Fehlertexte wie beim Anlegen, kein Löschen. Props { coin, onGespeichert(coin) }.

const ID = '0199a1b2-0000-7000-8000-0000000000c1'
const PUT_BILD = /^\/api\/coins\/[^/]+\/bild$/

let api: FakeApi
let onGespeichert: ReturnType<typeof vi.fn<(coin: Coin) => void>>

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: ID })])
  vi.stubGlobal('fetch', api.fetch)
  onGespeichert = vi.fn<(coin: Coin) => void>()
})

function zeige(coin: Coin = testCoin({ id: ID })) {
  const user = userEvent.setup({ applyAccept: false })
  render(<MotivbildHochladen coin={coin} onGespeichert={onGespeichert} />)
  return { user }
}

const feld = () => screen.getByLabelText(/^Neues Motivbild/) as HTMLInputElement
const knopf = () => screen.getByRole('button', { name: 'Bild hochladen' }) as HTMLButtonElement

describe('Aufbau', () => {
  it('hat ein Dateifeld „Neues Motivbild“', () => {
    zeige()

    expect(feld()).toHaveAttribute('type', 'file')
  })

  it('beschreibt das Dateifeld mit den Hinweisen aus dem Anlegen-Formular', () => {
    zeige()

    expect(feld()).toHaveAccessibleDescription(expect.stringContaining('JPEG, PNG oder WebP, höchstens 5 MB.'))
    expect(feld()).toHaveAccessibleDescription(
      expect.stringContaining('Bitte nur Bilder ohne personenbezogene Metadaten hochladen.'),
    )
  })

  it('bietet kein Löschen oder Entfernen des Motivbilds', () => {
    zeige(testCoin({ id: ID, bildUrl: `/api/coins/${ID}/bild?v=aaaa` }))

    const namen = screen.queryAllByRole('button').map((b) => b.textContent ?? '')
    expect(namen.filter((n) => /löschen|entfernen/i.test(n))).toEqual([])
  })

  it('zeigt keine englischen Texte', () => {
    zeige()

    expect(seitentext()).not.toMatch(/\b(Upload|Browse|Choose|No file|Image)\b/)
  })
})

describe('Hochladen', () => {
  it('sendet PUT /api/coins/{id}/bild mit der Datei im Feld „datei“', async () => {
    const { user } = zeige()
    await user.upload(feld(), testDatei('image/png', 2048, 'motiv.png'))

    await user.click(knopf())

    await waitFor(() => expect(api.anfragenMit('PUT', PUT_BILD)).toHaveLength(1))
    expect(((api.anfragenMit('PUT', PUT_BILD)[0].body as FormData).get('datei') as File).name).toBe('motiv.png')
  })

  it('meldet „Motivbild wurde gespeichert.“ als Status', async () => {
    const { user } = zeige()
    await user.upload(feld(), testDatei('image/png', 2048, 'motiv.png'))

    await user.click(knopf())

    await waitFor(() => expect(meldungMit('Motivbild wurde gespeichert.')?.getAttribute('role')).toBe('status'))
  })

  it('meldet den aktualisierten Coin mit neuer bildUrl an onGespeichert', async () => {
    const { user } = zeige()
    await user.upload(feld(), testDatei('image/png', 2048, 'motiv.png'))

    await user.click(knopf())

    await waitFor(() => expect(onGespeichert).toHaveBeenCalledTimes(1))
    expect(onGespeichert.mock.calls[0][0].bildUrl).toMatch(new RegExp(`^/api/coins/${ID}/bild\\?v=`))
  })

  it('sendet für ein nicht erlaubtes Format keinen Request und nennt den Text vom Anlegen', async () => {
    const { user } = zeige()
    await user.upload(feld(), testDatei('image/gif', 2048, 'motiv.gif'))

    await user.click(knopf())

    await waitFor(() => expect(seitentext()).toContain('Nur JPEG, PNG oder WebP erlaubt.'))
    expect(api.anfragenMit('PUT', PUT_BILD)).toHaveLength(0)
    expect(feld()).toHaveAttribute('aria-invalid', 'true')
  })

  it('sendet für ein zu großes Bild keinen Request und nennt den Text vom Anlegen', async () => {
    const { user } = zeige()
    await user.upload(feld(), testDatei('image/jpeg', 5_242_881, 'motiv.jpg'))

    await user.click(knopf())

    await waitFor(() => expect(seitentext()).toContain('Bild ist zu groß (max. 5 MB).'))
    expect(api.anfragenMit('PUT', PUT_BILD)).toHaveLength(0)
  })

  it('zeigt 415 vom Server mit dem Text vom Anlegen', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(415))
    const { user } = zeige()
    await user.upload(feld(), testDatei('image/png', 2048, 'motiv.png'))

    await user.click(knopf())

    await waitFor(() => expect(seitentext()).toContain('Nur JPEG, PNG oder WebP erlaubt.'))
    expect(onGespeichert).not.toHaveBeenCalled()
  })

  it('zeigt 413 vom Server mit dem Text vom Anlegen', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(413))
    const { user } = zeige()
    await user.upload(feld(), testDatei('image/png', 2048, 'motiv.png'))

    await user.click(knopf())

    await waitFor(() => expect(seitentext()).toContain('Bild ist zu groß (max. 5 MB).'))
  })

  it('sperrt den Button während des Hochladens', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT_BILD, () => offen.promise)
    const { user } = zeige()
    await user.upload(feld(), testDatei('image/png', 2048, 'motiv.png'))

    await user.click(knopf())
    await user.click(knopf())

    expect(api.anfragenMit('PUT', PUT_BILD)).toHaveLength(1)
    expect(knopf().disabled || knopf().getAttribute('aria-disabled') === 'true').toBe(true)
    offen.aufloesen(problemAntwort(500))
  })
})
