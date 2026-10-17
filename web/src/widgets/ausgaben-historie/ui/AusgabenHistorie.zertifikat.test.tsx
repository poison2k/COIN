import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import { beobachteDownloads } from '../../../../test/downloads'
import {
  erstelleFakeApi,
  testAusgabe,
  testCoin,
  zertifikatKonfliktAntwort,
  type FakeApi,
} from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabenHistorie } from '../index'

// Feature zertifikat-erzeugen, AK-24 bis AK-26, AK-29 und AK-30: Spalte „Zertifikat“ in der Ausgabehistorie mit der
// Zertifikatsnummer als Link zur Ausgabe-Seite und – nur mit darfZertifikat (issues.write) – dem Button „Zertifikat
// herunterladen“. Nach Storno kann eine Nummer zweimal vorkommen; die zugänglichen Namen nennen deshalb den Status.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const NEU_ID = '0199a1b2-0000-7000-8000-00000000e012'
const ALT_ID = '0199a1b2-0000-7000-8000-00000000e011'
const DREI_ID = '0199a1b2-0000-7000-8000-00000000e003'
const GET = /^\/api\/coins\/[^/]+\/ausgaben$/
const ZERTIFIKAT = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/zertifikat$/
const STORNO = { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Doppelt' }

let api: FakeApi

function ausgaben(): Ausgabe[] {
  return [
    testAusgabe({ id: NEU_ID, exemplarNummer: 12 }),
    testAusgabe({ id: ALT_ID, exemplarNummer: 12, storno: STORNO }),
    testAusgabe({ id: DREI_ID, exemplarNummer: 3 }),
  ]
}

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })], { ausgaben: { [COIN_ID]: ausgaben() } })
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-historie')
})

afterEach(() => {
  setzeTokenQuelle(null)
})

function zeige(darfZertifikat = true) {
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(() => (
    <AusgabenHistorie coinId={COIN_ID} darfStornieren={false} darfZertifikat={darfZertifikat} onGeaendert={() => {}} />
  ))
  return { user, ...ansicht }
}

async function tabelle() {
  return screen.findByRole('table', { name: 'Ausgabehistorie' })
}

/** Gesperrt heißt `disabled` oder `aria-disabled="true"` (fokussierbar gesperrt, AK-26). */
function gesperrt(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true'
}

function zeilen(): HTMLElement[] {
  return within(screen.getByRole('table', { name: 'Ausgabehistorie' }))
    .getAllByRole('row')
    .slice(1)
}

describe('Spalte „Zertifikat“ (AK-24)', () => {
  it('steht direkt vor „Status“', async () => {
    zeige()
    await tabelle()

    const kopf = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(kopf.indexOf('Zertifikat')).toBe(kopf.indexOf('Status') - 1)
  })

  it('zeigt die Zertifikatsnummer als Linktext', async () => {
    zeige()
    await tabelle()

    expect(within(zeilen()[2]).getByRole('link', { name: 'Ausgabe C0042-0003 anzeigen' })).toHaveTextContent(
      'C0042-0003',
    )
  })

  it('nennt im Linknamen den Status, wenn die Nummer zweimal vorkommt', async () => {
    zeige()
    await tabelle()

    expect(within(zeilen()[0]).getByRole('link', { name: 'Ausgabe C0042-0012 anzeigen' })).toBeInTheDocument()
    expect(
      within(zeilen()[1]).getByRole('link', { name: 'Stornierte Ausgabe C0042-0012 anzeigen' }),
    ).toBeInTheDocument()
  })

  it('verlinkt jede Zeile auf die Ausgabe-Seite mit der ausgabeId der Zeile', async () => {
    zeige()
    await tabelle()

    expect(zeilen().map((z) => within(z).getByRole('link').getAttribute('href'))).toEqual([
      `/coins/${COIN_ID}/ausgaben/${NEU_ID}`,
      `/coins/${COIN_ID}/ausgaben/${ALT_ID}`,
      `/coins/${COIN_ID}/ausgaben/${DREI_ID}`,
    ])
  })

  it('führt per Klick auf den Link zur Ausgabe-Seite', async () => {
    const { user, router } = zeige()
    await tabelle()

    await user.click(screen.getByRole('link', { name: 'Stornierte Ausgabe C0042-0012 anzeigen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${COIN_ID}/ausgaben/${ALT_ID}`))
  })
})

describe('Button „Zertifikat herunterladen“ (AK-24, AK-29)', () => {
  it('gibt es mit darfZertifikat in jeder Zeile', async () => {
    zeige(true)
    await tabelle()

    expect(
      zeilen().map((z) => within(z).getAllByRole('button', { name: /^Zertifikat .* herunterladen/ }).length),
    ).toEqual([1, 1, 1])
  })

  it('ist bei der aktiven Zeile bedienbar', async () => {
    zeige(true)
    await tabelle()

    expect(gesperrt(within(zeilen()[0]).getByRole('button', { name: 'Zertifikat C0042-0012 herunterladen' }))).toBe(
      false,
    )
  })

  it('ist bei der stornierten Zeile gesperrt und nennt den Grund im zugänglichen Namen', async () => {
    zeige(true)
    await tabelle()

    const button = within(zeilen()[1]).getByRole('button', {
      name: 'Zertifikat C0042-0012 herunterladen (nicht möglich, Ausgabe storniert)',
    })
    expect(gesperrt(button)).toBe(true)
  })

  it('gibt es ohne darfZertifikat nicht, der Link bleibt', async () => {
    zeige(false)
    await tabelle()

    expect(screen.queryByRole('button', { name: /Zertifikat/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Ausgabe C0042-\d+ anzeigen$/ })).toHaveLength(3)
  })

  it('sendet ohne Klick keinen Request auf …/zertifikat', async () => {
    zeige(true)
    await tabelle()

    expect(api.anfragenMit('GET', ZERTIFIKAT)).toHaveLength(0)
  })

  it('lädt das Zertifikat der aktiven Zeile mit deren ausgabeId', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige(true)
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Zertifikat C0042-0012 herunterladen' }))

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['Zertifikat_C0042-0012.docx']))
    expect(api.anfragenMit('GET', ZERTIFIKAT).map((a) => a.pfad)).toEqual([
      `/api/coins/${COIN_ID}/ausgaben/${NEU_ID}/zertifikat`,
    ])
  })

  it('lädt nach 409 ausgabe_storniert die Historie neu und zeigt den Alarm', async () => {
    api.einmal('GET', ZERTIFIKAT, zertifikatKonfliktAntwort('ausgabe_storniert'))
    const { user } = zeige(true)
    await tabelle()
    const vorher = api.anfragenMit('GET', GET).length

    await user.click(screen.getByRole('button', { name: 'Zertifikat C0042-0003 herunterladen' }))

    await waitFor(() => expect(api.anfragenMit('GET', GET).length).toBeGreaterThan(vorher))
    expect(
      await screen.findByText(
        'Diese Ausgabe wurde inzwischen storniert. Ein Zertifikat kann nicht mehr heruntergeladen werden.',
      ),
    ).toBeInTheDocument()
  })
})

