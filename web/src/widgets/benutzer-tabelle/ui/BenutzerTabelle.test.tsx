import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenutzerEintrag } from '@/entities/benutzer'
import {
  erstelleFakeApi,
  keinZugriffAntwort,
  konfliktAntwort,
  offeneAntwort,
  problemAntwort,
  testBenutzerEintrag,
  type FakeApi,
} from '../../../../test/fakeApi'
import { meldungMit } from '../../../../test/hilfen'
import { BenutzerTabelle } from '../index'

// Feature rollen-benutzerverwaltung, AK-26 bis AK-30, AK-35: Tab „Benutzer“ der Benutzerverwaltung.
// Suche, Statusmeldung, Tabelle, Blättern, eigene Zeile und Fehlermeldungen aus Rolle/Status. Daten synthetisch.

const ICH = testBenutzerEintrag({
  id: '0199a1b2-0000-7000-8000-00000000a001',
  name: 'Test Administrator',
  email: 'admin@test.local',
  rolle: 'Administrator',
})
const ANNA = testBenutzerEintrag({
  id: '0199a1b2-0000-7000-8000-00000000b001',
  name: 'Anna Probe',
  email: 'anna@test.local',
  rolle: 'keine',
})
const BERT = testBenutzerEintrag({
  id: '0199a1b2-0000-7000-8000-00000000b002',
  name: 'Bert Beispiel',
  email: 'bert@test.local',
  rolle: 'Sachbearbeiter',
})
const CARLA = testBenutzerEintrag({
  id: '0199a1b2-0000-7000-8000-00000000b003',
  name: 'Carla Muster',
  email: 'carla@test.local',
  rolle: 'Betrachter',
  aktiv: false,
})

const TEXTE = {
  laden: 'Benutzer werden geladen …',
  ladeFehler: 'Benutzer konnten nicht geladen werden. Bitte später erneut versuchen.',
  eigenesKontoHinweis: 'Das eigene Konto kann nicht geändert werden.',
  letzterAdmin: 'Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.',
  eigenesKonto: 'Das eigene Konto kann nicht geändert werden.',
  nichtGefunden: 'Der Benutzer wurde nicht gefunden.',
  keineBerechtigung: 'Sie sind nicht berechtigt, Benutzer zu verwalten.',
  allgemein: 'Die Änderung konnte nicht gespeichert werden. Bitte später erneut versuchen.',
} as const

let api: FakeApi

function starte(benutzer: BenutzerEintrag[] = [ICH, ANNA, BERT, CARLA]) {
  api = erstelleFakeApi([], { benutzer })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
})

function zeige(aktuellerBenutzerId: string = ICH.id) {
  const user = userEvent.setup()
  render(<BenutzerTabelle aktuellerBenutzerId={aktuellerBenutzerId} />)
  return { user }
}

async function tabelle(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: 'Benutzer' })
}

function listenAbrufe() {
  return api.anfragenMit('GET', /^\/api\/benutzer$/)
}

function suchfeld(): HTMLInputElement {
  return screen.getByRole('searchbox', { name: 'Benutzer suchen' }) as HTMLInputElement
}

function rollenAuswahl(name: string): HTMLElement {
  return screen.getByRole('combobox', { name: `Rolle von ${name}` })
}

/** Zeile der Tabelle, in der der Name steht. */
function zeileVon(name: string): HTMLElement {
  const zeile = screen.getAllByRole('row').find((z) => within(z).queryByText(name, { exact: false }))
  if (!zeile) throw new Error(`Keine Zeile für ${name}.`)
  return zeile
}

async function waehleRolle(user: UserEvent, name: string, option: string): Promise<void> {
  await user.click(rollenAuswahl(name))
  await user.click(await screen.findByRole('option', { name: option }))
}

async function bestaetigeRolle(user: UserEvent): Promise<void> {
  const dialog = await screen.findByRole('alertdialog', { name: 'Rolle ändern?' })
  await user.click(within(dialog).getByRole('button', { name: 'Rolle ändern' }))
}

