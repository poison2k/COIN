import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { AuditLog } from '@/widgets/audit-log'
import { BenutzerTabelle } from '@/widgets/benutzer-tabelle'

export interface BenutzerverwaltungSeiteProps {
  /** Id des angemeldeten Benutzers (aus /api/me), für die gesperrte eigene Zeile (AK-29). */
  aktuellerBenutzerId: string
}

/**
 * Seite „Benutzerverwaltung“ (/benutzerverwaltung, AK-26, AK-31): Seitenkopf mit Beschreibung, Tabs „Benutzer“ und
 * „Audit-Log“, je Panel eine Karte mit h2 (startseite-listen-pruefung 4.4). Inaktive Tabs werden nicht gerendert, das
 * Audit-Log lädt deshalb bei jedem Aktivieren neu. Rendert kein eigenes <main>.
 */
export function BenutzerverwaltungSeite({ aktuellerBenutzerId }: BenutzerverwaltungSeiteProps) {
  return (
    <div className="grid min-w-0 gap-6">
      <Seitenkopf
        titel="Benutzerverwaltung"
        beschreibung="Rollen vergeben, Benutzer deaktivieren und Änderungen nachvollziehen."
      />
      <Tabs defaultValue="benutzer" className="min-w-0">
        <TabsList>
          <TabsTrigger value="benutzer">Benutzer</TabsTrigger>
          <TabsTrigger value="audit">Audit-Log</TabsTrigger>
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
        <TabsContent value="audit" className="min-w-0 pt-4">
          <Card>
            <CardHeader>
              <CardTitle ebene={2}>Änderungsprotokoll</CardTitle>
              <CardDescription>
                Rollen- und Statusänderungen, neueste zuerst. Einträge lassen sich nicht ändern oder löschen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLog />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
