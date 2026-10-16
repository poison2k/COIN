import { vi } from 'vitest'

// Testhilfe (zertifikatsvorlagen, AK-30): Datei-Downloads im Browser beobachten. Das Frontend speichert eine Datei
// über eine Object-URL und einen Klick auf ein <a download>; jsdom lädt nichts herunter. Aufgezeichnet werden
// Dateiname, Ziel-URL und der Blob hinter der Object-URL.

export interface Download {
  dateiname: string
  href: string
  blob: Blob | undefined
}

export function beobachteDownloads() {
  const blobs = new Map<string, Blob>()
  const downloads: Download[] = []
  let zaehler = 0
  const erzeugen = vi.fn((objekt: Blob | MediaSource) => {
    const url = `blob:download-${++zaehler}`
    if (objekt instanceof Blob) blobs.set(url, objekt)
    return url
  })
  const widerrufen = vi.fn()
  URL.createObjectURL = erzeugen
  URL.revokeObjectURL = widerrufen
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const href = this.getAttribute('href') ?? ''
    downloads.push({ dateiname: this.download, href, blob: blobs.get(href) })
  })
  return { downloads, erzeugen, widerrufen }
}
