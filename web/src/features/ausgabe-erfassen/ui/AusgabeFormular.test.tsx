import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import {
  ausgabeKonfliktAntwort,
  erstelleFakeApi,
  jsonAntwort,
  keinZugriffAntwort,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { gibEin, meldungMit, seitentext } from '../../../../test/hilfen'
import { AusgabeFormular } from '../index'

// Feature coin-ausgaben, AK-27 bis AK-29 und AK-30: Formular „Ausgabe erfassen“.
// Props { coin, kennzahlen, onErfasst(ausgabe) }; die Seite (pages/ausgabe-erfassen) navigiert nach onErfasst.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const POST = /^\/api\/coins\/[^/]+\/ausgaben$/
const coin = testCoin({ id: COIN_ID, auflage: 150 })
const kennzahlen = { auflage: 150, ausgegeben: 3, verfuegbar: 147 }

let api: FakeApi
let onErfasst: ReturnType<typeof vi.fn<(ausgabe: Ausgabe) => void>>

beforeEach(() => {
  // Nur Date wird vorgestellt (2026-10-08 11:00 in Berlin); Timer und Promises laufen normal.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
  api = erstelleFakeApi([coin])
  vi.stubGlobal('fetch', api.fetch)
  onErfasst = vi.fn<(ausgabe: Ausgabe) => void>()
})

afterEach(() => {
  vi.useRealTimers()
})

function zeige() {
  const user = userEvent.setup()
  render(<AusgabeFormular coin={coin} kennzahlen={kennzahlen} onErfasst={onErfasst} />)
  return { user }
}

function felder() {
  return {
    naechste: screen.getByRole('radio', { name: 'Nächstes freies Exemplar' }),
    bestimmte: screen.getByRole('radio', { name: 'Bestimmte Nummer' }),
    nummer: screen.getByLabelText(/^Exemplar-Nummer/) as HTMLInputElement,
    name: screen.getByLabelText(/^Name des Empfängers/) as HTMLInputElement,
    dienstgrad: screen.getByLabelText(/^Dienstgrad/) as HTMLInputElement,
    dienststelle: screen.getByLabelText(/^Dienststelle/) as HTMLInputElement,
    datum: screen.getByLabelText(/^Datum/) as HTMLInputElement,
    gelegenheit: screen.getByLabelText(/^Gelegenheit/) as HTMLInputElement,
    begruendung: screen.getByLabelText(/^Begründung/) as HTMLTextAreaElement,
    stelle: screen.getByLabelText(/^Ausgebende Stelle oder Person/) as HTMLInputElement,
    speichern: screen.getByRole('button', { name: 'Ausgabe speichern' }) as HTMLButtonElement,
  }
}

async function fuellePflichtfelder(user: ReturnType<typeof userEvent.setup>) {
  const f = felder()
  await gibEin(user, f.name, 'Max Beispiel')
  await gibEin(user, f.gelegenheit, 'Truppenbesuch')
  await gibEin(user, f.begruendung, 'Herausragende Leistung')
  await gibEin(user, f.stelle, 'Kommandeur Beispielbataillon 1')
}

/** Text der per aria-describedby verbundenen Elemente. */
function beschreibung(feld: HTMLElement): string {
  return (feld.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

// ---------- AK-27: Aufbau ----------

describe('Aufbau', () => {
  it('besteht aus genau einem Formular', () => {
    zeige()

    expect(document.querySelectorAll('form')).toHaveLength(1)
  })

  it('gruppiert die Exemplar-Wahl in einem fieldset mit der legend „Exemplar“', () => {
    zeige()

    const legend = [...document.querySelectorAll('fieldset > legend')].find((l) => l.textContent?.trim() === 'Exemplar')
    expect(legend).toBeDefined()
    expect(legend?.parentElement).toContainElement(felder().naechste)
  })

  it('wählt standardmäßig „Nächstes freies Exemplar“', () => {
    zeige()

    expect(felder().naechste).toBeChecked()
    expect(felder().bestimmte).not.toBeChecked()
  })

  it('deaktiviert die Exemplar-Nummer, solange „Nächstes freies Exemplar“ gewählt ist', () => {
    zeige()

    expect(felder().nummer).toBeDisabled()
  })

  it('kennzeichnet die Exemplar-Nummer bei „Bestimmte Nummer“ als Pflichtfeld', async () => {
    const { user } = zeige()

    await user.click(felder().bestimmte)

    expect(felder().nummer).toHaveAccessibleName(/Pflichtfeld/)
  })

  it('kennzeichnet die Exemplar-Nummer bei „Nächstes freies Exemplar“ nicht als Pflichtfeld', () => {
    zeige()

    expect(felder().nummer).not.toHaveAccessibleName(/Pflichtfeld/)
  })

  it('aktiviert die Exemplar-Nummer bei „Bestimmte Nummer“', async () => {
    const { user } = zeige()

    await user.click(felder().bestimmte)

    expect(felder().nummer).toBeEnabled()
  })

  it('begrenzt die Exemplar-Nummer auf 1 bis Auflage', () => {
    zeige()

    expect(felder().nummer).toHaveAttribute('type', 'number')
    expect(felder().nummer).toHaveAttribute('min', '1')
    expect(felder().nummer).toHaveAttribute('max', '150')
  })

  it('hat ein Datumsfeld mit heute als Standard und Maximum (Europe/Berlin)', () => {
    zeige()

    expect(felder().datum).toHaveAttribute('type', 'date')
    expect(felder().datum.value).toBe('2026-10-08')
    expect(felder().datum).toHaveAttribute('max', '2026-10-08')
  })

  it('nimmt für „heute“ den Tag in Berlin, auch kurz vor Mitternacht UTC', () => {
    vi.setSystemTime(new Date('2026-10-08T23:30:00Z'))
    zeige()

    expect(felder().datum.value).toBe('2026-10-09')
  })

  it('hat für die Begründung ein mehrzeiliges Feld', () => {
    zeige()

    expect(felder().begruendung.tagName).toBe('TEXTAREA')
  })

  it('verbindet den Hinweis „z. B. Truppenbesuch, Verabschiedung“ mit dem Feld Gelegenheit', () => {
    zeige()

    expect(felder().gelegenheit).toHaveAccessibleDescription(/z\. B\. Truppenbesuch, Verabschiedung/)
  })

  it.each(['name', 'datum', 'gelegenheit', 'begruendung', 'stelle'] as const)(
    'kennzeichnet %s im Label als Pflichtfeld',
    (feld) => {
      zeige()

      expect(felder()[feld]).toHaveAccessibleName(/Pflichtfeld/)
    },
  )

  it.each(['dienstgrad', 'dienststelle'] as const)('kennzeichnet %s nicht als Pflichtfeld', (feld) => {
    zeige()

    expect(felder()[feld]).not.toHaveAccessibleName(/Pflichtfeld/)
  })
})

// ---------- AK-27/AK-28: Absenden ----------

describe('Absenden', () => {
  it('sendet bei „Nächstes freies Exemplar“ exemplarNummer null und leere optionale Felder als null', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
    expect(api.anfragenMit('POST', POST)[0].body).toEqual({
      exemplarNummer: null,
      empfaengerName: 'Max Beispiel',
      empfaengerDienstgrad: null,
      empfaengerDienststelle: null,
      datum: '2026-10-08',
      gelegenheit: 'Truppenbesuch',
      begruendung: 'Herausragende Leistung',
      ausgebendeStelle: 'Kommandeur Beispielbataillon 1',
    })
  })

  it('sendet bei „Bestimmte Nummer“ die Nummer als Zahl', async () => {
    const { user } = zeige()
    await user.click(felder().bestimmte)
    await user.type(felder().nummer, '12')
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
    expect((api.anfragenMit('POST', POST)[0].body as { exemplarNummer: unknown }).exemplarNummer).toBe(12)
  })

  it('sendet Dienstgrad und Dienststelle, wenn sie ausgefüllt sind', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)
    await gibEin(user, felder().dienstgrad, 'Hauptmann')
    await gibEin(user, felder().dienststelle, 'Beispielbataillon 1')

    await user.click(felder().speichern)

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
    expect(api.anfragenMit('POST', POST)[0].body).toMatchObject({
      empfaengerDienstgrad: 'Hauptmann',
      empfaengerDienststelle: 'Beispielbataillon 1',
    })
  })

  it('sendet mit Enter in einem Textfeld', async () => {
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.type(felder().name, '{Enter}')

    await waitFor(() => expect(api.anfragenMit('POST', POST)).toHaveLength(1))
  })

  it('ruft onErfasst mit der Ausgabe aus der Antwort auf', async () => {
    const ausgabe = testAusgabe({ exemplarNummer: 4 })
    api.einmal('POST', POST, jsonAntwort(201, ausgabe))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => expect(onErfasst).toHaveBeenCalledWith(ausgabe))
  })

  it('sendet bei doppeltem Klick nur einmal (Sende-Sperre)', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)
    await user.click(felder().speichern)

    expect(api.anfragenMit('POST', POST)).toHaveLength(1)
    offen.aufloesen(jsonAntwort(201, testAusgabe()))
    await waitFor(() => expect(onErfasst).toHaveBeenCalled())
  })

  it('sperrt den Button während des Sendens', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', POST, () => offen.promise)
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => {
      const knopf = felder().speichern
      expect(knopf.disabled || knopf.getAttribute('aria-disabled') === 'true').toBe(true)
    })
    offen.aufloesen(jsonAntwort(201, testAusgabe()))
    await waitFor(() => expect(onErfasst).toHaveBeenCalled())
  })
})

