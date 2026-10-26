import type { Seite } from '@/shared/api'

/** Rolle aus der API; „keine“ = angemeldet, aber noch keine Rolle zugewiesen (ADR-0013). */
export type Rolle = 'Administrator' | 'Sachbearbeiter' | 'Betrachter' | 'keine'

/** Feste Berechtigungen (ADR-0016). Das Frontend leitet Sichtbarkeit nur aus ihnen ab, nie aus der Rolle. */
export type Berechtigung =
  | 'coins.read'
  | 'coins.write'
  | 'issues.read'
  | 'issues.write'
  | 'users.manage'
  | 'audit.read'
  /** Startseite konfigurieren (startseite, ADR-0032 Punkt 5). */
  | 'startpage.manage'

/** Der angemeldete Benutzer laut GET /api/me (AK-20, rollen-benutzerverwaltung AK-10). `id` ist nicht `sub`. */
export interface Benutzer {
  id: string
  name: string
  email: string | null
  rolle: Rolle
  /** Berechtigungen laut Rechtematrix, ordinal sortiert. */
  berechtigungen: Berechtigung[]
}

/** Eintrag der Benutzerliste (GET /api/benutzer, AK-11). */
export interface BenutzerEintrag {
  id: string
  name: string
  email: string | null
  rolle: Rolle
  aktiv: boolean
  erstelltAm: string
}

export type { Seite }

/** Hat der Benutzer die Berechtigung? `false` für `null` (nicht angemeldet, nicht geladen oder deaktiviert). */
export function hatBerechtigung(benutzer: Benutzer | null, berechtigung: Berechtigung): boolean {
  return benutzer?.berechtigungen?.includes(berechtigung) ?? false
}

/** Deutsche Anzeige der Rollen (nur Anzeige und Auswahl, nie für Rechte). */
export const ROLLEN_ANZEIGE: Readonly<Record<Rolle, string>> = {
  Administrator: 'Administrator',
  Sachbearbeiter: 'Sachbearbeiter',
  Betrachter: 'Betrachter',
  keine: 'Keine Rolle',
}
