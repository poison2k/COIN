import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import {
  erwarteFeldfehler,
  erwarteKeinenFeldfehler,
  erwarteLaedt,
  erwarteMeldungOben,
  erwarteOptional,
  erwartePflicht,
  ersterAbschnitt,
  liegtVor,
  zusammenfassung,
  zusammenfassungsLinks,
} from '../../../../test/formular'
import { gibEin } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinBearbeitenFormular } from '../index'

// Feature formulare-detailseiten, AK-1 bis AK-8, AK-10 und AK-12 (Abschnitt 4.1, 4.2): Formularmuster für
// „Coin bearbeiten“. Abschnitt „Stammdaten“ (Name, Herausgeber, Auflage, Beschreibung); Pflicht: Name, Herausgeber,
// Auflage (wenn gesetzt). Hilfetext der Auflage: bestehender Hinweis + „Beim Senken werden …“.

const ID = '0199a1b2-0000-7000-8000-0000000000b1'
const PUT = /^\/api\/coins\/[^/]+$/
const HINWEIS_AUFLAGE = 'Die Auflage kann nur bis zur höchsten bereits ausgegebenen Exemplar-Nummer gesenkt werden.'
const HILFE_SENKEN = 'Beim Senken werden die Exemplare über der neuen Auflage gelöscht.'

let api: FakeApi
let onGespeichert: ReturnType<typeof vi.fn<(coin: Coin) => void>>

