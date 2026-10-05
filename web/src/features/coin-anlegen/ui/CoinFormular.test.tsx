import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '../api/types'
import {
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  testDatei,
  type FakeApi,
} from '../test/fakeApi'
import { formularFelder, fuelleAus, meldungMit, seitentext, TEXTE } from '../test/hilfen'
import { CoinFormular } from './CoinFormular'

// AK-30 bis AK-36: Formular „Coin anlegen“.

let api: FakeApi
let onGespeichert: ReturnType<typeof vi.fn<(coin: Coin) => void>>

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
  onGespeichert = vi.fn<(coin: Coin) => void>()
})

function zeigeFormular() {
  // applyAccept: false, damit auch unzulässige Dateitypen ausgewählt werden können (AK-31).
  const user = userEvent.setup({ applyAccept: false })
  const ansicht = render(<CoinFormular onGespeichert={onGespeichert} />)
  return { user, ...ansicht }
}

const PFLICHT = { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' }
const PUT_BILD = /^\/api\/coins\/[^/]+\/bild$/

describe('AK-30: Aufbau des Formulars', () => {
  it('hat ein beschriftetes Textfeld für den Namen', () => {
    zeigeFormular()

    expect(formularFelder().name.tagName).toBe('INPUT')
  })

  it('hat ein beschriftetes Textfeld für den Herausgeber', () => {
    zeigeFormular()

    expect(formularFelder().herausgeber.tagName).toBe('INPUT')
  })

  it('hat ein als optional beschriftetes Feld für die Auflage', () => {
    zeigeFormular()

    expect(screen.getByLabelText(/^Auflage.*optional/i)).toBe(formularFelder().auflage)
  })

  it('hat ein als optional beschriftetes mehrzeiliges Feld für die Beschreibung', () => {
    zeigeFormular()

    expect(screen.getByLabelText(/^Beschreibung.*optional/i).tagName).toBe('TEXTAREA')
  })

  it('hat eine als optional beschriftete Dateiauswahl für das Motivbild', () => {
    zeigeFormular()

    const motivbild = screen.getByLabelText(/^Motivbild.*optional/i)
    expect(motivbild).toHaveAttribute('type', 'file')
  })

  it('beschränkt die Dateiauswahl auf JPEG, PNG und WebP', () => {
    zeigeFormular()

    expect(formularFelder().motivbild).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })

  it('erlaubt nur eine Datei', () => {
    zeigeFormular()

    expect(formularFelder().motivbild).not.toHaveAttribute('multiple')
  })

  it('hat einen Absende-Button „Coin anlegen“', () => {
    zeigeFormular()

    expect(formularFelder().absenden).toHaveAttribute('type', 'submit')
  })

  it('zeigt den Hinweis zu personenbezogenen Metadaten', () => {
    zeigeFormular()

    expect(screen.getByText(TEXTE.exifHinweis)).toBeInTheDocument()
  })

  it('zeigt vor der Auswahl keine Vorschau', () => {
    zeigeFormular()

    expect(screen.queryByRole('img', { name: TEXTE.vorschauAlt })).not.toBeInTheDocument()
  })

  it('zeigt ein ausgewähltes Bild als Vorschau', async () => {
    const { user } = zeigeFormular()
    const datei = testDatei('image/png', 1024)

    await user.upload(formularFelder().motivbild, datei)

    const vorschau = await screen.findByRole('img', { name: TEXTE.vorschauAlt })
    expect(URL.createObjectURL).toHaveBeenCalledWith(datei)
    expect(vorschau).toHaveAttribute('src', 'blob:vorschau-1')
  })

  it('entfernt die Vorschau über „Bild entfernen“', async () => {
    const { user } = zeigeFormular()
    await user.upload(formularFelder().motivbild, testDatei())

    await user.click(await screen.findByRole('button', { name: TEXTE.bildEntfernen }))

    expect(screen.queryByRole('img', { name: TEXTE.vorschauAlt })).not.toBeInTheDocument()
  })

  it('gibt die Object-URL beim Entfernen frei', async () => {
    const { user } = zeigeFormular()
    await user.upload(formularFelder().motivbild, testDatei())

    await user.click(await screen.findByRole('button', { name: TEXTE.bildEntfernen }))

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vorschau-1')
  })

  it('lädt nach „Bild entfernen“ kein Bild hoch', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })
    await user.click(await screen.findByRole('button', { name: TEXTE.bildEntfernen }))

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(onGespeichert).toHaveBeenCalled())
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })

  it('gibt die Object-URL beim Unmount frei', async () => {
    const { user, unmount } = zeigeFormular()
    await user.upload(formularFelder().motivbild, testDatei())
    await screen.findByRole('img', { name: TEXTE.vorschauAlt })

    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vorschau-1')
  })

  it('ersetzt die Vorschau bei erneuter Auswahl und gibt die alte URL frei', async () => {
    const { user } = zeigeFormular()
    await user.upload(formularFelder().motivbild, testDatei('image/png', 10, 'eins.png'))
    await screen.findByRole('img', { name: TEXTE.vorschauAlt })

    await user.upload(formularFelder().motivbild, testDatei('image/jpeg', 10, 'zwei.jpg'))

    await waitFor(() =>
      expect(screen.getByRole('img', { name: TEXTE.vorschauAlt })).toHaveAttribute('src', 'blob:vorschau-2'),
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vorschau-1')
  })
})

