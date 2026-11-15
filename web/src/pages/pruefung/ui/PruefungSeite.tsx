import { PruefFormular } from '@/features/zertifikat-pruefen'
import { Seitenkopf } from '@/shared/ui/seitenkopf'

export interface PruefungSeiteProps {
  /** issues.read aus /api/me: Prüfung mit Empfängerdaten (hologrammnummer AK-31). */
  darfEmpfaenger: boolean
}

/**
 * Seite „Zertifikat prüfen“ (/pruefung, hologrammnummer AK-28 bis AK-33): genau ein h1 und das Prüfformular in einer
 * zentrierten Spalte `max-w-reading` (startseite-listen-pruefung 4.3, AK-19). Ohne Router-Hooks, kein eigenes <main>;
 * die Nummer steht nie in der URL.
 */
export function PruefungSeite({ darfEmpfaenger }: PruefungSeiteProps) {
  return (
    <div className="mx-auto grid w-full max-w-reading min-w-0 gap-6">
      <Seitenkopf
        titel="Zertifikat prüfen"
        beschreibung="Prüfen Sie, ob eine Hologrammnummer zu einem echten, gültigen Zertifikat gehört."
      />
      <PruefFormular darfEmpfaenger={darfEmpfaenger} />
    </div>
  )
}
