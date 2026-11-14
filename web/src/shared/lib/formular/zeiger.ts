// Prüfung beim Verlassen nach einem Zeigerklick (formulare-detailseiten, ADR-0039 Punkt 2): Wird ein Feld verlassen,
// weil der Zeiger auf einem Bedienelement (z. B. „Speichern“, „Abbrechen“) gedrückt wurde, würde eine sofort angezeigte
// Fehlermeldung das Layout verschieben – der Button wandert unter dem Zeiger weg und der Klick geht verloren. Dann läuft
// die Prüfung erst nach dem Klick. Per Tastatur (Tab) wird wie bisher sofort geprüft.

const BEDIENELEMENT = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="combobox"], summary'
const SPAETESTENS_MS = 1000

let zeigerAufBedienelement = false

if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (ereignis) => {
      zeigerAufBedienelement = ereignis.target instanceof Element && ereignis.target.closest(BEDIENELEMENT) !== null
    },
    true,
  )
  const zuruecksetzen = () => {
    // Erst nach dem Klick zurücksetzen, damit ein Verlassen während des Klicks den Zustand noch sieht.
    setTimeout(() => {
      zeigerAufBedienelement = false
    }, 0)
  }
  document.addEventListener('click', zuruecksetzen, true)
  document.addEventListener('pointercancel', zuruecksetzen, true)
}

/** Führt `pruefen` sofort aus oder – während eines Zeigerklicks auf ein Bedienelement – erst nach dem Klick. */
export function pruefeNachZeigerklick(pruefen: () => void): void {
  if (typeof document === 'undefined' || !zeigerAufBedienelement) {
    pruefen()
    return
  }
  let erledigt = false
  const ausfuehren = () => {
    if (erledigt) return
    erledigt = true
    document.removeEventListener('click', nachKlick, true)
    clearTimeout(zeitgeber)
    pruefen()
  }
  const nachKlick = () => setTimeout(ausfuehren, 0)
  const zeitgeber = setTimeout(ausfuehren, SPAETESTENS_MS)
  document.addEventListener('click', nachKlick, true)
}
