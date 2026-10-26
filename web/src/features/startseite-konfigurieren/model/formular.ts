import {
  ALTTEXT_MAX,
  BLOCK_ARTEN,
  INFOTEXT_MAX,
  LOGO_PLAETZE,
  TITEL_MAX,
  UNTERTITEL_MAX,
  type Block,
  type BlockArt,
  type Konfiguration,
  type Logo,
  type LogoMeta,
  type LogoPlatz,
} from '@/entities/startseite'
import { LOGO_GENITIV, validiereLogo } from './validiereLogo'

/** Eingaben zu einem Logo-Platz: vorhandenes Logo (Server), neu ausgewählte Datei, Alternativtext. */
export interface LogoEingabe {
  vorhanden: LogoMeta | null
  datei: File | null
  alternativtext: string
}

/** Formularzustand der Konfigurationsseite (Abschnitt 7); ungespeichert, Grundlage der Vorschau (AK-29). */
export interface Formular {
  reihenfolge: BlockArt[]
  aktiv: Record<BlockArt, boolean>
  titel: string
  untertitel: string
  infotext: string
  anzahl: { neueste: number; meistausgegeben: number }
  logos: Record<LogoPlatz, LogoEingabe>
}

/** Feldfehler je Schlüssel wie in der API (Abschnitt 5.5), z. B. `kopf.titel`, `logoSoftware`. */
export type Feldfehler = Record<string, string>

/** Schlüssel der Logo-Felder (Dateiteil und Alternativtext) je Platz. */
export const LOGO_FELD: Readonly<Record<LogoPlatz, 'logoBereitsteller' | 'logoSoftware'>> = {
  bereitsteller: 'logoBereitsteller',
  software: 'logoSoftware',
}

export function alttextFeld(platz: LogoPlatz): string {
  return `kopf.${LOGO_FELD[platz]}.alternativtext`
}

/** Formularzustand aus der geladenen bzw. gespeicherten Konfiguration. */
export function ausKonfiguration(k: Konfiguration): Formular {
  return {
    reihenfolge: [...k.reihenfolge],
    aktiv: {
      kopf: k.kopf.aktiv,
      infotext: k.infotext.aktiv,
      kennzahlen: k.kennzahlen.aktiv,
      neueste: k.neueste.aktiv,
      meistausgegeben: k.meistausgegeben.aktiv,
    },
    titel: k.kopf.titel,
    untertitel: k.kopf.untertitel,
    infotext: k.infotext.text,
    anzahl: { neueste: k.neueste.anzahl, meistausgegeben: k.meistausgegeben.anzahl },
    logos: {
      bereitsteller: logoEingabe(k.kopf.logoBereitsteller),
      software: logoEingabe(k.kopf.logoSoftware),
    },
  }
}

function logoEingabe(logo: LogoMeta | null): LogoEingabe {
  return { vorhanden: logo, datei: null, alternativtext: logo?.alternativtext ?? '' }
}

/** Verschiebt einen Block um eine Stelle (AK-28); am Rand unverändert. */
export function verschiebe(f: Formular, art: BlockArt, richtung: -1 | 1): Formular {
  const index = f.reihenfolge.indexOf(art)
  const ziel = index + richtung
  if (index < 0 || ziel < 0 || ziel >= f.reihenfolge.length) return f
  const reihenfolge = [...f.reihenfolge]
  reihenfolge[index] = reihenfolge[ziel]
  reihenfolge[ziel] = art
  return { ...f, reihenfolge }
}

/** Schaltet einen Block ein oder aus. */
export function schalte(f: Formular, art: BlockArt, an: boolean): Formular {
  return { ...f, aktiv: { ...f.aktiv, [art]: an } }
}

/** Ist ein Logo vorhanden oder ausgewählt? Dann ist der Alternativtext Pflicht (AK-27). */
export function hatLogo(eingabe: LogoEingabe): boolean {
  return eingabe.vorhanden !== null || eingabe.datei !== null
}

/** Weicht das Formular von der Konfiguration ab (AK-32)? Eine ausgewählte Datei gilt immer als Änderung. */
export function istGeaendert(f: Formular, k: Konfiguration): boolean {
  const ausgang = ausKonfiguration(k)
  if (LOGO_PLAETZE.some((p) => f.logos[p].datei !== null || f.logos[p].vorhanden !== ausgang.logos[p].vorhanden)) {
    return true
  }
  return (
    f.reihenfolge.join(',') !== ausgang.reihenfolge.join(',') ||
    BLOCK_ARTEN.some((art) => f.aktiv[art] !== ausgang.aktiv[art]) ||
    f.titel !== ausgang.titel ||
    f.untertitel !== ausgang.untertitel ||
    f.infotext !== ausgang.infotext ||
    f.anzahl.neueste !== ausgang.anzahl.neueste ||
    f.anzahl.meistausgegeben !== ausgang.anzahl.meistausgegeben ||
    LOGO_PLAETZE.some((p) => f.logos[p].alternativtext !== ausgang.logos[p].alternativtext)
  )
}

