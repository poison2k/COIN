import { screen, within } from '@testing-library/react'
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

// Feature startseite-listen-pruefung, AK-19, AK-23 und AK-25 bis AK-27 (Abschnitt 4.3, ADR-0043 Punkt 3): Ergebniskarte
// in der dauerhaften Live-Region mit genau einer h2 und genau einem Status-Icon je Ergebnis (Text und Icon paarweise
// verschieden, Prüfung ohne Farbe). Datensatz in Gruppen (h3 je Gruppe, je eine dl) mit unveränderten Begriffen; die
// Menge der Begriffe je Ergebnis und Recht ist gleich der Menge vor dem Umbau (feste Liste). Kein „Grund“, auch wenn die
// Antwort ein Feld stornoGrund enthält. Requests unverändert, Nummer in keiner URL und keinem Storage.

const ALPHA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a1', name: 'Coin Alpha' })
const AKTIV = testAusgabe({
  id: '0199a1b2-0000-7000-8000-0000000000e7',
  exemplarNummer: 12,
  hologrammnummer: 'AB 12-34',
  empfaenger: { name: 'Testperson A', dienstgrad: 'Test Dienstgrad Gr1', dienststelle: 'Dienststelle Beispiel' },
  gelegenheit: 'Test Gelegenheit Gr2',
  begruendung: 'Test Begruendung Gr3',
  ausgebendeStelle: 'Test Stelle Gr4',
})
const STORNIERT = testAusgabe({
  ...AKTIV,
  id: '0199a1b2-0000-7000-8000-0000000000e8',
  hologrammnummer: 'CD 56-78',
  storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Test Stornogrund Gr5' },
})
const PRUEFUNG = /^\/api\/pruefung(\/mit-empfaenger)?$/

const UEBERSCHRIFT: Record<FakePruefErgebnis, string> = {
  gueltig: 'Zertifikat gültig',
  storniert: 'Ausgabe storniert, Zertifikat ungültig',
  falscherCoin: 'Die Nummer gehört nicht zu diesem Coin.',
  nichtGefunden: 'Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.',
}
const ICON: Record<FakePruefErgebnis, string> = {
  gueltig: 'lucide-circle-check',
  storniert: 'lucide-ban',
  falscherCoin: 'lucide-triangle-alert',
  nichtGefunden: 'lucide-search-x',
}
const ERGEBNISSE = Object.keys(UEBERSCHRIFT) as FakePruefErgebnis[]

/** Angezeigte Begriffe vor dem Umbau (hologrammnummer AK-31), je Ergebnis und Recht – feste Liste (AK-26). */
const BEGRIFFE_VORHER: Record<'ohne' | 'mit', Record<FakePruefErgebnis, string[]>> = {
  ohne: {
    gueltig: ['Coin', 'Exemplar', 'Zertifikatsnummer', 'Hologrammnummer', 'Ausgabedatum', 'Status'],
    storniert: ['Coin', 'Exemplar', 'Zertifikatsnummer', 'Hologrammnummer', 'Ausgabedatum', 'Status'],
    falscherCoin: [],
    nichtGefunden: [],
  },
  mit: {
    gueltig: [
      'Coin',
      'Exemplar',
      'Zertifikatsnummer',
      'Hologrammnummer',
      'Ausgabedatum',
      'Status',
      'Empfänger',
      'Gelegenheit',
      'Begründung',
      'Ausgebende Stelle',
    ],
    storniert: [
      'Coin',
      'Exemplar',
      'Zertifikatsnummer',
      'Hologrammnummer',
      'Ausgabedatum',
      'Status',
      'Empfänger',
      'Gelegenheit',
      'Begründung',
      'Ausgebende Stelle',
    ],
    falscherCoin: [],
    nichtGefunden: [],
  },
}

const GRUPPEN: Array<[string, string[]]> = [
  ['Coin und Exemplar', ['Coin', 'Exemplar']],
  ['Zertifikat', ['Zertifikatsnummer', 'Hologrammnummer']],
  ['Ausgabe', ['Ausgabedatum', 'Status']],
]
const EMPFAENGER_GRUPPE: [string, string[]] = [
  'Empfängerdaten',
  ['Empfänger', 'Gelegenheit', 'Begründung', 'Ausgebende Stelle'],
]

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([ALPHA], { me: ME.sachbearbeiter, ausgaben: { [ALPHA.id]: [AKTIV, STORNIERT] } })
  vi.stubGlobal('fetch', api.fetch)
})

