import { useEffect, useState } from 'react'

/**
 * Object-URL für eine ausgewählte Datei (Vorschau, AK-29). Die URL wird beim Wechsel der Datei und beim Unmount
 * freigegeben. Ohne Datei `null`.
 */
export function useDateiUrl(datei: File | null): string | null {
  const [eintrag, setEintrag] = useState<{ datei: File; url: string } | null>(null)

  useEffect(() => {
    if (!datei) return undefined
    const url = URL.createObjectURL(datei)
    // Erzeugen und Freigeben der Object-URL (externe Ressource) gehören in denselben Effekt; nur so gibt der StrictMode
    // mit seinem doppelten Effektlauf keine URL frei, die danach noch angezeigt wird.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Abgleich mit einer externen Ressource, nicht abgeleiteter Zustand.
    setEintrag({ datei, url })
    return () => URL.revokeObjectURL(url)
  }, [datei])

  return eintrag && eintrag.datei === datei ? eintrag.url : null
}
