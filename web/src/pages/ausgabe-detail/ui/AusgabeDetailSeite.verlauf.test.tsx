import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import {
  erstelleFakeApi,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  type FakeApi,
} from '../../../../test/fakeApi'
import { meldungMit } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { AusgabeDetailSeite } from '../index'

// Feature formulare-detailseiten, AK-26 bis AK-28 (Abschnitt 4.6): Ausgabe-Seite mit Kopf (h1, Status-Chip „aktiv“
// bzw. „storniert“, Aktionen „Zertifikat herunterladen“ und „Stornieren“), Abschnitten „Zertifikat“, „Empfängerdaten“,
// „Ausgabedaten“ und „Verlauf“ (h2). Angenommene neue Prop: `darfStornieren` (issues.write, von der Route).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const STORNO_PFAD = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/storno$/
const STORNO = { am: '2026-10-09T08:00:00+00:00', von: { id: 'x', name: 'Test Administrator' }, grund: 'Doppelt' }

let api: FakeApi

function starte(ausgabe: Ausgabe = testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12, hologrammnummer: 'AB 12-43' })) {
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

function zeige({ darfStornieren = true, darfZertifikat = true, darfHologramm = true } = {}) {
  const user = userEvent.setup()
  zeigeMitRouter(
    () => (
      <AusgabeDetailSeite
        coinId={COIN_ID}
        ausgabeId={AUSGABE_ID}
        darfZertifikat={darfZertifikat}
        darfHologramm={darfHologramm}
        darfStornieren={darfStornieren}
      />
    ),
    { pfad: '/coins/$coinId/ausgaben/$ausgabeId', start: `/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}` },
  )
  return user
}

async function geladen(): Promise<HTMLElement> {
  return screen.findByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })
}

