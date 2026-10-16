import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  keinZugriffAntwort,
  offeneAntwort,
  problemAntwort,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { gibEin, meldungMit, seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinBearbeitenFormular } from '../index'

// Feature zertifikatsvorlagen, AK-22 und AK-28: Formular „Stammdaten“ (vorbelegt) mit „Name“, „Herausgeber“,
// „Auflage“ (Pflicht, wenn gesetzt, sonst „(optional)“), „Beschreibung (optional)“ und „Änderungen speichern“.
// Clientseitige Prüfung wie beim Anlegen, Fehler per aria-invalid/aria-describedby, Fokus auf das erste fehlerhafte
// Feld. Props { coin, onGespeichert(coin) }.

const ID = '0199a1b2-0000-7000-8000-0000000000b1'
const PUT = /^\/api\/coins\/[^/]+$/
const HINWEIS_AUFLAGE = 'Die Auflage kann nur bis zur höchsten bereits ausgegebenen Exemplar-Nummer gesenkt werden.'

let api: FakeApi
let onGespeichert: ReturnType<typeof vi.fn<(coin: Coin) => void>>

/** Rendert das Formular im Router; TanStack Router rendert asynchron, daher erst auf das Formular warten. */
async function zeige(coin: Coin = testCoin({ id: ID, auflage: 250, beschreibung: 'Alte Beschreibung' })) {
  api = erstelleFakeApi([coin, testCoin({ id: '0199a1b2-0000-7000-8000-0000000000b2', name: 'Coin Vorhanden' })])
  vi.stubGlobal('fetch', api.fetch)
  const user = userEvent.setup()
  zeigeMitRouter(() => <CoinBearbeitenFormular coin={coin} onGespeichert={onGespeichert} />, {
    pfad: '/coins/$coinId/bearbeiten',
    start: `/coins/${coin.id}/bearbeiten`,
  })
  await screen.findByRole('button', { name: 'Änderungen speichern' })
  return { user }
}

beforeEach(() => {
  onGespeichert = vi.fn<(coin: Coin) => void>()
})

function felder() {
  return {
    name: screen.getByLabelText(/^Name/) as HTMLInputElement,
    herausgeber: screen.getByLabelText(/^Herausgeber/) as HTMLInputElement,
    auflage: screen.getByLabelText(/^Auflage/) as HTMLInputElement,
    beschreibung: screen.getByLabelText(/^Beschreibung/) as HTMLTextAreaElement,
    speichern: screen.getByRole('button', { name: 'Änderungen speichern' }) as HTMLButtonElement,
  }
}

async function leere(user: ReturnType<typeof userEvent.setup>, feld: HTMLElement) {
  await user.clear(feld)
}

const puts = () => api.anfragenMit('PUT', PUT)

describe('Vorbelegung und Aufbau', () => {
  it('belegt alle Felder mit den Stammdaten des Coins vor', async () => {
    await zeige()

    const f = felder()
    expect([f.name.value, f.herausgeber.value, f.auflage.value, f.beschreibung.value]).toEqual([
      'Coin Alpha',
      'Herausgeber Beta',
      '250',
      'Alte Beschreibung',
    ])
  })

  it('kennzeichnet die Auflage als Pflicht, wenn sie gesetzt ist', async () => {
    await zeige()

    expect(felder().auflage).toBeRequired()
    expect(screen.queryByLabelText('Auflage (optional)')).not.toBeInTheDocument()
  })

  it('beschriftet die Auflage mit „(optional)“, wenn der Coin keine hat', async () => {
    await zeige(testCoin({ id: ID, auflage: null }))

    expect(screen.getByLabelText('Auflage (optional)')).not.toBeRequired()
  })

  it('beschreibt das Feld Auflage mit dem Hinweis zur Untergrenze', async () => {
    await zeige()

    expect(felder().auflage).toHaveAccessibleDescription(expect.stringContaining(HINWEIS_AUFLAGE))
  })

  it('beschriftet die Beschreibung mit „Beschreibung (optional)“', async () => {
    await zeige()

    expect(screen.getByLabelText('Beschreibung (optional)')).toBeInTheDocument()
  })

  it('sendet beim Anzeigen keinen Request', async () => {
    await zeige()

    expect(api.anfragen).toHaveLength(0)
  })

  it('zeigt keine englischen Texte', async () => {
    await zeige()

    expect(seitentext()).not.toMatch(/\b(Save|Cancel|Name is|Required|Edition|Description)\b/)
  })
})

describe('Speichern', () => {
  it('sendet PUT /api/coins/{id} mit den geänderten Stammdaten', async () => {
    const { user } = await zeige()
    await leere(user, felder().name)
    await gibEin(user, felder().name, 'Coin Neu')
    await leere(user, felder().auflage)
    await gibEin(user, felder().auflage, '300')
    await leere(user, felder().beschreibung)

    await user.click(felder().speichern)

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0].pfad).toBe(`/api/coins/${ID}`)
    expect(puts()[0].body).toEqual({
      name: 'Coin Neu',
      herausgeber: 'Herausgeber Beta',
      auflage: 300,
      beschreibung: null,
    })
  })

  it('meldet den gespeicherten Coin an onGespeichert', async () => {
    const { user } = await zeige()

    await user.click(felder().speichern)

    await waitFor(() => expect(onGespeichert).toHaveBeenCalledTimes(1))
    expect(onGespeichert.mock.calls[0][0]).toMatchObject({ id: ID, name: 'Coin Alpha' })
  })

  it('speichert per Tastatur (Enter im Feld Name)', async () => {
    const { user } = await zeige()

    felder().name.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(puts()).toHaveLength(1))
  })

  it('sperrt das Absenden während des Speicherns (Doppelklick sendet einmal)', async () => {
    const offen = offeneAntwort()
    const { user } = await zeige()
    api.einmal('PUT', PUT, () => offen.promise)

    await user.click(felder().speichern)
    await user.click(felder().speichern)

    expect(puts()).toHaveLength(1)
    expect(felder().speichern.disabled || felder().speichern.getAttribute('aria-disabled') === 'true').toBe(true)
    offen.aufloesen(problemAntwort(500))
  })
})

