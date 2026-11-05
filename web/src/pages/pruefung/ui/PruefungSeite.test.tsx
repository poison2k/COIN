import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import {
  erstelleFakeApi,
  keinZugriffAntwort,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  testPruefErgebnis,
  jsonAntwort,
  zuVielePruefungenAntwort,
  type FakeApi,
} from '../../../../test/fakeApi'
import { gibEin, meldungMit } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { PruefungSeite } from '../index'

// Feature hologrammnummer, AK-29, AK-32 und AK-33: Seite „Zertifikat prüfen“ (PruefungSeite { darfEmpfaenger }) –
// genau ein h1, Formular mit „Coin (optional)“, „Hologrammnummer“ (Pflicht) und „Prüfen“; Enter im Nummernfeld prüft,
// Feldfehler ohne Request, Sperre während der Prüfung, kein Doppel-Request, Nummer nie in URL oder Storage; Fehler als
// Alarm (429 mit Wartezeit, 403, 401, sonst allgemein). Seiten ohne Router-Hooks; der Test-Router stellt Link-Ziele.

const ALPHA = testCoin({
  id: '0199a1b2-0000-7000-8000-0000000000a1',
  name: 'Coin Alpha',
  herausgeber: 'Herausgeber Beta',
})
const PRUEFUNG = /^\/api\/pruefung(\/mit-empfaenger)?$/
const TEXT_429 = 'Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt.'
const TEXT_403 = 'Sie sind nicht berechtigt, Zertifikate zu prüfen.'
const TEXT_401 = 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
const TEXT_FEHLER = 'Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([ALPHA], {
    me: ME.betrachter,
    ausgaben: { [ALPHA.id]: [testAusgabe({ exemplarNummer: 12, hologrammnummer: 'AB 12-34' })] },
  })
  vi.stubGlobal('fetch', api.fetch)
})

afterEach(() => {
  vi.useRealTimers()
})

function zeige(darfEmpfaenger = false) {
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(() => <PruefungSeite darfEmpfaenger={darfEmpfaenger} />, { pfad: '/pruefung' })
  return { user, ...ansicht }
}

const nummer = () => screen.getByLabelText(/^Hologrammnummer/) as HTMLInputElement
const pruefen = () => screen.getByRole('button', { name: 'Prüfen' })
const pruefAnfragen = () => api.anfragen.filter((a) => a.methode === 'POST' && PRUEFUNG.test(a.pfad))

