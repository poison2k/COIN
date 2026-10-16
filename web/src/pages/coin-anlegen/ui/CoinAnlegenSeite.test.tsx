import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { erstelleFakeApi, problemAntwort, testDatei, type FakeApi } from '../../../../test/fakeApi'
import { formularFelder, fuelleAus, meldungMit, seitentext, TEXTE } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { beobachteDownloads } from '../../../../test/downloads'
import { CoinAnlegenSeite } from '../index'

// Feature katalog-seiten, AK-21 bis AK-24, AK-26: Seite „Coin hinzufügen“ (/coins/neu) mit dem bestehenden
// CoinFormular und dem Link „Abbrechen“. Die Navigation nach dem Anlegen übernimmt die Route über onAngelegt.

type OnAngelegt = (coin: Coin, ergebnis: { bild: 'gespeichert' | 'ohne' }) => void

let api: FakeApi
let onAngelegt: ReturnType<typeof vi.fn<OnAngelegt>>

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
  onAngelegt = vi.fn<OnAngelegt>()
})

function zeigeSeite() {
  const user = userEvent.setup({ applyAccept: false })
  const { router } = zeigeMitRouter(() => <CoinAnlegenSeite onAngelegt={onAngelegt} />, { pfad: '/coins/neu' })
  return { user, router }
}

async function geladen(): Promise<void> {
  await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })
}

const PFLICHT = { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' }

describe('Aufbau', () => {
  it('zeigt die Überschrift „Coin hinzufügen“ als Ebene 1', async () => {
    zeigeSeite()

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeigeSeite()
    await geladen()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt das Formular mit allen Feldern und dem Button „Coin anlegen“', async () => {
    zeigeSeite()
    await geladen()

    const felder = formularFelder()
    expect(felder.name).toBeInTheDocument()
    expect(felder.herausgeber).toBeInTheDocument()
    expect(felder.auflage).toBeInTheDocument()
    expect(felder.beschreibung).toBeInTheDocument()
    expect(felder.motivbild).toHaveAttribute('type', 'file')
    expect(felder.absenden).toBeEnabled()
  })

  it('behält die Hinweise zum Motivbild', async () => {
    zeigeSeite()
    await geladen()

    expect(screen.getByText('JPEG, PNG oder WebP, höchstens 5 MB.')).toBeInTheDocument()
    expect(screen.getByText(TEXTE.exifHinweis)).toBeInTheDocument()
  })

  it('lädt beim Öffnen nichts von der API', async () => {
    zeigeSeite()
    await geladen()

    expect(api.anfragen).toHaveLength(0)
  })
})

describe('Abbrechen', () => {
  it('ist ein Link „Abbrechen“ auf /coins', async () => {
    zeigeSeite()
    await geladen()

    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', '/coins')
  })

  it('führt zu /coins, ohne zu speichern', async () => {
    const { user, router } = zeigeSeite()
    await geladen()
    await fuelleAus(user, PFLICHT)

    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
    expect(api.anfragenMit('POST')).toHaveLength(0)
    expect(onAngelegt).not.toHaveBeenCalled()
  })
})

describe('Anlegen', () => {
  it('meldet den angelegten Coin genau einmal über onAngelegt', async () => {
    const { user } = zeigeSeite()
    await geladen()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(onAngelegt).toHaveBeenCalledTimes(1))
    expect(onAngelegt.mock.calls[0][0]).toMatchObject({ name: 'Coin Alpha', herausgeber: 'Herausgeber Beta' })
  })

  it('meldet nach erfolgreichem Bild-Upload bild: gespeichert', async () => {
    const { user } = zeigeSeite()
    await geladen()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(onAngelegt).toHaveBeenCalledTimes(1))
    expect(onAngelegt.mock.calls[0][1]).toEqual({ bild: 'gespeichert' })
  })

  it('bleibt beim Teilerfolg stehen und meldet nichts', async () => {
    api.einmal('PUT', /^\/api\/coins\/[^/]+\/bild$/, problemAntwort(415))
    const { user } = zeigeSeite()
    await geladen()
    await fuelleAus(user, { ...PFLICHT, bild: testDatei() })

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.teilerfolgPraefix)).toBeDefined())
    expect(onAngelegt).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeInTheDocument()
  })

  it('meldet bei 409 den Konflikt und keinen angelegten Coin', async () => {
    api.einmal('POST', /^\/api\/coins$/, problemAntwort(409))
    const { user } = zeigeSeite()
    await geladen()
    await fuelleAus(user, PFLICHT)

    await user.click(formularFelder().absenden)

    await waitFor(() => expect(meldungMit(TEXTE.konflikt)).toBeDefined())
    expect(onAngelegt).not.toHaveBeenCalled()
    expect(formularFelder().name).toHaveValue('Coin Alpha')
  })
})

describe('deutsche Texte', () => {
  it('zeigt keine englischen Standardtexte', async () => {
    zeigeSeite()
    await geladen()

    expect(seitentext()).not.toMatch(/\b(Add|Cancel|Submit|Upload|Choose file|Loading|Error|New coin)\b/)
  })
})

// ---------- zertifikatsvorlagen, AK-31: Abschnitt „Zertifikatsvorlage“ ----------

describe('Abschnitt „Zertifikatsvorlage“ (zertifikatsvorlagen, AK-31)', () => {
  const HINWEIS =
    'Laden Sie die Standardvorlage herunter, um daraus in Word eine Urkunde zu gestalten. Die fertige Vorlage laden Sie nach dem Anlegen auf der Seite „Coin bearbeiten“ hoch.'

  it('hat die Überschrift „Zertifikatsvorlage“ als Ebene 2', async () => {
    zeigeSeite()
    await geladen()

    expect(screen.getByRole('heading', { level: 2, name: 'Zertifikatsvorlage' })).toBeInTheDocument()
  })

  it('erklärt den Ablauf mit Standardvorlage und „Coin bearbeiten“', async () => {
    zeigeSeite()
    await geladen()

    expect(seitentext().replace(/\s+/g, ' ')).toContain(HINWEIS)
  })

  it('steht unter dem Formular', async () => {
    zeigeSeite()
    await geladen()

    const absenden = formularFelder().absenden
    const ueberschrift = screen.getByRole('heading', { level: 2, name: 'Zertifikatsvorlage' })
    expect(absenden.compareDocumentPosition(ueberschrift) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lädt über „Standardvorlage herunterladen“ die Datei zertifikatsvorlage-standard.docx', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeigeSeite()
    await geladen()

    await user.click(screen.getByRole('button', { name: 'Standardvorlage herunterladen' }))

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['zertifikatsvorlage-standard.docx']))
  })

  it('sendet beim Download nichts aus dem Formular und legt keinen Coin an', async () => {
    beobachteDownloads()
    const { user } = zeigeSeite()
    await geladen()
    await fuelleAus(user, PFLICHT)

    await user.click(screen.getByRole('button', { name: 'Standardvorlage herunterladen' }))

    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/zertifikatsvorlagen\/standard$/)).toHaveLength(1))
    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual(['GET /api/zertifikatsvorlagen/standard'])
    expect(api.anfragen[0].query.toString()).toBe('')
    expect(onAngelegt).not.toHaveBeenCalled()
    expect(formularFelder().name).toHaveValue('Coin Alpha')
  })
})