describe('AK-31: clientseitige Prüfung', () => {
  it('sendet bei leeren Pflichtfeldern nichts', async () => {
    const { user } = zeigeFormular()

    await user.click(formularFelder().absenden)

    expect(api.fetch).not.toHaveBeenCalled()
  })

  it('zeigt den Fehler für einen leeren Namen am Namensfeld', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { herausgeber: 'Herausgeber Beta' })

    await user.click(formularFelder().absenden)

    const { name } = formularFelder()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription()
  })

  it('zeigt den Fehler für einen leeren Herausgeber am Herausgeberfeld', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { name: 'Coin Alpha' })

    await user.click(formularFelder().absenden)

    const { herausgeber } = formularFelder()
    expect(herausgeber).toHaveAttribute('aria-invalid', 'true')
    expect(herausgeber).toHaveAccessibleDescription()
  })

  it('markiert gültige Felder nicht als ungültig', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { name: 'Coin Alpha' })

    await user.click(formularFelder().absenden)

    expect(formularFelder().name).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('zeigt den Fehler für Auflage 0 am Auflagefeld und sendet nichts', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, auflage: '0' })

    await user.click(formularFelder().absenden)

    expect(formularFelder().auflage).toHaveAttribute('aria-invalid', 'true')
    expect(formularFelder().auflage).toHaveAccessibleDescription()
    expect(api.fetch).not.toHaveBeenCalled()
  })

  it('zeigt den Fehler für Auflage über 1.000.000 am Auflagefeld', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, auflage: '1000001' })

    await user.click(formularFelder().absenden)

    expect(formularFelder().auflage).toHaveAttribute('aria-invalid', 'true')
    expect(api.fetch).not.toHaveBeenCalled()
  })

  it('akzeptiert eine leere Auflage und sendet auflage null', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(api.anfragenMit('POST')).toHaveLength(1))
    expect(api.anfragenMit('POST')[0].body).toMatchObject({ auflage: null })
  })

  it('sendet eine angegebene Auflage als Zahl', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, auflage: '250' })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(api.anfragenMit('POST')).toHaveLength(1))
    expect(api.anfragenMit('POST')[0].body).toMatchObject({ name: 'Coin Alpha', herausgeber: 'Herausgeber Beta', auflage: 250 })
  })

  it('zeigt den Fehler für eine zu lange Beschreibung am Beschreibungsfeld', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)
    const { beschreibung } = formularFelder()
    await user.click(beschreibung)
    await user.paste('b'.repeat(2001))

    await user.click(formularFelder().absenden)

    expect(beschreibung).toHaveAttribute('aria-invalid', 'true')
    expect(api.fetch).not.toHaveBeenCalled()
  })

  it('zeigt „Nur JPEG, PNG oder WebP erlaubt.“ am Bildfeld für ein GIF und sendet nichts', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei('image/gif', 100, 'motiv.gif') })

    await user.click(formularFelder().absenden)

    expect(formularFelder().motivbild).toHaveAccessibleDescription(expect.stringContaining(TEXTE.formatUngueltig))
    expect(api.fetch).not.toHaveBeenCalled()
  })

  it('zeigt „Bild ist zu groß (max. 5 MB).“ am Bildfeld für mehr als 5 MiB und sendet nichts', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei('image/jpeg', 5_242_881, 'gross.jpg') })

    await user.click(formularFelder().absenden)

    expect(formularFelder().motivbild).toHaveAccessibleDescription(expect.stringContaining(TEXTE.zuGross))
    expect(api.fetch).not.toHaveBeenCalled()
  })

  it('sendet nach Korrektur eines Fehlers', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { herausgeber: 'Herausgeber Beta' })
    await user.click(formularFelder().absenden)

    await user.type(formularFelder().name, 'Coin Alpha')
    await user.click(formularFelder().absenden)

    await waitFor(() => expect(api.anfragenMit('POST')).toHaveLength(1))
  })
})

