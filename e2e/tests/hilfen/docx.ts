import { inflateRawSync } from 'node:zlib'

// Testhilfe zertifikat-erzeugen (Systemtest, Abschnitt 8): liest ZIP-Einträge einer heruntergeladenen DOCX-Datei
// ohne zusätzliche Abhängigkeit (zentrales Verzeichnis, Methode 0 = gespeichert, 8 = deflate über node:zlib).

const EOCD = 0x06054b50
const ZENTRAL = 0x02014b50
const LOKAL = 0x04034b50

/** Ist der Puffer ein ZIP (lokaler Kopf „PK\x03\x04“ am Anfang)? */
export function istZip(daten: Buffer): boolean {
  return daten.length >= 4 && daten.readUInt32LE(0) === LOKAL
}

/** Alle Einträge als Name → entpackter Inhalt. Wirft bei beschädigten oder nicht unterstützten Dateien. */
export function zipEintraege(daten: Buffer): Map<string, Buffer> {
  let ende = -1
  for (let i = daten.length - 22; i >= Math.max(0, daten.length - 22 - 0xffff); i--) {
    if (daten.readUInt32LE(i) === EOCD) {
      ende = i
      break
    }
  }
  if (ende < 0) throw new Error('Kein ZIP: Ende des zentralen Verzeichnisses fehlt.')

  const anzahl = daten.readUInt16LE(ende + 10)
  let position = daten.readUInt32LE(ende + 16)
  const eintraege = new Map<string, Buffer>()
  for (let n = 0; n < anzahl; n++) {
    if (daten.readUInt32LE(position) !== ZENTRAL) throw new Error('Beschädigtes zentrales Verzeichnis.')
    const methode = daten.readUInt16LE(position + 10)
    const gepackt = daten.readUInt32LE(position + 20)
    const namenLaenge = daten.readUInt16LE(position + 28)
    const extraLaenge = daten.readUInt16LE(position + 30)
    const kommentarLaenge = daten.readUInt16LE(position + 32)
    const lokal = daten.readUInt32LE(position + 42)
    const name = daten.subarray(position + 46, position + 46 + namenLaenge).toString('utf8')

    if (daten.readUInt32LE(lokal) !== LOKAL) throw new Error(`Beschädigter lokaler Kopf: ${name}`)
    const start = lokal + 30 + daten.readUInt16LE(lokal + 26) + daten.readUInt16LE(lokal + 28)
    const roh = daten.subarray(start, start + gepackt)
    if (methode === 0) eintraege.set(name, Buffer.from(roh))
    else if (methode === 8) eintraege.set(name, inflateRawSync(roh))
    else throw new Error(`Nicht unterstützte Kompression ${methode}: ${name}`)

    position += 46 + namenLaenge + extraLaenge + kommentarLaenge
  }
  return eintraege
}

/** Text aller `w:t` eines WordprocessingML-Teils, XML-Entitäten aufgelöst. */
export function wordTexte(xml: string): string {
  const texte = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1])
  return texte
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
