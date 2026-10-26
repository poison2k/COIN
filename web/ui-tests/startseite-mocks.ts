import type { Page } from '@playwright/test'

// Feature startseite (Abschnitt 9.7): Seit der konfigurierbaren Startseite ruft `/` je nach Berechtigung
// GET /api/startseite (mit coins.read) oder GET /api/startseite/kopf (ohne) auf. Die bestehenden UI-Tests prüfen mit
// einem Catch-all, dass kein API-Aufruf ungemockt bleibt; diese Hilfe mockt deshalb die Standardstartseite
// (inaktiver Kopf, Standardblöcke ohne Daten, AK-1). Später registrierte Routen eines Tests haben Vorrang.

export const STANDARD_INFOTEXT =
  'C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die Echtheitszertifikate.'

/** Antwort von GET /api/startseite ohne gespeicherte Konfiguration und ohne Daten (AK-1). */
export function standardStartseite() {
  return {
    bloecke: [
      { art: 'infotext', text: STANDARD_INFOTEXT },
      { art: 'kennzahlen', coins: 0, exemplare: 0, ausgegeben: 0, verfuegbar: 0 },
      { art: 'neueste', eintraege: [] },
      { art: 'meistausgegeben', eintraege: [] },
    ],
  }
}

/** Mockt GET /api/startseite (Standardblöcke) und GET /api/startseite/kopf (inaktiv, Position 1). */
export async function mockeStartseiteStandard(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/startseite' || url.pathname === '/api/startseite/kopf',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }
      const kopf = new URL(route.request().url()).pathname.endsWith('/kopf')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify(kopf ? { aktiv: false, position: 1 } : standardStartseite()),
      })
    },
  )
}
