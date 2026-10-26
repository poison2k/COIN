/** Pfade der Seiten (ADR-0010). Die Routen selbst werden in app/router definiert. */
export const ROUTEN = {
  start: '/',
  coinListe: '/coins',
  /** Coin hinzufügen, nur mit coins.write (katalog-seiten, AK-9). */
  coinNeu: '/coins/neu',
  /** Detailseite eines Coins (katalog-seiten, AK-17). */
  coinDetail: '/coins/$coinId',
  /** Ausgabe erfassen, nur mit issues.write (coin-ausgaben, AK-26). */
  coinAusgabeNeu: '/coins/$coinId/ausgaben/neu',
  /** Seite einer einzelnen Ausgabe, nur mit issues.read (zertifikat-erzeugen, AK-27). */
  ausgabeDetail: '/coins/$coinId/ausgaben/$ausgabeId',
  /** Coin bearbeiten mit Motivbild und Zertifikatsvorlage, nur mit coins.write (zertifikatsvorlagen, AK-26). */
  coinBearbeiten: '/coins/$coinId/bearbeiten',
  /** Rückkehr vom Identitätsanbieter (Redirect-URI, AK-24). */
  anmeldungRueckruf: '/anmeldung/rueckruf',
  /** Ziel nach dem Abmelden (Post-Logout-URI, AK-31). */
  abgemeldet: '/abgemeldet',
  /** Angemeldet, aber ohne Rolle (AK-29) oder deaktiviert (rollen-benutzerverwaltung, AK-32). */
  keinZugriff: '/kein-zugriff',
  /** Benutzer- und Rollenverwaltung, nur mit users.manage (rollen-benutzerverwaltung, AK-25). */
  benutzerverwaltung: '/benutzerverwaltung',
  /** Startseite konfigurieren, nur mit startpage.manage (startseite, AK-26). */
  startseiteVerwaltung: '/verwaltung/startseite',
} as const
