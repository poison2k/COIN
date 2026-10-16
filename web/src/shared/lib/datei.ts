/** Wartezeit bis zum Freigeben der Object-URL (wie FileSaver.js), damit der Browser den Download sicher beginnt. */
const FREIGABE_NACH_MS = 40_000

/**
 * Speichert einen Blob als Datei im Browser (zertifikatsvorlagen, AK-30): Object-URL, Klick auf ein `<a download>`,
 * danach Element entfernen. Die URL wird erst nach 40 s freigegeben (Rev. 3); sofortiges Freigeben kann den Download
 * in manchen Browsern abbrechen.
 */
export function speichereDatei(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = dateiname
  link.hidden = true
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), FREIGABE_NACH_MS)
  }
}