describe('AK-32: vom Server gemeldete Fehler', () => {
  it('zeigt Feldfehler aus einer 400-Antwort am jeweiligen Feld', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(400, { errors: { name: ['Name vom Server abgelehnt.'] } }))
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() =>
      expect(formularFelder().name).toHaveAccessibleDescription(expect.stringContaining('Name vom Server abgelehnt.')),
    )
    expect(formularFelder().name).toHaveAttribute('aria-invalid', 'true')
  })

  it('behält die Eingaben nach einer 400-Antwort', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(400, { errors: { auflage: ['Auflage vom Server abgelehnt.'] } }))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, auflage: '250', beschreibung: 'Ein Text' })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(formularFelder().auflage).toHaveAttribute('aria-invalid', 'true'))
    expect(formularFelder().name).toHaveValue('Coin Alpha')
    expect(formularFelder().herausgeber).toHaveValue('Herausgeber Beta')
    expect(formularFelder().beschreibung).toHaveValue('Ein Text')
  })

  it('zeigt bei 409 „Ein Coin mit diesem Namen und Herausgeber existiert bereits.“', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409, { title: 'Coin existiert bereits' }))
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.konflikt)).toBeDefined())
  })

  it('behält die Eingaben nach einer 409-Antwort', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409))
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.konflikt)).toBeDefined())
    expect(formularFelder().name).toHaveValue('Coin Alpha')
    expect(formularFelder().herausgeber).toHaveValue('Herausgeber Beta')
  })

  it('lädt bei 409 kein Bild hoch', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.konflikt)).toBeDefined())
    expect(api.anfragenMit('PUT')).toHaveLength(0)
  })

  it('zeigt „Bild ist zu groß (max. 5 MB).“ am Bildfeld bei 413', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(413))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() =>
      expect(formularFelder().motivbild).toHaveAccessibleDescription(expect.stringContaining(TEXTE.zuGross)),
    )
  })

  it('zeigt „Nur JPEG, PNG oder WebP erlaubt.“ am Bildfeld bei 415', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(415))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() =>
      expect(formularFelder().motivbild).toHaveAccessibleDescription(expect.stringContaining(TEXTE.formatUngueltig)),
    )
  })

  it('zeigt einen Serverfehler zum Feld datei am Bildfeld', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(400, { errors: { datei: ['Datei vom Server abgelehnt.'] } }))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() =>
      expect(formularFelder().motivbild).toHaveAccessibleDescription(expect.stringContaining('Datei vom Server abgelehnt.')),
    )
  })

  it('zeigt bei 500 eine verständliche Meldung ohne technische Details', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(500, { detail: 'NpgsqlException: connection refused' }))
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(seitentext()).not.toMatch(/Npgsql|connection refused|500/)
    expect(formularFelder().name).toHaveValue('Coin Alpha')
  })
})

describe('AK-33: erfolgreiches Anlegen', () => {
  it('sendet erst POST und danach PUT mit der id des angelegten Coins', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(api.anfragenMit('PUT')).toHaveLength(1))
    const methoden = api.anfragen.map((a) => a.methode)
    expect(methoden).toEqual(['POST', 'PUT'])
    expect(api.anfragen[1].pfad).toBe(`/api/coins/${api.coins[0].id}/bild`)
  })

  it('sendet ohne ausgewähltes Bild nur POST', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(onGespeichert).toHaveBeenCalled())
    expect(api.anfragen.map((a) => a.methode)).toEqual(['POST'])
  })

  it('zeigt die Erfolgsmeldung „Coin wurde angelegt.“', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.erfolg)).toBeDefined())
  })

  it('leert das Formular nach Erfolg', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, auflage: '250', beschreibung: 'Ein Text', bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.erfolg)).toBeDefined())
    const felder = formularFelder()
    expect(felder.name).toHaveValue('')
    expect(felder.herausgeber).toHaveValue('')
    expect(felder.auflage).not.toHaveValue()
    expect(felder.beschreibung).toHaveValue('')
    expect(screen.queryByRole('img', { name: TEXTE.vorschauAlt })).not.toBeInTheDocument()
  })

  it('meldet den gespeicherten Coin mit bildUrl an die Seite', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.erfolg)).toBeDefined())
    const letzterAufruf = onGespeichert.mock.calls.at(-1)?.[0]
    expect(letzterAufruf?.name).toBe('Coin Alpha')
    expect(letzterAufruf?.bildUrl).toMatch(/^\/api\/coins\/.+\/bild\?v=/)
  })

  it('meldet ohne Bild den angelegten Coin mit bildUrl null an die Seite', async () => {
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(onGespeichert).toHaveBeenCalledTimes(1))
    expect(onGespeichert.mock.calls[0][0]).toMatchObject({ name: 'Coin Alpha', bildUrl: null })
  })
})

