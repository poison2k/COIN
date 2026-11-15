import { describe, expect, it } from 'vitest'

// Feature startseite-listen-pruefung, Konsistenz-Durchgang (Abschnitt 4.5), Code-Tests:
// - AK-35 (R5): In widgets und pages gibt es kein <p role="alert"> für Ladefehler und keinen Leertext als bloßes <p>;
//   Leer-, Lade- und Fehlerzustände kommen aus shared/ui/zustaende. Ausnahmen (Aktionsmeldungen) stehen mit Begründung
//   in AUSNAHMEN_ALARM.
// - AK-37 (R7): Außer shared/lib/format.ts erzeugt keine Datei in web/src eigene Intl.DateTimeFormat-Instanzen;
//   entities/coin/ui/format.ts nutzt die gemeinsamen Funktionen.
// - AK-36 (R6): keine Du-Form in Texten der Quelltexte (Zeichenketten und JSX-Text).

const alle = import.meta.glob<string>(['/src/**/*.ts', '/src/**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const produktiv = Object.entries(alle).filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))
const seitenUndWidgets = produktiv.filter(([pfad]) => /^\/src\/(widgets|pages)\//.test(pfad) && pfad.endsWith('.tsx'))

/** Alle <p …role="alert"…>…</p> mit Inhalt (Leerraum zusammengefasst). */
function alarmAbsaetze(inhalt: string): string[] {
  return [...inhalt.matchAll(/<p\b[^>]*\brole="alert"[^>]*>([\s\S]*?)<\/p>/g)].map((t) =>
    t[1].replace(/\s+/g, ' ').trim(),
  )
}

/** Ausnahmen: Meldungen zu einer Aktion des Benutzers (kein Ladefehler einer Seite oder Liste), mit Begründung. */
const AUSNAHMEN_ALARM: Record<string, string> = {
  '/src/widgets/benutzer-tabelle/ui/BenutzerTabelle.tsx: {meldung.text}':
    'Fehler einer Rollen- oder Statusänderung (Aktionsmeldung an der Tabelle, rollen-benutzerverwaltung AK-29).',
  '/src/widgets/zertifikatsvorlage/ui/ZertifikatsvorlageVerwalten.tsx: {downloadFehler}':
    'Fehler eines Downloads (Aktionsmeldung, zertifikatsvorlagen AK-30).',
  '/src/pages/kein-zugriff/ui/KeinZugriffSeite.tsx: {meldung.text}':
    'Ergebnis der Aktion auf der Seite „Kein Zugriff“ (Aktionsmeldung, keine Ladeanzeige).',
}

/** Typische Leertexte (bestehende Texte aus den Entwürfen). */
const LEERTEXT =
  /^(\{[^}]*\?\s*)?['"`]?(Noch keine|Keine [^'"`<]*(gefunden|mit diesem)|Auf dieser Seite gibt es keine|Es wurde noch keine)/

/** Inhalte bloßer <p>-Elemente (ohne verschachtelte Elemente). */
function absatzInhalte(inhalt: string): string[] {
  return [...inhalt.matchAll(/<p\b[^>]*>([^<]*)<\/p>/g)].map((t) => t[1].replace(/\s+/g, ' ').trim())
}

describe('Zustände nur über die Bausteine (AK-35, R5)', () => {
  it('findet Seiten und Widgets (Selbsttest)', () => {
    expect(seitenUndWidgets.length).toBeGreaterThan(15)
    expect(alarmAbsaetze('<p role="alert" className="x">\n  Text\n</p>')).toEqual(['Text'])
    expect(LEERTEXT.test("{mitSuchbegriff ? 'Keine Coins gefunden.' : 'Noch keine Coins erfasst.'}")).toBe(true)
    expect(LEERTEXT.test('Noch keine Einträge.')).toBe(true)
    expect(LEERTEXT.test('{meldung.text}')).toBe(false)
  })

  it('verwendet in widgets und pages kein <p role="alert"> außer den begründeten Aktionsmeldungen', () => {
    const treffer = seitenUndWidgets.flatMap(([pfad, inhalt]) =>
      alarmAbsaetze(inhalt)
        .map((text) => `${pfad}: ${text}`)
        .filter((schluessel) => !(schluessel in AUSNAHMEN_ALARM)),
    )

    expect(treffer).toEqual([])
  })

  it('verwendet in widgets und pages für Ladefehler kein <p role="alert"> (auch nicht über Konstanten)', () => {
    const treffer = seitenUndWidgets.flatMap(([pfad, inhalt]) =>
      alarmAbsaetze(inhalt)
        .filter((text) => /geladen|LADEFEHLER|FEHLERTEXT/i.test(text))
        .map((text) => `${pfad}: ${text}`),
    )

    expect(treffer).toEqual([])
  })

  it('zeigt in widgets und pages keinen Leertext als bloßes <p>', () => {
    const treffer = seitenUndWidgets.flatMap(([pfad, inhalt]) =>
      absatzInhalte(inhalt)
        .filter((text) => LEERTEXT.test(text))
        .map((text) => `${pfad}: ${text}`),
    )

    expect(treffer).toEqual([])
  })

  it('hält die Liste der Ausnahmen aktuell (jede Ausnahme kommt noch vor)', () => {
    const vorhanden = new Set(
      seitenUndWidgets.flatMap(([pfad, inhalt]) => alarmAbsaetze(inhalt).map((text) => `${pfad}: ${text}`)),
    )

    expect(Object.keys(AUSNAHMEN_ALARM).filter((s) => !vorhanden.has(s))).toEqual([])
  })
})

describe('Zeitformat nur aus shared/lib/format (AK-37, R7)', () => {
  it('erzeugt außer in shared/lib/format.ts keine eigenen Intl.DateTimeFormat-Instanzen', () => {
    const treffer = produktiv
      .filter(([pfad]) => pfad !== '/src/shared/lib/format.ts')
      .filter(([, inhalt]) => /\bIntl\s*\.\s*DateTimeFormat\b/.test(inhalt))
      .map(([pfad]) => pfad)

    expect(treffer).toEqual([])
  })

  it('formatiert Zeitpunkte nicht über toLocale…String', () => {
    const treffer = produktiv
      .filter(([, inhalt]) => /\.toLocale(Date|Time)?String\s*\(/.test(inhalt))
      .map(([pfad]) => pfad)

    expect(treffer).toEqual([])
  })

  it('nutzt in entities/coin/ui/format.ts die gemeinsamen Funktionen aus @/shared/lib/format', () => {
    expect(alle['/src/entities/coin/ui/format.ts'] ?? '').toMatch(/from '@\/shared\/lib\/format'/)
  })
})

describe('Ansprache (AK-36, R6)', () => {
  /** Zeichenketten-Literale und JSX-Text eines Quelltexts (vereinfacht, ohne Kommentare). */
  function texte(inhalt: string): string[] {
    const ohneKommentare = inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const literale = [...ohneKommentare.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map((t) => t[1] ?? t[2] ?? t[3])
    const jsxText = [...ohneKommentare.matchAll(/>([^<>{}]+)</g)].map((t) => t[1])
    return [...literale, ...jsxText].map((t) => t.trim()).filter(Boolean)
  }

  const DU_FORM = /\b(du|dein|deine|deinen|deinem|deiner|dich|dir)\b/i

  it('findet Texte in Quelltexten (Selbsttest)', () => {
    expect(texte("const a = 'Bitte prüfen Sie die Eingabe.'\n<p>Hallo Welt</p>")).toEqual([
      'Bitte prüfen Sie die Eingabe.',
      'Hallo Welt',
    ])
    expect(DU_FORM.test('Prüfe deine Eingabe')).toBe(true)
    expect(DU_FORM.test('Bitte prüfen Sie Ihre Eingabe.')).toBe(false)
  })

  it('enthält in Texten von pages, widgets, features, entities und shared/ui keine Du-Form', () => {
    const treffer = produktiv
      .filter(([pfad]) => /^\/src\/(pages|widgets|features|entities|shared\/ui)\//.test(pfad))
      .flatMap(([pfad, inhalt]) =>
        texte(inhalt)
          .filter((text) => /\s/.test(text) || /^[A-ZÄÖÜ]/.test(text))
          .filter((text) => DU_FORM.test(text))
          .map((text) => `${pfad}: ${text}`),
      )

    expect(treffer).toEqual([])
  })
})
