import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import {
  erstelleFakeApi,
  jsonAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  testPruefErgebnis,
  zuVielePruefungenAntwort,
  type FakeApi,
} from '../../../../test/fakeApi'
import { gibEin } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { PruefungSeite } from '../index'

// Feature startseite-listen-pruefung, AK-20 bis AK-22 (Abschnitt 4.3, F4): Nach jeder abgeschlossenen Prüfung
// (Ergebnis, Feldfehler, Alarm) liegt der Fokus im Feld „Hologrammnummer“ – per Enter wie per Klick auf „Prüfen“.
// Nach einem Ergebnis ist der Inhalt vollständig markiert; Tippen ersetzt die alte Nummer, Enter prüft die neue. Der
// gewählte Coin bleibt erhalten. Pflichtkennzeichnung „(Pflicht)“ und Hilfetext am Feld.

const ALPHA = testCoin({
  id: '0199a1b2-0000-7000-8000-0000000000a1',
  name: 'Coin Alpha',
  herausgeber: 'Herausgeber Beta',
})
const PRUEFUNG = /^\/api\/pruefung(\/mit-empfaenger)?$/
const HILFETEXT = 'Leerzeichen und Bindestriche sind erlaubt. Groß- und Kleinschreibung spielt keine Rolle.'

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([ALPHA], {
    me: ME.betrachter,
    ausgaben: { [ALPHA.id]: [testAusgabe({ exemplarNummer: 12, hologrammnummer: 'AB 12-34' })] },
  })
  vi.stubGlobal('fetch', api.fetch)
})

async function zeige() {
  const user = userEvent.setup()
  const ansicht = zeigeMitRouter(() => <PruefungSeite darfEmpfaenger={false} />, { pfad: '/pruefung' })
  await screen.findByRole('heading', { level: 1, name: 'Zertifikat prüfen' })
  return { user, ...ansicht }
}

const nummer = () => screen.getByLabelText(/^Hologrammnummer/) as HTMLInputElement
const pruefen = () => screen.getByRole('button', { name: 'Prüfen' })
const coinFeld = () => screen.getByRole('combobox', { name: /^Coin \(optional\)/ })
const pruefAnfragen = () => api.anfragen.filter((a) => a.methode === 'POST' && PRUEFUNG.test(a.pfad))

/** Der ganze Feldinhalt ist markiert. */
function vollstaendigMarkiert(feld: HTMLInputElement): boolean {
  return feld.value.length > 0 && feld.selectionStart === 0 && feld.selectionEnd === feld.value.length
}

async function waehleAlpha(user: ReturnType<typeof userEvent.setup>) {
  // Element einmal holen: Bei geöffneter Liste ist der übrige Baum für Abfragen per Rolle ausgeblendet.
  const feld = coinFeld()
  await user.click(feld)
  await user.type(feld, 'Alpha')
  await user.click(await screen.findByRole('option', { name: /^Coin Alpha/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Auswahl entfernen' })).toBeInTheDocument())
}

describe('Fokus und Markierung nach einem Ergebnis (AK-21)', () => {
  it('lässt nach Enter den Fokus im Nummernfeld', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')

    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { level: 2, name: 'Zertifikat gültig' })
    expect(nummer()).toHaveFocus()
  })

  it('markiert nach Enter den ganzen Inhalt des Nummernfelds', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')

    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { level: 2, name: 'Zertifikat gültig' })
    await waitFor(() => expect(vollstaendigMarkiert(nummer())).toBe(true))
  })

  it('legt nach einem Klick auf „Prüfen“ den Fokus zurück ins Nummernfeld', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')

    await user.click(pruefen())

    await screen.findByRole('heading', { level: 2, name: 'Zertifikat gültig' })
    await waitFor(() => expect(nummer()).toHaveFocus())
  })

  it('markiert nach einem Klick auf „Prüfen“ den ganzen Inhalt', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')

    await user.click(pruefen())

    await screen.findByRole('heading', { level: 2, name: 'Zertifikat gültig' })
    await waitFor(() => expect(vollstaendigMarkiert(nummer())).toBe(true))
  })

  it('leert das Feld nach der Prüfung nicht (F4)', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'ab 12-34')

    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { level: 2 })
    expect(nummer()).toHaveValue('ab 12-34')
  })

  it('ersetzt beim Tippen die markierte alte Nummer', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 2 })
    await waitFor(() => expect(vollstaendigMarkiert(nummer())).toBe(true))

    await user.keyboard('XY99')

    expect(nummer()).toHaveValue('XY99')
  })

  it('prüft ohne weiteren Klick die nächste Nummer per Enter mit derselben coinId', async () => {
    const { user } = await zeige()
    await waehleAlpha(user)
    await gibEin(user, nummer(), 'AB 12-34')
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 2, name: 'Zertifikat gültig' })
    await waitFor(() => expect(vollstaendigMarkiert(nummer())).toBe(true))

    await user.keyboard('XY99{Enter}')

    await screen.findByRole('heading', {
      level: 2,
      name: 'Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.',
    })
    const anfragen = pruefAnfragen()
    expect(anfragen).toHaveLength(2)
    expect((anfragen[1].body as { hologrammnummer: string }).hologrammnummer).toBe('XY99')
    expect((anfragen[1].body as { coinId: string }).coinId).toBe(ALPHA.id)
    expect((anfragen[0].body as { coinId: string }).coinId).toBe(ALPHA.id)
  })

  it('behält den gewählten Coin nach der Prüfung', async () => {
    const { user } = await zeige()
    await waehleAlpha(user)
    await gibEin(user, nummer(), 'AB 12-34')

    await user.keyboard('{Enter}')

    await screen.findByRole('heading', { level: 2 })
    expect(screen.getByRole('button', { name: 'Auswahl entfernen' })).toBeInTheDocument()
    expect((coinFeld() as HTMLInputElement).value).toContain('Coin Alpha')
  })

  it('verschiebt den Fokus nie auf die Ergebniskarte', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')

    await user.click(pruefen())

    const ueberschrift = await screen.findByRole('heading', { level: 2 })
    const region = ueberschrift.closest('[role="status"]') as HTMLElement
    await waitFor(() => expect(nummer()).toHaveFocus())
    expect(region.contains(document.activeElement)).toBe(false)
  })
})

