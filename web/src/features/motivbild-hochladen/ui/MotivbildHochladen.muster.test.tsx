import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import {
  erstelleFakeApi,
  keinZugriffAntwort,
  offeneAntwort,
  problemAntwort,
  testCoin,
  testDatei,
  type FakeApi,
} from '../../../../test/fakeApi'
import { erwarteFeldfehler, erwarteKeinenFeldfehler, erwarteLaedt } from '../../../../test/formular'
import { MotivbildHochladen } from '../index'

// Feature formulare-detailseiten, AK-2, AK-10 und AK-13 (Abschnitt 4.2, 4.3): Formularmuster für „Motivbild“ auf
// „Coin bearbeiten“ (eigenes Formular, Aktion „Bild hochladen“). Das Dateifeld steht im `Formularfeld` (Fehler in
// aria-describedby vor der Hilfe, sr-only „Fehler:“), die Hauptaktion zeigt den Ladezustand, und eine gewählte, nicht
// hochgeladene Datei gilt als Änderung (`onGeaendert(true)`), die die Seite für die Verlassen-Warnung auswertet.

const ID = '0199a1b2-0000-7000-8000-0000000000c2'
const PUT_BILD = /^\/api\/coins\/[^/]+\/bild$/
const HINWEIS_FORMATE = 'JPEG, PNG oder WebP, höchstens 5 MB.'
const HINWEIS_METADATEN = 'Bitte nur Bilder ohne personenbezogene Metadaten hochladen.'

let api: FakeApi
let onGespeichert: ReturnType<typeof vi.fn<(coin: Coin) => void>>
let onGeaendert: ReturnType<typeof vi.fn<(geaendert: boolean) => void>>

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: ID })])
  vi.stubGlobal('fetch', api.fetch)
  onGespeichert = vi.fn<(coin: Coin) => void>()
  onGeaendert = vi.fn<(geaendert: boolean) => void>()
})

function zeige() {
  const user = userEvent.setup({ applyAccept: false })
  render(<MotivbildHochladen coin={testCoin({ id: ID })} onGespeichert={onGespeichert} onGeaendert={onGeaendert} />)
  return user
}

const feld = () => screen.getByLabelText(/^Neues Motivbild/) as HTMLInputElement
const knopf = () => screen.getByRole('button', { name: 'Bild hochladen' })
const pngDatei = () => testDatei('image/png', 2048, 'motiv.png')

/** Letzter Wert, den die Komponente an `onGeaendert` gemeldet hat (`undefined`, wenn nie gemeldet). */
const letzteAenderung = () => onGeaendert.mock.calls.at(-1)?.[0]

