import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { beobachteDownloads } from '../../../../test/downloads'
import { erstelleFakeApi, testCoin, testDatei, type FakeApi } from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinBearbeitenSeite } from '../index'

// Feature zertifikatsvorlagen, AK-26, AK-28, AK-29, AK-30 und AK-33: Seite „Coin bearbeiten“ (/coins/{id}/bearbeiten).
// Props { coinId, onGespeichert(coin) }; keine Router-Hooks. Lädt den Coin, h1 „Coin bearbeiten“, darunter der Name;
// Abschnitte „Stammdaten“, „Motivbild“, „Zertifikatsvorlage“; Link „Abbrechen“ zur Detailseite.

const ID = '0199a1b2-0000-7000-8000-0000000000e1'
const ENGLISCH =
  /\b(Edit|Save|Cancel|Upload|Download|Loading|Not found|Template|Image|Version history|Reset|Back|Error)\b/

let api: FakeApi
let onGespeichert: ReturnType<typeof vi.fn<(coin: Coin) => void>>

function zeige(coinId = ID, coins: Coin[] = [testCoin({ id: ID, name: 'Coin Bearbeitbar', auflage: 100 })]) {
  api = erstelleFakeApi(coins)
  vi.stubGlobal('fetch', api.fetch)
  const user = userEvent.setup({ applyAccept: false })
  const { router } = zeigeMitRouter(() => <CoinBearbeitenSeite coinId={coinId} onGespeichert={onGespeichert} />, {
    pfad: '/coins/$coinId/bearbeiten',
    start: `/coins/${coinId}/bearbeiten`,
  })
  return { user, router }
}

beforeEach(() => {
  onGespeichert = vi.fn<(coin: Coin) => void>()
  beobachteDownloads()
})

async function geladen() {
  return screen.findByRole('heading', { level: 1, name: 'Coin bearbeiten' })
}

describe('Aufbau', () => {
  it('zeigt die Überschrift „Coin bearbeiten“ als einzige Ebene 1', async () => {
    zeige()
    await geladen()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('nennt unter der Überschrift den Namen des Coins', async () => {
    zeige()
    await geladen()

    expect(screen.getAllByText('Coin Bearbeitbar').length).toBeGreaterThan(0)
  })

  it.each(['Stammdaten', 'Motivbild', 'Zertifikatsvorlage'])('hat den Abschnitt „%s“ als Ebene 2', async (name) => {
    zeige()
    await geladen()

    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
  })

  it('belegt das Formular mit den Stammdaten vor', async () => {
    zeige()
    await geladen()

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Coin Bearbeitbar')
  })

  it('verlinkt „Abbrechen“ auf die Detailseite', async () => {
    zeige()
    await geladen()

    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', `/coins/${ID}`)
  })

  it('lädt den Coin und den Vorlagenstatus', async () => {
    zeige()
    await geladen()

    await waitFor(() =>
      expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`).sort()).toEqual([
        `GET /api/coins/${ID}`,
        `GET /api/coins/${ID}/zertifikatsvorlage`,
      ]),
    )
  })

  it('zeigt keine englischen Texte', async () => {
    zeige()
    await geladen()
    await waitFor(() => expect(seitentext()).toContain('Aktiv: Standardvorlage'))

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([seitentext(), ...attribute].join(' ')).not.toMatch(ENGLISCH)
  })
})

describe('Motivbild', () => {
  it('zeigt „Kein Motivbild vorhanden.“ ohne Bild', async () => {
    zeige()
    await geladen()

    expect(seitentext()).toContain('Kein Motivbild vorhanden.')
  })

  it('zeigt ein vorhandenes Motivbild', async () => {
    const bildUrl = `/api/coins/${ID}/bild?v=aaaaaaaaaaaaaaaa`
    zeige(ID, [testCoin({ id: ID, name: 'Coin Bearbeitbar', bildUrl })])
    await geladen()

    expect(document.querySelector(`img[src="${bildUrl}"]`)).not.toBeNull()
  })

  it('aktualisiert das Bild nach dem Hochladen', async () => {
    const { user } = zeige()
    await geladen()
    await user.upload(screen.getByLabelText(/^Neues Motivbild/), testDatei('image/png', 2048, 'motiv.png'))

    await user.click(screen.getByRole('button', { name: 'Bild hochladen' }))

    await waitFor(() => expect(document.querySelector(`img[src^="/api/coins/${ID}/bild?v="]`)).not.toBeNull())
    expect(seitentext()).not.toContain('Kein Motivbild vorhanden.')
  })
})

describe('Speichern', () => {
  it('meldet den gespeicherten Coin an onGespeichert', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

    await waitFor(() => expect(onGespeichert).toHaveBeenCalledTimes(1))
    expect(onGespeichert.mock.calls[0][0].id).toBe(ID)
  })
})

describe('nicht gefunden', () => {
  it('zeigt für eine Id ohne GUID-Format „Coin nicht gefunden“ ohne API-Aufruf', async () => {
    zeige('keine-guid')

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
    expect(api.anfragen).toHaveLength(0)
  })

  it('zeigt für einen unbekannten Coin „Coin nicht gefunden“ ohne Vorlagen-Request', async () => {
    zeige('0199a1b2-0000-7000-8000-0000000000ff')

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
    expect(api.anfragen.filter((a) => a.pfad.includes('zertifikatsvorlage'))).toEqual([])
  })
})

describe('Tastatur (AK-33)', () => {
  it('erreicht Stammdaten, Motivbild und Vorlage in der Reihenfolge der Abschnitte', async () => {
    const { user } = zeige()
    await geladen()
    await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' })
    const ziele = [
      screen.getByLabelText(/^Name/),
      screen.getByRole('button', { name: 'Änderungen speichern' }),
      screen.getByLabelText(/^Neues Motivbild/),
      screen.getByRole('button', { name: 'Bild hochladen' }),
      screen.getByLabelText('Word-Vorlage (.docx)'),
      screen.getByRole('button', { name: 'Vorlage hochladen' }),
    ]

    const reihenfolge: Element[] = []
    for (let i = 0; i < 40 && reihenfolge.length < ziele.length; i++) {
      await user.tab()
      if (ziele.includes(document.activeElement as HTMLElement) && !reihenfolge.includes(document.activeElement!)) {
        reihenfolge.push(document.activeElement!)
      }
    }

    expect(reihenfolge).toEqual(ziele)
  })
})
