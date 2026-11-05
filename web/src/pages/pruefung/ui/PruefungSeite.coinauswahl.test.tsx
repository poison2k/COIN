import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, testAusgabe, testCoin, type FakeApi } from '../../../../test/fakeApi'
import { gibEin } from '../../../../test/hilfen'
import { zeigeMitRouter } from '../../../../test/router'
import { PruefungSeite } from '../index'

// Feature hologrammnummer, AK-29 und AK-33: „Coin (optional)“ als Combobox mit Suche (GET /api/coins?suche=…&groesse=20,
// 300 ms verzögert, Einträge „Name – Herausgeber“, „Keine Coins gefunden“, Auswahl per Button „Auswahl entfernen“
// löschbar), role="combobox" mit aria-expanded, Pfeiltasten, Enter wählt (ohne zu prüfen), Escape schließt. Die
// gewählte Coin-Id geht als coinId in die Prüfung; eine Änderung des Coins blendet ein altes Ergebnis aus.

const ALPHA = testCoin({
  id: '0199a1b2-0000-7000-8000-0000000000a1',
  name: 'Coin Alpha',
  herausgeber: 'Herausgeber Beta',
})
const GAMMA = testCoin({
  id: '0199a1b2-0000-7000-8000-0000000000a3',
  name: 'Coin Gamma',
  herausgeber: 'Herausgeber Delta',
})
const PRUEFUNG = /^\/api\/pruefung(\/mit-empfaenger)?$/

let api: FakeApi

beforeEach(() => {
  api = erstelleFakeApi([ALPHA, GAMMA], {
    me: ME.betrachter,
    ausgaben: { [ALPHA.id]: [testAusgabe({ exemplarNummer: 12, hologrammnummer: 'AB 12-34' })] },
  })
  vi.stubGlobal('fetch', api.fetch)
})

async function zeige() {
  const user = userEvent.setup()
  zeigeMitRouter(() => <PruefungSeite darfEmpfaenger={false} />, { pfad: '/pruefung' })
  const combobox = await screen.findByRole('combobox', { name: /^Coin \(optional\)/ })
  return { user, combobox }
}

const suchAnfragen = () =>
  api.anfragen.filter((a) => a.methode === 'GET' && a.pfad === '/api/coins' && a.query.has('suche'))
const pruefAnfragen = () => api.anfragen.filter((a) => a.methode === 'POST' && PRUEFUNG.test(a.pfad))
const nummer = () => screen.getByLabelText(/^Hologrammnummer/) as HTMLInputElement

async function waehle(user: ReturnType<typeof userEvent.setup>, combobox: HTMLElement, suche: string, eintrag: string) {
  await user.click(combobox)
  await user.type(combobox, suche)
  await user.click(await screen.findByRole('option', { name: eintrag }))
}

