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
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 p-6">
      <h1 className="text-2xl font-semibold">Benutzerverwaltung</h1>
      <Tabs defaultValue="benutzer" className="min-w-0">
        <TabsList>
          <TabsTrigger value="benutzer">Benutzer</TabsTrigger>
          <TabsTrigger value="audit">Audit-Log</TabsTrigger>
        </TabsList>
        <TabsContent value="benutzer" className="min-w-0 pt-2">
          <BenutzerTabelle aktuellerBenutzerId={aktuellerBenutzerId} />
        </TabsContent>
        <TabsContent value="audit" className="min-w-0 pt-2">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </div>
  )
}
