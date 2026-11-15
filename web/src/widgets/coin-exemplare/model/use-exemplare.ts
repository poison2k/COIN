import { useEffect, useRef, useState } from 'react'
import { ladeExemplare, type ExemplarSeite, type ExemplarStatus } from '@/entities/exemplar'
import type { ApiErgebnis } from '@/shared/api'

/** Ladezustand der Exemplare einer Seite (coin-ausgaben AK-20; formulare-detailseiten ADR-0042 Punkt 4). */
export interface ExemplareDaten {
  /** Antwort zu den aktuellen Parametern; `null`, solange sie lädt. */
  ergebnis: ApiErgebnis<ExemplarSeite> | null
  /** Anzuzeigende Antwort: die aktuelle oder beim Nachladen die letzte erfolgreiche. */
  anzeige: ApiErgebnis<ExemplarSeite> | null
}

export interface ExemplareAnfrageOptionen {
  coinId: string
  status?: ExemplarStatus
  seite: number
  /** Jede Änderung lädt neu (z. B. nach einem Storno oder „Auflage ändern“). */
  neuLaden: number | string
  /** Ohne `aktiv` wird nichts geladen (z. B. ohne coins.read oder wenn die Seite die Daten liefert). */
  aktiv?: boolean
}

interface Geladen {
  schluessel: string
  ergebnis: ApiErgebnis<ExemplarSeite>
}

/**
 * Lädt `GET …/exemplare` genau einmal je Filter, Seite und Neuladen-Zähler. Eine Antwort gilt nur, solange sie zu den
 * Parametern passt; laufende Anfragen werden (z. B. im StrictMode) wiederverwendet.
 */
export function useExemplare({
  coinId,
  status,
  seite,
  neuLaden,
  aktiv = true,
}: ExemplareAnfrageOptionen): ExemplareDaten {
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  const anfrage = useRef<{ schluessel: string; ergebnis: Promise<ApiErgebnis<ExemplarSeite>> } | null>(null)
  const schluessel = JSON.stringify([coinId, status ?? null, seite, neuLaden])

  useEffect(() => {
    if (!aktiv) return undefined
    if (anfrage.current?.schluessel !== schluessel) {
      anfrage.current = { schluessel, ergebnis: ladeExemplare(coinId, { status, seite }) }
    }
    let laeuft = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (laeuft) setGeladen({ schluessel, ergebnis })
    })
    return () => {
      laeuft = false
    }
  }, [aktiv, schluessel, coinId, status, seite])

  const ergebnis = geladen?.schluessel === schluessel ? geladen.ergebnis : null
  // Beim Nachladen bleibt die vorige Anzeige stehen, bis die Antwort da ist (Tabelle und Blättern nicht aushängen).
  const anzeige = ergebnis ?? (geladen?.ergebnis.art === 'ok' ? geladen.ergebnis : null)
  return { ergebnis, anzeige }
}
