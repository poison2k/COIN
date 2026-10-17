import { formatiereTag } from '@/shared/lib/format'
import type { Ausgabe } from './types'

/** Status als Text: „aktiv“ oder „storniert am {Datum} von {Name}: {Grund}“ (coin-ausgaben AK-22, zertifikat-erzeugen AK-28). */
export function ausgabeStatusText(ausgabe: Ausgabe): string {
  const storno = ausgabe.storno
  return storno ? `storniert am ${formatiereTag(storno.am)} von ${storno.von.name}: ${storno.grund}` : 'aktiv'
}
