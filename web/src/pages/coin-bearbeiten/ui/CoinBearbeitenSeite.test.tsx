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

  // formulare-detailseiten (F2, Freigabe 2026-11-14): Der Fall „Zertifikatsvorlage“ ist in den Reiter
  // „Zertifikatsvorlage“ der Detailseite umgezogen (CoinDetailSeite.reiter.test.tsx); hier nur Stammdaten und Motivbild,
  // dazu die Prüfung, dass der Abschnitt „Zertifikatsvorlage“ fehlt.
  it.each(['Stammdaten', 'Motivbild'])('hat den Abschnitt „%s“ als Ebene 2', async (name) => {
    zeige()
    await geladen()

    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
  })

  it('hat keinen Abschnitt „Zertifikatsvorlage“ mehr (F2)', async () => {
    zeige()
    await geladen()
    await screen.findByRole('button', { name: 'Bild hochladen' })

    expect(screen.queryByRole('heading', { name: 'Zertifikatsvorlage' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Word-Vorlage (.docx)')).not.toBeInTheDocument()
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

  // formulare-detailseiten (F2, Freigabe 2026-11-14): Den Vorlagenstatus lädt jetzt der Reiter „Zertifikatsvorlage“
  // der Detailseite (Prüfung umgezogen nach CoinDetailSeite.reiter.test.tsx); „Coin bearbeiten“ lädt nur den Coin.
  it('lädt nur den Coin und keinen Vorlagenstatus (F2)', async () => {
    zeige()
    await geladen()
    await screen.findByRole('button', { name: 'Bild hochladen' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${ID}`])
  })

  // formulare-detailseiten K5 (F2): Die Vorlage ist nicht mehr auf dieser Seite; gewartet wird auf den Motivbild-Abschnitt.
  it('zeigt keine englischen Texte', async () => {
    zeige()
    await geladen()
    await screen.findByRole('button', { name: 'Bild hochladen' })

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

// formulare-detailseiten, AK-13 mit Entscheidung G1 (Mensch, Review-Runde 3): Steht nur noch das gewählte, nicht
// hochgeladene Motivbild aus, nennt jede Verlassen-Warnung genau das Motivbild; sind Stammdaten ungespeichert, bleibt der
// bisherige Text.
describe('Verlassen-Warnung (AK-13, G1)', () => {
  const NUR_BILD =
    'Das ausgewählte Motivbild ist noch nicht hochgeladen. Wenn Sie die Seite verlassen, geht die Auswahl verloren.'
  const STAMMDATEN = 'Die Änderungen am Coin sind nicht gespeichert. Seite trotzdem verlassen?'

  async function warnung() {
    return screen.findByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })
  }

  it('nennt nach erfolgreichem Speichern der Stammdaten das noch nicht hochgeladene Motivbild', async () => {
    const { user } = zeige()
    await geladen()
    await user.upload(screen.getByLabelText(/^Neues Motivbild/), testDatei('image/png', 2048, 'motiv.png'))
    await user.clear(screen.getByLabelText(/^Herausgeber/))
    await user.type(screen.getByLabelText(/^Herausgeber/), 'Herausgeber Geändert')
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(() => expect(onGespeichert).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    expect(await warnung()).toHaveAccessibleDescription(NUR_BILD)
  })

  it('nennt das Motivbild, wenn nur ein Bild gewählt und nichts an den Stammdaten geändert ist', async () => {
    const { user } = zeige()
    await geladen()
    await user.upload(screen.getByLabelText(/^Neues Motivbild/), testDatei('image/png', 2048, 'motiv.png'))

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    expect(await warnung()).toHaveAccessibleDescription(NUR_BILD)
  })

  it('behält den bisherigen Text, wenn Stammdaten ungespeichert sind und ein Bild gewählt ist', async () => {
    const { user } = zeige()
    await geladen()
    await user.upload(screen.getByLabelText(/^Neues Motivbild/), testDatei('image/png', 2048, 'motiv.png'))
    await user.type(screen.getByLabelText(/^Herausgeber/), ' Neu')

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    expect(await warnung()).toHaveAccessibleDescription(STAMMDATEN)
  })

  it('behält den bisherigen Text, wenn nur Stammdaten ungespeichert sind', async () => {
    const { user } = zeige()
    await geladen()
    await user.type(screen.getByLabelText(/^Herausgeber/), ' Neu')

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    expect(await warnung()).toHaveAccessibleDescription(STAMMDATEN)
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
  // formulare-detailseiten (F2, Freigabe 2026-11-14): Die Vorlage-Ziele sind in den Reiter „Zertifikatsvorlage“ der
  // Detailseite umgezogen (CoinDetailSeite.reiter.test.tsx); hier die Reihenfolge ohne Vorlage.
  it('erreicht Stammdaten und Motivbild in der Reihenfolge der Abschnitte (ohne Vorlage, F2)', async () => {
    const { user } = zeige()
    await geladen()
    await screen.findByRole('button', { name: 'Bild hochladen' })
    const ziele = [
      screen.getByLabelText(/^Name/),
      screen.getByRole('button', { name: 'Änderungen speichern' }),
      screen.getByLabelText(/^Neues Motivbild/),
      screen.getByRole('button', { name: 'Bild hochladen' }),
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