describe('AK-34: Teilerfolg beim Bild-Upload', () => {
  it('meldet „Coin wurde angelegt, das Bild konnte nicht gespeichert werden: {Grund}“', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(415))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() =>
      expect(meldungMit(`${TEXTE.teilerfolgPraefix} ${TEXTE.formatUngueltig}`)).toBeDefined(),
    )
  })

  it('nennt bei 413 die Größe als Grund', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(413))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(`${TEXTE.teilerfolgPraefix} ${TEXTE.zuGross}`)).toBeDefined())
  })

  it('meldet den Teilerfolg auch bei einem Netzwerkfehler während des Uploads', async () => {
    api.netzwerkfehler('PUT', PUT_BILD)
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.teilerfolgPraefix)).toBeDefined())
    expect(seitentext()).not.toMatch(/Failed to fetch|TypeError/)
  })

  it('meldet den angelegten Coin ohne Bild an die Seite', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(415))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.teilerfolgPraefix)).toBeDefined())
    expect(onGespeichert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Coin Alpha', bildUrl: null }))
  })

  it('zeigt den Button „Bild erneut hochladen“', async () => {
    api.einmal('PUT', PUT_BILD, problemAntwort(415))
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    expect(await screen.findByRole('button', { name: TEXTE.erneutHochladen })).toBeEnabled()
  })

  it('wiederholt mit „Bild erneut hochladen“ nur den Upload für denselben Coin', async () => {
    api.netzwerkfehler('PUT', PUT_BILD)
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })
    await user.click(formularFelder().absenden)

    await user.click(await screen.findByRole('button', { name: TEXTE.erneutHochladen }))

    await waitFor(() => expect(api.anfragenMit('PUT')).toHaveLength(2))
    expect(api.anfragenMit('POST')).toHaveLength(1)
    const [erster, zweiter] = api.anfragenMit('PUT')
    expect(zweiter.pfad).toBe(erster.pfad)
  })

  it('zeigt nach erfolgreicher Wiederholung die Erfolgsmeldung und meldet den Coin mit Bild', async () => {
    api.netzwerkfehler('PUT', PUT_BILD)
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })
    await user.click(formularFelder().absenden)

    await user.click(await screen.findByRole('button', { name: TEXTE.erneutHochladen }))

    await waitFor(() => expect(meldungMit(TEXTE.erfolg)).toBeDefined())
    expect(onGespeichert.mock.calls.at(-1)?.[0].bildUrl).toMatch(/\/bild\?v=/)
    expect(screen.queryByRole('button', { name: TEXTE.erneutHochladen })).not.toBeInTheDocument()
  })
})

describe('AK-35: kein Doppelversand', () => {
  it('deaktiviert den Button während des Anlegens', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', /^\/api\/coins$/, () => offen.promise)
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(formularFelder().absenden).toBeDisabled())
    offen.aufloesen(jsonAntwort(201, { ...PFLICHT, id: 'x', auflage: null, beschreibung: null, erstelltAm: '2026-10-05T12:00:00+00:00', bildUrl: null }))
    await waitFor(() => expect(formularFelder().absenden).toBeEnabled())
  })

  it('sendet bei doppeltem Klick nur einen POST', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', /^\/api\/coins$/, () => offen.promise)
    const { user } = zeigeFormular()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)
    await user.click(formularFelder().absenden)

    expect(api.anfragenMit('POST')).toHaveLength(1)
    offen.aufloesen(problemAntwort(409))
    await waitFor(() => expect(meldungMit(TEXTE.konflikt)).toBeDefined())
  })

  it('hält den Button auch während des Bild-Uploads deaktiviert', async () => {
    const offen = offeneAntwort()
    api.einmal('PUT', PUT_BILD, () => offen.promise)
    const { user } = zeigeFormular()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(api.anfragenMit('PUT')).toHaveLength(1))
    expect(formularFelder().absenden).toBeDisabled()
    offen.aufloesen(problemAntwort(415))
    await waitFor(() => expect(formularFelder().absenden).toBeEnabled())
  })
})

describe('AK-36: deutsche Texte', () => {
  it('enthält keine englischen Standardtexte', () => {
    zeigeFormular()

    expect(seitentext()).not.toMatch(/\b(Submit|Name is required|Upload|Choose file|Remove|Loading|Error)\b/)
  })
})
