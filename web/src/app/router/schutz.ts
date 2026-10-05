import { redirect } from '@tanstack/react-router'
import type { Benutzer, Rolle } from '@/entities/benutzer'
import { ROUTEN } from '@/shared/config'
import type { AnmeldeStatus } from '@/shared/lib/anmeldung'

/** Was die Guards über die Anmeldung wissen müssen (Router-Kontext, AK-28). */
export interface SchutzKontext {
  anmeldung: { status: AnmeldeStatus; anmelden: (ziel: string) => unknown }
  /** Benutzer laut /api/me; `null`, solange nicht angemeldet oder nicht geladen. */
  benutzer: Benutzer | null
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
 * Verlangt eine Anmeldung und eine der Rollen. Ohne Rolle geht es nach /kein-zugriff, mit einer anderen Rolle
 * zur Startseite.
 */
export function erfordertRolle(rollen: readonly Rolle[]) {
  return (kontext: SchutzKontext, ziel: string): void => {
    erfordertAnmeldung(kontext, ziel)
    const rolle = kontext.benutzer?.rolle
    if (rolle === 'keine') throw redirect({ to: ROUTEN.keinZugriff, replace: true })
    if (!rolle || !rollen.includes(rolle)) throw redirect({ to: ROUTEN.start, replace: true })
  }
}