/** Client-Vorprüfung (AK-30) mit den Meldungen aus 5.5; maßgeblich bleibt der Server. */
export function validiere(f: Formular): Feldfehler {
  const fehler: Feldfehler = {}
  const titel = f.titel.trim()
  if (titel.length > TITEL_MAX) fehler['kopf.titel'] = 'Der Titel darf höchstens 100 Zeichen lang sein.'
  else if (f.aktiv.kopf && titel === '') {
    fehler['kopf.titel'] = 'Bitte einen Titel eingeben oder den Kopfbereich ausschalten.'
  }
  if (f.untertitel.trim().length > UNTERTITEL_MAX) {
    fehler['kopf.untertitel'] = 'Der Untertitel darf höchstens 200 Zeichen lang sein.'
  }
  for (const platz of LOGO_PLAETZE) {
    const eingabe = f.logos[platz]
    if (eingabe.datei) {
      const meldung = validiereLogo(eingabe.datei, platz)
      if (meldung) fehler[LOGO_FELD[platz]] = meldung
    }
    if (!hatLogo(eingabe)) continue
    const alternativtext = eingabe.alternativtext.trim()
    if (alternativtext === '') {
      fehler[alttextFeld(platz)] = `Bitte einen Alternativtext für das Logo ${LOGO_GENITIV[platz]} eingeben.`
    } else if (alternativtext.length > ALTTEXT_MAX) {
      fehler[alttextFeld(platz)] = 'Der Alternativtext darf höchstens 200 Zeichen lang sein.'
    }
  }
  if (f.infotext.length > INFOTEXT_MAX) fehler['infotext.text'] = 'Der Infotext darf höchstens 5.000 Zeichen lang sein.'
  else if (f.aktiv.infotext && f.infotext.trim() === '') {
    fehler['infotext.text'] = 'Bitte einen Infotext eingeben oder den Block ausschalten.'
  }
  return fehler
}

/** Teil `konfiguration` des PUT (Abschnitt 5.4): Logos als `{ alternativtext }` oder `null`. */
export function zuAnfrage(f: Formular, version: number) {
  const logo = (platz: LogoPlatz) =>
    hatLogo(f.logos[platz]) ? { alternativtext: f.logos[platz].alternativtext } : null
  return {
    version,
    reihenfolge: f.reihenfolge,
    kopf: {
      aktiv: f.aktiv.kopf,
      titel: f.titel,
      untertitel: f.untertitel,
      logoBereitsteller: logo('bereitsteller'),
      logoSoftware: logo('software'),
    },
    infotext: { aktiv: f.aktiv.infotext, text: f.infotext },
    kennzahlen: { aktiv: f.aktiv.kennzahlen },
    neueste: { aktiv: f.aktiv.neueste, anzahl: f.anzahl.neueste },
    meistausgegeben: { aktiv: f.aktiv.meistausgegeben, anzahl: f.anzahl.meistausgegeben },
  }
}

/**
 * Blöcke für die Vorschau (AK-29) aus dem ungespeicherten Formular: Daten aus `daten`, gekürzt auf die eingestellte
 * Anzahl; neu ausgewählte Logos über ihre Object-URL, entfernte Logos fehlen.
 */
export function zuAnsicht(
  f: Formular,
  daten: Konfiguration['daten'],
  logoUrls: Readonly<Record<LogoPlatz, string | null>>,
): Block[] {
  const logo = (platz: LogoPlatz): Logo | null => {
    const eingabe = f.logos[platz]
    if (eingabe.datei) {
      const url = logoUrls[platz]
      return url ? { url, alternativtext: eingabe.alternativtext.trim() } : null
    }
    return eingabe.vorhanden
      ? {
          url: eingabe.vorhanden.url,
          alternativtext: eingabe.alternativtext.trim(),
          breite: eingabe.vorhanden.breite,
          hoehe: eingabe.vorhanden.hoehe,
        }
      : null
  }

  return f.reihenfolge
    .filter((art) => f.aktiv[art])
    .map((art): Block => {
      switch (art) {
        case 'kopf':
          return {
            art,
            titel: f.titel.trim(),
            untertitel: f.untertitel.trim(),
            logoBereitsteller: logo('bereitsteller'),
            logoSoftware: logo('software'),
          }
        case 'infotext':
          return { art, text: f.infotext }
        case 'kennzahlen':
          return { art, ...daten.kennzahlen }
        case 'neueste':
          return { art, eintraege: daten.neueste.slice(0, f.anzahl.neueste) }
        case 'meistausgegeben':
          return { art, eintraege: daten.meistausgegeben.slice(0, f.anzahl.meistausgegeben) }
      }
    })
}
