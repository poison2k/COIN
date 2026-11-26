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
// nacharbeiten-audit-filter E7 (ADR-0047): Aktionsmeldungen laufen über `Aktionsmeldung`, es bleibt keine Ausnahme.
const AUSNAHMEN_ALARM: Record<string, string> = {}

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

// ---------- Feature nacharbeiten-audit-filter (Abschnitt 4.7, 4.8, 4.10, AK-13, AK-23 bis AK-25, AK-27, AK-29) ----------

/** Quelltext ohne Kommentare (Block-, JSX- und Zeilenkommentare; URLs wie http:// bleiben). */
function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1')
}

const produktivOhneKommentare = produktiv.map(([pfad, inhalt]) => [pfad, ohneKommentare(inhalt)] as const)

describe('Begriff „Änderungsprotokoll“ (AK-23, AK-24)', () => {
  it('entfernt Kommentare, aber keine Zeichenketten (Selbsttest)', () => {
    expect(ohneKommentare("const a = 'x' // Audit-Log\n/* Audit-Log */ {/* Audit-Log */}")).not.toMatch(/Audit-Log/)
    expect(ohneKommentare("const url = 'http://x/Audit-Log'")).toMatch(/Audit-Log/)
  })

  it('enthält „Audit-Log“ in keiner Zeichenkette und keinem JSX-Text in web/src (außer Tests)', () => {
    const treffer = produktivOhneKommentare.filter(([, inhalt]) => inhalt.includes('Audit-Log')).map(([pfad]) => pfad)

    expect(treffer).toEqual([])
  })

  it('enthält den alten Text für den Systemakteur nirgends mehr in web/src', () => {
    const alt = 'System (Boot' + 'strap)'
    const treffer = Object.entries(alle)
      .filter(([pfad, inhalt]) => pfad !== '/src/app/konsistenz.test.ts' && inhalt.includes(alt))
      .map(([pfad]) => pfad)

    expect(treffer).toEqual([])
  })

  it('zeigt den Systemakteur als „System (Ersteinrichtung)“', () => {
    expect(alle['/src/entities/audit/model/types.ts']).toContain("'System (Ersteinrichtung)'")
  })
})

describe('Hilfetexte mit „z. B.“ bleiben unverändert (AK-25, F4)', () => {
  it('behält „z. B. Truppenbesuch, Verabschiedung“', () => {
    expect(alle['/src/features/ausgabe-erfassen/ui/AusgabeFormular.tsx']).toContain(
      "'z. B. Truppenbesuch, Verabschiedung'",
    )
  })

  it('behält den Hilfetext der Vorlage mit „z. B. {{Zertifikat.Nummer}}.“', () => {
    expect(alle['/src/features/vorlage-hochladen/ui/VorlageHochladen.tsx']).toContain(
      'Platzhalter haben die Form {{Gruppe.Feld}}, z. B. {{Zertifikat.Nummer}}. Die Liste aller Platzhalter steht in der Standardvorlage.',
    )
  })
})

const AUDIT_FILTER_DATEIEN = /^\/src\/(features\/audit-filtern|widgets\/audit-log)\//

