import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import { ausgabeKonfliktAntwort, erstelleFakeApi, testAusgabe, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { gibEin, meldungMit, seitentext } from '../../../../test/hilfen'
import { AusgabenHistorie } from '../index'

// Feature coin-ausgaben, AK-22 und AK-24: Widget „Ausgabehistorie“ mit Tabelle, Blättern (Seite lokal) und
// „Stornieren“ je aktiver Zeile (Prop darfStornieren). Nach einer Änderung meldet es onGeaendert, damit die
// Kennzahlen neu laden. Props { coinId, darfStornieren, onGeaendert }.

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const GET = /^\/api\/coins\/[^/]+\/ausgaben$/
const STORNO = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/storno$/
const LEER = 'Für diesen Coin wurden noch keine Ausgaben erfasst.'

let api: FakeApi
let onGeaendert: ReturnType<typeof vi.fn<() => void>>

function ausgabeNr(nr: number, teil: Partial<Ausgabe> = {}): Ausgabe {
  return testAusgabe({ id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, 'e')}`, exemplarNummer: nr, ...teil })
}

function starte(ausgaben: Ausgabe[]) {
  api = erstelleFakeApi([testCoin({ id: COIN_ID, auflage: 150 })], { ausgaben: { [COIN_ID]: ausgaben } })
  vi.stubGlobal('fetch', api.fetch)
}

beforeEach(() => {
  starte([
    ausgabeNr(3),
    ausgabeNr(2, {
      storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Doppelt' },
    }),
    ausgabeNr(1),
  ])
  onGeaendert = vi.fn<() => void>()
})

function zeige(darfStornieren = true) {
  const user = userEvent.setup()
  render(<AusgabenHistorie coinId={COIN_ID} darfStornieren={darfStornieren} onGeaendert={onGeaendert} />)
  return { user }
}

const abrufe = () => api.anfragenMit('GET', GET)

async function tabelle() {
  return screen.findByRole('table', { name: 'Ausgabehistorie' })
}

function nummern(): string[] {
  return within(screen.getByRole('table', { name: 'Ausgabehistorie' }))
    .getAllByRole('row')
    .slice(1)
    .map((z) => within(z).getAllByRole('cell')[0].textContent?.trim() ?? '')
}

describe('Abschnitt', () => {
  it('hat die Überschrift „Ausgabehistorie“ (Ebene 2)', async () => {
    zeige()

    expect(await screen.findByRole('heading', { level: 2, name: 'Ausgabehistorie' })).toBeInTheDocument()
  })

  it('lädt GET …/ausgaben mit seite 1', async () => {
    zeige()
    await tabelle()

    expect(abrufe()).toHaveLength(1)
    expect(abrufe()[0].query.get('seite')).toBe('1')
  })

  it('zeigt die Ausgaben in der Reihenfolge der API (neueste zuerst)', async () => {
    zeige()
    await tabelle()

    expect(nummern()).toEqual(['3', '2', '1'])
  })

  it('zeigt ohne Ausgaben „Für diesen Coin wurden noch keine Ausgaben erfasst.“', async () => {
    starte([])
    zeige()

    expect(await screen.findByText(LEER)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Ausgabehistorie' })).not.toBeInTheDocument()
  })

  it('blättert lokal auf Seite 2', async () => {
    starte(Array.from({ length: 30 }, (_, i) => ausgabeNr(30 - i)))
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Nächste Seite' }))

    await waitFor(() => expect(abrufe().at(-1)?.query.get('seite')).toBe('2'))
    await waitFor(() => expect(nummern()[0]).toBe('5'))
  })
})

describe('„Stornieren“ (AK-24)', () => {
  it('hat mit darfStornieren je aktiver Ausgabe einen Button', async () => {
    zeige(true)
    await tabelle()

    expect(
      screen
        .getAllByRole('button', { name: /^Ausgabe von Exemplar Nr\. \d+ stornieren$/ })
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Ausgabe von Exemplar Nr. 3 stornieren', 'Ausgabe von Exemplar Nr. 1 stornieren'])
  })

  it('hat für stornierte Ausgaben keinen Button', async () => {
    zeige(true)
    await tabelle()

    expect(screen.queryByRole('button', { name: 'Ausgabe von Exemplar Nr. 2 stornieren' })).not.toBeInTheDocument()
  })

  it('hat ohne darfStornieren keine Buttons', async () => {
    zeige(false)
    await tabelle()

    expect(screen.queryByRole('button', { name: /stornieren/ })).not.toBeInTheDocument()
  })

  it('zeigt nach Erfolg „Ausgabe von Exemplar Nr. {n} wurde storniert.“ als Status', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 3 stornieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch erfasst')
    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await waitFor(() =>
      expect(meldungMit('Ausgabe von Exemplar Nr. 3 wurde storniert.')?.getAttribute('role')).toBe('status'),
    )
  })

  it('setzt nach Erfolg den Fokus auf die Statusmeldung', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 3 stornieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch erfasst')
    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await waitFor(() => expect(meldungMit('Ausgabe von Exemplar Nr. 3 wurde storniert.')).toHaveFocus())
  })

  it('lädt nach Erfolg die Historie neu und zeigt das Storno', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 3 stornieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch erfasst')
    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await waitFor(() => expect(abrufe().length).toBeGreaterThanOrEqual(2))
    await waitFor(() =>
      expect(screen.getByRole('table', { name: 'Ausgabehistorie' })).toHaveTextContent(/Falsch erfasst/),
    )
  })

  it('meldet nach Erfolg onGeaendert (Kennzahlen neu laden)', async () => {
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 3 stornieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch erfasst')
    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await waitFor(() => expect(onGeaendert).toHaveBeenCalled())
  })

  it('lädt nach 409 bereits_storniert die Historie neu', async () => {
    api.einmal('POST', STORNO, ausgabeKonfliktAntwort('bereits_storniert'))
    const { user } = zeige()
    await tabelle()

    await user.click(screen.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 3 stornieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await gibEin(user, within(dialog).getByLabelText(/^Grund/), 'Falsch erfasst')
    await user.click(within(dialog).getByRole('button', { name: 'Stornieren' }))

    await within(dialog).findByRole('alert')
    await waitFor(() => expect(abrufe().length).toBeGreaterThanOrEqual(2))
  })
})

describe('deutsche Texte', () => {
  it('enthält keine englischen Texte', async () => {
    zeige()
    await tabelle()

    expect(seitentext()).not.toMatch(/\b(Recipient|Date|Occasion|Reason|Issued by|Active|Cancelled|Cancel|Loading)\b/)
  })
})