/** Text der per aria-describedby verbundenen Elemente. */
function beschreibung(feld: HTMLElement): string {
  return (feld.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

// ---------- AK-29: Aufbau ----------

describe('Aufbau', () => {
  it('hat genau ein h1 „Zertifikat prüfen“', async () => {
    zeige()

    expect(await screen.findByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('hat eine Combobox „Coin (optional)“', async () => {
    zeige()

    expect(await screen.findByRole('combobox', { name: /^Coin \(optional\)/ })).toBeInTheDocument()
  })

  it('hat ein Pflichtfeld „Hologrammnummer“', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1 })

    expect(nummer()).toHaveAccessibleName(/\(Pflichtfeld\)/)
  })

  it.each([
    ['maxlength', '40'],
    ['autocomplete', 'off'],
    ['spellcheck', 'false'],
    ['autocapitalize', 'characters'],
  ])('setzt am Nummernfeld %s="%s"', async (attribut, wert) => {
    zeige()
    await screen.findByRole('heading', { level: 1 })

    expect(nummer()).toHaveAttribute(attribut, wert)
  })

  it('hat den Button „Prüfen“', async () => {
    zeige()

    expect(await screen.findByRole('button', { name: 'Prüfen' })).toBeInTheDocument()
  })

  it('stellt die Felder in der Reihenfolge Coin, Hologrammnummer, Prüfen dar', async () => {
    zeige()
    const coin = await screen.findByRole('combobox', { name: /^Coin/ })

    expect(coin.compareDocumentPosition(nummer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nummer().compareDocumentPosition(pruefen()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('hat eine dauerhaft vorhandene Live-Region für das Ergebnis', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getAllByRole('status').some((s) => s.getAttribute('aria-live') === 'polite')).toBe(true)
  })

  it('sendet beim Anzeigen keine Prüfung', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1 })

    expect(pruefAnfragen()).toEqual([])
  })
})

// ---------- AK-29: Prüfen ----------

describe('Prüfen', () => {
  it('prüft per Klick auf „Prüfen“', async () => {
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'ab 12-34')

    await user.click(pruefen())

    await waitFor(() => expect(pruefAnfragen()).toHaveLength(1))
  })

  it('prüft mit Enter im Nummernfeld', async () => {
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(pruefAnfragen()).toHaveLength(1))
  })

  it('sendet die Nummer und ohne Coin coinId null', async () => {
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'ab 12-34')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(pruefAnfragen()).toHaveLength(1))
    const body = pruefAnfragen()[0].body as { hologrammnummer?: unknown; coinId?: unknown }
    expect(String(body.hologrammnummer).replace(/[\s-]/g, '').toUpperCase()).toBe('AB1234')
    expect(body.coinId ?? null).toBeNull()
  })

  it('lässt den Fokus nach der Prüfung im Nummernfeld', async () => {
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { level: 2 })
    expect(nummer()).toHaveFocus()
  })

  it('sperrt den Button während der Prüfung mit aria-disabled', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', PRUEFUNG, offen.promise)
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(pruefen()).toHaveAttribute('aria-disabled', 'true'))
    offen.aufloesen(jsonAntwort(200, testPruefErgebnis('nichtGefunden')))
    await waitFor(() => expect(pruefen()).not.toHaveAttribute('aria-disabled', 'true'))
  })

  it('sendet bei doppeltem Enter nur eine Prüfung', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', PRUEFUNG, offen.promise)
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}{Enter}')
    offen.aufloesen(jsonAntwort(200, testPruefErgebnis('nichtGefunden')))

    await screen.findByRole('heading', { level: 2 })
    expect(pruefAnfragen()).toHaveLength(1)
  })

  it('setzt die Nummer weder in die URL noch in den Verlauf', async () => {
    const { user, router } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'ab 12-34')

    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 2 })

    expect(router.state.location.href).not.toMatch(/AB|12-34|1234/i)
    expect(window.location.href).not.toMatch(/AB|12-34|1234/i)
  })

  it('legt die Nummer weder in localStorage noch in sessionStorage ab', async () => {
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'ab 12-34')

    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 2 })

    const ablage = [localStorage, sessionStorage].flatMap((s) =>
      Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i) ?? '')}`),
    )
    expect(ablage.join('\n')).not.toMatch(/12-34|AB1234|AB 12/i)
  })
})

// ---------- AK-29: Feldfehler ohne Request ----------

describe('Feldfehler', () => {
  it('meldet eine leere Nummer am Feld und sendet nichts', async () => {
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })

    await user.click(pruefen())

    await waitFor(() => expect(beschreibung(nummer())).toContain('Bitte eine Hologrammnummer eingeben.'))
    expect(nummer()).toHaveAttribute('aria-invalid', 'true')
    expect(pruefAnfragen()).toEqual([])
  })

  it('meldet unerlaubte Zeichen am Feld und sendet nichts', async () => {
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'AB/1234')

    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(beschreibung(nummer())).toContain(
        'Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.',
      ),
    )
    expect(pruefAnfragen()).toEqual([])
  })

  it('meldet eine Nummer nur aus Trennzeichen am Feld und sendet nichts', async () => {
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), '- -')

    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(beschreibung(nummer())).toContain(
        'Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.',
      ),
    )
    expect(pruefAnfragen()).toEqual([])
  })

  it('zeigt einen Serverfehler zum Feld hologrammnummer am Feld', async () => {
    api.einmal(
      'POST',
      PRUEFUNG,
      problemAntwort(400, {
        title: 'Eingaben ungültig',
        errors: { hologrammnummer: ['Die Hologrammnummer darf höchstens 40 Zeichen lang sein.'] },
      }),
    )
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(beschreibung(nummer())).toContain('Die Hologrammnummer darf höchstens 40 Zeichen lang sein.'),
    )
  })
})

// ---------- AK-32: Fehler ----------

describe('Fehler', () => {
  async function pruefeMit(antwort: Response) {
    api.einmal('POST', PRUEFUNG, antwort)
    const ansicht = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(ansicht.user, nummer(), 'AB1234')
    await ansicht.user.keyboard('{Enter}')
    return ansicht
  }

  it('meldet 429 mit Retry-After als Alarm mit der Wartezeit in Sekunden', async () => {
    await pruefeMit(zuVielePruefungenAntwort('30'))

    await waitFor(() =>
      expect(meldungMit(`${TEXT_429} Bitte warten Sie 30 Sekunden.`)?.getAttribute('role')).toBe('alert'),
    )
  })

  it('meldet 429 ohne Retry-After mit „Bitte warten Sie einen Moment.“', async () => {
    await pruefeMit(zuVielePruefungenAntwort())

    await waitFor(() =>
      expect(meldungMit(`${TEXT_429} Bitte warten Sie einen Moment.`)?.getAttribute('role')).toBe('alert'),
    )
  })

  it('sperrt den Button nach 429 bis zum Ablauf der Wartezeit', async () => {
    await pruefeMit(zuVielePruefungenAntwort('30'))

    await waitFor(() => expect(meldungMit(TEXT_429)).toBeDefined())
    expect(pruefen()).toHaveAttribute('aria-disabled', 'true')
  })

  it('gibt den Button nach Ablauf der Wartezeit wieder frei', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.einmal('POST', PRUEFUNG, zuVielePruefungenAntwort('2'))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    zeigeMitRouter(() => <PruefungSeite darfEmpfaenger={false} />, { pfad: '/pruefung' })
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'AB1234')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(pruefen()).toHaveAttribute('aria-disabled', 'true'))

    await act(() => vi.advanceTimersByTimeAsync(2_500))

    await waitFor(() => expect(pruefen()).not.toHaveAttribute('aria-disabled', 'true'))
  })

  it('sendet während der Wartezeit nach 429 keine weitere Prüfung', async () => {
    const { user } = await pruefeMit(zuVielePruefungenAntwort('30'))
    await waitFor(() => expect(meldungMit(TEXT_429)).toBeDefined())

    await user.click(nummer())
    await user.keyboard('{Enter}')
    await user.click(pruefen())

    expect(pruefAnfragen()).toHaveLength(1)
  })

  it('meldet 403 mit „Sie sind nicht berechtigt, Zertifikate zu prüfen.“', async () => {
    await pruefeMit(keinZugriffAntwort('keine_berechtigung'))

    await waitFor(() => expect(meldungMit(TEXT_403)?.getAttribute('role')).toBe('alert'))
  })

  it('meldet 401 mit dem bestehenden Text zur abgelaufenen Anmeldung', async () => {
    await pruefeMit(problemAntwort(401, { title: 'Nicht angemeldet' }))

    await waitFor(() => expect(meldungMit(TEXT_401)?.getAttribute('role')).toBe('alert'))
  })

  it('meldet einen Serverfehler mit dem allgemeinen Text', async () => {
    await pruefeMit(problemAntwort(500, { title: 'Fehler' }))

    await waitFor(() => expect(meldungMit(TEXT_FEHLER)?.getAttribute('role')).toBe('alert'))
  })

  it('meldet einen Netzwerkfehler mit dem allgemeinen Text', async () => {
    api.netzwerkfehler('POST', PRUEFUNG)
    const { user } = zeige()
    await screen.findByRole('heading', { level: 1 })
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(meldungMit(TEXT_FEHLER)?.getAttribute('role')).toBe('alert'))
  })
})

// ---------- AK-33: Barrierefreiheit und Texte ----------

describe('Barrierefreiheit und Texte', () => {
  it('erreicht per Tab Coin, Hologrammnummer und Prüfen in dieser Reihenfolge', async () => {
    const { user } = zeige()
    const coin = await screen.findByRole('combobox', { name: /^Coin/ })
    coin.focus()

    const erreicht: HTMLElement[] = []
    for (let i = 0; i < 6 && erreicht.length < 2; i++) {
      await user.tab()
      const aktiv = document.activeElement as HTMLElement
      if (aktiv === nummer() || aktiv === pruefen()) erreicht.push(aktiv)
    }

    expect(erreicht).toEqual([nummer(), pruefen()])
  })

  it('enthält keine englischen Texte, auch nicht in Attributen', async () => {
    zeige()
    await screen.findByRole('heading', { level: 1 })

    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    expect([document.body.textContent ?? '', ...attribute].join(' ')).not.toMatch(
      /\b(Check|Verify|Submit|Search|Select|Clear|No results|Loading|Error|Required|Number|Certificate|Valid|Invalid|Not found)\b/,
    )
  })
})
