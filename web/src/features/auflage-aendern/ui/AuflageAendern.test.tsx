import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  offeneAntwort,
  jsonAntwort,
  problemAntwort,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { AuflageAendern } from '../index'

// Feature coin-ausgaben, AK-25 (Entscheidung F3/F4) und AK-30: Button „Auflage ändern“ öffnet einen Dialog mit dem
// Feld „Auflage“ (Zahl, Pflicht, vorbelegt). Props { coinId, auflage, onGeaendert(coin) }.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PUT = /^\/api\/coins\/[^/]+\/auflage$/

let api: FakeApi
let onGeaendert: ReturnType<typeof vi.fn<(coin: Coin) => void>>

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })])
  vi.stubGlobal('fetch', api.fetch)
  onGeaendert = vi.fn<(coin: Coin) => void>()
})

function zeige(auflage: number | null = 150) {
  const user = userEvent.setup()
  render(<AuflageAendern coinId={COIN_ID} auflage={auflage} onGeaendert={onGeaendert} />)
  return { user }
}

const knopf = () => screen.getByRole('button', { name: 'Auflage ändern' })

async function oeffne(user: ReturnType<typeof userEvent.setup>) {
  await user.click(knopf())
  return screen.findByRole('dialog', { name: 'Auflage ändern' })
}

describe('Dialog', () => {
  it('öffnet einen Dialog mit dem Namen „Auflage ändern“', async () => {
    const { user } = zeige()

    expect(await oeffne(user)).toBeInTheDocument()
  })

  it('hat ein Zahlenfeld „Auflage“, vorbelegt mit der aktuellen Auflage', async () => {
    const { user } = zeige(150)
    const dialog = await oeffne(user)

    const feld = within(dialog).getByLabelText(/^Auflage/)
    expect(feld).toHaveAttribute('type', 'number')
    expect(feld).toHaveValue(150)
  })

  it('ist bei unbekannter Auflage leer', async () => {
    const { user } = zeige(null)
    const dialog = await oeffne(user)

    expect(within(dialog).getByLabelText(/^Auflage/)).toHaveValue(null)
  })

  it('bietet „Speichern“ und „Abbrechen“', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
  })

  it('zeigt keine englischen Texte', async () => {
    const { user } = zeige()
    await oeffne(user)

    expect(seitentext()).not.toMatch(/\b(Save|Cancel|Close|Edition|Required)\b/)
  })
})

describe('Prüfung', () => {
  it('lehnt ein leeres Feld mit „Auflage ist erforderlich.“ ab', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)
    await user.clear(within(dialog).getByLabelText(/^Auflage/))

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    const feld = within(dialog).getByLabelText(/^Auflage/)
    expect(feld).toHaveAttribute('aria-invalid', 'true')
    expect(feld).toHaveAccessibleDescription(/Auflage ist erforderlich\./)
  })

  it('sendet bei leerem Feld keinen Request', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)
    await user.clear(within(dialog).getByLabelText(/^Auflage/))

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })
})

describe('Speichern', () => {
  it('sendet PUT …/auflage mit der neuen Auflage', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)
    const feld = within(dialog).getByLabelText(/^Auflage/)
    await user.clear(feld)
    await user.type(feld, '200')

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(api.anfragenMit('PUT', PUT)).toHaveLength(1))
    expect(api.anfragenMit('PUT', PUT)[0].body).toEqual({ auflage: 200 })
  })

  it('schließt nach Erfolg und meldet den Coin über onGeaendert', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)
    const feld = within(dialog).getByLabelText(/^Auflage/)
    await user.clear(feld)
    await user.type(feld, '200')

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onGeaendert).toHaveBeenCalledWith(expect.objectContaining({ id: COIN_ID, auflage: 200 }))
  })

  it('sendet bei doppeltem Klick nur einmal', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT, () => offen.promise)
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    expect(api.anfragenMit('PUT', PUT)).toHaveLength(1)
    offen.aufloesen(jsonAntwort(200, testCoin({ id: COIN_ID })))
  })
})

describe('Fehler', () => {
  it('zeigt 409 auflage_zu_klein im Dialog', async () => {
    api.einmal(
      'PUT',
      PUT,
      ausgabeKonfliktAntwort(
        'auflage_zu_klein',
        'Die Auflage kann nicht unter 7 gesenkt werden, weil Exemplar Nr. 7 ausgegeben wurde.',
      ),
    )
    const { user } = zeige()
    const dialog = await oeffne(user)
    const feld = within(dialog).getByLabelText(/^Auflage/)
    await user.clear(feld)
    await user.type(feld, '6')

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        'Die Auflage kann nicht unter 7 gesenkt werden, weil Exemplar Nr. 7 ausgegeben wurde.',
      ),
    )
    expect(screen.getByRole('dialog', { name: 'Auflage ändern' })).toBeInTheDocument()
  })

  it('zeigt einen 400-Feldfehler im Dialog', async () => {
    api.einmal(
      'PUT',
      PUT,
      problemAntwort(400, {
        title: 'Eingaben ungültig',
        errors: { auflage: ['Auflage muss zwischen 1 und 1000000 liegen.'] },
      }),
    )
    const { user } = zeige()
    const dialog = await oeffne(user)
    const feld = within(dialog).getByLabelText(/^Auflage/)
    await user.clear(feld)
    await user.type(feld, '2000000')

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(dialog).toHaveTextContent('Auflage muss zwischen 1 und 1000000 liegen.'))
  })

  it('ruft onGeaendert bei einem Fehler nicht auf', async () => {
    api.einmal('PUT', PUT, ausgabeKonfliktAntwort('auflage_zu_klein', 'Die Auflage kann nicht unter 7 gesenkt werden.'))
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(dialog).toHaveTextContent('kann nicht unter 7'))
    expect(onGeaendert).not.toHaveBeenCalled()
  })
})

describe('Abbrechen', () => {
  it('schließt per „Abbrechen“ ohne Request und gibt den Fokus an den Button zurück', async () => {
    const { user } = zeige()
    const dialog = await oeffne(user)

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(knopf()).toHaveFocus())
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })

  it('schließt per Escape', async () => {
    const { user } = zeige()
    await oeffne(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