describe('Aktionsliste nicht fest kodiert (AK-13)', () => {
  it('findet die Dateien des Filters (Selbsttest)', () => {
    expect(produktiv.filter(([pfad]) => AUDIT_FILTER_DATEIEN.test(pfad)).length).toBeGreaterThanOrEqual(4)
  })

  it("enthält in features/audit-filtern und widgets/audit-log keine Literale 'Rolle' oder 'Status'", () => {
    const treffer = produktivOhneKommentare
      .filter(([pfad]) => AUDIT_FILTER_DATEIEN.test(pfad))
      .filter(([, inhalt]) => /(['"`])(Rolle|Status)\1/.test(inhalt))
      .map(([pfad]) => pfad)

    expect(treffer).toEqual([])
  })
})

/** Anzahl der Rollen-Attribute alert bzw. status im Code, z. B. role="alert" oder role={'status'}. */
function rollen(inhalt: string, rolle: 'alert' | 'status'): number {
  const muster = new RegExp(`\\brole=(?:"${rolle}"|'${rolle}'|\\{\\s*['"\`]${rolle}['"\`]\\s*\\})`, 'g')
  return [...inhalt.matchAll(muster)].length
}

const schichtenDateien = produktivOhneKommentare.filter(
  ([pfad]) => /^\/src\/(features|widgets|pages)\//.test(pfad) && pfad.endsWith('.tsx'),
)

/** Bausteinseite (nur Entwicklung): zeigt Bausteine mit ihren Rollen und ist ausgenommen (Abschnitt 4.8). */
const BAUSTEINSEITE = /^\/src\/pages\/entwicklung-bausteine\//

/** Stellen mit role="alert", die nach 4.8 bleiben (keine Meldung nach einer Aktion bzw. schon `Alert`). */
const ALARM_BLEIBT: Readonly<Record<string, number>> = {
  // PruefFormular nutzt schon `Alert` (4.8 „Nicht umgestellt“).
  '/src/features/zertifikat-pruefen/ui/PruefFormular.tsx': 1,
  // Kopfzeile: kein Formular, bleibt (4.8, Abschnitt 13).
  '/src/widgets/app-shell/ui/Kopfzeile.tsx': 1,
}

/** Positivliste der reinen Statuszeilen aus 4.8 (Laden, Treffer, Ansage beim Verschieben) samt Prüfergebnis. */
const STATUS_ZEILEN: Readonly<Record<string, number>> = {
  '/src/widgets/audit-log/ui/AuditLog.tsx': 1,
  '/src/widgets/coin-katalog/ui/CoinKatalog.tsx': 1,
  '/src/widgets/benutzer-tabelle/ui/BenutzerTabelle.tsx': 1,
  '/src/widgets/coin-exemplare/ui/CoinExemplare.tsx': 1,
  // Ladezeile und Ansage beim Verschieben.
  '/src/features/startseite-konfigurieren/ui/StartseiteFormular.tsx': 2,
  // Der Ladetext bleibt eine eigene Statuszeile (4.8).
  '/src/widgets/ausgaben-historie/ui/AusgabenHistorie.tsx': 1,
  // Live-Region der Prüfung (PruefFormular nutzt schon `Alert`).
  '/src/features/zertifikat-pruefen/ui/PruefFormular.tsx': 1,
}

/** Dateien aus 4.8, die ihre Meldungen nach Aktionen über `Aktionsmeldung` zeigen. */
const MIT_AKTIONSMELDUNG = [
  '/src/features/motivbild-hochladen/ui/MotivbildHochladen.tsx',
  '/src/features/vorlage-hochladen/ui/VorlageHochladen.tsx',
  '/src/features/coin-anlegen/ui/CoinFormular.tsx',
  '/src/features/coin-bearbeiten/ui/CoinBearbeitenFormular.tsx',
  '/src/features/auflage-aendern/ui/AuflageAendern.tsx',
  '/src/features/hologrammnummer-aendern/ui/HologrammnummerAendern.tsx',
  '/src/features/standardvorlage-herunterladen/ui/StandardvorlageHerunterladen.tsx',
  '/src/features/zertifikat-herunterladen/ui/ZertifikatHerunterladen.tsx',
  '/src/features/startseite-konfigurieren/ui/StartseiteFormular.tsx',
  '/src/widgets/benutzer-tabelle/ui/BenutzerTabelle.tsx',
  '/src/widgets/zertifikatsvorlage/ui/ZertifikatsvorlageVerwalten.tsx',
  '/src/widgets/ausgaben-historie/ui/AusgabenHistorie.tsx',
  '/src/pages/coin-detail/ui/CoinDetailSeite.tsx',
  '/src/pages/ausgabe-detail/ui/AusgabeDetailSeite.tsx',
  '/src/pages/kein-zugriff/ui/KeinZugriffSeite.tsx',
  '/src/shared/ui/bestaetigungsdialog.tsx',
]

describe('Aktionsmeldungen über den Baustein (AK-27, ADR-0047)', () => {
  it('erkennt Rollen-Attribute in allen Schreibweisen (Selbsttest)', () => {
    expect(rollen(`<p role="alert"/><div role='alert'/><X role={'alert'} />`, 'alert')).toBe(3)
    expect(rollen(ohneKommentare(`{/* role="status" */}`), 'status')).toBe(0)
  })

  it('hat in features, widgets und pages kein role="alert" außer den begründeten Stellen', () => {
    const treffer = schichtenDateien
      .filter(([pfad]) => !BAUSTEINSEITE.test(pfad))
      .map(([pfad, inhalt]) => [pfad, rollen(inhalt, 'alert')] as const)
      .filter(([pfad, anzahl]) => anzahl > (ALARM_BLEIBT[pfad] ?? 0))
      .map(([pfad, anzahl]) => `${pfad}: ${anzahl}`)

    expect(treffer).toEqual([])
  })

  it('hat role="status" in features, widgets und pages nur an den Statuszeilen der Positivliste', () => {
    const treffer = schichtenDateien
      .filter(([pfad]) => !BAUSTEINSEITE.test(pfad))
      .map(([pfad, inhalt]) => [pfad, rollen(inhalt, 'status')] as const)
      .filter(([pfad, anzahl]) => anzahl > (STATUS_ZEILEN[pfad] ?? 0))
      .map(([pfad, anzahl]) => `${pfad}: ${anzahl}`)

    expect(treffer).toEqual([])
  })

  it.each(MIT_AKTIONSMELDUNG)('zeigt in %s Meldungen über <Aktionsmeldung>', (pfad) => {
    expect(ohneKommentare(alle[pfad] ?? '')).toMatch(/<Aktionsmeldung\b/)
  })

  it('stellt den Baustein in shared/ui/aktionsmeldung.tsx bereit', () => {
    expect(alle['/src/shared/ui/aktionsmeldung.tsx']).toBeDefined()
  })
})

const KATALOG_DATEIEN = /^\/src\/(entities\/coin|widgets\/coin-katalog)\//

describe('Katalogtabelle über DatenTabelle (AK-29, ADR-0046)', () => {
  const katalog = produktivOhneKommentare.filter(([pfad]) => KATALOG_DATEIEN.test(pfad))

  it('findet die Dateien des Katalogs (Selbsttest)', () => {
    expect(katalog.map(([pfad]) => pfad)).toContain('/src/entities/coin/ui/CoinListe.tsx')
  })

  it('importiert in entities/coin und widgets/coin-katalog nichts aus @/shared/ui/table', () => {
    const treffer = katalog.filter(([, inhalt]) => /from\s+['"]@\/shared\/ui\/table['"]/.test(inhalt))

    expect(treffer.map(([pfad]) => pfad)).toEqual([])
  })

  it('enthält in entities/coin und widgets/coin-katalog kein <table> und kein TableRow', () => {
    const treffer = katalog.filter(([, inhalt]) => /<table\b|\bTableRow\b/.test(inhalt))

    expect(treffer.map(([pfad]) => pfad)).toEqual([])
  })

  it('rendert in CoinListe die DatenTabelle', () => {
    expect(alle['/src/entities/coin/ui/CoinListe.tsx']).toMatch(/<DatenTabelle\b/)
  })
})
