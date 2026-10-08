import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { erstelleFakeApi, offeneAntwort, problemAntwort, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { meldungMit, seitentext } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { CoinDetailSeite, type CoinDetailSeiteProps } from '../index'

// Feature katalog-seiten, AK-17 bis AK-20, AK-22, AK-26: Detailseite /coins/{id}.
// Die Seite bekommt coinId (und nach dem Anlegen die Meldung) als Props von der Route; sie nutzt keine Router-Hooks.
// Geändert durch coin-ausgaben (AK-20 bis AK-25, AK-28): Der Platzhalter „Verleihungen“ (katalog-seiten AK-19) entfällt;
// neue Props berechtigungen { exemplare, historie, erfassen, auflage }, status, seite, onStatus, onSeite und die
// Meldung { art: 'ausgabeErfasst', nummer }. Ohne Berechtigungen (anonym) sieht die Seite aus wie bisher.

const ID = '0199a1b2-0000-7000-8000-0000000000d1'
const TEXTE = {
  laden: 'Coin wird geladen …',
  nichtGefunden: 'Diesen Coin gibt es nicht im Katalog.',
  fehler: 'Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.',
  angelegt: 'Coin wurde angelegt.',
  ohneBild: 'Coin wurde ohne Motivbild angelegt.',
  keinBild: 'Kein Motivbild vorhanden.',
  keineBeschreibung: 'Keine Beschreibung',
} as const

let api: FakeApi

function starte(coin: Coin | null = testCoin({ id: ID })) {
  api = erstelleFakeApi(coin ? [coin] : [])
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte()
})

const KEINE_RECHTE: CoinDetailSeiteProps['berechtigungen'] = {
  exemplare: false,
  historie: false,
  erfassen: false,
  auflage: false,
}

/** Berechtigungsstufen laut Rechtematrix (ADR-0021): anonym/ohne Rolle, Betrachter, Sachbearbeiter/Administrator. */
const STUFEN = {
  anonym: KEINE_RECHTE,
  betrachter: { exemplare: true, historie: false, erfassen: false, auflage: false },
  sachbearbeiter: { exemplare: true, historie: true, erfassen: true, auflage: true },
} satisfies Record<string, CoinDetailSeiteProps['berechtigungen']>

function zeige(props: Partial<CoinDetailSeiteProps> = {}) {
  const user = userEvent.setup()
  const { router } = zeigeMitRouter(
    () => (
      <CoinDetailSeite
        coinId={ID}
        berechtigungen={KEINE_RECHTE}
        seite={1}
        onStatus={() => {}}
        onSeite={() => {}}
        {...props}
      />
    ),
    {
      pfad: '/coins/$coinId',
      start: `/coins/${props.coinId ?? ID}`,
    },
  )
  return { user, router }
}

async function ueberschrift(name: string): Promise<HTMLElement> {
  return screen.findByRole('heading', { level: 1, name })
}

/** Wert zu einem Begriff der Beschreibungsliste (<dt> → folgendes <dd>). */
function wertZu(begriff: string): HTMLElement {
  const dt = [...document.querySelectorAll('dl dt')].find((el) => el.textContent?.trim() === begriff)
  expect(dt, `Begriff „${begriff}“ fehlt in der Beschreibungsliste`).toBeDefined()
  let dd = dt?.nextElementSibling ?? null
  while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling
  expect(dd).not.toBeNull()
  return dd as HTMLElement
}

// ---------- AK-17: Laden, 404, Fehler ----------

