const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Prüft, ob `text` eine GUID im Format „D“ ist (8-4-4-4-12 Hex-Ziffern, Groß-/Kleinschreibung egal). */
export function istGuid(text: string): boolean {
  return GUID.test(text)
}
