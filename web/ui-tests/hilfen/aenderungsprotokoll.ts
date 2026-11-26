import type { Page, Route } from '@playwright/test'

// Gemeinsame Mocks des Änderungsprotokolls (Feature nacharbeiten-audit-filter, Abschnitt 8 und K1): die Liste der
// Aktionen (GET /api/audit/aktionen, AK-7) und die Auswertung der Filter von GET /api/audit (von/bis als Berliner
// Kalendertag, aktion mehrfach per ODER, benutzerId). Nur Testhilfe; die Regeln selbst prüft die API.

/** Antwort von GET /api/audit/aktionen (AK-7). */
export const AUDIT_AKTIONEN = [
  { wert: 'Rolle', bezeichnung: 'Rolle' },
  { wert: 'Status', bezeichnung: 'Status' },
]

const BERLINER_TAG = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Kalendertag `JJJJ-MM-TT` eines Zeitpunkts in Europe/Berlin. */
export function berlinerTag(zeitpunkt: string): string {
  return BERLINER_TAG.format(new Date(zeitpunkt))
}

interface Filterbar {
  zeitpunkt: string
  art: string
  benutzer: { id: string }
}

/** Wendet `von`, `bis`, `aktion` und `benutzerId` der URL auf die Einträge an (wie die API, ADR-0045). */
export function filtereAudit<T extends Filterbar>(eintraege: readonly T[], query: URLSearchParams): T[] {
  const benutzerId = query.get('benutzerId')
  const von = query.get('von')
  const bis = query.get('bis')
  const aktionen = query.getAll('aktion').filter((a) => a !== '')
  return eintraege.filter((e) => {
    const tag = berlinerTag(e.zeitpunkt)
    return (
      (!benutzerId || e.benutzer.id === benutzerId) &&
      (!von || tag >= von) &&
      (!bis || tag <= bis) &&
      (aktionen.length === 0 || aktionen.includes(e.art))
    )
  })
}

/** Mockt GET /api/audit/aktionen (200 mit der Liste; ohne `erlaubt` 403). Liefert die Zahl der Abrufe. */
export async function mockeAuditAktionen(
  page: Page,
  { erlaubt = true, fehler = false }: { erlaubt?: boolean; fehler?: boolean } = {},
): Promise<{ abrufe: () => number }> {
  let abrufe = 0
  await page.route(
    (url) => url.pathname === '/api/audit/aktionen',
    async (route: Route) => {
      abrufe++
      if (fehler) {
        return route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify({ title: 'Interner Fehler', status: 500 }),
        })
      }
      if (!erlaubt) {
        return route.fulfill({
          status: 403,
          contentType: 'application/problem+json',
          body: JSON.stringify({ status: 403, title: 'Kein Zugriff', code: 'keine_berechtigung' }),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AUDIT_AKTIONEN) })
    },
  )
  return { abrufe: () => abrufe }
}