function viele(anzahl: number): BenutzerEintrag[] {
  return Array.from({ length: anzahl }, (_, i) =>
    testBenutzerEintrag({
      id: `0199a1b2-0000-7000-8000-${String(i + 1).padStart(12, 'd')}`,
      name: `Person ${String(i + 1).padStart(3, '0')}`,
      email: `person${i + 1}@test.local`,
    }),
  )
}

// ---------- AK-26: Laden, Tabelle, Statusmeldung ----------

describe('Laden', () => {
  it('zeigt während des Ladens „Benutzer werden geladen …“ als Status', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/benutzer$/, offen.promise)
    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.laden)?.getAttribute('role')).toBe('status'))
  })

  it('lädt die erste Seite mit 25 Einträgen ohne Suche', async () => {
    zeige()
    await tabelle()

    const query = listenAbrufe()[0].query
    expect(query.get('seite')).toBe('1')
    expect(query.get('groesse')).toBe('25')
    expect(query.get('suche') ?? '').toBe('')
  })

  it('meldet „{n} Benutzer gefunden“ als Status', async () => {
    zeige()
    await tabelle()

    await waitFor(() => expect(meldungMit('4 Benutzer gefunden')?.getAttribute('role')).toBe('status'))
  })

  it('zeigt einen Ladefehler als Alarm', async () => {
    api.einmal('GET', /^\/api\/benutzer$/, problemAntwort(500))
    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.ladeFehler)?.getAttribute('role')).toBe('alert'))
  })

  it('zeigt einen Ladefehler auch bei einem Netzwerkfehler', async () => {
    api.netzwerkfehler('GET', /^\/api\/benutzer$/)
    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.ladeFehler)?.getAttribute('role')).toBe('alert'))
  })
})

describe('Tabelle', () => {
  it('hat die Beschriftung „Benutzer“', async () => {
    zeige()

    expect(await tabelle()).toBeInTheDocument()
  })

  it('hat die Spalten Name, E-Mail, Rolle, Status, Aktion', async () => {
    zeige()

    const kopf = within(await tabelle()).getAllByRole('columnheader')
    expect(kopf.map((k) => k.textContent?.trim())).toEqual(['Name', 'E-Mail', 'Rolle', 'Status', 'Aktion'])
  })

  it('zeigt je Benutzer Name und E-Mail', async () => {
    zeige()
    await tabelle()

    expect(within(zeileVon('Anna Probe')).getByText('anna@test.local')).toBeInTheDocument()
  })

  it('zeigt die Benutzer in der Reihenfolge der API', async () => {
    zeige()
    const zeilen = within(await tabelle())
      .getAllByRole('row')
      .slice(1)

    expect(zeilen.map((z) => within(z).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringContaining('Anna Probe'),
      expect.stringContaining('Bert Beispiel'),
      expect.stringContaining('Carla Muster'),
      expect.stringContaining('Test Administrator'),
    ])
  })

  it('zeigt den Status als Badge „Aktiv“ bzw. „Deaktiviert“', async () => {
    zeige()
    await tabelle()

    expect(within(zeileVon('Anna Probe')).getByText('Aktiv')).toBeInTheDocument()
    expect(within(zeileVon('Carla Muster')).getByText('Deaktiviert')).toBeInTheDocument()
  })

  it('zeigt die Rolle im Select je Zeile', async () => {
    zeige()
    await tabelle()

    expect(rollenAuswahl('Bert Beispiel')).toHaveTextContent('Sachbearbeiter')
    expect(rollenAuswahl('Anna Probe')).toHaveTextContent('Keine Rolle')
  })

  it('bietet „Deaktivieren“ für aktive und „Reaktivieren“ für deaktivierte Benutzer', async () => {
    zeige()
    await tabelle()

    expect(screen.getByRole('button', { name: 'Anna Probe deaktivieren' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carla Muster reaktivieren' })).toBeInTheDocument()
  })
})

// ---------- AK-26: Suche ----------

describe('Suche', () => {
  it('hat ein Suchfeld vom Typ search mit dem Label „Benutzer suchen“', async () => {
    zeige()
    await tabelle()

    expect(suchfeld()).toHaveAttribute('type', 'search')
  })

  it('sucht per Button „Suchen“ mit dem eingegebenen Text', async () => {
    const { user } = zeige()
    await tabelle()

    await user.type(suchfeld(), 'bert')
    await user.click(screen.getByRole('button', { name: 'Suchen' }))

    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('suche')).toBe('bert'))
  })

  it('sucht per Enter im Suchfeld', async () => {
    const { user } = zeige()
    await tabelle()

    await user.type(suchfeld(), 'carla{Enter}')

    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('suche')).toBe('carla'))
  })

  it('sucht nicht schon bei jeder Eingabe', async () => {
    const { user } = zeige()
    await tabelle()
    const vorher = listenAbrufe().length

    await user.type(suchfeld(), 'ann')

    expect(listenAbrufe()).toHaveLength(vorher)
  })

  it('zeigt nach der Suche nur die Treffer', async () => {
    const { user } = zeige()
    await tabelle()

    await user.type(suchfeld(), 'bert{Enter}')

    await waitFor(() => expect(screen.queryByText('Anna Probe')).not.toBeInTheDocument())
    expect(screen.getByText('Bert Beispiel')).toBeInTheDocument()
  })

  it('meldet nach der Suche die Trefferzahl', async () => {
    const { user } = zeige()
    await tabelle()

    await user.type(suchfeld(), 'bert{Enter}')

    await waitFor(() => expect(meldungMit('1 Benutzer gefunden')).toBeDefined())
  })

  it('meldet „0 Benutzer gefunden“, wenn nichts passt', async () => {
    const { user } = zeige()
    await tabelle()

    await user.type(suchfeld(), 'gibt-es-nicht{Enter}')

    await waitFor(() => expect(meldungMit('0 Benutzer gefunden')).toBeDefined())
  })

  it('beginnt eine neue Suche auf Seite 1', async () => {
    starte(viele(30))
    const { user } = zeige()
    await tabelle()
    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))
    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('seite')).toBe('2'))

    await user.type(suchfeld(), 'Person{Enter}')

    await waitFor(() => expect(listenAbrufe().at(-1)?.query.get('suche')).toBe('Person'))
    expect(listenAbrufe().at(-1)?.query.get('seite')).toBe('1')
  })
})

