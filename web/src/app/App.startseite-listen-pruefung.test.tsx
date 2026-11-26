import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Coin } from '@/entities/coin'
import { ME, erstelleTestAnmeldung, type SitzungsZustand, type TestBenutzer } from '../../test/anmeldung'
import {
  erstelleFakeApi,
  testAuditEintrag,
  testAusgabe,
  testBenutzerEintrag,
  testCoin,
  type FakeApi,
} from '../../test/fakeApi'
import { gibEin } from '../../test/hilfen'
import { pruefeUeberschriften } from '../../test/ueberschriften'
import App from './App'
import { erstelleRouter } from './router/router'

// Feature startseite-listen-pruefung im Zusammenspiel von App und Router:
// - AK-11: Suche in der URL; der Chip „Suche: …“ entfernt `suche` aus der URL und setzt Seite 1.
// - AK-13/AK-44 (ADR-0044): Die Ansicht steht nicht in der URL; nach Navigation weg und zurück ist sie wieder aktiv; nach
//   einem Rundgang durch die Seiten stehen im localStorage nur `coin-theme` und `coin-katalog-ansicht`.
// - AK-33 (R2): Auf jeder Seite aus 4.5 genau ein h1 und keine Sprünge (Hilfe `pruefeUeberschriften`).
// - AK-36 (R6): Auf allen Seiten aus 4.5, für alle Rollen, keine englischen Wörter und keine Du-Form in sichtbarem Text,
//   aria-label, title, alt und placeholder.

/** Bestehende Listen ENGLISCH (App-Tests katalog-seiten und aria-texte), zusammengeführt. */
const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Log ?in|Log ?out|Loading|Error|Unauthorized|Forbidden|Access denied|Not Found|Not found|Search|Previous|Next|Page|Add|New|Cancel|Back|Home|Catalog|Description|Publisher|Created|Image|Awards|Issues|Edit|Delete|Retry|Submit|Upload|Choose file)\b/
const ENGLISCH_ARIA =
  /\b(Loading|Close|Toggle|Sidebar|More|Breadcrumb|Notifications?|Dismiss|Previous|Next|Search|Menu|Open|Select|Go to|Page|Pagination|Remove|Clear|Error|Success|Warning)\b/i
const DU_FORM = /\b(du|dein|deine|deinen|deinem|deiner|dich|dir)\b/i

const ALPHA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000a1', name: 'Coin Alpha', auflage: 40 })
const BETA = testCoin({ id: '0199a1b2-0000-7000-8000-0000000000b2', name: 'Coin Beta', auflage: null })
const AUSGABE = testAusgabe({
  id: '0199a1b2-0000-7000-8000-0000000000e1',
  exemplarNummer: 12,
  hologrammnummer: 'AB 12-34',
})
const DETAIL = `/coins/${ALPHA.id}`

let api: FakeApi

interface Optionen {
  als?: TestBenutzer
  zustand?: SitzungsZustand
  coins?: Coin[]
}

function zeigeApp(pfad: string, { als = 'admin', zustand = 'angemeldet', coins = [ALPHA, BETA] }: Optionen = {}) {
  api = erstelleFakeApi(coins, {
    me: zustand === 'anonym' ? null : ME[als],
    ausgaben: { [ALPHA.id]: [AUSGABE] },
    benutzer: [
      testBenutzerEintrag({ id: ME.admin.id, name: ME.admin.name, email: ME.admin.email, rolle: 'Administrator' }),
      testBenutzerEintrag({ name: 'Testperson Anna', email: 'anna@test.local' }),
    ],
    audit: [testAuditEintrag()],
  })
  vi.stubGlobal('fetch', api.fetch)
  const anmeldung = erstelleTestAnmeldung(zustand, ME[als].name)
  const user = userEvent.setup({ applyAccept: false })
  const router = erstelleRouter(createMemoryHistory({ initialEntries: [pfad] }))
  const ansicht = render(<App router={router} userManager={anmeldung.userManager} />)
  return { user, router, ...ansicht }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T09:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

function main(): HTMLElement {
  return screen.getByRole('main')
}

function alleTexte(): string {
  const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
    ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  )
  return [document.body.textContent ?? '', ...attribute].join(' ')
}

/** Seiten aus Abschnitt 4.5 mit Bereitschaftsprüfung (nach dem Laden). */
interface Seite {
  name: string
  pfad: string
  als?: TestBenutzer
  zustand?: SitzungsZustand
  bereit: (user: ReturnType<typeof userEvent.setup>) => Promise<void>
}

const h1 = (name: string | RegExp) => async () => {
  await screen.findByRole('heading', { level: 1, name })
}