describe('Fokus nach 409 (AK-26, AK-30)', () => {
  it('lässt den Fokus nach 409 ausgabe_storniert und Neuladen auf dem nun gesperrten Button der Zeile', async () => {
    // Der Server storniert die Ausgabe inzwischen: 409 und beim Neuladen kommt sie storniert.
    api.einmal('GET', ZERTIFIKAT, () => {
      const eintrag = api.ausgaben[COIN_ID].find((a) => a.id === DREI_ID)!
      eintrag.storno = STORNO
      return zertifikatKonfliktAntwort('ausgabe_storniert')
    })
    const { user } = zeige(true)
    await tabelle()
    const vorher = api.anfragenMit('GET', GET).length
    within(zeilen()[2]).getByRole('button', { name: 'Zertifikat C0042-0003 herunterladen' }).focus()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(api.anfragenMit('GET', GET).length).toBeGreaterThan(vorher))
    const button = await within(screen.getByRole('table', { name: 'Ausgabehistorie' })).findByRole('button', {
      name: 'Zertifikat C0042-0003 herunterladen (nicht möglich, Ausgabe storniert)',
    })
    expect(gesperrt(button)).toBe(true)
    expect(button).toHaveFocus()
    // jsdom verschiebt den Fokus bei nativem `disabled` nicht (Chromium setzt ihn auf <body>); deshalb zusätzlich: gesperrt
    // per aria-disabled, nicht per disabled-Attribut, also weiter fokussierbar.
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toHaveAttribute('disabled')
  })
})

describe('Tastatur und Texte (AK-30)', () => {
  it('erreicht Link und Button je Zeile in Zeilenreihenfolge per Tab', async () => {
    const { user } = zeige(true)
    await tabelle()
    const erwartet = [
      within(zeilen()[0]).getByRole('link'),
      within(zeilen()[0]).getByRole('button', { name: 'Zertifikat C0042-0012 herunterladen' }),
      within(zeilen()[1]).getByRole('link'),
      within(zeilen()[2]).getByRole('link'),
      within(zeilen()[2]).getByRole('button', { name: 'Zertifikat C0042-0003 herunterladen' }),
    ]

    const erreicht: Element[] = []
    for (let i = 0; i < 12 && erreicht.length < erwartet.length; i++) {
      await user.tab()
      if (document.activeElement && erwartet.includes(document.activeElement as HTMLElement)) {
        erreicht.push(document.activeElement)
      }
    }

    expect(erreicht).toEqual(erwartet)
  })

  it('enthält keine englischen Texte, auch nicht in aria-label', async () => {
    zeige(true)
    await tabelle()

    const labels = [...document.body.querySelectorAll('[aria-label]')]
      .map((e) => e.getAttribute('aria-label'))
      .join(' ')
    expect(`${seitentext()} ${labels}`).not.toMatch(/\b(Certificate|Download|Show|View|Cancelled|disabled)\b/)
  })
})