// ---------- AK-27: clientseitige Prüfung ----------

describe('clientseitige Prüfung', () => {
  it('sendet ohne Pflichtfelder nichts', async () => {
    const { user } = zeige()

    await user.click(felder().speichern)

    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('zeigt den Fehler am Feld mit aria-invalid und aria-describedby', async () => {
    const { user } = zeige()

    await user.click(felder().speichern)

    const name = felder().name
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(beschreibung(name)).toContain('Name des Empfängers ist erforderlich.')
  })

  it('zeigt alle Fehler gleichzeitig mit den Texten aus AK-7', async () => {
    const { user } = zeige()
    await user.clear(felder().datum)

    await user.click(felder().speichern)

    const f = felder()
    expect(beschreibung(f.datum)).toContain('Datum ist erforderlich.')
    expect(beschreibung(f.gelegenheit)).toContain('Gelegenheit ist erforderlich.')
    expect(beschreibung(f.begruendung)).toContain('Begründung ist erforderlich.')
    expect(beschreibung(f.stelle)).toContain('Ausgebende Stelle ist erforderlich.')
  })

  it('setzt beim Absenden den Fokus auf das erste fehlerhafte Feld', async () => {
    const { user } = zeige()
    await gibEin(user, felder().name, 'Max Beispiel')

    await user.click(felder().speichern)

    expect(felder().gelegenheit).toHaveFocus()
  })

  it('verlangt bei „Bestimmte Nummer“ die Exemplar-Nummer und fokussiert sie zuerst', async () => {
    const { user } = zeige()
    await user.click(felder().bestimmte)
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    expect(felder().nummer).toHaveAttribute('aria-invalid', 'true')
    expect(felder().nummer).toHaveFocus()
    expect(api.anfragenMit('POST')).toHaveLength(0)
  })

  it('meldet eine Nummer über der Auflage mit dem Text aus AK-7', async () => {
    const { user } = zeige()
    await user.click(felder().bestimmte)
    await user.type(felder().nummer, '151')
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    expect(beschreibung(felder().nummer)).toContain('Exemplar-Nummer muss zwischen 1 und 150 liegen.')
  })
})

// ---------- AK-29: Fehler vom Server ----------

describe('Fehler vom Server', () => {
  it('zeigt 400 als Feldfehler', async () => {
    api.einmal(
      'POST',
      POST,
      problemAntwort(400, {
        title: 'Eingaben ungültig',
        errors: { datum: ['Das Datum darf nicht in der Zukunft liegen.'] },
      }),
    )
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => expect(felder().datum).toHaveAttribute('aria-invalid', 'true'))
    expect(beschreibung(felder().datum)).toContain('Das Datum darf nicht in der Zukunft liegen.')
  })

  it('zeigt 409 exemplar_ausgegeben am Feld „Exemplar-Nummer“', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('exemplar_ausgegeben', 'Exemplar Nr. 12 ist bereits ausgegeben.'))
    const { user } = zeige()
    await user.click(felder().bestimmte)
    await user.type(felder().nummer, '12')
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() => expect(felder().nummer).toHaveAttribute('aria-invalid', 'true'))
    expect(beschreibung(felder().nummer)).toMatch(/Exemplar Nr\. 12 ist bereits ausgegeben\./)
  })

  it('zeigt 409 kein_exemplar_frei als Alarm', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('kein_exemplar_frei'))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() =>
      expect(meldungMit('Alle Exemplare dieses Coins sind ausgegeben.')?.getAttribute('role')).toBe('alert'),
    )
  })

  it('zeigt 409 auflage_unbekannt als Alarm', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('auflage_unbekannt'))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await waitFor(() =>
      expect(meldungMit('Für diesen Coin ist keine Auflage erfasst.')?.getAttribute('role')).toBe('alert'),
    )
  })

  it('behält die Eingaben nach einem Fehler', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('kein_exemplar_frei'))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await screen.findByRole('alert')
    expect([felder().name.value, felder().gelegenheit.value, felder().begruendung.value]).toEqual([
      'Max Beispiel',
      'Truppenbesuch',
      'Herausragende Leistung',
    ])
  })

  it('ruft onErfasst bei einem Fehler nicht auf', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('kein_exemplar_frei'))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await screen.findByRole('alert')
    expect(onErfasst).not.toHaveBeenCalled()
  })

  it('zeigt 403 als Alarm „nicht berechtigt“', async () => {
    api.einmal('POST', POST, keinZugriffAntwort('keine_berechtigung'))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    expect((await screen.findByRole('alert')).textContent).toMatch(/nicht berechtigt/)
  })

  it('zeigt 403 deaktiviert als Alarm „Ihr Benutzerkonto ist deaktiviert.“', async () => {
    api.einmal('POST', POST, keinZugriffAntwort('benutzer_deaktiviert'))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    expect((await screen.findByRole('alert')).textContent).toContain('Ihr Benutzerkonto ist deaktiviert.')
  })

  it('zeigt 401 als Alarm zur abgelaufenen Anmeldung', async () => {
    api.einmal('POST', POST, problemAntwort(401))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    expect((await screen.findByRole('alert')).textContent).toMatch(/Anmeldung/)
  })

  it('gibt den Button nach einem Fehler wieder frei', async () => {
    api.einmal('POST', POST, ausgabeKonfliktAntwort('kein_exemplar_frei'))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await screen.findByRole('alert')
    expect(felder().speichern).toBeEnabled()
  })

  it('zeigt keine technischen Details', async () => {
    api.einmal('POST', POST, problemAntwort(500, { detail: 'NpgsqlException: 23505' }))
    const { user } = zeige()
    await fuellePflichtfelder(user)

    await user.click(felder().speichern)

    await screen.findByRole('alert')
    expect(seitentext()).not.toMatch(/Npgsql|23505|500|TypeError/)
  })
})

// ---------- AK-30: Tastatur und deutsche Texte ----------

describe('Barrierefreiheit', () => {
  it('wechselt die Exemplar-Wahl mit den Pfeiltasten', async () => {
    const { user } = zeige()
    felder().naechste.focus()

    await user.keyboard('{ArrowDown}')

    expect(felder().bestimmte).toBeChecked()
    expect(felder().nummer).toBeEnabled()
  })

  it('erreicht nach der Radio-Gruppe per Tab die Exemplar-Nummer, wenn sie aktiv ist', async () => {
    const { user } = zeige()
    await user.click(felder().bestimmte)

    await user.tab()

    expect(felder().nummer).toHaveFocus()
  })

  it('enthält keine englischen Texte', () => {
    zeige()

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([seitentext(), ...attribute].join(' ')).not.toMatch(
      /\b(Save|Submit|Cancel|Required|Recipient|Date|Reason|Next|Number|Loading|Error)\b/,
    )
  })
})