describe('Laden', () => {
  it('zeigt während des Ladens „Coin wird geladen …“ als Status', async () => {
    const offen = offeneAntwort()
    api.einmal('GET', /^\/api\/coins\/[^/]+$/, () => offen.promise)

    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.laden)?.getAttribute('role')).toBe('status'))
    offen.aufloesen(problemAntwort(404))
  })

  it('lädt GET /api/coins/{id} genau einmal', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${ID}`])
  })

  it('blendet den Ladehinweis nach dem Laden aus', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    expect(screen.queryByText(TEXTE.laden)).not.toBeInTheDocument()
  })
})

describe('404', () => {
  beforeEach(() => {
    starte(null)
  })

  it('zeigt die Überschrift „Coin nicht gefunden“', async () => {
    zeige()

    expect(await ueberschrift('Coin nicht gefunden')).toBeInTheDocument()
  })

  it('zeigt den Text „Diesen Coin gibt es nicht im Katalog.“', async () => {
    zeige()
    await ueberschrift('Coin nicht gefunden')

    expect(screen.getByText(TEXTE.nichtGefunden)).toBeInTheDocument()
  })

  it('verlinkt „Zum Katalog“ auf /coins', async () => {
    zeige()
    await ueberschrift('Coin nicht gefunden')

    expect(screen.getByRole('link', { name: 'Zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeige()
    await ueberschrift('Coin nicht gefunden')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('zeigt keinen Fehleralarm und keine Abschnitte „Exemplare“ oder „Ausgabehistorie“', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await ueberschrift('Coin nicht gefunden')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Exemplare' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ausgabehistorie' })).not.toBeInTheDocument()
  })
})

describe('sonstige Fehler', () => {
  it('zeigt bei 500 den Alarm „Der Coin konnte nicht geladen werden. …“', async () => {
    api.einmal('GET', /^\/api\/coins\/[^/]+$/, problemAntwort(500, { detail: 'NpgsqlException: Zeitüberschreitung' }))

    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.fehler)?.getAttribute('role')).toBe('alert'))
  })

  it('zeigt bei einem Netzwerkfehler denselben Alarm', async () => {
    api.netzwerkfehler('GET', /^\/api\/coins\/[^/]+$/)

    zeige()

    await waitFor(() => expect(meldungMit(TEXTE.fehler)?.getAttribute('role')).toBe('alert'))
  })

  it('zeigt keine technischen Details', async () => {
    api.einmal('GET', /^\/api\/coins\/[^/]+$/, problemAntwort(500, { detail: 'NpgsqlException: Zeitüberschreitung' }))

    zeige()

    await screen.findByText(TEXTE.fehler)
    expect(seitentext()).not.toMatch(/Npgsql|Zeitüberschreitung|500|Failed to fetch|TypeError/)
  })

  it('zeigt bei einem Fehler nicht „Coin nicht gefunden“', async () => {
    api.einmal('GET', /^\/api\/coins\/[^/]+$/, problemAntwort(500))

    zeige()

    await screen.findByText(TEXTE.fehler)
    expect(screen.queryByText('Coin nicht gefunden')).not.toBeInTheDocument()
  })
})

// ---------- AK-18: Stammdaten ----------

describe('Stammdaten', () => {
  it('zeigt den Namen als Überschrift der Ebene 1', async () => {
    starte(testCoin({ id: ID, name: 'Jubiläum Testbataillon' }))

    zeige()

    expect(await ueberschrift('Jubiläum Testbataillon')).toBeInTheDocument()
  })

  it('hat genau eine Überschrift der Ebene 1', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('macht die Überschrift per Skript fokussierbar (tabIndex -1)', async () => {
    zeige()

    expect(await ueberschrift('Coin Alpha')).toHaveAttribute('tabindex', '-1')
  })

  it('zeigt die Stammdaten in einer Beschreibungsliste', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    const begriffe = [...document.querySelectorAll('dl dt')].map((dt) => dt.textContent?.trim())
    expect(begriffe).toEqual(['Herausgeber', 'Auflage', 'Erfasst am', 'Beschreibung'])
  })

  it('zeigt den Herausgeber', async () => {
    starte(testCoin({ id: ID, herausgeber: 'Herausgeber Gamma' }))
    zeige()
    await ueberschrift('Coin Alpha')

    expect(wertZu('Herausgeber')).toHaveTextContent('Herausgeber Gamma')
  })

  it('zeigt die Auflage im deutschen Zahlenformat', async () => {
    starte(testCoin({ id: ID, auflage: 12500 }))
    zeige()
    await ueberschrift('Coin Alpha')

    expect(wertZu('Auflage')).toHaveTextContent(/^12\.500$/)
  })

  it('zeigt „unbekannt“, wenn die Auflage fehlt', async () => {
    starte(testCoin({ id: ID, auflage: null }))
    zeige()
    await ueberschrift('Coin Alpha')

    expect(wertZu('Auflage')).toHaveTextContent(/^unbekannt$/)
  })

  it('zeigt das Erfassungsdatum im deutschen Datumsformat', async () => {
    starte(testCoin({ id: ID, erstelltAm: '2026-10-05T12:00:00+00:00' }))
    zeige()
    await ueberschrift('Coin Alpha')

    expect(wertZu('Erfasst am')).toHaveTextContent(/^0?5\.10\.2026$/)
  })

  it('zeigt die Beschreibung', async () => {
    starte(testCoin({ id: ID, beschreibung: 'Gestiftet zum Jubiläum.' }))
    zeige()
    await ueberschrift('Coin Alpha')

    expect(wertZu('Beschreibung')).toHaveTextContent('Gestiftet zum Jubiläum.')
  })

  it('erhält Zeilenumbrüche der Beschreibung', async () => {
    starte(testCoin({ id: ID, beschreibung: 'Erste Zeile\nZweite Zeile' }))
    zeige()
    await ueberschrift('Coin Alpha')

    const wert = wertZu('Beschreibung')
    const mitUmbruch = wert.querySelector('br') !== null
    const mitPreLine = [wert, ...wert.querySelectorAll('*')].some(
      (el) =>
        /\bwhitespace-pre-(line|wrap)\b/.test(el.className) &&
        (el.textContent ?? '').includes('Erste Zeile\nZweite Zeile'),
    )
    expect(mitUmbruch || mitPreLine).toBe(true)
  })

  it('zeigt „Keine Beschreibung“, wenn die Beschreibung fehlt', async () => {
    starte(testCoin({ id: ID, beschreibung: null }))
    zeige()
    await ueberschrift('Coin Alpha')

    expect(wertZu('Beschreibung')).toHaveTextContent(/^Keine Beschreibung$/)
  })

  it('stellt HTML in Feldern als Text dar und führt es nicht aus', async () => {
    starte(
      testCoin({
        id: ID,
        name: '<img src=x onerror=alert(1)>',
        herausgeber: '<b>fett</b>',
        beschreibung: '<script>alert(1)</script>',
      }),
    )
    zeige()

    expect(await ueberschrift('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(wertZu('Herausgeber')).toHaveTextContent('<b>fett</b>')
    expect(wertZu('Beschreibung')).toHaveTextContent('<script>alert(1)</script>')
    expect(document.querySelector('main img, b, script')).toBeNull()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('verlinkt „Zurück zum Katalog“ auf /coins', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    expect(screen.getByRole('link', { name: 'Zurück zum Katalog' })).toHaveAttribute('href', '/coins')
  })

  it('führt über „Zurück zum Katalog“ zu /coins', async () => {
    const { user, router } = zeige()
    await ueberschrift('Coin Alpha')

    await user.click(screen.getByRole('link', { name: 'Zurück zum Katalog' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/coins'))
  })
})

// ---------- AK-18 (Entscheidung F3): Motivbild ----------

describe('Motivbild', () => {
  it('zeigt ein vorhandenes Motivbild mit der bildUrl als Quelle', async () => {
    starte(testCoin({ id: ID, bildUrl: `/api/coins/${ID}/bild?v=0123456789abcdef` }))
    zeige()

    const bild = await screen.findByRole('img', { name: 'Motiv: Coin Alpha' })
    expect(bild).toHaveAttribute('src', `/api/coins/${ID}/bild?v=0123456789abcdef`)
  })

  it('lädt das Motivbild per <img src> ohne fetch', async () => {
    starte(testCoin({ id: ID, bildUrl: `/api/coins/${ID}/bild?v=1` }))
    zeige()
    await screen.findByRole('img', { name: 'Motiv: Coin Alpha' })

    expect(api.anfragen.some((a) => a.pfad.endsWith('/bild'))).toBe(false)
  })

  it('zeigt ohne Bild „Kein Motivbild vorhanden.“ und kein img', async () => {
    starte(testCoin({ id: ID, bildUrl: null }))
    zeige()
    await ueberschrift('Coin Alpha')

    expect(screen.getByText(TEXTE.keinBild)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('zeigt mit Bild nicht „Kein Motivbild vorhanden.“', async () => {
    starte(testCoin({ id: ID, bildUrl: `/api/coins/${ID}/bild?v=1` }))
    zeige()
    await screen.findByRole('img', { name: 'Motiv: Coin Alpha' })

    expect(screen.queryByText(TEXTE.keinBild)).not.toBeInTheDocument()
  })
})

// ---------- coin-ausgaben, AK-20 bis AK-23 (ersetzt katalog-seiten AK-19, Platzhalter „Verleihungen“) ----------

const EXEMPLARE = /^\/api\/coins\/[^/]+\/exemplare$/
const AUSGABEN = /^\/api\/coins\/[^/]+\/ausgaben$/

describe('Platzhalter „Verleihungen“ entfällt (F1)', () => {
  it.each(Object.entries(STUFEN))('zeigt für %s keinen Abschnitt „Verleihungen“', async (_, berechtigungen) => {
    zeige({ berechtigungen })
    await ueberschrift('Coin Alpha')

    expect(screen.queryByRole('heading', { name: 'Verleihungen' })).not.toBeInTheDocument()
    expect(seitentext()).not.toContain('Dieser Bereich wird in einer späteren Version ergänzt.')
  })
})

describe('anonym, ohne Rolle oder deaktiviert (AK-21)', () => {
  it('zeigt keine Abschnitte „Exemplare“ und „Ausgabehistorie“', async () => {
    zeige({ berechtigungen: STUFEN.anonym })
    await ueberschrift('Coin Alpha')

    expect(screen.queryByRole('heading', { name: 'Exemplare' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ausgabehistorie' })).not.toBeInTheDocument()
  })

  it('sendet nur GET /api/coins/{id}, keinen Request auf …/exemplare oder …/ausgaben', async () => {
    zeige({ berechtigungen: STUFEN.anonym })
    await ueberschrift('Coin Alpha')
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.anfragen.map((a) => `${a.methode} ${a.pfad}`)).toEqual([`GET /api/coins/${ID}`])
  })

  it('zeigt Stammdaten wie bisher', async () => {
    zeige({ berechtigungen: STUFEN.anonym })
    await ueberschrift('Coin Alpha')

    expect(wertZu('Auflage')).toHaveTextContent('250')
  })
})

describe('Betrachter (coins.read ohne issues.read, AK-20, AK-22)', () => {
  it('zeigt den Abschnitt „Exemplare“ mit den Kennzahlen', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })

    expect(await screen.findByRole('heading', { level: 2, name: 'Exemplare' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Exemplare' })).toBeInTheDocument()
  })

  it('zeigt keinen Abschnitt „Ausgabehistorie“', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(screen.queryByRole('heading', { name: 'Ausgabehistorie' })).not.toBeInTheDocument()
  })

  it('sendet keinen Request auf …/ausgaben', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    await screen.findByRole('table', { name: 'Exemplare' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.anfragenMit('GET', AUSGABEN)).toHaveLength(0)
    expect(api.anfragenMit('GET', EXEMPLARE)).toHaveLength(1)
  })

  it('zeigt weder „Ausgabe erfassen“ noch „Auflage ändern“', async () => {
    zeige({ berechtigungen: STUFEN.betrachter })
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(screen.queryByRole('link', { name: 'Ausgabe erfassen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Auflage ändern' })).not.toBeInTheDocument()
  })
})

describe('Sachbearbeiter (alle Rechte, AK-22 bis AK-25)', () => {
  it('zeigt „Exemplare“ und „Ausgabehistorie“ als Überschriften der Ebene 2', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })

    expect(await screen.findByRole('heading', { level: 2, name: 'Exemplare' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'Ausgabehistorie' })).toBeInTheDocument()
  })

  it('lädt Exemplare und Historie je genau einmal', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await screen.findByRole('table', { name: 'Exemplare' })
    await screen.findByText('Für diesen Coin wurden noch keine Ausgaben erfasst.')

    expect(api.anfragenMit('GET', EXEMPLARE)).toHaveLength(1)
    expect(api.anfragenMit('GET', AUSGABEN)).toHaveLength(1)
  })

  it('zeigt den Link „Ausgabe erfassen“ auf /coins/{id}/ausgaben/neu', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })

    expect(await screen.findByRole('link', { name: 'Ausgabe erfassen' })).toHaveAttribute(
      'href',
      `/coins/${ID}/ausgaben/neu`,
    )
  })

  it('zeigt den Button „Auflage ändern“', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })

    expect(await screen.findByRole('button', { name: 'Auflage ändern' })).toBeInTheDocument()
  })

  it('reicht Status und Seite an die Exemplare weiter', async () => {
    starte(testCoin({ id: ID, auflage: 60 }))
    zeige({ berechtigungen: STUFEN.betrachter, status: 'verfuegbar', seite: 2 })
    await screen.findByRole('table', { name: 'Exemplare' })

    const abruf = api.anfragenMit('GET', EXEMPLARE)[0]
    expect([abruf.query.get('status'), abruf.query.get('seite')]).toEqual(['verfuegbar', '2'])
  })

  it('meldet die Filterwahl über onStatus', async () => {
    const onStatus = vi.fn()
    const { user } = zeige({ berechtigungen: STUFEN.betrachter, onStatus })
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Ausgegeben' }))

    expect(onStatus).toHaveBeenCalledWith('ausgegeben')
  })

  it('hat weiterhin genau eine Überschrift der Ebene 1', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await screen.findByRole('table', { name: 'Exemplare' })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('Auflage ändern auf der Detailseite (AK-25)', () => {
  it('lädt nach dem Speichern Stammdaten und Kennzahlen neu und meldet „Auflage wurde geändert.“', async () => {
    starte(testCoin({ id: ID, auflage: 150 }))
    const { user } = zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await screen.findByRole('table', { name: 'Exemplare' })

    await user.click(screen.getByRole('button', { name: 'Auflage ändern' }))
    const dialog = await screen.findByRole('dialog', { name: 'Auflage ändern' })
    const feld = within(dialog).getByLabelText(/^Auflage/)
    await user.clear(feld)
    await user.type(feld, '200')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(meldungMit('Auflage wurde geändert.')?.getAttribute('role')).toBe('status'))
    await waitFor(() => expect(wertZu('Auflage')).toHaveTextContent(/^200$/))
    await waitFor(() => expect(api.anfragenMit('GET', EXEMPLARE).length).toBeGreaterThanOrEqual(2))
  })
})

describe('Meldung nach dem Erfassen (AK-28)', () => {
  it('meldet „Exemplar Nr. {n} wurde ausgegeben.“ als Status', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter, meldung: { art: 'ausgabeErfasst', nummer: 12 } })
    await ueberschrift('Coin Alpha')

    await waitFor(() => expect(meldungMit('Exemplar Nr. 12 wurde ausgegeben.')?.getAttribute('role')).toBe('status'))
  })

  it('setzt den Fokus auf die Überschrift', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter, meldung: { art: 'ausgabeErfasst', nummer: 12 } })
    const h1 = await ueberschrift('Coin Alpha')

    await waitFor(() => expect(h1).toHaveFocus())
  })

  it('nennt in der Meldung keinen Empfänger', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter, meldung: { art: 'ausgabeErfasst', nummer: 12 } })
    await ueberschrift('Coin Alpha')

    const meldung = await waitFor(() => {
      const el = meldungMit('Exemplar Nr. 12 wurde ausgegeben.')
      expect(el).toBeDefined()
      return el as HTMLElement
    })
    expect(meldung.textContent?.trim()).toBe('Exemplar Nr. 12 wurde ausgegeben.')
  })
})

// ---------- AK-20: keine Bearbeiten-Elemente ----------

describe('nur Ansicht', () => {
  it('enthält kein Formular und kein Eingabefeld', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    expect(document.querySelectorAll('form, input, textarea, select')).toHaveLength(0)
  })

  it('enthält keine Bearbeiten-, Löschen- oder Upload-Bedienelemente', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    const bedienelemente = [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].map(
      (el) => el.textContent ?? '',
    )
    expect(bedienelemente.filter((text) => /bearbeiten|ändern|löschen|entfernen|hochladen|Bild/i.test(text))).toEqual(
      [],
    )
  })
})

// ---------- AK-22/AK-23: Meldung nach dem Anlegen ----------

describe('Meldung nach dem Anlegen', () => {
  it('meldet „Coin wurde angelegt.“ als Status', async () => {
    zeige({ meldung: 'mitBild' })
    await ueberschrift('Coin Alpha')

    await waitFor(() => expect(meldungMit(TEXTE.angelegt)?.getAttribute('role')).toBe('status'))
  })

  it('meldet „Coin wurde ohne Motivbild angelegt.“ als Status', async () => {
    zeige({ meldung: 'ohneBild' })
    await ueberschrift('Coin Alpha')

    await waitFor(() => expect(meldungMit(TEXTE.ohneBild)?.getAttribute('role')).toBe('status'))
    expect(seitentext()).not.toContain(TEXTE.angelegt)
  })

  it('setzt den Fokus nach dem Laden auf die Überschrift', async () => {
    zeige({ meldung: 'mitBild' })
    const h1 = await ueberschrift('Coin Alpha')

    await waitFor(() => expect(h1).toHaveFocus())
  })

  it('zeigt ohne Meldung keinen Erfolgstext', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    expect(seitentext()).not.toContain(TEXTE.angelegt)
    expect(seitentext()).not.toContain(TEXTE.ohneBild)
  })
})

// ---------- AK-26: deutsche Texte ----------

describe('deutsche Texte', () => {
  const ENGLISCH =
    /\b(Loading|Error|Not found|Not Found|Back|Description|Publisher|Edition|Created|Image|No image|Awards|Issues|Edit|Delete|unknown)\b/

  function alleTexte(): string {
    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    return [seitentext(), ...attribute].join(' ')
  }

  it('enthält mit allen Berechtigungen keine englischen Texte', async () => {
    zeige({ berechtigungen: STUFEN.sachbearbeiter })
    await screen.findByRole('table', { name: 'Exemplare' })
    await screen.findByText('Für diesen Coin wurden noch keine Ausgaben erfasst.')

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('enthält mit Bild und Meldung keine englischen Texte', async () => {
    starte(testCoin({ id: ID, bildUrl: `/api/coins/${ID}/bild?v=1`, auflage: null }))
    zeige({ meldung: 'mitBild' })
    await screen.findByRole('img', { name: 'Motiv: Coin Alpha' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('enthält auf der 404-Ansicht keine englischen Texte', async () => {
    starte(null)
    zeige()
    await ueberschrift('Coin nicht gefunden')

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('beschriftet die Links mit deutschen Namen', async () => {
    zeige()
    await ueberschrift('Coin Alpha')

    const links = within(document.body)
      .getAllByRole('link')
      .map((l) => l.textContent?.trim())
    expect(links).toEqual(['Zurück zum Katalog'])
  })
})