/** Antwortet auf die nächste Prüfung mit dem Ergebnis; `zusatz` ergänzt den Datensatz (z. B. stornoGrund). */
function naechstesErgebnis(ergebnis: FakePruefErgebnis, mitEmpfaenger: boolean, zusatz: Record<string, unknown> = {}) {
  const antwort = testPruefErgebnis(ergebnis, {
    coin: ALPHA,
    ausgabe: ergebnis === 'storniert' ? STORNIERT : AKTIV,
    mitEmpfaenger,
  })
  if (antwort.datensatz) Object.assign(antwort.datensatz as Record<string, unknown>, zusatz)
  api.einmal('POST', PRUEFUNG, jsonAntwort(200, { ...antwort, ...zusatz }))
}

async function pruefe(ergebnis: FakePruefErgebnis, darfEmpfaenger = false, zusatz: Record<string, unknown> = {}) {
  naechstesErgebnis(ergebnis, darfEmpfaenger, zusatz)
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(() => <PruefungSeite darfEmpfaenger={darfEmpfaenger} />, { pfad: '/pruefung' })
  await screen.findByRole('heading', { level: 1, name: 'Zertifikat prüfen' })
  await gibEin(user, screen.getByLabelText(/^Hologrammnummer/), 'ab 12-34')
  await user.keyboard('{Enter}')
  const ueberschrift = await screen.findByRole('heading', { level: 2, name: UEBERSCHRIFT[ergebnis] })
  const region = ueberschrift.closest('[role="status"]') as HTMLElement
  expect(region, 'Ergebnis steht nicht in der Live-Region').not.toBeNull()
  return { user, region, ...ansicht }
}

function begriffe(bereich: HTMLElement): string[] {
  return [...bereich.querySelectorAll('dt')].map((dt) => dt.textContent?.trim() ?? '')
}

/** Element der Gruppe (das die h3 und ihre dl enthält, aber keine andere h3). */
function gruppe(region: HTMLElement, titel: string): HTMLElement {
  const h3 = within(region).getByRole('heading', { level: 3, name: titel })
  let e: HTMLElement | null = h3.parentElement
  while (e && e !== region && !e.querySelector('dl')) e = e.parentElement
  expect(e && e !== region, `Gruppe „${titel}“ ohne eigene dl`).toBe(true)
  return e as HTMLElement
}

// ---------- AK-19: Aufbau vor einer Prüfung ----------