// ---------- AK-26: Blättern ----------

describe('Blättern', () => {
  beforeEach(() => {
    starte(viele(30))
  })

  it('zeigt „Seite 1 von 2“', async () => {
    zeige()
    await tabelle()

    expect(await screen.findByText('Seite 1 von 2')).toBeInTheDocument()
  })

  it('sperrt „Vorherige Seite“ auf der ersten Seite', async () => {
    zeige()
    await screen.findByText('Seite 1 von 2')

    expect(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nächste Seite' })).toBeEnabled()
  })

  it('lädt per „Nächste Seite“ Seite 2', async () => {
    const { user } = zeige()
    await screen.findByText('Seite 1 von 2')

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    expect(await screen.findByText('Seite 2 von 2')).toBeInTheDocument()
    expect(listenAbrufe().at(-1)?.query.get('seite')).toBe('2')
    expect(screen.getByText('Person 026')).toBeInTheDocument()
  })

  it('sperrt „Nächste Seite“ auf der letzten Seite', async () => {
    const { user } = zeige()
    await screen.findByText('Seite 1 von 2')

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))
    await screen.findByText('Seite 2 von 2')

    expect(screen.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeEnabled()
  })

  it('kehrt per „Vorherige Seite“ zu Seite 1 zurück', async () => {
    const { user } = zeige()
    await screen.findByText('Seite 1 von 2')
    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))
    await screen.findByText('Seite 2 von 2')

    await user.click(screen.getByRole('button', { name: 'Vorherige Seite' }))

    expect(await screen.findByText('Seite 1 von 2')).toBeInTheDocument()
  })

  it('sperrt bei nur einer Seite beide Buttons', async () => {
    starte([ANNA])
    zeige()
    await tabelle()

    expect(await screen.findByText('Seite 1 von 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vorherige Seite' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
  })
})

// ---------- AK-29: eigene Zeile ----------

