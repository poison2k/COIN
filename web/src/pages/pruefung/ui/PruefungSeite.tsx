import { PruefFormular } from '@/features/zertifikat-pruefen'

export interface PruefungSeiteProps {
  /** issues.read aus /api/me: Prüfung mit Empfängerdaten (hologrammnummer AK-31). */
  darfEmpfaenger: boolean
}

/**
 * Seite „Zertifikat prüfen“ (/pruefung, hologrammnummer AK-28 bis AK-33): genau ein h1 und das Prüfformular. Ohne
 * Router-Hooks, kein eigenes <main>; die Nummer steht nie in der URL.
 */
export function PruefungSeite({ darfEmpfaenger }: PruefungSeiteProps) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Zertifikat prüfen</h1>
        <p className="text-muted-foreground">
          Prüfen Sie, ob eine Hologrammnummer zu einem echten, gültigen Zertifikat gehört.
        </p>
      </div>
      <PruefFormular darfEmpfaenger={darfEmpfaenger} />
    </div>
  )
}
