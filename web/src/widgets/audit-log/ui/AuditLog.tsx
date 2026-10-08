import { useEffect, useState } from 'react'
import { AuditTabelle, ladeAuditLog, type AuditEintrag } from '@/entities/audit'
import type { ApiErgebnis, Seite } from '@/shared/api'
import { useFokusBeiLadefehler } from '@/shared/lib/hooks'
import { Blaettern, seitenAnzahl } from '@/shared/ui/blaettern'

const GROESSE = 25

interface Geladen {
  seite: number
  ergebnis: ApiErgebnis<Seite<AuditEintrag>>
}

/** Tab „Audit-Log“ (AK-31): lädt beim Einblenden die erste Seite, blättert und zeigt die Zustände. */
export function AuditLog() {
  const [seite, setSeite] = useState(1)
  const [geladen, setGeladen] = useState<Geladen | null>(null)

  useEffect(() => {
    let aktiv = true
    void ladeAuditLog({ seite, groesse: GROESSE }).then((ergebnis) => {
      if (aktiv) setGeladen({ seite, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [seite])

  const ergebnis = geladen?.seite === seite ? geladen.ergebnis : null
  // Beim Nachladen bleibt die vorige Seite stehen, bis die Antwort da ist (Tabelle und Blättern nicht aushängen).
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  const laedt = ergebnis === null
  const fehlgeschlagen = ergebnis !== null && ergebnis.art !== 'ok'
  // Ein Ladefehler hängt das Blättern aus; lag der Fokus darin, wandert er auf den Alarm statt auf body (WCAG 2.4.3).
  const { bereichRef: blaetternRef, alarmRef, merkeFokus } = useFokusBeiLadefehler(!laedt, fehlgeschlagen)

  function blaettern(neu: number) {
    merkeFokus()
    setSeite(neu)
  }

  return (
    <div className="grid min-w-0 gap-4">
      {laedt && (
        <p role="status" className="text-sm text-muted-foreground">
          Audit-Log wird geladen …
        </p>
      )}
      {fehlgeschlagen && (
        <p
          ref={alarmRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Audit-Log konnte nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}
      {anzeige?.art === 'ok' && anzeige.daten.eintraege.length === 0 && <p>Noch keine Einträge.</p>}
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