describe('Formularfeld (AK-2)', () => {
  it('stellt das Dateifeld mit seinem Label in ein Formularfeld', () => {
    zeige()

    const formularfeld = feld().closest('[data-slot="field"]')
    expect(formularfeld, 'Dateifeld steht nicht in einem Formularfeld').not.toBeNull()
    expect(formularfeld?.querySelector(`label[for="${feld().id}"]`)).not.toBeNull()
  })

  it('beschreibt das Feld ohne Fehler nur mit den Hinweisen', () => {
    zeige()

    erwarteKeinenFeldfehler(feld())
    expect(feld()).toHaveAccessibleDescription(expect.stringContaining(HINWEIS_FORMATE))
    expect(feld()).toHaveAccessibleDescription(expect.stringContaining(HINWEIS_METADATEN))
  })

  it('nennt bei einem Fehler zuerst „Fehler:“ mit der Meldung und danach die Hinweise', async () => {
    const user = zeige()

    await user.click(knopf())

    await waitFor(() => erwarteFeldfehler(feld(), 'Bitte ein Bild auswählen.'))
    expect(feld()).toHaveAccessibleDescription(/^Fehler:\s*Bitte ein Bild auswählen\.\s/)
  })

  it('stellt den Fehler in aria-describedby vor die Hilfe', async () => {
    const user = zeige()
    await user.upload(feld(), testDatei('image/gif', 2048, 'motiv.gif'))

    await user.click(knopf())

    await waitFor(() => erwarteFeldfehler(feld(), 'Nur JPEG, PNG oder WebP erlaubt.'))
    const ids = (feld().getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    const texte = ids.map((id) => document.getElementById(id)?.textContent ?? '')
    const fehlerIndex = texte.findIndex((t) => t.includes('Nur JPEG, PNG oder WebP erlaubt.'))
    const hilfeIndex = texte.findIndex((t) => t.includes(HINWEIS_FORMATE))
    expect(fehlerIndex, 'Fehler fehlt in aria-describedby').toBeGreaterThanOrEqual(0)
    expect(hilfeIndex, 'Hilfe fehlt in aria-describedby').toBeGreaterThanOrEqual(0)
    expect(fehlerIndex).toBeLessThan(hilfeIndex)
  })
})

describe('Ladezustand und Doppelklick (AK-10)', () => {
  it('zeigt am Button den Ladezustand und behält den Fokus', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT_BILD, () => offen.promise)
    const user = zeige()
    await user.upload(feld(), pngDatei())

    await user.click(knopf())

    await waitFor(() => erwarteLaedt(knopf()))
    expect(knopf()).toHaveAccessibleName('Bild hochladen')
    expect(knopf()).toHaveFocus()
    offen.aufloesen(problemAntwort(500))
  })

  it('sendet bei Doppelklick genau einen Upload', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT_BILD, () => offen.promise)
    const user = zeige()
    await user.upload(feld(), pngDatei())

    await user.dblClick(knopf())

    expect(api.anfragenMit('PUT', PUT_BILD)).toHaveLength(1)
    offen.aufloesen(problemAntwort(500))
  })
})

describe('Änderung für die Verlassen-Warnung (AK-13)', () => {
  it('meldet ohne gewählte Datei keine Änderung', () => {
    zeige()

    expect(onGeaendert).not.toHaveBeenCalledWith(true)
  })

  it('meldet nach Wahl einer Datei onGeaendert(true)', async () => {
    const user = zeige()

    await user.upload(feld(), pngDatei())

    await waitFor(() => expect(letzteAenderung()).toBe(true))
  })

  it('bleibt nach einem fehlgeschlagenen Hochladen geändert', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(500))
    const user = zeige()
    await user.upload(feld(), pngDatei())

    await user.click(knopf())

    await waitFor(() => expect(api.anfragenMit('PUT', PUT_BILD)).toHaveLength(1))
    await screen.findByText(/Bitte erneut versuchen\./)
    expect(letzteAenderung()).toBe(true)
  })

  it('meldet nach erfolgreichem Hochladen onGeaendert(false)', async () => {
    const user = zeige()
    await user.upload(feld(), pngDatei())

    await user.click(knopf())

    await waitFor(() => expect(onGespeichert).toHaveBeenCalledTimes(1))
    expect(letzteAenderung()).toBe(false)
  })
})

// Review-Runde 3 (G2): Fehler ohne Feldbezug (403, 404) stehen als Alarm oben und erhalten den Fokus; eine neue
// Dateiauswahl macht den Alarm gegenstandslos.
describe('Alarm oben (AK-8, G2)', () => {
  it.each([
    [403, keinZugriffAntwort('keine_berechtigung'), 'Sie sind nicht berechtigt, Motivbilder hochzuladen.'],
    [404, problemAntwort(404), 'Der Coin wurde nicht gefunden.'],
  ])('setzt bei %i den Fokus auf den Alarm oben', async (_status, antwort, text) => {
    api.einmal('PUT', PUT_BILD, antwort)
    const user = zeige()
    await user.upload(feld(), pngDatei())

    await user.click(knopf())

    const alarm = await screen.findByRole('alert')
    expect(alarm).toHaveTextContent(text)
    await waitFor(() => expect(alarm).toHaveFocus())
  })

  it('entfernt den Alarm, sobald eine neue Datei gewählt wird', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(404))
    const user = zeige()
    await user.upload(feld(), pngDatei())
    await user.click(knopf())
    await screen.findByRole('alert')

    await user.upload(feld(), testDatei('image/jpeg', 2048, 'motiv2.jpg'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
