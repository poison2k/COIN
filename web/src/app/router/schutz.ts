import { redirect } from '@tanstack/react-router'
import { hatBerechtigung, type Benutzer, type Berechtigung } from '@/entities/benutzer'
import { ROUTEN } from '@/shared/config'
import type { AnmeldeStatus } from '@/shared/lib/anmeldung'

/** Was die Guards über die Anmeldung wissen müssen (Router-Kontext, AK-28). */
export interface SchutzKontext {
  anmeldung: { status: AnmeldeStatus; anmelden: (ziel: string) => unknown }
  /** Benutzer laut /api/me; `null`, solange nicht angemeldet, nicht geladen oder deaktiviert. */
  benutzer: Benutzer | null
  /** /api/me lieferte 403 benutzer_deaktiviert (rollen-benutzerverwaltung, AK-32). */
  deaktiviert: boolean
}

/**
 * Verlangt eine Anmeldung. Ohne Sitzung startet die Anmeldung mit Rückkehr auf `ziel`, und die Navigation wird
 * abgebrochen (Weiterleitung zur Startseite, bis der Identitätsanbieter übernimmt). Ohne Konfiguration wird keine
 * Anmeldung gestartet.
 */
export function erfordertAnmeldung(kontext: SchutzKontext, ziel: string): void {
  if (kontext.anmeldung.status === 'angemeldet') return
  if (kontext.anmeldung.status === 'anonym') {
    void kontext.anmeldung.anmelden(ziel)
  }
  throw redirect({ to: ROUTEN.start, replace: true })
}

/**
 * Verlangt eine Anmeldung und eine Berechtigung aus /api/me (AK-25). Deaktiviert oder ohne Rolle geht es nach
 * /kein-zugriff, mit einer Rolle ohne die Berechtigung nach /kein-zugriff?grund=berechtigung (katalog-seiten, AK-11).
 * Die Rolle dient nur der Unterscheidung „ohne Rolle“, das Recht selbst kommt aus `berechtigungen`.
 */
export function erfordertBerechtigung(berechtigung: Berechtigung) {
  return (kontext: SchutzKontext, ziel: string): void => {
    erfordertAnmeldung(kontext, ziel)
    if (kontext.deaktiviert || kontext.benutzer?.rolle === 'keine') {
      throw redirect({ to: ROUTEN.keinZugriff, replace: true })
    }
    if (!hatBerechtigung(kontext.benutzer, berechtigung)) {
      throw redirect({ to: ROUTEN.keinZugriff, search: { grund: 'berechtigung' }, replace: true })
    }
  }
}
