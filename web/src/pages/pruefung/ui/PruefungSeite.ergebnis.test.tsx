import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import {
  erstelleFakeApi,
  jsonAntwort,
  testAusgabe,
  testCoin,
  testPruefErgebnis,
  type FakeApi,
  type FakePruefErgebnis,
} from '../../../../test/fakeApi'
import { gibEin } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { PruefungSeite } from '../index'

// Feature hologrammnummer, AK-30 und AK-31: Ergebnis in einer dauerhaft vorhandenen Live-Region (role="status",
// aria-live="polite") mit h2, Icon (aria-hidden) und Text je Ergebnis; darunter „Geprüfte Nummer: …“. Datensatz bei
// gültig/storniert als dl; mit darfEmpfaenger (issues.read) zusätzlich Empfängerdaten und „Zur Ausgabe“ über
// …/mit-empfaenger, sonst weder Request noch Beschriftungen. Nie ein Storno-Grund.

const ALPHA = testCoin({
  id: '0199a1b2-0000-7000-8000-0000000000a1',
  name: 'Coin Alpha',
  herausgeber: 'Herausgeber Beta',
})
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const AKTIV = testAusgabe({
  id: AUSGABE_ID,
  exemplarNummer: 12,
  hologrammnummer: 'AB 12-34',
  empfaenger: {
    name: 'Test Empfaengerin Pruefseite',
    dienstgrad: 'Test Dienstgrad Ps1',
    dienststelle: 'Test Dienststelle Ps2',
  },
  gelegenheit: 'Test Gelegenheit Ps3',
  begruendung: 'Test Begruendung Ps4',
  ausgebendeStelle: 'Test Stelle Ps5',
})
const STORNIERT = testAusgabe({
  ...AKTIV,
  id: '0199a1b2-0000-7000-8000-0000000000e8',
  hologrammnummer: 'CD 56-78',
  storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Test Stornogrund Ps6' },
})
const PRUEFUNG = /^\/api\/pruefung(\/mit-empfaenger)?$/

const UEBERSCHRIFTEN: Record<FakePruefErgebnis, string> = {
  gueltig: 'Zertifikat gültig',
  storniert: 'Ausgabe storniert, Zertifikat ungültig',
  falscherCoin: 'Die Nummer gehört nicht zu diesem Coin.',
  nichtGefunden: 'Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.',
}

const ICONS: Record<FakePruefErgebnis, string> = {
  gueltig: 'lucide-circle-check',
  storniert: 'lucide-ban',
  falscherCoin: 'lucide-triangle-alert',
  nichtGefunden: 'lucide-search-x',
}

const EMPFAENGER_BEGRIFFE = ['Empfänger', 'Gelegenheit', 'Begründung', 'Ausgebende Stelle']

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([ALPHA], { me: ME.sachbearbeiter, ausgaben: { [ALPHA.id]: [AKTIV, STORNIERT] } })
  vi.stubGlobal('fetch', api.fetch)
})

async function pruefe(eingabe: string, darfEmpfaenger = false) {
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(() => <PruefungSeite darfEmpfaenger={darfEmpfaenger} />, { pfad: '/pruefung' })
  await screen.findByRole('heading', { level: 1, name: 'Zertifikat prüfen' })
  const vorher = screen.getAllByRole('status')
  await gibEin(user, screen.getByLabelText(/^Hologrammnummer/), eingabe)
  await user.keyboard('{Enter}')
  const ueberschrift = await screen.findByRole('heading', { level: 2 })
  const region = ueberschrift.closest('[role="status"]') as HTMLElement | null
  return { user, ...ansicht, vorher, ueberschrift, region }
}

/** Antwortet auf die nächste Prüfung mit dem Ergebnis. */
function naechstesErgebnis(ergebnis: FakePruefErgebnis, mitEmpfaenger = false) {
  api.einmal(
    'POST',
    PRUEFUNG,
    jsonAntwort(
      200,
      testPruefErgebnis(ergebnis, {
        coin: ALPHA,
        ausgabe: ergebnis === 'storniert' ? STORNIERT : AKTIV,
        mitEmpfaenger,
      }),
    ),
  )
}

