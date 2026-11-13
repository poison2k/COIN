import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { AuditLog } from '@/widgets/audit-log'
import { BenutzerTabelle } from '@/widgets/benutzer-tabelle'

export interface BenutzerverwaltungSeiteProps {
  /** Id des angemeldeten Benutzers (aus /api/me), für die gesperrte eigene Zeile (AK-29). */
  aktuellerBenutzerId: string
}

/**
 * Seite „Benutzerverwaltung“ (/benutzerverwaltung, AK-26, AK-31): Tabs „Benutzer“ und „Audit-Log“. Inaktive Tabs
 * werden nicht gerendert, das Audit-Log lädt deshalb bei jedem Aktivieren neu. Rendert kein eigenes <main>.
 */
export function BenutzerverwaltungSeite({ aktuellerBenutzerId }: BenutzerverwaltungSeiteProps) {
  return (
    <div className="grid min-w-0 gap-6">
      <Seitenkopf titel="Benutzerverwaltung" />
      <Tabs defaultValue="benutzer" className="min-w-0">
        <TabsList>
          <TabsTrigger value="benutzer">Benutzer</TabsTrigger>
          <TabsTrigger value="audit">Audit-Log</TabsTrigger>
        </TabsList>
        <TabsContent value="benutzer" className="min-w-0 pt-4">
          <Card>
            <CardContent>
              <BenutzerTabelle aktuellerBenutzerId={aktuellerBenutzerId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="audit" className="min-w-0 pt-4">
          <Card>
            <CardContent>
              <AuditLog />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