async function zeige(coin: Coin = testCoin({ id: ID, auflage: 250, beschreibung: 'Alte Beschreibung' })) {
  api = erstelleFakeApi([coin, testCoin({ id: '0199a1b2-0000-7000-8000-0000000000b2', name: 'Coin Vorhanden' })])
  vi.stubGlobal('fetch', api.fetch)
  const user = userEvent.setup()
  zeigeMitRouter(() => <CoinBearbeitenFormular coin={coin} onGespeichert={onGespeichert} />, {
    pfad: '/coins/$coinId/bearbeiten',
    start: `/coins/${coin.id}/bearbeiten`,
  })
  await screen.findByRole('button', { name: 'Änderungen speichern' })
  return user
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

describe('Abschnitt (AK-1)', () => {
  it('gliedert alle Felder in den Abschnitt „Stammdaten“', async () => {
    await zeige()

    const gruppe = screen.getByRole('group', { name: 'Stammdaten' })
    const f = felder()
    for (const feld of [f.name, f.herausgeber, f.auflage, f.beschreibung]) expect(gruppe).toContainElement(feld)
  })
})

describe('Pflicht und optional (AK-2)', () => {
  it('kennzeichnet Name und Herausgeber als Pflicht', async () => {
    await zeige()

    erwartePflicht(felder().name)
    erwartePflicht(felder().herausgeber)
  })

  it('kennzeichnet die gesetzte Auflage als Pflicht', async () => {
    await zeige()

    erwartePflicht(felder().auflage)
  })

  it('kennzeichnet die fehlende Auflage als optional', async () => {
    await zeige(testCoin({ id: ID, auflage: null }))

    erwarteOptional(felder().auflage)
  })

  it('kennzeichnet die Beschreibung als optional', async () => {
    await zeige()

    erwarteOptional(felder().beschreibung)
  })
})

describe('Hilfetexte (AK-3)', () => {
  it('behält den Hinweis zur Auflage wortgleich und ergänzt den Satz zum Senken', async () => {
    await zeige()

    const beschreibung = felder().auflage.getAttribute('aria-describedby') ?? ''
    const text = beschreibung
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    expect(text).toContain(HINWEIS_AUFLAGE)
    expect(text).toContain(HILFE_SENKEN)
  })
})

describe('Validierung beim Verlassen (AK-4, AK-5)', () => {
  it('zeigt beim Verlassen ohne Änderung keinen Fehler', async () => {
    const user = await zeige()

    await user.click(felder().name)
    await user.tab()

    erwarteKeinenFeldfehler(felder().name)
  })

  it('zeigt nach Leeren und Verlassen des Namens „Name ist erforderlich.“', async () => {
    const user = await zeige()

    await user.clear(felder().name)
    erwarteKeinenFeldfehler(felder().name)
    await user.tab()

    erwarteFeldfehler(felder().name, 'Name ist erforderlich.')
  })

  it('entfernt den Fehler bei der Eingabe eines gültigen Namens', async () => {
    const user = await zeige()
    await user.clear(felder().name)
    await user.tab()

    await user.type(felder().name, 'Coin Neu')

    erwarteKeinenFeldfehler(felder().name)
  })

  it('lässt 409 auflage_zu_klein am Feld stehen, bis die Auflage geändert wird', async () => {
    const detail = 'Die Auflage kann nicht unter 7 gesenkt werden, weil Exemplar Nr. 7 ausgegeben wurde.'
    const user = await zeige()
    await user.clear(felder().auflage)
    await gibEin(user, felder().auflage, '6')
    api.einmal('PUT', PUT, ausgabeKonfliktAntwort('auflage_zu_klein', detail))
    await user.click(felder().speichern)
    await waitFor(() => erwarteFeldfehler(felder().auflage, detail))

    await user.click(felder().auflage)
    await user.tab()
    erwarteFeldfehler(felder().auflage, detail)

    await user.type(felder().auflage, '0')
    erwarteKeinenFeldfehler(felder().auflage)
  })
})

describe('Absenden mit Fehlern (AK-6, AK-7)', () => {
  it('sendet bei Fehlern keinen Request und fokussiert das erste fehlerhafte Feld', async () => {
    const user = await zeige()
    await user.clear(felder().herausgeber)

    await user.click(felder().speichern)

    expect(api.anfragenMit('PUT', PUT)).toHaveLength(0)
    await waitFor(() => expect(felder().herausgeber).toHaveFocus())
  })

  it('fokussiert nach 409 auflage_zu_klein das Feld Auflage', async () => {
    const user = await zeige()
    await user.clear(felder().auflage)
    await gibEin(user, felder().auflage, '6')
    api.einmal('PUT', PUT, ausgabeKonfliktAntwort('auflage_zu_klein', 'Zu klein.'))

    await user.click(felder().speichern)

    await waitFor(() => expect(felder().auflage).toHaveFocus())
  })

  it('zeigt ab zwei Feldfehlern die Zusammenfassung oben mit Links', async () => {
    const user = await zeige()
    await user.clear(felder().name)
    await user.clear(felder().herausgeber)

    await user.click(felder().speichern)

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    expect(zusammenfassungsLinks()).toHaveLength(2)
    expect(liegtVor(zusammenfassung() as HTMLElement, ersterAbschnitt(felder().name))).toBe(true)
  })

  it('fokussiert per Link der Zusammenfassung das Feld', async () => {
    const user = await zeige()
    await user.clear(felder().name)
    await user.clear(felder().herausgeber)
    await user.click(felder().speichern)
    await waitFor(() => expect(zusammenfassung()).toBeDefined())

    within(zusammenfassung() as HTMLElement)
      .getAllByRole('link')[1]
      .focus()
    await user.keyboard('{Enter}')

    expect(felder().herausgeber).toHaveFocus()
  })

  it('zeigt bei einem Feldfehler keine Zusammenfassung', async () => {
    const user = await zeige()
    await user.clear(felder().name)

    await user.click(felder().speichern)

    await waitFor(() => erwarteFeldfehler(felder().name, 'Name ist erforderlich.'))
    expect(zusammenfassung()).toBeUndefined()
  })
})

describe('Formularmeldungen oben (AK-8)', () => {
  it('zeigt den Konflikt „Ein Coin mit diesem Namen …“ oben im Formular', async () => {
    const user = await zeige()
    await user.clear(felder().name)
    await gibEin(user, felder().name, 'Coin Vorhanden')

    await user.click(felder().speichern)

    await waitFor(() =>
      erwarteMeldungOben('Ein Coin mit diesem Namen und Herausgeber existiert bereits.', felder().name),
    )
    expect(felder().name).toHaveValue('Coin Vorhanden')
  })

  it('zeigt einen Netzwerkfehler oben im Formular', async () => {
    const user = await zeige()
    api.netzwerkfehler('PUT', PUT)

    await user.click(felder().speichern)

    await waitFor(() =>
      erwarteMeldungOben(
        'Die Änderungen konnten nicht gespeichert werden. Bitte später erneut versuchen.',
        felder().name,
      ),
    )
  })
})

describe('Ladezustand und Doppelklick (AK-10)', () => {
  it('zeigt am Speichern-Button den Ladezustand und behält den Fokus', async () => {
    const offen = offeneAntwort()
    const user = await zeige()
    api.einmal('PUT', PUT, () => offen.promise)

    await user.click(felder().speichern)

    await waitFor(() => erwarteLaedt(felder().speichern))
    expect(felder().speichern).toHaveFocus()
    offen.aufloesen(problemAntwort(500))
  })

  it('sendet bei Doppelklick genau einen PUT', async () => {
    const offen = offeneAntwort()
    const user = await zeige()
    api.einmal('PUT', PUT, () => offen.promise)

    await user.dblClick(felder().speichern)

    expect(api.anfragenMit('PUT', PUT)).toHaveLength(1)
    offen.aufloesen(problemAntwort(500))
  })
})

describe('Fachverhalten unverändert (AK-12)', () => {
  it('sendet denselben PUT-Body wie bisher', async () => {
    const user = await zeige()
    await user.clear(felder().name)
    await gibEin(user, felder().name, 'Coin Neu ')

    await user.click(felder().speichern)

    await waitFor(() => expect(onGespeichert).toHaveBeenCalledTimes(1))
    expect(api.anfragenMit('PUT', PUT)[0].body).toEqual({
      name: 'Coin Neu',
      herausgeber: 'Herausgeber Beta',
      auflage: 250,
      beschreibung: 'Alte Beschreibung',
    })
  })
})
