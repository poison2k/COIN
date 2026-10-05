/** Rolle aus GET /api/me; „keine“ = angemeldet, aber noch keine Rolle zugewiesen (ADR-0013). */
export type Rolle = 'Administrator' | 'Sachbearbeiter' | 'Betrachter' | 'keine'

/** Der angemeldete Benutzer laut GET /api/me (AK-20). `id` ist die interne Kennung, nicht `sub`. */
export interface Benutzer {
  id: string
  name: string
  email: string | null
  rolle: Rolle
}

const SCHREIBROLLEN: readonly Rolle[] = ['Administrator', 'Sachbearbeiter']

/** Nur Administrator und Sachbearbeiter dürfen den Coin-Katalog ändern (AK-19, AK-33). */
export function darfKatalogSchreiben(rolle: Rolle): boolean {
  return SCHREIBROLLEN.includes(rolle)
}
