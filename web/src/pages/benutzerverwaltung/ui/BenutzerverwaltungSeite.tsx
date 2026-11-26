import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useState } from 'react'
import type { AuditAbfrage } from '@/features/audit-filtern'
import { AuditLog } from '@/widgets/audit-log'
import { BenutzerTabelle } from '@/widgets/benutzer-tabelle'

/** Reiter der Benutzerverwaltung; in der URL steht nur `aenderungsprotokoll` (nacharbeiten-audit-filter 4.4). */
export type BenutzerverwaltungReiter = 'benutzer' | 'aenderungsprotokoll'

export interface BenutzerverwaltungSeiteProps {
  /** Id des angemeldeten Benutzers (aus /api/me), für die gesperrte eigene Zeile (AK-29). */
  aktuellerBenutzerId: string
  /** Aktiver Reiter aus der URL; ohne Angabe hält die Seite ihn selbst. */
  reiter?: BenutzerverwaltungReiter
  onReiter?: (reiter: BenutzerverwaltungReiter) => void
  /** Abfrage des Änderungsprotokolls aus der URL; ohne Angabe hält das Widget sie selbst. */
  auditAbfrage?: AuditAbfrage
  onAuditAbfrage?: (abfrage: AuditAbfrage) => void
}

/**
 * Seite „Benutzerverwaltung“ (/benutzerverwaltung, AK-26, AK-31): Seitenkopf mit Beschreibung, Tabs „Benutzer“ und
 * „Änderungsprotokoll“, je Panel eine Karte mit h2 (startseite-listen-pruefung 4.4). Inaktive Tabs werden nicht
 * gerendert, das Audit-Log lädt deshalb bei jedem Aktivieren neu. Reiter und Filter kommen optional als Props aus der
 * Route (URL, nacharbeiten-audit-filter 4.4); die Seite bleibt frei von Router-Hooks. Rendert kein eigenes <main>.
 */
export function BenutzerverwaltungSeite({
  aktuellerBenutzerId,
  reiter: vorgegeben,
  onReiter,
  auditAbfrage,
  onAuditAbfrage,
}: BenutzerverwaltungSeiteProps) {
  const [eigener, setEigener] = useState<BenutzerverwaltungReiter>('benutzer')
  const reiter = vorgegeben ?? eigener

  function wechseln(neu: unknown) {
    const wert: BenutzerverwaltungReiter = neu === 'aenderungsprotokoll' ? 'aenderungsprotokoll' : 'benutzer'
    if (onReiter) onReiter(wert)
    else setEigener(wert)
  }

  return (
    <div className="grid min-w-0 gap-6">
      <Seitenkopf
        titel="Benutzerverwaltung"
        beschreibung="Rollen vergeben, Benutzer deaktivieren und Änderungen nachvollziehen."
      />
      <Tabs value={reiter} onValueChange={wechseln} className="min-w-0">
        <TabsList>
          <TabsTrigger value="benutzer">Benutzer</TabsTrigger>
          <TabsTrigger value="aenderungsprotokoll">Änderungsprotokoll</TabsTrigger>
        </TabsList>
        <TabsContent value="benutzer" className="min-w-0 pt-4">
          <Card>
            <CardHeader>
              <CardTitle ebene={2}>Benutzer</CardTitle>
              <CardDescription>
                Rollen und Status aller Benutzer, die sich schon einmal angemeldet haben.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BenutzerTabelle aktuellerBenutzerId={aktuellerBenutzerId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="aenderungsprotokoll" className="min-w-0 pt-4">
          <Card>
            <CardHeader>
              <CardTitle ebene={2}>Änderungsprotokoll</CardTitle>
              <CardDescription>
                Rollen- und Statusänderungen, neueste zuerst. Einträge lassen sich nicht ändern oder löschen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLog abfrage={auditAbfrage} onAbfrage={onAuditAbfrage} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