describe('Fokuswechsel während der Anfrage (QA-Regression)', () => {
  it('lässt den Fokus in der Coin-Auswahl, wenn der Benutzer während der Prüfung dorthin wechselt', async () => {
    let freigeben!: () => void
    api.einmal(
      'POST',
      PRUEFUNG,
      new Promise<Response>((resolve) => {
        freigeben = () => resolve(jsonAntwort(200, testPruefErgebnis('nichtGefunden')))
      }),
    )
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(pruefen()).toHaveAttribute('aria-busy', 'true'))

    coinFeld().focus()
    freigeben()

    await screen.findByRole('heading', { level: 2 })
    expect(coinFeld()).toHaveFocus()
    expect(nummer()).not.toHaveFocus()
  })
})

describe('Fokus nach Feldfehler und Alarm (AK-22)', () => {
  it('legt nach einem Klick auf „Prüfen“ mit leerer Nummer den Fokus ins Nummernfeld', async () => {
    const { user } = await zeige()

    await user.click(pruefen())

    await waitFor(() => expect(nummer()).toHaveAttribute('aria-invalid', 'true'))
    expect(nummer()).toHaveFocus()
  })

  it('legt nach einem Klick auf „Prüfen“ mit ungültiger Nummer den Fokus ins Nummernfeld', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB#12')

    await user.click(pruefen())

    await waitFor(() => expect(nummer()).toHaveAttribute('aria-invalid', 'true'))
    expect(nummer()).toHaveFocus()
  })

  it('legt nach einem Serverfehler (Klick) den Fokus ins Nummernfeld', async () => {
    api.einmal('POST', PRUEFUNG, problemAntwort(500))
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')

    await user.click(pruefen())

    await screen.findByRole('alert')
    await waitFor(() => expect(nummer()).toHaveFocus())
  })

  it('legt nach 429 (Klick) den Fokus ins Nummernfeld und sperrt „Prüfen“', async () => {
    api.einmal('POST', PRUEFUNG, zuVielePruefungenAntwort('30'))
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')

    await user.click(pruefen())

    await screen.findByRole('alert')
    await waitFor(() => expect(nummer()).toHaveFocus())
    expect(pruefen()).toHaveAttribute('aria-disabled', 'true')
  })

  it('legt nach einer Antwort „nicht gefunden“ (Klick) den Fokus ins Nummernfeld', async () => {
    api.einmal('POST', PRUEFUNG, jsonAntwort(200, testPruefErgebnis('nichtGefunden')))
    const { user } = await zeige()
    await gibEin(user, nummer(), 'ZZ 00')

    await user.click(pruefen())

    await screen.findByRole('heading', { level: 2 })
    await waitFor(() => expect(nummer()).toHaveFocus())
  })
})

describe('Nummernfeld (AK-20)', () => {
  it('trägt „(Pflichtfeld)“ im zugänglichen Namen', async () => {
    await zeige()

    expect(nummer()).toHaveAccessibleName(/^Hologrammnummer.*\(Pflichtfeld\)/)
  })

  it('zeigt im Label sichtbar „(Pflicht)“ statt eines Sterns', async () => {
    await zeige()

    const label = document.querySelector(`label[for="${nummer().id}"]`)
    expect(label?.textContent ?? '').toContain('(Pflicht)')
    expect(label?.textContent ?? '').not.toContain('*')
  })

  it('beschreibt das Feld mit dem Hilfetext', async () => {
    await zeige()

    expect(nummer()).toHaveAccessibleDescription(expect.stringContaining(HILFETEXT))
  })

  it('behält den Hilfetext neben einem Feldfehler in der Beschreibung', async () => {
    const { user } = await zeige()

    await user.click(pruefen())

    await waitFor(() => expect(nummer()).toHaveAttribute('aria-invalid', 'true'))
    expect(nummer()).toHaveAccessibleDescription(expect.stringContaining('Bitte eine Hologrammnummer eingeben.'))
    expect(nummer()).toHaveAccessibleDescription(expect.stringContaining(HILFETEXT))
  })

  it('zeigt „Prüfen“ während der Anfrage als ladend (aria-busy, aria-disabled)', async () => {
    let freigeben!: () => void
    api.einmal(
      'POST',
      PRUEFUNG,
      new Promise<Response>((resolve) => {
        freigeben = () => resolve(jsonAntwort(200, testPruefErgebnis('nichtGefunden')))
      }),
    )
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB 12-34')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(pruefen()).toHaveAttribute('aria-busy', 'true'))
    expect(pruefen()).toHaveAttribute('aria-disabled', 'true')
    freigeben()
    await screen.findByRole('heading', { level: 2 })
  })
})