/** Elemente zwischen h1 und dem ersten h2 (Kopf der Seite). */
function kopfText(): string {
  const h1 = screen.getByRole('heading', { level: 1 })
  const erstesH2 = screen.getAllByRole('heading', { level: 2 })[0]
  return [...document.body.querySelectorAll('*')]
    .filter(
      (el) =>
        el.children.length === 0 &&
        (h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
        (el.compareDocumentPosition(erstesH2) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    )
    .map((el) => el.textContent?.trim() ?? '')
    .join(' | ')
}

const stornierenKnopf = () => screen.queryByRole('button', { name: /stornieren/i })
const downloadKnopf = () => screen.getByRole('button', { name: /Zertifikat.*herunterladen/ })

// ---------- AK-26: Abschnitte und Status-Chip ----------

describe('Abschnitte (AK-26)', () => {
  it('gliedert die Seite in „Zertifikat“, „Empfängerdaten“, „Ausgabedaten“ und „Verlauf“ (h2)', async () => {
    zeige()
    await geladen()

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim())).toEqual([
      'Zertifikat',
      'Empfängerdaten',
      'Ausgabedaten',
      'Verlauf',
    ])
  })

  it('behält die Begriffe der Beschreibungslisten in der bisherigen Reihenfolge', async () => {
    zeige()
    await geladen()

    expect([...document.querySelectorAll('dl dt')].map((dt) => dt.textContent?.trim())).toEqual([
      'Zertifikatsnummer',
      'Hologrammnummer',
      'Empfänger',
      'Dienstgrad',
      'Dienststelle',
      'Datum',
      'Gelegenheit',
      'Begründung',
      'Ausgebende Stelle',
      'Erfasst',
      'Status',
    ])
  })

  it('zeigt im Kopf den Status-Chip „aktiv“', async () => {
    zeige()
    await geladen()

    expect(kopfText()).toMatch(/(^|\| )aktiv( \||$)/)
  })

  it('zeigt im Kopf bei einer stornierten Ausgabe den Status-Chip „storniert“', async () => {
    starte(testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12, storno: STORNO }))
    zeige()
    await geladen()

    expect(kopfText()).toMatch(/(^|\| )storniert( \||$)/)
  })

  it('stellt „Hologrammnummer korrigieren“ in den Abschnitt „Zertifikat“', async () => {
    zeige()
    await geladen()

    const zertifikat = screen.getByRole('heading', { level: 2, name: 'Zertifikat' })
    const empfaenger = screen.getByRole('heading', { level: 2, name: 'Empfängerdaten' })
    const knopf = screen.getByRole('button', { name: 'Hologrammnummer korrigieren' })
    expect(zertifikat.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(knopf.compareDocumentPosition(empfaenger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// ---------- AK-27: Verlauf ----------

describe('Verlauf (AK-27)', () => {
  it('zeigt unter „Verlauf“ eine geordnete Liste mit „Ausgabe erfasst“', async () => {
    zeige()
    await geladen()

    const liste = [...document.querySelectorAll('ol')].find((ol) => ol.textContent?.includes('Ausgabe erfasst'))
    expect(liste).toBeDefined()
    expect(within(liste as HTMLElement).getAllByRole('listitem')).toHaveLength(1)
  })

  it('zeigt bei Storno zusätzlich „Ausgabe storniert“ mit Grund', async () => {
    starte(testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12, storno: STORNO }))
    zeige()
    await geladen()

    const liste = [...document.querySelectorAll('ol')].find((ol) => ol.textContent?.includes('Ausgabe erfasst'))
    const eintraege = within(liste as HTMLElement).getAllByRole('listitem')
    expect(eintraege).toHaveLength(2)
    expect(eintraege[1]).toHaveTextContent('Ausgabe storniert')
    expect(eintraege[1]).toHaveTextContent('Grund: Doppelt')
  })
})

// ---------- AK-28: Aktionen und Stornieren ----------

describe('Aktionen im Kopf (AK-28)', () => {
  it('zeigt mit issues.write „Zertifikat herunterladen“ und „Stornieren“ im Kopf', async () => {
    zeige()
    await geladen()

    const erstesH2 = screen.getAllByRole('heading', { level: 2 })[0]
    for (const knopf of [downloadKnopf(), stornierenKnopf() as HTMLElement]) {
      expect(knopf.compareDocumentPosition(erstesH2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('stellt „Stornieren“ in der Variante „gefährlich“ dar', async () => {
    zeige()
    await geladen()

    expect((stornierenKnopf() as HTMLElement).className).toMatch(/\bdestructive\b/)
  })

  it('zeigt bei einer stornierten Ausgabe kein „Stornieren“', async () => {
    starte(testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12, storno: STORNO }))
    zeige()
    await geladen()

    expect(stornierenKnopf()).not.toBeInTheDocument()
  })

  it('zeigt ohne issues.write weder „Stornieren“ noch „Zertifikat herunterladen“', async () => {
    zeige({ darfStornieren: false, darfZertifikat: false, darfHologramm: false })
    await geladen()

    expect(stornierenKnopf()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Zertifikat.*herunterladen/ })).not.toBeInTheDocument()
    expect(api.anfragenMit('POST', STORNO_PFAD)).toHaveLength(0)
  })

  it('öffnet den Storno-Dialog mit denselben Texten wie in der Historie', async () => {
    const user = zeige()
    await geladen()

    await user.click(stornierenKnopf() as HTMLElement)

    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    expect(dialog).toHaveAccessibleDescription(
      'Die Ausgabe von Exemplar Nr. 12 bleibt in der Historie sichtbar. Das Exemplar ist danach wieder verfügbar.',
    )
    expect(within(dialog).getByLabelText(/^Grund/)).toBeRequired()
  })

  it('sendet ohne Grund nichts', async () => {
    const user = zeige()
    await geladen()
    await user.click(stornierenKnopf() as HTMLElement)
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    expect(within(dialog).getByLabelText(/^Grund/)).toHaveAttribute('aria-invalid', 'true')
    expect(api.anfragenMit('POST', STORNO_PFAD)).toHaveLength(0)
  })
})

describe('Nach bestätigtem Storno (AK-28)', () => {
  async function storniere(user: ReturnType<typeof userEvent.setup>) {
    await geladen()
    await user.click(stornierenKnopf() as HTMLElement)
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await user.type(within(dialog).getByLabelText(/^Grund/), 'Doppelt erfasst')
    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  }

  it('sendet den Grund an …/storno', async () => {
    const user = zeige()
    await storniere(user)

    expect(api.anfragenMit('POST', STORNO_PFAD).map((a) => a.body)).toEqual([{ grund: 'Doppelt erfasst' }])
  })

  it('meldet „Die Ausgabe wurde storniert.“ als Status mit Fokus', async () => {
    const user = zeige()
    await storniere(user)

    const meldung = await waitFor(() => {
      const el = meldungMit('Die Ausgabe wurde storniert.')
      expect(el?.getAttribute('role')).toBe('status')
      return el as HTMLElement
    })
    await waitFor(() => expect(meldung).toHaveFocus())
  })

  it('zeigt ohne Neuladen den Chip „storniert“ und den Verlaufseintrag', async () => {
    const user = zeige()
    await storniere(user)

    await waitFor(() => expect(kopfText()).toMatch(/(^|\| )storniert( \||$)/))
    expect(document.body).toHaveTextContent('Ausgabe storniert')
    expect(api.anfragenMit('GET', /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+$/)).toHaveLength(1)
  })

  it('entfernt „Stornieren“ und „Hologrammnummer …“ und sperrt den Download', async () => {
    const user = zeige()
    await storniere(user)

    await waitFor(() => expect(stornierenKnopf()).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^Hologrammnummer/ })).not.toBeInTheDocument()
    const download = downloadKnopf() as HTMLButtonElement
    expect(download.disabled || download.getAttribute('aria-disabled') === 'true').toBe(true)
  })

  it('zeigt während der Anfrage den Ladezustand und schließt nicht', async () => {
    const offen = offeneAntwort()
    api.einmal('POST', STORNO_PFAD, () => offen.promise)
    const user = zeige()
    await geladen()
    await user.click(stornierenKnopf() as HTMLElement)
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await user.type(within(dialog).getByLabelText(/^Grund/), 'Doppelt erfasst')

    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))
    await user.keyboard('{Escape}')

    expect(within(dialog).getByRole('button', { name: 'Stornieren' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })).toBeInTheDocument()
    offen.aufloesen(problemAntwort(500))
  })
})
