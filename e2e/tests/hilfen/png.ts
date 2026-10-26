import { crc32, deflateSync } from 'node:zlib'

// Testhilfe startseite (Systemtest, Abschnitt 9.5): erzeugt ein gültiges PNG im Test (keine Datei im Repository),
// das der Browser vollständig dekodieren kann. RGBA, 8 Bit, einfarbig, ohne Metadaten.

function chunk(typ: string, daten: Buffer): Buffer {
  const laenge = Buffer.alloc(4)
  laenge.writeUInt32BE(daten.length)
  const typUndDaten = Buffer.concat([Buffer.from(typ, 'ascii'), daten])
  const pruefsumme = Buffer.alloc(4)
  pruefsumme.writeUInt32BE(crc32(typUndDaten))
  return Buffer.concat([laenge, typUndDaten, pruefsumme])
}

/** PNG mit `breite` × `hoehe` Pixeln in der Farbe `rgba`. */
export function erzeugePng(
  breite: number,
  hoehe: number,
  rgba: [number, number, number, number] = [20, 60, 120, 255],
): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breite, 0)
  ihdr.writeUInt32BE(hoehe, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 6 // RGBA
  const zeile = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: breite }, () => rgba).flat())])
  const roh = Buffer.concat(Array.from({ length: hoehe }, () => zeile))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(roh)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