const SEITEN: Seite[] = [
  {
    name: 'Startseite',
    pfad: '/',
    bereit: async () => {
      await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })
      await screen.findByRole('region', { name: 'Kennzahlen' })
    },
  },
  {
    name: 'Katalog',
    pfad: '/coins',
    bereit: async () => {
      await screen.findByRole('heading', { level: 1, name: 'Katalog' })
      await screen.findByRole('link', { name: 'Coin Alpha' })
    },
  },
  { name: 'Coin anlegen', pfad: '/coins/neu', bereit: h1('Coin hinzufügen') },
  ...(['stammdaten', 'exemplare', 'ausgaben', 'vorlage'] as const).map((reiter) => ({
    name: `Coin-Detail (${reiter})`,
    pfad: `${DETAIL}?reiter=${reiter}`,
    bereit: async () => {
      await screen.findByRole('heading', { level: 1, name: 'Coin Alpha' })
      await screen.findByRole('tabpanel')
      await waitFor(() => expect(screen.queryAllByText(/wird geladen|werden geladen/)).toHaveLength(0))
    },
  })),
  { name: 'Coin bearbeiten', pfad: `${DETAIL}/bearbeiten`, bereit: h1('Coin bearbeiten') },
  { name: 'Ausgabe erfassen', pfad: `${DETAIL}/ausgaben/neu`, bereit: h1('Ausgabe erfassen') },
  {
    name: 'Ausgabe',
    pfad: `${DETAIL}/ausgaben/${AUSGABE.id}`,
    bereit: h1('Ausgabe von Exemplar Nr. 12'),
  },
  {
    name: 'Prüfung nach einer Prüfung',
    pfad: '/pruefung',
    bereit: async (user) => {
      await screen.findByRole('heading', { level: 1, name: 'Zertifikat prüfen' })
      await gibEin(user, screen.getByLabelText(/^Hologrammnummer/), 'AB 12-34')
      await user.keyboard('{Enter}')
      await screen.findByRole('heading', { level: 2, name: 'Zertifikat gültig' })
    },
  },
  {
    name: 'Benutzerverwaltung (Benutzer)',
    pfad: '/benutzerverwaltung',
    bereit: async () => {
      await screen.findByRole('heading', { level: 1, name: 'Benutzerverwaltung' })
      await screen.findByRole('table', { name: 'Benutzer' })
    },
  },
  {
    name: 'Benutzerverwaltung (Audit-Log)',
    pfad: '/benutzerverwaltung',
    bereit: async (user) => {
      await screen.findByRole('heading', { level: 1, name: 'Benutzerverwaltung' })
      await user.click(screen.getByRole('tab', { name: 'Änderungsprotokoll' }))
      await screen.findByRole('table', { name: 'Änderungsprotokoll' })
    },
  },
  {
    name: 'Startseite verwalten',
    pfad: '/verwaltung/startseite',
    bereit: async () => {
      await screen.findByRole('heading', { level: 1, name: 'Startseite verwalten' })
      await screen.findByRole('switch', { name: 'Kopfbereich anzeigen' })
    },
  },
  { name: 'Kein Zugriff', pfad: '/kein-zugriff', als: 'keine', bereit: h1('Kein Zugriff') },
  { name: 'Abgemeldet', pfad: '/abgemeldet', zustand: 'anonym', bereit: h1('Abgemeldet') },
  {
    name: 'Nicht gefunden',
    pfad: '/gibt-es-nicht',
    bereit: async () => {
      await screen.findByText('Seite nicht gefunden.')
    },
  },
]

// ---------- AK-33: Überschriften ----------

describe('Überschriften je Seite (AK-33)', () => {
  it.each(SEITEN.map((s) => [s.name, s] as const))('%s: genau ein h1, keine Sprünge', async (_, seite) => {
    const { user } = zeigeApp(seite.pfad, { als: seite.als, zustand: seite.zustand })

    await seite.bereit(user)

    pruefeUeberschriften(main())
  })
})

// ---------- AK-36: Texte ----------

const ROLLEN: Array<[string, Optionen]> = [
  ['Administrator', { als: 'admin' }],
  ['Sachbearbeiter', { als: 'sachbearbeiter' }],
  ['Betrachter', { als: 'betrachter' }],
  ['ohne Rolle', { als: 'keine' }],
  ['anonym', { zustand: 'anonym' }],
]

describe('Deutsche Texte ohne Du-Form (AK-36)', () => {
  const PFADE = ['/', '/coins', '/pruefung', '/benutzerverwaltung', '/verwaltung/startseite', DETAIL, '/kein-zugriff']

  it.each(ROLLEN.flatMap(([rolle, optionen]) => PFADE.map((pfad) => [rolle, pfad, optionen] as const)))(
    '%s auf %s: keine englischen Wörter und keine Du-Form',
    async (_, pfad, optionen) => {
      const { router } = zeigeApp(pfad, optionen)
      await screen.findByRole('heading', { level: 1 })
      await waitFor(() => expect(router.state.status).toBe('idle'))
      await waitFor(() => expect(screen.queryAllByText(/wird geladen|werden geladen/)).toHaveLength(0))

      const texte = alleTexte()
      expect(texte).not.toMatch(ENGLISCH)
      expect(texte).not.toMatch(DU_FORM)
      const attribute = [...document.body.querySelectorAll('*')]
        .flatMap((el) => ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''))
        .join(' ')
      expect(attribute).not.toMatch(ENGLISCH_ARIA)
    },
  )

  it.each(SEITEN.map((s) => [s.name, s] as const))(
    '%s: keine englischen Wörter und keine Du-Form',
    async (_, seite) => {
      const { user } = zeigeApp(seite.pfad, { als: seite.als, zustand: seite.zustand })
      await seite.bereit(user)

      expect(alleTexte()).not.toMatch(ENGLISCH)
      expect(alleTexte()).not.toMatch(DU_FORM)
    },
  )
})

