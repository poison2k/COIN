import type { BenutzerZustand } from '@/widgets/app-shell'

/** Aus dem Benutzerzustand abgeleitete Zugriffsklasse (rollen-benutzerverwaltung Rev. 3, Abschnitt 12.2). */
export type Zugriffsklasse = 'deaktiviert' | 'ohneRolle' | 'mitRolle'

/**
 * `deaktiviert` (Zustand „deaktiviert“), `ohneRolle` (angemeldet mit Rolle „keine“) oder `mitRolle`; für alle anderen
 * Zustände (prüfe, anonym, Fehler, nicht konfiguriert) `null`. Die Rolle dient nur dieser Unterscheidung, Rechte kommen
 * aus `berechtigungen` (AK-23).
 */
export function zugriffsklasse(zustand: BenutzerZustand): Zugriffsklasse | null {
  switch (zustand.art) {
    case 'deaktiviert':
      return 'deaktiviert'
    case 'angemeldet':
      return zustand.benutzer.rolle === 'keine' ? 'ohneRolle' : 'mitRolle'
    default:
      return null
  }
}
