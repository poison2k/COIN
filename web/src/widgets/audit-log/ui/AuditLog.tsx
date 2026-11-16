import { useEffect, useState } from 'react'
import { AuditTabelle, ladeAuditLog, type AuditEintrag } from '@/entities/audit'
import { BenutzerFilter, type GefilterterBenutzer } from '@/features/audit-filtern'
import type { ApiErgebnis, Seite } from '@/shared/api'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'
import { Button } from '@/shared/ui/button'
import { Filterleiste, type FilterChip } from '@/shared/ui/filterleiste'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

const GROESSE = 25
const LADETEXT = 'Audit-Log wird geladen …'

/** Abfrage des Audit-Logs: nur Seite und geänderter Benutzer (F5 Variante A, kein Zeitraum- oder Aktionsfilter). */
interface Abfrage {
  seite: number
  benutzer: GefilterterBenutzer | null
  /** Zählt „Erneut versuchen“; bei gleicher Abfrage löst erst er einen neuen Request aus. */
  neuladen: number
}

interface Geladen {
  abfrage: Abfrage
  ergebnis: ApiErgebnis<Seite<AuditEintrag>>
}

/**
 * Tab „Audit-Log“ (rollen-benutzerverwaltung AK-31, startseite-listen-pruefung 4.4): Benutzerfilter (geänderter Benutzer)
 * mit Chip, Tabelle, Blättern und die Zustände Laden, Fehler mit „Erneut versuchen“ und leer mit bzw. ohne Filter. Der
 * Filter steht nur im Zustand des Widgets, nie in der URL (Namen sind Personendaten).
 */
export function AuditLog() {
  const [abfrage, setAbfrage] = useState<Abfrage>({ seite: 1, benutzer: null, neuladen: 0 })
  const [geladen, setGeladen] = useState<Geladen | null>(null)

  useEffect(() => {
    let aktiv = true
    void ladeAuditLog({ benutzerId: abfrage.benutzer?.id, seite: abfrage.seite, groesse: GROESSE }).then((ergebnis) => {
      if (aktiv) setGeladen({ abfrage, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [abfrage])

  const ergebnis = geladen?.abfrage === abfrage ? geladen.ergebnis : null
  // Beim Nachladen bleibt die vorige Seite stehen, bis die Antwort da ist (Tabelle und Blättern nicht aushängen).
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  const laedt = ergebnis === null
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok'
  const mitFilter = (anzeige === ergebnis ? abfrage.benutzer : (geladen?.abfrage.benutzer ?? null)) !== null
  // Ein Ladefehler hängt das Blättern aus; lag der Fokus darin, wandert er auf den Alarm statt auf body (WCAG 2.4.3).
  const { bereichRef: blaetternRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)

  function blaettern(neu: number) {
    merkeFokus()
    setAbfrage((alt) => ({ ...alt, seite: neu }))
  }

  function filtern(benutzer: GefilterterBenutzer | null) {
    setAbfrage((alt) => ({ seite: 1, benutzer, neuladen: alt.neuladen }))
  }

  const chips: FilterChip[] = abfrage.benutzer
    ? [{ id: 'benutzer', text: `Benutzer: ${abfrage.benutzer.name}`, onEntfernen: () => filtern(null) }]
    : []

  return (
    <div className="grid min-w-0 gap-4">
      <Filterleiste chips={chips}>
        <BenutzerFilter wert={abfrage.benutzer} onWert={filtern} className="w-full max-w-reading" />
      </Filterleiste>

      {laedt && anzeige === null && <Ladeanzeige text={LADETEXT} form="tabelle" />}
      {laedt && anzeige !== null && (
        <p role="status" className="text-sm text-muted-foreground">
          {LADETEXT}
        </p>
      )}
      {fehlgeschlagen && (
        <Fehlerzustand
          ref={alarmRef}
          fokussierbar
          meldung="Audit-Log konnte nicht geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={() => setAbfrage((alt) => ({ ...alt, neuladen: alt.neuladen + 1 }))}
        />
      )}
      {anzeige?.art === 'ok' &&
        anzeige.daten.eintraege.length === 0 &&
        (mitFilter ? (
          <Leerzustand
            titelEbene={3}
            titel="Keine Einträge für diesen Benutzer."
            aktion={
              <Button type="button" variant="outline" onClick={() => filtern(null)}>
                Filter entfernen
              </Button>
            }
          />
        ) : (
          <Leerzustand titelEbene={3} titel="Noch keine Einträge." />
        ))}
      {anzeige?.art === 'ok' && anzeige.daten.eintraege.length > 0 && (
        <>
          <AuditTabelle eintraege={anzeige.daten.eintraege} />
          <div ref={blaetternRef}>
            <Blaettern
              seite={anzeige.daten.seite}
              seiten={seitenAnzahl(anzeige.daten.gesamt, anzeige.daten.groesse)}
              onSeite={blaettern}
              laedt={laedt}
            />
          </div>
        </>
      )}
    </div>
  )
}