describe('Suche', () => {
  it('sucht erst nach einer Verzögerung', async () => {
    const { user, combobox } = await zeige()

    await user.click(combobox)
    await user.type(combobox, 'Alp')

    expect(suchAnfragen()).toEqual([])
    await waitFor(() => expect(suchAnfragen()).toHaveLength(1))
  })

  it('sucht bei schnellem Tippen nur einmal mit dem ganzen Begriff', async () => {
    const { user, combobox } = await zeige()

    await user.click(combobox)
    await user.type(combobox, 'Alpha')

    await waitFor(() => expect(suchAnfragen()).toHaveLength(1))
    expect(suchAnfragen()[0].query.get('suche')).toBe('Alpha')
  })

  it('fragt höchstens 20 Coins ab', async () => {
    const { user, combobox } = await zeige()

    await user.click(combobox)
    await user.type(combobox, 'Coin')

    await waitFor(() => expect(suchAnfragen()).toHaveLength(1))
    expect(suchAnfragen()[0].query.get('groesse')).toBe('20')
  })

  it('zeigt die Treffer als „Name – Herausgeber“', async () => {
    const { user, combobox } = await zeige()

    await user.click(combobox)
    await user.type(combobox, 'Coin')

    expect(await screen.findByRole('option', { name: 'Coin Alpha – Herausgeber Beta' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Coin Gamma – Herausgeber Delta' })).toBeInTheDocument()
  })

  it('zeigt ohne Treffer „Keine Coins gefunden“', async () => {
    const { user, combobox } = await zeige()

    await user.click(combobox)
    await user.type(combobox, 'Zeta')

    expect(await screen.findByText('Keine Coins gefunden')).toBeInTheDocument()
  })

  it('setzt aria-expanded beim Öffnen der Liste', async () => {
    const { user, combobox } = await zeige()

    await user.click(combobox)
    await user.type(combobox, 'Coin')
    await screen.findByRole('option', { name: 'Coin Alpha – Herausgeber Beta' })

    expect(combobox).toHaveAttribute('aria-expanded', 'true')
  })

  it('schließt die Liste mit Escape', async () => {
    const { user, combobox } = await zeige()
    await user.click(combobox)
    await user.type(combobox, 'Coin')
    await screen.findByRole('option', { name: 'Coin Alpha – Herausgeber Beta' })

    await user.keyboard('{Escape}')

    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'false'))
  })
})

describe('Auswahl', () => {
  it('übernimmt den gewählten Coin als coinId in die Prüfung', async () => {
    const { user, combobox } = await zeige()
    await waehle(user, combobox, 'Alp', 'Coin Alpha – Herausgeber Beta')
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(pruefAnfragen()).toHaveLength(1))
    expect((pruefAnfragen()[0].body as { coinId?: unknown }).coinId).toBe(ALPHA.id)
  })

  it('wählt per Pfeiltaste und Enter, ohne zu prüfen', async () => {
    const { user, combobox } = await zeige()
    await user.click(combobox)
    await user.type(combobox, 'Gam')
    await screen.findByRole('option', { name: 'Coin Gamma – Herausgeber Delta' })

    await user.keyboard('{ArrowDown}{Enter}')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Auswahl entfernen' })).toBeInTheDocument())
    expect(pruefAnfragen()).toEqual([])
  })

  it('zeigt nach der Auswahl den Button „Auswahl entfernen“', async () => {
    const { user, combobox } = await zeige()

    await waehle(user, combobox, 'Alp', 'Coin Alpha – Herausgeber Beta')

    expect(await screen.findByRole('button', { name: 'Auswahl entfernen' })).toBeInTheDocument()
  })

  it('prüft nach „Auswahl entfernen“ wieder ohne Coin', async () => {
    const { user, combobox } = await zeige()
    await waehle(user, combobox, 'Alp', 'Coin Alpha – Herausgeber Beta')
    await user.click(await screen.findByRole('button', { name: 'Auswahl entfernen' }))
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}')

    await waitFor(() => expect(pruefAnfragen()).toHaveLength(1))
    expect((pruefAnfragen()[0].body as { coinId?: unknown }).coinId ?? null).toBeNull()
  })

  it('blendet ein altes Ergebnis aus, sobald ein Coin gewählt wird', async () => {
    const { user, combobox } = await zeige()
    await gibEin(user, nummer(), 'AB1234')
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 2 })

    await waehle(user, combobox, 'Gam', 'Coin Gamma – Herausgeber Delta')

    await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument())
  })

  it('blendet ein altes Ergebnis aus, sobald die Auswahl entfernt wird', async () => {
    const { user, combobox } = await zeige()
    await waehle(user, combobox, 'Alp', 'Coin Alpha – Herausgeber Beta')
    await gibEin(user, nummer(), 'AB1234')
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 2 })

    await user.click(screen.getByRole('button', { name: 'Auswahl entfernen' }))

    await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument())
  })

  it('sucht nie mit der Hologrammnummer', async () => {
    const { user } = await zeige()
    await gibEin(user, nummer(), 'AB1234')

    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { level: 2 })

    expect(
      api.anfragen
        .filter((a) => a.methode === 'GET')
        .map((a) => a.query.toString())
        .join(' '),
    ).not.toMatch(/AB1234/i)
  })
})