describe('Aufbau vor einer Prüfung (AK-19)', () => {
  it('hat vor einer Prüfung genau ein h1 und keine h2', async () => {
    zeigeMitRouter(() => <PruefungSeite darfEmpfaenger={false} />, { pfad: '/pruefung' })

    await screen.findByRole('heading', { level: 1, name: 'Zertifikat prüfen' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
  })
})

// ---------- AK-23: vier Ergebnisse ohne Farbe unterscheidbar ----------

describe.each(ERGEBNISSE)('Ergebnis %s (AK-23)', (ergebnis) => {
  it('enthält in der Live-Region genau eine h2 mit dem Text aus 4.3', async () => {
    const { region } = await pruefe(ergebnis)

    const h2 = within(region).getAllByRole('heading', { level: 2 })
    expect(h2).toHaveLength(1)
    expect(h2[0]).toHaveTextContent(UEBERSCHRIFT[ergebnis])
  })

  it('enthält genau ein Status-Icon mit der Klasse aus 4.3 und kein anderes Status-Icon', async () => {
    const { region } = await pruefe(ergebnis)

    for (const [art, klasse] of Object.entries(ICON)) {
      expect(region.querySelectorAll(`svg.${klasse}`), klasse).toHaveLength(art === ergebnis ? 1 : 0)
    }
  })

  it('blendet das Icon für Screenreader aus', async () => {
    const { region } = await pruefe(ergebnis)

    expect(region.querySelector(`svg.${ICON[ergebnis]}`)).toHaveAttribute('aria-hidden', 'true')
  })

  it('nennt die geprüfte Nummer unverändert als „Geprüfte Nummer: {Anzeigeform}“', async () => {
    const { region } = await pruefe(ergebnis)

    expect(region).toHaveTextContent('Geprüfte Nummer: AB 12-34')
  })
})

describe('Unterscheidung der vier Ergebnisse (AK-23)', () => {
  it('hat paarweise verschiedene Überschriften und Icons in der Anzeige', async () => {
    const gesehen: Array<{ text: string; icons: string }> = []
    for (const ergebnis of ERGEBNISSE) {
      const { region, unmount } = await pruefe(ergebnis)
      const h2 = within(region).getByRole('heading', { level: 2 })
      const icons = [...region.querySelectorAll('svg[aria-hidden="true"]')]
        .map((svg) => [...svg.classList].filter((k) => k.startsWith('lucide-') && k !== 'lucide').join(' '))
        .join('|')
      gesehen.push({ text: h2.textContent?.trim() ?? '', icons })
      unmount()
    }

    expect(new Set(gesehen.map((g) => g.text)).size).toBe(4)
    expect(new Set(gesehen.map((g) => g.icons)).size).toBe(4)
  })
})

// ---------- AK-25: Datensatz in Gruppen ----------

describe.each(['gueltig', 'storniert'] as const)('Datensatz bei %s (AK-25)', (ergebnis) => {
  it('zeigt ohne Empfängerdaten die Gruppen „Coin und Exemplar“, „Zertifikat“, „Ausgabe“ als h3', async () => {
    const { region } = await pruefe(ergebnis)

    expect(
      within(region)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent?.trim()),
    ).toEqual(GRUPPEN.map(([titel]) => titel))
  })

  it('hat je Gruppe eine eigene dl mit den Begriffen in unveränderter Reihenfolge', async () => {
    const { region } = await pruefe(ergebnis)

    for (const [titel, erwartet] of GRUPPEN) {
      const element = gruppe(region, titel)
      expect(element.querySelectorAll('dl'), titel).toHaveLength(1)
      expect(begriffe(element), titel).toEqual(erwartet)
    }
    expect(region.querySelectorAll('dl')).toHaveLength(3)
  })

  it('zeigt mit Empfängerdaten zusätzlich die Gruppe „Empfängerdaten“ mit eigener dl', async () => {
    const { region } = await pruefe(ergebnis, true)

    const titel = within(region)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent?.trim())
    expect(titel).toEqual([...GRUPPEN.map(([t]) => t), EMPFAENGER_GRUPPE[0]])
    expect(begriffe(gruppe(region, EMPFAENGER_GRUPPE[0]))).toEqual(EMPFAENGER_GRUPPE[1])
    expect(region.querySelectorAll('dl')).toHaveLength(4)
  })

  it('zeigt Coin als Link, Exemplar als „Nr. 12“ und die Nummern unverändert', async () => {
    const { region } = await pruefe(ergebnis)

    expect(within(gruppe(region, 'Coin und Exemplar')).getByRole('link', { name: 'Coin Alpha' })).toHaveAttribute(
      'href',
      `/coins/${ALPHA.id}`,
    )
    expect(gruppe(region, 'Coin und Exemplar')).toHaveTextContent('Nr. 12')
    expect(gruppe(region, 'Zertifikat')).toHaveTextContent(ergebnis === 'storniert' ? 'CD 56-78' : 'AB 12-34')
    expect(gruppe(region, 'Zertifikat')).toHaveTextContent('C0042-0012')
  })

  it('zeigt Ausgabedatum und Status in der Gruppe „Ausgabe“', async () => {
    const { region } = await pruefe(ergebnis)

    const ausgabe = gruppe(region, 'Ausgabe')
    expect(ausgabe).toHaveTextContent('01.10.2026')
    expect(ausgabe).toHaveTextContent(ergebnis === 'storniert' ? 'Storniert am 08.10.2026' : 'Aktiv')
  })

  it('zeigt „Zur Ausgabe“ nur mit Empfängerdaten', async () => {
    const ohne = await pruefe(ergebnis)
    expect(within(ohne.region).queryByRole('link', { name: 'Zur Ausgabe' })).not.toBeInTheDocument()
    ohne.unmount()

    const mit = await pruefe(ergebnis, true)
    expect(within(mit.region).getByRole('link', { name: 'Zur Ausgabe' })).toBeInTheDocument()
  })
})

