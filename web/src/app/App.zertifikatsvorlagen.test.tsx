import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import {
  ME,
  erstelleTestAnmeldung,
  type SitzungsZustand,
  type TestAnmeldung,
  type TestBenutzer,
} from '../../test/anmeldung'
import { beobachteDownloads } from '../../test/downloads'
import {
  erstelleFakeApi,
  offeneAntwort,
  testCoin,
  testVorlagenStatus,
  testVorlagenVersion,
  type FakeApi,
} from '../../test/fakeApi'
import { gibEin, meldungMit } from '../../test/hilfen'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature zertifikatsvorlagen im Zusammenspiel von App, Router, Guards und Seiten: AK-26 (Route und Guard),
// AK-27 (Link „Bearbeiten“), AK-28 (Weiterleitung mit Meldung, einmal verbraucht), AK-32 (keine Vorlagen-Requests ohne
// coins.write), AK-33 (deutsche Texte, genau ein h1).

const TEXTE = {
  ohneBerechtigung:
    'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
  deaktiviert: 'Ihr Benutzerkonto ist deaktiviert.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
  gespeichert: 'Änderungen wurden gespeichert.',
} as const

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Loading|Error|Unauthorized|Forbidden|Not Found|Not found|Edit|Save|Cancel|Back|Upload|Download|Template|Version history|Reset|Size|Uploaded|Active|Image|Choose file|No file chosen)\b/

const ALPHA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a1', name: 'Coin Alpha', auflage: 150 })
const BEARBEITEN = `/coins/${ALPHA.id}/bearbeiten`
const VORLAGEN_PFAD = /zertifikatsvorlage/

let api: FakeApi

interface Optionen {
  als?: TestBenutzer | 'deaktiviert'
  zustand?: SitzungsZustand
  coins?: Coin[]
}

function zeigeApp(pfad: string, { als = 'sachbearbeiter', zustand = 'angemeldet', coins = [ALPHA] }: Optionen = {}) {
  const me = als === 'deaktiviert' ? 'deaktiviert' : ME[als]
  api = erstelleFakeApi(coins, {
    me: zustand === 'anonym' ? null : me,
    vorlagen: { [ALPHA.id]: testVorlagenStatus([testVorlagenVersion({ version: 1 })], 1) },
  })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung: TestAnmeldung = erstelleTestAnmeldung(zustand, als === 'deaktiviert' ? ME.admin.name : ME[als].name)
  const user = userEvent.setup({ applyAccept: false })
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router, anmeldung }
}

function seitenText(): string {
  return document.body.textContent?.replace(/\s+/g, ' ') ?? ''
}

function alleTexte(): string {
  const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
    ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  )
  return [document.body.textContent ?? '', ...attribute].join(' ')
}

function zielAus(anmeldung: TestAnmeldung): unknown {
  const args = anmeldung.signinRedirect.mock.calls.at(-1)?.[0] as { state?: { ziel?: unknown } } | undefined
  return args?.state?.ziel
}

const vorlagenAnfragen = () =>
  api.anfragen.filter((a) => VORLAGEN_PFAD.test(a.pfad) || a.pfad.startsWith('/api/zertifikatsvorlagen'))

// ---------- AK-26: Route und Guard ----------