// ---------- AK-11: Suche und Chip in der URL ----------

describe('Suche und Chip in der URL (AK-11)', () => {
  it('schreibt die Suche in die URL und zeigt den Chip „Suche: {Begriff}“', async () => {
    const { user, router } = zeigeApp('/coins?seite=2')
    await screen.findByRole('heading', { level: 1, name: 'Katalog' })

    await gibEin(user, screen.getByRole('searchbox', { name: 'Coins suchen' }), 'Alpha')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.search).toEqual({ suche: 'Alpha' }))
    const chips = await screen.findByRole('list', { name: 'Aktive Filter' })
    expect(within(chips).getByText('Suche: Alpha')).toBeInTheDocument()
  })

  it('entfernt per Chip `suche` aus der URL, beginnt auf Seite 1 und lädt genau einmal', async () => {
    const { user, router } = zeigeApp('/coins?suche=Coin&seite=1')
    await screen.findByRole('list', { name: 'Aktive Filter' })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    const vorher = api.anfragenMit('GET', /^\/api\/coins$/).length

    await user.click(screen.getByRole('button', { name: 'Filter „Suche: Coin“ entfernen' }))

    await waitFor(() => expect(router.state.location.search).toEqual({}))
    await waitFor(() => expect(api.anfragenMit('GET', /^\/api\/coins$/)).toHaveLength(vorher + 1))
    expect(
      api
        .anfragenMit('GET', /^\/api\/coins$/)
        .at(-1)
        ?.query.has('suche'),
    ).toBe(false)
  })
})

// ---------- AK-13, AK-44: Ansicht im localStorage, nicht in der URL ----------

describe('Ansicht im localStorage, nicht in der URL (AK-13, AK-44)', () => {
  it('ändert beim Wechsel der Ansicht die URL nicht', async () => {
    const { user, router } = zeigeApp('/coins?suche=Coin')
    await screen.findByRole('table', { name: 'Coins' })
    const vorher = router.state.location.href

    await user.click(within(screen.getByRole('group', { name: 'Ansicht' })).getByRole('button', { name: 'Karten' }))

    await within(screen.getByRole('main')).findByRole('list', { name: 'Coins' })
    expect(router.state.location.href).toBe(vorher)
    expect(router.state.location.href).not.toMatch(/ansicht|karten/)
  })

  it('zeigt nach Navigation weg und zurück wieder die gewählte Ansicht', async () => {
    const { user } = zeigeApp('/coins')
    await screen.findByRole('table', { name: 'Coins' })
    await user.click(within(screen.getByRole('group', { name: 'Ansicht' })).getByRole('button', { name: 'Karten' }))
    await within(screen.getByRole('main')).findByRole('list', { name: 'Coins' })
    const navigation = screen.getByRole('navigation', { name: 'Hauptnavigation' })

    await user.click(within(navigation).getByRole('link', { name: 'Startseite' }))
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })
    await user.click(within(navigation).getByRole('link', { name: 'Katalog' }))

    expect(await within(screen.getByRole('main')).findByRole('list', { name: 'Coins' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Ansicht' })).getByRole('button', { name: 'Karten' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('hat nach einem Rundgang durch die Seiten nur coin-theme und coin-katalog-ansicht im localStorage', async () => {
    const { user, router } = zeigeApp('/coins')
    await screen.findByRole('table', { name: 'Coins' })
    await user.click(within(screen.getByRole('group', { name: 'Ansicht' })).getByRole('button', { name: 'Karten' }))
    await within(screen.getByRole('main')).findByRole('list', { name: 'Coins' })

    for (const pfad of [
      '/',
      '/pruefung',
      DETAIL,
      '/benutzerverwaltung',
      '/verwaltung/startseite',
      '/coins?suche=Beta',
    ]) {
      await router.navigate({ href: pfad })
      await screen.findByRole('heading', { level: 1 })
      await waitFor(() => expect(router.state.status).toBe('idle'))
    }
    await gibEin(user, screen.getByRole('searchbox', { name: 'Coins suchen' }), 'Geheimbegriff')

    expect(
      Object.keys(localStorage)
        .sort()
        .every((k) => ['coin-katalog-ansicht', 'coin-theme'].includes(k)),
    ).toBe(true)
    expect(localStorage.getItem('coin-katalog-ansicht')).toBe('karten')
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/Beta|Geheimbegriff|Alpha/)
  })
})
