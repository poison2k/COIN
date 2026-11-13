// Prüfschritt nach `vite build` (design-fundament, ADR-0036 Punkt 8, AK-39): Die Bausteinübersicht gibt es nur in der
// Entwicklungsumgebung. Enthält eine Datei in dist/ den Text „Bausteinübersicht“, ist die Seite im Produktions-Bundle
// gelandet und der Build scheitert.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SUCHTEXT = 'Bausteinübersicht'
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

function dateien(ordner) {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = path.join(ordner, name)
    return statSync(pfad).isDirectory() ? dateien(pfad) : [pfad]
  })
}

let alle
try {
  alle = dateien(dist)
} catch {
  console.error(`pruefe-produktionsbuild: Ordner ${dist} fehlt. Zuerst „vite build“ ausführen.`)
  process.exit(1)
}

const treffer = alle.filter((datei) => readFileSync(datei, 'utf8').includes(SUCHTEXT))
if (treffer.length > 0) {
  console.error(`pruefe-produktionsbuild: „${SUCHTEXT}“ steht im Produktions-Build:`)
  for (const datei of treffer) console.error(`  ${path.relative(dist, datei)}`)
  process.exit(1)
}
console.log(`pruefe-produktionsbuild: ${alle.length} Dateien geprüft, keine Entwicklungsseite im Build.`)
