import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { erstelleFakeApi, offeneAntwort, problemAntwort, testCoin, type FakeApi } from '../../../../test/fakeApi'
import {
  erwarteFeldfehler,
  erwarteKeinenFeldfehler,
  erwarteLaedt,
  erwartePflicht,
  zusammenfassung,
} from '../../../../test/formular'
import { gibEin } from '../../../../test/hilfen'
import { AuflageAendern } from '../index'

// Feature formulare-detailseiten, AK-2 bis AK-7 und AK-10 (Abschnitt 4.1, 4.2): Formularmuster im Dialog
// „Auflage ändern“. Pflicht: Auflage; Hilfetext „Beim Senken werden …“ (A5: kein zusätzlicher Dialog beim Senken).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const PUT = /^\/api\/coins\/[^/]+\/auflage$/
const HILFE =
  'Beim Senken werden die Exemplare über der neuen Auflage gelöscht. Senken ist nur bis zur höchsten je ausgegebenen Nummer möglich.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })])
  vi.stubGlobal('fetch', api.fetch)
})

async function oeffne() {
  const user = userEvent.setup()
  render(<AuflageAendern coinId={COIN_ID} auflage={150} onGeaendert={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Auflage ändern' }))
  const dialog = await screen.findByRole('dialog', { name: 'Auflage ändern' })
  return { user, dialog, feld: within(dialog).getByLabelText(/^Auflage/) as HTMLInputElement }
}

const speichern = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Speichern' })

describe('Pflicht und Hilfetext (AK-2, AK-3)', () => {
  it('kennzeichnet die Auflage als Pflicht', async () => {
    const { feld } = await oeffne()

    erwartePflicht(feld)
  })

  it('beschreibt die Auflage mit dem Hilfetext zum Senken', async () => {
    const { feld } = await oeffne()

    expect(feld).toHaveAccessibleDescription(expect.stringContaining(HILFE))
  })
})

describe('Validierung beim Verlassen (AK-4, AK-5)', () => {
  it('zeigt beim Verlassen ohne Änderung keinen Fehler', async () => {
    const { user, feld } = await oeffne()

    await user.click(feld)
    await user.tab()

    erwarteKeinenFeldfehler(feld)
  })

  it('zeigt nach ungültigem Wert und Verlassen „Auflage muss zwischen 1 und 1000000 liegen.“', async () => {
    const { user, feld } = await oeffne()

    await user.clear(feld)
    await user.type(feld, '0')
    erwarteKeinenFeldfehler(feld)
    await user.tab()

    erwarteFeldfehler(feld, 'Auflage muss zwischen 1 und 1000000 liegen.')
  })

  it('entfernt den Fehler, sobald der Wert gültig ist', async () => {
    const { user, feld } = await oeffne()
    await user.clear(feld)
    await user.type(feld, '0')
    await user.tab()

    await user.clear(feld)
    await user.type(feld, '200')

    erwarteKeinenFeldfehler(feld)
  })
})

describe('Absenden mit Fehlern (AK-6, AK-7)', () => {
  it('sendet ohne Auflage nichts, fokussiert das Feld und zeigt keine Zusammenfassung', async () => {
    const { user, dialog, feld } = await oeffne()
    await user.clear(feld)

    await user.click(speichern(dialog))

    await waitFor(() => erwarteFeldfehler(feld, 'Auflage ist erforderlich.'))
    expect(feld).toHaveFocus()
    expect(api.anfragenMit('PUT', PUT)).toHaveLength(0)
    expect(zusammenfassung()).toBeUndefined()
  })
})

describe('Ladezustand (AK-10)', () => {
  it('zeigt am Speichern-Button den Ladezustand und behält den Fokus', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT, () => offen.promise)
    const { user, dialog, feld } = await oeffne()
    await user.clear(feld)
    await gibEin(user, feld, '200')

    await user.click(speichern(dialog))

    await waitFor(() => erwarteLaedt(speichern(dialog)))
    expect(speichern(dialog)).toHaveFocus()
    offen.aufloesen(problemAntwort(500))
  })

  it('sendet bei Doppelklick genau einen PUT', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT, () => offen.promise)
    const { user, dialog, feld } = await oeffne()
    await user.clear(feld)
    await gibEin(user, feld, '200')

    await user.dblClick(speichern(dialog))

    expect(api.anfragenMit('PUT', PUT)).toHaveLength(1)
    offen.aufloesen(problemAntwort(500))
  })
})
