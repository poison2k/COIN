import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { angemeldet, zeigeShell } from '../../../../test/shell'
import type { BenutzerZustand } from '../index'

// Feature design-fundament, AK-31 (Abschnitt 6.3): Kopfzeile mit Name und Rolle, Theme-Umschalter und Abmelden bzw.
// Anmelden; alles im einzigen <header>. Die Rolle ist reine Anzeige (ROLLEN_ANZEIGE).

async function kopfzeile(zustand: BenutzerZustand): Promise<HTMLElement> {
  zeigeShell(zustand)
  await screen.findByRole('heading', { level: 1 })
  return screen.getByRole('banner')
}

describe('angemeldet (AK-31)', () => {
  it('enthält „Angemeldet als <Name>“', async () => {
    const kopf = await kopfzeile(angemeldet(ME.admin))

    expect(kopf.textContent).toContain('Angemeldet als Test Administrator')
  })

  it.each([
    ['admin', 'Administrator'],
    ['sachbearbeiter', 'Sachbearbeiter'],
    ['betrachter', 'Betrachter'],
  ] as const)('zeigt für %s die Rolle „%s“', async (benutzer, rolle) => {
    const kopf = await kopfzeile(angemeldet(ME[benutzer]))

    // Die Testnamen enthalten die Rolle („Test Administrator“); deshalb mit dem sr-only-Präfix „Rolle: “ prüfen.
    expect(kopf.textContent).toContain(`Rolle: ${rolle}`)
  })

  it('zeigt ohne Rolle „Keine Rolle“', async () => {
    const kopf = await kopfzeile(angemeldet(ME.keine))

    expect(kopf.textContent).toContain('Rolle: Keine Rolle')
  })
  it('kündigt die Rolle für Screenreader mit „, Rolle: “ an', async () => {
    const kopf = await kopfzeile(angemeldet(ME.betrachter))

    expect(kopf.textContent).toMatch(/Angemeldet als Test Betrachter\s*, Rolle: Betrachter/)
  })

  it('enthält den Button „Abmelden“ in header', async () => {
    const kopf = await kopfzeile(angemeldet())

    expect(within(kopf).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
  })

  it('enthält den Button „Farbschema wählen“ in header', async () => {
    const kopf = await kopfzeile(angemeldet())

    expect(within(kopf).getByRole('button', { name: 'Farbschema wählen' })).toBeInTheDocument()
  })

  it('enthält den Button „Seitenleiste ein-/ausblenden“ in header', async () => {
    const kopf = await kopfzeile(angemeldet())

    expect(within(kopf).getByRole('button', { name: 'Seitenleiste ein-/ausblenden' })).toBeInTheDocument()
  })

  it('hat keinen Button „Anmelden“', async () => {
    const kopf = await kopfzeile(angemeldet())

    expect(within(kopf).queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
  })

  it('zeigt die E-Mail-Adresse nicht an', async () => {
    const kopf = await kopfzeile(angemeldet(ME.admin))

    expect(kopf.textContent).not.toContain(ME.admin.email)
  })
})

describe('anonym und nicht konfiguriert (AK-31)', () => {
  it('zeigt anonym „Anmelden“ und den Umschalter', async () => {
    const kopf = await kopfzeile({ art: 'anonym' })

    expect(await within(kopf).findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
    expect(within(kopf).getByRole('button', { name: 'Farbschema wählen' })).toBeInTheDocument()
  })

  it('zeigt ohne Konfiguration den bisherigen Hinweis statt „Anmelden“ und den Umschalter', async () => {
    // Bestand (anmeldung-keycloak, AK-23): Ohne IdP-Konfiguration steht statt des Buttons ein Hinweis.
    const kopf = await kopfzeile({ art: 'nichtKonfiguriert' })

    expect(kopf).toHaveTextContent('Anmeldung ist nicht konfiguriert.')
    expect(within(kopf).getByRole('button', { name: 'Farbschema wählen' })).toBeInTheDocument()
  })

  it('zeigt anonym weder „Angemeldet als“ noch eine Rolle', async () => {
    const kopf = await kopfzeile({ art: 'anonym' })

    expect(kopf.textContent).not.toMatch(/Angemeldet als|Rolle:/)
  })
})

describe('weitere Zustände (AK-31)', () => {
  it('zeigt während der Prüfung nur den Umschalter, weder „Anmelden“ noch „Abmelden“', async () => {
    const kopf = await kopfzeile({ art: 'pruefe' })

    expect(within(kopf).getByRole('button', { name: 'Farbschema wählen' })).toBeInTheDocument()
    expect(within(kopf).queryByRole('button', { name: /^(An|Ab)melden$/ })).not.toBeInTheDocument()
  })

  it('zeigt deaktiviert „Abmelden“, aber keinen Namen und keine Rolle', async () => {
    const kopf = await kopfzeile({ art: 'deaktiviert' })

    expect(within(kopf).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    expect(kopf.textContent).not.toMatch(/Angemeldet als|Rolle:/)
  })

  it('zeigt bei einem Fehler die Meldung mit „Erneut versuchen“ in header', async () => {
    const erneutVersuchen = vi.fn()
    const kopf = await kopfzeile({ art: 'fehler', erneutVersuchen })

    expect(within(kopf).getByRole('alert')).toHaveTextContent('Ihre Anmeldung konnte nicht geprüft werden.')
    expect(within(kopf).getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
    expect(within(kopf).getByRole('button', { name: 'Farbschema wählen' })).toBeInTheDocument()
  })
})
