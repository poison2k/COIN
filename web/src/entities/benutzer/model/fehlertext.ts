import type { ApiErgebnis } from '@/shared/api'

const ALLGEMEIN = 'Die Änderung konnte nicht gespeichert werden. Bitte später erneut versuchen.'

/** Deutscher Fehlertext zum Ergebnis einer Rollen- oder Statusänderung, abgeleitet aus `code` bzw. Status (AK-30). */
export function aenderungFehlertext(ergebnis: Exclude<ApiErgebnis<unknown>, { art: 'ok' }>): string {
  switch (ergebnis.art) {
    case 'konflikt':
      if (ergebnis.code === 'letzter_administrator') {
        return 'Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.'
      }
      if (ergebnis.code === 'eigenes_konto') return 'Das eigene Konto kann nicht geändert werden.'
      return ALLGEMEIN
    case 'nichtGefunden':
      return 'Der Benutzer wurde nicht gefunden.'
    case 'keinZugriff':
      return ergebnis.grund === 'deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Sie sind nicht berechtigt, Benutzer zu verwalten.'
    default:
      return ALLGEMEIN
  }
}
