import { KONFIGURATION_URL, LOGO_PLAETZE, type Konfiguration } from '@/entities/startseite'
import { sende } from '@/shared/api'
import { LOGO_FELD, zuAnfrage, type Feldfehler, type Formular } from '../model/formular'
import { LOGO_GENITIV } from '../model/validiereLogo'

/** Ergebnis des Speicherns, abgebildet auf das, was die Oberfläche zeigt (AK-30, AK-31). */
export type SpeichernErgebnis =
  | { art: 'gespeichert'; konfiguration: Konfiguration }
  /** Feldfehler (400, 413 mit `feld`); Schlüssel wie in 5.5. `zusammenfassung` für Befunde ohne eigenes Feld. */
  | { art: 'feldfehler'; fehler: Feldfehler; zusammenfassung: string | null }
  /** 409 `startseite_geaendert` (AK-13). */
  | { art: 'konflikt' }
  | { art: 'meldung'; text: string; hinweis?: boolean }

const TEXT_ALLGEMEIN = 'Die Startseite konnte nicht gespeichert werden. Bitte später erneut versuchen.'
const TEXT_SERVER_VALIDIERUNG = 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfen und erneut speichern.'

/**
 * PUT /api/startseite/konfiguration (Abschnitt 5.4) als multipart/form-data: Teil `konfiguration` (JSON als Text) und
 * je neu ausgewähltem Logo ein Dateiteil. Den Content-Type mit Boundary setzt der Browser.
 */
export async function speichereKonfiguration(f: Formular, version: number): Promise<SpeichernErgebnis> {
  const formular = new FormData()
  formular.append('konfiguration', JSON.stringify(zuAnfrage(f, version)))
  for (const platz of LOGO_PLAETZE) {
    const datei = f.logos[platz].datei
    if (datei) formular.append(LOGO_FELD[platz], datei, datei.name)
  }

  const ergebnis = await sende<Konfiguration>(KONFIGURATION_URL, { method: 'PUT', body: formular }, [200])
  switch (ergebnis.art) {
    case 'ok':
      return { art: 'gespeichert', konfiguration: ergebnis.daten }
    case 'validierung': {
      const fehler: Feldfehler = {}
      for (const [feld, meldungen] of Object.entries(ergebnis.fehler)) {
        if (meldungen.length > 0) fehler[feld] = meldungen.join(' ')
      }
      return {
        art: 'feldfehler',
        fehler,
        zusammenfassung: Object.keys(fehler).length === 0 ? TEXT_SERVER_VALIDIERUNG : null,
      }
    }
    case 'zuGross': {
      const platz = LOGO_PLAETZE.find((p) => LOGO_FELD[p] === ergebnis.feld)
      if (platz) {
        return {
          art: 'feldfehler',
          fehler: { [LOGO_FELD[platz]]: `Das Logo ${LOGO_GENITIV[platz]} darf höchstens 2 MB groß sein.` },
          zusammenfassung: null,
        }
      }
      return {
        art: 'meldung',
        text:
          ergebnis.feld === 'konfiguration'
            ? 'Die Konfiguration ist zu groß.'
            : 'Die Anfrage ist zu groß. Logos dürfen höchstens 2 MB groß sein.',
      }
    }
    case 'konflikt':
      return ergebnis.code === 'startseite_geaendert' ? { art: 'konflikt' } : { art: 'meldung', text: TEXT_ALLGEMEIN }
    case 'keinZugriff':
      return {
        art: 'meldung',
        text:
          ergebnis.grund === 'deaktiviert'
            ? 'Ihr Benutzerkonto ist deaktiviert.'
            : 'Sie sind nicht berechtigt, die Startseite zu verwalten.',
      }
    case 'nichtAngemeldet':
      return {
        art: 'meldung',
        text: 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …',
        hinweis: true,
      }
    default:
      return { art: 'meldung', text: TEXT_ALLGEMEIN }
  }
}