function wert(container: HTMLElement, begriff: string): HTMLElement {
  const dt = within(container)
    .getAllByRole('term')
    .find((t) => t.textContent?.trim() === begriff)
  expect(dt, `Begriff „${begriff}“ fehlt`).toBeDefined()
  let dd = dt!.nextElementSibling
  while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling
  expect(dd, `Kein Wert zu „${begriff}“`).not.toBeNull()
  return dd as HTMLElement
}

// ---------- AK-30: vier Ergebnisse ----------

describe.each(Object.keys(UEBERSCHRIFTEN) as FakePruefErgebnis[])('Ergebnis %s', (ergebnis) => {
  it('zeigt die Überschrift als h2', async () => {
    naechstesErgebnis(ergebnis)

    const { ueberschrift } = await pruefe('AB1234')

    expect(ueberschrift).toHaveTextContent(UEBERSCHRIFTEN[ergebnis])
  })

  it('steht in der schon vorher vorhandenen Live-Region mit aria-live="polite"', async () => {
    naechstesErgebnis(ergebnis)

    const { region, vorher } = await pruefe('AB1234')

    expect(region).not.toBeNull()
    expect(vorher).toContain(region)
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('zeigt das passende Icon für Screenreader ausgeblendet', async () => {
    naechstesErgebnis(ergebnis)

    const { region } = await pruefe('AB1234')

    const icon = region!.querySelector(`svg.${ICONS[ergebnis]}`)
    expect(icon, `Icon ${ICONS[ergebnis]} fehlt`).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('nennt die geprüfte Nummer in bereinigter Form', async () => {
    naechstesErgebnis(ergebnis)

    const { region } = await pruefe('  ab 12-34 ')

    expect(region).toHaveTextContent('Geprüfte Nummer: AB 12-34')
  })
})

describe('Ergebnisse unterscheiden sich nicht nur über die Farbe', () => {
  it('haben vier verschiedene Überschriften und vier verschiedene Icons', () => {
    expect(new Set(Object.values(UEBERSCHRIFTEN)).size).toBe(4)
    expect(new Set(Object.values(ICONS)).size).toBe(4)
  })
})

// ---------- AK-31: Datensatz ----------

describe('Datensatz bei „gültig“', () => {
  it('zeigt Coin als Link zur Detailseite', async () => {
    naechstesErgebnis('gueltig')

    const { region } = await pruefe('AB1234')

    expect(within(wert(region!, 'Coin')).getByRole('link', { name: 'Coin Alpha' })).toHaveAttribute(
      'href',
      `/coins/${ALPHA.id}`,
    )
  })

  it.each([
    ['Exemplar', 'Nr. 12'],
    ['Zertifikatsnummer', 'C0042-0012'],
    ['Hologrammnummer', 'AB 12-34'],
    ['Ausgabedatum', '01.10.2026'],
    ['Status', 'Aktiv'],
  ])('zeigt %s „%s“', async (begriff, erwartet) => {
    naechstesErgebnis('gueltig')

    const { region } = await pruefe('AB1234')

    expect(wert(region!, begriff)).toHaveTextContent(erwartet)
  })

  it('ist eine Beschreibungsliste', async () => {
    naechstesErgebnis('gueltig')

    const { region } = await pruefe('AB1234')

    expect(region!.querySelector('dl')).not.toBeNull()
  })
})

describe('Datensatz bei „storniert“', () => {
  it('zeigt den Status „Storniert am TT.MM.JJJJ“', async () => {
    naechstesErgebnis('storniert')

    const { region } = await pruefe('CD5678')

    expect(wert(region!, 'Status')).toHaveTextContent('Storniert am 08.10.2026')
  })

  it('zeigt nie einen Storno-Grund, auch nicht mit Empfängerdaten', async () => {
    api.einmal(
      'POST',
      PRUEFUNG,
      jsonAntwort(200, {
        ...testPruefErgebnis('storniert', { coin: ALPHA, ausgabe: STORNIERT, mitEmpfaenger: true }),
        stornoGrund: 'Test Stornogrund Ps6',
      }),
    )

    await pruefe('CD5678', true)

    expect(document.body.textContent).not.toContain('Ps6')
    expect(screen.queryByText(/Grund/)).not.toBeInTheDocument()
  })
})

describe.each(['falscherCoin', 'nichtGefunden'] as const)('ohne Datensatz (%s)', (ergebnis) => {
  it('zeigt keine Beschreibungsliste', async () => {
    naechstesErgebnis(ergebnis)

    const { region } = await pruefe('AB1234')

    expect(region!.querySelector('dl')).toBeNull()
  })
})

// ---------- AK-31: Empfängerdaten nur mit issues.read ----------

describe('ohne issues.read', () => {
  it('ruft nur POST /api/pruefung auf', async () => {
    await pruefe('AB1234', false)

    expect(api.anfragen.filter((a) => a.methode === 'POST').map((a) => a.pfad)).toEqual(['/api/pruefung'])
  })

  it('sendet keinen Request auf …/ausgaben', async () => {
    await pruefe('AB1234', false)

    expect(api.anfragen.filter((a) => a.pfad.includes('/ausgaben'))).toEqual([])
  })

  it.each([...EMPFAENGER_BEGRIFFE, 'Zur Ausgabe'])('enthält die Beschriftung „%s“ nicht', async (text) => {
    const { region } = await pruefe('AB1234', false)

    expect(within(region!).queryByText(text)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Zur Ausgabe' })).not.toBeInTheDocument()
  })

  it('zeigt keine Empfängerdaten', async () => {
    await pruefe('AB1234', false)

    expect(document.body.textContent).not.toMatch(/Ps[1-5]|Test Empfaengerin/)
  })
})

describe('mit issues.read', () => {
  it('ruft nur POST /api/pruefung/mit-empfaenger auf', async () => {
    await pruefe('AB1234', true)

    expect(api.anfragen.filter((a) => a.methode === 'POST').map((a) => a.pfad)).toEqual([
      '/api/pruefung/mit-empfaenger',
    ])
  })

  it('zeigt Empfänger mit Name, Dienstgrad und Dienststelle', async () => {
    const { region } = await pruefe('AB1234', true)

    const empfaenger = wert(region!, 'Empfänger')
    expect(empfaenger).toHaveTextContent('Test Empfaengerin Pruefseite')
    expect(empfaenger).toHaveTextContent('Test Dienstgrad Ps1')
    expect(empfaenger).toHaveTextContent('Test Dienststelle Ps2')
  })

  it.each([
    ['Gelegenheit', 'Test Gelegenheit Ps3'],
    ['Begründung', 'Test Begruendung Ps4'],
    ['Ausgebende Stelle', 'Test Stelle Ps5'],
  ])('zeigt %s', async (begriff, erwartet) => {
    const { region } = await pruefe('AB1234', true)

    expect(wert(region!, begriff)).toHaveTextContent(erwartet)
  })

  it('verlinkt „Zur Ausgabe“ auf die Seite der Ausgabe', async () => {
    const { region } = await pruefe('AB1234', true)

    expect(within(region!).getByRole('link', { name: 'Zur Ausgabe' })).toHaveAttribute(
      'href',
      `/coins/${ALPHA.id}/ausgaben/${AUSGABE_ID}`,
    )
  })
})

// ---------- AK-30: altes Ergebnis ausblenden ----------

describe('Änderung nach einem Ergebnis', () => {
  it('blendet das Ergebnis aus, sobald die Nummer geändert wird', async () => {
    const { user } = await pruefe('AB1234')

    await user.type(screen.getByLabelText(/^Hologrammnummer/), '5')

    await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument())
  })

  it('zeigt nach einer zweiten Prüfung das neue Ergebnis', async () => {
    const { user } = await pruefe('AB1234')
    const feld = screen.getByLabelText(/^Hologrammnummer/)
    await user.clear(feld)
    await gibEin(user, feld, 'ZZ9999')

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 2, name: UEBERSCHRIFTEN.nichtGefunden })).toBeInTheDocument()
  })
})
