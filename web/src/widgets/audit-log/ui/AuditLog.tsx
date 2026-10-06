import { useEffect, useState } from 'react'
import { AuditTabelle, ladeAuditLog, type AuditEintrag } from '@/entities/audit'
import type { ApiErgebnis, Seite } from '@/shared/api'
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

  return (
    <div className="grid min-w-0 gap-4">
      {ergebnis === null && (
        <p role="status" className="text-sm text-muted-foreground">
          Audit-Log wird geladen …
        </p>
      )}
      {ergebnis !== null && ergebnis.art !== 'ok' && (
        <p role="alert" className="text-destructive">
          Audit-Log konnte nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}
      {ergebnis?.art === 'ok' && ergebnis.daten.eintraege.length === 0 && <p>Noch keine Einträge.</p>}
      {ergebnis?.art === 'ok' && ergebnis.daten.eintraege.length > 0 && (
        <>
          <AuditTabelle eintraege={ergebnis.daten.eintraege} />
          <Blaettern
            seite={ergebnis.daten.seite}
            seiten={seitenAnzahl(ergebnis.daten.gesamt, ergebnis.daten.groesse)}
            onSeite={setSeite}
          />
        </>
      )}
    </div>
  )
}