describe.each(['falscherCoin', 'nichtGefunden'] as const)('ohne Datensatz bei %s (AK-25)', (ergebnis) => {
  it('zeigt keine dl und keine h3', async () => {
    const { region } = await pruefe(ergebnis, true)

    expect(region.querySelector('dl')).toBeNull()
    expect(within(region).queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })
})

// ---------- AK-26: nicht mehr als bisher ----------

describe('Nicht mehr als bisher (AK-26)', () => {
  it.each(ERGEBNISSE.flatMap((e) => [[e, false] as const, [e, true] as const]))(
    'zeigt bei %s (issues.read: %s) genau die Begriffe von vorher',
    async (ergebnis, mitRecht) => {
      const { region } = await pruefe(ergebnis, mitRecht)

      expect(begriffe(region)).toEqual(BEGRIFFE_VORHER[mitRecht ? 'mit' : 'ohne'][ergebnis])
    },
  )

  it.each(ERGEBNISSE)('zeigt bei %s ohne issues.read keine Empfängerdaten und kein „Zur Ausgabe“', async (ergebnis) => {
    const { region } = await pruefe(ergebnis)

    expect(within(region).queryByRole('heading', { name: 'Empfängerdaten' })).not.toBeInTheDocument()
    expect(within(region).queryByRole('link', { name: 'Zur Ausgabe' })).not.toBeInTheDocument()
    for (const begriff of ['Empfänger', 'Gelegenheit', 'Begründung', 'Ausgebende Stelle']) {
      expect(begriffe(region)).not.toContain(begriff)
    }
    expect(document.body.textContent).not.toContain('Testperson A')
  })

  it.each(['gueltig', 'storniert'] as const)(
    'zeigt bei %s keinen Text mit „Grund“, auch wenn die Antwort stornoGrund enthält',
    async (ergebnis) => {
      await pruefe(ergebnis, true, { stornoGrund: 'Test Stornogrund Gr6', grund: 'Test Grund Gr7' })

      expect(document.body.textContent ?? '').not.toMatch(/Grund/)
      expect(document.body.textContent ?? '').not.toMatch(/Gr5|Gr6|Gr7/)
    },
  )
})

// ---------- AK-27: Requests unverändert ----------

describe('Requests unverändert (AK-27)', () => {
  const pruefAnfragen = () => api.anfragen.filter((a) => a.methode === 'POST' && PRUEFUNG.test(a.pfad))

  it('sendet ohne issues.read genau einen POST auf /api/pruefung mit { hologrammnummer, coinId }', async () => {
    await pruefe('gueltig')

    expect(pruefAnfragen().map((a) => a.pfad)).toEqual(['/api/pruefung'])
    expect(Object.keys(pruefAnfragen()[0].body as object).sort()).toEqual(['coinId', 'hologrammnummer'])
  })

  it('sendet mit issues.read genau einen POST auf /api/pruefung/mit-empfaenger', async () => {
    await pruefe('gueltig', true)

    expect(pruefAnfragen().map((a) => a.pfad)).toEqual(['/api/pruefung/mit-empfaenger'])
  })

  it('setzt die Nummer in keine URL einer Anfrage', async () => {
    await pruefe('gueltig', true)

    expect(api.anfragen.filter((a) => /AB|12-34|1234/i.test(`${a.pfad}?${a.query.toString()}`))).toEqual([])
  })

  it('lässt localStorage und sessionStorage durch die Prüfung unverändert', async () => {
    localStorage.setItem('coin-theme', 'dark')
    const vorher = JSON.stringify([{ ...localStorage }, { ...sessionStorage }])

    await pruefe('gueltig', true)

    expect(JSON.stringify([{ ...localStorage }, { ...sessionStorage }])).toBe(vorher)
  })

  it('setzt die Nummer nicht in den Seitentitel', async () => {
    await pruefe('gueltig')

    expect(document.title).not.toMatch(/AB|12-34|1234/i)
  })
})
