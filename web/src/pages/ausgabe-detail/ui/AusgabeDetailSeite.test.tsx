import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import { beobachteDownloads } from '../../../../test/downloads'
import {
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  zertifikatKonfliktAntwort,
  type FakeApi,
} from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabeDetailSeite } from '../index'

// Feature zertifikat-erzeugen, AK-25 bis AK-30: Seite „Ausgabe“ (/coins/$coinId/ausgaben/$ausgabeId). Props
// { coinId, ausgabeId, darfZertifikat }; die Seite lädt Coin (Name) und Ausgabe und nutzt keine Router-Hooks.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const AUSGABE = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+$/
const ZERTIFIKAT = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/zertifikat$/
const STORNO = { am: '2026-10-09T08:00:00+00:00', von: { id: 'x', name: 'Test Administrator' }, grund: 'Doppelt' }

const TEXTE = {
  laedt: 'Ausgabe wird geladen …',
  fehler: 'Die Ausgabe konnte nicht geladen werden. Bitte später erneut versuchen.',
  nichtGefunden: 'Ausgabe nicht gefunden',
  stornoHinweis: 'Für stornierte Ausgaben kann kein Zertifikat heruntergeladen werden.',
  storniertErkannt: 'Diese Ausgabe wurde inzwischen storniert. Ein Zertifikat kann nicht mehr heruntergeladen werden.',
} as const

let api: FakeApi

function starte(ausgabe: Ausgabe = testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12 })) {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, name: 'Coin Alpha', auflage: 150 })], {
    ausgaben: { [COIN_ID]: [ausgabe] },
  })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
  setzeTokenQuelle(() => 'token-seite')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

function zeige({ coinId = COIN_ID, ausgabeId = AUSGABE_ID, darfZertifikat = true } = {}) {
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(
    () => <AusgabeDetailSeite coinId={coinId} ausgabeId={ausgabeId} darfZertifikat={darfZertifikat} />,
    { pfad: '/coins/$coinId/ausgaben/$ausgabeId', start: `/coins/${coinId}/ausgaben/${ausgabeId}` },
  )
  return { user, ...ansicht }
}

async function ueberschrift() {
  return screen.findByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })
}

/** Gesperrt heißt `disabled` oder `aria-disabled="true"` (fokussierbar gesperrt, AK-26). */
const gesperrt = (b: HTMLButtonElement | null) => !!b && (b.disabled || b.getAttribute('aria-disabled') === 'true')

const downloadKnopf = () =>
  screen.queryByRole('button', { name: /Zertifikat.*herunterladen/ }) as HTMLButtonElement | null

describe('Aufbau (AK-28)', () => {
  it('hat die Überschrift „Ausgabe von Exemplar Nr. {n}“', async () => {
    zeige()

    expect(await ueberschrift()).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeige()
    await ueberschrift()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('verlinkt den Coin-Namen auf die Detailseite', async () => {
    zeige()
    await ueberschrift()

    expect(await screen.findByRole('link', { name: 'Coin Alpha' })).toHaveAttribute('href', `/coins/${COIN_ID}`)
  })

  it('hat einen Link „Zurück zum Coin“ zur Detailseite', async () => {
    zeige()
    await ueberschrift()

    expect(screen.getByRole('link', { name: 'Zurück zum Coin' })).toHaveAttribute('href', `/coins/${COIN_ID}`)
  })

  it('zeigt die Angaben mit Zertifikatsnummer als Beschreibungsliste', async () => {
    zeige()
    await ueberschrift()

    const begriffe = screen.getAllByRole('term').map((t) => t.textContent?.trim())
    expect(begriffe).toContain('Zertifikatsnummer')
    expect(seitentext()).toContain('C0042-0012')
  })

  it('lädt die Ausgabe über GET …/ausgaben/{ausgabeId}', async () => {
    zeige()
    await ueberschrift()

    expect(api.anfragenMit('GET', AUSGABE).map((a) => a.pfad)).toEqual([`/api/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}`])
  })
})

describe('Laden und Fehler (AK-27, AK-28)', () => {
  it('zeigt während des Ladens „Ausgabe wird geladen …“ als Status', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', AUSGABE, () => offen.promise)
    zeige()

    expect(await screen.findByRole('status')).toHaveTextContent(TEXTE.laedt)
  })

  it('zeigt bei 500 den Fehler als Alarm', async () => {
    api.einmal('GET', AUSGABE, problemAntwort(500))
    zeige()

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTE.fehler)
  })

  it('zeigt bei 404 „Ausgabe nicht gefunden“', async () => {
    zeige({ ausgabeId: '0199a1b2-0000-7000-8000-0000000000ff' })

    expect(await screen.findByRole('heading', { level: 1, name: TEXTE.nichtGefunden })).toBeInTheDocument()
  })

  it('zeigt für eine Ausgabe-Id ohne GUID-Format „Ausgabe nicht gefunden“ ohne API-Aufruf', async () => {
    zeige({ ausgabeId: 'keine-guid' })

    expect(await screen.findByRole('heading', { level: 1, name: TEXTE.nichtGefunden })).toBeInTheDocument()
    expect(api.anfragen.filter((a) => a.pfad.includes('/ausgaben'))).toEqual([])
  })

  it('zeigt für eine Coin-Id ohne GUID-Format „Ausgabe nicht gefunden“ ohne API-Aufruf', async () => {
    zeige({ coinId: 'kein-coin' })

    expect(await screen.findByRole('heading', { level: 1, name: TEXTE.nichtGefunden })).toBeInTheDocument()
    expect(api.anfragen).toEqual([])
  })
})