describe('eigene Zeile', () => {
  it('kennzeichnet den eigenen Namen mit „(Sie)“', async () => {
    zeige()
    await tabelle()

    expect(zeileVon('Test Administrator')).toHaveTextContent('(Sie)')
  })

  it('kennzeichnet andere Zeilen nicht mit „(Sie)“', async () => {
    zeige()
    await tabelle()

    expect(zeileVon('Anna Probe')).not.toHaveTextContent('(Sie)')
  })

  it('sperrt das eigene Rollen-Select', async () => {
    zeige()
    await tabelle()

    expect(rollenAuswahl('Test Administrator')).toBeDisabled()
  })

  it('sperrt den eigenen Status-Button', async () => {
    zeige()
    await tabelle()

    expect(screen.getByRole('button', { name: 'Test Administrator deaktivieren' })).toBeDisabled()
  })

  it('beschreibt das gesperrte Select mit „Das eigene Konto kann nicht geändert werden.“', async () => {
    zeige()
    await tabelle()

    expect(rollenAuswahl('Test Administrator')).toHaveAccessibleDescription(TEXTE.eigenesKontoHinweis)
  })

  it('beschreibt den gesperrten Status-Button mit „Das eigene Konto kann nicht geändert werden.“', async () => {
    zeige()
    await tabelle()

    expect(screen.getByRole('button', { name: 'Test Administrator deaktivieren' })).toHaveAccessibleDescription(
      TEXTE.eigenesKontoHinweis,
    )
  })

  it('lässt fremde Zeilen bedienbar', async () => {
    zeige()
    await tabelle()

    expect(rollenAuswahl('Anna Probe')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Anna Probe deaktivieren' })).toBeEnabled()
  })

  it('richtet sich nach aktuellerBenutzerId und nicht nach der Rolle', async () => {
    zeige(ANNA.id)
    await tabelle()

    expect(rollenAuswahl('Anna Probe')).toBeDisabled()
    expect(rollenAuswahl('Test Administrator')).toBeEnabled()
  })
})

// ---------- AK-27, AK-28: Erfolg ----------

describe('Änderungen', () => {
  it('meldet eine Rollenänderung als Status „Die Rolle von {Name} wurde auf {neu} geändert.“', async () => {
    const { user } = zeige()
    await tabelle()

    await waehleRolle(user, 'Anna Probe', 'Betrachter')
    await bestaetigeRolle(user)

    await waitFor(() =>
      expect(meldungMit('Die Rolle von Anna Probe wurde auf Betrachter geändert.')?.getAttribute('role')).toBe(
        'status',
      ),
    )
  })

  it('meldet „Keine Rolle“ mit dem deutschen Namen', async () => {
    const { user } = zeige()
    await tabelle()

    await waehleRolle(user, 'Bert Beispiel', 'Keine Rolle')
    await bestaetigeRolle(user)

    await waitFor(() => expect(meldungMit('Die Rolle von Bert Beispiel wurde auf Keine Rolle geändert.')).toBeDefined())
  })

  it('zeigt nach der Rollenänderung die neue Rolle in der Zeile', async () => {
    const { user } = zeige()
    await tabelle()

    await waehleRolle(user, 'Anna Probe', 'Betrachter')
    await bestaetigeRolle(user)

    await waitFor(() => expect(rollenAuswahl('Anna Probe')).toHaveTextContent('Betrachter'))
  })

  it('zeigt nach dem Deaktivieren das Badge „Deaktiviert“ und „Reaktivieren“', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Anna Probe deaktivieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
    await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }))

    expect(await screen.findByRole('button', { name: 'Anna Probe reaktivieren' })).toBeInTheDocument()
    expect(within(zeileVon('Anna Probe')).getByText('Deaktiviert')).toBeInTheDocument()
  })

  it('zeigt nach dem Reaktivieren das Badge „Aktiv“ und „Deaktivieren“', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Carla Muster reaktivieren' }))

    expect(await screen.findByRole('button', { name: 'Carla Muster deaktivieren' })).toBeInTheDocument()
    expect(within(zeileVon('Carla Muster')).getByText('Aktiv')).toBeInTheDocument()
  })
})

// ---------- AK-30: Fehler aus Rolle oder Status ----------

