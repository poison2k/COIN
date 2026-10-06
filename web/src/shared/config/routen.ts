/** Pfade der Seiten (ADR-0010). Die Routen selbst werden in app/router definiert. */
export const ROUTEN = {
  start: '/',
  coinListe: '/coins',
  /** Rückkehr vom Identitätsanbieter (Redirect-URI, AK-24). */
  anmeldungRueckruf: '/anmeldung/rueckruf',
  /** Ziel nach dem Abmelden (Post-Logout-URI, AK-31). */
  abgemeldet: '/abgemeldet',
  /** Angemeldet, aber ohne Rolle (AK-29) oder deaktiviert (rollen-benutzerverwaltung, AK-32). */
  keinZugriff: '/kein-zugriff',
  /** Benutzer- und Rollenverwaltung, nur mit users.manage (rollen-benutzerverwaltung, AK-25). */
  benutzerverwaltung: '/benutzerverwaltung',
} as const