describe('Zertifikat (AK-25, AK-26, AK-28, AK-29)', () => {
  it('bietet mit darfZertifikat den Button „Zertifikat herunterladen“', async () => {
    zeige()
    await ueberschrift()

    expect(downloadKnopf()).toHaveTextContent('Zertifikat herunterladen')
    expect(gesperrt(downloadKnopf())).toBe(false)
  })

  it('hat ohne darfZertifikat keinen Button und sendet keinen Request auf …/zertifikat', async () => {
    zeige({ darfZertifikat: false })
    await ueberschrift()

    expect(downloadKnopf()).toBeNull()
    expect(api.anfragenMit('GET', ZERTIFIKAT)).toHaveLength(0)
  })

  it('lädt das Zertifikat herunter', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()
    await ueberschrift()

    await user.click(downloadKnopf()!)

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['Zertifikat_C0042-0012.docx']))
  })

  it('sperrt den Button bei stornierter Ausgabe und verbindet den Hinweis per aria-describedby', async () => {
    starte(testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12, storno: STORNO }))
    zeige()
    await ueberschrift()

    expect(gesperrt(downloadKnopf())).toBe(true)
    expect(downloadKnopf()).toHaveAccessibleDescription(TEXTE.stornoHinweis)
    expect(screen.getByText(TEXTE.stornoHinweis)).toBeVisible()
  })

  it('zeigt bei stornierter Ausgabe den Status wie in der Historie, nicht nur über Farbe', async () => {
    starte(testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12, storno: STORNO }))
    zeige()
    await ueberschrift()

    expect(seitentext()).toContain('storniert am 09.10.2026 von Test Administrator: Doppelt')
  })

  it('lässt den Fokus nach 409 ausgabe_storniert und Neuladen auf dem nun gesperrten Button', async () => {
    api.einmal('GET', ZERTIFIKAT, () => {
      api.ausgaben[COIN_ID][0].storno = STORNO
      return zertifikatKonfliktAntwort('ausgabe_storniert')
    })
    const { user } = zeige()
    await ueberschrift()
    downloadKnopf()!.focus()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(api.anfragenMit('GET', AUSGABE).length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(gesperrt(downloadKnopf())).toBe(true))
    expect(downloadKnopf()).toHaveFocus()
    // jsdom verschiebt den Fokus bei nativem `disabled` nicht (Chromium setzt ihn auf <body>); deshalb zusätzlich: gesperrt
    // per aria-disabled, nicht per disabled-Attribut, also weiter fokussierbar.
    expect(downloadKnopf()).toHaveAttribute('aria-disabled', 'true')
    expect(downloadKnopf()).not.toHaveAttribute('disabled')
  })

  it('lädt nach 409 ausgabe_storniert die Ausgabe neu und zeigt den Hinweis', async () => {
    api.einmal('GET', ZERTIFIKAT, zertifikatKonfliktAntwort('ausgabe_storniert'))
    const { user } = zeige()
    await ueberschrift()

    await user.click(downloadKnopf()!)

    expect(await screen.findByText(TEXTE.storniertErkannt)).toBeInTheDocument()
    await waitFor(() => expect(api.anfragenMit('GET', AUSGABE).length).toBeGreaterThanOrEqual(2))
  })
})

describe('deutsche Texte (AK-30)', () => {
  it('enthält keine englischen Texte, auch nicht in aria-label', async () => {
    zeige()
    await ueberschrift()

    const labels = [...document.body.querySelectorAll('[aria-label]')]
      .map((e) => e.getAttribute('aria-label'))
      .join(' ')
    expect(`${seitentext()} ${labels}`).not.toMatch(
      /\b(Back|Certificate|Download|Recipient|Loading|Error|Not found|Issue|Status: active)\b/,
    )
  })
})