describe('Fehler beim Ändern', () => {
  async function rolleAendernMit(antwort: Response | Promise<Response>) {
    api.einmal('PUT', /\/rolle$/, antwort)
    const ergebnis = zeige()
    await tabelle()
    await waehleRolle(ergebnis.user, 'Bert Beispiel', 'Betrachter')
    await bestaetigeRolle(ergebnis.user)
    return ergebnis
  }

  it('meldet 409 letzter_administrator als Alarm', async () => {
    await rolleAendernMit(konfliktAntwort('letzter_administrator'))

    await waitFor(() => expect(meldungMit(TEXTE.letzterAdmin)?.getAttribute('role')).toBe('alert'))
  })

  it('meldet 409 eigenes_konto als Alarm', async () => {
    await rolleAendernMit(konfliktAntwort('eigenes_konto'))

    await waitFor(() => expect(meldungMit(TEXTE.eigenesKonto)?.getAttribute('role')).toBe('alert'))
  })

  it('meldet 404 als Alarm „Der Benutzer wurde nicht gefunden.“', async () => {
    await rolleAendernMit(problemAntwort(404, { title: 'Benutzer nicht gefunden' }))

    await waitFor(() => expect(meldungMit(TEXTE.nichtGefunden)?.getAttribute('role')).toBe('alert'))
  })

  it('meldet 403 keine_berechtigung als Alarm', async () => {
    await rolleAendernMit(keinZugriffAntwort('keine_berechtigung'))

    await waitFor(() => expect(meldungMit(TEXTE.keineBerechtigung)?.getAttribute('role')).toBe('alert'))
  })

  it('meldet einen Serverfehler allgemein als Alarm', async () => {
    await rolleAendernMit(problemAntwort(500))

    await waitFor(() => expect(meldungMit(TEXTE.allgemein)?.getAttribute('role')).toBe('alert'))
  })

  it('zeigt nach einem Fehler wieder die Rolle laut Server', async () => {
    await rolleAendernMit(konfliktAntwort('letzter_administrator'))
    await waitFor(() => expect(meldungMit(TEXTE.letzterAdmin)).toBeDefined())

    expect(rollenAuswahl('Bert Beispiel')).toHaveTextContent('Sachbearbeiter')
  })

  it('meldet nach einem Fehler keinen Erfolg', async () => {
    await rolleAendernMit(konfliktAntwort('letzter_administrator'))
    await waitFor(() => expect(meldungMit(TEXTE.letzterAdmin)).toBeDefined())

    expect(meldungMit('wurde auf Betrachter geändert')).toBeUndefined()
  })

  it('meldet einen Fehler beim Deaktivieren als Alarm', async () => {
    api.einmal('PUT', /\/status$/, konfliktAntwort('letzter_administrator'))
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Anna Probe deaktivieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
    await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }))

    await waitFor(() => expect(meldungMit(TEXTE.letzterAdmin)?.getAttribute('role')).toBe('alert'))
    expect(within(zeileVon('Anna Probe')).getByText('Aktiv')).toBeInTheDocument()
  })

  it('zeigt keine technischen Details (Statuscodes, code-Werte)', async () => {
    await rolleAendernMit(konfliktAntwort('letzter_administrator'))
    await waitFor(() => expect(meldungMit(TEXTE.letzterAdmin)).toBeDefined())

    expect(document.body.textContent).not.toMatch(/409|letzter_administrator|Conflict/)
  })
})

// ---------- AK-35: deutsche Texte ----------

describe('deutsche Texte', () => {
  // „Name“ und „Status“ sind auch deutsche Spaltentitel und fehlen deshalb in der Liste.
  const ENGLISCH =
    /\b(Search|Loading|Error|Previous|Next|Page|Role|Action|Active|Inactive|Deactivate|Reactivate|You|Select|Close)\b/

  function alleTexte(): string {
    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    return [document.body.textContent ?? '', ...attribute].join(' ')
  }

  it('enthält keine englischen Texte (auch nicht in aria-label und Platzhaltern)', async () => {
    zeige()
    await tabelle()

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('enthält auch mit Fehlermeldung keine englischen Texte', async () => {
    api.einmal('GET', /^\/api\/benutzer$/, problemAntwort(500))
    zeige()
    await waitFor(() => expect(meldungMit(TEXTE.ladeFehler)).toBeDefined())

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})