describe('clientseitige Prüfung', () => {
  it('meldet „Name ist erforderlich.“ ohne Request und markiert das Feld', async () => {
    const { user } = await zeige()
    await leere(user, felder().name)

    await user.click(felder().speichern)

    await waitFor(() => expect(felder().name).toHaveAttribute('aria-invalid', 'true'))
    expect(felder().name).toHaveAccessibleDescription(expect.stringContaining('Name ist erforderlich.'))
    expect(puts()).toHaveLength(0)
  })

  it('meldet bei gesetzter Auflage und leerem Feld „Auflage ist erforderlich.“', async () => {
    const { user } = await zeige()
    await leere(user, felder().auflage)

    await user.click(felder().speichern)

    await waitFor(() =>
      expect(felder().auflage).toHaveAccessibleDescription(expect.stringContaining('Auflage ist erforderlich.')),
    )
    expect(puts()).toHaveLength(0)
  })

  it('erlaubt eine leere Auflage, wenn der Coin keine hat', async () => {
    const { user } = await zeige(testCoin({ id: ID, auflage: null }))

    await user.click(felder().speichern)

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect((puts()[0].body as { auflage: unknown }).auflage).toBeNull()
  })

  it('meldet eine Auflage außerhalb des Bereichs mit dem Text vom Anlegen', async () => {
    const { user } = await zeige()
    await leere(user, felder().auflage)
    await gibEin(user, felder().auflage, '0')

    await user.click(felder().speichern)

    await waitFor(() =>
      expect(felder().auflage).toHaveAccessibleDescription(
        expect.stringContaining('Auflage muss zwischen 1 und 1000000 liegen.'),
      ),
    )
  })

  it('setzt den Fokus auf das erste fehlerhafte Feld', async () => {
    const { user } = await zeige()
    await leere(user, felder().herausgeber)
    await leere(user, felder().auflage)

    await user.click(felder().speichern)

    await waitFor(() => expect(felder().herausgeber).toHaveFocus())
  })
})

describe('Fehler vom Server', () => {
  it('zeigt 400-Feldfehler am Feld und behält die Eingaben', async () => {
    const { user } = await zeige()
    await leere(user, felder().name)
    await gibEin(user, felder().name, 'Coin Serverfehler')
    api.einmal(
      'PUT',
      PUT,
      problemAntwort(400, { title: 'Eingaben ungültig', errors: { name: ['Name ist ungültig.'] } }),
    )

    await user.click(felder().speichern)

    await waitFor(() =>
      expect(felder().name).toHaveAccessibleDescription(expect.stringContaining('Name ist ungültig.')),
    )
    expect(felder().name).toHaveAttribute('aria-invalid', 'true')
    expect(felder().name.value).toBe('Coin Serverfehler')
    expect(onGespeichert).not.toHaveBeenCalled()
  })

  it('zeigt 409 auflage_zu_klein am Feld Auflage mit dem Text des Servers', async () => {
    const detail = 'Die Auflage kann nicht unter 7 gesenkt werden, weil Exemplar Nr. 7 ausgegeben wurde.'
    const { user } = await zeige()
    await leere(user, felder().auflage)
    await gibEin(user, felder().auflage, '6')
    api.einmal('PUT', PUT, ausgabeKonfliktAntwort('auflage_zu_klein', detail))

    await user.click(felder().speichern)

    await waitFor(() => expect(felder().auflage).toHaveAccessibleDescription(expect.stringContaining(detail)))
    expect(felder().auflage).toHaveAttribute('aria-invalid', 'true')
    expect(felder().auflage.value).toBe('6')
  })

  it('zeigt 409 coin_existiert als Alarm', async () => {
    const { user } = await zeige()
    await leere(user, felder().name)
    await gibEin(user, felder().name, 'Coin Vorhanden')

    await user.click(felder().speichern)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ein Coin mit diesem Namen und Herausgeber existiert bereits.',
    )
    expect(felder().name.value).toBe('Coin Vorhanden')
  })

  it('zeigt 403 für Deaktivierte „Ihr Benutzerkonto ist deaktiviert.“', async () => {
    const { user } = await zeige()
    api.einmal('PUT', PUT, keinZugriffAntwort('benutzer_deaktiviert'))

    await user.click(felder().speichern)

    await waitFor(() => expect(meldungMit('Ihr Benutzerkonto ist deaktiviert.')).toBeDefined())
  })

  it('zeigt 401 den Hinweis auf die abgelaufene Anmeldung', async () => {
    const { user } = await zeige()
    api.einmal('PUT', PUT, problemAntwort(401))

    await user.click(felder().speichern)

    await waitFor(() =>
      expect(meldungMit('Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …')).toBeDefined(),
    )
  })

  it('zeigt 403 ohne Berechtigung einen Alarm', async () => {
    const { user } = await zeige()
    api.einmal('PUT', PUT, keinZugriffAntwort('keine_berechtigung'))

    await user.click(felder().speichern)

    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht berechtigt/)
  })
})