describe('/coins/{id}/bearbeiten – Zugriff', () => {
  it.each(['admin', 'sachbearbeiter'] as const)('zeigt %s die Seite „Coin bearbeiten“', async (als) => {
    zeigeApp(BEARBEITEN, { als })

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin bearbeiten' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Änderungen speichern' })).toBeInTheDocument()
  })

  it('leitet den Betrachter nach /kein-zugriff?grund=berechtigung', async () => {
    const { router } = zeigeApp(BEARBEITEN, { als: 'betrachter' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    expect(router.state.location.search).toEqual({ grund: 'berechtigung' })
  })

  it('zeigt dem Betrachter „Kein Zugriff“ mit dem Text für fehlende Berechtigung', async () => {
    zeigeApp(BEARBEITEN, { als: 'betrachter' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeInTheDocument()
    await waitFor(() => expect(seitenText()).toContain(TEXTE.ohneBerechtigung))
  })

  it('sendet als Betrachter keinen Request auf Vorlagen', async () => {
    zeigeApp(BEARBEITEN, { als: 'betrachter' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(vorlagenAnfragen()).toEqual([])
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff mit dem Text für „keine Rolle“', async () => {
    const { router } = zeigeApp(BEARBEITEN, { als: 'keine' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.keineRolle))
    expect(vorlagenAnfragen()).toEqual([])
  })

  it('leitet Deaktivierte nach /kein-zugriff mit dem Deaktiviert-Text', async () => {
    const { router } = zeigeApp(BEARBEITEN, { als: 'deaktiviert' })

    await waitFor(() => expect(router.state.location.pathname).toBe('/kein-zugriff'))
    await waitFor(() => expect(seitenText()).toContain(TEXTE.deaktiviert))
    expect(vorlagenAnfragen()).toEqual([])
  })

  it('startet anonym die Anmeldung mit Rückkehrziel und lädt keine Vorlagen', async () => {
    const { anmeldung } = zeigeApp(BEARBEITEN, { zustand: 'anonym' })

    await waitFor(() => expect(anmeldung.signinRedirect).toHaveBeenCalledTimes(1))
    expect(zielAus(anmeldung)).toBe(BEARBEITEN)
    expect(vorlagenAnfragen()).toEqual([])
  })

  it('zeigt für eine Id ohne GUID-Format „Coin nicht gefunden“ ohne API-Aufruf auf den Coin', async () => {
    zeigeApp('/coins/keine-guid/bearbeiten')

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
    expect(api.anfragen.filter((a) => a.pfad.startsWith('/api/coins'))).toEqual([])
  })

  it('zeigt für eine unbekannte GUID „Coin nicht gefunden“', async () => {
    zeigeApp('/coins/0199a1b2-0000-7000-8000-0000000000ff/bearbeiten')

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeInTheDocument()
  })

  it('hat genau ein h1 und keine englischen Texte', async () => {
    zeigeApp(BEARBEITEN)
    await screen.findByRole('heading', { level: 1, name: 'Coin bearbeiten' })
    await waitFor(() => expect(seitenText()).toContain('Aktiv: eigene Vorlage, Version 1'))

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(alleTexte()).not.toMatch(ENGLISCH)
  })

  it('zeigt im Zurücksetzen-Dialog keine englischen Texte', async () => {
    const { user } = zeigeApp(BEARBEITEN)

    await user.click(await screen.findByRole('button', { name: 'Auf Standardvorlage zurücksetzen' }))
    await screen.findByRole('alertdialog', { name: 'Auf Standardvorlage zurücksetzen?' })

    expect(alleTexte()).not.toMatch(ENGLISCH)
  })
})

// ---------- AK-27: Link „Bearbeiten“ auf der Detailseite ----------

describe('Detailseite – Link „Bearbeiten“', () => {
  it.each(['admin', 'sachbearbeiter'] as const)('zeigt %s den Link „Bearbeiten“', async (als) => {
    zeigeApp(`/coins/${ALPHA.id}`, { als })

    expect(await screen.findByRole('link', { name: 'Bearbeiten' })).toHaveAttribute('href', BEARBEITEN)
  })

  it.each([
    ['betrachter', 'angemeldet'],
    ['keine', 'angemeldet'],
    ['sachbearbeiter', 'anonym'],
  ] as const)('zeigt %s (%s) keinen Link „Bearbeiten“', async (als, zustand) => {
    zeigeApp(`/coins/${ALPHA.id}`, { als, zustand })
    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })

  it('zeigt den Link nicht, solange /api/me lädt', async () => {
    const offen = offeneAntwort()
    api = erstelleFakeApi([ALPHA], { me: ME.sachbearbeiter })
    api.einmal('GET', /^\/api\/me$/, () => offen.promise)
    vi.stubGlobal('fetch', api.fetch)
    const anmeldung = erstelleTestAnmeldung('angemeldet', ME.sachbearbeiter.name)
    render(
      <App
        router={erstelleRouter(createMemoryHistory({ initialEntries: [`/coins/${ALPHA.id}`] }))}
        userManager={anmeldung.userManager}
      />,
    )

    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })

    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument()
    offen.aufloesen(
      new Response(JSON.stringify(ME.sachbearbeiter), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })

  it('führt über „Bearbeiten“ zur Seite „Coin bearbeiten“', async () => {
    const { user, router } = zeigeApp(`/coins/${ALPHA.id}`)

    await user.click(await screen.findByRole('link', { name: 'Bearbeiten' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(BEARBEITEN))
    expect(await screen.findByRole('heading', { level: 1, name: 'Coin bearbeiten' })).toBeInTheDocument()
  })
})

// ---------- AK-28: Speichern, Weiterleitung, Meldung ----------

describe('Speichern', () => {
  async function speichereNeuenNamen(user: ReturnType<typeof userEvent.setup>) {
    const name = await screen.findByLabelText(/^Name/)
    await user.clear(name)
    await gibEin(user, name, 'Coin Umbenannt')
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  }

  it('sendet PUT /api/coins/{id} und führt zur Detailseite', async () => {
    const { user, router } = zeigeApp(BEARBEITEN)

    await speichereNeuenNamen(user)

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ALPHA.id}`))
    expect(api.anfragenMit('PUT', /^\/api\/coins\/[^/]+$/)).toHaveLength(1)
  })

  it('zeigt auf der Detailseite „Änderungen wurden gespeichert.“ und den neuen Namen', async () => {
    const { user } = zeigeApp(BEARBEITEN)

    await speichereNeuenNamen(user)

    expect(await screen.findByRole('heading', { level: 1, name: 'Coin Umbenannt' })).toBeInTheDocument()
    await waitFor(() => expect(meldungMit(TEXTE.gespeichert)?.getAttribute('role')).toBe('status'))
  })

  it('setzt den Fokus auf die Überschrift der Detailseite', async () => {
    const { user } = zeigeApp(BEARBEITEN)

    await speichereNeuenNamen(user)

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Coin Umbenannt' })
    await waitFor(() => expect(h1).toHaveFocus())
  })

  it('ersetzt die Bearbeiten-Seite im Verlauf (replace)', async () => {
    const { user, router } = zeigeApp(`/coins/${ALPHA.id}`)
    await user.click(await screen.findByRole('link', { name: 'Bearbeiten' }))
    await speichereNeuenNamen(user)
    await screen.findByRole('heading', { level: 1, name: 'Coin Umbenannt' })

    router.history.back()

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ALPHA.id}`))
    expect(screen.queryByRole('button', { name: 'Änderungen speichern' })).not.toBeInTheDocument()
  })

  it('verbraucht die Meldung einmal (kein Wiedererscheinen nach erneutem Aufruf)', async () => {
    const { user } = zeigeApp(BEARBEITEN)
    await speichereNeuenNamen(user)
    await screen.findByRole('heading', { level: 1, name: 'Coin Umbenannt' })
    await waitFor(() => expect(meldungMit(TEXTE.gespeichert)).toBeDefined())

    await user.click(screen.getByRole('link', { name: 'Bearbeiten' }))
    await screen.findByRole('heading', { level: 1, name: 'Coin bearbeiten' })
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }))

    await screen.findByRole('heading', { level: 1, name: 'Coin Umbenannt' })
    expect(seitenText()).not.toContain(TEXTE.gespeichert)
  })

  it('bleibt bei 409 coin_existiert auf der Seite und behält die Eingaben', async () => {
    const { user, router } = zeigeApp(BEARBEITEN, {
      coins: [ALPHA, testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a2', name: 'Coin Umbenannt' })],
    })

    await speichereNeuenNamen(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ein Coin mit diesem Namen und Herausgeber existiert bereits.',
    )
    expect(router.state.location.pathname).toBe(BEARBEITEN)
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Coin Umbenannt')
  })

  it('führt über „Abbrechen“ ohne Request zur Detailseite', async () => {
    const { user, router } = zeigeApp(BEARBEITEN)

    await user.click(await screen.findByRole('link', { name: 'Abbrechen' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/coins/${ALPHA.id}`))
    expect(api.anfragenMit('PUT')).toEqual([])
  })
})

// ---------- AK-31/AK-32: Vorlagen-Requests nur mit coins.write ----------

describe('Vorlagen-Requests', () => {
  it.each([
    ['betrachter', 'angemeldet'],
    ['keine', 'angemeldet'],
    ['sachbearbeiter', 'anonym'],
  ] as const)('sendet als %s (%s) auf Katalog und Detailseite keinen Vorlagen-Request', async (als, zustand) => {
    zeigeApp(`/coins/${ALPHA.id}`, { als, zustand })
    await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(vorlagenAnfragen()).toEqual([])
    expect(screen.queryByRole('button', { name: /herunterladen|hochladen/i })).not.toBeInTheDocument()
  })

  it('lädt auf „Coin hinzufügen“ die Standardvorlage erst beim Klick', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeigeApp('/coins/neu')
    const knopf = await screen.findByRole('button', { name: 'Standardvorlage herunterladen' })
    expect(vorlagenAnfragen()).toEqual([])

    await user.click(knopf)

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['zertifikatsvorlage-standard.docx']))
  })

  it('zeigt dem Betrachter auf /coins/neu keine Download-Schaltfläche', async () => {
    zeigeApp('/coins/neu', { als: 'betrachter' })
    await screen.findByRole('heading', { level: 1, name: 'Kein Zugriff' })

    expect(screen.queryByRole('button', { name: 'Standardvorlage herunterladen' })).not.toBeInTheDocument()
    expect(vorlagenAnfragen()).toEqual([])
  })

  it('markiert „Katalog“ in der Sidebar auf „Coin bearbeiten“ als aktiv, ohne aria-current', async () => {
    zeigeApp(BEARBEITEN)
    await screen.findByRole('heading', { level: 1, name: 'Coin bearbeiten' })

    const katalog = within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('link', {
      name: 'Katalog',
    })
    expect(katalog).toHaveAttribute('data-active')
    expect(katalog).not.toHaveAttribute('aria-current')
  })
})
