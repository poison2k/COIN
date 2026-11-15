import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi } from '../../../../test/fakeApi'
import { zeigeMitRouter } from '../../../../test/router'
import { gespeicherteKonfiguration, testKonfiguration } from '../../../../test/startseite'
import { pruefeUeberschriften } from '../../../../test/ueberschriften'
import { StartseiteVerwaltungSeite } from '../index'

// Feature startseite-listen-pruefung, AK-28, AK-30 und AK-33 (Abschnitt 4.4): Seitenkopf „Startseite verwalten“ mit der
// Beschreibung „Blöcke der Startseite ein- und ausschalten, ordnen und mit Inhalt füllen.“ bzw. „Zuletzt gespeichert am
// …“ im Format „TT.MM.JJJJ, HH:MM Uhr“ nach Europe/Berlin (auch bei anderer Prozess-Zeitzone), Reiter darunter, keine
// Sprünge in den Überschriften. Die Prozess-Zeitzone wird vor dem Laden der Module auf America/New_York gesetzt.

// Node-Prozessumgebung ohne Node-Typen im App-Projekt (tsconfig.app.json kennt nur DOM-Typen).
const umgebung = vi.hoisted(() => {
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
  const alt = env.TZ
  env.TZ = 'America/New_York'
  return { env, alt }
})

afterAll(() => {
  if (umgebung.alt === undefined) delete umgebung.env.TZ
  else umgebung.env.TZ = umgebung.alt
})

const BESCHREIBUNG_STANDARD = 'Blöcke der Startseite ein- und ausschalten, ordnen und mit Inhalt füllen.'

function zeige(konfiguration = testKonfiguration()) {
  const api = erstelleFakeApi([], { me: ME.admin, startseite: { konfiguration } })
  vi.stubGlobal('fetch', api.fetch)
  const user = userEvent.setup({ applyAccept: false })
  zeigeMitRouter(() => <StartseiteVerwaltungSeite onGeaendert={vi.fn()} />)
  return { user, api }
}

async function geladen(): Promise<void> {
  await screen.findByRole('switch', { name: 'Kopfbereich anzeigen' })
}

describe('Seitenkopf (AK-28)', () => {
  it('zeigt ohne gespeicherte Konfiguration die Beschreibung aus 4.4', async () => {
    zeige()
    await geladen()

    expect(screen.getByText(BESCHREIBUNG_STANDARD)).toBeInTheDocument()
  })

  it('zeigt mit gespeicherter Konfiguration statt der Beschreibung „Zuletzt gespeichert am …“', async () => {
    zeige(gespeicherteKonfiguration())
    await geladen()

    expect(screen.getByText(/^Zuletzt gespeichert am /)).toBeInTheDocument()
    expect(screen.queryByText(BESCHREIBUNG_STANDARD)).not.toBeInTheDocument()
  })

  it('behält die Reiter „Bearbeiten“ und „Vorschau“', async () => {
    zeige()
    await geladen()

    expect(screen.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual(['Bearbeiten', 'Vorschau'])
  })
})

describe('Zeitpunkt „Zuletzt gespeichert am“ (AK-30)', () => {
  it('formatiert als „TT.MM.JJJJ, HH:MM Uhr“ in Europe/Berlin', async () => {
    zeige(gespeicherteKonfiguration({ geaendertAm: '2026-10-19T08:00:00Z', geaendertVon: 'Test Administrator' }))
    await geladen()

    expect(screen.getByText('Zuletzt gespeichert am 19.10.2026, 10:00 Uhr von Test Administrator')).toBeInTheDocument()
  })

  it('rechnet in der Winterzeit über den Tageswechsel nach Europe/Berlin um', async () => {
    zeige(gespeicherteKonfiguration({ geaendertAm: '2026-01-31T23:05:00Z', geaendertVon: 'Test Administrator' }))
    await geladen()

    expect(screen.getByText('Zuletzt gespeichert am 01.02.2026, 00:05 Uhr von Test Administrator')).toBeInTheDocument()
  })
})

describe('Überschriften (AK-33)', () => {
  it('hat im Reiter „Bearbeiten“ genau ein h1 und keine Sprünge', async () => {
    zeige()
    await geladen()

    pruefeUeberschriften()
  })

  it('hat im Reiter „Vorschau“ genau ein h1 und keine Sprünge', async () => {
    const { user } = zeige()
    await geladen()

    await user.click(screen.getByRole('tab', { name: 'Vorschau' }))
    await screen.findByRole('region', { name: 'Vorschau der Startseite' })

    pruefeUeberschriften()
  })
})
