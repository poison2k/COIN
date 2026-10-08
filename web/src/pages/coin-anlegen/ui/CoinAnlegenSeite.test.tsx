import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { erstelleFakeApi, problemAntwort, testDatei, type FakeApi } from '../../../../test/fakeApi'
import { formularFelder, fuelleAus, meldungMit, seitentext, TEXTE } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
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
